require('dotenv').config();
const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');
const { query, isDbConfigured, initDb } = require('../lib/db');

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
        // 1. Fetch from local bc_pms_bookings DB
        let localBookings = [];
        try {
          if (isDbConfigured()) {
            await initDb();
            // Attempt to get the caller's email from query param for filtering
            const callerEmail = req.query.email || req.query.guest_email || null;
            let dbQ = `SELECT * FROM bc_pms_bookings ORDER BY created_at DESC LIMIT 100`;
            const dbParams = [];
            if (callerEmail) {
              dbQ = `SELECT * FROM bc_pms_bookings WHERE LOWER(guest_email) = $1 ORDER BY created_at DESC LIMIT 100`;
              dbParams.push(callerEmail.toLowerCase().trim());
            }
            const dbRes = await query(dbQ, dbParams).catch(() => ({ rows: [] }));
            localBookings = (dbRes.rows || []).map(row => {
              const accName = row.accommodation_name || row.notes || 'Stay Property';
              const accImage = row.accommodation_image || null;
              return {
                id: `pms_${row.id}`,
                reference: row.ref,
                status: row.booking_status || 'confirmed',
                email: row.guest_email,
                check_in_date: row.check_in,
                check_out_date: row.check_out,
                total_amount: String(row.total_amount || 0),
                total_currency: row.currency || 'USD',
                guests: [{ given_name: (row.guest_name || 'Guest').split(' ')[0], family_name: (row.guest_name || '').split(' ').slice(1).join(' ') }],
                accommodation: {
                  name: accName,
                  photos: accImage ? [{ url: accImage }] : [],
                },
                accommodation_name: accName,
                accommodation_image: accImage,
                _source: 'pms'
              };
            });
          }
        } catch (dbErr) {
          console.warn('[stays-booking] Local DB query failed:', dbErr.message);
        }

        // 2. Fetch from Duffel API if key is configured
        let duffelBookings = [];
        let duffelMeta = {};
        if (DUFFEL_API_KEY) {
          try {
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

            if (listRes.ok) {
              const listData = await listRes.json();
              duffelBookings = listData.data || [];
              duffelMeta = listData.meta || {};
            }
          } catch (dufErr) {
            console.warn('[stays-booking] Duffel list failed:', dufErr.message);
          }
        }

        // Merge: local PMS first, then Duffel (dedup by reference)
        const seenRefs = new Set(duffelBookings.map(b => b.reference).filter(Boolean));
        const dedupedLocal = localBookings.filter(b => !seenRefs.has(b.reference));
        const merged = [...dedupedLocal, ...duffelBookings];

        return res.json({ ok: true, bookings: merged, meta: duffelMeta });
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
        const totalAmount = payment?.amount || req.body.total_amount || 0;
        const checkIn = req.body.check_in_date || new Date().toISOString().split('T')[0];
        const checkOut = req.body.check_out_date || new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const accommodation = req.body.accommodation || { name: 'Hotel' };
        const currency = req.body.currency || 'USD';
        const rooms = req.body.rooms || [];
        const hotelProfileId = req.body.hotel_profile_id || 1;
        const roomId = req.body.room_id || 1;

        const accommodationName = accommodation?.name || 'Hotel';
        const accommodationImage = accommodation?.photos?.[0]?.url || '';

        // Persist booking into bc_pms_bookings
        try {
          if (isDbConfigured()) {
            await initDb();
            // Ensure table exists (it's normally created by PMS handler, but guest checkout may run first)
            await query(`
              CREATE TABLE IF NOT EXISTS bc_pms_bookings (
                id SERIAL PRIMARY KEY,
                ref TEXT NOT NULL UNIQUE,
                hotel_profile_id INTEGER NOT NULL,
                room_id INTEGER NOT NULL,
                floor_id INTEGER,
                guest_name TEXT NOT NULL,
                guest_email TEXT NOT NULL,
                guest_phone TEXT DEFAULT '',
                check_in DATE NOT NULL,
                check_out DATE NOT NULL,
                num_guests INTEGER DEFAULT 1,
                booking_status TEXT DEFAULT 'pending',
                payment_status TEXT DEFAULT 'pending',
                amount_paid NUMERIC(10,2) DEFAULT 0,
                total_amount NUMERIC(10,2) DEFAULT 0,
                remaining_balance NUMERIC(10,2) DEFAULT 0,
                special_requests TEXT DEFAULT '',
                confirmation_sent BOOLEAN DEFAULT FALSE,
                notes TEXT DEFAULT '',
                source TEXT DEFAULT 'direct',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
              )
            `).catch(() => {});
            // Add accommodation columns if missing (safe for existing tables)
            await query(`ALTER TABLE bc_pms_bookings ADD COLUMN IF NOT EXISTS accommodation_name TEXT DEFAULT ''`).catch(() => {});
            await query(`ALTER TABLE bc_pms_bookings ADD COLUMN IF NOT EXISTS accommodation_image TEXT DEFAULT ''`).catch(() => {});
            await query(`ALTER TABLE bc_pms_bookings ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD'`).catch(() => {});
            await query(`
              INSERT INTO bc_pms_bookings (ref, hotel_profile_id, room_id, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, booking_status, payment_status, total_amount, source, accommodation_name, accommodation_image, currency)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed', 'paid', $10, 'bookingcart_web', $11, $12, $13)
              ON CONFLICT (ref) DO NOTHING
            `, [
              ref, hotelProfileId, roomId, guestName, email, phone_number,
              checkIn,
              checkOut,
              guests.length || 1,
              totalAmount,
              accommodationName,
              accommodationImage,
              currency
            ]);
            console.log('[Stays] Booking persisted to bc_pms_bookings:', ref, '- Hotel:', accommodationName);
          }
        } catch (dbErr) {
          console.warn('[Stays PMS booking insert failed]:', dbErr.message);
        }

        return res.json({
          ok: true,
          booking: {
            id: bookingId,
            reference: ref,
            status: 'confirmed',
            email,
            phone_number,
            guests,
            accommodation,
            check_in_date: checkIn,
            check_out_date: checkOut,
            total_amount: String(totalAmount),
            currency,
            rooms,
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
