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
  const masked = publicAircraft(SEED_AIRCRAFT[0]);
  assert.equal(masked.safety.aoc, "Verified");
  assert.equal(masked.safety.insurance, "Covered");
  assert.equal(masked.documents, undefined);
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
  assert.ok(service.search({ origin: "EBB", destination: "KGL", departDate: "2026-12-01", manufacturer: "Cessna" }).results.some((item) => item.aircraft.id === submitted.aircraft.id));
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

test("combined itinerary totals jet, helicopter, lodge, park, and transfer", () => {
  const service = createAviationService();
  const preset = service.presetItinerary("murchison");
  assert.equal(preset.ok, true);
  assert.deepEqual(preset.preset.items.map((item) => item.type), ["private_jet", "helicopter", "hotel", "attraction", "ground_transport"]);
  const saved = service.saveItinerary({ email: "guest@example.com", title: preset.preset.title, items: preset.preset.items });
  assert.equal(saved.itinerary.total, preset.preset.items.reduce((sum, item) => sum + item.price, 0));
  assert.equal(service.checkoutItinerary(saved.itinerary.ref, "guest@example.com").itinerary.status, "checked_out");
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
