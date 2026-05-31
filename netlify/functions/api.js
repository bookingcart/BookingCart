const fetch = require("node-fetch");
const Stripe = require("stripe");
const crypto = require("crypto");
const { assertAllowedOrigin, getCorsHeaders } = require("../../lib/cors");
const flightDealsHandler = require("../../api-routes/flight-deals");
const bookingsHandler = require("../../api-routes/bookings");
const userHandler = require("../../api-routes/user");
const duffelSearchHandler = require("../../api-routes/duffel-search");
const duffelAirportsHandler = require("../../api-routes/duffel-airports");
const duffelOrdersHandler = require("../../api-routes/duffel-orders");
const duffelOfferHandler = require("../../api-routes/duffel-offer");
const duffelPaymentsHandler = require("../../api-routes/duffel-payments");
const duffelSeatMapsHandler = require("../../api-routes/duffel-seat-maps");
const duffelOrderCancellationsHandler = require("../../api-routes/duffel-order-cancellations");
const duffelOrderChangesHandler = require("../../api-routes/duffel-order-changes");
const duffelOrderServicesHandler = require("../../api-routes/duffel-order-services");
const duffelClientKeyHandler = require("../../api-routes/duffel-client-key");
const authHandler = require("../../api-routes/auth");
const supportHandler = require("../../api-routes/support");
const ticketDownloadHandler = require("../../api-routes/ticket-download");
const priceAlertHandler = require("../../api-routes/price-alert");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_SECRET_KEY && !STRIPE_SECRET_KEY.startsWith("rk_") ? Stripe(STRIPE_SECRET_KEY) : null;

const VISA_ADMIN_TOKEN = process.env.VISA_ADMIN_TOKEN || "";

const TRAVELBUDDY_RAPIDAPI_SECRET = process.env.TRAVELBUDDY_RAPIDAPI_SECRET || process.env.RAPIDAPI_SECRET || "";
const TRAVELBUDDY_API_BASE = "https://visa-requirement.p.rapidapi.com";

// GitHub API configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";
const GITHUB_API_BASE = "https://api.github.com";

let _lastEventHeaders = {};

function corsHeaders() {
  return getCorsHeaders({
    headers: { origin: _lastEventHeaders.origin || _lastEventHeaders.Origin || "" }
  });
}

