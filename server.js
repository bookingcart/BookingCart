require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');
const Stripe = require('stripe');
const { assertAllowedOrigin, pickAllowOrigin } = require('./lib/cors');

const bookingsHandler = require('./api-routes/bookings');
const userHandler = require('./api-routes/user');
const duffelSearchHandler = require('./api-routes/duffel-search');
const duffelAirportsHandler = require('./api-routes/duffel-airports');
const duffelOrdersHandler = require('./api-routes/duffel-orders');
const duffelOfferHandler = require('./api-routes/duffel-offer');
const duffelPaymentsHandler = require('./api-routes/duffel-payments');
const duffelSeatMapsHandler = require('./api-routes/duffel-seat-maps');
const duffelOrderCancellationsHandler = require('./api-routes/duffel-order-cancellations');
const duffelOrderChangesHandler = require('./api-routes/duffel-order-changes');
const duffelOrderServicesHandler = require('./api-routes/duffel-order-services');
const flightDealsHandler = require('./api-routes/flight-deals');
const authHandler = require('./api-routes/auth');
const supportHandler = require('./api-routes/support');
const duffelClientKeyHandler = require('./api-routes/duffel-client-key');
const ticketDownloadHandler = require('./api-routes/ticket-download');
const priceAlertHandler = require('./api-routes/price-alert');

const duffelStaysSearchHandler = require('./api-routes/duffel-stays-search');
const duffelStaysRatesHandler = require('./api-routes/duffel-stays-rates');
const duffelStaysQuoteHandler = require('./api-routes/duffel-stays-quote');
const duffelStaysBookingHandler = require('./api-routes/duffel-stays-booking');
const duffelStaysPaymentInstructionHandler = require('./api-routes/duffel-stays-payment-instruction');
const duffelStaysNegotiatedRatesHandler = require('./api-routes/duffel-stays-negotiated-rates');
const duffelStaysAccommodationHandler = require('./api-routes/duffel-stays-accommodation');
const duffelStaysBrandsHandler = require('./api-routes/duffel-stays-brands');
const duffelStaysAccommodationReviewsHandler = require('./api-routes/duffel-stays-accommodation-reviews');

const { startTracker } = require('./lib/price-tracker');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
function getStripeConfigError() {
  if (!STRIPE_SECRET_KEY) {
    return 'Stripe is not configured (missing STRIPE_SECRET_KEY)';
  }

  if (STRIPE_SECRET_KEY.startsWith('rk_')) {
    return 'Stripe is misconfigured: STRIPE_SECRET_KEY is a restricted key (rk_*). Use a secret key (sk_test_* or sk_live_*) for checkout sessions.';
  }

  return null;
}

