const crypto = require('crypto');
const { applyCors } = require('../lib/cors');
const { query, isDbConfigured, initDb } = require('../lib/db');

function clean(value, max = 200) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function bookingStore() {
  if (!global.__bc_event_bookings) global.__bc_event_bookings = new Map();
  return global.__bc_event_bookings;
}

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS bc_event_bookings (
      id SERIAL PRIMARY KEY,
      booking_ref TEXT NOT NULL UNIQUE,
      event_profile_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      venue_name TEXT NOT NULL,
      location TEXT DEFAULT '',
      banner_image TEXT DEFAULT '',
      ticket_id TEXT NOT NULL,
      ticket_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_amount NUMERIC(12,2) NOT NULL,
      total_amount NUMERIC(12,2) NOT NULL,
      currency TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      guest_email TEXT NOT NULL,
      guest_phone TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending_payment',
      ticket_no TEXT DEFAULT '',
      payment_method TEXT DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`ALTER TABLE bc_event_bookings ADD COLUMN IF NOT EXISTS banner_image TEXT DEFAULT ''`).catch(() => {});
  await query(`ALTER TABLE bc_event_bookings ADD COLUMN IF NOT EXISTS ticket_no TEXT DEFAULT ''`).catch(() => {});
  await query(`ALTER TABLE bc_event_bookings ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT ''`).catch(() => {});
}

async function loadEventProfile(eventId, dbReady) {
  if (dbReady) {
    const result = await query(
      `SELECT * FROM bc_event_profiles WHERE id::text = $1 AND status = 'approved' LIMIT 1`,
      [String(eventId)]
    );
    return result.rows[0] || null;
  }
  const profiles = global.__bc_event_profiles;
  if (!profiles) return null;
  for (const [, profile] of profiles) {
    if (String(profile.id) === String(eventId) && profile.status === 'approved') return profile;
  }
  return null;
}

function publicBooking(row) {
  const isConfirmed = (row.status || '').toLowerCase() === 'confirmed';
  const bookingRef = row.booking_ref || row.bookingRef;
  const ticketNo = row.ticket_no || row.ticketNo || (isConfirmed ? `TKT-${bookingRef}` : undefined);
  return {
    bookingRef,
    ticketNo,
    eventId: String(row.event_profile_id || row.eventId),
    eventName: row.event_name || row.eventName,
    venueName: row.venue_name || row.venueName,
    location: row.location,
    bannerImage: row.banner_image || row.bannerImage || '',
    ticketName: row.ticket_name || row.ticketName,
    quantity: Number(row.quantity),
    unitAmount: Number(row.unit_amount ?? row.unitAmount),
    total: Number(row.total_amount ?? row.total),
    currency: row.currency,
    clientName: row.guest_name || row.clientName,
    email: row.guest_email || row.email,
    phone: row.guest_phone || row.phone,
    status: row.status,
    paymentMethod: row.payment_method || row.paymentMethod || '',
    createdAt: row.created_at || row.createdAt,
  };
}

