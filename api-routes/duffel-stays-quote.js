require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (req.method === 'GET') {
    try {
      const { quote_id } = req.query || {};
      if (!quote_id) return res.status(400).json({ ok: false, error: 'Missing quote_id' });
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

  try {
    const { rate_id } = req.body || {};

    if (!rate_id) {
      return res.status(400).json({ ok: false, error: 'Missing rate_id' });
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
