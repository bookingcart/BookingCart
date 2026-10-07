// api-routes/pms.js
// Property Management System (PMS) for Hotel Dashboard
// Manages: floors, rooms, layout coordinates, room holds, bookings, availability, blocking, visual room map, analytics
// All actions use: POST or GET { action, ...params }

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

// ─── DB Table Creation & Migrations ───────────────────────────────────────────
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
      pos_x INTEGER DEFAULT 0,
      pos_y INTEGER DEFAULT 0,
      grid_w INTEGER DEFAULT 1,
      grid_h INTEGER DEFAULT 1,
      wing_section TEXT DEFAULT 'Main Wing',
      view_type TEXT DEFAULT 'City View',
      has_balcony BOOLEAN DEFAULT FALSE,
      is_accessible BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `).catch(() => {});

  // Migrations for existing DB tables
  await query(`ALTER TABLE bc_pms_rooms ADD COLUMN IF NOT EXISTS pos_x INTEGER DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE bc_pms_rooms ADD COLUMN IF NOT EXISTS pos_y INTEGER DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE bc_pms_rooms ADD COLUMN IF NOT EXISTS grid_w INTEGER DEFAULT 1`).catch(() => {});
  await query(`ALTER TABLE bc_pms_rooms ADD COLUMN IF NOT EXISTS grid_h INTEGER DEFAULT 1`).catch(() => {});
  await query(`ALTER TABLE bc_pms_rooms ADD COLUMN IF NOT EXISTS wing_section TEXT DEFAULT 'Main Wing'`).catch(() => {});
  await query(`ALTER TABLE bc_pms_rooms ADD COLUMN IF NOT EXISTS view_type TEXT DEFAULT 'City View'`).catch(() => {});
  await query(`ALTER TABLE bc_pms_rooms ADD COLUMN IF NOT EXISTS has_balcony BOOLEAN DEFAULT FALSE`).catch(() => {});
  await query(`ALTER TABLE bc_pms_rooms ADD COLUMN IF NOT EXISTS is_accessible BOOLEAN DEFAULT FALSE`).catch(() => {});

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

  // Temporary Room Holds (10-minute hold lock during checkout)
  await query(`
    CREATE TABLE IF NOT EXISTS bc_pms_holds (
      id SERIAL PRIMARY KEY,
      hotel_profile_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      check_in DATE NOT NULL,
      check_out DATE NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
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

// ─── Demo Seed Data Generator ────────────────────────────────────────────────
async function seedDemoRoomsIfNeeded(dbReady, hotelId) {
  let existingCount = 0;
  if (dbReady) {
    const r = await query(`SELECT COUNT(*) as cnt FROM bc_pms_rooms WHERE hotel_profile_id = $1`, [hotelId]);
    existingCount = parseInt(r.rows[0]?.cnt || 0);
  } else {
    for (const [, r] of memStore('rooms')) {
      if (String(r.hotel_profile_id) === String(hotelId)) existingCount++;
    }
  }

  if (existingCount > 0) return; // Already populated

  // Create default floors
  const floorDefs = [
    { name: 'Ground Floor', sort_order: 1 },
    { name: 'First Floor', sort_order: 2 },
    { name: 'Second Floor', sort_order: 3 },
    { name: 'Executive Penthouse', sort_order: 4 }
  ];

  const floorIds = {};
  for (const f of floorDefs) {
    if (dbReady) {
      const ins = await query(`INSERT INTO bc_pms_floors (hotel_profile_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id`, [hotelId, f.name, f.sort_order]);
      floorIds[f.name] = ins.rows[0].id;
    } else {
      const fid = nextId();
      memStore('floors').set(fid, { id: fid, hotel_profile_id: hotelId, name: f.name, sort_order: f.sort_order, created_at: nowIso(), updated_at: nowIso() });
      floorIds[f.name] = fid;
    }
  }

  const roomSeeds = [
    // Ground Floor
    { floorName: 'Ground Floor', room_number: 'G01', room_type: 'Standard King', bed_type: 'King', capacity: 2, base_price: 120, pos_x: 0, pos_y: 0, grid_w: 1, grid_h: 1, wing_section: 'Garden Wing', view_type: 'Garden View', has_balcony: true, is_accessible: true, amenities: ['Free WiFi', 'Garden Access', 'Accessibility Ramp', 'Air Conditioning'] },
    { floorName: 'Ground Floor', room_number: 'G02', room_type: 'Standard Queen', bed_type: 'Queen', capacity: 2, base_price: 110, pos_x: 1, pos_y: 0, grid_w: 1, grid_h: 1, wing_section: 'Garden Wing', view_type: 'Garden View', has_balcony: false, is_accessible: true, amenities: ['Free WiFi', 'Air Conditioning', 'Smart TV'] },
    { floorName: 'Ground Floor', room_number: 'G03', room_type: 'Deluxe Twin', bed_type: '2 Twin', capacity: 3, base_price: 135, pos_x: 2, pos_y: 0, grid_w: 1, grid_h: 1, wing_section: 'Courtyard Wing', view_type: 'Pool View', has_balcony: true, is_accessible: false, amenities: ['Free WiFi', 'Pool View', 'Mini Bar'] },
    { floorName: 'Ground Floor', room_number: 'G04', room_type: 'Family Suite', bed_type: '1 King + 2 Twin', capacity: 4, base_price: 190, pos_x: 0, pos_y: 1, grid_w: 2, grid_h: 1, wing_section: 'Garden Wing', view_type: 'Garden View', has_balcony: true, is_accessible: true, amenities: ['Free WiFi', 'Kitchenette', 'Garden View', 'Espresso Machine'] },
    { floorName: 'Ground Floor', room_number: 'G05', room_type: 'Poolside Villa', bed_type: 'Super King', capacity: 2, base_price: 240, pos_x: 2, pos_y: 1, grid_w: 1, grid_h: 1, wing_section: 'Courtyard Wing', view_type: 'Pool View', has_balcony: true, is_accessible: false, amenities: ['Direct Pool Access', 'Private Terrace', 'Free WiFi', 'Jacuzzi'] },
    
    // First Floor
    { floorName: 'First Floor', room_number: '101', room_type: 'Executive King', bed_type: 'King', capacity: 2, base_price: 155, pos_x: 0, pos_y: 0, grid_w: 1, grid_h: 1, wing_section: 'Main Building', view_type: 'City View', has_balcony: true, is_accessible: false, amenities: ['Free WiFi', 'City View Balcony', 'Work Desk', 'Nespresso'] },
    { floorName: 'First Floor', room_number: '102', room_type: 'Executive Queen', bed_type: 'Queen', capacity: 2, base_price: 145, pos_x: 1, pos_y: 0, grid_w: 1, grid_h: 1, wing_section: 'Main Building', view_type: 'City View', has_balcony: false, is_accessible: false, amenities: ['Free WiFi', 'AC', 'Work Desk'] },
    { floorName: 'First Floor', room_number: '103', room_type: 'Ocean Deluxe', bed_type: 'King', capacity: 2, base_price: 175, pos_x: 2, pos_y: 0, grid_w: 1, grid_h: 1, wing_section: 'Ocean Wing', view_type: 'Sea View', has_balcony: true, is_accessible: false, amenities: ['Panoramic Sea View', 'Private Balcony', 'Free WiFi', 'Rain Shower'] },
    { floorName: 'First Floor', room_number: '104', room_type: 'Ocean Deluxe Twin', bed_type: '2 Queen', capacity: 4, base_price: 185, pos_x: 3, pos_y: 0, grid_w: 1, grid_h: 1, wing_section: 'Ocean Wing', view_type: 'Sea View', has_balcony: true, is_accessible: false, amenities: ['Sea View', 'Balcony', 'Free WiFi', 'Safe'] },
    { floorName: 'First Floor', room_number: '105', room_type: 'Corner Suite', bed_type: 'King', capacity: 3, base_price: 220, pos_x: 0, pos_y: 1, grid_w: 2, grid_h: 1, wing_section: 'Main Building', view_type: 'City View', has_balcony: true, is_accessible: false, amenities: ['Wrap-around Balcony', 'Living Room', 'Free WiFi', 'Smart TV'] },
    { floorName: 'First Floor', room_number: '106', room_type: 'Junior Suite', bed_type: 'King', capacity: 2, base_price: 210, pos_x: 2, pos_y: 1, grid_w: 2, grid_h: 1, wing_section: 'Ocean Wing', view_type: 'Sea View', has_balcony: true, is_accessible: false, amenities: ['Full Sea View', 'Lounge Area', 'Free WiFi', 'Soaking Tub'] },

    // Second Floor
    { floorName: 'Second Floor', room_number: '201', room_type: 'Luxury Ocean King', bed_type: 'King', capacity: 2, base_price: 210, pos_x: 0, pos_y: 0, grid_w: 1, grid_h: 1, wing_section: 'Ocean Wing', view_type: 'Sea View', has_balcony: true, is_accessible: false, amenities: ['Ocean Balcony', 'Soundproof Windows', 'Free WiFi', 'Minibar'] },
    { floorName: 'Second Floor', room_number: '202', room_type: 'Luxury Ocean Queen', bed_type: 'Queen', capacity: 2, base_price: 195, pos_x: 1, pos_y: 0, grid_w: 1, grid_h: 1, wing_section: 'Ocean Wing', view_type: 'Sea View', has_balcony: true, is_accessible: false, amenities: ['Ocean Balcony', 'Free WiFi', 'Nespresso'] },
    { floorName: 'Second Floor', room_number: '203', room_type: 'Horizon Suite', bed_type: 'King', capacity: 2, base_price: 260, pos_x: 2, pos_y: 0, grid_w: 2, grid_h: 1, wing_section: 'Ocean Wing', view_type: 'Sea View', has_balcony: true, is_accessible: false, amenities: ['Top-floor Sea View', 'Jacuzzi Suite', 'Free WiFi', 'Butler Service'] },
    { floorName: 'Second Floor', room_number: '204', room_type: 'Grand Sunset Suite', bed_type: 'Super King', capacity: 3, base_price: 290, pos_x: 0, pos_y: 1, grid_w: 2, grid_h: 1, wing_section: 'Ocean Wing', view_type: 'Sunset View', has_balcony: true, is_accessible: false, amenities: ['Sunset Terrace', 'Free Champagne', 'Free WiFi', 'Fireplace'] },

    // Executive Penthouse
    { floorName: 'Executive Penthouse', room_number: 'P01', room_type: 'Royal Penthouse Suite', bed_type: 'Emperor King', capacity: 4, base_price: 450, pos_x: 0, pos_y: 0, grid_w: 2, grid_h: 2, wing_section: 'Penthouse Level', view_type: '360 Panoramic View', has_balcony: true, is_accessible: true, amenities: ['360 Terrace', 'Private Heated Plunge Pool', 'Butler Service', 'VIP Elevator', 'Free Airport Transfer'] },
    { floorName: 'Executive Penthouse', room_number: 'P02', room_type: 'Presidential Suite', bed_type: 'Emperor King', capacity: 4, base_price: 520, pos_x: 2, pos_y: 0, grid_w: 2, grid_h: 2, wing_section: 'Penthouse Level', view_type: '360 Panoramic View', has_balcony: true, is_accessible: true, amenities: ['Penthouse Spa Bath', 'Private Cinema Lounge', 'Wine Cellar Bar', 'Dedicated Concierge'] }
  ];

  for (const s of roomSeeds) {
    const fid = floorIds[s.floorName] || null;
    const images = ['https://images.unsplash.com/photo-1590490359683-658d3d23f972?auto=format&fit=crop&w=800&q=80'];
    if (dbReady) {
      await query(
        `INSERT INTO bc_pms_rooms (hotel_profile_id, floor_id, room_number, room_type, bed_type, capacity, base_price, currency, amenities, images, description, status, pos_x, pos_y, grid_w, grid_h, wing_section, view_type, has_balcony, is_accessible)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'USD',$8,$9,$10,'available',$11,$12,$13,$14,$15,$16,$17,$18)`,
        [hotelId, fid, s.room_number, s.room_type, s.bed_type, s.capacity, s.base_price, JSON.stringify(s.amenities), JSON.stringify(images), `${s.room_type} with ${s.view_type}`, s.pos_x, s.pos_y, s.grid_w, s.grid_h, s.wing_section, s.view_type, s.has_balcony, s.is_accessible]
      );
    } else {
      const rid = nextId();
      memStore('rooms').set(rid, {
        id: rid, hotel_profile_id: hotelId, floor_id: fid, room_number: s.room_number, room_type: s.room_type, bed_type: s.bed_type, capacity: s.capacity, base_price: s.base_price, currency: 'USD', amenities: s.amenities, images, description: `${s.room_type} with ${s.view_type}`, status: 'available', pos_x: s.pos_x, pos_y: s.pos_y, grid_w: s.grid_w, grid_h: s.grid_h, wing_section: s.wing_section, view_type: s.view_type, has_balcony: s.has_balcony, is_accessible: s.is_accessible, created_at: nowIso(), updated_at: nowIso()
      });
    }
  }
}

// ─── Availability Checker ─────────────────────────────────────────────────────
async function checkRoomAvailability(dbReady, roomId, checkIn, checkOut, excludeBookingId = null, currentSessionId = null) {
  const ci = new Date(checkIn), co = new Date(checkOut);

  // 1. Check bookings
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

    // Check active holds
    let holdQ = `
      SELECT session_id, expires_at FROM bc_pms_holds
      WHERE room_id = $1 AND expires_at > NOW() AND check_in < $3 AND check_out > $2
    `;
    const hParams = [roomId, checkIn, checkOut];
    if (currentSessionId) {
      holdQ += ` AND session_id != $4`;
      hParams.push(currentSessionId);
    }
    const h = await query(holdQ, hParams);
    if (h.rows.length > 0) {
      return { available: false, reason: 'held', expires_at: h.rows[0].expires_at };
    }
  } else {
    const bookings = memStore('bookings');
    const blocks = memStore('blocks');
    const holds = memStore('holds');

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
    const now = new Date();
    for (const [, hd] of holds) {
      if (String(hd.room_id) !== String(roomId)) continue;
      if (new Date(hd.expires_at) <= now) continue; // Expired hold
      if (currentSessionId && hd.session_id === currentSessionId) continue;
      const hci = new Date(hd.check_in), hco = new Date(hd.check_out);
      if (ci < hco && co > hci) return { available: false, reason: 'held', expires_at: hd.expires_at };
    }
  }
  return { available: true };
}

