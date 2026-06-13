require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

/**
 * Brands API
 * 
 * Duffel API reference:
 * https://duffel.com/docs/api/v2/brands
 *
 * GET /api/stays-brands              - List all hotel brands
 * GET /api/stays-brands?id=...       - Get a single hotel brand by ID
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

      if (id) {
        // Get single hotel brand
        const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/brands/${encodeURIComponent(id)}`, {
          method: 'GET',
          headers: defaultHeaders
        });
        const data = await duffelRes.json().catch(() => ({}));
        if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to fetch brand' });
        return res.json({ ok: true, brand: data.data });
      } else {
        // List hotel brands
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit);
        if (after) params.append('after', after);
        if (before) params.append('before', before);
        const qs = params.toString();
        
        const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/brands${qs ? '?' + qs : ''}`, {
          method: 'GET',
          headers: defaultHeaders
        });
        const data = await duffelRes.json().catch(() => ({}));
        if (!duffelRes.ok) return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: data.errors?.[0]?.message || 'Failed to list brands' });
        return res.json({ ok: true, brands: data.data, meta: data.meta });
      }
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('stays-brands error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error.' });
  }
};
