'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../lib/db');
const { signBookingCartJwt } = require('../lib/google-verify');

function response() {
  return {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(body) { this.body = body; return this; },
  };
}

test('authenticated image upload survives a separate public read', async () => {
  const originals = { query: db.query, initDb: db.initDb, isDbConfigured: db.isDbConfigured };
  const images = new Map();
  db.isDbConfigured = () => true;
  db.initDb = async () => true;
  db.query = async (sql, args = []) => {
    if (sql.startsWith('CREATE TABLE')) return { rows: [] };
    if (sql.startsWith('INSERT')) {
      images.set(args[0], { mime_type: args[2], image_data: args[3] });
      return { rows: [] };
    }
    if (sql.startsWith('SELECT')) return { rows: images.has(args[0]) ? [images.get(args[0])] : [] };
    throw new Error('Unexpected query');
  };
  delete require.cache[require.resolve('../api-routes/upload')];
  const upload = require('../api-routes/upload');
  try {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const denied = response();
    await upload({ method: 'POST', body: { image: `data:image/jpeg;base64,${image.toString('base64')}` }, headers: {} }, denied);
    assert.equal(denied.statusCode, 401);

    const saved = response();
    await upload({ method: 'POST', body: { image: `data:image/jpeg;base64,${image.toString('base64')}` }, headers: {
      authorization: `Bearer ${signBookingCartJwt({ email: 'guide@example.com' })}`,
    } }, saved);
    assert.equal(saved.statusCode, 201);
    assert.match(saved.body.url, /^\/api\/upload\/[0-9a-f-]+$/);

    const fetched = response();
    await upload({ method: 'GET', params: { id: saved.body.url.split('/').pop() } }, fetched);
    assert.equal(fetched.statusCode, 200);
    assert.equal(fetched.headers['Content-Type'], 'image/jpeg');
    assert.deepEqual(fetched.body, image);
  } finally {
    Object.assign(db, originals);
    delete require.cache[require.resolve('../api-routes/upload')];
  }
});
