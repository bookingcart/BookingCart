require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

/**
 * Negotiated Rates API
 * 
 * Duffel API reference:
 * https://duffel.com/docs/api/v2/negotiated-rates
 *
 * GET /api/stays-negotiated-rates              - List all negotiated rates
 * GET /api/stays-negotiated-rates?id=...       - Get a single negotiated rate
 * POST /api/stays-negotiated-rates             - Create a new negotiated rate
 * PATCH /api/stays-negotiated-rates            - Update a negotiated rate (requires body.id)
 * DELETE /api/stays-negotiated-rates?id=...    - Delete a negotiated rate
 */
module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!DUFFEL_API_KEY) {
    return res.status(503).json({ ok: false, error: 'Stays API key not configured' });
  }

  const defaultHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Duffel-Version': 'v2',
    Authorization: `Bearer ${DUFFEL_API_KEY}`
  };

  try {
    // ─── GET: List or Retrieve ────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { id, limit, after, before } = req.query || {};

      if (id) {
        // Get single negotiated rate
        const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/negotiated_rates/${encodeURIComponent(id)}`, {
          method: 'GET',
          headers: defaultHeaders
        });
        const data = await duffelRes.json().catch(() => ({}));
        if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to fetch negotiated rate' });
        return res.json({ ok: true, negotiated_rate: data.data });
      } else {
        // List negotiated rates
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit);
        if (after) params.append('after', after);
        if (before) params.append('before', before);
        const qs = params.toString();
        
        const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/negotiated_rates${qs ? '?' + qs : ''}`, {
          method: 'GET',
          headers: defaultHeaders
        });
        const data = await duffelRes.json().catch(() => ({}));
        if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to list negotiated rates' });
        return res.json({ ok: true, negotiated_rates: data.data, meta: data.meta });
      }
    }

    // ─── POST: Create ─────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { rate_access_code, display_name, accommodation_ids, chain_id } = req.body || {};

      if (!rate_access_code || !display_name) {
        return res.status(400).json({ ok: false, error: 'Missing required fields: rate_access_code, display_name' });
      }

      const payload = {
        data: {
          rate_access_code,
          display_name,
          ...(accommodation_ids && { accommodation_ids }),
          ...(chain_id && { chain_id })
        }
      };

      const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/negotiated_rates`, {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify(payload)
      });
      const data = await duffelRes.json().catch(() => ({}));
      if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to create negotiated rate' });
      return res.json({ ok: true, negotiated_rate: data.data });
    }

    // ─── PATCH: Update ────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, rate_access_code, display_name, accommodation_ids, chain_id } = req.body || {};

      if (!id) {
        return res.status(400).json({ ok: false, error: 'Missing id in body' });
      }

      const payload = {
        data: {
          ...(rate_access_code && { rate_access_code }),
          ...(display_name && { display_name }),
          ...(accommodation_ids !== undefined && { accommodation_ids }),
          ...(chain_id !== undefined && { chain_id })
        }
      };

      const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/negotiated_rates/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: defaultHeaders,
        body: JSON.stringify(payload)
      });
      const data = await duffelRes.json().catch(() => ({}));
      if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to update negotiated rate' });
      return res.json({ ok: true, negotiated_rate: data.data });
    }

    // ─── DELETE: Delete ───────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query || {};
      
      if (!id) {
        return res.status(400).json({ ok: false, error: 'Missing id in query param' });
      }

      const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/negotiated_rates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: defaultHeaders
      });

      if (duffelRes.status === 204) {
        return res.json({ ok: true, deleted: true });
      }

      const data = await duffelRes.json().catch(() => ({}));
      if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to delete negotiated rate' });
      return res.json({ ok: true, deleted: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('stays-negotiated-rates error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error.' });
  }
};
