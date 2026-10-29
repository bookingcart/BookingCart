#!/usr/bin/env node
// Smoke-test the operator console the way the React dashboard calls it: a signed
// JWT for the operator owner, then every read action through api-routes/transport.
//
//   node scratch/check-transport-console.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { query, initDb } = require('../lib/db');
const { signBookingCartJwt } = require('../lib/google-verify');
const handler = require('../api-routes/transport');

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

async function call(query, token) {
  const res = makeRes();
  await handler({ method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {}, query }, res);
  return res;
}

async function main() {
  await initDb();
  const op = (await query(
    `SELECT id, name, owner_email FROM bc_transport_operators ORDER BY id LIMIT 1`
  )).rows[0];
  if (!op) throw new Error('No transport operator found — run scripts/seed-transport.cjs first');
  console.log(`operator #${op.id} ${op.name} <${op.owner_email}>`);

  const token = signBookingCartJwt({ email: op.owner_email }, { expiresIn: '1h' });
  const operatorId = op.id;

  const checks = [
    ['my-operators', {}],
    ['overview', { operatorId }],
    ['routes', { operatorId }],
    ['vehicles', { operatorId }],
    ['departures', { operatorId }],
    ['bookings', { operatorId, limit: 5 }],
    ['staff', { operatorId }],
    ['settings', { operatorId }],
    ['report', { operatorId }],
  ];

  let failures = 0;
  for (const [action, extra] of checks) {
    const res = await call({ action, ...extra }, token);
    const ok = res.statusCode === 200 && res.body?.ok !== false;
    if (!ok) failures += 1;
    const summary = res.body?.counts
      || (res.body?.operators && `${res.body.operators.length} operators`)
      || (res.body?.routes && `${res.body.routes.length} routes`)
      || (res.body?.vehicles && `${res.body.vehicles.length} vehicles`)
      || (res.body?.departures && `${res.body.departures.length} departures`)
      || (res.body?.orders && `${res.body.orders.length} orders`)
      || (res.body?.staff && `${res.body.staff.length} staff`)
      || (res.body?.summary && JSON.stringify(res.body.summary))
      || (res.body?.operator && `operator ${res.body.operator.name}`)
      || '';
    console.log(`${ok ? 'PASS' : 'FAIL'} ${action.padEnd(14)} ${res.statusCode} ${summary}${res.body?.error ? ` — ${res.body.error}` : ''}`);
  }

  // A signed-out caller and a non-admin caller must both be refused.
  const anon = await call({ action: 'overview', operatorId });
  console.log(`${anon.statusCode === 401 ? 'PASS' : 'FAIL'} anonymous            ${anon.statusCode} ${anon.body?.error || ''}`);

  const outsider = await call({ action: 'admin-overview' }, token);
  console.log(`${outsider.statusCode === 403 ? 'PASS' : 'FAIL'} non-admin            ${outsider.statusCode} ${outsider.body?.error || ''}`);

  // Money on screen is meaningless without its currency, so the console payloads must carry it.
  const overview = await call({ action: 'overview', operatorId }, token);
  const report = await call({ action: 'report', operatorId }, token);
  for (const [label, value] of [['overview.currency', overview.body?.stats?.currency], ['report.currency', report.body?.currency]]) {
    const ok = typeof value === 'string' && value.length === 3;
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label.padEnd(18)} ${value || 'missing'}`);
  }

  const adminEmail = (process.env.VITE_ADMIN_EMAILS || '').split(',').map((entry) => entry.trim()).filter(Boolean)[0];
  if (adminEmail) {
    const adminToken = signBookingCartJwt({ email: adminEmail }, { expiresIn: '1h' });
    for (const [action, extra] of [['admin-overview', {}], ['admin-report', {}], ['admin-locations', {}], ['admin-audit', { limit: 5 }]]) {
      const res = await call({ action, ...extra }, adminToken);
      const ok = res.statusCode === 200 && res.body?.ok !== false;
      if (!ok) failures += 1;
      const summary = action === 'admin-overview' ? `${res.body?.operators?.length ?? 0} operators, ${res.body?.stats?.currency || 'no currency'}`
        : action === 'admin-report' ? `${res.body?.totals?.gross ?? 0} gross, ${res.body?.currency || 'no currency'}`
          : `${(res.body?.locations || res.body?.entries || []).length} rows`;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${action.padEnd(18)} ${res.statusCode} ${summary}${res.body?.error ? ` — ${res.body.error}` : ''}`);
    }
  } else {
    console.log('SKIP admin console — VITE_ADMIN_EMAILS is not set');
  }

  console.log(failures === 0 ? '\nconsole contracts OK' : `\n${failures} console call(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
