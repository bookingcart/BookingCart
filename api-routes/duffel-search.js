require('dotenv').config();

const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE_MAX_SIZE = 500;
const searchCache = global.__duffelSearchCache || (global.__duffelSearchCache = new Map());

function evictExpiredCache() {
  const now = Date.now();
  for (const [k, v] of searchCache.entries()) {
    if (now - v.ts >= SEARCH_CACHE_TTL_MS) searchCache.delete(k);
  }
  // If still too large after TTL eviction, drop oldest entries
  if (searchCache.size > SEARCH_CACHE_MAX_SIZE) {
    const overage = searchCache.size - SEARCH_CACHE_MAX_SIZE;
    let i = 0;
    for (const k of searchCache.keys()) {
      if (i++ >= overage) break;
      searchCache.delete(k);
    }
  }
}

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const {
      originLocationCode,
      destinationLocationCode,
      departureDate,
      returnDate,
      adults = 1,
      children = 0,
      infants = 0,
      travelClass = 'ECONOMY',
      max = 30
    } = body;

    if (!originLocationCode || !destinationLocationCode || !departureDate) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required parameters: originLocationCode, destinationLocationCode, departureDate'
      });
    }

    if (!DUFFEL_API_KEY) {
      return res.status(503).json({ ok: false, error: 'Flight search is not configured' });
    }

    const slices = [
      {
        origin: originLocationCode,
        destination: destinationLocationCode,
        departure_date: departureDate
      }
    ];

    if (returnDate) {
      slices.push({
        origin: destinationLocationCode,
        destination: originLocationCode,
        departure_date: returnDate
      });
    }

    const passengers = [];
    for (let i = 0; i < Number(adults) || 0; i++) passengers.push({ type: 'adult' });
    for (let i = 0; i < Number(children) || 0; i++) passengers.push({ type: 'child' });
    for (let i = 0; i < Number(infants) || 0; i++) passengers.push({ type: 'infant_without_seat' });

    const cabinMap = {
      ECONOMY: 'economy',
      Economy: 'economy',
      economy: 'economy',
      PREMIUM_ECONOMY: 'premium_economy',
      'Premium Economy': 'premium_economy',
      BUSINESS: 'business',
      Business: 'business',
      FIRST: 'first',
      First: 'first'
    };
    const cabin = cabinMap[travelClass] || 'economy';
    const cacheKey = JSON.stringify({
      originLocationCode,
      destinationLocationCode,
      departureDate,
      returnDate: returnDate || '',
      adults: Number(adults) || 0,
      children: Number(children) || 0,
      infants: Number(infants) || 0,
      travelClass: cabin,
      max: Math.min(Math.max(Number(max) || 30, 1), 50)
    });

    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL_MS) {
      return res.json(cached.payload);
    }
    // Evict stale entries before adding a new one
    if (searchCache.size >= SEARCH_CACHE_MAX_SIZE) evictExpiredCache();

    const createResponse = await fetch(`${DUFFEL_BASE_URL}/air/offer_requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Duffel-Version': 'v2',
        Authorization: `Bearer ${DUFFEL_API_KEY}`
      },
      body: JSON.stringify({
        data: {
          slices,
          passengers,
          cabin_class: cabin
        }
      }),
      signal: AbortSignal.timeout(20000)
    });

    if (!createResponse.ok) {
      const errText = await createResponse.text();
      console.error('Duffel offer_request failed:', createResponse.status, errText.slice(0, 500));
      return res.status(502).json({
        ok: false,
        error: 'Unable to search flights right now. Please try again shortly.'
      });
    }

    const createData = await createResponse.json();
    const offerRequestId = createData.data?.id;
    // Capture Duffel passenger IDs — required by orders.create (Step 3 of Duffel guide)
    const duffelPassengers = Array.isArray(createData.data?.passengers) ? createData.data.passengers : [];
    if (!offerRequestId) {
      return res.status(502).json({ ok: false, error: 'Flight search failed. Please try again.' });
    }

    const limit = Math.min(Math.max(Number(max) || 30, 1), 50);
    const offersResponse = await fetch(
      `${DUFFEL_BASE_URL}/air/offers?offer_request_id=${encodeURIComponent(offerRequestId)}&limit=${limit}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Duffel-Version': 'v2',
          Authorization: `Bearer ${DUFFEL_API_KEY}`
        },
        signal: AbortSignal.timeout(20000)
      }
    );

    if (!offersResponse.ok) {
      const errText = await offersResponse.text();
      console.error('Duffel offers failed:', offersResponse.status, errText.slice(0, 500));
      return res.status(502).json({
        ok: false,
        error: 'Unable to load flight offers. Please try again shortly.'
      });
    }

    const offersData = await offersResponse.json();
    const flights = transformDuffelData(offersData);
    const payload = {
      ok: true,
      flights,
      total: flights.length,
      // duffelPassengers: one entry per passenger with their Duffel ID.
      // The frontend must persist these and send them back in /api/duffel-orders
      // so that passenger IDs match the offer request (required by Duffel's orders.create).
      duffelPassengers,
      meta: { count: flights.length, source: 'duffel', offerRequestId }
    };

    searchCache.set(cacheKey, {
      ts: Date.now(),
      payload
    });

    return res.json(payload);
  } catch (err) {
    console.error('Duffel search error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Flight search failed. Please try again.'
    });
  }
};

