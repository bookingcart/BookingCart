'use strict';

/**
 * Transport (bus / boat / train) contracts that must hold without a database:
 * fare maths, segment-aware seat clashes, refund windows, capability roles and
 * the operator-scoped boarding rules. The live flow is exercised separately by
 * scratch/test-transport-ops.js against a real database.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Tr = require('../lib/transport');
const Ops = require('../lib/transport-ops');
const transportHandler = require('../api-routes/transport');

const ROOT = process.cwd();

function read(...segments) {
  return fs.readFileSync(path.join(ROOT, ...segments), 'utf8');
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(body) { this.body = body || ''; return this; },
    send(body) { this.body = body; return this; },
  };
}

test('fares prorate to the segment actually travelled', () => {
  assert.equal(Tr.segmentFare(60000, 120, 0, 60, 1), 30000);
  assert.equal(Tr.segmentFare(60000, 120, 0, 60, 1.5), 45000);
  assert.equal(Tr.segmentFare(60000, 120, 60, 60, 1), 0);
  // A bad request can never pay less than nothing or more than the full fare.
  assert.equal(Tr.segmentFare(60000, 120, 0, 9999, 1), 60000);
  assert.equal(Tr.segmentFare(60000, 120, 90, 30, 1), 0);
  assert.equal(Tr.segmentFare(0, 120, 0, 60, 1), 0);
});

test('seat states only clash when the segments overlap', () => {
  assert.equal(Tr.overlaps(0, 60, 30, 90), true);
  assert.equal(Tr.overlaps(0, 120, 0, 120), true);
  // Sharing a station is not a clash: one passenger alights as the next boards.
  assert.equal(Tr.overlaps(0, 60, 60, 90), false);
  assert.equal(Tr.overlaps(60, 90, 0, 60), false);
});

test('seat keys, references and clock helpers stay predictable', () => {
  assert.equal(Tr.seatKey('b', 4), 'B4');
  assert.match(Tr.newRef('TR'), /^TR-[0-9A-F]{10}$/);
  assert.notEqual(Tr.newRef('TR'), Tr.newRef('TR'));

  assert.equal(Tr.isHHMM('23:59'), true);
  assert.equal(Tr.isHHMM('24:00'), false);
  assert.equal(Tr.isHHMM('7:30'), false);
  assert.equal(Tr.addMinutesHHMM('23:30', 45), '00:15');
  assert.equal(Tr.addMinutesHHMM('08:00', -90), '06:30');
  assert.equal(Tr.addMinutesHHMM('not a time', 10), 'not a time');
});

test('transport types decide the kind of stop a journey boards at', () => {
  assert.equal(Tr.typeOf('TRAIN'), 'train');
  assert.equal(Tr.typeOf('boat'), 'boat');
  assert.equal(Tr.typeOf('spaceship'), 'bus');
  assert.equal(Tr.isType('boat'), true);
  assert.equal(Tr.isType('spaceship'), false);
  assert.deepEqual(Tr.TYPE_STOP_KIND, { bus: 'terminal', boat: 'port', train: 'station' });
});

test('fare classes fall back to standard instead of crashing', () => {
  assert.deepEqual(Tr.classList([]), [{ code: 'standard', name: 'Standard', multiplier: 1 }]);
  const classes = Tr.classList([{ code: 'Business', name: 'Business', multiplier: '1.6' }, { code: '' }]);
  assert.equal(classes.length, 1);
  assert.equal(classes[0].code, 'business');
  assert.equal(classes[0].multiplier, 1.6);
  assert.equal(Tr.classList([{ code: 'vip', multiplier: -2 }])[0].multiplier, 1);
  assert.equal(Tr.resolveClass(classes, 'VIP').code, 'business');
});

test('refunds follow the operator refund window', () => {
  const far = { travelDate: '2099-01-01', departTime: '08:00', total: 100000 };
  const inside = Ops.refundQuote(far, { refundWindowHours: 24, cancellationFeePercent: 20 });
  assert.equal(inside.eligible, true);
  assert.equal(inside.feePercent, 20);
  assert.equal(inside.refundAmount, 80000);

  const past = { travelDate: '2000-01-01', departTime: '08:00', total: 100000 };
  const outside = Ops.refundQuote(past, { refundWindowHours: 24, cancellationFeePercent: 0 });
  assert.equal(outside.eligible, false);
  assert.equal(outside.feePercent, 100);
  assert.equal(outside.refundAmount, 0);

  // An unpaid / zero-value booking refunds nothing but never throws.
  const empty = Ops.refundQuote({}, {});
  assert.equal(empty.refundAmount, 0);
  assert.equal(empty.eligible, false);
});

test('hoursUntil ignores nonsense dates', () => {
  assert.equal(Ops.hoursUntil('', ''), 0);
  assert.equal(Ops.hoursUntil('not-a-date', '08:00'), 0);
  assert.equal(Ops.hoursUntil('2099-01-01', '99:99'), 0);
  assert.ok(Ops.hoursUntil('2099-01-01', '08:00') > 0);
});

test('roles are capability sets, not a hierarchy', () => {
  assert.ok(Ops.roleAllows('owner', 'settings'));
  assert.ok(Ops.roleAllows('manager', 'staff'));
  assert.equal(Ops.roleAllows('manager', 'settings'), false);
  assert.ok(Ops.roleAllows('ticketing', 'sell'));
  assert.ok(Ops.roleAllows('ticketing', 'refund'));
  assert.equal(Ops.roleAllows('ticketing', 'manage'), false);
  assert.ok(Ops.roleAllows('boarding', 'board'));
  assert.equal(Ops.roleAllows('boarding', 'sell'), false);
  assert.ok(Ops.roleAllows('agent', 'sell'));
  assert.equal(Ops.roleAllows('agent', 'read'), true);
  assert.equal(Ops.roleAllows('stranger', 'read'), false);
});

test('operator settings merge stored values over the defaults', () => {
  const defaults = Ops.settingsOf({});
  assert.equal(defaults.serviceFeePercent, 0);
  assert.equal(defaults.refundWindowHours, 24);
  assert.equal(defaults.allowOnline, true);
  assert.equal(defaults.allowPayAtCounter, true);

  const stored = Ops.settingsOf({ settings: { taxPercent: '7.5', allowOnline: false, holdMinutes: 99 } });
  assert.equal(stored.taxPercent, 7.5);
  assert.equal(stored.allowOnline, false);
  assert.equal(stored.refundWindowHours, 24);

  const toggles = Ops.settingsOf({ allow_online: false, allow_pay_at_counter: false });
  assert.equal(toggles.allowOnline, false);
  assert.equal(toggles.allowPayAtCounter, false);
});

test('operator and seat rows map to the shape the console reads', () => {
  const operator = Ops.mapOperator({
    id: 7,
    name: 'Nile Coach Lines',
    slug: 'nile-coach-lines',
    owner_email: 'Owner@Example.com',
    transport_types: ['bus', 'boat'],
    commission_percent: '12.5',
    hold_minutes: 20,
    contact: { phone: '+256700000000' },
  });
  assert.equal(operator.ownerEmail, 'Owner@Example.com');
  assert.deepEqual(operator.transportTypes, ['bus', 'boat']);
  assert.equal(operator.commissionPercent, 12.5);
  assert.equal(operator.holdMinutes, 20);
  assert.equal(operator.allowOnline, true);
  assert.equal(operator.status, 'pending');

  const seat = Ops.mapSeat({ id: 3, row_label: 'B', seat_no: 4, seat_key: 'B4', category: 'vip', price_override: null });
  assert.equal(seat.seatKey, 'B4');
  assert.equal(seat.priceOverride, null);
  assert.equal(seat.kind, 'seat');
  assert.equal(seat.status, 'available');
  assert.equal(Ops.mapSeat({ price_override: '15000' }).priceOverride, 15000);
});

test('console actions carry an explicit permission each', () => {
  const source = read('api-routes', 'transport.js');
  const expectations = [
    ["'pos-sell': 'sell'"],
    ["'booking-refund': 'refund'"],
    ["'booking-settle': 'refund'"],
    ["'staff-save': 'staff'"],
    ["'settings-save': 'settings'"],
    ["'route-save': 'manage'"],
    ["'report-export': 'read'"],
  ];
  for (const [snippet] of expectations) {
    assert.ok(source.includes(snippet), `OPERATOR_ACTIONS must declare ${snippet}`);
  }

  // Every operator action is gated behind a bearer token and a permission check.
  assert.match(source, /await verifyRequestBearer\(req\)/);
  assert.match(source, /Ops\.requireOperator\(/);

  const server = read('server.js');
  assert.match(server, /app\.all\('\/api\/transport'/, '/api/transport must be mounted');
});

test('boarding a transport ticket is operator-scoped and single-use', () => {
  const validation = read('api-routes', 'ticket-validation.js');
  assert.match(validation, /findTransportTicket/);
  assert.match(validation, /bc_transport_passengers/);
  // Ticket numbers are human-typed, so they compare case-insensitively.
  assert.match(validation, /UPPER\(p\.ticket_no\)/);
  // QR tokens are secrets: a case-folded comparison would widen the guess space.
  assert.match(validation, /p\.qr_token = \$2/);
  // Staff of a suspended operator must never board tickets.
  assert.match(validation, /s\.role IN \('manager', 'boarding', 'ticketing'\)/);
  assert.match(validation, /o\.status <> 'suspended'/);
  // The admit update is conditional, so two scanners cannot both succeed.
  assert.match(validation, /WHERE id = \$1 AND status = 'valid'/);
});

test('pausing online sales hides departures but keeps the counter open', () => {
  const transport = read('lib', 'transport.js');
  // Search must not offer a departure the operator has paused.
  assert.match(transport, /AND o\.allow_online IS NOT FALSE/);
  assert.match(transport, /Online sales are paused for this operator/);
  // The counter reuses the same hold, so it has to opt out of the online block.
  assert.match(read('lib', 'transport-ops.js'), /online: false/);
});

test('counter sales share the website inventory and are audited', () => {
  const ops = read('lib', 'transport-ops.js');
  assert.match(ops, /channel = 'pos'/);
  assert.match(ops, /bc_transport_pos_sales/);
  assert.match(ops, /writeAudit\(/);
  // Optional text columns are COALESCEd because the hosted driver turns '' into NULL.
  assert.match(ops, /COALESCE\(\$\d+,\s*''\)/);
});

test('transport console migration adds the back-office tables', () => {
  const sql = read('db', 'migrations', '0013_transport_console.sql');
  for (const table of ['bc_transport_staff', 'bc_transport_audit', 'bc_transport_pos_sales']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`), `${table} must be created`);
  }
  for (const column of ['refund_amount', 'refund_status', 'sold_by_email', 'admitted_by']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`), `${column} must be added`);
  }
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i, 'migrations must stay additive');
});

test('money totals carry the currency they were priced in', () => {
  const ops = read('lib', 'transport-ops.js');
  // Routes decide the currency, so reporting picks the one the operator uses most.
  const subquery = /ORDER BY COUNT\(\*\) DESC LIMIT 1\)[^`]*AS currency/g;
  assert.ok((ops.match(subquery) || []).length >= 4, 'overview, reports and admin summaries must select a currency');
  assert.match(ops, /currency: row\.currency \|\| 'UGX'/);
  assert.match(ops, /currency: totals\.currency \|\| 'UGX'/);
  assert.match(ops, /currency: operators\[0\]\?\.currency \|\| 'UGX'/);
  // Every console money() call must pass a currency, otherwise UGX shows up as US$.
  const files = ['OperatorOverviewTab', 'OperatorReportsTab', 'OperatorPosTab', 'OperatorBookingsTab']
    .map((name) => read('src', 'components', 'transport', `${name}.jsx`));
  files.push(read('src', 'pages', 'TransportAdminPage.jsx'));
  for (const source of files) {
    const calls = source.match(/money\([^()]*\)/g) || [];
    for (const call of calls) assert.match(call, /,\s*[^,()]+\)$/, `unlabelled money call: ${call}`);
  }
});

test('arrival is measured to the alighting stop, not the terminus', () => {
  // A partial segment arrives before the vehicle reaches the end of the line.
  assert.deepEqual(Tr.segmentArrival('07:00', 45), { time: '07:45', dayOffset: 0 });
  // Overnight runs carry the extra day instead of wrapping silently.
  assert.deepEqual(Tr.segmentArrival('23:30', 120), { time: '01:30', dayOffset: 1 });
  // No stop list (minutes null) falls back to the departure's own arrival.
  assert.deepEqual(Tr.segmentArrival('07:00', null, '08:30'), { time: '08:30', dayOffset: 0 });
});

test('the boarding pass carries what the printed ticket shows', () => {
  const lib = read('lib', 'transport.js');
  // The pass prints the plate, the city pair and the segment arrival.
  assert.match(lib, /vehicleRegistration: row\.vehicle_registration/);
  assert.match(lib, /boardingCity: row\.boarding_city/);
  assert.match(lib, /dropoffCity: row\.dropoff_city/);
  assert.match(lib, /arrivalTime: arrival\.time/);
  assert.match(lib, /s\.minutes_from_origin[\s\S]*AS trip_minutes/);

  const page = read('src', 'pages', 'TransportConfirmationPage.jsx');
  assert.match(page, /TRANSPORT_PHOTOS\[order\.transportType\]/);
  assert.match(page, /ticket-print/, 'the pass must be marked for the print stylesheet');
  assert.match(page, /@media print/);
  assert.match(page, /break-inside: avoid/);
  assert.match(page, /print-color-adjust: exact/, 'the dark pass must keep its artwork on paper');
  // Site chrome is dropped so a booking never prints the navbar or the footer.
  assert.match(page, /footer\[aria-label="Site Footer"\]/);
  assert.match(page, /\.bookingcart-navbar/);
});

test('the transport API refuses to run without a database', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const res = makeRes();
  try {
    await transportHandler({ method: 'GET', headers: {}, query: { action: 'locations' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.ok, false);
    assert.match(res.body.error, /database/i);
  } finally {
    if (previous !== undefined) process.env.DATABASE_URL = previous;
  }
});

test('preflight is answered before any database work', async () => {
  const res = makeRes();
  await transportHandler({ method: 'OPTIONS', headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 200);
});
