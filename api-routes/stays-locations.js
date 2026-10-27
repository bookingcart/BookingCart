const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');
const { query, isDbConfigured } = require('../lib/db');

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const qStr = req.query.q || '';
  if (!qStr || qStr.length < 2) {
    return res.json([]);
  }

  const normalized = qStr.trim().toLowerCase();
  const unique = [];
  const seen = new Set();

  // 1. Check listed properties in DB first
  try {
    if (isDbConfigured()) {
      const dbRes = await query(`SELECT * FROM bc_hotel_profiles WHERE status != 'draft' LIMIT 20`);
      for (const row of (dbRes.rows || [])) {
        const prop = row.step_property_info || {};
        const loc = row.step_location || {};
        const hotelName = prop.hotelName || '';
        const city = loc.city || '';
        const country = loc.country || '';

        if (
          hotelName.toLowerCase().includes(normalized) ||
          city.toLowerCase().includes(normalized) ||
          country.toLowerCase().includes(normalized)
        ) {
          const displayName = hotelName || city;
          const full = [hotelName, city, country].filter(Boolean).join(', ');
          if (!seen.has(displayName.toLowerCase())) {
            seen.add(displayName.toLowerCase());
            unique.push({
              name: displayName,
              fullName: `${full} (Listed Property)`,
              country: country,
              countryCode: '',
              lat: parseFloat(loc.latitude) || 0.3177,
              lon: parseFloat(loc.longitude) || 32.5814
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Stays Locations] DB check notice:', err.message);
  }

  // 2. Query Nominatim for cities / regions
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(qStr)}&format=json&addressdetails=1&limit=5&featuretype=city`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BookingCart/1.0 (bookingcart.business@gmail.com)' }
    });
    
    if (response.ok) {
      const data = await response.json();
      for (const item of (data || [])) {
        const name = item.display_name.split(',')[0].trim();
        if (!seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          unique.push({
            name,
            fullName: item.display_name,
            // Used by the home page location picker to rebuild country-specific content
            country: item.address?.country || '',
            countryCode: String(item.address?.country_code || '').toUpperCase(),
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon)
          });
        }
      }
    }
  } catch (err) {
    console.error('[Stays Locations] error:', err.message);
  }

  return res.json(unique);
};
