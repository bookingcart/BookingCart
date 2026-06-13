require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

// Geocode a city/place name to lat/lng using Nominatim (OpenStreetMap, free, no key needed)
async function geocodeDestination(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BookingCart/1.0 (bookingcart.business@gmail.com)' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data[0]) {
      return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.error('Geocoding error:', err);
  }
  return null;
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
