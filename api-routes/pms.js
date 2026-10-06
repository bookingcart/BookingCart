// api-routes/pms.js
// Property Management System (PMS) for Hotel Dashboard
// Manages: floors, rooms, bookings, availability, blocking, reports
// All actions use: POST { action, ...params } with Bearer token auth

const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { verifyRequestBearer } = require('../lib/google-verify');

// ─── In-Memory Fallback Store ─────────────────────────────────────────────────
function memStore(key) {
  if (!global.__bc_pms) global.__bc_pms = {};
  if (!global.__bc_pms[key]) global.__bc_pms[key] = new Map();
  return global.__bc_pms[key];
}
function nextId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function nowIso() { return new Date().toISOString(); }

// ─── DB Table Creation ────────────────────────────────────────────────────────
async function ensureTables() {
  // Floors
  await query(`
    CREATE TABLE IF NOT EXISTS bc_pms_floors (
      id SERIAL PRIMARY KEY,
      hotel_profile_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `).catch(() => {});

  // Rooms
  await query(`
    CREATE TABLE IF NOT EXISTS bc_pms_rooms (
      id SERIAL PRIMARY KEY,
      hotel_profile_id INTEGER NOT NULL,
      floor_id INTEGER,
      room_number TEXT NOT NULL,
      room_type TEXT DEFAULT 'Standard',
      bed_type TEXT DEFAULT 'Queen',
      capacity INTEGER DEFAULT 2,
      base_price NUMERIC(10,2) DEFAULT 0,
      seasonal_price NUMERIC(10,2),
      currency TEXT DEFAULT 'USD',
      amenities JSONB DEFAULT '[]',
      images JSONB DEFAULT '[]',
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'available',
      size_sqm INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `).catch(() => {});

  // Bookings (PMS-native stays bookings)
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

  // Room Blocks (manual blocking)
  await query(`
    CREATE TABLE IF NOT EXISTS bc_pms_blocks (
      id SERIAL PRIMARY KEY,
      hotel_profile_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      from_date DATE NOT NULL,
      to_date DATE NOT NULL,
      reason TEXT DEFAULT 'blocked',
      notes TEXT DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `).catch(() => {});
}

// ─── Booking Reference Generator ─────────────────────────────────────────────
function genRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = 'PMS-';
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

// ─── Availability Checker ─────────────────────────────────────────────────────
async function checkRoomAvailability(dbReady, roomId, checkIn, checkOut, excludeBookingId = null) {
  // Check bookings
  if (dbReady) {
    let q = `
      SELECT id FROM bc_pms_bookings
      WHERE room_id = $1
        AND booking_status NOT IN ('cancelled', 'checked_out', 'no_show')
        AND check_in < $3
        AND check_out > $2
    `;
    const params = [roomId, checkIn, checkOut];
    if (excludeBookingId) {
      q += ` AND id != $4`;
      params.push(excludeBookingId);
    }
    const r = await query(q, params);
    if (r.rows.length > 0) return { available: false, reason: 'booked' };

    // Check blocks
    const b = await query(`
      SELECT id FROM bc_pms_blocks
      WHERE room_id = $1 AND from_date < $3 AND to_date > $2
    `, [roomId, checkIn, checkOut]);
    if (b.rows.length > 0) return { available: false, reason: 'blocked' };
  } else {
    const bookings = memStore('bookings');
    const blocks = memStore('blocks');
    const ci = new Date(checkIn), co = new Date(checkOut);
    for (const [, b] of bookings) {
      if (String(b.room_id) !== String(roomId)) continue;
      if (['cancelled', 'checked_out', 'no_show'].includes(b.booking_status)) continue;
      if (excludeBookingId && String(b.id) === String(excludeBookingId)) continue;
      const bci = new Date(b.check_in), bco = new Date(b.check_out);
      if (ci < bco && co > bci) return { available: false, reason: 'booked' };
    }
    for (const [, bl] of blocks) {
      if (String(bl.room_id) !== String(roomId)) continue;
      const fd = new Date(bl.from_date), td = new Date(bl.to_date);
      if (ci < td && co > fd) return { available: false, reason: 'blocked' };
    }
  }
  return { available: true };
}

