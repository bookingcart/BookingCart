// api-routes/attraction-ticket-checkout.js
// Public side of attraction ticketing: availability, live pricing, the checkout
// itself (reserve -> Stripe -> verify -> issue tickets) and the customer's own
// list of passes with self-service cancellation.
//
// Nothing here trusts a client-submitted price: every total is recomputed from
// the database by lib/ticketing before an order or a Stripe session is created.

const { query, withTransaction, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { verifyRequestBearer } = require('../lib/google-verify');
const notificationHub = require('../lib/notification-hub');
const stripeLib = require('../lib/stripe');
const T = require('../lib/ticketing');

const RESERVATION_TTL_MINUTES = 30;

function resolveOrigin(req) {
  const configured = String(process.env.APP_URL || process.env.PUBLIC_URL || '').trim();
  if (/^https?:\/\//.test(configured)) return configured.replace(/\/+$/, '');
  const origin = req.headers.origin
    || (req.headers.host ? `http://${req.headers.host}` : 'http://localhost:5173');
  return String(origin).replace(/\/+$/, '');
}

function mapOrder(order, tickets = []) {
  return {
    id: order.id,
    bookingRef: order.booking_ref,
    attractionId: order.attraction_id,
    attractionName: order.attraction_name,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    customerPhone: order.customer_phone,
    visitDate: T.isoDate(order.visit_date),
    slotId: Number(order.slot_id || 0),
    slotLabel: order.slot_label,
    subtotal: Number(order.subtotal || 0),
    discount: Number(order.discount || 0),
    promoCode: order.promo_code,
    taxAmount: Number(order.tax_amount || 0),
    serviceFee: Number(order.service_fee || 0),
    total: Number(order.total || 0),
    refundAmount: Number(order.refund_amount || 0),
    currency: order.currency,
    status: order.status,
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    quantity: Number(order.quantity_total || 0),
    admissionsTotal: Number(order.admissions_total || 0),
    notes: order.notes,
    createdAt: order.created_at,
    expiresAt: order.expires_at,
    refundRequestedAt: order.refund_requested_at,
    tickets: tickets.map((ticket) => T.publicTicket(ticket)),
  };
}

async function loadOrderByRef(ref) {
  const value = T.text(ref, 40).toUpperCase();
  if (!/^ATC-[A-Z0-9]{6,20}$/.test(value)) return null;
  const res = await query(`SELECT * FROM bc_ticket_orders WHERE UPPER(booking_ref) = $1 LIMIT 1`, [value]);
  return res.rows[0] || null;
}

async function loadTickets(orderId) {
  const res = await query(
    `SELECT * FROM bc_attraction_tickets WHERE order_id = $1 ORDER BY id ASC`,
    [orderId]
  );
  return res.rows;
}

async function createOrder({ attractionId, visitDate, slotId, items, promoCode, customerName, customerEmail, customerPhone, notes }) {
  const quote = await T.computeQuote({ attractionId, visitDate, slotId, items, promoCode });
  if (!quote.ok) return quote;
  const q = quote.quote;

  const types = await T.listTicketTypes(attractionId);
  const typeMap = new Map(types.map((type) => [Number(type.id), type]));
  const calendarRows = await T.getCalendar(attractionId, visitDate, visitDate);

  try {
    const order = await withTransaction(async (client) => {
      const attractionRes = await client.query(
        `SELECT id, name, owner_email FROM bc_attraction_profiles WHERE id = $1 AND deleted = false`,
        [attractionId]
      );
      const attraction = attractionRes.rows[0];
      if (!attraction) throw Object.assign(new Error('Attraction not found'), { status: 404 });

      const created = await client.query(
        `INSERT INTO bc_ticket_orders (
           booking_ref, attraction_id, attraction_name, owner_email, customer_name, customer_email,
           customer_phone, visit_date, slot_id, slot_label, subtotal, discount, promo_code,
           tax_amount, service_fee, total, currency, status, payment_status, payment_method,
           admissions_total, quantity_total, notes, channel, expires_at
         ) VALUES ($1,$2,COALESCE($3, ''),COALESCE($4, ''),$5,$6,COALESCE($7, ''),$8,$9,COALESCE($10, ''),$11,$12,COALESCE($13, ''),$14,$15,$16,$17,
                   'pending_payment','unpaid','',$18,$19,COALESCE($20, ''),'online', NOW() + ($21 || ' minutes')::interval)
         RETURNING *`,
        [
          T.newBookingRef(), attractionId, attraction.name || '',
          String(attraction.owner_email || '').toLowerCase(),
          customerName, customerEmail, customerPhone || '',
          visitDate, q.slotId, q.slotLabel || '',
          q.subtotal, q.discount, q.promoCode || '',
          q.taxAmount, q.serviceFee, q.total, q.currency,
          q.admissionsTotal, q.quantityTotal, notes,
          String(RESERVATION_TTL_MINUTES),
        ]
      );
      const orderRow = created.rows[0];

      for (const line of q.lines) {
        await client.query(
          `INSERT INTO bc_ticket_order_items (
             order_id, ticket_type_id, ticket_type_name, slot_id, visit_date,
             unit_price, quantity, admissions_per_unit, line_total
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            orderRow.id, line.ticketTypeId, line.name, line.slotId, visitDate,
            line.unitPrice, line.quantity, line.admissions, line.lineTotal,
          ]
        );
      }

      await T.reserveInventory(client, {
        attractionId, visitDate, lines: q.lines, typeMap, calendarRows,
      });

      return orderRow;
    });

    return { ok: true, order, quote: q };
  } catch (error) {
    if (error.code === 'SOLD_OUT') return { ok: false, status: 409, error: error.message };
    throw error;
  }
}

async function startPaymentSession(req, order) {
  const configError = stripeLib.getStripeConfigError();
  if (configError) return { ok: false, status: 503, error: configError };

  const origin = resolveOrigin(req);
  const stripe = stripeLib.getStripeClient();
  const currency = String(order.currency || 'USD').toLowerCase();
  const amount = stripeLib.toStripeAmount(order.total, currency);
  if (amount < 50) {
    return { ok: false, status: 400, error: 'This booking total is below the card minimum' };
  }

  const successPath = `/attraction-tickets/confirmation?ref=${encodeURIComponent(order.booking_ref)}`;
  const cancelPath = `/attractions/tickets?ref=${encodeURIComponent(order.booking_ref)}&canceled=1`;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card', 'link'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `${order.attraction_name} tickets`.slice(0, 120),
                description: `${order.quantity_total} ticket(s) on ${T.isoDate(order.visit_date)}`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        customer_email: order.customer_email || undefined,
        client_reference_id: order.booking_ref,
        metadata: {
          paymentPurpose: 'attraction_ticket',
          bookingRef: order.booking_ref,
          attractionId: String(order.attraction_id),
          amountCents: String(amount),
        },
        expires_at: Math.floor(Date.now() / 1000) + RESERVATION_TTL_MINUTES * 60,
        success_url: `${origin}${successPath}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${cancelPath}`,
      },
      { idempotencyKey: `attraction-ticket-${order.booking_ref}` }
    );

    await query(
      `UPDATE bc_ticket_orders
          SET payment_ref = $2, payment_method = 'card', updated_at = NOW()
        WHERE id = $1`,
      [order.id, session.id]
    );

    return { ok: true, sessionId: session.id, url: session.url };
  } catch (error) {
    console.error('[attraction-ticket-checkout] Stripe session error:', error.message);
    return { ok: false, status: 502, error: 'Could not open the payment page. Please try again.' };
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

module.exports = async function attractionTicketCheckoutHandler(req, res) {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let dbReady = false;
  try {
    if (isDbConfigured()) {
      await initDb();
      dbReady = true;
    }
  } catch (error) {
    console.warn('[attraction-ticket-checkout] DB unavailable:', error.message);
  }
  if (!dbReady) {
    return res.status(503).json({ ok: false, error: 'Ticketing requires the database. Run the migrations first.' });
  }

  const body = req.method === 'GET' ? req.query : (req.body || {});
  const action = String(body.action || req.query.action || '').toLowerCase();
  const attractionId = T.toInt(body.attractionId || req.query.attractionId, 0);

  try {
    // ── Public: what is on sale for a date ──
    if (action === 'availability' || action === '') {
      if (!attractionId) return res.status(400).json({ ok: false, error: 'attractionId is required' });
      const date = T.isDateISO(body.date || body.visitDate) ? (body.date || body.visitDate) : T.isoToday();
      await T.releaseExpiredHolds(25);
      const result = await T.getAvailability(attractionId, date);
      if (!result.ok) return res.status(result.status || 400).json({ ok: false, error: result.error });
      const settings = await T.getSettings(attractionId);
      return res.json({
        ok: true,
        ...result.availability,
        cancellationWindowHours: Number(settings.cancellation_window_hours || 24),
      });
    }

    // ── Public: server-side price for a selection ──
    if (action === 'quote') {
      if (!attractionId) return res.status(400).json({ ok: false, error: 'attractionId is required' });
      const result = await T.computeQuote({
        attractionId,
        visitDate: String(body.visitDate || body.date || ''),
        slotId: T.toInt(body.slotId, 0),
        items: Array.isArray(body.items) ? body.items : [],
        promoCode: body.promoCode || '',
      });
      if (!result.ok) return res.status(result.status || 400).json({ ok: false, error: result.error });
      return res.json({ ok: true, quote: result.quote });
    }

    // ── Public: reserve inventory and open a payment session ──
    if (action === 'create-order') {
      if (!attractionId) return res.status(400).json({ ok: false, error: 'attractionId is required' });

      const customerName = T.text(body.customerName || body.name, 120);
      if (customerName.length < 2) return res.status(400).json({ ok: false, error: 'Enter the lead visitor name' });
      const customerEmail = String(body.customerEmail || body.email || '').trim().toLowerCase();
      if (!T.validEmail(customerEmail)) return res.status(400).json({ ok: false, error: 'Enter a valid email address' });
      const customerPhone = T.text(body.customerPhone || body.phone, 40);

      await T.releaseExpiredHolds(25);

      const created = await createOrder({
        attractionId,
        visitDate: String(body.visitDate || body.date || ''),
        slotId: T.toInt(body.slotId, 0),
        items: Array.isArray(body.items) ? body.items : [],
        promoCode: T.text(body.promoCode, 40),
        customerName,
        customerEmail,
        customerPhone,
        notes: T.text(body.notes, 500),
      });
      if (!created.ok) return res.status(created.status || 400).json({ ok: false, error: created.error });

      const payment = await startPaymentSession(req, created.order);
      if (!payment.ok) {
        // Never hold inventory for a checkout the customer cannot pay for.
        await withTransaction(async (client) => {
          await T.releaseReservation(client, created.order.id);
          await client.query(
            `UPDATE bc_ticket_orders SET status = 'expired', updated_at = NOW() WHERE id = $1`,
            [created.order.id]
          );
        });
        return res.status(payment.status || 502).json({ ok: false, error: payment.error });
      }

      return res.json({
        ok: true,
        bookingRef: created.order.booking_ref,
        order: mapOrder(created.order),
        quote: created.quote,
        payment: { sessionId: payment.sessionId, url: payment.url },
      });
    }

    // ── Public: verify payment and issue the tickets ──
    if (action === 'confirm') {
      const order = await loadOrderByRef(body.ref || body.bookingRef || '');
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });

      const tickets = await loadTickets(order.id);
      if (order.status === 'confirmed' && order.payment_status === 'paid') {
        return res.json({ ok: true, alreadyConfirmed: true, order: mapOrder(order, tickets) });
      }
      if (['cancelled', 'refunded', 'expired'].includes(order.status)) {
        return res.status(409).json({ ok: false, error: `This booking is ${order.status}` });
      }

      const sessionId = T.text(body.sessionId || body.session_id, 200);
      if (!sessionId) return res.status(400).json({ ok: false, error: 'A payment session is required' });

      const session = await stripeLib.verifyCheckoutSession(sessionId);
      if (!session.ok) return res.status(502).json({ ok: false, error: session.error });

      const refFromStripe = String(session.metadata?.bookingRef || '');
      if (refFromStripe && refFromStripe.toUpperCase() !== order.booking_ref.toUpperCase()) {
        return res.status(409).json({ ok: false, error: 'This payment belongs to a different booking' });
      }
      if (!session.paid) {
        return res.status(402).json({
          ok: false,
          pending: true,
          error: 'Payment has not been confirmed yet. Your tickets will be issued as soon as it clears.',
        });
      }

      const paidMajor = stripeLib.toStripeAmount(order.total, order.currency);
      if (Number(session.amountTotal || 0) + 1 < paidMajor) {
        return res.status(409).json({ ok: false, error: 'The paid amount does not match this booking' });
      }

      const outcome = await T.finalizeOrder(order.id, {
        paymentRef: session.paymentIntent || sessionId,
        paymentMethod: 'card',
        actor: order.customer_email,
      });

      return res.json({
        ok: true,
        alreadyConfirmed: outcome.alreadyFinalized,
        order: mapOrder(outcome.order, outcome.tickets),
      });
    }

    // ── Public: read a booking by its reference ──
    if (action === 'order') {
      const order = await loadOrderByRef(body.ref || body.bookingRef || '');
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });
      const tickets = order.status === 'confirmed' ? await loadTickets(order.id) : [];
      const attractionRes = await query(
        `SELECT id, name, city, country, featured_image, gallery, description FROM bc_attraction_profiles WHERE id = $1`,
        [order.attraction_id]
      );
      const attraction = attractionRes.rows[0] || null;
      return res.json({
        ok: true,
        order: mapOrder(order, tickets),
        attraction: attraction ? {
          id: attraction.id,
          name: attraction.name,
          city: attraction.city,
          country: attraction.country,
          image: attraction.featured_image
            || (Array.isArray(attraction.gallery) ? attraction.gallery[0]?.url : '')
            || '',
          description: attraction.description,
        } : null,
        settings: await T.getSettings(order.attraction_id),
      });
    }

    // The remaining actions belong to a signed-in customer.
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'Please sign in' });
    const email = String(auth.email || '').toLowerCase();

    // ── Customer: my passes ──
    if (action === 'mine') {
      await T.releaseExpiredHolds(10);
      const ordersRes = await query(
        `SELECT * FROM bc_ticket_orders
          WHERE LOWER(customer_email) = $1
            AND status IN ('confirmed', 'pending_payment', 'cancelled', 'refunded', 'partially_refunded')
          ORDER BY visit_date DESC, id DESC
          LIMIT 200`,
        [email]
      );
      const ids = ordersRes.rows.map((row) => row.id);
      let ticketsByOrder = new Map();
      if (ids.length) {
        const ticketsRes = await query(
          `SELECT * FROM bc_attraction_tickets WHERE order_id = ANY($1::int[]) ORDER BY id ASC`,
          [ids]
        );
        for (const ticket of ticketsRes.rows) {
          const list = ticketsByOrder.get(ticket.order_id) || [];
          list.push(ticket);
          ticketsByOrder.set(ticket.order_id, list);
        }
      }
      const today = T.isoToday();
      const passes = ordersRes.rows.map((order) => {
        const mapped = mapOrder(order, ticketsByOrder.get(order.id) || []);
        return {
          ...mapped,
          upcoming: mapped.visitDate >= today && mapped.status === 'confirmed',
          canCancel: mapped.status === 'confirmed' && mapped.visitDate >= today,
        };
      });
      return res.json({
        ok: true,
        passes,
        upcoming: passes.filter((entry) => entry.upcoming),
        past: passes.filter((entry) => !entry.upcoming),
      });
    }

    // ── Customer: resend my confirmation ──
    if (action === 'resend') {
      const order = await loadOrderByRef(body.ref || body.bookingRef || '');
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });
      if (String(order.customer_email).toLowerCase() !== email) {
        return res.status(403).json({ ok: false, error: 'This booking is not on your account' });
      }
      if (order.status !== 'confirmed') {
        return res.status(409).json({ ok: false, error: 'Only confirmed bookings can be re-sent' });
      }
      const tickets = await loadTickets(order.id);
      const url = `/attraction-tickets/confirmation?ref=${encodeURIComponent(order.booking_ref)}`;
      Promise.resolve()
        .then(() => notificationHub.dispatch({
          recipientId: order.customer_email,
          recipientEmail: order.customer_email,
          recipientRole: 'traveler',
          type: 'TICKET_ISSUED',
          title: 'Your attraction tickets',
          message: `${order.quantity_total} ticket(s) for ${order.attraction_name} on ${T.isoDate(order.visit_date)}.`,
          actionUrl: url,
          metadata: {
            bookingRef: order.booking_ref,
            attractionName: order.attraction_name,
            visitDate: T.isoDate(order.visit_date),
            totalAmount: Number(order.total).toFixed(2),
            currency: order.currency,
            quantity: Number(order.quantity_total),
            tickets: tickets.map((ticket) => ({
              ticketNo: ticket.ticket_no, type: ticket.ticket_type_name, admissions: ticket.admissions_total,
            })),
            title: 'Booking confirmed',
            message: `Your tickets for ${order.attraction_name} are ready.`,
            actionUrl: url,
          },
        }))
        .catch((error) => console.warn('[attraction-ticket-checkout] resend failed:', error.message));
      return res.json({ ok: true, message: 'Confirmation sent' });
    }

    // ── Customer: cancel per policy ──
    if (action === 'request-cancel') {
      const order = await loadOrderByRef(body.ref || body.bookingRef || '');
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });
      if (String(order.customer_email).toLowerCase() !== email) {
        return res.status(403).json({ ok: false, error: 'This booking is not on your account' });
      }
      if (order.status !== 'confirmed' || order.payment_status !== 'paid') {
        return res.status(409).json({ ok: false, error: `This booking is ${order.status}` });
      }
      if (T.isoDate(order.visit_date) < T.isoToday()) {
        return res.status(409).json({ ok: false, error: 'This visit has already taken place' });
      }

      const itemsRes = await query(`SELECT * FROM bc_ticket_order_items WHERE order_id = $1`, [order.id]);
      const policy = await T.quoteRefund(order, itemsRes.rows);
      const fullyRefundable = policy.refundAmount >= T.round2(Number(order.total) - Number(order.refund_amount || 0));

      if (!fullyRefundable) {
        // Inside the cancellation window: record a request for the owner to decide.
        await query(
          `UPDATE bc_ticket_orders
              SET refund_requested_at = NOW(),
                  notes = $2,
                  updated_at = NOW()
            WHERE id = $1`,
          [order.id, T.text(body.reason, 400) || order.notes]
        );
        await T.writeTicketAudit({
          attractionId: order.attraction_id, actor: email, action: 'order.cancel-requested',
          entityType: 'order', entityId: order.id, details: { quote: policy.lines },
        });
        if (order.owner_email) {
          Promise.resolve()
            .then(() => notificationHub.dispatch({
              recipientId: order.owner_email,
              recipientEmail: order.owner_email,
              recipientRole: 'attraction_owner',
              type: 'TICKET_CANCEL_REQUEST',
              title: 'Cancellation requested',
              message: `${order.customer_name} asked to cancel ${order.booking_ref} for ${T.isoDate(order.visit_date)}.`,
              actionUrl: '/attraction-dashboard/ticketing?section=sales',
              metadata: { bookingRef: order.booking_ref },
            }))
            .catch(() => {});
        }
        return res.json({
          ok: true,
          requested: true,
          refundQuote: policy,
          message: 'Your cancellation request was sent to the attraction. They will confirm the refund.',
        });
      }

      const outcome = await T.cancelOrder({
        order,
        amount: policy.refundAmount,
        reason: T.text(body.reason, 400) || 'Cancelled by customer',
        actor: email,
      });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({
        ok: true,
        cancelled: true,
        status: outcome.status,
        refundAmount: outcome.refundAmount,
        message: `Booking cancelled. ${order.currency} ${outcome.refundAmount.toFixed(2)} will be refunded within a few business days.`,
      });
    }

    return res.status(400).json({ ok: false, error: 'Unknown checkout action' });
  } catch (error) {
    console.error('[attraction-ticket-checkout]', error);
    const status = error.status || 500;
    return res.status(status).json({ ok: false, error: error.message || 'Checkout request failed' });
  }
};
