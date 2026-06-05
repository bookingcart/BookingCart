// api/flight-deals.js – Fetch trending flight deals (Duffel API + Postgres Cache)

const fetch = require('node-fetch');
const { getCorsHeaders } = require('../lib/cors');
const { isDbConfigured, initDb, getCache, setCache } = require('../lib/db');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';

// Cities to IATA mapping for common lookups
const CITY_TO_IATA = {
    'kampala': 'EBB', 'entebbe': 'EBB', 'nairobi': 'NBO', 'dar es salaam': 'DAR',
    'dubai': 'DXB', 'london': 'LHR', 'paris': 'CDG', 'new york': 'JFK',
    'mombasa': 'MBA', 'kigali': 'KGL', 'johannesburg': 'JNB', 'cape town': 'CPT',
    'cairo': 'CAI', 'lagos': 'LOS', 'accra': 'ACC', 'addis ababa': 'ADD',
    'istanbul': 'IST', 'singapore': 'SIN', 'mumbai': 'BOM', 'toronto': 'YYZ'
};

const COUNTRY_TO_IATA = {
    'Uganda': 'EBB', 'Kenya': 'NBO', 'Tanzania': 'DAR', 'Rwanda': 'KGL',
    'Ethiopia': 'ADD', 'Nigeria': 'LOS', 'South Africa': 'JNB', 'Egypt': 'CAI'
};

// Hand-picked routes for common starting points
const ROUTES = {
    'EBB': [
        { to: 'DXB', city: 'Dubai', country: 'UAE', image: 'dubai' },
        { to: 'LHR', city: 'London', country: 'UK', image: 'london' },
        { to: 'NBO', city: 'Nairobi', country: 'Kenya', image: 'nairobi' },
        { to: 'IST', city: 'Istanbul', country: 'Turkey', image: 'istanbul' },
        { to: 'JNB', city: 'Johannesburg', country: 'South Africa', image: 'johannesburg' },
        { to: 'BOM', city: 'Mumbai', country: 'India', image: 'mumbai' }
    ],
    'NBO': [
        { to: 'DXB', city: 'Dubai', country: 'UAE', image: 'dubai' },
        { to: 'LHR', city: 'London', country: 'UK', image: 'london' },
        { to: 'EBB', city: 'Kampala', country: 'Uganda', image: 'paris' },
        { to: 'DAR', city: 'Dar es Salaam', country: 'Tanzania', image: 'cancun' },
        { to: 'IST', city: 'Istanbul', country: 'Turkey', image: 'istanbul' },
        { to: 'BKK', city: 'Bangkok', country: 'Thailand', image: 'bangkok' }
    ],
    'DEFAULT': [
        { to: 'DXB', city: 'Dubai', country: 'UAE', image: 'dubai' },
        { to: 'LHR', city: 'London', country: 'UK', image: 'london' },
        { to: 'CDG', city: 'Paris', country: 'France', image: 'paris' },
        { to: 'JFK', city: 'New York', country: 'USA', image: 'new-york' },
        { to: 'AMS', city: 'Amsterdam', country: 'Netherlands', image: 'amsterdam' },
        { to: 'SIN', city: 'Singapore', country: 'Singapore', image: 'singapore' }
    ]
};

function getNextDates(daysFromNow = 30) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().split('T')[0];
}

