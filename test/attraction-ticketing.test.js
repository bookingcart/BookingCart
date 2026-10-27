'use strict';

const test = require('node:test');
const assert = require('node:assert');

const T = require('../lib/ticketing');
const { toStripeAmount } = require('../lib/stripe');
const managerHandler = require('../api-routes/attraction-ticketing');
const salesHandler = require('../api-routes/attraction-ticket-sales');
const checkoutHandler = require('../api-routes/attraction-ticket-checkout');

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end(body) {
      this.body = body || '';
      return this;
    },
  };
}

function makeReq(method, body = {}) {
  return { method, headers: {}, query: body, body };
}

async function withoutDatabase(fn) {
  const prevDb = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    return await fn();
  } finally {
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
  }
}

test('signed ticket token round-trips and rounded signatures are rejected', () => {
  const token = T.signTicketToken('AT-ABC123');
  assert.match(token, /^bct1\.AT-ABC123\.[\w-]+$/);

  const parsed = T.parseTicketInput(token);
  assert.deepStrictEqual(parsed, { ticketNo: 'AT-ABC123', signatureOk: true });

  const tampered = T.parseTicketInput(token.replace('AT-ABC123', 'AT-ABC124'));
  assert.strictEqual(tampered.ticketNo, 'AT-ABC124');
  assert.strictEqual(tampered.signatureOk, false);

  const shortened = T.parseTicketInput(`bct1.AT-ABC123.${token.split('.')[2].slice(0, 8)}`);
  assert.strictEqual(shortened.signatureOk, false);
});

test('parseTicketInput normalises plain numbers and prefixed payloads', () => {
  assert.deepStrictEqual(T.parseTicketInput('  at-9f3c  '), { ticketNo: 'AT-9F3C', signatureOk: false });
  assert.deepStrictEqual(T.parseTicketInput(''), { ticketNo: '', signatureOk: false });

  const token = T.signTicketToken('AT-77AA');
  const prefixed = T.parseTicketInput(`BCAT:${token}`);
  assert.strictEqual(prefixed.ticketNo, 'AT-77AA');
  assert.strictEqual(prefixed.signatureOk, true);
});

