const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  JET_CATEGORIES,
  CHARTER_SERVICES,
  HELICOPTER_SERVICES,
  AMENITIES,
  createAviationService,
  complianceGaps,
  publicAircraft,
  SEED_AIRCRAFT,
} = require("../lib/aviation");
const aviationHandler = require("../api-routes/aviation");

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test("aviation catalog covers jets, charters, helicopters, and amenities", () => {
  const service = createAviationService();
  const catalog = service.catalog();
  assert.equal(catalog.jets.length, 8);
  assert.equal(catalog.charters.length, 8);
  assert.equal(catalog.helicopters.length, 6);
  assert.equal(catalog.amenities.length, AMENITIES.length);
  assert.ok(JET_CATEGORIES.some((item) => item.id === "ultra_long_range"));
  assert.ok(CHARTER_SERVICES.some((item) => item.id === "safari"));
  assert.ok(HELICOPTER_SERVICES.some((item) => item.id === "scenic"));
});

test("search ranks flyable aircraft and excludes out-of-range helicopters", () => {
  const service = createAviationService();
  const safari = service.search({ origin: "EBB", destination: "MFU", passengers: 4, departDate: "2026-11-12", category: "safari" });
  assert.equal(safari.ok, true);
  assert.ok(safari.results.some((item) => item.aircraft.id === "ac_caravan"));
  assert.ok(safari.results.every((item) => item.quote.price > 0));

  const dubai = service.search({ origin: "EBB", destination: "DXB", passengers: 2, departDate: "2026-11-12", category: "helicopter" });
  assert.equal(dubai.ok, true);
  assert.equal(dubai.results.length, 0);

  const pets = service.search({ origin: "EBB", destination: "NBO", passengers: 2, petFriendly: "true", departDate: "2026-11-12" });
  assert.ok(pets.results.length > 0);
  assert.ok(pets.results.every((item) => item.aircraft.petFriendly));

  const smoking = service.search({ origin: "EBB", destination: "NBO", smoking: "true", departDate: "2026-11-12" });
  assert.equal(smoking.results.length, 0);
});

test("round trip quotes cost more than one-way and public listings mask compliance files", () => {
  const service = createAviationService();
  const oneWay = service.search({ origin: "EBB", destination: "MFU", tripType: "oneway", departDate: "2026-11-12", category: "light_jet" });
  const round = service.search({ origin: "EBB", destination: "MFU", tripType: "round", departDate: "2026-11-12", returnDate: "2026-11-16", category: "light_jet" });
  assert.ok(round.results[0].quote.price > oneWay.results[0].quote.price);
  const masked = publicAircraft({
    ...SEED_AIRCRAFT[0],
    operatorEmail: "ops@sinrah.example",
    adminNote: "internal review note",
    documents: [{ id: "DOC-1", url: "https://files.example/aoc.pdf" }],
  });
  assert.equal(masked.safety.aoc, "Verified");
  assert.equal(masked.safety.insurance, "Covered");
  assert.equal(masked.documents, undefined);
  assert.equal(masked.operatorEmail, undefined);
  assert.equal(masked.operatorId, undefined);
  assert.equal(masked.adminNote, undefined);
  assert.equal(masked.operatorName, SEED_AIRCRAFT[0].operatorName);
});

