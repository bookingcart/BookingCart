require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');
const { query, isDbConfigured } = require('../lib/db');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

function formatProfileAsAccommodation(profile) {
  const prop = profile.step_property_info || {};
  const loc = profile.step_location || {};
  const amenities = profile.step_amenities || {};
  const rooms = profile.step_rooms || {};
  const gallery = Array.isArray(profile.step_gallery) ? profile.step_gallery : [];
  const policies = profile.step_policies || {};

  const photos = gallery.map(item => {
    if (typeof item === 'string') return { url: item };
    return { url: item.url || '', caption: item.caption || '' };
  }).filter(p => !!p.url);

  const defaultPhoto = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80';

  const roomList = Array.isArray(rooms.list) ? rooms.list : [];
  const prices = roomList
    .map(r => Number(r.pricePerNight))
    .filter(p => !isNaN(p) && p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 35;
  const currency = roomList[0]?.currency || '$';

  let lat = parseFloat(loc.latitude) || 0.3177;
  let lng = parseFloat(loc.longitude) || 32.5814;

  const starRatingNum = parseFloat(prop.starRating) || 4;

  return {
    id: `local_${profile.id}`,
    name: prop.hotelName || 'Listed Hotel',
    description: prop.description || '',
    star_rating: Math.round(starRatingNum),
    rating: starRatingNum,
    review_score: null,
    review_count: 0,
    photos: photos.length > 0 ? photos : [{ url: defaultPhoto }],
    amenities: (amenities.selected || []).map(a => ({ name: a })),
    address: {
      line_one: loc.address || '',
      city: loc.city || '',
      city_name: loc.city || '',
      country_code: loc.country || '',
      postal_code: loc.postalCode || ''
    },
    location: {
      latitude: lat,
      longitude: lng
    },
    rooms: roomList,
    check_in_information: {
      check_in_after_time: policies.checkIn ? `${policies.checkIn}` : '2:00 PM',
      check_out_before_time: policies.checkOut ? `${policies.checkOut}` : '11:00 AM'
    },
    cheapest_rate_total_amount: String(minPrice),
    cheapest_rate_currency: currency,
    policies: policies
  };
}

module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ─── GET: List or Retrieve Accommodation ───────────────────────────────────
    if (req.method === 'GET') {
      const { id, limit, after, before } = req.query || {};

      if (id) {
        const isLocal = String(id).startsWith('local_') || !isNaN(Number(id));
        const rawId = String(id).replace('local_', '');

        if (isLocal) {
          let profile = null;
          try {
            if (isDbConfigured()) {
              const r = await query('SELECT * FROM bc_hotel_profiles WHERE id = $1', [rawId]);
              if (r.rows.length) profile = r.rows[0];
            }
          } catch (err) {
            console.warn('[Stays Accommodation] DB query error:', err.message);
          }

          if (!profile && global.__bc_hotel_profiles) {
            for (const [, p] of global.__bc_hotel_profiles) {
              if (String(p.id) === String(rawId)) { profile = p; break; }
            }
          }

          if (profile) {
            return res.json({ ok: true, accommodation: formatProfileAsAccommodation(profile) });
          }
        }

        // Call Duffel if not a local listing
        if (!DUFFEL_API_KEY) {
          return res.status(404).json({ ok: false, error: 'Accommodation not found' });
        }

        const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/accommodation/${encodeURIComponent(id)}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Duffel-Version': 'v2',
            Authorization: `Bearer ${DUFFEL_API_KEY}`
          }
        });
        const data = await duffelRes.json().catch(() => ({}));
        if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to fetch accommodation' });
        return res.json({ ok: true, accommodation: data.data });
      } else {
        // List accommodations
        if (!DUFFEL_API_KEY) {
          return res.status(503).json({ ok: false, error: 'Stays API key not configured' });
        }
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit);
        if (after) params.append('after', after);
        if (before) params.append('before', before);
        const qs = params.toString();
        
        const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/accommodation${qs ? '?' + qs : ''}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Duffel-Version': 'v2',
            Authorization: `Bearer ${DUFFEL_API_KEY}`
          }
        });
        const data = await duffelRes.json().catch(() => ({}));
        if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to list accommodation' });
        return res.json({ ok: true, accommodations: data.data, meta: data.meta });
      }
    }

    // ─── POST: Suggestions ───────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { query: queryStr, location } = req.body || {};

      if (!queryStr || typeof queryStr !== 'string' || queryStr.length < 3) {
        return res.status(400).json({ ok: false, error: 'Missing or invalid query. Query must be at least 3 characters long.' });
      }

      if (!DUFFEL_API_KEY) {
        return res.json({ ok: true, suggestions: [] });
      }

      const payload = {
        data: {
          query: queryStr,
          ...(location && { location })
        }
      };

      const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/accommodation/suggestions`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Duffel-Version': 'v2',
          Authorization: `Bearer ${DUFFEL_API_KEY}`
        },
        body: JSON.stringify(payload)
      });
      const data = await duffelRes.json().catch(() => ({}));
      if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to fetch accommodation suggestions' });
      return res.json({ ok: true, suggestions: data.data });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('stays-accommodation error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error.' });
  }
};
