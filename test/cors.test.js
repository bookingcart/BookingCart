'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { pickAllowOrigin, getCorsHeaders } = require('../lib/cors');

test('pickAllowOrigin reflects request in development', () => {
  const prev = process.env.NODE_ENV;
  delete process.env.ALLOWED_ORIGINS;
  process.env.NODE_ENV = 'development';
  assert.strictEqual(pickAllowOrigin('http://localhost:5173'), 'http://localhost:5173');
  process.env.NODE_ENV = prev;
});

test('getCorsHeaders includes ACAO when origin allowed in dev', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  delete process.env.ALLOWED_ORIGINS;
  const h = getCorsHeaders({ headers: { origin: 'http://localhost:3000' } });
  assert.ok(h['Access-Control-Allow-Origin']);
  process.env.NODE_ENV = prev;
});

test('pickAllowOrigin does not reflect arbitrary origins in production without allowlist', () => {
  const prev = process.env.NODE_ENV;
  const prevAllowed = process.env.ALLOWED_ORIGINS;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOWED_ORIGINS;
  assert.strictEqual(pickAllowOrigin('https://evil.example'), null);
  process.env.NODE_ENV = prev;
  if (prevAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
  else process.env.ALLOWED_ORIGINS = prevAllowed;
});

test('pickAllowOrigin only allows configured production origins', () => {
  const prev = process.env.NODE_ENV;
  const prevAllowed = process.env.ALLOWED_ORIGINS;
  process.env.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = 'https://bookingcart.example, https://admin.bookingcart.example/';
  assert.strictEqual(pickAllowOrigin('https://bookingcart.example'), 'https://bookingcart.example');
  assert.strictEqual(pickAllowOrigin('https://evil.example'), null);
  process.env.NODE_ENV = prev;
  if (prevAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
  else process.env.ALLOWED_ORIGINS = prevAllowed;
});