test("operator aircraft cannot be approved until safety and verification are complete", () => {
  const service = createAviationService();
  const registered = service.saveOperator("pilot@example.com", { companyName: "Lake Air", baseAirport: "EBB" });
  assert.equal(registered.operator.status, "pending");
  assert.ok(complianceGaps(registered.operator, "operator").includes("Air Operator Certificate"));
  assert.equal(service.reviewOperator(registered.operator.id, "verified").ok, false);

  const draft = service.saveAircraft("pilot@example.com", {
    name: "Lake Hopper",
    category: "light_jet",
    manufacturer: "Cessna",
    model: "CJ2",
    year: 2018,
    registration: "5X-NEW",
    baseAirport: "EBB",
    passengers: 6,
    rangeNm: 1600,
    cruiseSpeedKt: 400,
    hourlyRate: 3900,
    submit: true,
  });
  assert.equal(draft.ok, false);

  service.saveOperator("pilot@example.com", {
    companyName: "Lake Air",
    baseAirport: "EBB",
    aoc: "UG-AOC-999",
    insurance: "Liability cover",
    regulatoryStatus: "compliant",
  });
  service.reviewOperator(service.getOperator("pilot@example.com").operator.id, "verified");
  const submitted = service.saveAircraft("pilot@example.com", {
    name: "Lake Hopper",
    category: "light_jet",
    manufacturer: "Cessna",
    model: "CJ2",
    year: 2018,
    registration: "5X-NEW",
    baseAirport: "EBB",
    passengers: 6,
    rangeNm: 1600,
    cruiseSpeedKt: 400,
    hourlyRate: 3900,
    safety: {
      aoc: "UG-AOC-999",
      certification: "UCAA",
      insurance: "Hull cover",
      maintenanceCurrent: true,
      pilotCertifications: ["ATPL"],
      regulatoryStatus: "compliant",
    },
    submit: true,
  });
  assert.equal(submitted.aircraft.status, "pending");
  assert.equal(service.search({ origin: "EBB", destination: "KGL", departDate: "2026-12-01" }).results.some((item) => item.aircraft.registration === "5X-NEW"), false);
  const approved = service.reviewAircraft(submitted.aircraft.id, "approved", "File complete");
  assert.equal(approved.ok, true);
  const published = service.search({ origin: "EBB", destination: "KGL", departDate: "2026-12-01", manufacturer: "Cessna" }).results.find((item) => item.aircraft.id === submitted.aircraft.id);
  assert.ok(published);
  assert.equal(published.aircraft.operatorEmail, undefined);
  assert.equal(published.aircraft.operatorId, undefined);
  assert.equal(published.aircraft.documents, undefined);
  assert.equal(published.aircraft.adminNote, undefined);
  assert.equal(published.aircraft.operatorName, "Lake Air");
  assert.equal(service.getAircraft(submitted.aircraft.id).operatorEmail, undefined);
  assert.equal(service.getOperator("pilot@example.com").fleet[0].operatorEmail, "pilot@example.com");
  assert.equal(service.getOperator("pilot@example.com").fleet[0].operatorId, service.getOperator("pilot@example.com").operator.id);
});

test("charter quotation acceptance creates a confirmed-path booking and analytics", () => {
  const service = createAviationService();
  service.saveOperator("pilot@example.com", { companyName: "Lake Air", baseAirport: "EBB", aoc: "UG-AOC-999", insurance: "Cover", regulatoryStatus: "compliant" });
  const operator = service.getOperator("pilot@example.com").operator;
  service.reviewOperator(operator.id, "verified");
  const aircraft = service.saveAircraft("pilot@example.com", {
    name: "Lake Hopper",
    category: "tourism",
    manufacturer: "Cessna",
    model: "CJ2",
    year: 2018,
    registration: "5X-NEW",
    baseAirport: "EBB",
    passengers: 6,
    rangeNm: 1600,
    cruiseSpeedKt: 400,
    hourlyRate: 3900,
    charterServices: ["tourism"],
    safety: { aoc: "UG-AOC-999", certification: "UCAA", insurance: "Hull", maintenanceCurrent: true, pilotCertifications: ["ATPL"], regulatoryStatus: "compliant" },
    submit: true,
  }).aircraft;
  service.reviewAircraft(aircraft.id, "approved");

  const charter = service.createCharter({
    email: "guest@example.com",
    name: "Amina",
    passengers: 3,
    legs: [{ from: "EBB", to: "MFU", date: "2026-11-20", time: "08:00" }, { from: "MFU", to: "EBB", date: "2026-11-23", time: "16:00" }],
    catering: "Vegetarian",
    groundTransport: true,
    vipServices: true,
    preferredAircraftId: aircraft.id,
  });
  assert.equal(charter.charter.status, "requested");
  const quoted = service.submitQuotation("pilot@example.com", charter.charter.ref, { aircraftId: aircraft.id, amount: 9200, notes: "Includes safari transfer", schedule: "08:00 LT" });
  assert.equal(quoted.charter.status, "quoted");
  const accepted = service.decideCharter("guest@example.com", charter.charter.ref, { action: "accept", quotationId: quoted.charter.quotations[0].id });
  assert.equal(accepted.charter.status, "confirmed");
  assert.equal(accepted.booking.quote.price, 9200);
  service.confirmBooking(accepted.booking.ref, { method: "invoice" });
  service.addReview({ bookingRef: accepted.booking.ref, email: "guest@example.com", score: 5, comment: "Seamless safari arrival" });
  const analytics = service.analytics("pilot@example.com");
  assert.equal(analytics.flightsBooked, 1);
  assert.equal(analytics.totalCharterRevenue, 9200);
  assert.equal(analytics.customerSatisfaction, 5);
  assert.ok(analytics.popularRoutes[0].route.includes("EBB"));
});