test('normalizeTicketType accepts a complete ticket type payload', () => {
  const result = T.normalizeTicketType({
    name: 'Adult Ticket',
    price: '25.005',
    currency: 'ugx',
    category: 'Adult',
    admissions: 1,
    dailyCapacity: 200,
    capacityTotal: 5000,
    minPerOrder: 2,
    maxPerOrder: 999,
    minAge: 12,
    maxAge: 99,
    salesStart: '2026-01-01',
    salesEnd: '2026-12-31',
    refundPolicy: 'flexible',
    status: 'inactive',
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.name, 'Adult Ticket');
  assert.strictEqual(result.value.price, 25.01);
  assert.strictEqual(result.value.currency, 'UGX');
  assert.strictEqual(result.value.category, 'adult');
  // Per-order ceilings are clamped so a typo can never lift the global limit.
  assert.strictEqual(result.value.maxPerOrder, T.MAX_ORDER_TICKETS);
  assert.strictEqual(result.value.refundPolicy, 'flexible');
  assert.strictEqual(result.value.status, 'inactive');
});

test('normalizeTicketType rejects invalid prices, ages, dates and quantities', () => {
  const cases = [
    [{ name: '', price: 10 }, /Ticket name is required/],
    [{ name: 'Child', price: -1 }, /Price must be zero or more/],
    [{ name: 'Child', price: 5, admissions: 0 }, /Admissions per ticket/],
    [{ name: 'Child', price: 5, dailyCapacity: -5 }, /Daily capacity cannot be negative/],
    [{ name: 'Child', price: 5, minAge: 18, maxAge: 12 }, /Minimum age cannot exceed/],
    [{ name: 'Child', price: 5, minAge: 200 }, /Minimum age must be between/],
    [{ name: 'Child', price: 5, salesEnd: '31-12-2026' }, /salesEnd must be a valid date/],
    [{ name: 'Child', price: 5, salesStart: '2026-06-01', salesEnd: '2026-05-01' }, /Sale end date must be after/],
    [{ name: 'Child', price: 5, validFrom: '2026-06-01', validTo: '2026-05-01' }, /Validity end date must be after/],
  ];

  for (const [input, expected] of cases) {
    const result = T.normalizeTicketType(input);
    assert.strictEqual(result.ok, false, `expected rejection for ${JSON.stringify(input)}`);
    assert.match(result.error, expected);
  }
});

test('roleAllows enforces the scanner < manager < owner hierarchy', () => {
  assert.strictEqual(T.roleAllows('scanner', 'scanner'), true);
  assert.strictEqual(T.roleAllows('scanner', 'manager'), false);
  assert.strictEqual(T.roleAllows('scanner', 'owner'), false);
  assert.strictEqual(T.roleAllows('manager', 'scanner'), true);
  assert.strictEqual(T.roleAllows('manager', 'manager'), true);
  assert.strictEqual(T.roleAllows('manager', 'owner'), false);
  assert.strictEqual(T.roleAllows('owner', 'manager'), true);
  assert.strictEqual(T.roleAllows('', 'scanner'), false);
  assert.strictEqual(T.roleAllows(undefined, 'scanner'), false);
});

test('calendar helpers prefer the type-specific row over the attraction default', () => {
  const rows = [
    { ticket_type_id: 0, visit_date: '2026-05-01', price: 30, capacity: 100, closed: false, kind: 'capacity' },
    { ticket_type_id: 7, visit_date: '2026-05-01', price: 45.5, capacity: 20, closed: false, kind: 'price' },
  ];
  const specific = T.calendarFor(rows, 7, '2026-05-01');
  assert.strictEqual(T.resolvePrice({ price: 20 }, specific), 45.5);
  assert.strictEqual(T.resolveDailyCapacity({ dailyCapacity: 200 }, specific), 20);
  assert.strictEqual(T.isClosedOn(specific), false);

  const fallback = T.calendarFor(rows, 99, '2026-05-01');
  assert.strictEqual(T.resolvePrice({ price: 20 }, fallback), 30);
  assert.strictEqual(T.resolveDailyCapacity({ dailyCapacity: 200 }, fallback), 100);

  assert.strictEqual(T.resolvePrice({ price: 20 }, null), 20);
  assert.strictEqual(T.resolveDailyCapacity({ dailyCapacity: 200 }, null), 200);
  assert.strictEqual(T.isClosedOn({ kind: 'blackout' }), true);
  assert.strictEqual(T.isClosedOn(null), false);
});

test('isoDate normalises pg DATE values without timezone drift', () => {
  // node-postgres parses a DATE column into a local-midnight Date object.
  const localMidnight = new Date(2026, 5, 1);
  assert.strictEqual(String(localMidnight).slice(0, 10), 'Mon Jun 01');
  assert.strictEqual(T.isoDate(localMidnight), '2026-06-01');
  assert.strictEqual(T.isoDate('2026-06-01T00:00:00.000Z'), '2026-06-01');
  assert.strictEqual(T.isoDate('2026-06-01'), '2026-06-01');
  assert.strictEqual(T.isoDate(''), '');
  assert.strictEqual(T.isoDate(null), '');
  assert.strictEqual(T.isoDate('not a date'), '');
});

test('publicTicket derives remaining admissions and hides contact details', () => {
  const ticket = T.publicTicket({
    id: 4,
    ticket_no: 'AT-1234',
    qr_token: 'bct1.AT-1234.sig',
    ticket_type_name: 'Family Package',
    visit_date: new Date(2026, 5, 1),
    slot_label: '10:00 – 12:00',
    admissions_total: 4,
    admissions_used: 3,
    status: 'valid',
    holder_name: 'Ada Lovelace',
    holder_email: 'ada@example.com',
    booking_ref: 'ATC-9999',
    attraction_id: 12,
  });

  assert.strictEqual(ticket.visitDate, '2026-06-01');
  assert.strictEqual(ticket.admissionsRemaining, 1);
  assert.strictEqual(ticket.holderEmail, undefined);
  assert.strictEqual(ticket.bookingRef, 'ATC-9999');
});

test('computeQuote rejects impossible dates before touching the database', () =>
  withoutDatabase(async () => {
    const bad = await T.computeQuote({ attractionId: 1, visitDate: 'tomorrow', items: [] });
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(bad.status, 400);
    assert.match(bad.error, /valid visit date/);

    const past = await T.computeQuote({ attractionId: 1, visitDate: '2000-01-01', items: [] });
    assert.strictEqual(past.ok, false);
    assert.strictEqual(past.status, 400);
    assert.match(past.error, /cannot be in the past/);
  }));

test('ticketing endpoints answer 503 until the database is configured', () =>
  withoutDatabase(async () => {
    for (const [handler, req] of [
      [managerHandler, makeReq('GET', { action: 'overview' })],
      [salesHandler, makeReq('GET', { action: 'sales' })],
      [checkoutHandler, makeReq('GET', { action: 'availability' })],
    ]) {
      const res = makeRes();
      await handler(req, res);
      assert.strictEqual(res.statusCode, 503);
      assert.strictEqual(res.body.ok, false);
      assert.match(res.body.error, /requires the database/);
    }
  }));

test('ticketing endpoints answer CORS preflight without a database', () =>
  withoutDatabase(async () => {
    const res = makeRes();
    await checkoutHandler(makeReq('OPTIONS'), res);
    assert.strictEqual(res.statusCode, 200);
  }));

test('Stripe amount conversion honours zero-decimal currencies', () => {
  assert.strictEqual(toStripeAmount(25.5, 'usd'), 2550);
  assert.strictEqual(toStripeAmount('19.999', 'EUR'), 2000);
  assert.strictEqual(toStripeAmount(1500, 'UGX'), 1500);
  assert.strictEqual(toStripeAmount(300, 'jpy'), 300);
  assert.strictEqual(toStripeAmount('nope', 'USD'), 0);
});
