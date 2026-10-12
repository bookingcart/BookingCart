require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');
const { query, isDbConfigured } = require('../lib/db');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

// Fallback coordinates dictionary for fast, reliable lookup and to avoid Nominatim limits
const CITY_COORDINATES = {
  'london': { latitude: 51.5074, longitude: -0.1278 },
  'kampala': { latitude: 0.3177, longitude: 32.5814 },
  'uganda': { latitude: 0.3476, longitude: 32.5825 },
  'entebbe': { latitude: 0.0512, longitude: 32.4637 },
  'jinja': { latitude: 0.4479, longitude: 33.2026 },
  'mbarara': { latitude: -0.6072, longitude: 30.6545 },
  'nairobi': { latitude: -1.2921, longitude: 36.8219 },
  'kenya': { latitude: -1.2921, longitude: 36.8219 },
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

// Geocode a destination query
async function geocodeDestination(queryStr) {
  const normalizedQuery = (queryStr || '').trim().toLowerCase();
  
  if (CITY_COORDINATES[normalizedQuery]) {
    return CITY_COORDINATES[normalizedQuery];
  }

  // Check if any known city is a substring
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (normalizedQuery.includes(key) || key.includes(normalizedQuery)) {
      return coords;
    }
  }

  // Fallback to Nominatim API
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryStr)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BookingCart/1.0 (bookingcart.business@gmail.com)' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data[0]) {
        return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
      }
    }
  } catch (err) {
    console.error('[Stays] Geocoding error:', err.message);
  }

  return CITY_COORDINATES['kampala'];
}

function matchesDestination(profile, destinationQuery) {
  if (!destinationQuery) return true;
  const q = destinationQuery.trim().toLowerCase();
  const qTokens = q.split(/[\s,]+/).filter(t => t.length > 1);

  const loc = profile.step_location || {};
  const prop = profile.step_property_info || {};

  const country = (loc.country || '').trim().toLowerCase();
  const city = (loc.city || '').trim().toLowerCase();
  const address = (loc.address || '').trim().toLowerCase();
  const name = (prop.hotelName || '').trim().toLowerCase();

  if (country && (country.includes(q) || q.includes(country))) return true;
  if (city && (city.includes(q) || q.includes(city))) return true;
  if (name && (name.includes(q) || q.includes(name))) return true;
  if (address && (address.includes(q) || q.includes(address))) return true;

  // Token matches
  return qTokens.some(tok => country.includes(tok) || city.includes(tok) || name.includes(tok));
}

function formatProfileToStayResult(profile, nights, destinationCoords, checkin, checkout, guestsArray, numRooms) {
  const prop = profile.step_property_info || {};
  const loc = profile.step_location || {};
  const amenities = profile.step_amenities || {};
  const rooms = profile.step_rooms || {};
  const gallery = Array.isArray(profile.step_gallery) ? profile.step_gallery : [];
  const policies = profile.step_policies || {};

  // Extract photos
  const photos = gallery.map(item => {
    if (typeof item === 'string') return { url: item };
    return { url: item.url || '', caption: item.caption || '' };
  }).filter(p => !!p.url);

  const defaultPhoto = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';
  const mainPhotoUrl = photos[0]?.url || defaultPhoto;

  // Extract room pricing
  const roomList = Array.isArray(rooms.list) ? rooms.list : [];
  const prices = roomList
    .map(r => Number(r.pricePerNight))
    .filter(p => !isNaN(p) && p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 35;
  const totalPrice = minPrice * Math.max(1, nights);
  const currency = roomList[0]?.currency || 'USD';

  // Extract coordinates
  let lat = parseFloat(loc.latitude);
  let lng = parseFloat(loc.longitude);
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
    const cityKey = (loc.city || '').trim().toLowerCase();
    const countryKey = (loc.country || '').trim().toLowerCase();
    if (CITY_COORDINATES[cityKey]) {
      lat = CITY_COORDINATES[cityKey].latitude;
      lng = CITY_COORDINATES[cityKey].longitude;
    } else if (CITY_COORDINATES[countryKey]) {
      lat = CITY_COORDINATES[countryKey].latitude;
      lng = CITY_COORDINATES[countryKey].longitude;
    } else if (destinationCoords) {
      lat = destinationCoords.latitude;
      lng = destinationCoords.longitude;
    } else {
      lat = 0.3177;
      lng = 32.5814;
    }
  }

  const starRatingNum = parseFloat(prop.starRating) || 4;

  const accommodation = {
    id: `local_${profile.id}`,
    name: prop.hotelName || 'Listed Hotel',
    description: prop.description || '',
    chain: { name: prop.propertyType ? `${prop.propertyType} • Listed Stay` : 'Listed Stay' },
    review_score: 8.8,
    rating: starRatingNum,
    star_rating: Math.round(starRatingNum),
    review_count: 14,
    photos: photos.length > 0 ? photos : [{ url: defaultPhoto }],
    location: {
      address: {
        line_one: loc.address || '',
        city_name: loc.city || '',
        country_code: loc.country || '',
        postal_code: loc.postalCode || ''
      },
      geographic_coordinates: {
        latitude: lat,
        longitude: lng
      }
    },
    amenities: (amenities.selected || []).map(a => ({ name: a })),
    rooms: roomList,
    policies: policies,
    check_in_information: {
      check_in_after_time: policies.checkIn ? `${policies.checkIn}` : '2:00 PM',
      check_out_before_time: policies.checkOut ? `${policies.checkOut}` : '11:00 AM'
    }
  };

  return {
    id: `local_${profile.id}`,
    is_local_listing: true,
    hotel_profile_id: profile.id,
    accommodation,
    cheapest_rate: String(totalPrice),
    cheapest_rate_total_amount: String(totalPrice),
    cheapest_rate_base_amount: String(minPrice),
    cheapest_rate_due_at_accommodation_amount: '0.00',
    cheapest_rate_due_at_accommodation_currency: currency,
    currency: currency,
    check_in_date: checkin,
    check_out_date: checkout,
    guests: guestsArray,
    rooms: numRooms
  };
}