// Ids are millisecond timestamps, so rekey each record before the next insert.
function registerVerifiedOperator(service, email, companyName, id) {
  service.saveOperator(email, {
    companyName,
    baseAirport: "EBB",
    aoc: "UG-AOC-501",
    insurance: "Cover",
    regulatoryStatus: "compliant",
  });
  const operator = service.getOperator(email).operator;
  if (operator.id !== id) {
    service.operators.delete(operator.id);
    operator.id = id;
    service.operators.set(id, operator);
  }
  const reviewed = service.reviewOperator(id, "verified");
  assert.equal(reviewed.ok, true);
}

function approveAircraft(service, email, input) {
  const stableId = input.id;
  const payload = { ...input };
  delete payload.id;
  const saved = service.saveAircraft(email, {
    manufacturer: "Cessna",
    model: "CJ2",
    year: 2018,
    baseAirport: "EBB",
    passengers: 6,
    rangeNm: 1600,
    cruiseSpeedKt: 400,
    hourlyRate: 3900,
    safety: {
      aoc: "UG-AOC-501",
      certification: "UCAA",
      insurance: "Hull",
      maintenanceCurrent: true,
      pilotCertifications: ["ATPL"],
      regulatoryStatus: "compliant",
    },
    submit: true,
    ...payload,
  });
  assert.equal(saved.ok, true, saved.error);
  const aircraft = saved.aircraft;
  if (stableId && aircraft.id !== stableId) {
    service.aircraftMap.delete(aircraft.id);
    aircraft.id = stableId;
    service.aircraftMap.set(stableId, aircraft);
  }
  const approved = service.reviewAircraft(aircraft.id, "approved");
  assert.equal(approved.ok, true, approved.error);
  return approved.aircraft;
}

test("verified operators only see assigned or fleet-matching charters", () => {
  const service = createAviationService();
  registerVerifiedOperator(service, "alpha@example.com", "Alpha Jets", "op_alpha");
  registerVerifiedOperator(service, "bravo@example.com", "Bravo Heli", "op_bravo");
  const alphaJet = approveAircraft(service, "alpha@example.com", {
    id: "ac_alpha",
    name: "Alpha Light",
    category: "light_jet",
    registration: "5X-ALP1",
  });
  const bravoHeli = approveAircraft(service, "bravo@example.com", {
    id: "ac_bravo",
    name: "Bravo Scenic",
    category: "scenic",
    registration: "5X-BRV1",
  });

  const assigned = service.createCharter({
    email: "guest-a@example.com",
    name: "Assigned Guest",
    phone: "+256700000001",
    passengers: 2,
    legs: [{ from: "EBB", to: "NBO", date: "2026-12-01", time: "09:00" }],
    aircraftCategory: "light_jet",
    preferredAircraftId: alphaJet.id,
    notes: "Assigned catering note",
  });
  const matching = service.createCharter({
    email: "guest-m@example.com",
    name: "Matching Guest",
    phone: "+256700000002",
    passengers: 3,
    legs: [{ from: "EBB", to: "KGL", date: "2026-12-02", time: "10:00" }],
    aircraftCategory: "light_jet",
    notes: "Fleet match note",
  });
  const unrelated = service.createCharter({
    email: "secret@example.com",
    name: "Private Guest",
    phone: "+256700111222",
    passengers: 2,
    legs: [{ from: "EBB", to: "KLA", date: "2026-12-03", time: "11:00" }],
    aircraftCategory: "scenic",
    preferredAircraftId: bravoHeli.id,
    notes: "Private medical note",
  });
  assert.equal(assigned.ok, true);
  assert.equal(matching.ok, true);
  assert.equal(unrelated.ok, true);

  const alphaPortal = service.getOperator("alpha@example.com");
  const alphaRefs = alphaPortal.charters.map((item) => item.ref).sort();
  assert.deepEqual(alphaRefs, [assigned.charter.ref, matching.charter.ref].sort());
  assert.deepEqual(service.listCharters({ operatorEmail: "alpha@example.com" }).map((item) => item.ref).sort(), alphaRefs);
  assert.equal(alphaPortal.charters.some((item) => item.notes === "Private medical note" || item.email === "secret@example.com" || item.phone === "+256700111222"), false);

  const bravoRefs = service.getOperator("bravo@example.com").charters.map((item) => item.ref);
  assert.deepEqual(bravoRefs, [unrelated.charter.ref]);
  assert.equal(bravoRefs.includes(assigned.charter.ref), false);

  service.saveOperator("pending@example.com", { companyName: "Pending Air", baseAirport: "EBB" });
  assert.deepEqual(service.getOperator("pending@example.com").charters, []);

  const leaked = service.operatorCharterAction("alpha@example.com", unrelated.charter.ref, { action: "reject" });
  assert.equal(leaked.ok, false);
  assert.equal(leaked.charter, undefined);
  assert.equal(JSON.stringify(leaked).includes("Private medical note"), false);
  assert.equal(JSON.stringify(leaked).includes("secret@example.com"), false);
  assert.equal(service.charters.get(unrelated.charter.ref).status, "requested");

  const quoted = service.submitQuotation("alpha@example.com", unrelated.charter.ref, { aircraftId: alphaJet.id, amount: 5000 });
  assert.equal(quoted.ok, false);
  assert.equal(quoted.charter, undefined);

  const visible = service.operatorCharterAction("alpha@example.com", assigned.charter.ref, { action: "negotiate", message: "Can depart at 09:30" });
  assert.equal(visible.ok, true);
  assert.equal(visible.charter.ref, assigned.charter.ref);
});

