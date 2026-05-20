require('dotenv').config();

const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');
const { getCollections } = require('../lib/mongo');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';
const ORDER_LOCK_TTL_MS = 2 * 60 * 1000;

async function getBookingsCollection() {
  try {
    const { bookings } = await getCollections();
    return bookings;
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
    if (!global.__duffelOrderLocks) global.__duffelOrderLocks = {};
    return null;
  }
}

function normalizeRef(value) {
  const ref = String(value || '').trim();
  return ref ? ref.slice(0, 80) : '';
}

function isFreshProcessingLock(doc) {
  const updatedAt = doc?.duffelOrderRequest?.updatedAt;
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  return Number.isFinite(ts) && Date.now() - ts < ORDER_LOCK_TTL_MS;
}

function existingOrderResponse(doc) {
  if (!doc || !doc.duffelOrderId) return null;
  return {
    ok: true,
    orderId: doc.duffelOrderId,
    bookingReference: doc.duffelBookingReference || doc.ref,
    status: doc.duffelOrderStatus || doc.status || 'confirmed',
    reused: true
  };
}

async function reserveOrderSlot(collection, ref, meta) {
  if (!ref) return { ok: true };

  const now = new Date().toISOString();
  if (collection) {
    const existing = await collection.findOne({ ref });
    const existingResponse = existingOrderResponse(existing);
    if (existingResponse) return { ok: false, response: existingResponse };
    if (isFreshProcessingLock(existing)) {
      return {
        ok: false,
        status: 409,
        response: {
          ok: false,
          error: 'This booking is already being processed. Please wait a moment before trying again.'
        }
      };
    }

    await collection.updateOne(
      { ref },
      {
        $setOnInsert: {
          ref,
          status: 'new',
          createdAt: now
        },
        $set: {
          duffelOrderRequest: {
            ...meta,
            status: 'processing',
            updatedAt: now
          },
          updatedAt: now
        }
      },
      { upsert: true }
    );
    return { ok: true };
  }

  const lock = global.__duffelOrderLocks[ref];
  const existingResponse = existingOrderResponse(lock);
  if (existingResponse) return { ok: false, response: existingResponse };
  if (lock && lock.duffelOrderRequest?.status === 'processing' && isFreshProcessingLock(lock)) {
    return {
      ok: false,
      status: 409,
      response: {
        ok: false,
        error: 'This booking is already being processed. Please wait a moment before trying again.'
      }
    };
  }
  global.__duffelOrderLocks[ref] = {
    ref,
    duffelOrderRequest: {
      ...meta,
      status: 'processing',
      updatedAt: now
    }
  };
  return { ok: true };
}

async function markOrderSlot(collection, ref, update) {
  if (!ref) return;
  const now = new Date().toISOString();

  if (collection) {
    await collection.updateOne(
      { ref },
      {
        $setOnInsert: {
          ref,
          createdAt: now
        },
        $set: {
          ...update,
          updatedAt: now
        }
      },
      { upsert: true }
    );
    return;
  }

  global.__duffelOrderLocks[ref] = {
    ...(global.__duffelOrderLocks[ref] || { ref }),
    ...update,
    updatedAt: now
  };
}

/**
 * Validate a YYYY-MM-DD date string.
 */
