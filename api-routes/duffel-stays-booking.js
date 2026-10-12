require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');
const { query, isDbConfigured } = require('../lib/db');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

function genBookingRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = 'BCS-';
  for (let i = 0; i < 7; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method === 'GET') {
    try {
      const { booking_id, limit, after, before } = req.query || {};
      
      // If no booking_id is provided, LIST bookings
      if (!booking_id) {
        if (!DUFFEL_API_KEY) return res.json({ ok: true, bookings: [], meta: {} });
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
          return res.json({ ok: true, bookings: [], meta: {} });
        }

        const listData = await listRes.json();
        return res.json({ ok: true, bookings: listData.data, meta: listData.meta });
      }

      // Single booking fetch
      if (String(booking_id).startsWith('bcs_') || String(booking_id).startsWith('local_')) {
        return res.json({
          ok: true,
          booking: {
            id: booking_id,
            status: 'confirmed',
            reference: genBookingRef()
          }
        });
      }

      if (!DUFFEL_API_KEY) {
        return res.status(503).json({ ok: false, error: 'Stays API is not configured' });
      }

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

      // Cancel a booking
      if (action === 'cancel') {
        if (!booking_id) {
          return res.status(400).json({ ok: false, error: 'Missing booking_id for cancellation' });
        }

        if (String(booking_id).startsWith('bcs_') || String(booking_id).startsWith('local_')) {
          return res.json({ ok: true, booking: { id: booking_id, status: 'cancelled' } });
        }

        if (!DUFFEL_API_KEY) {
          return res.status(503).json({ ok: false, error: 'Stays API is not configured' });
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
        return res.json({ ok: true, booking: cancelData.data });
      }

      // Create a booking
      if (!quote_id || !guests || !email || !phone_number) {
        return res.status(400).json({ ok: false, error: 'Missing required booking fields' });
      }

      const isLocalQuote = String(quote_id).includes('local') || String(quote_id).includes('pending') || String(quote_id).startsWith('quo_dummy');

      if (isLocalQuote) {
        const ref = genBookingRef();
        const mainGuest = (guests && guests[0]) || {};
        const guestName = `${mainGuest.given_name || 'Guest'} ${mainGuest.family_name || ''}`.trim();
        const bookingId = `bcs_${Date.now()}`;

        // Attempt to insert into bc_pms_bookings if DB is ready
        try {
          if (isDbConfigured()) {
            await query(`
              INSERT INTO bc_pms_bookings (ref, hotel_profile_id, room_id, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, booking_status, payment_status, total_amount, source)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed', 'paid', $10, 'bookingcart_web')
            `, [
              ref, 1, 1, guestName, email, phone_number,
              new Date().toISOString().split('T')[0],
              new Date(Date.now() + 86400000).toISOString().split('T')[0],
              guests.length || 1,
              payment?.amount || 0
            ]).catch(e => console.warn('[Stays PMS booking insert notice]:', e.message));
          }
        } catch {}

        return res.json({
          ok: true,
          booking: {
            id: bookingId,
            reference: ref,
            status: 'confirmed',
            email,
            phone_number,
            guests,
            created_at: new Date().toISOString()
          }
        });
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
