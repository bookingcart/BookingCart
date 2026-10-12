require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');
const { query, isDbConfigured } = require('../lib/db');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // ─── GET: Fetch quote by ID ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { quote_id } = req.query || {};
      if (!quote_id) return res.status(400).json({ ok: false, error: 'Missing quote_id' });

      if (String(quote_id).startsWith('quo_rate_local_') || String(quote_id).startsWith('quo_local_')) {
        const parts = String(quote_id).split('_');
        const isRateLocal = String(quote_id).startsWith('quo_rate_local_');
        const profileId = isRateLocal ? (parts[3] || 1) : (parts[2] || 1);
        let roomIdentifier = isRateLocal ? parts.slice(4).join('_') : parts.slice(3).join('_');
        let nightsCount = Math.max(1, Number(req.query?.nights) || 1);

        // If quote_id ends with _n<number>, extract nights
        const nightsMatch = roomIdentifier.match(/_n(\d+)$/);
        if (nightsMatch) {
          nightsCount = Math.max(1, parseInt(nightsMatch[1], 10));
          roomIdentifier = roomIdentifier.replace(/_n\d+$/, '');
        }

        let profile = null;
        try {
          if (isDbConfigured()) {
            const r = await query('SELECT * FROM bc_hotel_profiles WHERE id = $1', [profileId]);
            if (r.rows.length) profile = r.rows[0];
          }
        } catch {}
        if (!profile && global.__bc_hotel_profiles) {
          for (const [, p] of global.__bc_hotel_profiles) {
            if (String(p.id) === String(profileId)) { profile = p; break; }
          }
        }

        const prop = profile?.step_property_info || {};
        const loc = profile?.step_location || {};
        const rooms = profile?.step_rooms?.list || [];
        const policies = profile?.step_policies || {};

        const matchedRoom = rooms.find((r, i) =>
          String(r.id) === String(roomIdentifier) ||
          String(i) === String(roomIdentifier) ||
          String(r.name).trim().toLowerCase() === String(roomIdentifier).trim().toLowerCase()
        );
        const chosenRoom = matchedRoom || rooms[0] || {};
        const nightlyPrice = Number(chosenRoom.pricePerNight) || 35;
        const totalAmount = nightlyPrice * nightsCount;

        return res.json({
          ok: true,
          quote: {
            id: quote_id,
            total_amount: String(totalAmount),
            base_amount: String(nightlyPrice),
            nights: nightsCount,
            tax_amount: '0.00',
            fee_amount: '0.00',
            currency: chosenRoom.currency || 'USD',
            check_in_date: new Date().toISOString().split('T')[0],
            check_out_date: new Date(Date.now() + nightsCount * 86400000).toISOString().split('T')[0],
            accommodation: {
              name: prop.hotelName || 'Listed Hotel',
              rating: parseFloat(prop.starRating) || 4,
              location: {
                address: {
                  line_one: loc.address || '',
                  city_name: loc.city || '',
                  country_code: loc.country || '',
                  postal_code: loc.postalCode || ''
                }
              },
              photos: [{ url: profile?.step_gallery?.[0]?.url || profile?.step_gallery?.[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80' }]
            },
            rooms: [{
              name: chosenRoom.name || 'Standard Room',
              rates: [{
                due_at_accommodation_amount: '0.00',
                due_at_accommodation_currency: chosenRoom.currency || 'USD',
                conditions: policies.cancellationPolicy || 'Free cancellation up to 48 hours before check-in'
              }]
            }]
          }
        });
      }

      if (!DUFFEL_API_KEY) return res.status(503).json({ ok: false, error: 'Stays API is not configured' });

      const quoteRes = await fetch(`${DUFFEL_BASE_URL}/stays/quotes/${encodeURIComponent(quote_id)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Duffel-Version': 'v2',
          Authorization: `Bearer ${DUFFEL_API_KEY}`
        }
      });

      if (!quoteRes.ok) {
        const errText = await quoteRes.text();
        console.error('Stays quote fetch failed:', quoteRes.status, errText);
        return res.status(502).json({ ok: false, error: 'Unable to fetch the quote.' });
      }

      const quoteData = await quoteRes.json();
      return res.json({ ok: true, quote: quoteData.data });
    } catch (err) {
      console.error('Duffel stays quote fetch error:', err);
      return res.status(500).json({ ok: false, error: 'Stays quote fetch failed.' });
    }
  }

  // ─── POST: Create quote from rate_id ─────────────────────────────────────────
  try {
    const { rate_id, nights } = req.body || {};

    if (!rate_id) {
      return res.status(400).json({ ok: false, error: 'Missing rate_id' });
    }

    if (String(rate_id).startsWith('rate_local_')) {
      const parts = String(rate_id).split('_');
      const profileId = parts[2] || 1;
      const roomIdentifier = parts.slice(3).join('_');

      let profile = null;
      try {
        if (isDbConfigured()) {
          const r = await query('SELECT * FROM bc_hotel_profiles WHERE id = $1', [profileId]);
          if (r.rows.length) profile = r.rows[0];
        }
      } catch {}

      const rooms = profile?.step_rooms?.list || [];
      const matchedRoom = rooms.find((r, i) =>
        String(r.id) === String(roomIdentifier) ||
        String(i) === String(roomIdentifier) ||
        String(r.name).trim().toLowerCase() === String(roomIdentifier).trim().toLowerCase()
      );
      const chosenRoom = matchedRoom || rooms[0] || {};
      const nightlyPrice = Number(chosenRoom.pricePerNight) || 35;
      const numNights = Math.max(1, Number(nights) || 1);
      const totalAmount = nightlyPrice * numNights;

      return res.json({
        ok: true,
        quote: {
          id: `quo_${rate_id}_n${numNights}`,
          total_amount: String(totalAmount),
          base_amount: String(nightlyPrice),
          nights: numNights,
          tax_amount: '0.00',
          fee_amount: '0.00',
          currency: chosenRoom.currency || 'USD',
          room_name: chosenRoom.name || 'Standard Room'
        }
      });
    }

    if (!DUFFEL_API_KEY) {
      return res.status(503).json({ ok: false, error: 'Stays API is not configured' });
    }

    const quoteBody = {
      data: {
        rate_id: rate_id
      }
    };

    const quoteRes = await fetch(`${DUFFEL_BASE_URL}/stays/quotes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Duffel-Version': 'v2',
        Authorization: `Bearer ${DUFFEL_API_KEY}`
      },
      body: JSON.stringify(quoteBody)
    });

    if (!quoteRes.ok) {
      const errText = await quoteRes.text();
      console.error('Stays quote failed:', quoteRes.status, errText);
      return res.status(502).json({ ok: false, error: 'Unable to create a quote for this rate.' });
    }

    const quoteData = await quoteRes.json();
    return res.json({
      ok: true,
      quote: quoteData.data,
    });

  } catch (err) {
    console.error('Duffel stays quote error:', err);
    return res.status(500).json({ ok: false, error: 'Stays quote creation failed.' });
  }
};