const stripeConfigError = getStripeConfigError();
const stripe = stripeConfigError ? null : Stripe(STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

const API_ONLY = process.env.API_ONLY === '1';
const SERVE_STATIC =
  process.env.SERVE_STATIC === '1' || process.env.NODE_ENV === 'production';
const DIST_DIR = path.join(__dirname, 'dist');

const EVENTBRITE_TOKEN = process.env.EVENTBRITE_TOKEN || '';
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY || process.env.TICKETMASTER_CONSUMER_KEY || '';
const EVENTBRITE_BASE_URL = 'https://www.eventbriteapi.com/v3';
const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: (origin, cb) => {
      const allow = pickAllowOrigin(origin || '');
      // Only allow explicitly listed origins — reject requests with no Origin header in production
      cb(null, !!allow);
    },
    credentials: true
  })
);
if (!API_ONLY && SERVE_STATIC && fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

app.use(express.json({ limit: '512kb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});
// Strict limiter for auth endpoints to prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts. Please try again in 15 minutes.' }
});

function run(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

app.get('/api/config', apiLimiter, (req, res) => {
  res.json({
    ok: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID || ''
  });
});

app.all('/api/bookings', apiLimiter, run(bookingsHandler));
app.all('/api/user', apiLimiter, run(userHandler));
app.post('/api/duffel-search', searchLimiter, run(duffelSearchHandler));
app.get('/api/duffel-airports', searchLimiter, run(duffelAirportsHandler));
app.all('/api/duffel-orders', searchLimiter, run(duffelOrdersHandler));
app.post('/api/duffel-payments', searchLimiter, run(duffelPaymentsHandler));
app.get('/api/duffel-offer', searchLimiter, run(duffelOfferHandler));
app.get('/api/duffel-seat-maps', searchLimiter, run(duffelSeatMapsHandler));
app.all('/api/duffel-order-cancellations', searchLimiter, run(duffelOrderCancellationsHandler));
app.all('/api/duffel-order-changes', searchLimiter, run(duffelOrderChangesHandler));
app.all('/api/duffel-order-services', searchLimiter, run(duffelOrderServicesHandler));
app.all('/api/flight-deals', searchLimiter, run(flightDealsHandler));
app.all('/api/support', apiLimiter, run(supportHandler));
app.post('/api/duffel-client-key', searchLimiter, run(duffelClientKeyHandler));
app.get('/api/ticket-download', apiLimiter, run(ticketDownloadHandler));
app.post('/api/price-alert', apiLimiter, run(priceAlertHandler));

// Stays routes
app.post('/api/stays-search', searchLimiter, run(duffelStaysSearchHandler));
app.get('/api/stays-rates', searchLimiter, run(duffelStaysRatesHandler));
app.all('/api/stays-quote', searchLimiter, run(duffelStaysQuoteHandler));
app.all('/api/stays-booking', searchLimiter, run(duffelStaysBookingHandler));
app.all('/api/stays-payment-instruction', searchLimiter, run(duffelStaysPaymentInstructionHandler));
app.all('/api/stays-negotiated-rates', searchLimiter, run(duffelStaysNegotiatedRatesHandler));
app.all('/api/stays-accommodation', searchLimiter, run(duffelStaysAccommodationHandler));
app.all('/api/stays-brands', searchLimiter, run(duffelStaysBrandsHandler));
app.all('/api/stays-accommodation-reviews', searchLimiter, run(duffelStaysAccommodationReviewsHandler));

// Email + password auth endpoints — use strict authLimiter (10 req / 15 min) to prevent brute-force
app.post('/api/auth/register', authLimiter, (req, res, next) => {
  req.params = { action: 'register' };
  return Promise.resolve(authHandler(req, res)).catch(next);
});
app.post('/api/auth/login', authLimiter, (req, res, next) => {
  req.params = { action: 'login' };
  return Promise.resolve(authHandler(req, res)).catch(next);
});
app.post('/api/auth/logout', apiLimiter, (req, res, next) => {
  req.params = { action: 'logout' };
  return Promise.resolve(authHandler(req, res)).catch(next);
});
app.post('/api/auth/forgot-password', authLimiter, (req, res, next) => {
  req.params = { action: 'forgot-password' };
  return Promise.resolve(authHandler(req, res)).catch(next);
});
app.post('/api/auth/reset-password', authLimiter, (req, res, next) => {
  req.params = { action: 'reset-password' };
  return Promise.resolve(authHandler(req, res)).catch(next);
});
app.post('/api/auth/change-password', authLimiter, (req, res, next) => {
  req.params = { action: 'change-password' };
  return Promise.resolve(authHandler(req, res)).catch(next);
});

function getRequestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

function resolveCheckoutOrigin(req) {
  const fromHeader = String(req.headers.origin || '').trim();
  if (fromHeader) return fromHeader;
  const hostBased = getRequestOrigin(req);
  if (hostBased) return hostBased;
  const ref = String(req.get('referer') || '').trim();
  if (ref) {
    try {
      return new URL(ref).origin;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function stripeIdempotencyKey(parts) {
  const raw = parts
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(':');
  if (!raw) return undefined;
  return `bookingcart:${crypto.createHash('sha256').update(raw).digest('hex')}`;
}

app.post('/api/stripe/create-checkout-session', apiLimiter, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ ok: false, error: stripeConfigError });
  }

  try {
    const payload = req.body || {};
    const amountCents = Math.round(Number(payload.amountCents));
    const currency = String(payload.currency || 'usd').toLowerCase();
    const description = String(payload.description || 'BookingCart booking').slice(0, 120);
    const bookingRef = String(payload.bookingRef || '').trim();
    const successPath = String(payload.successPath || '/confirmation');
    const cancelPath = String(payload.cancelPath || '/payment');
    const customerEmail = String(payload.customerEmail || '').trim().toLowerCase();
    const paymentPurpose = String(payload.paymentPurpose || 'booking').trim().toLowerCase();
    const duffelOrderId = String(payload.duffelOrderId || '').trim();

    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return res.status(400).json({ ok: false, error: 'Invalid amountCents' });
    }

    const originCheck = assertAllowedOrigin(resolveCheckoutOrigin(req));
    if (!originCheck.ok) {
      return res.status(originCheck.status).json({ ok: false, error: originCheck.error });
    }
    const origin = originCheck.origin;

    const successUrlPath = successPath.startsWith('/') ? successPath : `/${successPath}`;
    const cancelUrlPath = cancelPath.startsWith('/') ? cancelPath : `/${cancelPath}`;
    const successSep = successUrlPath.includes('?') ? '&' : '?';
    const cancelSep = cancelUrlPath.includes('?') ? '&' : '?';

    const metadata = {
      paymentPurpose,
      amountCents: String(amountCents)
    };
    if (bookingRef) metadata.bookingRef = bookingRef;
    if (duffelOrderId) metadata.duffelOrderId = duffelOrderId;

    const idempotencyKey = bookingRef
      ? stripeIdempotencyKey([
          'checkout-session',
          bookingRef,
          paymentPurpose,
          currency,
          amountCents
        ])
      : undefined;

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: description },
              unit_amount: amountCents
            },
            quantity: 1
          }
        ],
        customer_email: customerEmail || undefined,
        client_reference_id: bookingRef || undefined,
        metadata,
        success_url: `${origin}${successUrlPath}${successSep}session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${cancelUrlPath}${cancelSep}canceled=1`
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    return res.json({
      ok: true,
      id: session.id,
      url: session.url,
      paymentPurpose,
      reused: false
    });
  } catch (error) {
    console.error('Stripe checkout session error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Unable to create checkout session' });
  }
});

