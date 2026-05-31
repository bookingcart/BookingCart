'use strict';

const test = require('node:test');
const assert = require('node:assert');
const bookingsHandler = require('../api-routes/bookings');

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
    }
  };
}

test('public booking save rejects privileged fields', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDb = process.env.DATABASE_URL;
  process.env.NODE_ENV = 'test';
  delete process.env.DATABASE_URL;
  global.__bookings = [];

  const req = {
    method: 'POST',
    headers: {},
    body: {
      action: 'save',
      booking: {
        ref: 'BC-SEC-1',
        route: 'EBB -> LHR',
        contact: { email: 'guest@example.com' },
        status: 'issued'
      }
    }
  };
  const res = makeRes();

  await bookingsHandler(req, res);

  assert.strictEqual(res.statusCode, 403);
  assert.match(res.body.error, /privileged fields/);
  assert.deepStrictEqual(global.__bookings, []);

  process.env.NODE_ENV = prevNodeEnv;
  if (prevDb === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = prevDb;
});

test('public booking save persists only customer-safe fields', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDb = process.env.DATABASE_URL;
  process.env.NODE_ENV = 'test';
  delete process.env.DATABASE_URL;
  global.__bookings = [];

  const req = {
    method: 'POST',
    headers: {},
    body: {
      action: 'save',
      booking: {
        ref: 'BC-SEC-2',
        route: 'EBB -> LHR',
        dates: '2026-08-01',
        contact: { email: 'guest@example.com' },
        passengers: [{ firstName: 'Ada', lastName: 'Lovelace' }],
        extras: { bags: 1 },
        total: 1200
      }
    }
  };
  const res = makeRes();

  await bookingsHandler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(global.__bookings.length, 1);
  assert.strictEqual(global.__bookings[0].status, 'new');
  assert.strictEqual(global.__bookings[0].ticket, undefined);
  assert.strictEqual(global.__bookings[0].payment, undefined);

  process.env.NODE_ENV = prevNodeEnv;
  if (prevDb === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = prevDb;
});
