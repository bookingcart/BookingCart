// api-routes/attraction-profiles.js
// Manages client-owned attraction listings (not external API attractions).
//
// Actions:
//   GET  (auth)                            — list all attractions owned by the logged-in user
//   POST { action: 'create', data }        — create a new draft attraction
//   POST { action: 'save', id, step, data }— save/update an attraction
//   POST { action: 'delete', id }          — soft-delete an attraction
//   POST { action: 'duplicate', id }       — duplicate an existing attraction
//   POST { action: 'submit', id }          — submit for admin review
//   POST { action: 'admin-list' }          — admin: list all (any status)
//   POST { action: 'admin-review', id, status, note } — admin approve/reject
//   GET  ?action=event-listings            — "List your event or attraction" drafts the owner can import
//   POST { action: 'import-event', eventId } — turn one of those into a ticketable attraction

const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { requireAdminEmail } = require('../lib/admin');
const { verifyRequestBearer } = require('../lib/google-verify');
const T = require('../lib/ticketing');
const { TICKET_CATEGORIES } = T;

// ─── In-memory fallback ───────────────────────────────────────────────────────
function getMemStore() {
  if (!global.__bc_attraction_profiles) global.__bc_attraction_profiles = new Map();
  return global.__bc_attraction_profiles;
}
let _memIdSeq = 1;
function nextMemId() { return _memIdSeq++; }

// ─── Completeness calculator ──────────────────────────────────────────────────
function calcCompleteness(p) {
  let score = 0;
  if (p.name && p.name.length > 3) score += 20;
  if (p.category) score += 10;
  if (p.city || p.location) score += 10;
  if (p.description && p.description.length >= 50) score += 20;
  if (p.featured_image) score += 20;
  const gallery = Array.isArray(p.gallery) ? p.gallery : [];
  if (gallery.length >= 3) score += 10;
  const contact = p.contact || {};
  if (contact.email || contact.phone) score += 10;
  return Math.min(100, score);
}

// ─── Serialize memory profile to match DB shape ───────────────────────────────
function dbShape(p) {
  return {
    ...p,
    gallery: Array.isArray(p.gallery) ? p.gallery : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    highlights: Array.isArray(p.highlights) ? p.highlights : [],
    amenities: Array.isArray(p.amenities) ? p.amenities : [],
    contact: p.contact || {},
    opening_hours: p.opening_hours || {},
  };
}

// ─── Event listings → attraction listings ─────────────────────────────────────
//
// The "List your event or attraction" wizard writes bc_event_profiles, but the
// ticket office only reads bc_attraction_profiles. A listing created through the
// wizard is therefore invisible to Ticketing Management and Physical Ticket
// Sales, and the dashboard cannot even say why. These helpers let the owner
// import such a listing instead of retyping it, once, under their own account.

function ownerKey(email) {
  return String(email || '').trim().toLowerCase();
}

function eventGalleryUrls(event) {
  const list = event?.step_gallery?.list;
  if (!Array.isArray(list)) return [];
  return list.map((item) => String((item && (item.url || item.image)) || '')).filter(Boolean);
}

function eventTicketList(event) {
  const list = event?.step_tickets?.list;
  if (!Array.isArray(list)) return [];
  return list
    .map((raw) => {
      const ticket = raw || {};
      const type = String(ticket.type || '').trim().toLowerCase();
      return {
        name: String(ticket.name || '').trim(),
        category: TICKET_CATEGORIES.includes(type) ? type : 'adult',
        price: Number(ticket.price) || 0,
        currency: String(ticket.currency || '').trim().toUpperCase(),
      };
    })
    .filter((ticket) => ticket.name);
}

