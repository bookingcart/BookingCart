require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

/**
 * POST /api/stays-payment-instruction
 *
 * Creates a Booking Payment Instruction for a Stays booking where payment is
 * due at the hotel. This conveys to the hotel:
 *  - the card details (lodged card id)
 *  - what charges are approved (approved_charges)
 *  - where to send the invoice (invoice object)
 *  - the limit amount & currency (max the hotel can charge the card)
 *
 * Duffel API reference:
 * https://duffel.com/docs/api/v2/booking-payment-instructions
 *
 * Required body:
 * {
 *   booking_id: string,          // e.g. "bok_0000AS0NZdKjjnnHZmSUbI"
 *   card_id: string,             // lodged card (multi_use=true) e.g. "tcd_0000..."
 *   limit_amount: string,        // e.g. "154.00"
 *   limit_currency: string,      // ISO 4217, e.g. "USD"
 *   approved_charges: {          // what the hotel is allowed to charge to the card
 *     accommodation?: boolean,
 *     incidentals?: boolean
 *   },
 *   invoice: {                   // where to send the invoice
 *     name: string,
 *     email: string,
 *     address?: {
 *       line_one?: string,
 *       city?: string,
 *       postal_code?: string,
 *       country_code?: string    // ISO 3166-1 alpha-2
 *     }
 *   }
 * }
 *
 * GET /api/stays-payment-instruction?payment_instruction_id=bpi_...
 * Retrieves an existing payment instruction by ID.
 */
module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!DUFFEL_API_KEY) {
    return res.status(503).json({ ok: false, error: 'Stays API key not configured' });
  }

  // ─── GET: Retrieve a payment instruction ──────────────────────────────────
  if (req.method === 'GET') {
    const { payment_instruction_id } = req.query || {};
    if (!payment_instruction_id) {
      return res.status(400).json({ ok: false, error: 'Missing payment_instruction_id query param' });
    }

    try {
      const duffelRes = await fetch(
        `${DUFFEL_BASE_URL}/stays/booking_payment_instructions/${encodeURIComponent(payment_instruction_id)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Duffel-Version': 'v2',
            Authorization: `Bearer ${DUFFEL_API_KEY}`
          }
        }
      );

      const data = await duffelRes.json().catch(() => ({}));

      if (!duffelRes.ok) {
        const err = data.errors?.[0];
        const msg = err ? `${err.title}: ${err.message}` : 'Failed to fetch payment instruction';
        console.error('Duffel payment instruction GET failed:', duffelRes.status, msg);
        return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: msg });
      }

      return res.json({ ok: true, payment_instruction: data.data });
    } catch (err) {
      console.error('stays-payment-instruction GET error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to retrieve payment instruction.' });
    }
  }

  // ─── POST: Create a payment instruction ───────────────────────────────────
  if (req.method === 'POST') {
    const {
      booking_id,
      card_id,
      limit_amount,
      limit_currency,
      approved_charges,
      invoice
    } = req.body || {};

    // Validate required fields
    if (!booking_id || !card_id || !limit_amount || !limit_currency || !invoice) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: booking_id, card_id, limit_amount, limit_currency, invoice'
      });
    }

    if (!invoice.name || !invoice.email) {
      return res.status(400).json({
        ok: false,
        error: 'invoice must include name and email'
      });
    }

    const payload = {
      data: {
        booking_id,
        card_id,
        limit_amount: String(parseFloat(limit_amount).toFixed(2)),
        limit_currency: limit_currency.trim().toUpperCase(),
        approved_charges: approved_charges ?? {
          accommodation: true,
          incidentals: false
        },
        invoice: {
          name: invoice.name,
          email: invoice.email,
          ...(invoice.address && {
            address: {
              line_one: invoice.address.line_one || '',
              city: invoice.address.city || '',
              postal_code: invoice.address.postal_code || '',
              country_code: invoice.address.country_code || 'US'
            }
          })
        }
      }
    };

    try {
      const duffelRes = await fetch(`${DUFFEL_BASE_URL}/stays/booking_payment_instructions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Duffel-Version': 'v2',
          Authorization: `Bearer ${DUFFEL_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      const data = await duffelRes.json().catch(() => ({}));

      if (!duffelRes.ok) {
        const err = data.errors?.[0];
        const msg = err ? `${err.title}: ${err.message}` : 'Failed to create payment instruction';
        console.error('Duffel payment instruction POST failed:', duffelRes.status, msg);
        return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({ ok: false, error: msg });
      }

      return res.json({ ok: true, payment_instruction: data.data });
    } catch (err) {
      console.error('stays-payment-instruction POST error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to create payment instruction.' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
