require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

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

    if (!DUFFEL_API_KEY) {
      return res.status(503).json({ ok: false, error: 'Stays API is not configured' });
    }

    // Fetch all available rates for a specific search result ID
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
