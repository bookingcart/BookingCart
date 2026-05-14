// api/bookings.js – persist flight bookings (MongoDB or local fallback)

const { getCollections } = require('../lib/mongo');
const { applyCors } = require('../lib/cors');
const { requireAdminEmail } = require('../lib/admin');
const { verifyRequestBearer } = require('../lib/google-verify');

async function connectToDatabase() {
  try {
    const { bookings } = await getCollections();
    return { collection: bookings };
  } catch (err) {
    console.warn('MongoDB bookings connection failed, using fallback store:', err.message);
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
    if (!global.__bookings) global.__bookings = [];
    return { collection: null };
  }
}

module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const { action, booking, email, id, status, pin } = req.body || {};

  try {
    const { collection } = await connectToDatabase();

    if (process.env.NODE_ENV === 'production' && !collection) {
      return res.status(503).json({ ok: false, error: 'Database is not configured (MONGODB_URI)' });
    }

    if (action === 'save') {
      if (!booking) return res.status(400).json({ ok: false, error: 'Missing booking' });

      if (collection) {
        const now = new Date().toISOString();
        const safeUpdate = {
          $setOnInsert: {
            status: 'new',
            createdAt: now
          },
          $set: {
            ref: booking.ref,
            status: booking.status || 'new',
            route: booking.route,
            dates: booking.dates,
            flight: booking.flight,
            passengers: booking.passengers,
            contact: booking.contact,
            extras: booking.extras,
            total: booking.total,
            payment: booking.payment || null
          }
        };
        await collection.updateOne({ ref: booking.ref }, safeUpdate, { upsert: true });
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
      if (collection) {
        all = await collection.find({}).sort({ createdAt: -1 }).toArray();
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
      if (collection) {
        found = await collection
          .find({
            'contact.email': { $regex: new RegExp('^' + escapeRegex(String(email).trim()) + '$', 'i') }
          })
          .sort({ createdAt: -1 })
          .toArray();
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

      if (collection) {
        const doc = await collection.findOneAndUpdate(
          { ref: id },
          { $set: { status: status } },
          { returnDocument: 'after' }
        );
        if (!doc) return res.status(404).json({ ok: false, error: 'Booking not found' });
        return res.json({ ok: true, booking: doc });
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

      if (collection) {
        const b = await collection.findOne({ ref: id });
        if (!b) return res.status(404).json({ ok: false, error: 'Booking not found' });
        const em = ((b.contact && b.contact.email) || '').trim().toLowerCase();
        if (!em || em !== auth.email) {
          return res.status(403).json({ ok: false, error: 'Not allowed for this booking' });
        }
        await collection.updateOne({ ref: id }, { $set: { status: 'cancelled' } });
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

      if (collection) {
        await collection.deleteOne({ ref: id });
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

      if (collection) {
        const doc = await collection.findOneAndUpdate(
          { ref: id },
          { $set: { status: 'issued', ticket: ticket } },
          { returnDocument: 'after' }
        );
        if (!doc) return res.status(404).json({ ok: false, error: 'Booking not found' });
        return res.json({ ok: true, booking: doc });
      }
      const idx = global.__bookings.findIndex((b) => b.ref === id);
      if (idx === -1) return res.status(404).json({ ok: false, error: 'Booking not found' });
      global.__bookings[idx].status = 'issued';
      global.__bookings[idx].ticket = ticket;
      return res.json({ ok: true, booking: global.__bookings[idx] });
    }

    if (action === 'track_download') {
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

      if (collection) {
        await collection.updateOne({ ref: id }, { $inc: { downloadCount: 1 } });
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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
