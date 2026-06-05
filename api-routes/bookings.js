// api/bookings.js – persist flight bookings (Postgres or local fallback)

const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { requireAdminEmail } = require('../lib/admin');
const { verifyRequestBearer } = require('../lib/google-verify');
const crypto = require('crypto');

module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let dbReady = false;
    try {
      if (isDbConfigured()) {
        await initDb();
        dbReady = true;
      }
    } catch (err) {
      console.warn('Postgres bookings connection failed, using fallback store:', err.message);
      if (process.env.NODE_ENV === 'production') throw err;
      if (!global.__bookings) global.__bookings = [];
    }

    if (process.env.NODE_ENV === 'production' && !dbReady) {
      return res.status(503).json({ ok: false, error: 'Database is not configured (DATABASE_URL)' });
    }

    if (req.method === 'GET') {
      const ref = String(req.query?.ref || req.query?.id || '').trim();
      if (!ref) return res.status(400).json({ ok: false, error: 'Missing booking reference' });

      let found = null;
      if (dbReady) {
        const result = await query('SELECT * FROM bc_bookings WHERE ref = $1', [ref]);
        found = result.rows.length ? rowToBooking(result.rows[0]) : null;
      } else {
        found = (global.__bookings || []).find((b) => b.ref === ref) || null;
      }

      if (!found) return res.status(404).json({ ok: false, error: 'Booking not found' });
      return res.json({ ok: true, booking: found });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const { action, booking, email, id, status } = req.body || {};

    if (action === 'save') {
      if (!booking) return res.status(400).json({ ok: false, error: 'Missing booking' });
      const privilege = await getBookingWritePrivilege(req);
      const privilegedFields = getPrivilegedBookingFields(booking);
      if (!privilege.ok && privilegedFields.length > 0) {
        return res.status(403).json({
          ok: false,
          error: `Non-admin booking saves cannot set privileged fields: ${privilegedFields.join(', ')}`
        });
      }
      let safeBooking;
      try {
        safeBooking = sanitizeCustomerBooking(booking);
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message || 'Invalid booking payload' });
      }

      if (dbReady) {
        const now = new Date().toISOString();
        await query(
          `INSERT INTO bc_bookings (
             ref, contact_email, status, route, dates, flight, passengers,
             contact, extras, total, payment, payment_split, duffel_order_id,
             duffel_booking_reference, duffel_order_status, ticket, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
           ON CONFLICT (ref) DO UPDATE SET
             status = CASE WHEN $18 THEN COALESCE($3, bc_bookings.status) ELSE bc_bookings.status END,
             route = $4, dates = $5, flight = $6, passengers = $7,
             contact = $8, extras = $9, total = $10,
             payment = CASE WHEN $18 THEN $11 ELSE bc_bookings.payment END,
             payment_split = CASE WHEN $18 THEN $12 ELSE bc_bookings.payment_split END,
             duffel_order_id = CASE WHEN $18 THEN $13 ELSE bc_bookings.duffel_order_id END,
             duffel_booking_reference = CASE WHEN $18 THEN $14 ELSE bc_bookings.duffel_booking_reference END,
             duffel_order_status = CASE WHEN $18 THEN $15 ELSE bc_bookings.duffel_order_status END,
             ticket = CASE WHEN $18 THEN COALESCE($16, bc_bookings.ticket) ELSE bc_bookings.ticket END,
             updated_at = $17`,
          [
            safeBooking.ref,
            (safeBooking.contact && safeBooking.contact.email) || '',
            privilege.ok ? booking.status || 'new' : 'new',
            safeBooking.route || '',
            safeBooking.dates || '',
            JSON.stringify(safeBooking.flight || {}),
            JSON.stringify(safeBooking.passengers || []),
            JSON.stringify(safeBooking.contact || {}),
            JSON.stringify(safeBooking.extras || {}),
            safeBooking.total || 0,
            privilege.ok && booking.payment ? JSON.stringify(booking.payment) : null,
            privilege.ok && booking.paymentSplit ? JSON.stringify(booking.paymentSplit) : null,
            privilege.ok ? booking.duffelOrderId || null : null,
            privilege.ok ? booking.duffelBookingReference || null : null,
            privilege.ok ? booking.duffelOrderStatus || null : null,
            privilege.ok && booking.ticket ? JSON.stringify(booking.ticket) : null,
            now,
            privilege.ok,
          ]
        );
      } else {
        const existsIdx = global.__bookings.findIndex((b) => b.ref === safeBooking.ref);
        if (existsIdx === -1) {
          const stored = { ...safeBooking, createdAt: new Date().toISOString(), status: privilege.ok ? booking.status || 'new' : 'new' };
          if (privilege.ok) {
            Object.assign(stored, {
              payment: booking.payment || null,
              paymentSplit: booking.paymentSplit || null,
              duffelOrderId: booking.duffelOrderId || null,
              duffelBookingReference: booking.duffelBookingReference || null,
              duffelOrderStatus: booking.duffelOrderStatus || null,
              ticket: booking.ticket || null
            });
          }
          global.__bookings.unshift(stored);
        } else {
          const old = global.__bookings[existsIdx];
          const next = { ...old, ...safeBooking, createdAt: old.createdAt };
          if (privilege.ok) {
            Object.assign(next, {
              status: booking.status || old.status,
              payment: booking.payment || old.payment || null,
              paymentSplit: booking.paymentSplit || old.paymentSplit || null,
              duffelOrderId: booking.duffelOrderId || old.duffelOrderId || null,
              duffelBookingReference: booking.duffelBookingReference || old.duffelBookingReference || null,
              duffelOrderStatus: booking.duffelOrderStatus || old.duffelOrderStatus || null,
              ticket: booking.ticket || old.ticket || null
            });
          }
          global.__bookings[existsIdx] = next;
        }
      }

      return res.json({ ok: true, id: safeBooking.ref });
    }

    if (action === 'list') {
      const gate = await requireAdminEmail(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });

      let all = [];
      if (dbReady) {
        const result = await query('SELECT * FROM bc_bookings ORDER BY created_at DESC');
        all = result.rows.map(rowToBooking);
      } else {
        all = global.__bookings;
      }

      return res.json({ ok: true, bookings: all });
    }

    if (action === 'lookup') {
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });

      const auth = await verifyRequestBearer(req);
      if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
      if (auth.email !== String(email).trim().toLowerCase()) {
        return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
      }

      let found = [];
      if (dbReady) {
        const result = await query(
          'SELECT * FROM bc_bookings WHERE LOWER(contact_email) = LOWER($1) ORDER BY created_at DESC',
          [String(email).trim()]
        );
        found = result.rows.map(rowToBooking);
      } else {
        found = global.__bookings.filter(
          (b) => ((b.contact && b.contact.email) || '').toLowerCase() === email.toLowerCase()
        );
      }

      return res.json({ ok: true, bookings: found });
    }

    if (action === 'status') {
      const gate = await requireAdminEmail(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });
      if (!id || !status) return res.status(400).json({ ok: false, error: 'Missing id or status' });

      if (dbReady) {
        const result = await query(
          'UPDATE bc_bookings SET status = $1, updated_at = NOW() WHERE ref = $2 RETURNING *',
          [status, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ ok: false, error: 'Booking not found' });
        return res.json({ ok: true, booking: rowToBooking(result.rows[0]) });
      }
      const idx = global.__bookings.findIndex((b) => b.ref === id);
      if (idx === -1) return res.status(404).json({ ok: false, error: 'Booking not found' });
      global.__bookings[idx].status = status;
      return res.json({ ok: true, booking: global.__bookings[idx] });
    }

    if (action === 'cancel_own') {
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });
      const auth = await verifyRequestBearer(req);
      if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

      if (dbReady) {
        const result = await query('SELECT * FROM bc_bookings WHERE ref = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ ok: false, error: 'Booking not found' });
        const b = result.rows[0];
        const em = (b.contact_email || '').trim().toLowerCase();
        if (!em || em !== auth.email) {
          return res.status(403).json({ ok: false, error: 'Not allowed for this booking' });
        }
        await query("UPDATE bc_bookings SET status = 'cancelled', updated_at = NOW() WHERE ref = $1", [id]);
      } else {
        const idx = global.__bookings.findIndex((x) => x.ref === id);
        if (idx === -1) return res.status(404).json({ ok: false, error: 'Booking not found' });
        const em = ((global.__bookings[idx].contact && global.__bookings[idx].contact.email) || '')
          .trim()
          .toLowerCase();
        if (!em || em !== auth.email) {
          return res.status(403).json({ ok: false, error: 'Not allowed for this booking' });
        }
        global.__bookings[idx].status = 'cancelled';
      }
      return res.json({ ok: true });
    }

    if (action === 'delete') {
      const gate = await requireAdminEmail(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

      if (dbReady) {
        await query('DELETE FROM bc_bookings WHERE ref = $1', [id]);
      } else {
        global.__bookings = global.__bookings.filter((b) => b.ref !== id);
      }
      return res.json({ ok: true });
    }

    if (action === 'upload_ticket') {
      const gate = await requireAdminEmail(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });
      const { ticket } = req.body;
      if (!id || !ticket) return res.status(400).json({ ok: false, error: 'Missing id or ticket data' });
      const ticketCheck = validateTicketUpload(ticket);
      if (!ticketCheck.ok) return res.status(400).json({ ok: false, error: ticketCheck.error });

      if (dbReady) {
        const result = await query(
          "UPDATE bc_bookings SET status = 'issued', ticket = $1, updated_at = NOW() WHERE ref = $2 RETURNING *",
          [JSON.stringify(ticketCheck.ticket), id]
        );
        if (result.rows.length === 0) return res.status(404).json({ ok: false, error: 'Booking not found' });
        return res.json({ ok: true, booking: rowToBooking(result.rows[0]) });
      }
      const idx = global.__bookings.findIndex((b) => b.ref === id);
      if (idx === -1) return res.status(404).json({ ok: false, error: 'Booking not found' });
      global.__bookings[idx].status = 'issued';
      global.__bookings[idx].ticket = ticketCheck.ticket;
      return res.json({ ok: true, booking: global.__bookings[idx] });
    }

    if (action === 'track_download') {
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

      if (dbReady) {
        await query(
          'UPDATE bc_bookings SET download_count = download_count + 1 WHERE ref = $1',
          [id]
        );
      } else {
        const idx = global.__bookings.findIndex((b) => b.ref === id);
        if (idx !== -1) {
          global.__bookings[idx].downloadCount = (global.__bookings[idx].downloadCount || 0) + 1;
        }
      }
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    console.error('Bookings API error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};

/**
 * Convert a Postgres row back to the booking object shape the frontend expects.
 */
function rowToBooking(row) {
  return {
    ref: row.ref,
    status: row.status,
    route: row.route,
    dates: row.dates,
    flight: row.flight || {},
    passengers: row.passengers || [],
    contact: row.contact || {},
    extras: row.extras || {},
    total: row.total ? parseFloat(row.total) : 0,
    payment: row.payment || null,
    paymentSplit: row.payment_split || null,
    duffelOrderId: row.duffel_order_id || null,
    duffelBookingReference: row.duffel_booking_reference || null,
    duffelOrderStatus: row.duffel_order_status || null,
    ticket: row.ticket || null,
    downloadCount: row.download_count || 0,
    createdAt: row.created_at,
  };
}

const PRIVILEGED_BOOKING_FIELDS = [
  'status',
  'ticket',
  'payment',
  'paymentSplit',
  'payment_state',
  'duffelOrderId',
  'duffelBookingReference',
  'duffelOrderStatus',
  'duffel_order_id',
  'duffel_booking_reference',
  'duffel_order_status'
];

function getPrivilegedBookingFields(booking) {
  if (!booking || typeof booking !== 'object') return [];
  return PRIVILEGED_BOOKING_FIELDS.filter((key) => Object.prototype.hasOwnProperty.call(booking, key));
}

function getHeader(req, name) {
  const headers = req.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function safeTokenEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function getBookingWritePrivilege(req) {
  const configuredInternalToken = String(process.env.INTERNAL_SERVICE_TOKEN || process.env.BOOKINGCART_INTERNAL_TOKEN || '').trim();
  const requestInternalToken = String(getHeader(req, 'x-bookingcart-internal-token') || '').trim();
  if (configuredInternalToken && requestInternalToken && safeTokenEqual(requestInternalToken, configuredInternalToken)) {
    return { ok: true, source: 'internal' };
  }

  const authHeader = String(getHeader(req, 'authorization') || '').trim();
  if (!authHeader) return { ok: false };

  const gate = await requireAdminEmail(req);
  return gate.ok ? { ok: true, source: 'admin', email: gate.email } : { ok: false };
}

function sanitizeString(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function sanitizeJsonValue(value, fallback, maxLength) {
  if (value === undefined || value === null) return fallback;
  const json = JSON.stringify(value);
  if (json.length > maxLength) throw new Error('Booking payload is too large');
  return JSON.parse(json);
}

function sanitizeCustomerBooking(booking) {
  const ref = sanitizeString(booking.ref, 80);
  if (!/^[A-Za-z0-9._:-]{3,80}$/.test(ref)) {
    throw new Error('Missing or invalid booking reference');
  }

  const contact = sanitizeJsonValue(booking.contact || {}, {}, 12000);
  if (contact.email) {
    contact.email = sanitizeString(contact.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
      throw new Error('Invalid contact email');
    }
  }

  const total = Number(booking.total || 0);
  if (!Number.isFinite(total) || total < 0 || total > 1000000) {
    throw new Error('Invalid booking total');
  }

  return {
    ref,
    route: sanitizeString(booking.route, 200),
    dates: sanitizeString(booking.dates, 200),
    flight: sanitizeJsonValue(booking.flight || {}, {}, 20000),
    passengers: sanitizeJsonValue(Array.isArray(booking.passengers) ? booking.passengers : [], [], 30000),
    contact,
    extras: sanitizeJsonValue(booking.extras || {}, {}, 20000),
    total
  };
}

function validateTicketUpload(ticket) {
  const allowedMimes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
  const maxBytes = 8 * 1024 * 1024;
  const fileData = String(ticket.fileData || '').trim();
  const match = fileData.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return { ok: false, error: 'Ticket file must be a base64 data URI' };
  }

  const mime = match[1].toLowerCase();
  if (!allowedMimes.has(mime)) {
    return { ok: false, error: 'Ticket file must be PDF, PNG, JPEG, or WebP' };
  }

  const base64 = match[2].replace(/\s+/g, '');
  const estimatedBytes = Math.floor((base64.length * 3) / 4);
  if (estimatedBytes > maxBytes) {
    return { ok: false, error: 'Ticket file must be 8 MB or smaller' };
  }

  const ticketNumber = sanitizeString(ticket.ticketNumber, 80);
  const airline = sanitizeString(ticket.airline, 120);
  if (!ticketNumber || !airline) {
    return { ok: false, error: 'Ticket number and airline are required' };
  }

  const fileName = sanitizeString(ticket.fileName || `ticket.${mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]}`, 160)
    .replace(/[\\/]/g, '-');

  return {
    ok: true,
    ticket: {
      ticketNumber,
      airline,
      fileName,
      fileData: `data:${mime};base64,${base64}`,
      mimeType: mime,
      sizeBytes: estimatedBytes,
      uploadedAt: ticket.uploadedAt || new Date().toISOString()
    }
  };
}