function isValidDate(str) {
  if (!str || typeof str !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(str.trim());
}

/**
 * POST /api/duffel-orders
 *
 * Body:
 * {
 *   offerId:     string  — the Duffel offer ID from search (e.g. "off_...")
 *   totalAmount: string  — total_amount from the offer (e.g. "312.40")
 *   currency:    string  — total_currency from the offer (e.g. "USD")
 *   passengers: [        — one entry per passenger, matching the Duffel passenger IDs
 *     {
 *       id:           string  — Duffel passenger ID from offer (e.g. "pas_...")
 *       given_name:   string
 *       family_name:  string
 *       born_on:      string  — YYYY-MM-DD
 *       title:        string  — "mr" | "ms" | "mrs" | "miss" | "dr"
 *       gender:       string  — "m" | "f"
 *       email:        string
 *       phone_number: string  — E.164 format, e.g. "+14155550001"
 *       infant_passenger_id?: string  — if this adult is holding an infant
 *     }
 *   ]
 * }
 *
 * Returns:
 * {
 *   ok: true,
 *   orderId:          string  — Duffel order ID
 *   bookingReference: string  — airline PNR
 *   status:           string  — Duffel order status
 * }
 */
module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!DUFFEL_API_KEY) {
    return res.status(503).json({ ok: false, error: 'Duffel is not configured (missing DUFFEL_API_KEY)' });
  }

  // ── GET Logic (Fetch Order) ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    const orderId = req.query.id;
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing order ID (id parameter)' });
    }

    try {
      const duffelRes = await fetch(`${DUFFEL_BASE_URL}/air/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Duffel-Version': 'v2',
          'Authorization': `Bearer ${DUFFEL_API_KEY}`
        }
      });
      const data = await duffelRes.json().catch(() => null);
      if (!duffelRes.ok || !data || !data.data) {
        return res.status(duffelRes.status >= 500 ? 502 : 400).json({ ok: false, error: 'Failed to fetch order from Duffel' });
      }
      return res.json({ ok: true, order: data.data });
    } catch (err) {
      console.error('Error fetching Duffel order:', err);
      return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  }

  const body = req.body || {};
  const { offerId, totalAmount, currency, passengers, hold, services, payment } = body;
  const bookingRef = normalizeRef(body.bookingRef || body.idempotencyKey);
  const clientIdempotencyKey = normalizeRef(body.idempotencyKey || bookingRef);
  const bookingsCollection = bookingRef ? await getBookingsCollection() : null;

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!offerId || typeof offerId !== 'string' || !offerId.trim()) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid offerId' });
  }

  if (!totalAmount || isNaN(parseFloat(totalAmount))) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid totalAmount' });
  }

  if (!currency || typeof currency !== 'string' || currency.trim().length !== 3) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid currency (must be ISO 4217, e.g. "USD")' });
  }

  if (!Array.isArray(passengers) || passengers.length === 0) {
    return res.status(400).json({ ok: false, error: 'passengers must be a non-empty array' });
  }

  // Validate each passenger
  const VALID_TITLES = ['mr', 'ms', 'mrs', 'miss', 'dr'];
  const VALID_GENDERS = ['m', 'f'];

  for (let i = 0; i < passengers.length; i++) {
    const p = passengers[i];
    if (!p.id || typeof p.id !== 'string') {
      return res.status(400).json({ ok: false, error: `passengers[${i}].id is required (Duffel passenger ID from search)` });
    }
    if (!p.given_name || !p.family_name) {
      return res.status(400).json({ ok: false, error: `passengers[${i}] must have given_name and family_name` });
    }
    if (!isValidDate(p.born_on)) {
      return res.status(400).json({ ok: false, error: `passengers[${i}].born_on must be YYYY-MM-DD` });
    }
    if (!p.title || !VALID_TITLES.includes(p.title.toLowerCase())) {
      return res.status(400).json({ ok: false, error: `passengers[${i}].title must be one of: ${VALID_TITLES.join(', ')}` });
    }
    if (!p.gender || !VALID_GENDERS.includes(p.gender.toLowerCase())) {
      return res.status(400).json({ ok: false, error: `passengers[${i}].gender must be "m" or "f"` });
    }
    if (!p.email || !/\S+@\S+\.\S+/.test(p.email)) {
      return res.status(400).json({ ok: false, error: `passengers[${i}].email is required and must be valid` });
    }
    if (!p.phone_number || typeof p.phone_number !== 'string') {
      return res.status(400).json({ ok: false, error: `passengers[${i}].phone_number is required (E.164 format, e.g. "+14155550001")` });
    }
  }

  // ── Build the Duffel passengers array ────────────────────────────────────────
  const duffelPassengers = passengers.map((p) => {
    const pax = {
      id: p.id.trim(),
      given_name: p.given_name.trim(),
      family_name: p.family_name.trim(),
      born_on: p.born_on.trim(),
      title: p.title.trim().toLowerCase(),
      gender: p.gender.trim().toLowerCase(),
      email: p.email.trim().toLowerCase(),
      phone_number: p.phone_number.trim()
    };
    // Link infant to the accompanying adult
    if (p.infant_passenger_id && typeof p.infant_passenger_id === 'string') {
      pax.infant_passenger_id = p.infant_passenger_id.trim();
    }
    return pax;
  });

  // ── Build the Duffel order payload ───────────────────────────────────────────
  const orderPayload = {
    data: {
      selected_offers: [offerId.trim()],
      passengers: duffelPassengers
    }
  };

  if (Array.isArray(services) && services.length > 0) {
    orderPayload.data.services = services;
  }

  if (hold) {
    orderPayload.data.type = 'hold';
  } else if (payment) {
    orderPayload.data.payments = [payment];
  } else {
    orderPayload.data.payments = [
      {
        type: 'balance',           // Using Duffel balance (Managed Content)
        currency: currency.trim().toUpperCase(),
        amount: String(parseFloat(totalAmount).toFixed(2))
      }
    ];
  }

  const reserve = await reserveOrderSlot(bookingsCollection, bookingRef, {
    idempotencyKey: clientIdempotencyKey,
    offerId: offerId.trim(),
    hold: !!hold,
    paymentType: payment?.type || (hold ? 'hold' : 'balance')
  });
  if (!reserve.ok) {
    return res.status(reserve.status || 200).json(reserve.response);
  }

  // ── Call Duffel POST /air/orders ─────────────────────────────────────────────
  try {
    console.log(`Creating Duffel order for offer ${offerId} — ${passengers.length} passenger(s)`);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Duffel-Version': 'v2',
      'Authorization': `Bearer ${DUFFEL_API_KEY}`
    };
    if (clientIdempotencyKey) {
      headers['Idempotency-Key'] = clientIdempotencyKey;
    }

    const duffelRes = await fetch(`${DUFFEL_BASE_URL}/air/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(orderPayload)
    });

    const duffelText = await duffelRes.text();
    let duffelData;
    try {
      duffelData = JSON.parse(duffelText);
    } catch {
      console.error('Duffel orders response is not valid JSON:', duffelText.slice(0, 500));
      return res.status(502).json({ ok: false, error: 'Unexpected response from Duffel. Please try again.' });
    }

    if (!duffelRes.ok) {
      const duffelErrors = duffelData?.errors;
      const firstError = Array.isArray(duffelErrors) && duffelErrors.length > 0
        ? duffelErrors[0]
        : null;

      const userMessage = firstError
        ? `${firstError.title || 'Booking failed'}: ${firstError.message || ''}`
        : 'Unable to complete booking with the airline. Please try again.';

      console.error('Duffel order creation failed:', duffelRes.status, JSON.stringify(duffelErrors || duffelData).slice(0, 500));
      await markOrderSlot(bookingsCollection, bookingRef, {
        duffelOrderRequest: {
          idempotencyKey: clientIdempotencyKey,
          offerId: offerId.trim(),
          hold: !!hold,
          paymentType: payment?.type || (hold ? 'hold' : 'balance'),
          status: 'failed',
          error: userMessage,
          updatedAt: new Date().toISOString()
        }
      });
      return res.status(duffelRes.status >= 500 ? 502 : duffelRes.status).json({
        ok: false,
        error: userMessage,
        duffelErrors: duffelErrors || null
      });
    }

    const order = duffelData?.data;
    if (!order) {
      return res.status(502).json({ ok: false, error: 'Duffel returned an empty order. Please try again.' });
    }

    console.log(`✅ Duffel order created: ${order.id} — PNR: ${order.booking_reference}`);

    await markOrderSlot(bookingsCollection, bookingRef, {
      status: hold ? 'held' : payment ? 'airline_paid_platform_pending' : 'confirmed',
      duffelOrderId: order.id,
      duffelBookingReference: order.booking_reference || null,
      duffelOrderStatus: order.status || 'confirmed',
      duffelOrderRequest: {
        idempotencyKey: clientIdempotencyKey,
        offerId: offerId.trim(),
        hold: !!hold,
        paymentType: payment?.type || (hold ? 'hold' : 'balance'),
        status: 'succeeded',
        updatedAt: new Date().toISOString()
      }
    });

    return res.json({
      ok: true,
      orderId: order.id,
      bookingReference: order.booking_reference,
      status: order.status || 'confirmed',
      // Pass through useful fields the confirmation page can display
      owner: order.owner ? { name: order.owner.name, iata_code: order.owner.iata_code } : null,
      documents: Array.isArray(order.documents) ? order.documents : []
    });

  } catch (err) {
    console.error('duffel-orders error:', err);
    await markOrderSlot(bookingsCollection, bookingRef, {
      duffelOrderRequest: {
        idempotencyKey: clientIdempotencyKey,
        offerId: offerId.trim(),
        hold: !!hold,
        paymentType: payment?.type || (hold ? 'hold' : 'balance'),
        status: 'failed',
        error: err.message || 'Internal server error',
        updatedAt: new Date().toISOString()
      }
    });
    return res.status(500).json({ ok: false, error: 'Internal server error. Please try again.' });
  }
};
