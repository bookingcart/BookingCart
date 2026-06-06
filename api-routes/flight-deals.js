// api/flight-deals.js – Fetch trending flight deals (Duffel API + Postgres Cache)

const fetch = require('node-fetch');
const { getCorsHeaders } = require('../lib/cors');
const { isDbConfigured, initDb, getCache, setCache } = require('../lib/db');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
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

const IATA_TO_CITY = {
    'EBB': 'Entebbe', 'NBO': 'Nairobi', 'DAR': 'Dar es Salaam',
    'KGL': 'Kigali', 'JNB': 'Johannesburg', 'CPT': 'Cape Town',
    'LOS': 'Lagos', 'ACC': 'Accra', 'CAI': 'Cairo', 'ADD': 'Addis Ababa',
    'LHR': 'London', 'CDG': 'Paris', 'FRA': 'Frankfurt',
    'AMS': 'Amsterdam', 'FCO': 'Rome', 'MAD': 'Madrid',
    'JFK': 'New York', 'LAX': 'Los Angeles', 'ORD': 'Chicago',
    'YYZ': 'Toronto', 'DXB': 'Dubai', 'AUH': 'Abu Dhabi',
    'DEL': 'New Delhi', 'BOM': 'Mumbai', 'SIN': 'Singapore',
    'SYD': 'Sydney', 'NRT': 'Tokyo', 'PEK': 'Beijing',
    'IST': 'Istanbul', 'GRU': 'São Paulo', 'BKK': 'Bangkok',
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
    'KGL': [
        { to: 'DXB', city: 'Dubai', country: 'UAE', image: 'dubai' },
        { to: 'NBO', city: 'Nairobi', country: 'Kenya', image: 'nairobi' },
        { to: 'EBB', city: 'Entebbe', country: 'Uganda', image: 'nairobi' },
        { to: 'ADD', city: 'Addis Ababa', country: 'Ethiopia', image: 'cairo' },
        { to: 'JNB', city: 'Johannesburg', country: 'South Africa', image: 'johannesburg' },
        { to: 'LHR', city: 'London', country: 'UK', image: 'london' }
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

const FALLBACK_PRICES = {
    DXB: 542, LHR: 1019, CDG: 890, JFK: 1317, AMS: 780, SIN: 980,
    NBO: 368, EBB: 420, DAR: 330, IST: 690, JNB: 610, BOM: 740,
    BKK: 1141, ADD: 310, ACC: 820, CAI: 760
};

function getDuffelApiKey() {
    return process.env.DUFFEL_API_KEY || '';
}

function getNextDates(daysFromNow = 30) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().split('T')[0];
}

// Fetch single cheapest offer from Duffel
async function fetchDeal(origin, destination, date) {
    const DUFFEL_API_KEY = getDuffelApiKey();
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

function makeFallbackDeal(origin, route, index, date) {
    const basePrice = FALLBACK_PRICES[route.to] || (420 + index * 85);
    const regionalDiscount = ['NBO', 'EBB', 'DAR', 'ADD'].includes(route.to) ? 0 : 1;
    const price = Math.max(180, basePrice + (origin === 'KGL' ? 0 : regionalDiscount * index * 18));

    return {
        ...route,
        from: origin,
        price,
        currency: 'USD',
        airline: index % 2 === 0 ? 'Multiple airlines' : 'Best available fare',
        airlineCode: '',
        duration: '',
        stops: ['NBO', 'EBB', 'ADD', 'DXB', 'IST', 'AMS'].includes(route.to) ? 0 : 1,
        departTime: '',
        arriveTime: '',
        date,
        offerId: '',
        estimated: true,
        source: 'curated'
    };
}

function buildFallbackDeals(origin, date) {
    const routes = ROUTES[origin] || ROUTES.DEFAULT;
    return routes.slice(0, 6).map((route, index) => makeFallbackDeal(origin, route, index, date));
}

module.exports = async (req, res) => {
    const ch = getCorsHeaders(req);
    Object.entries(ch).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Get client IP
    const ip =
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.headers['x-real-ip'] ||
        req.socket?.remoteAddress ||
        '';

    // If override provided in query/body, use it
    const overrideIata = String((req.query && req.query.origin) || (req.body && req.body.origin) || '').trim().toUpperCase();
    const clientCity = (req.body && req.body.city) || '';
    const clientCountry = (req.body && req.body.country) || '';

    // Check cache first
    const cacheKey = `deals_${overrideIata || clientCity || clientCountry || ip || 'default'}`.toLowerCase();
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
    const displayDeals = deals.length ? deals : buildFallbackDeals(iata, departureDate);

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

    const enriched = displayDeals.map(d => ({
        ...d,
        imageUrl: DEST_IMAGES[(d.image || '').toLowerCase()] || DEST_IMAGES[(d.city || '').toLowerCase()] || FALLBACK_IMG,
        hot: d.price < 300,
        tripType: 'one-way',
        live: !d.estimated
    }));

    const result = {
        origin: iata,
        city: city || IATA_TO_CITY[iata] || iata,
        country,
        deals: enriched,
        live: deals.length > 0,
        estimated: deals.length === 0
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
