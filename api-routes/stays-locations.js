const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const query = req.query.q || '';
  if (!query || query.length < 2) {
    return res.json([]);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&featuretype=city`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BookingCart/1.0 (bookingcart.business@gmail.com)' }
    });
    
    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Map to a simpler format
    const suggestions = data.map(item => ({
      name: item.display_name.split(',')[0],
      fullName: item.display_name,
      lat: item.lat,
      lon: item.lon
    }));

    // Deduplicate by name
    const unique = [];
    const seen = new Set();
    for (const s of suggestions) {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        unique.push(s);
      }
    }

    return res.json(unique);
  } catch (err) {
    console.error('[Stays Locations] error:', err);
    return res.json([]); // Return empty array on failure
  }
};
