require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method === 'GET') {
    try {
      const { booking_id, limit, after, before } = req.query || {};
      
      // If no booking_id is provided, LIST bookings
      if (!booking_id) {
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit);
        if (after) params.append('after', after);
        if (before) params.append('before', before);
        const qs = params.toString();
        const url = `${DUFFEL_BASE_URL}/stays/bookings${qs ? '?' + qs : ''}`;

        const listRes = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Duffel-Version': 'v2',
            Authorization: `Bearer ${DUFFEL_API_KEY}`
          }
        });

        if (!listRes.ok) {
          const errText = await listRes.text();
          console.error('Stays booking list failed:', listRes.status, errText);
          return res.status(502).json({ ok: false, error: 'Unable to list bookings.' });
        }

        const listData = await listRes.json();
        return res.json({ ok: true, bookings: listData.data, meta: listData.meta });
      }

      // Otherwise, GET a single booking

      const bookingRes = await fetch(`${DUFFEL_BASE_URL}/stays/bookings/${encodeURIComponent(booking_id)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Duffel-Version': 'v2',
          Authorization: `Bearer ${DUFFEL_API_KEY}`
        }
      });

      if (!bookingRes.ok) {
        const errText = await bookingRes.text();
        console.error('Stays booking fetch failed:', bookingRes.status, errText);
        return res.status(502).json({ ok: false, error: 'Unable to fetch booking details.' });
      }

      const bookingData = await bookingRes.json();
      return res.json({ ok: true, booking: bookingData.data });
    } catch (err) {
      console.error('Duffel stays booking fetch error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to fetch booking.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { action, booking_id, quote_id, guests, email, phone_number, payment } = req.body || {};

      if (!DUFFEL_API_KEY) {
        return res.status(503).json({ ok: false, error: 'Stays API is not configured' });
      }

      // Cancel a booking
      if (action === 'cancel') {
        if (!booking_id) {
          return res.status(400).json({ ok: false, error: 'Missing booking_id for cancellation' });
        }

        const cancelRes = await fetch(`${DUFFEL_BASE_URL}/stays/bookings/${encodeURIComponent(booking_id)}/actions/cancel`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Duffel-Version': 'v2',
            Authorization: `Bearer ${DUFFEL_API_KEY}`
          }
        });

        if (!cancelRes.ok) {
          const errText = await cancelRes.text();
          console.error('Stays booking cancel failed:', cancelRes.status, errText);
          return res.status(502).json({ ok: false, error: 'Unable to cancel the booking.' });
        }

        const cancelData = await cancelRes.json();
        return res.json({
          ok: true,
          booking: cancelData.data
        });
      }

      // Create a booking (default)
      if (!quote_id || !guests || !email || !phone_number) {
        return res.status(400).json({ ok: false, error: 'Missing required booking fields' });
      }

      if (!DUFFEL_API_KEY) {
        return res.status(503).json({ ok: false, error: 'Stays API is not configured' });
      }

      const bookingBody = {
        data: {
          quote_id,
          guests,
          email,
          phone_number
        }
      };
      
      if (payment) {
        bookingBody.data.payment = payment;
      }

      const bookingRes = await fetch(`${DUFFEL_BASE_URL}/stays/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Duffel-Version': 'v2',
          Authorization: `Bearer ${DUFFEL_API_KEY}`
        },
        body: JSON.stringify(bookingBody)
      });

      if (!bookingRes.ok) {
        const errText = await bookingRes.text();
        console.error('Stays booking failed:', bookingRes.status, errText);
        return res.status(502).json({ ok: false, error: 'Unable to complete the booking.' });
      }

      const bookingData = await bookingRes.json();
      
      return res.json({
        ok: true,
        booking: bookingData.data,
      });

    } catch (err) {
      console.error('Duffel stays booking error:', err);
      return res.status(500).json({ ok: false, error: 'Stays booking failed.' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
