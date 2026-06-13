require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

/**
 * Accommodation Reviews API
 * 
 * Duffel API reference:
 * https://duffel.com/docs/api/v2/accommodation-reviews
 *
 * GET /api/stays-accommodation-reviews?id=...       - Get reviews for a specific accommodation
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
    if (req.method === 'GET') {
      const { id, limit, after, before } = req.query || {};

      if (!id) {
        return res.status(400).json({ ok: false, error: 'Missing accommodation id' });
      }

      const params = new URLSearchParams();
      if (limit) params.append('limit', limit);
      if (after) params.append('after', after);
      if (before) params.append('before', before);
      const qs = params.toString();

      const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/accommodation/${encodeURIComponent(id)}/reviews${qs ? '?' + qs : ''}`, {
        method: 'GET',
        headers: defaultHeaders
      });
      const data = await duffelRes.json().catch(() => ({}));
      if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to fetch accommodation reviews' });
      return res.json({ ok: true, reviews: data.data, meta: data.meta });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('stays-accommodation-reviews error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error.' });
  }
};
