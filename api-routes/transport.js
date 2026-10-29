// api-routes/transport.js
// Transport ticketing API — bus, boat/ferry and train.
//
//   Public    — stations, journey search, live seat map, seat hold, booking and
//               a read-only booking lookup.
//   Boarding  — validate and admit a ticket from the scanner or the counter.
//
// Every fare is recomputed by lib/transport from the database, so a tampered
// request can never buy a first-class berth at the standard price.

const { isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const notificationHub = require('../lib/notification-hub');
const T = require('../lib/ticketing');
const Tr = require('../lib/transport');

/** Ticket email is best-effort: a mail outage must never fail the sale. */
async function sendTicketEmail(order) {
  if (!order?.customerEmail) return;
  try {
    await notificationHub.dispatch({
      recipientId: order.customerEmail,
      recipientEmail: order.customerEmail,
      recipientPhone: order.customerPhone || '',
      type: 'PAYMENT_COMPLETED',
      title: `Your ${order.transportLabel} tickets — ${order.routeName || 'trip'}`,
      message: `Booking ${order.bookingRef} · ${order.travelDate} ${order.departTime} · `
        + `${order.seatLabels.length ? `seats ${order.seatLabels.join(', ')}` : `${order.passengerCount} passenger(s)`}. `
        + 'Show the QR code when boarding.',
      actionUrl: `/transport/confirmation?ref=${encodeURIComponent(order.bookingRef)}`,
      metadata: {
        bookingRef: order.bookingRef,
        route: order.routeName,
        date: order.travelDate,
        time: order.departTime,
        seats: order.seatLabels.join(', '),
        total: order.total,
        currency: order.currency,
      },
    });
  } catch (error) {
    console.warn('[transport] ticket email failed:', error.message);
  }
}

module.exports = async function transportHandler(req, res) {
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
    console.warn('[transport] DB unavailable:', error.message);
  }
  if (!dbReady) {
    return res.status(503).json({ ok: false, error: 'Transport ticketing requires the database. Run the migrations first.' });
  }

  const body = req.method === 'GET' ? req.query : (req.body || {});
  const action = String(body.action || req.query.action || '').toLowerCase();

  try {
    // ─── Public ──────────────────────────────────────────────────────────────

    if (action === 'locations' || action === 'stations') {
      const locations = await Tr.listLocations({
        type: body.type || body.transportType || '',
        term: body.term || body.search || '',
        limit: body.limit,
      });
      return res.json({ ok: true, locations });
    }

    if (action === 'search') {
      const result = await Tr.searchJourneys({
        type: body.type || body.transportType || 'bus',
        fromId: body.fromId || body.from,
        toId: body.toId || body.to,
        date: body.date,
        passengers: body.passengers,
      });
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    if (action === 'departure' || action === 'seat-map') {
      const departureId = T.toInt(body.departureId || body.id, 0);
      if (!departureId) return res.status(400).json({ ok: false, error: 'departureId is required' });
      const map = await Tr.getSeatMap(departureId, {
        fromStop: body.fromStop || body.from,
        toStop: body.toStop || body.to,
      });
      return map.ok ? res.json(map) : res.status(map.status || 400).json({ ok: false, error: map.error });
    }

    if (action === 'hold') {
      const hold = await Tr.createHold({
        departureId: T.toInt(body.departureId, 0),
        seatIds: Array.isArray(body.seatIds) ? body.seatIds : [],
        fromStop: body.fromStop || body.from,
        toStop: body.toStop || body.to,
        passengers: body.passengers,
        fareClass: body.fareClass || body.class || '',
        customerEmail: String(body.customerEmail || '').trim().toLowerCase(),
      });
      return hold.ok
        ? res.json(hold)
        : res.status(hold.status || 400).json({ ok: false, error: hold.error, taken: hold.taken });
    }

    if (action === 'release-hold') {
      await Tr.releaseHold(body.holdRef);
      return res.json({ ok: true });
    }

    if (action === 'book') {
      const result = await Tr.createBooking({
        holdRef: body.holdRef,
        passengers: Array.isArray(body.passengers) ? body.passengers : [],
        customer: body.customer || body,
        paymentMethod: body.paymentMethod || 'counter',
      });
      if (!result.ok) return res.status(result.status || 400).json({ ok: false, error: result.error });
      await sendTicketEmail(result.order);
      return res.json(result);
    }

    if (action === 'order') {
      const result = await Tr.publicOrder(body.ref || body.bookingRef || '');
      return result.ok ? res.json(result) : res.status(result.status || 404).json({ ok: false, error: result.error });
    }

    if (action === 'cancel') {
      const result = await Tr.cancelBooking({
        ref: body.ref || body.bookingRef || '',
        email: String(body.email || '').trim().toLowerCase(),
        reason: T.text(body.reason, 300),
      });
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    // ─── Boarding ────────────────────────────────────────────────────────────

    if (action === 'validate') {
      const result = await Tr.validateTicket({ ticketNo: body.ticketNo, qrToken: body.qrToken });
      return result.ok ? res.json(result) : res.status(result.status || 404).json({ ok: false, error: result.error });
    }

    if (action === 'admit') {
      const result = await Tr.admitTicket({ ticketNo: body.ticketNo, qrToken: body.qrToken });
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error, ticket: result.ticket });
    }

    return res.status(400).json({ ok: false, error: `Unknown transport action "${action}"` });
  } catch (error) {
    console.error('[transport] handler error:', error);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
};