function mapCabinClass(travelClass) {
  const c = String(travelClass || '').toLowerCase();
  if (c === 'first') return 'first';
  if (c === 'business') return 'business';
  if (c === 'premium') return 'premium_economy';
  return 'economy';
}

function transformDuffelData(data) {
  let offers = [];
  if (data.data && Array.isArray(data.data.offers)) {
    offers = data.data.offers;
  } else if (data.data && Array.isArray(data.data)) {
    offers = data.data;
  } else {
    return [];
  }

  return offers
    .map((offer) => {
      try {
        const slice = offer.slices?.[0];
        if (!slice || !slice.segments || slice.segments.length === 0) return null;

        const firstSegment = slice.segments[0];
        const lastSegment = slice.segments[slice.segments.length - 1];
        const owner = firstSegment?.operating_carrier || firstSegment?.marketing_carrier;

        if (!owner) return null;

        const departTime = new Date(firstSegment.departing_at);
        const arriveTime = new Date(lastSegment.arriving_at);
        const durationMs = arriveTime - departTime;
        const durationMin = Math.round(durationMs / (1000 * 60));

        const departTimeStr = firstSegment.departing_at.split('T')[1]?.substring(0, 5) || '00:00';
        const arriveTimeStr = lastSegment.arriving_at.split('T')[1]?.substring(0, 5) || '00:00';

        const origin = firstSegment.origin || {};
        const destination = lastSegment.destination || {};

        const price = parseFloat(offer.total_amount) || 0;

        return {
          id: offer.id,
          airline: {
            code: owner.iata_code || 'DF',
            name: owner.name || 'Airline',
            logo: (owner.iata_code || 'DF').substring(0, 2).toUpperCase(),
            logoUrl: owner.logo_symbol_url || owner.logo_lockup_url || ''
          },
          from: {
            city: origin.city_name || origin.iata_code || '',
            airport: origin.name || origin.iata_code || '',
            code: origin.iata_code || ''
          },
          to: {
            city: destination.city_name || destination.iata_code || '',
            airport: destination.name || destination.iata_code || '',
            code: destination.iata_code || ''
          },
          departTime: departTimeStr,
          arriveTime: arriveTimeStr,
          durationMin,
          stops: Math.max(0, (slice.segments?.length || 1) - 1),
          price: price,
          currency: offer.total_currency || 'USD',
          cabin: offer.cabin_class || mapCabinClass('economy'),
          segments: slice.segments.map((s) => {
            const sDep = new Date(s.departing_at);
            const sArr = new Date(s.arriving_at);
            const sDurMs = sArr - sDep;
            return {
              airlineName: s.operating_carrier?.name || s.marketing_carrier?.name || 'Unknown Carrier',
              airlineCode: s.operating_carrier?.iata_code || s.marketing_carrier?.iata_code || '',
              flightNumber: s.operating_carrier_flight_number || s.marketing_carrier_flight_number || '',
              departTime: s.departing_at.split('T')[1]?.substring(0, 5) || '00:00',
              arriveTime: s.arriving_at.split('T')[1]?.substring(0, 5) || '00:00',
              departAirport: s.origin?.name || s.origin?.iata_code || '',
              departCity: s.origin?.city_name || '',
              departCode: s.origin?.iata_code || '',
              departTerminal: s.origin_terminal || '',
              arriveAirport: s.destination?.name || s.destination?.iata_code || '',
              arriveCity: s.destination?.city_name || '',
              arriveCode: s.destination?.iata_code || '',
              arriveTerminal: s.destination_terminal || '',
              aircraft: s.aircraft?.name || 'Standard Aircraft',
              durationMin: Math.round(sDurMs / (1000 * 60)),
              baggage: s.passengers?.[0]?.baggages || []
            };
          })
        };
      } catch (e) {
        console.error('Error transforming Duffel offer:', e);
        return null;
      }
    })
    .filter(Boolean);
}
