// api-routes/guide-bookings.js — Tour Guide booking persistence

const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { requireAdminEmail } = require('../lib/admin');
const { verifyRequestBearer } = require('../lib/google-verify');
const crypto = require('crypto');

function rowToGuideBooking(row) {
  return {
    id: row.id,
    ref: row.ref,
    guideId: row.guide_id,
    contactEmail: row.contact_email || '',
    status: row.status || 'pending',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    guests: row.guests || 1,
    total: row.total ? parseFloat(row.total) : 0,
    contact: row.contact || {},
    payment: row.payment || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let dbReady = false;
    try {
      if (isDbConfigured()) {
        await initDb();
        await query(`
          CREATE TABLE IF NOT EXISTS bc_guide_bookings (
            id SERIAL PRIMARY KEY,
            ref TEXT NOT NULL UNIQUE,
            guide_id TEXT NOT NULL,
            contact_email TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            start_date TEXT DEFAULT '',
            end_date TEXT DEFAULT '',
            guests INTEGER DEFAULT 1,
            total NUMERIC(12, 2) DEFAULT 0,
            contact JSONB DEFAULT '{}'::jsonb NOT NULL,
            payment JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        dbReady = true;
      }
    } catch (err) {
      console.warn('Postgres guide-bookings connection failed, using fallback:', err.message);
      if (!global.__guideBookings) global.__guideBookings = [];
    }

    // ── GET: lookup single booking by ref ───────────────────────────────────
    if (req.method === 'GET') {
      const ref = String(req.query?.ref || '').trim();
      if (!ref) return res.status(400).json({ ok: false, error: 'Missing booking reference' });

      let found = null;
      if (dbReady) {
        const result = await query('SELECT * FROM bc_guide_bookings WHERE ref = $1', [ref]);
        found = result.rows.length ? rowToGuideBooking(result.rows[0]) : null;
      } else {
        found = (global.__guideBookings || []).find(b => b.ref === ref) || null;
      }
      if (!found) return res.status(404).json({ ok: false, error: 'Guide booking not found' });
      return res.json({ ok: true, booking: found });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    const { action, booking, email, id, status } = req.body || {};

    // ── Save/create booking ─────────────────────────────────────────────────
    if (action === 'save') {
      if (!booking) return res.status(400).json({ ok: false, error: 'Missing booking' });
      const ref = String(booking.ref || '').trim();
      if (!ref || !/^[A-Za-z0-9._:-]{3,80}$/.test(ref)) {
        return res.status(400).json({ ok: false, error: 'Invalid booking reference' });
      }
      const guideId = String(booking.guideId || '').trim();
      const contactEmail = String((booking.contact && booking.contact.email) || '').trim().toLowerCase();
      const startDate = String(booking.startDate || '').trim();
      const endDate = String(booking.endDate || '').trim();
      const guests = Math.max(1, parseInt(booking.guests) || 1);
      const total = Math.max(0, parseFloat(booking.total) || 0);

      if (!guideId) return res.status(400).json({ ok: false, error: 'Missing guideId' });

      if (dbReady) {
        const now = new Date().toISOString();
        const paymentObj = {
          total,
          platformFee: total * 0.15,
          guideEarnings: total * 0.85,
          escrowStatus: (booking.status === 'confirmed') ? 'held' : 'pending'
        };
        await query(`
          INSERT INTO bc_guide_bookings (ref, guide_id, contact_email, status, start_date, end_date, guests, total, contact, payment, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
          ON CONFLICT (ref) DO UPDATE SET
            status = EXCLUDED.status, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
            guests = EXCLUDED.guests, total = EXCLUDED.total, contact = EXCLUDED.contact, payment = EXCLUDED.payment, updated_at = $11`,
          [ref, guideId, contactEmail, booking.status || 'pending', startDate, endDate,
           guests, total, JSON.stringify(booking.contact || {}), JSON.stringify(paymentObj), now]
        );
      } else {
        const exists = (global.__guideBookings || []).findIndex(b => b.ref === ref);
        const stored = {
          ref, guideId, contactEmail, status: booking.status || 'pending',
          startDate, endDate, guests, total,
          contact: booking.contact || {},
          payment: {
            total,
            platformFee: total * 0.15,
            guideEarnings: total * 0.85,
            escrowStatus: (booking.status || 'pending') === 'confirmed' ? 'held' : 'pending'
          },
          createdAt: new Date().toISOString()
        };
        if (exists === -1) {
          global.__guideBookings = [stored, ...(global.__guideBookings || [])];
        } else {
          global.__guideBookings[exists] = { ...global.__guideBookings[exists], ...stored };
        }
      }
      return res.json({ ok: true, id: ref });
    }

    // ── List all (admin only) ───────────────────────────────────────────────
    if (action === 'list') {
      const gate = await requireAdminEmail(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });
      let all = [];
      if (dbReady) {
        const result = await query('SELECT * FROM bc_guide_bookings ORDER BY created_at DESC');
        all = result.rows.map(rowToGuideBooking);
      } else {
        all = global.__guideBookings || [];
      }
      return res.json({ ok: true, bookings: all });
    }

    // ── Lookup own bookings ─────────────────────────────────────────────────
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
          'SELECT * FROM bc_guide_bookings WHERE LOWER(contact_email) = LOWER($1) ORDER BY created_at DESC',
          [String(email).trim()]
        );
        found = result.rows.map(rowToGuideBooking);
      } else {
        found = (global.__guideBookings || []).filter(
          b => (b.contactEmail || '').toLowerCase() === email.toLowerCase()
        );
      }
      return res.json({ ok: true, bookings: found });
    }

    // ── Lookup guide's own bookings ─────────────────────────────────────────
    if (action === 'lookup-guide') {
      const { guideId } = req.body;
      if (!guideId) return res.status(400).json({ ok: false, error: 'Missing guideId' });
      let found = [];
      if (dbReady) {
        const result = await query(
          'SELECT * FROM bc_guide_bookings WHERE guide_id = $1 ORDER BY created_at DESC',
          [guideId]
        );
        found = result.rows.map(rowToGuideBooking);
      } else {
        found = (global.__guideBookings || []).filter(b => b.guideId === guideId);
      }
      return res.json({ ok: true, bookings: found });
    }

    // ── Update status (admin only) ──────────────────────────────────────────
    if (action === 'status') {
      const gate = await requireAdminEmail(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });
      if (!id || !status) return res.status(400).json({ ok: false, error: 'Missing id or status' });
      if (dbReady) {
        const paymentRes = await query('SELECT payment FROM bc_guide_bookings WHERE ref = $1', [id]);
        let pmt = paymentRes.rows.length ? paymentRes.rows[0].payment : null;
        if (pmt) {
          pmt.escrowStatus = (status === 'confirmed') ? 'held' : pmt.escrowStatus;
          if (status === 'cancelled') pmt.escrowStatus = 'refunded';
        }
        await query('UPDATE bc_guide_bookings SET status = $1, payment = $2, updated_at = NOW() WHERE ref = $3', [status, pmt ? JSON.stringify(pmt) : null, id]);
      } else {
        const idx = (global.__guideBookings || []).findIndex(b => b.ref === id);
        if (idx > -1) {
          global.__guideBookings[idx].status = status;
          if (global.__guideBookings[idx].payment) {
            if (status === 'confirmed') global.__guideBookings[idx].payment.escrowStatus = 'held';
            if (status === 'cancelled') global.__guideBookings[idx].payment.escrowStatus = 'refunded';
          }
        }
      }
      return res.json({ ok: true });
    }

    // ── Cancel Booking (Traveler) ───────────────────────────────────────────
    if (action === 'cancel') {
      const { ref } = req.body;
      if (!ref) return res.status(400).json({ ok: false, error: 'Missing ref' });
      if (dbReady) {
        const resBooking = await query('SELECT start_date, total, payment FROM bc_guide_bookings WHERE ref = $1', [ref]);
        if (!resBooking.rows.length) return res.status(404).json({ ok: false, error: 'Booking not found' });
        
        const b = resBooking.rows[0];
        const start = new Date(b.start_date);
        const diffHrs = (start.getTime() - Date.now()) / (1000 * 60 * 60);
        let refundPct = 0;
        if (diffHrs > 7 * 24) refundPct = 100;
        else if (diffHrs >= 48) refundPct = 50;
        else if (diffHrs >= 24) refundPct = 50; // Between 24 and 48 hrs is 50%
        else refundPct = 0;
        
        let pmt = b.payment || {};
        pmt.escrowStatus = 'refunded';
        pmt.refundPercent = refundPct;
        
        await query('UPDATE bc_guide_bookings SET status = $1, payment = $2, updated_at = NOW() WHERE ref = $3', ['cancelled', JSON.stringify(pmt), ref]);
        return res.json({ ok: true, refundPercent: refundPct });
      } else {
        const idx = (global.__guideBookings || []).findIndex(bk => bk.ref === ref);
        if (idx > -1) {
          const start = new Date(global.__guideBookings[idx].startDate);
          const diffHrs = (start.getTime() - Date.now()) / (1000 * 60 * 60);
          let refundPct = 0;
          if (diffHrs > 7 * 24) refundPct = 100;
          else if (diffHrs >= 24) refundPct = 50;
          
          global.__guideBookings[idx].status = 'cancelled';
          if (global.__guideBookings[idx].payment) {
            global.__guideBookings[idx].payment.escrowStatus = 'refunded';
            global.__guideBookings[idx].payment.refundPercent = refundPct;
          }
          return res.json({ ok: true, refundPercent: refundPct });
        }
      }
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    // ── Mark Complete (Guide) ───────────────────────────────────────────────
    if (action === 'mark-complete') {
      const { ref } = req.body;
      if (!ref) return res.status(400).json({ ok: false, error: 'Missing ref' });
      if (dbReady) {
        await query('UPDATE bc_guide_bookings SET status = $1, updated_at = NOW() WHERE ref = $2', ['pending_traveler_confirmation', ref]);
      } else {
        const idx = (global.__guideBookings || []).findIndex(bk => bk.ref === ref);
        if (idx > -1) global.__guideBookings[idx].status = 'pending_traveler_confirmation';
      }
      return res.json({ ok: true });
    }

    // ── Traveler Confirm & Release Escrow ───────────────────────────────────
    if (action === 'traveler-confirm') {
      const { ref } = req.body;
      if (!ref) return res.status(400).json({ ok: false, error: 'Missing ref' });
      if (dbReady) {
        const resB = await query('SELECT payment FROM bc_guide_bookings WHERE ref = $1', [ref]);
        let pmt = resB.rows.length ? resB.rows[0].payment : null;
        if (pmt) {
          pmt.escrowStatus = 'released';
          pmt.releasedAt = new Date().toISOString();
        }
        await query('UPDATE bc_guide_bookings SET status = $1, payment = $2, updated_at = NOW() WHERE ref = $3', ['completed', JSON.stringify(pmt), ref]);
      } else {
        const idx = (global.__guideBookings || []).findIndex(bk => bk.ref === ref);
        if (idx > -1) {
          global.__guideBookings[idx].status = 'completed';
          if (global.__guideBookings[idx].payment) {
            global.__guideBookings[idx].payment.escrowStatus = 'released';
            global.__guideBookings[idx].payment.releasedAt = new Date().toISOString();
          }
        }
      }
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    console.error('Guide bookings API error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