async function listImportableEventListings(email) {
  const key = ownerKey(email);
  const events = await query(
    `SELECT id, status, step_event_info, step_location, step_tickets, created_at
       FROM bc_event_profiles
      WHERE LOWER(BTRIM(email)) = $1
      ORDER BY id DESC`,
    [key]
  );
  const mine = await query(
    `SELECT id, LOWER(BTRIM(name)) AS name FROM bc_attraction_profiles
      WHERE LOWER(BTRIM(owner_email)) = $1 AND deleted IS NOT TRUE`,
    [key]
  );
  const imported = new Map(mine.rows.map((row) => [row.name, row.id]));

  return events.rows.map((row) => {
    const info = row.step_event_info || {};
    const loc = row.step_location || {};
    const name = String(info.eventName || info.name || '').trim() || `Listing #${row.id}`;
    return {
      id: row.id,
      name,
      eventType: String(info.eventType || info.category || '').trim(),
      city: String(loc.city || '').trim(),
      country: String(loc.country || '').trim(),
      status: row.status || 'draft',
      ticketCount: eventTicketList(row).length,
      importedAttractionId: imported.get(name.toLowerCase()) || null,
    };
  });
}

async function importEventListing(event, ownerEmail) {
  const info = event.step_event_info || {};
  const loc = event.step_location || {};
  const contact = event.step_contact || {};
  const policies = event.step_policies || {};
  const gallery = eventGalleryUrls(event);
  const tickets = eventTicketList(event);
  const name = String(info.eventName || info.name || '').trim();
  if (name.length < 2) return { ok: false, status: 400, error: 'This listing has no name to import' };

  // Same name + same owner means it was already imported: return it untouched so
  // a double click can never create duplicate listings or duplicate ticket types.
  const existing = await query(
    `SELECT * FROM bc_attraction_profiles
      WHERE LOWER(BTRIM(owner_email)) = $1 AND LOWER(BTRIM(name)) = $2 AND deleted IS NOT TRUE
      LIMIT 1`,
    [ownerKey(ownerEmail), name.toLowerCase()]
  );
  if (existing.rows.length) {
    const attraction = existing.rows[0];
    return { ok: true, created: false, attraction, ticketTypes: await T.listTicketTypes(attraction.id) };
  }

  const currency = tickets.find((ticket) => /^[A-Z]{3}$/.test(ticket.currency))?.currency || 'USD';
  const banner = String(event.ticket_banner_image || '').trim();
  const fields = {
    name,
    category: String(info.eventType || info.category || '').trim(),
    location: String(loc.address || '').trim(),
    country: String(loc.country || '').trim(),
    city: String(loc.city || '').trim(),
    description: String(info.description || '').trim(),
    featured_image: banner || gallery[0] || '',
    gallery: banner ? [banner, ...gallery] : gallery,
    tags: [],
    price: tickets.length ? Math.min(...tickets.map((ticket) => ticket.price)) : 0,
    currency,
    duration: String(info.duration || '').trim(),
    highlights: [],
    contact: {
      email: String(contact.bookingEmail || contact.email || ownerEmail).trim(),
      phone: String(contact.phone || '').trim(),
      website: String(contact.website || '').trim(),
    },
    opening_hours: { open: String(policies.startTime || ''), close: String(policies.endTime || '') },
    amenities: [],
    status: 'pending',
  };
  fields.completeness = calcCompleteness(fields);

  const inserted = await query(
    `INSERT INTO bc_attraction_profiles
      (owner_email, name, category, location, country, city, description, featured_image,
       gallery, tags, price, currency, duration, highlights, contact, opening_hours, amenities,
       status, completeness, views, bookings, deleted, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0,0,false,NOW(),NOW())
     RETURNING *`,
    [
      ownerEmail, fields.name, fields.category, fields.location, fields.country, fields.city,
      fields.description, fields.featured_image, JSON.stringify(fields.gallery), JSON.stringify(fields.tags),
      fields.price, fields.currency, fields.duration, JSON.stringify(fields.highlights),
      JSON.stringify(fields.contact), JSON.stringify(fields.opening_hours), JSON.stringify(fields.amenities),
      fields.status, fields.completeness,
    ]
  );
  const attraction = inserted.rows[0];

  // Bring the ticket options across so the ticket office can trade immediately.
  // The listing's stated capacity becomes the daily cap; the owner can change it.
  const dailyCapacity = Math.max(0, parseInt(info.totalCapacity, 10) || 0);
  const ticketTypes = [];
  for (const [index, ticket] of tickets.entries()) {
    const saved = await T.saveTicketType(attraction.id, ownerEmail, {
      name: ticket.name,
      category: ticket.category,
      price: ticket.price,
      currency: /^[A-Z]{3}$/.test(ticket.currency) ? ticket.currency : currency,
      admissions: 1,
      dailyCapacity,
      minPerOrder: 1,
      maxPerOrder: 10,
      refundPolicy: 'flexible',
      sortOrder: index,
    });
    if (saved.ok) ticketTypes.push(saved.ticketType);
  }

  // Ticket settings default to USD, which would make the till quote imported
  // shilling prices as dollars. The listing's own currency wins.
  const pricedCurrency = ticketTypes.find((type) => type.currency)?.currency || currency;
  const settings = await T.saveSettings(attraction.id, { currency: pricedCurrency });
  if (settings) attraction.currency = settings.currency;

  return { ok: true, created: true, attraction, ticketTypes };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
module.exports = async function attractionProfilesHandler(req, res) {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let dbReady = false;
  try {
    if (isDbConfigured()) {
      await initDb();
      dbReady = true;
    }
  } catch (err) {
    console.warn('[attraction-profiles] DB unavailable, using memory:', err.message);
  }

  // ── GET: list all attractions for authenticated user ──────────────────────
  if (req.method === 'GET') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    // Listings made with the "List your event or attraction" wizard live in
    // bc_event_profiles. Offer them here so the owner can import them instead of
    // being told "no attractions" with no explanation.
    if (String(req.query.action || '').toLowerCase() === 'event-listings') {
      if (!dbReady) return res.status(503).json({ ok: false, error: 'Listing import requires the database' });
      try {
        const listings = await listImportableEventListings(auth.email);
        return res.json({ ok: true, signedInAs: auth.email, listings });
      } catch (err) {
        console.error('[attraction-profiles] event-listings error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to load your listings' });
      }
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status || '';
    const search = String(req.query.search || '').trim().toLowerCase();

    try {
      if (dbReady) {
        let whereClauses = ["LOWER(BTRIM(COALESCE(owner_email, ''))) = $1", 'deleted IS NOT TRUE'];
        const params = [ownerKey(auth.email)];
        let idx = 2;

        if (status) {
          whereClauses.push(`status = $${idx++}`);
          params.push(status);
        }
        if (search) {
          whereClauses.push(`(LOWER(name) LIKE $${idx} OR LOWER(category) LIKE $${idx} OR LOWER(city) LIKE $${idx})`);
          params.push(`%${search}%`);
          idx++;
        }

        const where = whereClauses.join(' AND ');
        const countRes = await query(`SELECT COUNT(*) as total FROM bc_attraction_profiles WHERE ${where}`, params);
        const total = parseInt(countRes.rows[0]?.total || 0);

        const listRes = await query(
          `SELECT * FROM bc_attraction_profiles WHERE ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, limit, offset]
        );

        return res.json({ ok: true, attractions: listRes.rows, total, page, limit });
      } else {
        const store = getMemStore();
        let list = [];
        for (const [, p] of store) {
          if (p.owner_email === auth.email && !p.deleted) {
            if (!status || p.status === status) {
              if (!search || p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search)) {
                list.push(dbShape(p));
              }
            }
          }
        }
        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const total = list.length;
        list = list.slice(offset, offset + limit);
        return res.json({ ok: true, attractions: list, total, page, limit });
      }
    } catch (err) {
      console.error('[attraction-profiles] GET error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to load attractions' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const body = req.body || {};
  const { action } = body;

  // ── IMPORT an event/attraction listing into a ticketable attraction ───────
  if (action === 'import-event') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });
    if (!dbReady) return res.status(503).json({ ok: false, error: 'Importing a listing requires the database' });

    const eventId = parseInt(body.eventId, 10);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ ok: false, error: 'Choose a listing to import' });
    }

    try {
      const found = await query(
        `SELECT * FROM bc_event_profiles WHERE id = $1 AND LOWER(BTRIM(email)) = $2`,
        [eventId, ownerKey(auth.email)]
      );
      if (!found.rows.length) {
        return res.status(404).json({ ok: false, error: 'That listing is not on your account' });
      }
      const outcome = await importEventListing(found.rows[0], auth.email);
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.status(outcome.created ? 201 : 200).json({
        ok: true,
        created: outcome.created,
        attraction: outcome.attraction,
        ticketTypes: outcome.ticketTypes,
      });
    } catch (err) {
      console.error('[attraction-profiles] import-event error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to import the listing' });
    }
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (action === 'create') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const data = body.data || {};
    const now = new Date().toISOString();

    const fields = {
      owner_email: auth.email,
      name: String(data.name || '').trim(),
      category: String(data.category || '').trim(),
      location: String(data.location || '').trim(),
      country: String(data.country || '').trim(),
      city: String(data.city || '').trim(),
      description: String(data.description || '').trim(),
      featured_image: String(data.featured_image || '').trim(),
      gallery: Array.isArray(data.gallery) ? data.gallery : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      price: parseFloat(data.price) || 0,
      currency: String(data.currency || 'USD').toUpperCase(),
      duration: String(data.duration || '').trim(),
      highlights: Array.isArray(data.highlights) ? data.highlights : [],
      contact: data.contact || {},
      opening_hours: data.opening_hours || {},
      amenities: Array.isArray(data.amenities) ? data.amenities : [],
      status: 'draft',
    };
    fields.completeness = calcCompleteness(fields);

    try {
      let newProfile;
      if (dbReady) {
        const r = await query(
          `INSERT INTO bc_attraction_profiles
            (owner_email, name, category, location, country, city, description, featured_image,
             gallery, tags, price, currency, duration, highlights, contact, opening_hours, amenities,
             status, completeness, views, bookings, deleted, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0,0,false,NOW(),NOW())
           RETURNING *`,
          [
            fields.owner_email, fields.name, fields.category, fields.location,
            fields.country, fields.city, fields.description, fields.featured_image,
            JSON.stringify(fields.gallery), JSON.stringify(fields.tags), fields.price,
            fields.currency, fields.duration, JSON.stringify(fields.highlights),
            JSON.stringify(fields.contact), JSON.stringify(fields.opening_hours),
            JSON.stringify(fields.amenities), fields.status, fields.completeness
          ]
        );
        newProfile = r.rows[0];
      } else {
        const id = nextMemId();
        newProfile = { ...fields, id, views: 0, bookings: 0, deleted: false, admin_note: '', created_at: now, updated_at: now };
        getMemStore().set(id, newProfile);
        newProfile = dbShape(newProfile);
      }
      return res.status(201).json({ ok: true, attraction: newProfile });
    } catch (err) {
      console.error('[attraction-profiles] CREATE error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to create attraction' });
    }
  }

  // ── SAVE (update) ─────────────────────────────────────────────────────────
  if (action === 'save') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const { id, data } = body;
    if (!id) return res.status(400).json({ ok: false, error: 'Missing attraction id' });

    try {
      if (dbReady) {
        // Verify ownership first
        const check = await query(
          `SELECT id FROM bc_attraction_profiles WHERE id = $1 AND owner_email = $2 AND deleted = false`,
          [id, auth.email]
        );
        if (!check.rows.length) return res.status(404).json({ ok: false, error: 'Attraction not found or access denied' });

        const d = data || {};
        const completeness = calcCompleteness(d);

        const r = await query(
          `UPDATE bc_attraction_profiles SET
            name = COALESCE($1, name),
            category = COALESCE($2, category),
            location = COALESCE($3, location),
            country = COALESCE($4, country),
            city = COALESCE($5, city),
            description = COALESCE($6, description),
            featured_image = COALESCE($7, featured_image),
            gallery = COALESCE($8, gallery),
            tags = COALESCE($9, tags),
            price = COALESCE($10, price),
            currency = COALESCE($11, currency),
            duration = COALESCE($12, duration),
            highlights = COALESCE($13, highlights),
            contact = COALESCE($14, contact),
            opening_hours = COALESCE($15, opening_hours),
            amenities = COALESCE($16, amenities),
            completeness = $17,
            updated_at = NOW()
          WHERE id = $18 AND owner_email = $19
          RETURNING *`,
          [
            d.name || null, d.category || null, d.location || null, d.country || null,
            d.city || null, d.description || null, d.featured_image || null,
            d.gallery ? JSON.stringify(d.gallery) : null,
            d.tags ? JSON.stringify(d.tags) : null,
            d.price != null ? parseFloat(d.price) : null, d.currency || null, d.duration || null,
            d.highlights ? JSON.stringify(d.highlights) : null,
            d.contact ? JSON.stringify(d.contact) : null,
            d.opening_hours ? JSON.stringify(d.opening_hours) : null,
            d.amenities ? JSON.stringify(d.amenities) : null,
            completeness, id, auth.email
          ]
        );
        return res.json({ ok: true, attraction: r.rows[0] });
      } else {
        const store = getMemStore();
        const p = store.get(Number(id)) || [...store.values()].find(p => String(p.id) === String(id));
        if (!p || p.owner_email !== auth.email || p.deleted) return res.status(404).json({ ok: false, error: 'Attraction not found' });
        Object.assign(p, data || {}, { updated_at: new Date().toISOString() });
        p.completeness = calcCompleteness(p);
        store.set(p.id, p);
        return res.json({ ok: true, attraction: dbShape(p) });
      }
    } catch (err) {
      console.error('[attraction-profiles] SAVE error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to update attraction' });
    }
  }

  // ── DELETE (soft) ─────────────────────────────────────────────────────────
  if (action === 'delete') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const { id } = body;
    if (!id) return res.status(400).json({ ok: false, error: 'Missing attraction id' });

    try {
      if (dbReady) {
        const r = await query(
          `UPDATE bc_attraction_profiles SET deleted = true, updated_at = NOW() WHERE id = $1 AND owner_email = $2 RETURNING id`,
          [id, auth.email]
        );
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Attraction not found' });
      } else {
        const store = getMemStore();
        const p = [...store.values()].find(p => String(p.id) === String(id) && p.owner_email === auth.email);
        if (!p) return res.status(404).json({ ok: false, error: 'Attraction not found' });
        p.deleted = true;
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('[attraction-profiles] DELETE error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to delete attraction' });
    }
  }

  // ── DUPLICATE ─────────────────────────────────────────────────────────────
  if (action === 'duplicate') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const { id } = body;
    if (!id) return res.status(400).json({ ok: false, error: 'Missing attraction id' });

    try {
      if (dbReady) {
        const orig = await query(
          `SELECT * FROM bc_attraction_profiles WHERE id = $1 AND owner_email = $2 AND deleted = false`,
          [id, auth.email]
        );
        if (!orig.rows.length) return res.status(404).json({ ok: false, error: 'Attraction not found' });
        const o = orig.rows[0];
        const r = await query(
          `INSERT INTO bc_attraction_profiles
            (owner_email, name, category, location, country, city, description, featured_image,
             gallery, tags, price, currency, duration, highlights, contact, opening_hours, amenities,
             status, completeness, views, bookings, deleted, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'draft',$18,0,0,false,NOW(),NOW())
           RETURNING *`,
          [
            o.owner_email, `${o.name} (Copy)`, o.category, o.location, o.country, o.city,
            o.description, o.featured_image,
            JSON.stringify(o.gallery || []), JSON.stringify(o.tags || []),
            o.price, o.currency, o.duration,
            JSON.stringify(o.highlights || []), JSON.stringify(o.contact || {}),
            JSON.stringify(o.opening_hours || {}), JSON.stringify(o.amenities || []),
            o.completeness
          ]
        );
        return res.status(201).json({ ok: true, attraction: r.rows[0] });
      } else {
        const store = getMemStore();
        const orig = [...store.values()].find(p => String(p.id) === String(id) && p.owner_email === auth.email && !p.deleted);
        if (!orig) return res.status(404).json({ ok: false, error: 'Attraction not found' });
        const now = new Date().toISOString();
        const newId = nextMemId();
        const copy = { ...orig, id: newId, name: `${orig.name} (Copy)`, status: 'draft', views: 0, bookings: 0, created_at: now, updated_at: now };
        store.set(newId, copy);
        return res.status(201).json({ ok: true, attraction: dbShape(copy) });
      }
    } catch (err) {
      console.error('[attraction-profiles] DUPLICATE error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to duplicate attraction' });
    }
  }

  // ── SUBMIT for review ─────────────────────────────────────────────────────
  if (action === 'submit') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const { id } = body;
    if (!id) return res.status(400).json({ ok: false, error: 'Missing attraction id' });

    try {
      if (dbReady) {
        const r = await query(
          `UPDATE bc_attraction_profiles SET status = 'pending', updated_at = NOW() WHERE id = $1 AND owner_email = $2 AND deleted = false RETURNING *`,
          [id, auth.email]
        );
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Attraction not found' });
        return res.json({ ok: true, attraction: r.rows[0] });
      } else {
        const store = getMemStore();
        const p = [...store.values()].find(p => String(p.id) === String(id) && p.owner_email === auth.email && !p.deleted);
        if (!p) return res.status(404).json({ ok: false, error: 'Attraction not found' });
        p.status = 'pending';
        p.updated_at = new Date().toISOString();
        return res.json({ ok: true, attraction: dbShape(p) });
      }
    } catch (err) {
      console.error('[attraction-profiles] SUBMIT error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to submit for review' });
    }
  }

  // ── ADMIN-LIST ────────────────────────────────────────────────────────────
  if (action === 'admin-list') {
    const gate = await requireAdminEmail(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });

    const { statusFilter = 'pending', page: pg = 1, limit: lm = 50 } = body;
    try {
      if (dbReady) {
        const r = await query(
          `SELECT * FROM bc_attraction_profiles WHERE status = $1 AND deleted = false ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
          [statusFilter, lm, (pg - 1) * lm]
        );
        return res.json({ ok: true, attractions: r.rows });
      } else {
        const store = getMemStore();
        const list = [...store.values()].filter(p => p.status === statusFilter && !p.deleted);
        return res.json({ ok: true, attractions: list.map(dbShape) });
      }
    } catch (err) {
      console.error('[attraction-profiles] ADMIN-LIST error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to list attractions' });
    }
  }

  // ── ADMIN-REVIEW ──────────────────────────────────────────────────────────
  if (action === 'admin-review') {
    const gate = await requireAdminEmail(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });

    const { id, status: newStatus, note } = body;
    const valid = ['approved', 'rejected', 'draft'];
    if (!id || !valid.includes(newStatus)) return res.status(400).json({ ok: false, error: 'Invalid request' });

    // Map 'approved' → 'published' in DB for clarity
    const dbStatus = newStatus === 'approved' ? 'published' : newStatus;

    try {
      if (dbReady) {
        await query(
          `UPDATE bc_attraction_profiles SET status = $1, admin_note = $2, updated_at = NOW() WHERE id = $3`,
          [dbStatus, note || '', id]
        );
      } else {
        const store = getMemStore();
        const p = [...store.values()].find(p => String(p.id) === String(id));
        if (p) { p.status = dbStatus; p.admin_note = note || ''; p.updated_at = new Date().toISOString(); }
      }
      return res.json({ ok: true, status: dbStatus });
    } catch (err) {
      console.error('[attraction-profiles] ADMIN-REVIEW error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to update status' });
    }
  }

  return res.status(400).json({ ok: false, error: 'Unknown action' });
};