app.get('/api/stripe/session', apiLimiter, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ ok: false, error: stripeConfigError });
  }

  try {
    const sessionId = String(req.query.session_id || '').trim();
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'Missing session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return res.json({
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
  } catch (error) {
    console.error('Stripe session lookup error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Unable to load checkout session' });
  }
});

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function eventbriteGet(urlPath) {
  const url = `${EVENTBRITE_BASE_URL}${urlPath}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${EVENTBRITE_TOKEN}`,
      Accept: 'application/json'
    }
  });
  const text = await resp.text();
  const json = safeJson(text);
  return { ok: resp.ok, status: resp.status, json, text };
}

function normalizeTicketmasterEvent(e) {
  const name = String(e?.name || '').trim();
  const url = String(e?.url || '').trim();
  const startLocal = e?.dates?.start?.dateTime || e?.dates?.start?.localDate || '';
  const venue = e?._embedded?.venues?.[0];

  const images = Array.isArray(e?.images) ? e.images : [];
  const bestImg = images.slice().sort((a, b) => (b?.width || 0) - (a?.width || 0))[0];
  const logoUrl = bestImg?.url || '';

  const priceRange = Array.isArray(e?.priceRanges) ? e.priceRanges[0] : null;
  const currency = priceRange?.currency || 'USD';
  const minPrice = typeof priceRange?.min === 'number' ? priceRange.min : null;

  return {
    id: e?.id || url || name,
    url,
    name: { text: name },
    description: { text: '' },
    start: { local: startLocal },
    logo: logoUrl ? { url: logoUrl } : null,
    venue: venue
      ? {
          name: String(venue?.name || ''),
          address: {
            city: String(venue?.city?.name || ''),
            region: String(venue?.state?.name || ''),
            country: String(venue?.country?.name || '')
          }
        }
      : null,
    currency,
    price: minPrice === null ? 0 : minPrice,
    is_free: minPrice === 0,
    source: 'ticketmaster'
  };
}

