"use strict";

const { query, isDbConfigured, initDb } = require("../lib/db");
const { applyCors } = require("../lib/cors");
const { requireAdminEmail } = require("../lib/admin");
const { verifyRequestBearer } = require("../lib/google-verify");
const { createAviationService, buildFlightReport } = require("../lib/aviation");
const notificationHub = require("../lib/notification-hub");

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

async function callerEmails(req) {
  const supplied = String(queryValue(req, "email") || "").trim().toLowerCase();
  const auth = await verifyRequestBearer(req);
  const bearer = auth.ok ? String(auth.email || "").trim().toLowerCase() : "";
  return { supplied, bearer };
}

function emailOwnsRecord(ownerEmail, callers) {
  const owner = String(ownerEmail || "").trim().toLowerCase();
  if (!owner) return false;
  return callers.supplied === owner || callers.bearer === owner;
}

let stripeClient;
let stripeOverride;

function setAviationStripeClient(client) {
  stripeOverride = client;
}

function resetAviationStripeClient() {
  stripeOverride = undefined;
  stripeClient = undefined;
}

function getAviationStripeClient() {
  if (stripeOverride !== undefined) return stripeOverride;
  if (stripeClient !== undefined) return stripeClient;
  const key = String(process.env.STRIPE_SECRET_KEY || "");
  if (!key || key.startsWith("rk_")) {
    stripeClient = null;
    return null;
  }
  const Stripe = require("stripe");
  stripeClient = Stripe(key);
  return stripeClient;
}

