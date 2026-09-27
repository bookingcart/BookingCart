"use strict";

const { query, isDbConfigured, initDb } = require("../lib/db");
const { applyCors } = require("../lib/cors");
const { requireAdminEmail } = require("../lib/admin");
const { verifyRequestBearer } = require("../lib/google-verify");
const { createAviationService, buildFlightReport } = require("../lib/aviation");

let runtime = null;

function resetAviationRuntime() {
  runtime = null;
}

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS bc_aviation_records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_aviation_records_kind ON bc_aviation_records (kind)`);
}

async function hydrate(service) {
  const result = await query(`SELECT id, kind, payload FROM bc_aviation_records`);
  for (const row of result.rows) {
    const payload = row.payload || {};
    if (row.kind === "operator") service.operators.set(payload.id || row.id, payload);
    if (row.kind === "aircraft") service.aircraftMap.set(payload.id || row.id, payload);
    if (row.kind === "charter") service.charters.set(payload.ref || row.id, payload);
    if (row.kind === "booking") service.bookings.set(payload.ref || row.id, payload);
    if (row.kind === "itinerary") service.itineraries.set(payload.ref || row.id, payload);
    if (row.kind === "review") service.reviews.push(payload);
    if (row.kind === "dispute") service.disputes.push(payload);
    if (row.kind === "airport") {
      const index = service.airports.findIndex((item) => item.code === payload.code);
      if (index >= 0) service.airports[index] = payload;
      else service.airports.push(payload);
    }
  }
}

async function persistRecord(kind, id, payload) {
  await query(
    `INSERT INTO bc_aviation_records (id, kind, payload, updated_at)
     VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, kind = EXCLUDED.kind, updated_at = CURRENT_TIMESTAMP`,
    [id, kind, JSON.stringify(payload)]
  );
}

async function getRuntime() {
  if (runtime) return runtime;
  const service = createAviationService();
  runtime = { service, dbReady: false };
  if (isDbConfigured()) {
    try {
      await initDb();
      await ensureTables();
      await hydrate(service);
      runtime.dbReady = true;
    } catch (error) {
      console.warn("[aviation] DB unavailable, using memory:", error.message);
    }
  }
  return runtime;
}

async function persist(runtimeState, records) {
  if (!runtimeState.dbReady) return;
  for (const record of records) {
    await persistRecord(record.kind, record.id, record.payload);
  }
}

function actionOf(req) {
  const pathAction = String(req.params?.action || "").trim();
  const queryAction = String(req.query?.action || "").trim();
  const bodyAction = String(req.body?.action || "").trim();
  return pathAction || queryAction || bodyAction;
}

function queryValue(req, key) {
  return req.query?.[key] ?? req.body?.[key];
}

module.exports = async function aviationHandler(req, res) {
  applyCors(req, res);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ ok: false, error: "Method not allowed" });

  const runtimeState = await getRuntime();
  const service = runtimeState.service;
  const action = actionOf(req);
  const body = req.body || {};

  try {
    if (action === "catalog") return res.json({ ok: true, ...service.catalog() });

    if (action === "airports") {
      return res.json({ ok: true, airports: service.searchAirports({ q: queryValue(req, "q"), type: queryValue(req, "type") }) });
    }

    if (action === "search") {
      const result = service.search({
        origin: queryValue(req, "origin"),
        destination: queryValue(req, "destination"),
        tripType: queryValue(req, "tripType"),
        departDate: queryValue(req, "departDate"),
        returnDate: queryValue(req, "returnDate"),
        passengers: queryValue(req, "passengers"),
        category: queryValue(req, "category"),
        service: queryValue(req, "service"),
        budgetMin: queryValue(req, "budgetMin"),
        budgetMax: queryValue(req, "budgetMax"),
        manufacturer: queryValue(req, "manufacturer"),
        minRange: queryValue(req, "minRange"),
        amenities: queryValue(req, "amenities"),
        petFriendly: queryValue(req, "petFriendly"),
        smoking: queryValue(req, "smoking"),
        scope: queryValue(req, "scope"),
      });
      if (!result.ok) return res.status(400).json({ ok: false, error: result.errors[0], errors: result.errors });
      return res.json({ ok: true, origin: result.origin, destination: result.destination, count: result.results.length, results: result.results });
    }

    if (action === "aircraft") {
      const item = service.getAircraft(String(queryValue(req, "id") || ""));
      if (!item) return res.status(404).json({ ok: false, error: "Aircraft not found" });
      return res.json({ ok: true, aircraft: item });
    }

    if (action === "preset") {
      const preset = service.presetItinerary(String(queryValue(req, "preset") || "murchison"), req.query || {});
      if (!preset.ok) return res.status(400).json(preset);
      return res.json(preset);
    }

    if (action === "analytics" && req.method === "GET") {
      return res.json({ ok: true, analytics: service.analytics() });
    }

    if (action === "booking" && req.method === "GET") {
      const booking = service.getBooking(String(queryValue(req, "ref") || ""));
      if (!booking) return res.status(404).json({ ok: false, error: "Booking not found" });
      const aircraft = service.getAircraft(booking.aircraftId);
      return res.json({ ok: true, booking, report: buildFlightReport(booking, aircraft) });
    }

    if (action === "itinerary" && req.method === "GET") {
      const itinerary = service.getItinerary(String(queryValue(req, "ref") || ""));
      if (!itinerary) return res.status(404).json({ ok: false, error: "Itinerary not found" });
      return res.json({ ok: true, itinerary });
    }

    const auth = await verifyRequestBearer(req);
    const email = auth.ok ? auth.email.toLowerCase() : "";

    if (action === "operator-get") {
      if (!auth.ok) return res.status(401).json({ ok: false, error: "Authentication required" });
      return res.json({ ok: true, portal: service.getOperator(email) });
    }

    if (action === "bookings") {
      if (!auth.ok) return res.status(401).json({ ok: false, error: "Authentication required" });
      return res.json({ ok: true, bookings: service.listBookings({ email }) });
    }

    if (action === "charters" && req.method === "GET") {
      if (!auth.ok) return res.status(401).json({ ok: false, error: "Authentication required" });
      return res.json({ ok: true, charters: service.listCharters({ email }) });
    }

    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    if (action === "operator-save") {
      if (!auth.ok) return res.status(401).json({ ok: false, error: "Authentication required" });
      const saved = service.saveOperator(email, body);
      if (!saved.ok) return res.status(400).json(saved);
      await persist(runtimeState, [{ kind: "operator", id: saved.operator.id, payload: saved.operator }]);
      return res.json(saved);
    }

    if (action === "aircraft-save") {
      if (!auth.ok) return res.status(401).json({ ok: false, error: "Authentication required" });
      const saved = service.saveAircraft(email, body);
      if (!saved.ok) return res.status(400).json(saved);
      await persist(runtimeState, [{ kind: "aircraft", id: saved.aircraft.id, payload: saved.aircraft }]);
      return res.json(saved);
    }

    if (action === "aircraft-ops") {
      if (!auth.ok) return res.status(401).json({ ok: false, error: "Authentication required" });
      const saved = service.setAircraftOps(email, body.aircraftId, body);
      if (!saved.ok) return res.status(400).json(saved);
      await persist(runtimeState, [{ kind: "aircraft", id: saved.aircraft.id, payload: saved.aircraft }]);
      return res.json(saved);
    }

    if (action === "charter-create") {
      const created = service.createCharter({ ...body, email: body.email || email });
      if (!created.ok) return res.status(400).json(created);
      await persist(runtimeState, [{ kind: "charter", id: created.charter.ref, payload: created.charter }]);
      return res.json(created);
    }

    if (action === "quotation") {
      if (!auth.ok) return res.status(401).json({ ok: false, error: "Authentication required" });
      const quoted = service.operatorCharterAction(email, body.charterRef, body);
      if (!quoted.ok) return res.status(400).json(quoted);
      await persist(runtimeState, [{ kind: "charter", id: quoted.charter.ref, payload: quoted.charter }]);
      return res.json(quoted);
    }

    if (action === "charter-decide") {
      if (!auth.ok) return res.status(401).json({ ok: false, error: "Authentication required" });
      const decided = service.decideCharter(email, body.charterRef, body);
      if (!decided.ok) return res.status(400).json(decided);
      const records = [{ kind: "charter", id: decided.charter.ref, payload: decided.charter }];
      if (decided.booking) records.push({ kind: "booking", id: decided.booking.ref, payload: decided.booking });
      await persist(runtimeState, records);
      return res.json(decided);
    }

    if (action === "booking-create") {
      const created = service.createBooking({ ...body, email: body.email || email });
      if (!created.ok) return res.status(400).json(created);
      await persist(runtimeState, [{ kind: "booking", id: created.booking.ref, payload: created.booking }]);
      return res.json(created);
    }

    if (action === "booking-confirm") {
      const existing = service.getBooking(body.ref);
      if (!existing) return res.status(404).json({ ok: false, error: "Booking not found" });
      const requester = (body.email || email || "").toLowerCase();
      if (!requester || requester !== existing.email) return res.status(403).json({ ok: false, error: "You cannot confirm this booking" });
      const confirmed = service.confirmBooking(body.ref, body.payment || body);
      await persist(runtimeState, [{ kind: "booking", id: confirmed.booking.ref, payload: confirmed.booking }]);
      return res.json(confirmed);
    }

    if (action === "crew") {
      if (!auth.ok) return res.status(401).json({ ok: false, error: "Authentication required" });
      const assigned = service.assignCrew(email, body.bookingRef, body.crew);
      if (!assigned.ok) return res.status(400).json(assigned);
      await persist(runtimeState, [{ kind: "booking", id: assigned.booking.ref, payload: assigned.booking }]);
      return res.json(assigned);
    }

    if (action === "review") {
      const saved = service.addReview({ ...body, email: body.email || email });
      if (!saved.ok) return res.status(400).json(saved);
      await persist(runtimeState, [{ kind: "review", id: saved.review.id, payload: saved.review }]);
      return res.json(saved);
    }

    if (action === "itinerary-save") {
      const saved = service.saveItinerary({ ...body, email: body.email || email });
      if (!saved.ok) return res.status(400).json(saved);
      await persist(runtimeState, [{ kind: "itinerary", id: saved.itinerary.ref, payload: saved.itinerary }]);
      return res.json(saved);
    }

    if (action === "itinerary-checkout") {
      if (!auth.ok && !body.email) return res.status(401).json({ ok: false, error: "Authentication required" });
      const checked = service.checkoutItinerary(body.ref, (body.email || email).toLowerCase());
      if (!checked.ok) return res.status(400).json(checked);
      await persist(runtimeState, [{ kind: "itinerary", id: checked.itinerary.ref, payload: checked.itinerary }]);
      return res.json(checked);
    }

    if (action === "dispute") {
      const opened = service.openDispute({ ...body, email: body.email || email });
      if (!opened.ok) return res.status(400).json(opened);
      await persist(runtimeState, [{ kind: "dispute", id: opened.dispute.id, payload: opened.dispute }]);
      return res.json(opened);
    }

    if (action.startsWith("admin-")) {
      const admin = await requireAdminEmail(req);
      if (!admin.ok) return res.status(admin.status).json({ ok: false, error: admin.error });
      if (action === "admin-overview") return res.json({ ok: true, ...service.adminOverview() });
      if (action === "admin-operator") {
        const reviewed = service.reviewOperator(body.id, body.status, body.note);
        if (!reviewed.ok) return res.status(400).json(reviewed);
        await persist(runtimeState, [{ kind: "operator", id: reviewed.operator.id, payload: reviewed.operator }]);
        return res.json(reviewed);
      }
      if (action === "admin-aircraft") {
        const reviewed = service.reviewAircraft(body.id, body.status, body.note);
        if (!reviewed.ok) return res.status(400).json(reviewed);
        await persist(runtimeState, [{ kind: "aircraft", id: reviewed.aircraft.id, payload: reviewed.aircraft }]);
        return res.json(reviewed);
      }
      if (action === "admin-dispute") {
        const resolved = service.resolveDispute(body.id, body.resolution);
        if (!resolved.ok) return res.status(400).json(resolved);
        await persist(runtimeState, [{ kind: "dispute", id: resolved.dispute.id, payload: resolved.dispute }]);
        return res.json(resolved);
      }
    }

    return res.status(404).json({ ok: false, error: "Unknown aviation action" });
  } catch (error) {
    console.error("[aviation]", error);
    return res.status(500).json({ ok: false, error: "Aviation service failed" });
  }
};

module.exports.resetAviationRuntime = resetAviationRuntime;