// Fetch listed properties from database / in-memory store
async function getListedStays(destination, checkin, checkout, guestsArray, numRooms, destinationCoords) {
  const nights = Math.max(1, Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24))) || 1;
  const results = [];

  let rows = [];
  try {
    if (isDbConfigured()) {
      const res = await query(`SELECT * FROM bc_hotel_profiles WHERE status != 'draft' ORDER BY id ASC`);
      rows = res.rows || [];
    }
  } catch (err) {
    console.warn('[Stays] DB query for listed profiles failed:', err.message);
  }

  // Also check in-memory store if DB was empty or unavailable
  if (rows.length === 0 && global.__bc_hotel_profiles) {
    for (const [, p] of global.__bc_hotel_profiles) {
      if (p.status !== 'draft') rows.push(p);
    }
  }

  for (const profile of rows) {
    if (matchesDestination(profile, destination)) {
      results.push(formatProfileToStayResult(profile, nights, destinationCoords, checkin, checkout, guestsArray, numRooms));
    }
  }

  return results;
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

    // 1. Geocode the destination to lat/lng
    const coords = await geocodeDestination(destination);
    console.log(`[Stays] Geocoded "${destination}" → lat:${coords.latitude}, lng:${coords.longitude}`);

    const numGuests = parseInt(guests) || 1;
    const numRooms = parseInt(rooms) || 1;
    const guestsArray = Array.from({ length: numGuests }, () => ({ type: 'adult' }));

    // 2. Fetch official listed stays matching this destination from BookingCart DB
    const listedStays = await getListedStays(destination, checkin, checkout, guestsArray, numRooms, coords);
    console.log(`[Stays] Found ${listedStays.length} listed stay(s) for "${destination}"`);

    // 3. Optionally fetch Duffel API stays if configured and approved
    let duffelMapped = [];
    if (DUFFEL_API_KEY) {
      try {
        const searchBody = {
          data: {
            location: {
              radius: 30,
              geographic_coordinates: {
                latitude: coords.latitude,
                longitude: coords.longitude
              }
            },
            check_in_date: checkin,
            check_out_date: checkout,
            guests: guestsArray,
            rooms: numRooms
          }
        };

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

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const duffelResults = searchData.data?.results || [];
          duffelMapped = duffelResults.map(r => ({
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
          console.log(`[Stays] Duffel returned ${duffelMapped.length} result(s)`);
        } else {
          const errText = await searchRes.text();
          console.warn(`[Stays] Duffel search response ${searchRes.status}: ${errText.slice(0, 120)}`);
        }
      } catch (dErr) {
        console.warn('[Stays] Duffel search fetch error:', dErr.message);
      }
    }

    // Combine listed stays (prioritized first) and Duffel stays
    const combinedResults = [...listedStays, ...duffelMapped];

    // Center map coordinates: if we have listed stays, center on the first stay's lat/lng
    let centerCoords = coords;
    if (listedStays.length > 0 && listedStays[0].accommodation?.location?.geographic_coordinates) {
      const g = listedStays[0].accommodation.location.geographic_coordinates;
      if (g.latitude && g.longitude) {
        centerCoords = { latitude: g.latitude, longitude: g.longitude };
      }
    }

    return res.json({
      ok: true,
      results: combinedResults,
      total: combinedResults.length,
      centerCoordinates: centerCoords
    });

  } catch (err) {
    console.error('Stays search error:', err);
    return res.status(500).json({ ok: false, error: 'Stays search failed.' });
  }
};