// ─── Auth helper — get hotel_profile_id for current user ─────────────────────
async function getHotelProfileId(dbReady, auth) {
  if (dbReady) {
    const r = await query(
      `SELECT id FROM bc_hotel_profiles WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
      [auth.email]
    );
    return r.rows.length ? r.rows[0].id : null;
  }
  // In-memory: just use email as key
  return auth.email;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let dbReady = false;
  try {
    if (isDbConfigured()) {
      await initDb();
      await ensureTables();
      dbReady = true;
    }
  } catch (err) {
    console.warn('[pms] DB unavailable, using memory fallback:', err.message);
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Auth
  const auth = await verifyRequestBearer(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

  const hotelId = await getHotelProfileId(dbReady, auth);
  if (!hotelId) return res.status(404).json({ ok: false, error: 'No hotel profile found. Please complete onboarding first.' });

  const body = req.method === 'GET' ? req.query : (req.body || {});
  const { action } = body;

  // ══════════════════════════════════════════════════════════════════════════════
  // FLOOR ACTIONS
  // ══════════════════════════════════════════════════════════════════════════════

  if (action === 'list-floors') {
    if (dbReady) {
      const r = await query(
        `SELECT f.*, COUNT(rm.id) as room_count
         FROM bc_pms_floors f
         LEFT JOIN bc_pms_rooms rm ON rm.floor_id = f.id
         WHERE f.hotel_profile_id = $1
         GROUP BY f.id ORDER BY f.sort_order, f.id`,
        [hotelId]
      );
      return res.json({ ok: true, floors: r.rows });
    } else {
      const floors = [];
      for (const [, f] of memStore('floors')) {
        if (String(f.hotel_profile_id) === String(hotelId)) floors.push(f);
      }
      return res.json({ ok: true, floors: floors.sort((a, b) => a.sort_order - b.sort_order) });
    }
  }

  if (action === 'add-floor') {
    const { name, sort_order = 0 } = body;
    if (!name) return res.status(400).json({ ok: false, error: 'Floor name required' });
    if (dbReady) {
      const r = await query(
        `INSERT INTO bc_pms_floors (hotel_profile_id, name, sort_order) VALUES ($1,$2,$3) RETURNING *`,
        [hotelId, name, sort_order]
      );
      return res.json({ ok: true, floor: r.rows[0] });
    } else {
      const id = nextId();
      const floor = { id, hotel_profile_id: hotelId, name, sort_order, created_at: nowIso(), updated_at: nowIso() };
      memStore('floors').set(id, floor);
      return res.json({ ok: true, floor });
    }
  }

  if (action === 'edit-floor') {
    const { floor_id, name, sort_order } = body;
    if (!floor_id) return res.status(400).json({ ok: false, error: 'floor_id required' });
    if (dbReady) {
      const updates = [];
      const params = [];
      if (name) { updates.push(`name = $${params.length + 1}`); params.push(name); }
      if (sort_order !== undefined) { updates.push(`sort_order = $${params.length + 1}`); params.push(sort_order); }
      if (!updates.length) return res.status(400).json({ ok: false, error: 'Nothing to update' });
      updates.push(`updated_at = NOW()`);
      params.push(floor_id, hotelId);
      const r = await query(
        `UPDATE bc_pms_floors SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND hotel_profile_id = $${params.length} RETURNING *`,
        params
      );
      return res.json({ ok: true, floor: r.rows[0] || null });
    } else {
      const store = memStore('floors');
      const floor = store.get(floor_id);
      if (!floor || String(floor.hotel_profile_id) !== String(hotelId)) return res.status(404).json({ ok: false, error: 'Floor not found' });
      if (name) floor.name = name;
      if (sort_order !== undefined) floor.sort_order = sort_order;
      floor.updated_at = nowIso();
      store.set(floor_id, floor);
      return res.json({ ok: true, floor });
    }
  }

  if (action === 'delete-floor') {
    const { floor_id } = body;
    if (!floor_id) return res.status(400).json({ ok: false, error: 'floor_id required' });
    if (dbReady) {
      // Move rooms to null floor
      await query(`UPDATE bc_pms_rooms SET floor_id = NULL WHERE floor_id = $1 AND hotel_profile_id = $2`, [floor_id, hotelId]);
      await query(`DELETE FROM bc_pms_floors WHERE id = $1 AND hotel_profile_id = $2`, [floor_id, hotelId]);
    } else {
      for (const [, r] of memStore('rooms')) {
        if (String(r.floor_id) === String(floor_id)) r.floor_id = null;
      }
      memStore('floors').delete(floor_id);
    }
    return res.json({ ok: true });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ROOM ACTIONS
  // ══════════════════════════════════════════════════════════════════════════════

  if (action === 'list-rooms') {
    if (dbReady) {
      const r = await query(
        `SELECT r.*, f.name as floor_name FROM bc_pms_rooms r
         LEFT JOIN bc_pms_floors f ON f.id = r.floor_id
         WHERE r.hotel_profile_id = $1 ORDER BY f.sort_order NULLS LAST, r.room_number`,
        [hotelId]
      );
      return res.json({ ok: true, rooms: r.rows });
    } else {
      const rooms = [];
      const floors = memStore('floors');
      for (const [, r] of memStore('rooms')) {
        if (String(r.hotel_profile_id) === String(hotelId)) {
          const floor = r.floor_id ? floors.get(r.floor_id) : null;
          rooms.push({ ...r, floor_name: floor?.name || null });
        }
      }
      return res.json({ ok: true, rooms });
    }
  }

  if (action === 'add-room') {
    const { floor_id, room_number, room_type, bed_type, capacity, base_price, seasonal_price, currency, amenities, images, description, size_sqm } = body;
    if (!room_number) return res.status(400).json({ ok: false, error: 'room_number required' });
    if (dbReady) {
      const r = await query(
        `INSERT INTO bc_pms_rooms (hotel_profile_id, floor_id, room_number, room_type, bed_type, capacity, base_price, seasonal_price, currency, amenities, images, description, size_sqm)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [hotelId, floor_id || null, room_number, room_type || 'Standard', bed_type || 'Queen',
         capacity || 2, base_price || 0, seasonal_price || null, currency || 'USD',
         JSON.stringify(amenities || []), JSON.stringify(images || []), description || '', size_sqm || null]
      );
      return res.json({ ok: true, room: r.rows[0] });
    } else {
      const id = nextId();
      const room = { id, hotel_profile_id: hotelId, floor_id: floor_id || null, room_number, room_type: room_type || 'Standard', bed_type: bed_type || 'Queen', capacity: capacity || 2, base_price: base_price || 0, seasonal_price: seasonal_price || null, currency: currency || 'USD', amenities: amenities || [], images: images || [], description: description || '', size_sqm: size_sqm || null, status: 'available', created_at: nowIso(), updated_at: nowIso() };
      memStore('rooms').set(id, room);
      return res.json({ ok: true, room });
    }
  }

  if (action === 'edit-room') {
    const { room_id, ...updates } = body;
    if (!room_id) return res.status(400).json({ ok: false, error: 'room_id required' });
    const allowed = ['floor_id', 'room_number', 'room_type', 'bed_type', 'capacity', 'base_price', 'seasonal_price', 'currency', 'amenities', 'images', 'description', 'status', 'size_sqm'];
    if (dbReady) {
      const cols = [], params = [];
      for (const key of allowed) {
        if (updates[key] !== undefined) {
          cols.push(`${key} = $${params.length + 1}`);
          params.push(typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : updates[key]);
        }
      }
      if (!cols.length) return res.status(400).json({ ok: false, error: 'Nothing to update' });
      cols.push('updated_at = NOW()');
      params.push(room_id, hotelId);
      const r = await query(
        `UPDATE bc_pms_rooms SET ${cols.join(', ')} WHERE id = $${params.length - 1} AND hotel_profile_id = $${params.length} RETURNING *`,
        params
      );
      return res.json({ ok: true, room: r.rows[0] || null });
    } else {
      const store = memStore('rooms');
      const room = store.get(room_id);
      if (!room || String(room.hotel_profile_id) !== String(hotelId)) return res.status(404).json({ ok: false, error: 'Room not found' });
      for (const key of allowed) {
        if (updates[key] !== undefined) room[key] = updates[key];
      }
      room.updated_at = nowIso();
      store.set(room_id, room);
      return res.json({ ok: true, room });
    }
  }

  if (action === 'delete-room') {
    const { room_id } = body;
    if (!room_id) return res.status(400).json({ ok: false, error: 'room_id required' });
    if (dbReady) {
      await query(`DELETE FROM bc_pms_rooms WHERE id = $1 AND hotel_profile_id = $2`, [room_id, hotelId]);
    } else {
      memStore('rooms').delete(room_id);
    }
    return res.json({ ok: true });
  }

  if (action === 'move-room-floor') {
    const { room_id, new_floor_id } = body;
    if (!room_id) return res.status(400).json({ ok: false, error: 'room_id required' });
    if (dbReady) {
      await query(`UPDATE bc_pms_rooms SET floor_id = $1, updated_at = NOW() WHERE id = $2 AND hotel_profile_id = $3`, [new_floor_id || null, room_id, hotelId]);
    } else {
      const room = memStore('rooms').get(room_id);
      if (room) { room.floor_id = new_floor_id || null; room.updated_at = nowIso(); }
    }
    return res.json({ ok: true });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // BOOKING ACTIONS
  // ══════════════════════════════════════════════════════════════════════════════

  if (action === 'list-bookings') {
    const { status_filter, date_from, date_to } = body;
    if (dbReady) {
      let q = `
        SELECT b.*, r.room_number, r.room_type, f.name as floor_name
        FROM bc_pms_bookings b
        LEFT JOIN bc_pms_rooms r ON r.id = b.room_id
        LEFT JOIN bc_pms_floors f ON f.id = b.floor_id
        WHERE b.hotel_profile_id = $1
      `;
      const params = [hotelId];
      if (status_filter && status_filter !== 'all') {
        params.push(status_filter);
        q += ` AND b.booking_status = $${params.length}`;
      }
      if (date_from) { params.push(date_from); q += ` AND b.check_in >= $${params.length}`; }
      if (date_to)   { params.push(date_to);   q += ` AND b.check_out <= $${params.length}`; }
      q += ` ORDER BY b.created_at DESC LIMIT 200`;
      const r = await query(q, params);
      return res.json({ ok: true, bookings: r.rows });
    } else {
      const bookings = [];
      for (const [, b] of memStore('bookings')) {
        if (String(b.hotel_profile_id) !== String(hotelId)) continue;
        if (status_filter && status_filter !== 'all' && b.booking_status !== status_filter) continue;
        bookings.push(b);
      }
      return res.json({ ok: true, bookings: bookings.sort((a, b) => b.created_at > a.created_at ? 1 : -1) });
    }
  }

  if (action === 'create-booking') {
    const { room_id, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, total_amount, special_requests, source } = body;
    if (!room_id || !guest_name || !guest_email || !check_in || !check_out) {
      return res.status(400).json({ ok: false, error: 'room_id, guest_name, guest_email, check_in, check_out are required' });
    }

    const avail = await checkRoomAvailability(dbReady, room_id, check_in, check_out);
    if (!avail.available) {
      return res.status(409).json({ ok: false, error: `Room is unavailable for selected dates (${avail.reason})`, reason: avail.reason });
    }

    const ref = genRef();
    let floor_id = null;
    if (dbReady) {
      const rr = await query(`SELECT floor_id FROM bc_pms_rooms WHERE id = $1`, [room_id]);
      floor_id = rr.rows[0]?.floor_id || null;
    } else {
      floor_id = memStore('rooms').get(room_id)?.floor_id || null;
    }

    const nights = Math.max(1, Math.round((new Date(check_out) - new Date(check_in)) / 86400000));
    const total = total_amount || 0;
    const remaining = total;

    if (dbReady) {
      const r = await query(
        `INSERT INTO bc_pms_bookings (ref, hotel_profile_id, room_id, floor_id, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, booking_status, payment_status, total_amount, remaining_balance, special_requests, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending','pending',$11,$12,$13,$14) RETURNING *`,
        [ref, hotelId, room_id, floor_id, guest_name, guest_email, guest_phone || '', check_in, check_out, num_guests || 1, total, remaining, special_requests || '', source || 'direct']
      );
      return res.json({ ok: true, booking: r.rows[0], ref });
    } else {
      const id = nextId();
      const booking = { id, ref, hotel_profile_id: hotelId, room_id, floor_id, guest_name, guest_email, guest_phone: guest_phone || '', check_in, check_out, num_guests: num_guests || 1, booking_status: 'pending', payment_status: 'pending', amount_paid: 0, total_amount: total, remaining_balance: remaining, special_requests: special_requests || '', source: source || 'direct', confirmation_sent: false, created_at: nowIso(), updated_at: nowIso() };
      memStore('bookings').set(id, booking);
      return res.json({ ok: true, booking, ref });
    }
  }

  if (action === 'update-booking-status') {
    const { booking_id, booking_status, payment_status, amount_paid, notes } = body;
    if (!booking_id) return res.status(400).json({ ok: false, error: 'booking_id required' });

    const validBookingStatuses = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
    const validPaymentStatuses = ['pending', 'partially_paid', 'paid', 'refunded'];
    if (booking_status && !validBookingStatuses.includes(booking_status)) {
      return res.status(400).json({ ok: false, error: `Invalid booking_status: ${booking_status}` });
    }

    if (dbReady) {
      const cols = [], params = [];
      if (booking_status) { cols.push(`booking_status = $${params.length+1}`); params.push(booking_status); }
      if (payment_status) { cols.push(`payment_status = $${params.length+1}`); params.push(payment_status); }
      if (amount_paid !== undefined) {
        cols.push(`amount_paid = $${params.length+1}`); params.push(amount_paid);
        cols.push(`remaining_balance = GREATEST(0, total_amount - $${params.length})`); params.push(amount_paid);
      }
      if (notes) { cols.push(`notes = $${params.length+1}`); params.push(notes); }
      cols.push('updated_at = NOW()');
      params.push(booking_id, hotelId);
      const r = await query(
        `UPDATE bc_pms_bookings SET ${cols.join(', ')} WHERE id = $${params.length-1} AND hotel_profile_id = $${params.length} RETURNING *`,
        params
      );
      return res.json({ ok: true, booking: r.rows[0] || null });
    } else {
      const store = memStore('bookings');
      const booking = store.get(booking_id);
      if (!booking || String(booking.hotel_profile_id) !== String(hotelId)) {
        return res.status(404).json({ ok: false, error: 'Booking not found' });
      }
      if (booking_status) booking.booking_status = booking_status;
      if (payment_status) booking.payment_status = payment_status;
      if (amount_paid !== undefined) {
        booking.amount_paid = amount_paid;
        booking.remaining_balance = Math.max(0, booking.total_amount - amount_paid);
      }
      if (notes) booking.notes = notes;
      booking.updated_at = nowIso();
      store.set(booking_id, booking);
      return res.json({ ok: true, booking });
    }
  }

  if (action === 'get-booking') {
    const { booking_id, ref } = body;
    let booking = null;
    if (dbReady) {
      let r;
      if (booking_id) {
        r = await query(`SELECT b.*, r.room_number, r.room_type, r.base_price, f.name as floor_name FROM bc_pms_bookings b LEFT JOIN bc_pms_rooms r ON r.id = b.room_id LEFT JOIN bc_pms_floors f ON f.id = b.floor_id WHERE b.id = $1 AND b.hotel_profile_id = $2`, [booking_id, hotelId]);
      } else if (ref) {
        r = await query(`SELECT b.*, r.room_number, r.room_type, r.base_price, f.name as floor_name FROM bc_pms_bookings b LEFT JOIN bc_pms_rooms r ON r.id = b.room_id LEFT JOIN bc_pms_floors f ON f.id = b.floor_id WHERE b.ref = $1 AND b.hotel_profile_id = $2`, [ref, hotelId]);
      }
      booking = r?.rows[0] || null;
    } else {
      for (const [, b] of memStore('bookings')) {
        if (String(b.hotel_profile_id) !== String(hotelId)) continue;
        if ((booking_id && String(b.id) === String(booking_id)) || (ref && b.ref === ref)) {
          booking = b; break;
        }
      }
    }
    if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
    return res.json({ ok: true, booking });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ROOM BLOCKING
  // ══════════════════════════════════════════════════════════════════════════════

  if (action === 'block-room') {
    const { room_id, from_date, to_date, reason, notes } = body;
    if (!room_id || !from_date || !to_date) return res.status(400).json({ ok: false, error: 'room_id, from_date, to_date required' });
    if (dbReady) {
      const r = await query(
        `INSERT INTO bc_pms_blocks (hotel_profile_id, room_id, from_date, to_date, reason, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [hotelId, room_id, from_date, to_date, reason || 'blocked', notes || '']
      );
      return res.json({ ok: true, block: r.rows[0] });
    } else {
      const id = nextId();
      const block = { id, hotel_profile_id: hotelId, room_id, from_date, to_date, reason: reason || 'blocked', notes: notes || '', created_at: nowIso() };
      memStore('blocks').set(id, block);
      return res.json({ ok: true, block });
    }
  }

  if (action === 'list-blocks') {
    if (dbReady) {
      const r = await query(`SELECT bl.*, r.room_number FROM bc_pms_blocks bl LEFT JOIN bc_pms_rooms r ON r.id = bl.room_id WHERE bl.hotel_profile_id = $1 ORDER BY bl.from_date DESC`, [hotelId]);
      return res.json({ ok: true, blocks: r.rows });
    } else {
      const blocks = [];
      for (const [, b] of memStore('blocks')) {
        if (String(b.hotel_profile_id) === String(hotelId)) blocks.push(b);
      }
      return res.json({ ok: true, blocks });
    }
  }

  if (action === 'delete-block') {
    const { block_id } = body;
    if (!block_id) return res.status(400).json({ ok: false, error: 'block_id required' });
    if (dbReady) {
      await query(`DELETE FROM bc_pms_blocks WHERE id = $1 AND hotel_profile_id = $2`, [block_id, hotelId]);
    } else {
      memStore('blocks').delete(block_id);
    }
    return res.json({ ok: true });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // AVAILABILITY CHECK
  // ══════════════════════════════════════════════════════════════════════════════

  if (action === 'check-availability') {
    const { room_id, check_in, check_out } = body;
    if (!room_id || !check_in || !check_out) return res.status(400).json({ ok: false, error: 'room_id, check_in, check_out required' });
    const result = await checkRoomAvailability(dbReady, room_id, check_in, check_out);
    return res.json({ ok: true, ...result });
  }

  // Bulk availability for calendar
  if (action === 'calendar-data') {
    const { month, year } = body;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();
    const from = `${y}-${String(m).padStart(2,'0')}-01`;
    const to = `${y}-${String(m + 1 > 12 ? 1 : m + 1).padStart(2,'0')}-01`;

    let rooms = [], bookings = [], blocks = [];
    if (dbReady) {
      const rr = await query(`SELECT r.*, f.name as floor_name FROM bc_pms_rooms r LEFT JOIN bc_pms_floors f ON f.id = r.floor_id WHERE r.hotel_profile_id = $1 ORDER BY f.sort_order NULLS LAST, r.room_number`, [hotelId]);
      rooms = rr.rows;
      const rb = await query(`SELECT * FROM bc_pms_bookings WHERE hotel_profile_id = $1 AND booking_status NOT IN ('cancelled','no_show') AND check_in < $2 AND check_out > $3`, [hotelId, to, from]);
      bookings = rb.rows;
      const bl = await query(`SELECT * FROM bc_pms_blocks WHERE hotel_profile_id = $1 AND from_date < $2 AND to_date > $3`, [hotelId, to, from]);
      blocks = bl.rows;
    } else {
      for (const [, r] of memStore('rooms')) {
        if (String(r.hotel_profile_id) === String(hotelId)) rooms.push(r);
      }
      for (const [, b] of memStore('bookings')) {
        if (String(b.hotel_profile_id) !== String(hotelId)) continue;
        if (['cancelled','no_show'].includes(b.booking_status)) continue;
        if (b.check_in < to && b.check_out > from) bookings.push(b);
      }
      for (const [, bl] of memStore('blocks')) {
        if (String(bl.hotel_profile_id) === String(hotelId) && bl.from_date < to && bl.to_date > from) blocks.push(bl);
      }
    }
    return res.json({ ok: true, rooms, bookings, blocks, month: m, year: y });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DASHBOARD STATS
  // ══════════════════════════════════════════════════════════════════════════════

  if (action === 'dashboard-stats') {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    let stats = { total_rooms: 0, available_rooms: 0, occupied_rooms: 0, total_bookings: 0, pending_bookings: 0, confirmed_bookings: 0, todays_checkins: 0, todays_checkouts: 0, revenue_total: 0, revenue_month: 0 };

    if (dbReady) {
      const [rooms, bookings, revenue] = await Promise.all([
        query(`SELECT status, COUNT(*) as count FROM bc_pms_rooms WHERE hotel_profile_id = $1 GROUP BY status`, [hotelId]),
        query(`SELECT booking_status, COUNT(*) as count FROM bc_pms_bookings WHERE hotel_profile_id = $1 GROUP BY booking_status`, [hotelId]),
        query(`SELECT SUM(amount_paid) as total, SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) THEN amount_paid ELSE 0 END) as month FROM bc_pms_bookings WHERE hotel_profile_id = $1 AND booking_status NOT IN ('cancelled','no_show')`, [hotelId]),
      ]);
      for (const r of rooms.rows) {
        stats.total_rooms += parseInt(r.count);
        if (r.status === 'available') stats.available_rooms = parseInt(r.count);
        if (r.status === 'occupied') stats.occupied_rooms = parseInt(r.count);
      }
      for (const r of bookings.rows) {
        stats.total_bookings += parseInt(r.count);
        if (r.booking_status === 'pending') stats.pending_bookings = parseInt(r.count);
        if (r.booking_status === 'confirmed') stats.confirmed_bookings = parseInt(r.count);
      }
      stats.revenue_total = parseFloat(revenue.rows[0]?.total || 0);
      stats.revenue_month = parseFloat(revenue.rows[0]?.month || 0);

      const ci = await query(`SELECT COUNT(*) as count FROM bc_pms_bookings WHERE hotel_profile_id = $1 AND check_in = $2 AND booking_status IN ('confirmed','pending')`, [hotelId, today]);
      const co = await query(`SELECT COUNT(*) as count FROM bc_pms_bookings WHERE hotel_profile_id = $1 AND check_out = $2 AND booking_status = 'checked_in'`, [hotelId, today]);
      stats.todays_checkins = parseInt(ci.rows[0]?.count || 0);
      stats.todays_checkouts = parseInt(co.rows[0]?.count || 0);
    } else {
      for (const [, r] of memStore('rooms')) {
        if (String(r.hotel_profile_id) !== String(hotelId)) continue;
        stats.total_rooms++;
        if (r.status === 'available') stats.available_rooms++;
        if (r.status === 'occupied') stats.occupied_rooms++;
      }
      for (const [, b] of memStore('bookings')) {
        if (String(b.hotel_profile_id) !== String(hotelId)) continue;
        stats.total_bookings++;
        if (b.booking_status === 'pending') stats.pending_bookings++;
        if (b.booking_status === 'confirmed') stats.confirmed_bookings++;
        if (b.check_in === today && ['confirmed','pending'].includes(b.booking_status)) stats.todays_checkins++;
        if (b.check_out === today && b.booking_status === 'checked_in') stats.todays_checkouts++;
        if (!['cancelled','no_show'].includes(b.booking_status)) stats.revenue_total += parseFloat(b.amount_paid || 0);
      }
    }
    return res.json({ ok: true, stats });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CONFIRMATION LETTER DATA
  // ══════════════════════════════════════════════════════════════════════════════

  if (action === 'get-confirmation') {
    const { booking_id, ref } = body;
    let booking = null;
    if (dbReady) {
      let q = `SELECT b.*, r.room_number, r.room_type, r.base_price, f.name as floor_name,
               hp.step_property_info as property_info, hp.step_contact as contact_info, hp.step_location as location_info
               FROM bc_pms_bookings b
               LEFT JOIN bc_pms_rooms r ON r.id = b.room_id
               LEFT JOIN bc_pms_floors f ON f.id = b.floor_id
               LEFT JOIN bc_hotel_profiles hp ON hp.id = b.hotel_profile_id
               WHERE b.hotel_profile_id = $1`;
      const params = [hotelId];
      if (booking_id) { q += ` AND b.id = $2`; params.push(booking_id); }
      else if (ref)   { q += ` AND b.ref = $2`; params.push(ref); }
      const r = await query(q, params);
      booking = r.rows[0] || null;
    } else {
      for (const [, b] of memStore('bookings')) {
        if (String(b.hotel_profile_id) !== String(hotelId)) continue;
        if ((booking_id && String(b.id) === String(booking_id)) || (ref && b.ref === ref)) {
          booking = b; break;
        }
      }
    }
    if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });

    // Mark confirmation as sent
    if (dbReady) {
      await query(`UPDATE bc_pms_bookings SET confirmation_sent = TRUE WHERE id = $1`, [booking.id || booking_id]);
    }

    return res.json({ ok: true, booking });
  }

  return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
};