async function fetchTicketmasterEventsByLocation(location) {
  if (!TICKETMASTER_API_KEY) {
    return {
      ok: false,
      status: 500,
      error: 'Ticketmaster API key not configured.',
      events: []
    };
  }

  const params = new URLSearchParams({
    apikey: TICKETMASTER_API_KEY,
    keyword: location,
    size: '30',
    sort: 'date,asc'
  });
  const url = `${TICKETMASTER_BASE_URL}/events.json?${params.toString()}`;

  const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const text = await resp.text();
  const json = safeJson(text);

  if (!resp.ok) {
    console.error('Ticketmaster upstream error:', resp.status);
    return { ok: false, status: resp.status, error: 'Ticketmaster upstream error', events: [] };
  }

  const embedded = json && json._embedded && json._embedded.events ? json._embedded.events : [];
  const events = Array.isArray(embedded) ? embedded.map(normalizeTicketmasterEvent) : [];
  return { ok: true, status: 200, events };
}

async function fetchEventbriteEventsByLocation(location) {
  if (!EVENTBRITE_TOKEN) {
    return {
      ok: false,
      status: 500,
      error: 'Eventbrite token not configured.',
      events: []
    };
  }

  const orgsResp = await eventbriteGet('/users/me/organizations/?page_size=50');
  if (!orgsResp.ok) {
    console.error('Eventbrite upstream error:', orgsResp.status);
    return { ok: false, status: orgsResp.status || 502, error: 'Eventbrite upstream error', events: [] };
  }

  const orgs = Array.isArray(orgsResp.json?.organizations) ? orgsResp.json.organizations : [];
  const locationLc = String(location || '').trim().toLowerCase();

  const perOrg = await Promise.all(
    orgs.map(async (org) => {
      const orgId = org && org.id ? String(org.id) : '';
      if (!orgId) return [];
      const evResp = await eventbriteGet(
        `/organizations/${encodeURIComponent(orgId)}/events/?status=live&order_by=start_asc&expand=venue,logo&page_size=50`
      );
      if (!evResp.ok) return [];
      const events = Array.isArray(evResp.json?.events) ? evResp.json.events : [];

      return events.filter((e) => {
        const venue = e?.venue;
        const city = String(venue?.address?.city || '');
        const addr = String(venue?.address?.localized_address_display || '');
        const name = String(venue?.name || '');
        const hay = `${city} ${addr} ${name}`.toLowerCase();
        return locationLc ? hay.includes(locationLc) : true;
      });
    })
  );

  const flat = perOrg.flat().slice(0, 60);
  return { ok: true, status: 200, events: flat };
}

app.get('/api/events/status', apiLimiter, async (req, res) => {
  const eventbriteConfigured = !!EVENTBRITE_TOKEN;
  const ticketmasterConfigured = !!TICKETMASTER_API_KEY;
  if (!eventbriteConfigured && !ticketmasterConfigured) {
    return res.json({
      ok: false,
      error: 'No events providers configured. Set EVENTBRITE_TOKEN and/or TICKETMASTER_API_KEY.'
    });
  }
  return res.json({ ok: true, eventbriteConfigured, ticketmasterConfigured });
});