// ─── Auth helper ──────────────────────────────────────────────────────────────
async function getHotelProfileId(dbReady, auth) {
  if (dbReady) {
    const r = await query(
      `SELECT id FROM bc_hotel_profiles WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
      [auth.email]
    );
    return r.rows.length ? r.rows[0].id : null;
  }
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

  const body = req.method === 'GET' ? req.query : (req.body || {});
  const { action } = body;

  // Public actions (used by guests browsing Stays) do not require property owner login bearer token
  const PUBLIC_ACTIONS = ['public-room-map', 'hold-room', 'release-hold', 'public-create-booking', 'check-availability'];

  let hotelId = null;
  if (!PUBLIC_ACTIONS.includes(action)) {
    // Auth required for owner actions
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });
    hotelId = await getHotelProfileId(dbReady, auth);
    if (!hotelId) return res.status(404).json({ ok: false, error: 'No hotel profile found. Please complete onboarding first.' });
  } else {
    // Public actions use hotel_id from params, fallback to 1 or demo
    hotelId = body.hotel_id || body.hotel_profile_id || 1;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PUBLIC VISUAL ROOM MAP & SEAT-SELECTION ENGINE
  // ══════════════════════════════════════════════════════════════════════════════

  if (action === 'public-room-map') {
    const checkIn = body.check_in || new Date().toISOString().split('T')[0];
    const checkOut = body.check_out || new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const sessionId = body.session_id || 'guest_anon';

    // Auto-seed demo rooms if hotel currently has 0 rooms
    await seedDemoRoomsIfNeeded(dbReady, hotelId);

    // Fetch floors & rooms
    let floors = [], rawRooms = [], activeBookings = [], activeBlocks = [], activeHolds = [];
    if (dbReady) {
      const fl = await query(`SELECT * FROM bc_pms_floors WHERE hotel_profile_id = $1 ORDER BY sort_order, id`, [hotelId]);
      floors = fl.rows;
      const rm = await query(`SELECT r.*, f.name as floor_name FROM bc_pms_rooms r LEFT JOIN bc_pms_floors f ON f.id = r.floor_id WHERE r.hotel_profile_id = $1 ORDER BY f.sort_order NULLS LAST, r.pos_y, r.pos_x, r.room_number`, [hotelId]);
      rawRooms = rm.rows;
      const bk = await query(`SELECT room_id, booking_status FROM bc_pms_bookings WHERE hotel_profile_id = $1 AND booking_status NOT IN ('cancelled','checked_out','no_show') AND check_in < $3 AND check_out > $2`, [hotelId, checkIn, checkOut]);
      activeBookings = bk.rows;
      const bl = await query(`SELECT room_id, reason FROM bc_pms_blocks WHERE hotel_profile_id = $1 AND from_date < $3 AND to_date > $2`, [hotelId, checkIn, checkOut]);
      activeBlocks = bl.rows;
      const hd = await query(`SELECT room_id, session_id, expires_at FROM bc_pms_holds WHERE hotel_profile_id = $1 AND expires_at > NOW() AND check_in < $3 AND check_out > $2`, [hotelId, checkIn, checkOut]);
      activeHolds = hd.rows;
    } else {
      const flStore = memStore('floors');
      const rmStore = memStore('rooms');
      const bkStore = memStore('bookings');
      const blStore = memStore('blocks');
      const hdStore = memStore('holds');

      for (const [, f] of flStore) {
        if (String(f.hotel_profile_id) === String(hotelId)) floors.push(f);
      }
      floors.sort((a, b) => a.sort_order - b.sort_order);

      for (const [, r] of rmStore) {
        if (String(r.hotel_profile_id) === String(hotelId)) {
          const flName = r.floor_id ? flStore.get(r.floor_id)?.name : null;
          rawRooms.push({ ...r, floor_name: flName });
        }
      }

      const ci = new Date(checkIn), co = new Date(checkOut);
      for (const [, b] of bkStore) {
        if (String(b.hotel_profile_id) !== String(hotelId)) continue;
        if (['cancelled','checked_out','no_show'].includes(b.booking_status)) continue;
        if (ci < new Date(b.check_out) && co > new Date(b.check_in)) activeBookings.push(b);
      }
      for (const [, bl] of blStore) {
        if (String(bl.hotel_profile_id) !== String(hotelId)) continue;
        if (ci < new Date(bl.to_date) && co > new Date(bl.from_date)) activeBlocks.push(bl);
      }
      const now = new Date();
      for (const [, hd] of hdStore) {
        if (String(hd.hotel_profile_id) !== String(hotelId)) continue;
        if (new Date(hd.expires_at) <= now) continue;
        if (ci < new Date(hd.check_out) && co > new Date(hd.check_in)) activeHolds.push(hd);
      }
    }

    // Process room statuses
    const rooms = rawRooms.map(room => {
      let liveStatus = room.status || 'available'; // owner status (maintenance, blocked, etc)

      // If owner manually marked maintenance/blocked
      if (liveStatus === 'maintenance' || liveStatus === 'out_of_service') {
        liveStatus = 'maintenance';
      } else if (liveStatus === 'blocked') {
        liveStatus = 'blocked';
      } else {
        // Check blocks
        const isBlocked = activeBlocks.some(b => String(b.room_id) === String(room.id));
        if (isBlocked) {
          liveStatus = 'blocked';
        } else {
          // Check bookings
          const booking = activeBookings.find(b => String(b.room_id) === String(room.id));
          if (booking) {
            liveStatus = booking.booking_status === 'checked_in' ? 'occupied' : 'booked';
          } else {
            // Check holds
            const hold = activeHolds.find(h => String(h.room_id) === String(room.id));
            if (hold) {
              if (hold.session_id === sessionId) {
                liveStatus = 'selected'; // held by current guest!
              } else {
                liveStatus = 'held'; // held by another guest
              }
            } else if (liveStatus === 'occupied') {
              liveStatus = 'occupied';
            } else {
              liveStatus = 'available';
            }
          }
        }
      }

      return {
        ...room,
        live_status: liveStatus,
        is_held_by_me: activeHolds.some(h => String(h.room_id) === String(room.id) && h.session_id === sessionId)
      };
    });

    const myHold = activeHolds.find(h => h.session_id === sessionId);

    return res.json({
      ok: true,
      check_in: checkIn,
      check_out: checkOut,
      session_id: sessionId,
      floors,
      rooms,
      selected_room_id: myHold ? myHold.room_id : null,
      hold_expires_at: myHold ? myHold.expires_at : null
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // TEMPORARY ROOM HOLD / UNLOCK ENGINE
  // ══════════════════════════════════════════════════════════════════════════════

  if (action === 'hold-room') {
    const { room_id, session_id, check_in, check_out } = body;
    if (!room_id || !session_id || !check_in || !check_out) {
      return res.status(400).json({ ok: false, error: 'room_id, session_id, check_in, check_out are required' });
    }

    // Check availability
    const avail = await checkRoomAvailability(dbReady, room_id, check_in, check_out, null, session_id);
    if (!avail.available) {
      return res.status(409).json({ ok: false, error: `Room is currently unavailable (${avail.reason})`, reason: avail.reason });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minute hold timer

    if (dbReady) {
      // Delete existing hold for session
      await query(`DELETE FROM bc_pms_holds WHERE session_id = $1`, [session_id]);
      // Insert new hold
      await query(
        `INSERT INTO bc_pms_holds (hotel_profile_id, room_id, session_id, check_in, check_out, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [hotelId, room_id, session_id, check_in, check_out, expiresAt]
      );
    } else {
      const hdStore = memStore('holds');
      for (const [id, h] of hdStore) {
        if (h.session_id === session_id) hdStore.delete(id);
      }
      const hid = nextId();
      hdStore.set(hid, {
        id: hid, hotel_profile_id: hotelId, room_id, session_id, check_in, check_out, expires_at: expiresAt, created_at: nowIso()
      });
    }

    return res.json({
      ok: true,
      room_id,
      session_id,
      expires_at: expiresAt,
      remaining_seconds: 600,
      message: `Room ${room_id} reserved for 10 minutes.`
    });
  }

  if (action === 'release-hold') {
    const { session_id, room_id } = body;
    if (!session_id) return res.status(400).json({ ok: false, error: 'session_id required' });

    if (dbReady) {
      let q = `DELETE FROM bc_pms_holds WHERE session_id = $1`;
      const params = [session_id];
      if (room_id) { q += ` AND room_id = $2`; params.push(room_id); }
      await query(q, params);
    } else {
      const hdStore = memStore('holds');
      for (const [id, h] of hdStore) {
        if (h.session_id === session_id && (!room_id || String(h.room_id) === String(room_id))) {
          hdStore.delete(id);
        }
      }
    }

    return res.json({ ok: true, released: true });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // FLOOR ACTIONS
  // ══════════════════════════════════════════════════════════════════════════════

  if (action === 'list-floors') {
    await seedDemoRoomsIfNeeded(dbReady, hotelId);
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
    await seedDemoRoomsIfNeeded(dbReady, hotelId);
    if (dbReady) {
      const r = await query(
        `SELECT r.*, f.name as floor_name FROM bc_pms_rooms r
         LEFT JOIN bc_pms_floors f ON f.id = r.floor_id
         WHERE r.hotel_profile_id = $1 ORDER BY f.sort_order NULLS LAST, r.pos_y, r.pos_x, r.room_number`,
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
    const { floor_id, room_number, room_type, bed_type, capacity, base_price, seasonal_price, currency, amenities, images, description, size_sqm, pos_x = 0, pos_y = 0, grid_w = 1, grid_h = 1, wing_section = 'Main Wing', view_type = 'City View', has_balcony = false, is_accessible = false } = body;
    if (!room_number) return res.status(400).json({ ok: false, error: 'room_number required' });
    if (dbReady) {
      const r = await query(
        `INSERT INTO bc_pms_rooms (hotel_profile_id, floor_id, room_number, room_type, bed_type, capacity, base_price, seasonal_price, currency, amenities, images, description, size_sqm, pos_x, pos_y, grid_w, grid_h, wing_section, view_type, has_balcony, is_accessible)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
        [hotelId, floor_id || null, room_number, room_type || 'Standard', bed_type || 'Queen',
         capacity || 2, base_price || 0, seasonal_price || null, currency || 'USD',
         JSON.stringify(amenities || []), JSON.stringify(images || []), description || '', size_sqm || null,
         pos_x, pos_y, grid_w, grid_h, wing_section, view_type, has_balcony, is_accessible]
      );
      return res.json({ ok: true, room: r.rows[0] });
    } else {
      const id = nextId();
      const room = { id, hotel_profile_id: hotelId, floor_id: floor_id || null, room_number, room_type: room_type || 'Standard', bed_type: bed_type || 'Queen', capacity: capacity || 2, base_price: base_price || 0, seasonal_price: seasonal_price || null, currency: currency || 'USD', amenities: amenities || [], images: images || [], description: description || '', size_sqm: size_sqm || null, status: 'available', pos_x, pos_y, grid_w, grid_h, wing_section, view_type, has_balcony, is_accessible, created_at: nowIso(), updated_at: nowIso() };
      memStore('rooms').set(id, room);
      return res.json({ ok: true, room });
    }
  }

  if (action === 'edit-room' || action === 'update-room-layout') {
    const { room_id, ...updates } = body;
    if (!room_id) return res.status(400).json({ ok: false, error: 'room_id required' });
    const allowed = ['floor_id', 'room_number', 'room_type', 'bed_type', 'capacity', 'base_price', 'seasonal_price', 'currency', 'amenities', 'images', 'description', 'status', 'size_sqm', 'pos_x', 'pos_y', 'grid_w', 'grid_h', 'wing_section', 'view_type', 'has_balcony', 'is_accessible'];
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

  // ══════════════════════════════════════════════════════════════════════════════
  // BOOKING & ANALYTICS ACTIONS
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

  if (action === 'create-booking' || action === 'public-create-booking') {
    const { room_id, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, total_amount, special_requests, source, session_id } = body;
    if (!room_id || !guest_name || !guest_email || !check_in || !check_out) {
      return res.status(400).json({ ok: false, error: 'room_id, guest_name, guest_email, check_in, check_out are required' });
    }

    const avail = await checkRoomAvailability(dbReady, room_id, check_in, check_out, null, session_id);
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

    const total = total_amount || 0;
    const remaining = total;

    if (dbReady) {
      const r = await query(
        `INSERT INTO bc_pms_bookings (ref, hotel_profile_id, room_id, floor_id, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, booking_status, payment_status, total_amount, remaining_balance, special_requests, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed','paid',$11,0,$12,$13) RETURNING *`,
        [ref, hotelId, room_id, floor_id, guest_name, guest_email, guest_phone || '', check_in, check_out, num_guests || 1, total, special_requests || '', source || 'stays_app']
      );
      // Remove temporary hold
      if (session_id) {
        await query(`DELETE FROM bc_pms_holds WHERE session_id = $1`, [session_id]);
      }
      return res.json({ ok: true, booking: r.rows[0], ref });
    } else {
      const id = nextId();
      const booking = { id, ref, hotel_profile_id: hotelId, room_id, floor_id, guest_name, guest_email, guest_phone: guest_phone || '', check_in, check_out, num_guests: num_guests || 1, booking_status: 'confirmed', payment_status: 'paid', amount_paid: total, total_amount: total, remaining_balance: 0, special_requests: special_requests || '', source: source || 'stays_app', confirmation_sent: true, created_at: nowIso(), updated_at: nowIso() };
      memStore('bookings').set(id, booking);

      if (session_id) {
        const hdStore = memStore('holds');
        for (const [hid, h] of hdStore) {
          if (h.session_id === session_id) hdStore.delete(hid);
        }
      }
      return res.json({ ok: true, booking, ref });
    }
  }

  if (action === 'update-booking-status') {
    const { booking_id, booking_status, payment_status, amount_paid, notes } = body;
    if (!booking_id) return res.status(400).json({ ok: false, error: 'booking_id required' });

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

  if (action === 'check-availability') {
    const { room_id, check_in, check_out, session_id } = body;
    if (!room_id || !check_in || !check_out) return res.status(400).json({ ok: false, error: 'room_id, check_in, check_out required' });
    const result = await checkRoomAvailability(dbReady, room_id, check_in, check_out, null, session_id);
    return res.json({ ok: true, ...result });
  }

  if (action === 'room-analytics' || action === 'dashboard-stats') {
    await seedDemoRoomsIfNeeded(dbReady, hotelId);
    let stats = { total_rooms: 0, available_rooms: 0, occupied_rooms: 0, total_bookings: 0, pending_bookings: 0, confirmed_bookings: 0, revenue_total: 0, floor_occupancy: [], top_rooms: [] };

    if (dbReady) {
      const [rooms, bookings, floors] = await Promise.all([
        query(`SELECT r.*, f.name as floor_name FROM bc_pms_rooms r LEFT JOIN bc_pms_floors f ON f.id = r.floor_id WHERE r.hotel_profile_id = $1`, [hotelId]),
        query(`SELECT b.*, r.room_number FROM bc_pms_bookings b LEFT JOIN bc_pms_rooms r ON r.id = b.room_id WHERE b.hotel_profile_id = $1 AND b.booking_status NOT IN ('cancelled','no_show')`, [hotelId]),
        query(`SELECT * FROM bc_pms_floors WHERE hotel_profile_id = $1`, [hotelId])
      ]);

      const roomList = rooms.rows;
      const bookingList = bookings.rows;
      stats.total_rooms = roomList.length;

      const roomBookingCounts = {};
      bookingList.forEach(b => {
        stats.total_bookings++;
        stats.revenue_total += parseFloat(b.total_amount || 0);
        roomBookingCounts[b.room_id] = (roomBookingCounts[b.room_id] || 0) + 1;
      });

      stats.top_rooms = roomList.map(r => ({
        id: r.id,
        room_number: r.room_number,
        room_type: r.room_type,
        bookings_count: roomBookingCounts[r.id] || 0,
        revenue: (roomBookingCounts[r.id] || 0) * (parseFloat(r.base_price) || 100)
      })).sort((a,b) => b.bookings_count - a.bookings_count);

      stats.floor_occupancy = floors.rows.map(f => {
        const fRooms = roomList.filter(r => String(r.floor_id) === String(f.id));
        const occCount = fRooms.filter(r => roomBookingCounts[r.id] > 0 || r.status === 'occupied').length;
        const rate = fRooms.length ? Math.round((occCount / fRooms.length) * 100) : 0;
        return { floor_id: f.id, floor_name: f.name, total: fRooms.length, occupied: occCount, rate };
      });
    } else {
      const rmStore = memStore('rooms');
      const bkStore = memStore('bookings');
      const flStore = memStore('floors');

      const roomList = [], bookingList = [], floorList = [];
      for (const [, r] of rmStore) if (String(r.hotel_profile_id) === String(hotelId)) roomList.push(r);
      for (const [, b] of bkStore) if (String(b.hotel_profile_id) === String(hotelId) && !['cancelled','no_show'].includes(b.booking_status)) bookingList.push(b);
      for (const [, f] of flStore) if (String(f.hotel_profile_id) === String(hotelId)) floorList.push(f);

      stats.total_rooms = roomList.length;
      const roomBookingCounts = {};
      bookingList.forEach(b => {
        stats.total_bookings++;
        stats.revenue_total += parseFloat(b.total_amount || 0);
        roomBookingCounts[b.room_id] = (roomBookingCounts[b.room_id] || 0) + 1;
      });

      stats.top_rooms = roomList.map(r => ({
        id: r.id,
        room_number: r.room_number,
        room_type: r.room_type,
        bookings_count: roomBookingCounts[r.id] || 0,
        revenue: (roomBookingCounts[r.id] || 0) * (parseFloat(r.base_price) || 100)
      })).sort((a,b) => b.bookings_count - a.bookings_count);

      stats.floor_occupancy = floorList.map(f => {
        const fRooms = roomList.filter(r => String(r.floor_id) === String(f.id));
        const occCount = fRooms.filter(r => roomBookingCounts[r.id] > 0 || r.status === 'occupied').length;
        const rate = fRooms.length ? Math.round((occCount / fRooms.length) * 100) : 0;
        return { floor_id: f.id, floor_name: f.name, total: fRooms.length, occupied: occCount, rate };
      });
    }

    return res.json({ ok: true, stats });
  }

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

    if (dbReady) {
      await query(`UPDATE bc_pms_bookings SET confirmation_sent = TRUE WHERE id = $1`, [booking.id || booking_id]);
    }
    return res.json({ ok: true, booking });
  }

  return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
};
