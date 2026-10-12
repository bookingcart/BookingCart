require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');
const { query, isDbConfigured } = require('../lib/db');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { search_result_id } = req.query || {};

    if (!search_result_id) {
      return res.status(400).json({ ok: false, error: 'Missing search_result_id' });
    }

    const isLocal = String(search_result_id).startsWith('local_') || !isNaN(Number(search_result_id));
    const rawId = String(search_result_id).replace('local_', '');

    if (isLocal) {
      let profile = null;
      try {
        if (isDbConfigured()) {
          const r = await query('SELECT * FROM bc_hotel_profiles WHERE id = $1', [rawId]);
          if (r.rows.length) profile = r.rows[0];
        }
      } catch (err) {
        console.warn('[Stays Rates] DB query error:', err.message);
      }

      if (!profile && global.__bc_hotel_profiles) {
        for (const [, p] of global.__bc_hotel_profiles) {
          if (String(p.id) === String(rawId)) { profile = p; break; }
        }
      }

      if (profile) {
        const rooms = Array.isArray(profile.step_rooms?.list) ? profile.step_rooms.list : [];
        const policies = profile.step_policies || {};
        const cancelPolicy = policies.cancellationPolicy || 'Free cancellation up to 48 hours before check-in';
        const isFreeCancel = !cancelPolicy.toLowerCase().includes('non-refundable');

        const cancelTimeline = isFreeCancel ? {
          cancel_by: new Date(Date.now() + 48 * 3600000).toISOString(),
          penalties: [{ percentage: 100, starts_at: new Date(Date.now() + 48 * 3600000).toISOString() }]
        } : null;

        const rates = rooms.map((room, idx) => {
          const price = Number(room.pricePerNight) || 35;
          return {
            id: `rate_local_${profile.id}_${room.id || idx}`,
            total_amount: String(price),
            base_amount: String(price),
            fee_amount: '0.00',
            tax_amount: '0.00',
            due_at_accommodation_amount: '0.00',
            due_at_accommodation_currency: room.currency || 'USD',
            currency: room.currency || 'USD',
            refundable: isFreeCancel,
            conditions: cancelPolicy,
            cancellation_timeline: cancelTimeline,
            room_name: room.name || `Room ${idx + 1}`,
            bed_type: room.bedType || 'Queen',
            max_occupancy: room.maxOccupancy || 2
          };
        });

        if (rates.length === 0) {
          rates.push({
            id: `rate_local_${profile.id}_def`,
            total_amount: '35',
            base_amount: '35',
            fee_amount: '0.00',
            tax_amount: '0.00',
            due_at_accommodation_amount: '0.00',
            due_at_accommodation_currency: 'USD',
            currency: 'USD',
            refundable: true,
            conditions: cancelPolicy,
            cancellation_timeline: cancelTimeline,
            room_name: 'Standard Room',
            bed_type: 'Queen',
            max_occupancy: 2
          });
        }

        return res.json({ ok: true, rates });
      }
    }

    if (!DUFFEL_API_KEY) {
      return res.status(503).json({ ok: false, error: 'Stays API is not configured' });
    }

    // Fetch all available rates for a specific search result ID from Duffel
    const ratesRes = await fetch(`${DUFFEL_BASE_URL}/stays/search_results/${encodeURIComponent(search_result_id)}/rates`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Duffel-Version': 'v2',
        Authorization: `Bearer ${DUFFEL_API_KEY}`
      }
    });

    if (!ratesRes.ok) {
      const errText = await ratesRes.text();
      console.error('Stays rates fetch failed:', ratesRes.status, errText);
      return res.status(502).json({ ok: false, error: 'Unable to fetch rates right now.' });
    }

    const ratesData = await ratesRes.json();
    return res.json({
      ok: true,
      rates: ratesData.data || [],
    });

  } catch (err) {
    console.error('Duffel stays rates error:', err);
    return res.status(500).json({ ok: false, error: 'Stays rates fetch failed.' });
  }
};