app.get('/api/events/search', apiLimiter, async (req, res) => {
  try {
    const location = String(req.query.location || '').trim();
    if (!location) {
      return res.status(400).json({ ok: false, error: 'Missing required parameter: location' });
    }

    const result = await fetchEventbriteEventsByLocation(location);
    if (!result.ok) {
      return res
        .status(result.status || 500)
        .json({ ok: false, error: result.error || 'Event search failed' });
    }
    return res.json({ ok: true, events: result.events || [] });
  } catch (error) {
    console.error('events/search:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

app.get('/api/events/ticketmaster', apiLimiter, async (req, res) => {
  try {
    const location = String(req.query.location || '').trim();
    if (!location) {
      return res.status(400).json({ ok: false, error: 'Missing required parameter: location' });
    }

    const result = await fetchTicketmasterEventsByLocation(location);
    if (!result.ok) {
      return res
        .status(result.status || 500)
        .json({ ok: false, error: result.error || 'Ticketmaster search failed' });
    }
    return res.json({ ok: true, events: result.events || [] });
  } catch (error) {
    console.error('events/ticketmaster:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

app.get('/api/events/search-combined', apiLimiter, async (req, res) => {
  try {
    const location = String(req.query.location || '').trim();
    if (!location) {
      return res.status(400).json({ ok: false, error: 'Missing required parameter: location' });
    }

    const [eb, tm] = await Promise.all([
      EVENTBRITE_TOKEN ? fetchEventbriteEventsByLocation(location) : Promise.resolve({ ok: false, events: [] }),
      TICKETMASTER_API_KEY
        ? fetchTicketmasterEventsByLocation(location)
        : Promise.resolve({ ok: false, events: [] })
    ]);

    const combined = [];
    const seen = new Set();

    for (const e of eb.events || []) {
      const key = String(e?.url || e?.id || '').trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        combined.push(e);
      }
    }
    for (const e of tm.events || []) {
      const key = String(e?.url || e?.id || '').trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        combined.push(e);
      }
    }

    if (combined.length === 0 && !EVENTBRITE_TOKEN && !TICKETMASTER_API_KEY) {
      return res.status(503).json({
        ok: false,
        error: 'No events providers configured. Set EVENTBRITE_TOKEN and/or TICKETMASTER_API_KEY.'
      });
    }

    combined.sort((a, b) => {
      const da = Date.parse(a?.start?.local || '') || 0;
      const db = Date.parse(b?.start?.local || '') || 0;
      return da - db;
    });

    return res.json({ ok: true, events: combined.slice(0, 80) });
  } catch (error) {
    console.error('events/search-combined:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

app.get('/api/amadeus-airports', searchLimiter, async (req, res) => {
  try {
    const { keyword } = req.query;

    if (!keyword || keyword.length < 2) {
      return res.json({ ok: true, airports: [] });
    }

    const commonAirports = [
      { city: 'New York', name: 'John F. Kennedy International', code: 'JFK', country: 'United States' },
      { city: 'New York', name: 'Newark Liberty International', code: 'EWR', country: 'United States' },
      { city: 'Los Angeles', name: 'Los Angeles International', code: 'LAX', country: 'United States' },
      { city: 'Chicago', name: "O'Hare International", code: 'ORD', country: 'United States' },
      { city: 'San Francisco', name: 'San Francisco International', code: 'SFO', country: 'United States' },
      { city: 'Miami', name: 'Miami International', code: 'MIA', country: 'United States' },
      { city: 'Boston', name: 'Logan International', code: 'BOS', country: 'United States' },
      { city: 'Washington', name: 'Dulles International', code: 'IAD', country: 'United States' },
      { city: 'Las Vegas', name: 'Harry Reid International', code: 'LAS', country: 'United States' },
      { city: 'Seattle', name: 'Seattle-Tacoma International', code: 'SEA', country: 'United States' },
      { city: 'London', name: 'Heathrow', code: 'LHR', country: 'United Kingdom' },
      { city: 'London', name: 'Gatwick', code: 'LGW', country: 'United Kingdom' },
      { city: 'Paris', name: 'Charles de Gaulle', code: 'CDG', country: 'France' },
      { city: 'Amsterdam', name: 'Schiphol', code: 'AMS', country: 'Netherlands' },
      { city: 'Frankfurt', name: 'Frankfurt Airport', code: 'FRA', country: 'Germany' },
      { city: 'Munich', name: 'Munich Airport', code: 'MUC', country: 'Germany' },
      { city: 'Rome', name: 'Fiumicino', code: 'FCO', country: 'Italy' },
      { city: 'Madrid', name: 'Barajas', code: 'MAD', country: 'Spain' },
      { city: 'Barcelona', name: 'El Prat', code: 'BCN', country: 'Spain' },
      { city: 'Istanbul', name: 'Istanbul Airport', code: 'IST', country: 'Turkey' },
      { city: 'Dubai', name: 'Dubai International', code: 'DXB', country: 'UAE' },
      { city: 'Doha', name: 'Hamad International', code: 'DOH', country: 'Qatar' },
      { city: 'Cairo', name: 'Cairo International', code: 'CAI', country: 'Egypt' },
      { city: 'Riyadh', name: 'King Khalid International', code: 'RUH', country: 'Saudi Arabia' },
      { city: 'Jeddah', name: 'King Abdulaziz International', code: 'JED', country: 'Saudi Arabia' },
      { city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj International', code: 'BOM', country: 'India' },
      { city: 'Delhi', name: 'Indira Gandhi International', code: 'DEL', country: 'India' },
      { city: 'Tokyo', name: 'Haneda', code: 'HND', country: 'Japan' },
      { city: 'Tokyo', name: 'Narita', code: 'NRT', country: 'Japan' },
      { city: 'Seoul', name: 'Incheon International', code: 'ICN', country: 'South Korea' },
      { city: 'Singapore', name: 'Changi', code: 'SIN', country: 'Singapore' },
      { city: 'Hong Kong', name: 'Hong Kong International', code: 'HKG', country: 'Hong Kong' },
      { city: 'Bangkok', name: 'Suvarnabhumi', code: 'BKK', country: 'Thailand' },
      { city: 'Sydney', name: 'Kingsford Smith', code: 'SYD', country: 'Australia' },
      { city: 'Melbourne', name: 'Tullamarine', code: 'MEL', country: 'Australia' },
      { city: 'Toronto', name: 'Pearson International', code: 'YYZ', country: 'Canada' },
      { city: 'Vancouver', name: 'Vancouver International', code: 'YVR', country: 'Canada' },
      { city: 'Mexico City', name: 'Benito Juárez International', code: 'MEX', country: 'Mexico' },
      { city: 'São Paulo', name: 'Guarulhos International', code: 'GRU', country: 'Brazil' },
      { city: 'Nairobi', name: 'Jomo Kenyatta International', code: 'NBO', country: 'Kenya' },
      { city: 'Lagos', name: 'Murtala Muhammed International', code: 'LOS', country: 'Nigeria' },
      { city: 'Johannesburg', name: 'O.R. Tambo International', code: 'JNB', country: 'South Africa' }
    ];

    const filtered = commonAirports.filter(
      (airport) =>
        airport.city.toLowerCase().includes(keyword.toLowerCase()) ||
        airport.code.toLowerCase().includes(keyword.toLowerCase()) ||
        airport.name.toLowerCase().includes(keyword.toLowerCase())
    );

    return res.json({
      ok: true,
      airports: filtered.slice(0, 5)
    });
  } catch (error) {
    console.error('amadeus-airports:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// ─── OpenSky Network Proxy (reliable, no CORS, fast) ─────────────────────────
const OPENSKY_BASE = 'https://opensky-network.org/api';

async function openskyFetch(path, timeoutMs = 12000) {
  const url = `${OPENSKY_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'BookingCart/1.0' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`OpenSky upstream ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Normalize OpenSky state vector array → ADSB-style object
// State: [icao24, callsign, origin_country, time_pos, last_contact,
//         lon, lat, baro_alt(m), on_ground, velocity(m/s),
//         true_track, vert_rate, sensors, geo_alt(m), squawk, spi, pos_source]
function normalizeState(s) {
  return {
    hex:      s[0] || '',
    flight:   (s[1] || '').trim() || s[0],
    lat:      s[6],
    lon:      s[5],
    alt_baro: s[7] != null ? s[7] / 0.3048 : 'ground', // m → ft for frontend compat
    gs:       s[9] != null ? s[9] / 0.514444 : 0,       // m/s → knots
    track:    s[10] || 0,
    baro_rate: s[11] || 0,
    r:        s[0],
    type:     s[2] || '',
    on_ground: s[8]
  };
}

// Bounding box / radius fetch: /api/adsb/area?lat=X&lon=Y&dist=Z
app.get('/api/adsb/area', apiLimiter, async (req, res) => {
  try {
    const { lat, lon, dist } = req.query;
    if (!lat || !lon || !dist) return res.status(400).json({ ok: false, error: 'Missing lat, lon, dist' });

    const centerLat = parseFloat(lat);
    const centerLon = parseFloat(lon);
    const distNm    = Math.min(parseInt(dist), 250);
    const deg       = (distNm * 1.852) / 111.32; // nm → degrees

    const lamin = (centerLat - deg).toFixed(4);
    const lamax = (centerLat + deg).toFixed(4);
    const lomin = (centerLon - deg).toFixed(4);
    const lomax = (centerLon + deg).toFixed(4);

    const data = await openskyFetch(`/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`);
    const ac   = (data.states || [])
      .filter(s => s[5] != null && s[6] != null)
      .map(normalizeState);

    return res.json({ ok: true, ac });
  } catch (err) {
    console.error('Area proxy error:', err.message);
    return res.status(502).json({ ok: false, error: err.message });
  }
});

// Callsign search: /api/adsb/callsign/:callsign
// OpenSky doesn't support callsign filter, so fetch a wide area and filter locally
app.get('/api/adsb/callsign/:callsign', apiLimiter, async (req, res) => {
  try {
    const callsign = String(req.params.callsign || '').trim().toUpperCase();
    if (!callsign) return res.status(400).json({ ok: false, error: 'Missing callsign' });

    // Fetch a large area (Europe+Africa+Middle East covers most common flights)
    const regions = [
      { lamin: -40, lamax: 75, lomin: -30, lomax: 70 },   // Europe/Africa
      { lamin: -10, lamax: 55, lomin: 60,  lomax: 160 },  // Asia/Pacific
      { lamin: 10,  lamax: 75, lomin: -170,lomax: -30 },  // Americas
    ];

    for (const r of regions) {
      const data = await openskyFetch(`/states/all?lamin=${r.lamin}&lomin=${r.lomin}&lamax=${r.lamax}&lomax=${r.lomax}`, 15000);
      const states = (data.states || []).filter(s => s[5] != null && s[6] != null);
      const match  = states.find(s => (s[1] || '').trim().toUpperCase() === callsign ||
                                      (s[1] || '').trim().toUpperCase().startsWith(callsign));
      if (match) {
        return res.json({ ok: true, ac: [normalizeState(match)] });
      }
    }

    return res.json({ ok: true, ac: [] });
  } catch (err) {
    console.error('Callsign proxy error:', err.message);
    return res.status(502).json({ ok: false, error: err.message });
  }
});

if (!API_ONLY && SERVE_STATIC && fs.existsSync(DIST_DIR)) {
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`BookingCart server running on http://localhost:${PORT}`);
    console.log(`Duffel API Key configured: ${!!process.env.DUFFEL_API_KEY}`);
    if (stripeConfigError) {
      console.error(stripeConfigError);
    }
    
    // Start background price tracking
    try {
      startTracker();
      console.log('Background price tracker successfully started.');
    } catch (e) {
      console.error('Failed to start background price tracker:', e.message);
    }
  });
}

module.exports = app;