test("combined itinerary totals jet, helicopter, lodge, park, and transfer", () => {
  const service = createAviationService();
  const preset = service.presetItinerary("murchison");
  assert.equal(preset.ok, true);
  assert.deepEqual(preset.preset.items.map((item) => item.type), ["private_jet", "helicopter", "hotel", "attraction", "ground_transport"]);
  const saved = service.saveItinerary({ email: "guest@example.com", title: preset.preset.title, items: preset.preset.items });
  assert.equal(saved.itinerary.total, preset.preset.items.reduce((sum, item) => sum + item.price, 0));
  assert.equal(service.checkoutItinerary(saved.itinerary.ref, "guest@example.com").itinerary.status, "checked_out");
});

test("owner can update an itinerary and another email cannot overwrite it", () => {
  const service = createAviationService();
  const originalItems = [{ type: "hotel", title: "Luxury lodge reservation", price: 2400, details: "Two nights" }];
  const saved = service.saveItinerary({ email: "owner@example.com", title: "Safari", items: originalItems });
  assert.equal(saved.ok, true);

  const blocked = service.saveItinerary({
    ref: saved.itinerary.ref,
    email: "intruder@example.com",
    title: "Stolen trip",
    items: [{ type: "hotel", title: "Replaced lodge", price: 1, details: "Overwrite" }],
  });
  assert.equal(blocked.ok, false);
  const stored = service.itineraries.get(saved.itinerary.ref);
  assert.equal(stored.email, "owner@example.com");
  assert.equal(stored.items[0].title, "Luxury lodge reservation");
  assert.equal(stored.items[0].price, 2400);

  const updated = service.saveItinerary({
    ref: saved.itinerary.ref,
    email: "Owner@Example.com",
    title: "Safari revised",
    items: [{ type: "hotel", title: "Luxury lodge reservation", price: 2600, details: "Three nights" }],
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.itinerary.ref, saved.itinerary.ref);
  assert.equal(updated.itinerary.items[0].price, 2600);
  assert.equal(service.getItinerary(saved.itinerary.ref, "owner@example.com").items[0].price, 2600);
  assert.equal(service.getItinerary(saved.itinerary.ref, "intruder@example.com"), null);

  const invented = service.saveItinerary({
    ref: "ITN-GUESSED-REF",
    email: "other@example.com",
    title: "New trip",
    items: [{ type: "attraction", title: "Park entry", price: 180, details: "Day pass" }],
  });
  assert.equal(invented.ok, true);
  assert.notEqual(invented.itinerary.ref, "ITN-GUESSED-REF");
  assert.equal(service.itineraries.has("ITN-GUESSED-REF"), false);
});

test("airport directory includes airstrips, heliports, and private terminals", () => {
  const service = createAviationService();
  const murchison = service.searchAirports({ q: "Murchison" });
  assert.equal(murchison[0].type, "airstrip");
  assert.equal(murchison[0].customs, false);
  assert.ok(service.searchAirports({ type: "heliport" }).some((item) => item.code === "KLA"));
  assert.ok(service.searchAirports({ type: "vip_lounge" }).length > 0);
  const missing = service.search({ origin: "Nowhere", destination: "EBB" });
  assert.equal(missing.ok, false);
});

test("search endpoint rejects an unknown departure airport", async () => {
  aviationHandler.resetAviationRuntime();
  const req = { method: "GET", headers: {}, query: { action: "search", origin: "Nope", destination: "EBB" }, body: {}, params: {}, socket: {} };
  const res = responseRecorder();
  await aviationHandler(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /departure airport/);
});

test("aviation routes are registered for Express and Netlify", () => {
  const server = fs.readFileSync(require.resolve("../server"), "utf8");
  const netlify = fs.readFileSync(require.resolve("../netlify/functions/api"), "utf8");
  assert.match(server, /\/api\/aviation/);
  assert.match(netlify, /aviationHandler/);
  assert.match(netlify, /route === "aviation"/);
});

function paidCheckoutSession(booking, amountCents, overrides = {}) {
  const metadata = {
    bookingRef: booking.ref,
    paymentPurpose: "aviation",
    amountCents: String(amountCents),
    ...(overrides.metadata || {}),
  };
  return {
    id: "cs_test_paid",
    status: "complete",
    payment_status: "paid",
    mode: "payment",
    amount_total: amountCents,
    currency: String(booking.quote.currency || "USD").toLowerCase(),
    customer_email: booking.email,
    client_reference_id: booking.ref,
    ...overrides,
    metadata,
  };
}

function stripeRetriever(session) {
  return {
    checkout: {
      sessions: {
        retrieve: async (id) => {
          if (id !== session.id) throw new Error("No such checkout.session");
          return session;
        },
      },
    },
  };
}

test("card confirmation verifies Stripe before marking a booking paid", async () => {
  const service = createAviationService();
  const created = service.createBooking({
    email: "guest@example.com",
    name: "Amina",
    aircraftId: "ac_caravan",
    origin: "EBB",
    destination: "MFU",
    departDate: "2026-11-12",
    passengers: 2,
  });
  assert.equal(created.ok, true);
  const booking = created.booking;
  const amountCents = Math.round(booking.quote.price * 100);
  assert.ok(amountCents >= 50);

  const unverified = service.confirmBooking(booking.ref, { method: "card", sessionId: "cs_forged" });
  assert.equal(unverified.ok, false);
  assert.equal(service.getBooking(booking.ref).status, "pending_payment");
  assert.equal(service.getBooking(booking.ref).payment, null);

  const forged = await aviationHandler.confirmAviationBooking(service, {
    ref: booking.ref,
    email: booking.email,
    method: "card",
    sessionId: "cs_forged",
    cardVerified: true,
  }, { stripe: stripeRetriever(paidCheckoutSession(booking, amountCents)) });
  assert.equal(forged.ok, false);
  assert.equal(service.getBooking(booking.ref).payment, null);

  const unpaid = await aviationHandler.verifyAviationCardSession(
    stripeRetriever(paidCheckoutSession(booking, amountCents, { id: "cs_unpaid", payment_status: "unpaid" })),
    { sessionId: "cs_unpaid", booking }
  );
  assert.equal(unpaid.ok, false);

  const wrongRef = await aviationHandler.verifyAviationCardSession(
    stripeRetriever(paidCheckoutSession(booking, amountCents, { id: "cs_other", metadata: { bookingRef: "AVN-OTHER" } })),
    { sessionId: "cs_other", booking }
  );
  assert.equal(wrongRef.ok, false);

  const wrongAmount = await aviationHandler.verifyAviationCardSession(
    stripeRetriever(paidCheckoutSession(booking, amountCents, {
      id: "cs_amount",
      amount_total: amountCents - 100,
      metadata: { amountCents: String(amountCents - 100) },
    })),
    { sessionId: "cs_amount", booking }
  );
  assert.equal(wrongAmount.ok, false);

  const wrongPurpose = await aviationHandler.verifyAviationCardSession(
    stripeRetriever(paidCheckoutSession(booking, amountCents, {
      id: "cs_purpose",
      metadata: { paymentPurpose: "booking" },
    })),
    { sessionId: "cs_purpose", booking }
  );
  assert.equal(wrongPurpose.ok, false);

  const matched = await aviationHandler.confirmAviationBooking(service, {
    ref: booking.ref,
    email: booking.email,
    method: "card",
    sessionId: "cs_test_paid",
  }, { stripe: stripeRetriever(paidCheckoutSession(booking, amountCents)) });
  assert.equal(matched.ok, true);
  assert.equal(matched.booking.status, "confirmed");
  assert.equal(matched.booking.payment.method, "card");
  assert.equal(matched.booking.payment.status, "paid");
  assert.equal(matched.booking.payment.sessionId, "cs_test_paid");

  const second = service.createBooking({
    email: "guest@example.com",
    aircraftId: "ac_caravan",
    origin: "EBB",
    destination: "MFU",
    departDate: "2026-11-13",
    passengers: 2,
  });
  let stripeCalled = false;
  const invoiced = await aviationHandler.confirmAviationBooking(service, {
    ref: second.booking.ref,
    email: "guest@example.com",
    method: "invoice",
    sessionId: "cs_should_not_be_trusted",
  }, {
    stripe: {
      checkout: {
        sessions: {
          retrieve: async () => {
            stripeCalled = true;
            throw new Error("invoice path must not retrieve a card session");
          },
        },
      },
    },
  });
  assert.equal(stripeCalled, false);
  assert.equal(invoiced.ok, true);
  assert.equal(invoiced.booking.status, "confirmed");
  assert.equal(invoiced.booking.payment.method, "invoice");
  assert.equal(invoiced.booking.payment.status, "invoiced");
  assert.equal(invoiced.booking.payment.sessionId, "");

  const implicit = await aviationHandler.confirmAviationBooking(service, {
    ref: second.booking.ref,
    email: "guest@example.com",
    sessionId: "cs_test_paid",
  }, { stripe: stripeRetriever(paidCheckoutSession(booking, amountCents)) });
  assert.equal(implicit.ok, false);
  assert.equal(service.getBooking(second.booking.ref).payment.status, "invoiced");
});

test("booking-confirm endpoint does not trust a caller-supplied session id", async () => {
  const previousDb = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  aviationHandler.resetAviationRuntime();
  aviationHandler.resetAviationStripeClient();
  try {
    const created = responseRecorder();
    await aviationHandler({
      method: "POST",
      headers: {},
      query: {},
      params: { action: "booking-create" },
      body: {
        email: "payer@example.com",
        aircraftId: "ac_caravan",
        origin: "EBB",
        destination: "MFU",
        departDate: "2026-12-02",
        passengers: 1,
      },
      socket: {},
    }, created);
    assert.equal(created.statusCode, 200);
    assert.equal(created.body.ok, true, created.body && created.body.error);
    const booking = created.body.booking;
    const amountCents = Math.round(booking.quote.price * 100);
    const retrieved = [];
    aviationHandler.setAviationStripeClient({
      checkout: {
        sessions: {
          retrieve: async (id) => {
            retrieved.push(id);
            if (id !== "cs_endpoint_paid") throw new Error("No such checkout.session");
            return paidCheckoutSession(booking, amountCents, { id });
          },
        },
      },
    });

    const forged = responseRecorder();
    await aviationHandler({
      method: "POST",
      headers: {},
      query: {},
      params: { action: "booking-confirm" },
      body: {
        ref: booking.ref,
        email: booking.email,
        method: "card",
        sessionId: "cs_forged",
        cardVerified: true,
        payment: { method: "card", status: "paid", cardVerified: true, sessionId: "cs_forged" },
      },
      socket: {},
    }, forged);
    assert.equal(forged.statusCode, 400);
    assert.equal(forged.body.ok, false);
    assert.deepEqual(retrieved, ["cs_forged"]);

    const pending = responseRecorder();
    await aviationHandler({
      method: "GET",
      headers: {},
      query: { ref: booking.ref },
      params: { action: "booking" },
      body: {},
      socket: {},
    }, pending);
    assert.equal(pending.body.booking.status, "pending_payment");
    assert.equal(pending.body.booking.payment, null);

    const paid = responseRecorder();
    await aviationHandler({
      method: "POST",
      headers: {},
      query: {},
      params: { action: "booking-confirm" },
      body: { ref: booking.ref, email: booking.email, method: "card", sessionId: "cs_endpoint_paid" },
      socket: {},
    }, paid);
    assert.equal(paid.statusCode, 200);
    assert.equal(paid.body.booking.payment.method, "card");
    assert.equal(paid.body.booking.payment.status, "paid");
    assert.equal(paid.body.booking.status, "confirmed");
  } finally {
    aviationHandler.resetAviationStripeClient();
    aviationHandler.resetAviationRuntime();
    if (previousDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDb;
  }
});
