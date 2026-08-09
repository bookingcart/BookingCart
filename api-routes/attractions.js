const crypto = require('crypto');
const { applyCors } = require('../lib/cors');
const { query, isDbConfigured, initDb } = require('../lib/db');
const { verifyRequestBearer } = require('../lib/google-verify');
const { geocodeDestination, searchAttractions, getAttraction, cleanText } = require('../lib/attractions');

const EVENT_TYPES = new Set(['search_submitted','results_loaded','results_partial','results_error','zero_results','detail_viewed','saved','unsaved','itinerary_added','itinerary_removed','map_interaction','outbound_booking_click']);

function numberParam(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function parseSearch(req) {
  const q = cleanText(req.query.q, 120);
  const lat = Number(req.query.lat); const lon = Number(req.query.lon);
  return {
    q, lat, lon,
    radius: numberParam(req.query.radius, 12000, 500, 50000),
    bounds: /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(String(req.query.bounds || '')) ? String(req.query.bounds) : '',
    categories: cleanText(req.query.categories, 240), bookable: String(req.query.bookable) === '1',
    sort: ['relevance','distance','name'].includes(req.query.sort) ? req.query.sort : 'relevance',
    page: numberParam(req.query.page, 1, 1, 100), limit: numberParam(req.query.limit, 30, 1, 50),
    currency: /^[A-Z]{3}$/.test(String(req.query.currency || '').toUpperCase()) ? String(req.query.currency).toUpperCase() : 'USD',
    language: /^[a-z]{2,3}$/.test(String(req.query.language || '').toLowerCase()) ? String(req.query.language).toLowerCase() : 'en',
  };
}

async function analyticsSummary() {
  if (!isDbConfigured()) return { totals: {}, topAttractions: [] };
  try {
    await initDb();
    const [totals, top] = await Promise.all([
      query(`SELECT event_type, COUNT(*)::int AS count FROM bc_attraction_events WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY event_type`),
      query(`SELECT attraction_id, source, COUNT(*)::int AS count FROM bc_attraction_events WHERE created_at > NOW() - INTERVAL '30 days' AND event_type IN ('detail_viewed','saved','outbound_booking_click') GROUP BY attraction_id, source ORDER BY count DESC LIMIT 10`),
    ]);
    return { totals: Object.fromEntries(totals.rows.map((r) => [r.event_type, r.count])), topAttractions: top.rows };
  } catch (error) {
    if (error.code === '42P01') return { totals: {}, topAttractions: [], migrationPending: true };
    throw error;
  }
}

module.exports = async function attractionsHandler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = String(req.params?.action || '').toLowerCase();

  try {
    if (req.method === 'GET' && action === 'destinations') {
      const q = cleanText(req.query.q, 100);
      if (q.length < 2) return res.json({ ok: true, results: [] });
      const data = await geocodeDestination(q, cleanText(req.query.language, 3) || 'en');
      return res.status(data.error ? 503 : 200).json({ ok: !data.error, ...data });
    }

    if (req.method === 'GET' && action === 'search') {
      const input = parseSearch(req);
      if (!Number.isFinite(input.lat) || !Number.isFinite(input.lon) || input.lat < -90 || input.lat > 90 || input.lon < -180 || input.lon > 180) {
        return res.status(400).json({ ok: false, error: 'Choose a destination before searching' });
      }
      return res.json(await searchAttractions(input));
    }

    if (req.method === 'GET' && action === 'analytics') {
      const { requireAdminEmail } = require('../lib/admin');
      const gate = await requireAdminEmail(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });
      return res.json({ ok: true, ...(await analyticsSummary()) });
    }

    if (req.method === 'GET' && action === 'detail') {
      const source = cleanText(req.params?.source, 30);
      const id = cleanText(req.params?.id, 220);
      if (!['geoapify', 'wikimedia', 'getyourguide'].includes(source) || !id) return res.status(400).json({ ok: false, error: 'Invalid attraction identifier' });
      const attraction = await getAttraction(source, id, { currency: String(req.query.currency || 'USD').toUpperCase(), language: cleanText(req.query.language, 3) || 'en' });
      if (!attraction) return res.status(404).json({ ok: false, error: 'Attraction not found' });
      return res.json({ ok: true, attraction });
    }

    if (req.method === 'POST' && action === 'events') {
      const body = req.body || {};
      if (!EVENT_TYPES.has(body.eventType)) return res.status(400).json({ ok: false, error: 'Invalid attraction event' });
      if (!isDbConfigured()) return res.json({ ok: true, persisted: false });
      let email = '';
      const auth = await verifyRequestBearer(req);
      if (auth.ok) email = auth.email;
      const forwarded = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
      const sessionHash = crypto.createHash('sha256').update(`${process.env.JWT_SECRET || 'local'}:${cleanText(body.sessionId, 120)}:${forwarded}`).digest('hex');
      try {
        await initDb();
        await query(`INSERT INTO bc_attraction_events (session_hash, user_email, event_type, attraction_id, source, destination, context) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [sessionHash, email || null, body.eventType, cleanText(body.attractionId, 220) || null, cleanText(body.source, 40) || null, cleanText(body.destination, 160) || null, body.context && typeof body.context === 'object' ? body.context : {}]);
        return res.json({ ok: true, persisted: true });
      } catch (error) {
        if (error.code === '42P01') return res.json({ ok: true, persisted: false, migrationPending: true });
        throw error;
      }
    }

    return res.status(404).json({ ok: false, error: 'Attractions endpoint not found' });
  } catch (error) {
    console.error('[Attractions]', error);
    const unavailable = /not configured|returned|abort/i.test(error.message || '');
    return res.status(unavailable ? 503 : 500).json({ ok: false, error: unavailable ? 'Attraction providers are temporarily unavailable' : 'Unable to process attraction request' });
  }
};
