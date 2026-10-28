'use strict';

/**
 * Physical ticketing / point of sale: identifier safety, the permission matrix
 * and the mappers the UI depends on. Everything that needs Postgres is covered
 * by scratch/test-pos-e2e.js instead, so this file stays offline and fast.
 */

const test = require('node:test');
const assert = require('node:assert');

const P = require('../lib/physical-ticketing');
const posHandler = require('../api-routes/attraction-pos');

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
    send(body) {
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

// ─── Identifiers ─────────────────────────────────────────────────────────────

test('generated identifiers use their prefixes and never repeat', () => {
  const seen = new Set();
  for (let index = 0; index < 3000; index += 1) {
    const value = P.newTicketNo();
    assert.match(value, /^PT-[0-9A-F]{12}$/);
    assert.strictEqual(seen.has(value), false, `duplicate ticket number ${value}`);
    seen.add(value);
  }
  assert.strictEqual(seen.size, 3000);
});

test('batch, sale, receipt and idempotency references are well formed', () => {
  const batches = new Set();
  const sales = new Set();
  const receipts = new Set();
  const keys = new Set();

  for (let index = 0; index < 500; index += 1) {
    const batch = P.newBatchRef();
    assert.match(batch, /^BT-[0-9A-F]{10}$/);
    batches.add(batch);

    const sale = P.newSaleRef();
    assert.match(sale, /^POS-[0-9A-F]{10}$/);
    sales.add(sale);

    const receipt = P.newReceiptNo();
    assert.match(receipt, /^RCP-\d{6}-[0-9A-F]{6}$/);
    receipts.add(receipt);

    const key = P.newIdempotencyKey();
    assert.match(key, /^pos-[0-9a-f]{20}$/);
    keys.add(key);
  }

  assert.strictEqual(batches.size, 500);
  assert.strictEqual(sales.size, 500);
  assert.strictEqual(receipts.size, 500);
  assert.strictEqual(keys.size, 500);
});

// ─── Permissions ─────────────────────────────────────────────────────────────

test('owners and managers hold every ticket office permission', () => {
  for (const role of ['owner', 'manager']) {
    const permissions = P.permissionsFor({ role });
    for (const key of P.POS_PERMISSIONS) {
      assert.strictEqual(permissions[key], true, `${role} should have ${key}`);
      assert.strictEqual(P.can({ role }, key), true);
    }
  }
});

test('a cashier can sell and print but cannot refund, void or read reports', () => {
  const cashier = { role: 'scanner', staff: { permissions: {} } };
  assert.strictEqual(P.can(cashier, 'sell'), true);
  assert.strictEqual(P.can(cashier, 'print'), true);
  assert.strictEqual(P.can(cashier, 'reprint'), true);
  assert.strictEqual(P.can(cashier, 'shift'), true);
  assert.strictEqual(P.can(cashier, 'refund'), false);
  assert.strictEqual(P.can(cashier, 'void'), false);
  assert.strictEqual(P.can(cashier, 'reports'), false);
  assert.strictEqual(P.can(cashier, 'payout'), false);
  assert.strictEqual(P.can(cashier, 'viewAllSales'), false);
});

test('stored permissions override the role defaults per key only', () => {
  const access = {
    role: 'scanner',
    staff: { permissions: { refund: true, sell: false, reports: true, unknownKey: true } },
  };
  const permissions = P.permissionsFor(access);
  assert.strictEqual(permissions.refund, true);
  assert.strictEqual(permissions.sell, false);
  assert.strictEqual(permissions.reports, true);
  assert.strictEqual(permissions.print, true, 'untouched keys keep their default');
  assert.strictEqual('unknownKey' in permissions, false);
});

test('owner defaults survive a conflicting stored permission map', () => {
  const access = { role: 'owner', staff: { permissions: { sell: false } } };
  assert.strictEqual(P.can(access, 'sell'), true);
});

test('a missing access record degrades to the cashier floor, not to admin', () => {
  for (const access of [undefined, null, {}, { role: 'nobody' }]) {
    assert.strictEqual(P.can(access, 'sell'), true);
    assert.strictEqual(P.can(access, 'refund'), false);
    assert.strictEqual(P.can(access, 'viewAllSales'), false);
  }
});

test('normalizePermissions keeps only known boolean keys', () => {
  assert.deepStrictEqual(P.normalizePermissions(['sell', 'reports']), { sell: true, reports: true });
  assert.deepStrictEqual(
    P.normalizePermissions({ sell: true, refund: 'yes', void: false, nope: true }),
    { sell: true, void: false }
  );
  assert.deepStrictEqual(P.normalizePermissions(null), {});
  assert.deepStrictEqual(P.normalizePermissions('sell'), {});
});

// ─── Batch mapper ────────────────────────────────────────────────────────────

test('mapBatch converts dates, numbers and marks stale printed stock', () => {
  const today = '2026-10-28';
  const batch = P.mapBatch({
    id: 4,
    batch_ref: 'BT-0000000001',
    attraction_id: 9,
    name: 'Gate 1',
    ticket_type_id: 3,
    ticket_type_name: 'Adult',
    slot_id: '2',
    visit_date: new Date('2026-10-20T00:00:00'),
    quantity: '100',
    generated: '100',
    printed: '80',
    sold: '65',
    used: '40',
    available: '30',
    voided: '5',
    expired: '0',
    unit_price: '12.50',
    admissions: '1',
    status: 'open',
    created_by: 'owner@example.com',
  }, today);

  assert.strictEqual(batch.visitDate, '2026-10-20');
  assert.strictEqual(batch.slotId, 2);
  assert.strictEqual(batch.quantity, 100);
  assert.strictEqual(batch.generated, 100);
  assert.strictEqual(batch.printed, 80);
  assert.strictEqual(batch.sold, 65);
  assert.strictEqual(batch.used, 40);
  assert.strictEqual(batch.unsold, 30);
  assert.strictEqual(batch.voided, 5);
  assert.strictEqual(batch.unitPrice, 12.5);
  assert.strictEqual(batch.stale, true, 'past visit date with unsold stock is stale');

  const fresh = P.mapBatch({ ...{ visit_date: '2026-11-02', available: 10, quantity: 10 }, id: 5 }, today);
  assert.strictEqual(fresh.stale, false);
  assert.strictEqual(P.mapBatch(null), null);
});

// ─── Shift mapper ────────────────────────────────────────────────────────────

test('mapShift coerces every money column to a number', () => {
  const shift = P.mapShift({
    id: 1,
    attraction_id: 2,
    cashier_email: 'desk@example.com',
    cashier_name: 'Desk',
    currency: 'UGX',
    opening_cash: '50000.00',
    counted_cash: '51200.50',
    expected_cash: '51200.50',
    cash_sales: '3200',
    mobile_sales: '1500',
    card_sales: '0',
    other_sales: '0',
    refunds: '0',
    payouts: '0',
    difference: '0.00',
    status: 'closed',
  });

  for (const key of ['openingCash', 'countedCash', 'expectedCash', 'cashSales', 'mobileSales', 'cardSales', 'otherSales', 'refunds', 'payouts', 'difference']) {
    assert.strictEqual(typeof shift[key], 'number', `${key} should be numeric`);
    assert.strictEqual(Number.isNaN(shift[key]), false);
  }
  assert.strictEqual(shift.cashSales, 3200);
  assert.strictEqual(shift.countedCash, 51200.5);
  assert.strictEqual(P.mapShift(null), null);
});

// ─── Constants ───────────────────────────────────────────────────────────────

test('payment methods, print layouts and limits match the POS contract', () => {
  assert.deepStrictEqual(P.PAYMENT_METHODS, ['cash', 'mobile_money', 'card', 'other', 'complimentary']);
  assert.deepStrictEqual(P.PRINT_LAYOUTS, ['a4_4', 'a4_8', 'a4_1', 'thermal']);
  assert.ok(P.MAX_BATCH_QUANTITY > 0 && P.MAX_BATCH_QUANTITY <= 1000);
  assert.ok(P.MAX_POS_TICKETS > 0 && P.MAX_POS_TICKETS <= P.MAX_BATCH_QUANTITY);
  assert.deepStrictEqual(P.BATCH_STATUSES, ['open', 'closed', 'archived']);
});

// ─── Route contract ──────────────────────────────────────────────────────────

test('the ticket office endpoint answers 503 until the database is configured', () =>
  withoutDatabase(async () => {
    for (const req of [
      makeReq('GET', { action: 'context', attractionId: 1 }),
      makeReq('POST', { action: 'pos-sale', attractionId: 1 }),
      makeReq('GET', { action: 'reports', attractionId: 1 }),
    ]) {
      const res = makeRes();
      await posHandler(req, res);
      assert.strictEqual(res.statusCode, 503);
      assert.strictEqual(res.body.ok, false);
      assert.match(res.body.error, /requires the database/);
    }
  }));

test('the ticket office endpoint answers CORS preflight without a database', () =>
  withoutDatabase(async () => {
    const res = makeRes();
    await posHandler(makeReq('OPTIONS'), res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['Access-Control-Allow-Origin'] || res.headers['access-control-allow-origin']);
  }));