function readCents(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function quoteAmountCents(booking) {
  const price = Number(booking?.quote?.price);
  if (!Number.isFinite(price)) return null;
  return Math.round(price * 100);
}

async function verifyAviationCardSession(stripe, { sessionId, booking } = {}) {
  if (!stripe || typeof stripe.checkout?.sessions?.retrieve !== "function") {
    return { ok: false, status: 503, error: "Card payments are not available" };
  }
  const id = String(sessionId || "").trim();
  if (!id || id.length > 255) {
    return { ok: false, status: 400, error: "A Stripe checkout session is required" };
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(id);
  } catch {
    return { ok: false, status: 400, error: "Unable to verify checkout session" };
  }

  if (!session || session.id !== id || session.payment_status !== "paid" || session.status !== "complete") {
    return { ok: false, status: 400, error: "Checkout session is not paid" };
  }
  if (session.mode && session.mode !== "payment") {
    return { ok: false, status: 400, error: "Checkout session is not a card payment" };
  }

  const bookingRef = String(session.metadata?.bookingRef || "").trim();
  const clientRef = String(session.client_reference_id || "").trim();
  if (!bookingRef || bookingRef !== booking.ref || (clientRef && clientRef !== booking.ref)) {
    return { ok: false, status: 400, error: "Checkout session does not match this booking" };
  }
  if (String(session.metadata?.paymentPurpose || "").trim().toLowerCase() !== "aviation") {
    return { ok: false, status: 400, error: "Checkout session is not an aviation payment" };
  }

  const expectedCents = quoteAmountCents(booking);
  const paidCents = readCents(session.amount_total);
  const metadataCents = readCents(session.metadata?.amountCents);
  if (expectedCents == null || expectedCents < 50 || paidCents !== expectedCents || metadataCents !== expectedCents) {
    return { ok: false, status: 400, error: "Checkout amount does not match the booking quote" };
  }

  const currency = String(session.currency || "").trim().toUpperCase();
  const expectedCurrency = String(booking.quote?.currency || "USD").trim().toUpperCase();
  if (!currency || currency !== expectedCurrency) {
    return { ok: false, status: 400, error: "Checkout currency does not match the booking quote" };
  }

  const sessionEmail = String(session.customer_email || session.customer_details?.email || "").trim().toLowerCase();
  if (sessionEmail && sessionEmail !== String(booking.email || "").toLowerCase()) {
    return { ok: false, status: 400, error: "Checkout session does not match this booking" };
  }

  return {
    ok: true,
    payment: {
      method: "card",
      sessionId: id,
      status: "paid",
      cardVerified: true,
      amountCents: paidCents,
      currency,
    },
  };
}

async function confirmAviationBooking(service, body = {}, { requesterEmail = "", stripe } = {}) {
  const existing = service.getBooking(String(body.ref || ""));
  if (!existing) return { ok: false, status: 404, error: "Booking not found" };
  const requester = String(body.email || requesterEmail || "").trim().toLowerCase();
  if (!requester || requester !== existing.email) {
    return { ok: false, status: 403, error: "You cannot confirm this booking" };
  }

  const requestedMethod = String(body.method || body.payment?.method || "").trim().toLowerCase();
  const nestedMethod = String(body.payment?.method || "").trim().toLowerCase();
  if (body.method && nestedMethod && nestedMethod !== requestedMethod) {
    return { ok: false, status: 400, error: "Choose card or invoice confirmation" };
  }

  let payment;
  if (requestedMethod === "invoice") {
    payment = { method: "invoice" };
  } else if (requestedMethod === "card") {
    const verified = await verifyAviationCardSession(stripe, {
      sessionId: body.sessionId || body.payment?.sessionId,
      booking: existing,
    });
    if (!verified.ok) return { ok: false, status: verified.status || 400, error: verified.error };
    payment = verified.payment;
  } else {
    return { ok: false, status: 400, error: "Choose card or invoice confirmation" };
  }

  const confirmed = service.confirmBooking(existing.ref, payment);
  if (!confirmed.ok) return { ok: false, status: 400, error: confirmed.error || "Unable to confirm booking" };
  return { ok: true, status: 200, booking: confirmed.booking };
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
      const admin = await requireAdminEmail(req);
      if (!admin.ok) return res.status(admin.status).json({ ok: false, error: admin.error });
      return res.json({ ok: true, analytics: service.analytics() });
    }

    if (action === "booking" && req.method === "GET") {
      const booking = service.getBooking(String(queryValue(req, "ref") || ""));
      if (!booking) return res.status(404).json({ ok: false, error: "Booking not found" });
      const callers = await callerEmails(req);
      if (!emailOwnsRecord(booking.email, callers)) {
        return res.status(403).json({ ok: false, error: "You cannot view this booking" });
      }
      const aircraft = service.getAircraft(booking.aircraftId);
      return res.json({ ok: true, booking, report: buildFlightReport(booking, aircraft) });
    }

    if (action === "itinerary" && req.method === "GET") {
      const ref = String(queryValue(req, "ref") || "");
      const callers = await callerEmails(req);
      const itinerary = service.getItinerary(ref, callers.supplied) || service.getItinerary(ref, callers.bearer);
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
      // Notify client that a quotation has been submitted for their charter request
      const charter = quoted.charter;
      if (charter && charter.email && (body.amount || body.action === "reject")) {
        const isReject = body.action === "reject";
        notificationHub.dispatch({
          recipientId: charter.email,
          recipientEmail: charter.email,
          recipientRole: "user",
          type: isReject ? "AVIATION_CHARTER_REJECTED" : "AVIATION_CHARTER_QUOTED",
          title: isReject ? "Charter Request Update" : "✈️ You Have a Charter Quotation!",
          message: isReject
            ? `Your charter request (${charter.ref}) could not be accommodated by this operator. We'll keep looking for alternatives.`
            : `Your private jet charter request (${charter.ref}) has received a quotation of $${Number(body.amount || 0).toLocaleString()}. Review and accept or decline.`,
          actionUrl: `/aviation/charter?ref=${charter.ref}`,
          metadata: { charterRef: charter.ref, amount: body.amount, operatorEmail: email }
        }).catch(() => {});
      }
      return res.json(quoted);
    }

    if (action === "charter-decide") {
      if (!auth.ok) return res.status(401).json({ ok: false, error: "Authentication required" });
      const decided = service.decideCharter(email, body.charterRef, body);
      if (!decided.ok) return res.status(400).json(decided);
      const records = [{ kind: "charter", id: decided.charter.ref, payload: decided.charter }];
      if (decided.booking) records.push({ kind: "booking", id: decided.booking.ref, payload: decided.booking });
      await persist(runtimeState, records);
      // Notify operator of client's decision
      if (decided.charter) {
        const decCharter = decided.charter;
        const isAccepted = body.action === "accept";
        // Find the relevant quotation to get operator email
        const latestQuote = (decCharter.quotations || []).slice(-1)[0];
        if (latestQuote && latestQuote.operatorEmail) {
          notificationHub.dispatch({
            recipientId: latestQuote.operatorEmail,
            recipientEmail: latestQuote.operatorEmail,
            recipientRole: "operator",
            type: isAccepted ? "AVIATION_CHARTER_ACCEPTED" : "AVIATION_CHARTER_DECLINED",
            title: isAccepted ? "🎉 Charter Quotation Accepted!" : "Charter Quotation Declined",
            message: isAccepted
              ? `The client accepted your quotation for charter ${decCharter.ref}. A booking has been created. Please prepare for departure.`
              : `The client declined your quotation for charter ${decCharter.ref}. No further action required.`,
            actionUrl: "/aviation/dashboard#charters",
            metadata: { charterRef: decCharter.ref, bookingRef: decided.booking?.ref || "", action: body.action }
          }).catch(() => {});
        }
        // Notify client of booking confirmation when accepted
        if (isAccepted && decided.booking) {
          notificationHub.dispatch({
            recipientId: email,
            recipientEmail: email,
            recipientRole: "user",
            type: "AVIATION_BOOKING_CONFIRMED",
            title: "✈️ Charter Booking Confirmed!",
            message: `Your private jet charter has been confirmed. Booking reference: ${decided.booking.ref}. Safe travels!`,
            actionUrl: `/aviation/confirmation?ref=${decided.booking.ref}`,
            metadata: { bookingRef: decided.booking.ref, charterRef: decCharter.ref }
          }).catch(() => {});
        }
      }
      return res.json(decided);
    }

    if (action === "booking-create") {
      const created = service.createBooking({ ...body, email: body.email || email });
      if (!created.ok) return res.status(400).json(created);
      await persist(runtimeState, [{ kind: "booking", id: created.booking.ref, payload: created.booking }]);
      // Notify client their booking request was created
      const newBooking = created.booking;
      notificationHub.dispatch({
        recipientId: newBooking.email,
        recipientEmail: newBooking.email,
        recipientRole: "user",
        type: "AVIATION_BOOKING_CREATED",
        title: "✈️ Private Jet Booking Request Received",
        message: `Your booking request (${newBooking.ref}) for ${newBooking.origin?.code || ""} → ${newBooking.destination?.code || ""} on ${newBooking.departDate || ""} has been received. Complete payment to confirm.`,
        actionUrl: `/aviation/confirmation?ref=${newBooking.ref}`,
        metadata: { bookingRef: newBooking.ref, aircraftId: newBooking.aircraftId }
      }).catch(() => {});
      return res.json(created);
    }

    if (action === "booking-confirm") {
      const confirmed = await confirmAviationBooking(service, body, {
        requesterEmail: email,
        stripe: getAviationStripeClient(),
      });
      if (!confirmed.ok) return res.status(confirmed.status).json({ ok: false, error: confirmed.error });
      await persist(runtimeState, [{ kind: "booking", id: confirmed.booking.ref, payload: confirmed.booking }]);
      // Notify client of confirmed booking
      const confBook = confirmed.booking;
      notificationHub.dispatch({
        recipientId: confBook.email,
        recipientEmail: confBook.email,
        recipientRole: "user",
        type: "AVIATION_BOOKING_CONFIRMED",
        title: "✅ Private Jet Booking Confirmed!",
        message: `Your booking (${confBook.ref}) is confirmed and paid. ${confBook.origin?.city || confBook.origin?.code || ""} → ${confBook.destination?.city || confBook.destination?.code || ""} on ${confBook.departDate || ""}. Enjoy your flight!`,
        actionUrl: `/aviation/confirmation?ref=${confBook.ref}`,
        metadata: { bookingRef: confBook.ref, paymentMethod: confBook.payment?.method || "" }
      }).catch(() => {});
      // Notify the operator of the new confirmed booking
      if (confBook.operatorEmail) {
        notificationHub.dispatch({
          recipientId: confBook.operatorEmail,
          recipientEmail: confBook.operatorEmail,
          recipientRole: "operator",
          type: "AVIATION_BOOKING_CONFIRMED",
          title: "New Confirmed Booking!",
          message: `A passenger has confirmed and paid for flight ${confBook.ref} on your aircraft. Route: ${confBook.origin?.code || ""} → ${confBook.destination?.code || ""}. Departs: ${confBook.departDate || ""}.`,
          actionUrl: "/aviation/dashboard#operations",
          metadata: { bookingRef: confBook.ref, aircraftId: confBook.aircraftId }
        }).catch(() => {});
      }
      return res.json({ ok: true, booking: confirmed.booking });
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
        // Notify the operator of their verification decision
        const op = reviewed.operator;
        const isVerified = body.status === "verified";
        const isRejected = body.status === "rejected";
        if (isVerified || isRejected) {
          notificationHub.dispatch({
            recipientId: op.email,
            recipientEmail: op.email,
            recipientRole: "operator",
            type: isVerified ? "AVIATION_OPERATOR_VERIFIED" : "AVIATION_OPERATOR_REJECTED",
            title: isVerified ? "🎉 Operator Account Verified!" : "Operator Account Update",
            message: isVerified
              ? `Congratulations, ${op.companyName}! Your operator account has been verified. You can now submit aircraft listings for approval.`
              : `Your operator account application has been reviewed. Status: ${body.status}. ${body.note ? `Note from admin: ${body.note}` : "Please contact support for more details."}`,
            actionUrl: "/aviation/dashboard",
            metadata: { operatorId: op.id, companyName: op.companyName, status: body.status, adminNote: body.note || "" }
          }).catch(() => {});
        }
        return res.json(reviewed);
      }
      if (action === "admin-aircraft") {
        const reviewed = service.reviewAircraft(body.id, body.status, body.note);
        if (!reviewed.ok) return res.status(400).json(reviewed);
        await persist(runtimeState, [{ kind: "aircraft", id: reviewed.aircraft.id, payload: reviewed.aircraft }]);
        // Notify the operator of their aircraft listing decision
        const aircraft = reviewed.aircraft;
        const isApproved = body.status === "approved";
        const isRejectedAc = body.status === "rejected";
        const isSuspended = body.status === "suspended";
        if (isApproved || isRejectedAc || isSuspended) {
          notificationHub.dispatch({
            recipientId: aircraft.operatorEmail,
            recipientEmail: aircraft.operatorEmail,
            recipientRole: "operator",
            type: isApproved ? "AVIATION_AIRCRAFT_APPROVED" : (isSuspended ? "AVIATION_AIRCRAFT_SUSPENDED" : "AVIATION_AIRCRAFT_REJECTED"),
            title: isApproved
              ? `✅ Aircraft Listing Approved: ${aircraft.name}`
              : isSuspended
              ? `⚠️ Aircraft Listing Suspended: ${aircraft.name}`
              : `Aircraft Listing Update: ${aircraft.name}`,
            message: isApproved
              ? `Your private jet listing "${aircraft.name}" (${aircraft.registration}) has been approved and is now live on BookingCart. Travellers can now book it.`
              : isSuspended
              ? `Your aircraft listing "${aircraft.name}" has been temporarily suspended. ${body.note ? `Reason: ${body.note}` : "Please contact support."}`
              : `Your aircraft listing "${aircraft.name}" was not approved at this time. ${body.note ? `Admin note: ${body.note}` : "Please review your compliance information and resubmit."}`,
            actionUrl: "/aviation/dashboard#fleet",
            metadata: { aircraftId: aircraft.id, aircraftName: aircraft.name, registration: aircraft.registration, status: body.status, adminNote: body.note || "" }
          }).catch(() => {});
        }
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
module.exports.setAviationStripeClient = setAviationStripeClient;
module.exports.resetAviationStripeClient = resetAviationStripeClient;
module.exports.verifyAviationCardSession = verifyAviationCardSession;
module.exports.confirmAviationBooking = confirmAviationBooking;
