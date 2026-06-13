require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

// Hardcoded fallback coordinates for common cities to prevent Vercel IP blocking by Nominatim
const CITY_COORDINATES = {
  'london': { latitude: 51.5074, longitude: -0.1278 },
  'kampala': { latitude: 0.3177, longitude: 32.5814 },
  'new york': { latitude: 40.7128, longitude: -74.0060 },
  'paris': { latitude: 48.8566, longitude: 2.3522 },
  'tokyo': { latitude: 35.6762, longitude: 139.6503 },
  'dubai': { latitude: 25.2048, longitude: 55.2708 },
  'singapore': { latitude: 1.3521, longitude: 103.8198 },
  'sydney': { latitude: -33.8688, longitude: 151.2093 },
  'rome': { latitude: 41.9028, longitude: 12.4964 },
  'manchester': { latitude: 53.4808, longitude: -2.2426 },
  'los angeles': { latitude: 34.0522, longitude: -118.2437 },
  'chicago': { latitude: 41.8781, longitude: -87.6298 },
  'toronto': { latitude: 43.6510, longitude: -79.3470 },
  'berlin': { latitude: 52.5200, longitude: 13.4050 },
  'madrid': { latitude: 40.4168, longitude: -3.7038 }
};

// Geocode a city/place name to lat/lng using Nominatim (OpenStreetMap, free, no key needed)
async function geocodeDestination(query) {
  const normalizedQuery = query.trim().toLowerCase();
  
  // 1. Check our fast, reliable fallback dictionary first
  if (CITY_COORDINATES[normalizedQuery]) {
    return CITY_COORDINATES[normalizedQuery];
  }

  // 2. Fallback to Nominatim API
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BookingCart/1.0 (bookingcart.business@gmail.com)' }
    });
    if (!res.ok) {
      console.warn(`[Stays] Nominatim API error: ${res.status} ${res.statusText}`);
      // Default to London if Nominatim blocks us on Vercel and it's an unknown city
      return CITY_COORDINATES['london'];
    }
    const data = await res.json();
    if (data && data[0]) {
      return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.error('[Stays] Geocoding error:', err);
  }
  
  // Default fallback if all else fails
  return CITY_COORDINATES['london'];
}

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { destination, checkin, checkout, guests = 1, rooms = 1 } = req.body || {};

    if (!destination || !checkin || !checkout) {
      return res.status(400).json({ ok: false, error: 'Missing destination, checkin, or checkout' });
    }

    if (!DUFFEL_API_KEY) {
      return res.status(503).json({ ok: false, error: 'Stays API is not configured' });
    }

    // 1. Geocode the destination to lat/lng using Nominatim
    const coords = await geocodeDestination(destination);
    if (!coords) {
      return res.status(400).json({ ok: false, error: `Could not resolve location: "${destination}"` });
    }

    console.log(`[Stays] Geocoded "${destination}" → lat:${coords.latitude}, lng:${coords.longitude}`);

    // 2. Build the guest array (Duffel v2 requires guests as an array of objects)
    const numGuests = parseInt(guests) || 1;
    const guestsArray = Array.from({ length: numGuests }, () => ({ type: 'adult' }));

    // 3. Perform Stays Search
    const searchBody = {
      data: {
        location: {
          radius: 20,
          geographic_coordinates: {
            latitude: coords.latitude,
            longitude: coords.longitude
          }
        },
        check_in_date: checkin,
        check_out_date: checkout,
        guests: guestsArray,
        rooms: parseInt(rooms) || 1
      }
    };

    console.log('[Stays] Searching with body:', JSON.stringify(searchBody, null, 2));

    const searchRes = await fetch(`${DUFFEL_BASE_URL}/stays/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Duffel-Version': 'v2',
        'Authorization': `Bearer ${DUFFEL_API_KEY}`
      },
      body: JSON.stringify(searchBody)
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error('Stays search failed:', searchRes.status, errText);
      return res.status(502).json({ ok: false, error: 'Unable to search stays right now.' });
    }

    const searchData = await searchRes.json();
    const results = searchData.data?.results || [];

    console.log(`[Stays] Got ${results.length} results from Duffel`);

    // Map the results to a friendly format for our frontend
    const mappedResults = results.map(r => ({
      id: r.id,
      accommodation: r.accommodation,
      cheapest_rate: r.cheapest_rate_total_amount,
      cheapest_rate_base_amount: r.cheapest_rate_base_amount,
      cheapest_rate_due_at_accommodation_amount: r.cheapest_rate_due_at_accommodation_amount,
      cheapest_rate_due_at_accommodation_currency: r.cheapest_rate_due_at_accommodation_currency,
      currency: r.cheapest_rate_currency,
      check_in_date: r.check_in_date,
      check_out_date: r.check_out_date,
      guests: r.guests,
      rooms: r.rooms
    }));

    return res.json({
      ok: true,
      results: mappedResults,
      total: mappedResults.length,
      centerCoordinates: coords
    });

  } catch (err) {
    console.error('Duffel stays search error:', err);
    return res.status(500).json({ ok: false, error: 'Stays search failed.' });
  }
};
