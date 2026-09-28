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
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`ALTER TABLE bc_event_bookings ADD COLUMN IF NOT EXISTS banner_image TEXT DEFAULT ''`);
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
  return {
    bookingRef: row.booking_ref || row.bookingRef,
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
    if (!ref) return res.status(400).json({ ok: false, error: 'Booking reference is required' });
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

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const eventId = clean(req.body?.eventId, 80);
  const ticketId = clean(req.body?.ticketId, 80);
  const guestName = clean(req.body?.guestName, 140);
  const guestEmail = clean(req.body?.guestEmail, 200).toLowerCase();
  const guestPhone = clean(req.body?.guestPhone, 60);
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
  const record = {
    bookingRef,
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
    status: 'pending_payment',
    createdAt: new Date().toISOString(),
  };

  if (dbReady) {
    await query(
      `INSERT INTO bc_event_bookings (booking_ref, event_profile_id, event_name, venue_name, location, banner_image, ticket_id, ticket_name, quantity, unit_amount, total_amount, currency, guest_name, guest_email, guest_phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending_payment')`,
      [bookingRef, eventId, record.eventName, record.venueName, record.location, record.bannerImage, ticketId, record.ticketName, quantity, unitAmount, record.total, currency, guestName, guestEmail, guestPhone]
    );
  } else {
    bookingStore().set(bookingRef, record);
  }

  return res.status(201).json({ ok: true, booking: publicBooking(record) });
};
