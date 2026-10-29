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
const { verifyRequestBearer } = require('../lib/google-verify');
const { requireAdminEmail } = require('../lib/admin');
const notificationHub = require('../lib/notification-hub');
const T = require('../lib/ticketing');
const Tr = require('../lib/transport');
const Ops = require('../lib/transport-ops');

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

// Which permission each console action needs. Anything not listed here is not a
// console action at all, so a typo can never silently fall back to read access.
const OPERATOR_ACTIONS = {
  overview: 'read',
  routes: 'read',
  'route-save': 'manage',
  'route-status': 'manage',
  vehicles: 'read',
  'vehicle-save': 'manage',
  'vehicle-seats': 'read',
  'seat-layout-save': 'manage',
  departures: 'read',
  'departure-save': 'manage',
  'departure-cancel': 'manage',
  bookings: 'read',
  booking: 'read',
  'booking-settle': 'refund',
  'booking-refund': 'refund',
  'pos-sell': 'sell',
  report: 'read',
  'report-export': 'read',
  staff: 'staff',
  'staff-save': 'staff',
  'staff-remove': 'staff',
  settings: 'read',
  'settings-save': 'settings',
};

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

    // ─── Signed-in customer ───────────────────────────────────────────────────

    if (['my-bookings', 'my-operators', 'apply'].includes(action)) {
      const auth = await verifyRequestBearer(req);
      if (!auth.ok) return res.status(401).json({ ok: false, error: 'Sign in to continue' });
      const email = String(auth.email || '').toLowerCase();

      if (action === 'my-bookings') {
        return res.json(await Ops.myBookings(email, { limit: body.limit }));
      }
      if (action === 'my-operators') {
        return res.json({ ok: true, operators: await Ops.listOperatorsFor(email) });
      }
      const created = await Ops.applyAsOperator({
        email,
        name: body.name || body.companyName,
        transportTypes: body.transportTypes,
        description: body.description,
        contact: body.contact,
        website: body.website,
      });
      return created.ok
        ? res.json(created)
        : res.status(created.status || 400).json({ ok: false, error: created.error });
    }

    // ─── Platform administration ──────────────────────────────────────────────

    if (action.startsWith('admin-')) {
      const admin = await requireAdminEmail(req);
      if (!admin.ok) return res.status(admin.status || 403).json({ ok: false, error: admin.error });

      if (action === 'admin-overview') {
        return res.json({ ok: true, ...(await Ops.adminOverview()) });
      }
      if (action === 'admin-operators') {
        const overview = await Ops.adminOverview();
        return res.json({ ok: true, operators: overview.operators, pending: overview.pending });
      }
      if (action === 'admin-operator-status') {
        const result = await Ops.setOperatorStatus({
          operatorId: body.operatorId || body.id,
          status: body.status,
          actorEmail: admin.email,
          note: body.note,
        });
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'admin-operator-commission') {
        const result = await Ops.setOperatorCommission({
          operatorId: body.operatorId || body.id,
          percent: body.percent ?? body.commissionPercent,
          actorEmail: admin.email,
        });
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'admin-locations') {
        const locations = await Ops.adminLocations({ kind: body.kind, term: body.term, limit: body.limit });
        return res.json({ ok: true, locations });
      }
      if (action === 'admin-location-save') {
        const result = await Ops.saveLocation(admin.email, body.location || body);
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'admin-audit') {
        const entries = await Ops.adminAudit({ operatorId: body.operatorId, limit: body.limit });
        return res.json({ ok: true, entries });
      }
      if (action === 'admin-report') {
        return res.json({ ok: true, ...(await Ops.adminReport({ from: body.from, to: body.to })) });
      }
      return res.status(400).json({ ok: false, error: `Unknown admin action "${action}"` });
    }

    // ─── Operator console ─────────────────────────────────────────────────────

    if (OPERATOR_ACTIONS[action]) {
      const auth = await verifyRequestBearer(req);
      if (!auth.ok) return res.status(401).json({ ok: false, error: 'Sign in to manage your transport operator' });
      const access = await Ops.requireOperator(
        auth.email,
        body.operatorId || body.id,
        OPERATOR_ACTIONS[action]
      );
      if (!access.ok) return res.status(access.status || 403).json({ ok: false, error: access.error });
      const operatorId = access.operator.id;
      const actorEmail = String(auth.email || '').toLowerCase();

      if (action === 'overview') {
        const overview = await Ops.operatorOverview(operatorId);
        return res.json({ ok: true, ...overview, operator: access.operator, role: access.role });
      }
      if (action === 'routes') {
        return res.json({ ok: true, routes: await Ops.listRoutes(operatorId, { includeArchived: body.includeArchived === true }) });
      }
      if (action === 'route') {
        const ids = await Ops.listRoutes(operatorId, { includeArchived: true });
        const route = ids.find((entry) => entry.id === T.toInt(body.routeId, 0)) || null;
        if (!route) return res.status(404).json({ ok: false, error: 'Route not found' });
        const stops = await Ops.routeStopsFor(operatorId, route.id);
        return res.json({ ok: true, route, stops: stops.stops || [] });
      }
      if (action === 'route-save') {
        const result = await Ops.saveRoute(operatorId, actorEmail, access.role, body.route || body);
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'route-status') {
        const result = await Ops.setRouteStatus(operatorId, actorEmail, access.role, body.routeId, body.status);
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'vehicles') {
        return res.json({ ok: true, vehicles: await Ops.listVehicles(operatorId) });
      }
      if (action === 'vehicle-save') {
        const result = await Ops.saveVehicle(operatorId, actorEmail, access.role, body.vehicle || body);
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'vehicle-seats') {
        const result = await Ops.getVehicleSeats(operatorId, body.vehicleId);
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'seat-layout-save') {
        const result = await Ops.saveSeatLayout(operatorId, actorEmail, access.role, {
          vehicleId: body.vehicleId,
          seats: body.seats,
        });
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'departures') {
        return res.json({
          ok: true,
          departures: await Ops.listDepartures(operatorId, {
            from: body.from, to: body.to, routeId: body.routeId, status: body.status, limit: body.limit,
          }),
        });
      }
      if (action === 'departure-save') {
        const result = await Ops.saveDeparture(operatorId, actorEmail, access.role, body.departure || body);
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'departure-cancel') {
        const result = await Ops.cancelDeparture(operatorId, actorEmail, access.role, {
          departureId: body.departureId,
          reason: body.reason,
        });
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'bookings') {
        return res.json({
          ok: true,
          orders: await Ops.listBookings(operatorId, {
            from: body.from, to: body.to, status: body.status, channel: body.channel,
            departureId: body.departureId, search: body.search || body.term, limit: body.limit,
          }),
        });
      }
      if (action === 'booking') {
        const result = await Ops.bookingDetail(operatorId, body.ref || body.bookingRef);
        return result.ok ? res.json(result) : res.status(result.status || 404).json({ ok: false, error: result.error });
      }
      if (action === 'booking-settle') {
        const result = await Ops.settleBooking(operatorId, actorEmail, access.role, {
          ref: body.ref || body.bookingRef,
          paymentMethod: body.paymentMethod,
          paymentRef: body.paymentRef,
        });
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'booking-refund') {
        const result = await Ops.refundBooking(operatorId, actorEmail, access.role, {
          ref: body.ref || body.bookingRef,
          reason: body.reason,
        });
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'pos-sell') {
        if (access.operator.status !== 'approved') {
          return res.status(403).json({ ok: false, error: 'The platform must approve this operator before it can sell tickets' });
        }
        if (access.operator.allowPayAtCounter === false && body.paymentMethod !== 'card') {
          return res.status(403).json({ ok: false, error: 'Counter sales are disabled for this operator' });
        }
        const result = await Ops.posSell(operatorId, { email: actorEmail, role: access.role, name: body.staffName || '' }, body);
        if (!result.ok) return res.status(result.status || 400).json({ ok: false, error: result.error });
        await sendTicketEmail(result.order);
        return res.json(result);
      }
      if (action === 'report') {
        return res.json({ ok: true, ...(await Ops.operatorReport(operatorId, { from: body.from, to: body.to })) });
      }
      if (action === 'report-export') {
        const csv = await Ops.reportCsv(operatorId, { from: body.from, to: body.to });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="transport-bookings-${body.from || 'from'}-to-${body.to || 'to'}.csv"`);
        return res.status(200).send(csv);
      }
      if (action === 'staff') {
        return res.json({ ok: true, staff: await Ops.listStaff(operatorId), roles: Ops.ROLE_LABELS });
      }
      if (action === 'staff-save') {
        const result = await Ops.saveStaff(operatorId, actorEmail, access.role, body.staff || body);
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'staff-remove') {
        const result = await Ops.removeStaff(operatorId, actorEmail, access.role, body.staffId);
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
      if (action === 'settings') {
        return res.json({
          ok: true,
          operator: access.operator,
          role: access.role,
          roles: Ops.ROLE_LABELS,
          canManage: Ops.roleAllows(access.role, 'settings'),
        });
      }
      if (action === 'settings-save') {
        const result = await Ops.saveOperatorSettings(
          operatorId,
          actorEmail,
          access.role,
          body.settings || body
        );
        return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
      }
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
