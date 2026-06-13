require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

/**
 * Accommodation API
 * 
 * Duffel API reference:
 * https://duffel.com/docs/api/v2/accommodation
 *
 * GET /api/stays-accommodation              - List all accommodations
 * GET /api/stays-accommodation?id=...       - Get a single accommodation by ID
 * POST /api/stays-accommodation             - Search for accommodation suggestions
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
    // ─── GET: List or Retrieve Accommodation ───────────────────────────────────
    if (req.method === 'GET') {
      const { id, limit, after, before } = req.query || {};

      if (id) {
        // Get single accommodation
        const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/accommodation/${encodeURIComponent(id)}`, {
          method: 'GET',
          headers: defaultHeaders
        });
        const data = await duffelRes.json().catch(() => ({}));
        if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to fetch accommodation' });
        return res.json({ ok: true, accommodation: data.data });
      } else {
        // List accommodations
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit);
        if (after) params.append('after', after);
        if (before) params.append('before', before);
        const qs = params.toString();
        
        const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/accommodation${qs ? '?' + qs : ''}`, {
          method: 'GET',
          headers: defaultHeaders
        });
        const data = await duffelRes.json().catch(() => ({}));
        if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to list accommodation' });
        return res.json({ ok: true, accommodations: data.data, meta: data.meta });
      }
    }

    // ─── POST: Suggestions ───────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { query, location } = req.body || {};

      if (!query || typeof query !== 'string' || query.length < 3) {
        return res.status(400).json({ ok: false, error: 'Missing or invalid query. Query must be at least 3 characters long.' });
      }

      const payload = {
        data: {
          query,
          ...(location && { location })
        }
      };

      const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/accommodation/suggestions`, {
        method: 'POST',
        headers: defaultHeaders,
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
