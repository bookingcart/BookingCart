#!/usr/bin/env node
// Exercise the transport operator console against the live database:
// search -> seat map -> hold -> book -> validate -> POS sale -> refund.
//
//   node scratch/test-transport-ops.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { query, initDb } = require('../lib/db');
const T = require('../lib/ticketing');
const Tr = require('../lib/transport');
const Ops = require('../lib/transport-ops');

function log(step, value) {
  console.log(`\n=== ${step} ===`);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2).slice(0, 900));
}

async function main() {
  await initDb();

  const operator = (await query(`SELECT * FROM bc_transport_operators ORDER BY id ASC LIMIT 1`)).rows[0];
  if (!operator) throw new Error('No operator — run scripts/seed-transport.cjs first');
  log('operator', { id: operator.id, name: operator.name, status: operator.status });

  const route = (await query(`SELECT * FROM bc_transport_routes WHERE operator_id = $1 ORDER BY id ASC LIMIT 1`, [operator.id])).rows[0];
  const dep = (await query(
    `SELECT * FROM bc_transport_departures WHERE operator_id = $1 AND travel_date >= CURRENT_DATE AND status = 'scheduled' ORDER BY travel_date, depart_time LIMIT 1`,
    [operator.id]
  )).rows[0];
  log('departure', dep && { id: dep.id, date: dep.travel_date, time: dep.depart_time, route: route.name });

  // ── Operator console reads ──
  const access = await Ops.requireOperator(operator.owner_email, operator.id, 'manage');
  log('access', { ok: access.ok, role: access.role });

  const overview = await Ops.operatorOverview(operator.id);
  log('overview stats', overview.stats);

  const routes = await Ops.listRoutes(operator.id);
  log('routes', routes.map((r) => `${r.code} ${r.name} (${r.stops} stops)`));

  const vehicles = await Ops.listVehicles(operator.id);
  log('vehicles', vehicles.map((v) => `${v.name} · ${v.seating} · ${v.seatCount || v.capacity}`));

  const seatMap = await Tr.getSeatMap(dep.id);
  log('seat map', {
    seating: seatMap.departure.seating,
    seats: seatMap.seats.length,
    available: seatMap.seats.filter((s) => s.status === 'available').length,
    classes: seatMap.classes,
  });

  const free = seatMap.seats.filter((s) => s.status === 'available').slice(0, 2).map((s) => s.id);

  // ── Online booking ──
  const hold = await Tr.createHold({
    departureId: dep.id,
    seatIds: free.slice(0, 1),
    passengers: 1,
    fareClass: seatMap.classes[0].code,
    customerEmail: 'smoke.customer@example.com',
  });
  log('hold', hold.ok ? hold.hold : hold);
  if (!hold.ok) throw new Error(hold.error);

  const booked = await Tr.createBooking({
    holdRef: hold.hold.holdRef,
    passengers: [{ name: 'Smoke Customer' }],
    customer: { name: 'Smoke Customer', email: 'smoke.customer@example.com', phone: '+256700000001' },
    paymentMethod: 'counter',
  });
  log('booking', booked.ok && { ref: booked.order.bookingRef, total: booked.order.total, seats: booked.order.seatLabels, tickets: booked.order.tickets.length });
  if (!booked.ok) throw new Error(booked.error);

  const validation = await Tr.validateTicket({ ticketNo: booked.order.tickets[0].ticketNo });
  log('validate', { state: validation.state, passenger: validation.ticket.passengerName });

  // ── Counter sale ──
  const posHoldSeats = seatMap.seats.filter((s) => s.status === 'available').slice(1, 2).map((s) => s.id);
  const pos = await Ops.posSell(operator.id, { email: operator.owner_email, role: 'owner', name: 'Counter Staff' }, {
    departureId: dep.id,
    seatIds: posHoldSeats,
    passengers: [{ name: 'Counter Passenger' }],
    customer: { name: 'Counter Passenger', email: 'smoke.counter@example.com' },
    paymentMethod: 'cash',
  });
  log('pos sale', pos.ok ? { ref: pos.order.bookingRef, channel: pos.order.channel, paid: pos.order.paymentStatus } : pos);

  // ── Reports and refunds ──
  const report = await Ops.operatorReport(operator.id, { from: T.isoToday(), to: T.addDaysISO(T.isoToday(), 2) });
  log('report summary', report.summary);

  const refund = await Ops.refundBooking(operator.id, operator.owner_email, 'owner', {
    ref: booked.order.bookingRef,
    reason: 'Smoke test refund',
  });
  log('refund', { ok: refund.ok, refundAmount: refund.refundAmount, status: refund.order?.status });

  const freed = await Tr.getSeatMap(dep.id);
  log('inventory after refund', {
    available: freed.seats.filter((s) => s.status === 'available').length,
  });

  const admin = await Ops.adminOverview();
  log('admin stats', admin.stats);
  const adminReport = await Ops.adminReport({ from: T.isoToday(), to: T.addDaysISO(T.isoToday(), 2) });
  log('admin totals', adminReport.totals);

  await query(`DELETE FROM bc_transport_pos_sales WHERE booking_id IN (SELECT id FROM bc_transport_bookings WHERE customer_email LIKE 'smoke.%')`);
  await query(`DELETE FROM bc_transport_passengers WHERE booking_id IN (SELECT id FROM bc_transport_bookings WHERE customer_email LIKE 'smoke.%')`);
  await query(`DELETE FROM bc_transport_seat_states WHERE booking_id IN (SELECT id FROM bc_transport_bookings WHERE customer_email LIKE 'smoke.%')`);
  await query(`DELETE FROM bc_transport_bookings WHERE customer_email LIKE 'smoke.%'`);
  console.log('\nSmoke rows cleaned up.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nSMOKE FAILED:', error);
    process.exit(1);
  });