const _duffelRl = new Map();
function duffelRateLimitOk(event) {
  const windowMs = 15 * 60 * 1000;
  const max = 60;
  const ip =
    String(event.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    event.headers["x-nf-client-connection-ip"] ||
    "unknown";
  const now = Date.now();
  let b = _duffelRl.get(ip);
  if (!b || now > b.reset) {
    b = { n: 0, reset: now + windowMs };
    _duffelRl.set(ip, b);
  }
  b.n += 1;
  return b.n <= max;
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function getOrigin(headers) {
  const h = headers || {};
  const proto = (h["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = (h["x-forwarded-host"] || h.host || "").split(",")[0].trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

function resolveCheckoutOrigin(event) {
  const h = event.headers || {};
  const direct = String(h.origin || h.Origin || "").trim();
  if (direct) return direct;
  const hostBased = getOrigin(h);
  if (hostBased) return hostBased;
  const ref = String(h.referer || h.Referer || "").trim();
  if (ref) {
    try {
      return new URL(ref).origin;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function normalizeRoute(path) {
  const p = String(path || "");
  const idx = p.indexOf("/.netlify/functions/api");
  if (idx !== -1) {
    const rest = p.slice(idx + "/.netlify/functions/api".length);
    return rest.replace(/^\/+/, "");
  }
  const idx2 = p.indexOf("/api/");
  if (idx2 !== -1) {
    return p.slice(idx2 + "/api/".length).replace(/^\/+/, "");
  }
  return p.replace(/^\/+/, "");
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function buildExpressLikeReq(event, params = {}) {
  const forwardedFor = String(event.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return {
    method: event.httpMethod,
    headers: event.headers || {},
    query: event.queryStringParameters || {},
    body: safeJsonParse(event.body || "{}") || {},
    params,
    socket: {
      remoteAddress: forwardedFor || event.headers?.["x-real-ip"] || ""
    }
  };
}

function buildExpressLikeRes() {
  let statusCode = 200;
  const headers = {};

  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(body) {
      return {
        statusCode,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
          ...headers
        },
        body: JSON.stringify(body)
      };
    },
    end(body = "") {
      if (Buffer.isBuffer(body)) {
        return {
          statusCode,
          headers: {
            ...corsHeaders(),
            ...headers
          },
          body: body.toString("base64"),
          isBase64Encoded: true
        };
      }
      return {
        statusCode,
        headers: {
          ...corsHeaders(),
          ...headers
        },
        body
      };
    }
  };

  return res;
}

async function invokeExpressHandler(handler, event, params = {}) {
  const req = buildExpressLikeReq(event, params);
  const res = buildExpressLikeRes();
  const result = await handler(req, res);
  if (result && typeof result.statusCode === "number" && result.body !== undefined) {
    return result;
  }
  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: ""
  };
}

function requireTravelBuddy(event) {
  if (!TRAVELBUDDY_RAPIDAPI_SECRET) {
    return { ok: false, status: 500, error: "Travel Buddy API is not configured (missing TRAVELBUDDY_RAPIDAPI_SECRET)" };
  }
  return { ok: true };
}

async function travelBuddyPost(path, body) {
  const url = `${TRAVELBUDDY_API_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-RapidAPI-Proxy-Secret": TRAVELBUDDY_RAPIDAPI_SECRET
    },
    body: JSON.stringify(body || {})
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, bodyText: text };
  }
  try {
    return { ok: true, status: res.status, json: JSON.parse(text) };
  } catch {
    return { ok: false, status: 502, bodyText: "Invalid JSON from upstream" };
  }
}

async function handleTravelBuddyVisaCheck(event) {
  const gate = requireTravelBuddy(event);
  if (!gate.ok) return json(gate.status, { ok: false, error: gate.error });

  const payload = safeJsonParse(event.body || "{}") || {};
  const passport = String(payload.passport || "").trim().toUpperCase();
  const destination = String(payload.destination || "").trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(passport) || !/^[A-Z]{2}$/.test(destination)) {
    return json(422, { ok: false, error: "Invalid parameters. Expected ISO2 codes for passport and destination." });
  }
  if (passport === destination) {
    return json(422, { ok: false, error: "passport and destination must be different" });
  }

  const upstream = await travelBuddyPost("/v2/visa/check", { passport, destination });
  if (!upstream.ok) {
    return json(upstream.status || 502, { ok: false, error: "Upstream error", details: upstream.bodyText || "" });
  }

  return json(200, { ok: true, data: upstream.json });
}

async function handleTravelBuddyVisaMap(event) {
  const gate = requireTravelBuddy(event);
  if (!gate.ok) return json(gate.status, { ok: false, error: gate.error });

  const payload = safeJsonParse(event.body || "{}") || {};
  const passport = String(payload.passport || "").trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(passport)) {
    return json(422, { ok: false, error: "Invalid parameters. Expected ISO2 code for passport." });
  }

  const upstream = await travelBuddyPost("/v2/visa/map", { passport });
  if (!upstream.ok) {
    return json(upstream.status || 502, { ok: false, error: "Upstream error", details: upstream.bodyText || "" });
  }

  return json(200, { ok: true, data: upstream.json });
}

function requireVisaAdmin(event) {
  if (!VISA_ADMIN_TOKEN) {
    return { ok: false, status: 500, error: "Visa admin is not configured (missing VISA_ADMIN_TOKEN)" };
  }

  const auth = String(event.headers?.authorization || event.headers?.Authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token || token !== VISA_ADMIN_TOKEN) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

// GitHub API helpers
function githubHeaders() {
  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "BookingCart-Visa"
  };
}

async function githubCreateOrUpdateFile(path, content, message = "Update visa application") {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error("GitHub storage is not configured");
  }
  const url = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const body = {
    message,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64")
  };
  // Try to create; if file exists, get sha first
  try {
    const getRes = await fetch(url, { headers: githubHeaders() });
    if (getRes.ok) {
      const existing = await getRes.json();
      body.sha = existing.sha;
    }
  } catch {
    // ignore
  }
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...githubHeaders() },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${err}`);
  }
  return await res.json();
}

async function githubGetFile(path) {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error("GitHub storage is not configured");
  }
  const url = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
}

async function githubListFiles(prefix = "") {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error("GitHub storage is not configured");
  }
  const url = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${prefix}`;
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    if (res.status === 404) return [];
    const err = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function randomId(prefix) {
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

 function normCountry(s) {
   return String(s || "")
     .trim()
     .toLowerCase();
 }

 const VISA_FREE_GROUP = new Set(
   ["Mauritius", "Seychelles", "Barbados", "Bahamas", "Fiji"].map(normCountry)
 );

function visaRules() {
  return {
    "United Arab Emirates": {
      tourism: { type: "eVisa", governmentFee: 95, documents: ["Passport bio page", "Passport photo", "Accommodation details", "Return ticket (recommended)"] },
      business: { type: "eVisa", governmentFee: 125, documents: ["Passport bio page", "Passport photo", "Invitation letter (if applicable)"] },
      transit: { type: "Visa-free / Transit rules", governmentFee: 0, documents: ["Valid passport", "Onward ticket"] }
    },
    Turkey: {
      tourism: { type: "eVisa", governmentFee: 60, documents: ["Passport bio page", "Passport photo"] },
      business: { type: "eVisa", governmentFee: 75, documents: ["Passport bio page", "Passport photo"] },
      transit: { type: "Visa-free / Transit rules", governmentFee: 0, documents: ["Valid passport", "Onward ticket"] }
    },
    Kenya: {
      tourism: { type: "eTA", governmentFee: 35, documents: ["Passport bio page", "Passport photo", "Accommodation details", "Return ticket"] },
      business: { type: "eTA", governmentFee: 35, documents: ["Passport bio page", "Passport photo", "Invitation letter (if applicable)"] },
      transit: { type: "Visa-free / Transit rules", governmentFee: 0, documents: ["Valid passport", "Onward ticket"] }
    },
    India: {
      tourism: { type: "eVisa", governmentFee: 40, documents: ["Passport bio page", "Passport photo"] },
      business: { type: "eVisa", governmentFee: 80, documents: ["Passport bio page", "Passport photo", "Business card / invitation (if applicable)"] },
      transit: { type: "Embassy visa", governmentFee: 0, documents: ["Passport bio page", "Passport photo", "Onward ticket"] }
    },
    // Visa-free destinations for many nationalities (examples)
    "Mauritius": {
      tourism: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport", "Proof of funds", "Return/onward ticket"] },
      business: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport", "Proof of funds", "Return/onward ticket"] },
      transit: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport"] }
    },
    "Seychelles": {
      tourism: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport", "Proof of accommodation", "Return/onward ticket"] },
      business: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport", "Proof of accommodation", "Return/onward ticket"] },
      transit: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport"] }
    },
    "Barbados": {
      tourism: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport", "Proof of funds", "Return/onward ticket"] },
      business: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport", "Proof of funds", "Return/onward ticket"] },
      transit: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport"] }
    },
    "Bahamas": {
      tourism: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport", "Proof of funds", "Return/onward ticket"] },
      business: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport", "Proof of funds", "Return/onward ticket"] },
      transit: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport"] }
    },
    "Fiji": {
      tourism: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport", "Proof of funds", "Return/onward ticket"] },
      business: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport", "Proof of funds", "Return/onward ticket"] },
      transit: { type: "Visa-free", governmentFee: 0, documents: ["Valid passport"] }
    }
  };
}

function computeEligibility({ nationality, destination, purpose }) {
  const dest = String(destination || "").trim();
  const nat = String(nationality || "").trim();
  const purp = String(purpose || "tourism").trim();

  if (!dest || !nat) {
    return {
      destination: dest,
      nationality: nat,
      purpose: purp,
      visaType: "Visa required",
      summary: "Please provide nationality and destination.",
      processingOptions: [],
      requiredDocuments: []
    };
  }

  if (dest.toLowerCase() === nat.toLowerCase()) {
    return {
      destination: dest,
      nationality: nat,
      purpose: purp,
      visaType: "Visa-free",
      summary: "Based on your input, you may not need a visa to travel domestically. Confirm with official government guidance.",
      processingOptions: [{ label: "Standard", daysMin: 0, daysMax: 0, governmentFee: 0, serviceFee: 0, note: "No visa required" }],
      requiredDocuments: ["Valid passport"]
    };
  }

  if (VISA_FREE_GROUP.has(normCountry(dest)) && VISA_FREE_GROUP.has(normCountry(nat))) {
    return {
      destination: dest,
      nationality: nat,
      purpose: purp,
      visaType: "Visa-free",
      summary: "Visa-free travel is typically allowed between these countries for short stays. Always confirm with official government guidance before travel.",
      processingOptions: [{ label: "Standard", daysMin: 0, daysMax: 0, governmentFee: 0, serviceFee: 0, note: "No visa required" }],
      requiredDocuments: ["Valid passport", "Return/onward ticket (recommended)"]
    };
  }

  const rules = visaRules();
  const byDest = rules[dest] || null;
  const rule = byDest ? byDest[purp] || byDest.tourism : null;
  const visaType = rule ? rule.type : "Embassy visa";
  const govFee = rule ? Number(rule.governmentFee || 0) : 0;
  const docs = rule ? rule.documents : ["Passport bio page", "Passport photo"];

  const serviceBase = visaType === "Visa-free" ? 0 : 49;
  const serviceRush = visaType === "Visa-free" ? 0 : 89;

  const processingOptions =
    visaType === "Visa-free"
      ? [{ label: "Standard", daysMin: 0, daysMax: 0, governmentFee: 0, serviceFee: 0, note: "No visa required" }]
      : [
          {
            label: "Standard",
            daysMin: visaType === "Embassy visa" ? 10 : 3,
            daysMax: visaType === "Embassy visa" ? 20 : 7,
            governmentFee: govFee,
            serviceFee: serviceBase,
            note: "We prepare, review, and submit your application to the official portal."
          },
          {
            label: "Rush",
            daysMin: visaType === "Embassy visa" ? 7 : 1,
            daysMax: visaType === "Embassy visa" ? 14 : 3,
            governmentFee: govFee,
            serviceFee: serviceRush,
            note: "Prioritized review and submission support. Subject to portal availability."
          }
        ];

  return {
    destination: dest,
    nationality: nat,
    purpose: purp,
    visaType,
    summary: "This is guidance only. Final requirements, fees, and approval are determined by the destination government.",
    processingOptions,
    requiredDocuments: docs
  };
}

async function handleVisaEligibility(event) {
  const payload = safeJsonParse(event.body || "{}") || {};
  const nationality = String(payload.nationality || "");
  const destination = String(payload.destination || "");
  const purpose = String(payload.purpose || "tourism");
  const arrivalDate = String(payload.arrivalDate || "");

  if (!nationality || !destination || !purpose || !arrivalDate) {
    return json(400, { ok: false, error: "Missing required parameters: nationality, destination, purpose, arrivalDate" });
  }

  const result = computeEligibility({ nationality, destination, purpose, arrivalDate });
  return json(200, { ok: true, result });
}

async function handleVisaCreateApplication(event) {
  const payload = safeJsonParse(event.body || "{}") || {};
  const eligibility = payload.eligibility || null;
  if (!eligibility || !eligibility.destination || !eligibility.nationality) {
    return json(400, { ok: false, error: "Missing eligibility" });
  }

  // Try to use GitHub API; if unavailable, fall back to a local-only demo ID
  try {
    const id = randomId("visa");
    const now = new Date().toISOString();
    const application = {
      id,
      createdAt: now,
      updatedAt: now,
      status: "Draft",
      eligibility,
      applicant: {},
      documents: [],
      notesToApplicant: "",
      portalReference: ""
    };
    await githubCreateOrUpdateFile(`visa-applications/${id}.json`, application, `Create visa application ${id}`);
    return json(200, { ok: true, id });
  } catch (e) {
    // Fallback: return a demo ID that the frontend can store locally
    const demoId = randomId("local");
    return json(200, { ok: true, id: demoId, fallback: "local" });
  }
}

async function handleVisaGetApplication(event) {
  const id = String(event.queryStringParameters?.id || "");
  if (!id) return json(400, { ok: false, error: "Missing id" });

  try {
    const application = await githubGetFile(`visa-applications/${id}.json`);
    if (!application) return json(404, { ok: false, error: "Not found" });
    return json(200, { ok: true, application });
  } catch (e) {
    return json(500, { ok: false, error: e && e.message ? e.message : "Failed to fetch application" });
  }
}

async function handleVisaAdminList(event) {
  const auth = requireVisaAdmin(event);
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });

  try {
    const files = await githubListFiles("visa-applications");
    const apps = [];
    for (const file of files.slice(0, 200)) {
      if (file.type === "file" && file.name.endsWith(".json")) {
        const app = await githubGetFile(file.path);
        if (app) apps.push(app);
      }
    }
    apps.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    return json(200, { ok: true, applications: apps });
  } catch (e) {
    return json(500, { ok: false, error: e && e.message ? e.message : "Failed to list applications" });
  }
}

async function handleVisaAdminUpdate(event) {
  const auth = requireVisaAdmin(event);
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });

  const payload = safeJsonParse(event.body || "{}") || {};
  const id = String(payload.id || "");
  const status = String(payload.status || "");
  const notesToApplicant = String(payload.notesToApplicant || "");

  if (!id) return json(400, { ok: false, error: "Missing id" });

  try {
    const application = await githubGetFile(`visa-applications/${id}.json`);
    if (!application) return json(404, { ok: false, error: "Not found" });

    if (status) application.status = status;
    if (notesToApplicant !== undefined) application.notesToApplicant = notesToApplicant;
    application.updatedAt = new Date().toISOString();

    await githubCreateOrUpdateFile(`visa-applications/${id}.json`, application, `Update visa application ${id}`);
    return json(200, { ok: true, application });
  } catch (e) {
    return json(500, { ok: false, error: e && e.message ? e.message : "Failed to update application" });
  }
}

async function handleStripeCreateSession(event) {
  if (!stripe) {
    return json(503, { ok: false, error: "Stripe is not configured with a valid STRIPE_SECRET_KEY" });
  }

  const payload = safeJsonParse(event.body || "{}") || {};
  const amountCents = payload.amountCents;
  const currency = String(payload.currency || "usd").toLowerCase();
  const description = String(payload.description || "BookingCart booking").slice(0, 120);
  const bookingRef = String(payload.bookingRef || "").trim();
  const customerEmail = String(payload.customerEmail || "").trim().toLowerCase();
  const successPath = String(payload.successPath || "/confirmation");
  const cancelPath = String(payload.cancelPath || "/payment");
  const paymentPurpose = String(payload.paymentPurpose || "booking").trim().toLowerCase();
  const duffelOrderId = String(payload.duffelOrderId || "").trim();

  const unitAmount = Math.round(Number(amountCents));
  if (!Number.isFinite(unitAmount) || unitAmount < 50) {
    return json(400, { ok: false, error: "Invalid amountCents" });
  }

  const originCheck = assertAllowedOrigin(resolveCheckoutOrigin(event));
  if (!originCheck.ok) {
    return json(originCheck.status, { ok: false, error: originCheck.error });
  }
  const origin = originCheck.origin;

  const sp = String(successPath || "/confirmation");
  const cp = String(cancelPath || "/payment");
  const successUrlPath = sp.startsWith("/") ? sp : `/${sp}`;
  const cancelUrlPath = cp.startsWith("/") ? cp : `/${cp}`;
  const successSep = successUrlPath.includes("?") ? "&" : "?";
  const cancelSep = cancelUrlPath.includes("?") ? "&" : "?";

  const metadata = {
    paymentPurpose,
    amountCents: String(unitAmount)
  };
  if (bookingRef) metadata.bookingRef = bookingRef;
  if (duffelOrderId) metadata.duffelOrderId = duffelOrderId;

  const idempotencyKey = bookingRef
    ? `bookingcart:${crypto.createHash("sha256").update([
        "checkout-session",
        bookingRef,
        paymentPurpose,
        currency,
        unitAmount
      ].join(":").toLowerCase()).digest("hex")}`
    : undefined;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
          price_data: {
          currency,
          product_data: { name: description },
          unit_amount: Math.round(unitAmount)
        },
        quantity: 1
      }
    ],
    customer_email: customerEmail || undefined,
    client_reference_id: bookingRef ? String(bookingRef).slice(0, 64) : undefined,
    metadata,
    success_url: `${origin}${successUrlPath}${successSep}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${cancelUrlPath}${cancelSep}canceled=1`
  }, idempotencyKey ? { idempotencyKey } : undefined);

  return json(200, { ok: true, id: session.id, url: session.url, paymentPurpose, reused: false });
}

async function handleStripeSession(event) {
  if (!stripe) {
    return json(503, { ok: false, error: "Stripe is not configured with a valid STRIPE_SECRET_KEY" });
  }

  const sessionId = String(event.queryStringParameters?.session_id || "");
  if (!sessionId) {
    return json(400, { ok: false, error: "Missing session_id" });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return json(200, {
    ok: true,
    session: {
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      currency: session.currency,
      customer_email: session.customer_email,
      client_reference_id: session.client_reference_id,
      metadata: session.metadata || {}
    }
  });
}

exports.handler = async (event) => {
  _lastEventHeaders = event.headers || {};
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders()
        },
        body: ""
      };
    }

    const route = normalizeRoute(event.path);

    if (route === "config" && event.httpMethod === "GET") {
      return json(200, { ok: true, googleClientId: process.env.GOOGLE_CLIENT_ID || "" });
    }

    if (route === "duffel-search" && event.httpMethod === "POST") {
      if (!duffelRateLimitOk(event)) {
        return json(429, { ok: false, error: "Too many requests" });
      }
      return await invokeExpressHandler(duffelSearchHandler, event);
    }

    if (route === "duffel-airports" && event.httpMethod === "GET") {
      if (!duffelRateLimitOk(event)) {
        return json(429, { ok: false, error: "Too many requests" });
      }
      return await invokeExpressHandler(duffelAirportsHandler, event);
    }

    if (route === "duffel-orders" && (event.httpMethod === "POST" || event.httpMethod === "GET")) {
      if (!duffelRateLimitOk(event)) {
        return json(429, { ok: false, error: "Too many requests" });
      }
      return await invokeExpressHandler(duffelOrdersHandler, event);
    }

    if (route === "duffel-payments" && event.httpMethod === "POST") {
      if (!duffelRateLimitOk(event)) {
        return json(429, { ok: false, error: "Too many requests" });
      }
      return await invokeExpressHandler(duffelPaymentsHandler, event);
    }

    if (route === "duffel-offer" && event.httpMethod === "GET") {
      return await invokeExpressHandler(duffelOfferHandler, event);
    }

    if (route === "duffel-seat-maps" && event.httpMethod === "GET") {
      return await invokeExpressHandler(duffelSeatMapsHandler, event);
    }

    if (route === "duffel-order-cancellations" && (event.httpMethod === "POST" || event.httpMethod === "GET")) {
      return await invokeExpressHandler(duffelOrderCancellationsHandler, event);
    }

    if (route === "duffel-order-changes" && (event.httpMethod === "POST" || event.httpMethod === "GET")) {
      return await invokeExpressHandler(duffelOrderChangesHandler, event);
    }

    if (route === "duffel-order-services" && (event.httpMethod === "POST" || event.httpMethod === "GET")) {
      return await invokeExpressHandler(duffelOrderServicesHandler, event);
    }

    if (route === "duffel-client-key" && event.httpMethod === "POST") {
      return await invokeExpressHandler(duffelClientKeyHandler, event);
    }

    if (route === "flight-deals" && (event.httpMethod === "GET" || event.httpMethod === "POST")) {
      return await invokeExpressHandler(flightDealsHandler, event);
    }

    if (route === "bookings" && event.httpMethod === "POST") {
      return await invokeExpressHandler(bookingsHandler, event);
    }

    if (route === "user" && (event.httpMethod === "GET" || event.httpMethod === "POST" || event.httpMethod === "DELETE")) {
      return await invokeExpressHandler(userHandler, event);
    }

    if (route === "support" && (event.httpMethod === "GET" || event.httpMethod === "POST" || event.httpMethod === "PATCH")) {
      return await invokeExpressHandler(supportHandler, event);
    }

    if (route === "ticket-download" && event.httpMethod === "GET") {
      return await invokeExpressHandler(ticketDownloadHandler, event);
    }

    if (route === "price-alert" && event.httpMethod === "POST") {
      return await invokeExpressHandler(priceAlertHandler, event);
    }

    if (route.startsWith("auth/") && event.httpMethod === "POST") {
      return await invokeExpressHandler(authHandler, event, { action: route.slice("auth/".length) });
    }

    if (route === "stripe/create-checkout-session" && event.httpMethod === "POST") {
      return await handleStripeCreateSession(event);
    }

    if (route === "stripe/session" && event.httpMethod === "GET") {
      return await handleStripeSession(event);
    }

    if (route === "visa/eligibility" && event.httpMethod === "POST") {
      return await handleVisaEligibility(event);
    }

    if (route === "visa/application/create" && event.httpMethod === "POST") {
      return await handleVisaCreateApplication(event);
    }

    if (route === "visa/application" && event.httpMethod === "GET") {
      return await handleVisaGetApplication(event);
    }

    if (route === "visa/admin/applications" && event.httpMethod === "GET") {
      return await handleVisaAdminList(event);
    }

    if (route === "visa/admin/update" && event.httpMethod === "POST") {
      return await handleVisaAdminUpdate(event);
    }

    if (route === "travelbuddy/visa/check" && event.httpMethod === "POST") {
      return await handleTravelBuddyVisaCheck(event);
    }

    if (route === "travelbuddy/visa/map" && event.httpMethod === "POST") {
      return await handleTravelBuddyVisaMap(event);
    }

    return json(404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(500, { ok: false, error: "Server error" });
  }
};
