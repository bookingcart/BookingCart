// api/bookings.js – persist flight bookings (Postgres or local fallback)

const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { requireAdminEmail } = require('../lib/admin');
const { verifyRequestBearer } = require('../lib/google-verify');

module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const { action, booking, email, id, status, pin } = req.body || {};

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

    if (action === 'save') {
      if (!booking) return res.status(400).json({ ok: false, error: 'Missing booking' });

      if (dbReady) {
        const now = new Date().toISOString();
        await query(
          `INSERT INTO bc_bookings (ref, contact_email, status, route, dates, flight, passengers, contact, extras, total, payment, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
           ON CONFLICT (ref) DO UPDATE SET
             status = COALESCE($3, bookings.status),
             route = $4, dates = $5, flight = $6, passengers = $7,
             contact = $8, extras = $9, total = $10, payment = $11,
             updated_at = $12`,
          [
            booking.ref,
            (booking.contact && booking.contact.email) || '',
            booking.status || 'new',
            booking.route || '',
            booking.dates || '',
            JSON.stringify(booking.flight || {}),
            JSON.stringify(booking.passengers || []),
            JSON.stringify(booking.contact || {}),
            JSON.stringify(booking.extras || {}),
            booking.total || 0,
            booking.payment ? JSON.stringify(booking.payment) : null,
            now,
          ]
        );
      } else {
        const existsIdx = global.__bookings.findIndex((b) => b.ref === booking.ref);
        if (existsIdx === -1) {
          booking.createdAt = new Date().toISOString();
          booking.status = booking.status || 'new';
          global.__bookings.unshift(booking);
        } else {
          const old = global.__bookings[existsIdx];
          global.__bookings[existsIdx] = { 
            ...old, 
            ...booking, 
            status: booking.status || old.status,
            createdAt: old.createdAt
          };
        }
      }

      return res.json({ ok: true, id: booking.ref });
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

      if (dbReady) {
        const result = await query(
          "UPDATE bc_bookings SET status = 'issued', ticket = $1, updated_at = NOW() WHERE ref = $2 RETURNING *",
          [JSON.stringify(ticket), id]
        );
        if (result.rows.length === 0) return res.status(404).json({ ok: false, error: 'Booking not found' });
        return res.json({ ok: true, booking: rowToBooking(result.rows[0]) });
      }
      const idx = global.__bookings.findIndex((b) => b.ref === id);
      if (idx === -1) return res.status(404).json({ ok: false, error: 'Booking not found' });
      global.__bookings[idx].status = 'issued';
      global.__bookings[idx].ticket = ticket;
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
    ticket: row.ticket || null,
    downloadCount: row.download_count || 0,
    createdAt: row.created_at,
  };
}