module.exports = async function eventBookingsHandler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let dbReady = false;
  try {
    if (isDbConfigured()) {
      await initDb();
      await ensureTable();
      dbReady = true;
    }
  } catch (error) {
    console.warn('[event-bookings] DB unavailable, using memory fallback:', error.message);
  }

  if (req.method === 'GET') {
    const ref = clean(req.query?.ref, 80);
    const email = clean(req.query?.email, 200).toLowerCase();

    if (email) {
      let rows = [];
      if (dbReady) {
        const result = await query(`SELECT * FROM bc_event_bookings WHERE LOWER(guest_email) = $1 ORDER BY created_at DESC`, [email]);
        rows = result.rows;
      } else {
        rows = Array.from(bookingStore().values()).filter((b) => (b.guest_email || b.guestEmail || b.email || '').toLowerCase() === email);
      }
      return res.json({ ok: true, bookings: rows.map(publicBooking) });
    }

    if (!ref) return res.status(400).json({ ok: false, error: 'Booking reference or email is required' });
    let booking = null;
    if (dbReady) {
      const result = await query(`SELECT * FROM bc_event_bookings WHERE booking_ref = $1 LIMIT 1`, [ref]);
      booking = result.rows[0] || null;
    } else {
      booking = bookingStore().get(ref) || null;
    }
    if (!booking) return res.status(404).json({ ok: false, error: 'Reservation not found' });
    return res.json({ ok: true, booking: publicBooking(booking) });
  }

  // Handle PATCH or POST with action === 'confirm_payment' or 'confirm'
  const action = clean(req.body?.action || req.query?.action, 40).toLowerCase();
  if (req.method === 'PATCH' || (req.method === 'POST' && (action === 'confirm_payment' || action === 'confirm'))) {
    const ref = clean(req.body?.bookingRef || req.query?.ref, 80);
    const paymentMethod = clean(req.body?.paymentMethod, 40) || 'card';
    if (!ref) return res.status(400).json({ ok: false, error: 'Booking reference is required' });

    let booking = null;
    if (dbReady) {
      const result = await query(`SELECT * FROM bc_event_bookings WHERE booking_ref = $1 LIMIT 1`, [ref]);
      booking = result.rows[0] || null;
    } else {
      booking = bookingStore().get(ref) || null;
    }

    if (!booking) return res.status(404).json({ ok: false, error: 'Reservation not found' });

    const generatedTicketNo = booking.ticket_no || booking.ticketNo || `TKT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    if (dbReady) {
      await query(
        `UPDATE bc_event_bookings SET status = 'confirmed', ticket_no = $1, payment_method = $2, updated_at = NOW() WHERE booking_ref = $3`,
        [generatedTicketNo, paymentMethod, ref]
      );
      booking.status = 'confirmed';
      booking.ticket_no = generatedTicketNo;
      booking.payment_method = paymentMethod;
    } else {
      booking.status = 'confirmed';
      booking.ticketNo = generatedTicketNo;
      booking.paymentMethod = paymentMethod;
      bookingStore().set(ref, booking);
    }

    return res.json({ ok: true, booking: publicBooking(booking) });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const eventId = clean(req.body?.eventId, 80);
  const ticketId = clean(req.body?.ticketId, 80);
  const guestName = clean(req.body?.guestName, 140);
  const guestEmail = clean(req.body?.guestEmail, 200).toLowerCase();
  const guestPhone = clean(req.body?.guestPhone, 60);
  const paymentMethod = clean(req.body?.paymentMethod, 40);
  const autoConfirm = Boolean(req.body?.autoConfirm || paymentMethod);
  const quantity = Math.min(10, Math.max(1, Number.parseInt(req.body?.quantity, 10) || 1));
  if (!eventId || !ticketId || guestName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return res.status(400).json({ ok: false, error: 'Choose a ticket and provide a valid guest name and email.' });
  }

  const profile = await loadEventProfile(eventId, dbReady);
  if (!profile) return res.status(404).json({ ok: false, error: 'This event is not available for booking.' });
  const tickets = Array.isArray(profile.step_tickets?.list) ? profile.step_tickets.list : [];
  const ticket = tickets.find((candidate, index) => String(candidate.id || `ticket_${index + 1}`) === ticketId);
  if (!ticket) return res.status(400).json({ ok: false, error: 'The selected ticket is no longer available.' });

  const unitAmount = Math.max(0, Number(ticket.price) || 0);
  const currency = /^[A-Z]{3}$/.test(String(ticket.currency || '').toUpperCase()) ? String(ticket.currency).toUpperCase() : 'USD';
  const bookingRef = `EVT-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const info = profile.step_event_info || {};
  const location = profile.step_location || {};

  const status = autoConfirm ? 'confirmed' : 'pending_payment';
  const ticketNo = autoConfirm ? `TKT-${crypto.randomBytes(4).toString('hex').toUpperCase()}` : '';

  const record = {
    bookingRef,
    ticketNo,
    eventId,
    eventName: clean(info.eventName, 160) || 'Local event',
    venueName: clean(info.eventName, 160) || 'Local event',
    location: [clean(location.address, 160), clean(location.city, 80), clean(location.country, 80)].filter(Boolean).join(', '),
    bannerImage: clean(profile.ticket_banner_image, 1000),
    ticketName: clean(ticket.name || ticket.type, 120) || 'Admission',
    quantity,
    unitAmount,
    total: unitAmount * quantity,
    currency,
    clientName: guestName,
    email: guestEmail,
    phone: guestPhone,
    status,
    paymentMethod: paymentMethod || (autoConfirm ? 'instant' : ''),
    createdAt: new Date().toISOString(),
  };

  if (dbReady) {
    await query(
      `INSERT INTO bc_event_bookings (booking_ref, event_profile_id, event_name, venue_name, location, banner_image, ticket_id, ticket_name, quantity, unit_amount, total_amount, currency, guest_name, guest_email, guest_phone, status, ticket_no, payment_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [bookingRef, eventId, record.eventName, record.venueName, record.location, record.bannerImage, ticketId, record.ticketName, quantity, unitAmount, record.total, currency, guestName, guestEmail, guestPhone, status, ticketNo, record.paymentMethod]
    );
  } else {
    bookingStore().set(bookingRef, record);
  }

  return res.status(201).json({ ok: true, booking: publicBooking(record) });
};