// Fetch single cheapest offer from Duffel
async function fetchDeal(origin, destination, date) {
    if (!DUFFEL_API_KEY) return null;

    try {
        const resp = await fetch('https://api.duffel.com/air/offer_requests', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DUFFEL_API_KEY}`,
                'Duffel-Version': 'v1',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: {
                    slices: [{ origin, destination, departure_date: date }],
                    passengers: [{ type: 'adult' }],
                    cabin_class: 'economy'
                }
            })
        });

        if (!resp.ok) return null;
        const json = await resp.json();
        const offers = json.data.offers || [];
        if (offers.length === 0) return null;

        // Find cheapest
        const best = offers.reduce((prev, curr) =>
            parseFloat(curr.total_amount) < parseFloat(prev.total_amount) ? curr : prev
        );

        const slice = best.slices[0];
        const seg = slice ? slice.segments[0] : null;

        return {
            price: Math.ceil(parseFloat(best.total_amount)),
            currency: best.total_currency,
            airline: best.owner.name,
            airlineCode: seg ? (seg.marketing_carrier && seg.marketing_carrier.iata_code) || '' : '',
            duration: slice ? slice.duration : '',
            stops: slice ? (slice.segments.length - 1) : 0,
            departTime: seg ? (seg.departing_at || '').slice(11, 16) : '',
            arriveTime: seg ? (seg.arriving_at || '').slice(11, 16) : '',
            date: date,
            offerId: best.id
        };
    } catch (e) {
        return null;
    }
}

module.exports = async (req, res) => {
    const ch = getCorsHeaders(req);
    Object.entries(ch).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!DUFFEL_API_KEY) {
        return res.status(503).json({
            ok: false,
            error: 'Flight deals are unavailable because Duffel is not configured.',
            deals: []
        });
    }

    // Get client IP
    const ip =
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.headers['x-real-ip'] ||
        req.socket?.remoteAddress ||
        '';

    // If override provided in query/body, use it
    const overrideIata = (req.query && req.query.origin) || (req.body && req.body.origin) || '';
    const clientCity = (req.body && req.body.city) || '';
    const clientCountry = (req.body && req.body.country) || '';

    // Check cache first
    const cacheKey = `deals_${overrideIata || ip}`;
    let dbReady = false;
    if (isDbConfigured()) {
        try {
            await initDb();
            dbReady = true;
            const cached = await getCache(cacheKey);
            if (cached) {
                return res.json({ ok: true, ...cached.payload, cached: true });
            }
        } catch (e) {
            // Cache should not block live results.
        }
    }

    // Step 1: Geolocate IP (server-side fallback if client didn't detect)
    let city = clientCity, country = clientCountry, iata = overrideIata || '';
    if (!iata && clientCity) {
        iata = CITY_TO_IATA[clientCity.toLowerCase()] || COUNTRY_TO_IATA[clientCountry] || '';
    }
    if (!iata) {
        try {
            const isLocal = ['::1', '127.0.0.1', 'localhost', ''].includes(ip) || ip.startsWith('192.168') || ip.startsWith('10.');
            if (!isLocal) {
                const geoResp = await fetch(`http://ip-api.com/json/${ip}?fields=city,country,query`, { timeout: 3000 });
                if (geoResp.ok) {
                    const geo = await geoResp.json();
                    city = geo.city || city;
                    country = geo.country || country;
                    iata = CITY_TO_IATA[city.toLowerCase()] || COUNTRY_TO_IATA[country] || '';
                }
            }
        } catch (e) { /* geo failed */ }
        if (!iata) iata = 'EBB'; // fallback
    }

    // Step 2: Get routes for this origin
    const routes = ROUTES[iata] || ROUTES.DEFAULT;

    // Step 3: Fetch deals from Duffel (parallel, with timeout)
    const departureDate = getNextDates(30);
    const dealPromises = routes.slice(0, 6).map((r, i) =>
        Promise.race([
            fetchDeal(iata, r.to, departureDate).then(d => d ? { ...d, ...r, from: iata } : null),
            new Promise(resolve => setTimeout(() => resolve(null), 6000))
        ])
    );
    const rawDeals = await Promise.all(dealPromises);

    const deals = rawDeals.filter(Boolean);

    if (deals.length === 0) {
        return res.status(502).json({
            ok: false,
            error: 'No live flight deals are available right now.',
            origin: iata,
            city: city || iata,
            country,
            deals: []
        });
    }

    // Curated Pexels images per destination
    const DEST_IMAGES = {
        'dubai': 'https://images.pexels.com/photos/325193/pexels-photo-325193.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'london': 'https://images.pexels.com/photos/460672/pexels-photo-460672.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'paris': 'https://images.pexels.com/photos/338515/pexels-photo-338515.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'new-york': 'https://images.pexels.com/photos/290386/pexels-photo-290386.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'nairobi': 'https://images.pexels.com/photos/3935702/pexels-photo-3935702.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'johannesburg': 'https://images.pexels.com/photos/259447/pexels-photo-259447.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'cairo': 'https://images.pexels.com/photos/3290075/pexels-photo-3290075.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'istanbul': 'https://images.pexels.com/photos/2064827/pexels-photo-2064827.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'singapore': 'https://images.pexels.com/photos/777059/pexels-photo-777059.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'bangkok': 'https://images.pexels.com/photos/1682748/pexels-photo-1682748.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'amsterdam': 'https://images.pexels.com/photos/2031706/pexels-photo-2031706.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'mumbai': 'https://images.pexels.com/photos/2104152/pexels-photo-2104152.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'miami': 'https://images.pexels.com/photos/421655/pexels-photo-421655.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'los-angeles': 'https://images.pexels.com/photos/2263683/pexels-photo-2263683.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'cancun': 'https://images.pexels.com/photos/1174732/pexels-photo-1174732.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
    };
    const FALLBACK_IMG = 'https://images.pexels.com/photos/358319/pexels-photo-358319.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop';

    const enriched = deals.map(d => ({
        ...d,
        imageUrl: DEST_IMAGES[(d.image || '').toLowerCase()] || DEST_IMAGES[(d.city || '').toLowerCase()] || FALLBACK_IMG,
        hot: d.price < 300,
        tripType: 'one-way'
    }));

    // IATA → city name mapping for display
    const IATA_TO_CITY = {
        'EBB': 'Kampala', 'NBO': 'Nairobi', 'DAR': 'Dar es Salaam',
        'JNB': 'Johannesburg', 'CPT': 'Cape Town', 'LOS': 'Lagos',
        'ACC': 'Accra', 'CAI': 'Cairo', 'ADD': 'Addis Ababa',
        'LHR': 'London', 'CDG': 'Paris', 'FRA': 'Frankfurt',
        'AMS': 'Amsterdam', 'FCO': 'Rome', 'MAD': 'Madrid',
        'JFK': 'New York', 'LAX': 'Los Angeles', 'ORD': 'Chicago',
        'YYZ': 'Toronto', 'DXB': 'Dubai', 'AUH': 'Abu Dhabi',
        'DEL': 'New Delhi', 'BOM': 'Mumbai', 'SIN': 'Singapore',
        'SYD': 'Sydney', 'NRT': 'Tokyo', 'PEK': 'Beijing',
        'IST': 'Istanbul', 'GRU': 'São Paulo', 'BKK': 'Bangkok',
    };

    const result = {
        origin: iata,
        city: city || IATA_TO_CITY[iata] || iata,
        country,
        deals: enriched
    };

    if (dbReady) {
        try {
            await setCache(cacheKey, result, CACHE_TTL_MS, {
                origin: iata,
                source: 'flight-deals'
            });
        } catch (e) {
            // Ignore cache write failures and return live data.
        }
    }
    return res.json({ ok: true, ...result, cached: false });
};
