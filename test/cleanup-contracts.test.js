'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const bookingsHandler = require('../api-routes/bookings');
const supportHandler = require('../api-routes/support');
const flightDealsHandler = require('../api-routes/flight-deals');
const priceAlertHandler = require('../api-routes/price-alert');
const authHandler = require('../api-routes/auth');

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

function withEnv(vars, fn) {
  const previous = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(vars)) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    });
}

test('legacy public scripts are syntactically valid', () => {
  const scripts = [
    'public/js/stays.js',
    'public/js/account-settings.js',
    'public/js/bookingcart.js',
    'public/js/deals.js',
    'public/js/my-bookings-page.js',
    'public/js/visa.js',
  ];
  for (const script of scripts) {
    execFileSync(process.execPath, ['--check', path.join(process.cwd(), script)], { stdio: 'pipe' });
  }
});

test('booking lookup returns a saved booking by reference', async () => {
  await withEnv({ NODE_ENV: 'test', DATABASE_URL: undefined }, async () => {
    global.__bookings = [{ ref: 'BC-LOOKUP-1', status: 'new', route: 'EBB -> LHR', contact: { email: 'a@example.com' } }];
    const req = { method: 'GET', headers: {}, query: { ref: 'BC-LOOKUP-1' } };
    const res = makeRes();
    await bookingsHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.booking.ref, 'BC-LOOKUP-1');
  });
});

test('support API rejects anonymous persistence', async () => {
  await withEnv({ NODE_ENV: 'test', DATABASE_URL: undefined }, async () => {
    global.__support = [];
    const req = {
      method: 'POST',
      headers: {},
      body: { threadId: 'thread-test', email: 'guest@anonymous', message: 'hello' }
    };
    const res = makeRes();
    await supportHandler(req, res);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(global.__support.length, 0);
  });
});

test('flight deals fall back to curated origin-aware routes when Duffel is not configured', async () => {
  await withEnv({ DUFFEL_API_KEY: undefined, DATABASE_URL: undefined }, async () => {
    const req = { method: 'GET', headers: {}, query: { origin: 'KGL' }, body: {} };
    const res = makeRes();
    await flightDealsHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.origin, 'KGL');
    assert.strictEqual(res.body.estimated, true);
    assert.ok(res.body.deals.length > 0);
    assert.ok(res.body.deals.every((deal) => deal.from === 'KGL'));
  });
});

test('price alert returns consistent ok response without email delivery', async () => {
  await withEnv({ NODE_ENV: 'test', DATABASE_URL: undefined, RESEND_API_KEY: undefined }, async () => {
    global.__priceAlerts = [];
    const req = {
      method: 'POST',
      body: {
        email: 'traveler@example.com',
        from: 'EBB',
        to: 'LHR',
        targetPrice: 500,
        currency: 'USD'
      }
    };
    const res = makeRes();
    await priceAlertHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.match(res.body.message, /Email delivery is not configured/);
  });
});

test('email/password user can change password with current password', async () => {
  await withEnv({ NODE_ENV: 'test', DATABASE_URL: undefined, JWT_SECRET: 'test-secret-at-least-32-characters-long' }, async () => {
    global.__bc_auth_users = new Map();

    const registerReq = {
      method: 'POST',
      params: { action: 'register' },
      headers: {},
      socket: { remoteAddress: 'change-pass-test' },
      body: { email: 'change@example.com', password: 'Oldpass1!', name: 'Change User' }
    };
    const registerRes = makeRes();
    await authHandler(registerReq, registerRes);
    assert.strictEqual(registerRes.statusCode, 201);

    const changeReq = {
      method: 'POST',
      params: { action: 'change-password' },
      headers: { authorization: `Bearer ${registerRes.body.token}` },
      socket: { remoteAddress: 'change-pass-test' },
      body: { currentPassword: 'Oldpass1!', newPassword: 'Newpass1!' }
    };
    const changeRes = makeRes();
    await authHandler(changeReq, changeRes);
    assert.strictEqual(changeRes.statusCode, 200);
    assert.strictEqual(changeRes.body.ok, true);
  });
});
