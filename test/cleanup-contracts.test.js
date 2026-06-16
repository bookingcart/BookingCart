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
const userHandler = require('../api-routes/user');
const { signBookingCartJwt } = require('../lib/google-verify');

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

test('support API persists guest threads and lets the guest reload by thread id', async () => {
  await withEnv({ NODE_ENV: 'test', DATABASE_URL: undefined }, async () => {
    global.__support = [];

    let req = {
      method: 'POST',
      headers: {},
      body: { threadId: 'thread-test', guest: true, message: 'hello' }
    };
    let res = makeRes();
    await supportHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(global.__support.length, 1);
    assert.strictEqual(global.__support[0].email, '');

    req = {
      method: 'GET',
      headers: {},
      query: { threadId: 'thread-test', guest: '1' }
    };
    res = makeRes();
    await supportHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.threads.length, 1);
    assert.strictEqual(res.body.threads[0].messages[0].text, 'hello');
  });
});

test('support API roundtrips authenticated user and admin replies', async () => {
  await withEnv({
    NODE_ENV: 'test',
    DATABASE_URL: undefined,
    JWT_SECRET: 'test-secret-at-least-32-characters-long',
    VITE_ADMIN_EMAILS: 'admin@example.com'
  }, async () => {
    global.__support = [];
    const userToken = signBookingCartJwt({ email: 'user@example.com', name: 'User' });
    const adminToken = signBookingCartJwt({ email: 'admin@example.com', name: 'Admin' });

    let req = {
      method: 'POST',
      headers: { authorization: `Bearer ${userToken}` },
      body: { threadId: 'thread-auth', email: 'user@example.com', message: 'hello support' }
    };
    let res = makeRes();
    await supportHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);

    req = {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}` },
      body: { threadId: 'thread-auth', message: 'admin reply' }
    };
    res = makeRes();
    await supportHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);

    req = {
      method: 'GET',
      headers: { authorization: `Bearer ${userToken}` },
      query: { email: 'user@example.com' }
    };
    res = makeRes();
    await supportHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(
      res.body.threads[0].messages.map((message) => `${message.from}:${message.text}`),
      ['user:hello support', 'admin:admin reply']
    );
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

test('account settings save profile for the authenticated account email', async () => {
  await withEnv({ NODE_ENV: 'test', DATABASE_URL: undefined, JWT_SECRET: 'test-secret-at-least-32-characters-long' }, async () => {
    global.__users = {};
    const token = signBookingCartJwt({ email: 'profile@example.com', name: 'Profile User' });
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        email: 'profile@example.com',
        state: {
          profile: {
            firstName: 'Profile',
            lastName: '',
            email: 'profile@example.com',
            phone: '+250700000000',
            nationality: 'Rwandan'
          }
        }
      }
    };
    const res = makeRes();
    await userHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(global.__users['profile@example.com'].profile.phone, '+250700000000');
    assert.strictEqual(global.__users['profile@example.com'].profile.email, 'profile@example.com');
  });
});

test('account settings reject saves under a different account email', async () => {
  await withEnv({ NODE_ENV: 'test', DATABASE_URL: undefined, JWT_SECRET: 'test-secret-at-least-32-characters-long' }, async () => {
    global.__users = {};
    const token = signBookingCartJwt({ email: 'owner@example.com', name: 'Owner User' });
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        email: 'other@example.com',
        state: { profile: { firstName: 'Other', email: 'other@example.com' } }
      }
    };
    const res = makeRes();
    await userHandler(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(global.__users['other@example.com'], undefined);
  });
});

test('expired auth token is rejected as an expired session', async () => {
  await withEnv({ NODE_ENV: 'test', DATABASE_URL: undefined, JWT_SECRET: 'test-secret-at-least-32-characters-long', GOOGLE_CLIENT_ID: undefined }, async () => {
    global.__users = {};
    const token = signBookingCartJwt(
      { email: 'expired@example.com', name: 'Expired User' },
      { expiresIn: '-1s' }
    );
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        email: 'expired@example.com',
        state: { profile: { firstName: 'Expired', email: 'expired@example.com' } }
      }
    };
    const res = makeRes();
    await userHandler(req, res);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.ok, false);
    assert.match(res.body.error, /session expired/i);
    assert.strictEqual(global.__users['expired@example.com'], undefined);
  });
});

test('auth session endpoint validates the active bearer token', async () => {
  await withEnv({ NODE_ENV: 'test', DATABASE_URL: undefined, JWT_SECRET: 'test-secret-at-least-32-characters-long' }, async () => {
    const token = signBookingCartJwt({ email: 'session@example.com', name: 'Session User' });
    const req = {
      method: 'GET',
      params: { action: 'session' },
      headers: { authorization: `Bearer ${token}` },
      socket: { remoteAddress: 'session-test' },
      body: {}
    };
    const res = makeRes();
    await authHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.user.email, 'session@example.com');
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
