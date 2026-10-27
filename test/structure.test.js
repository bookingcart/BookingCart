'use strict';

/**
 * Guards the deployment contract: no runtime DDL, every SQL migration is in the
 * journal, sensitive booking reads are redacted, and the cron endpoint stays
 * locked down.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = process.cwd();
const bookingsHandler = require('../api-routes/bookings');
const cronHandler = require('../api-routes/cron');
const { signBookingCartJwt } = require('../lib/google-verify');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

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
    writeHead(code, headers) {
      this.statusCode = code;
      Object.assign(this.headers, headers || {});
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

function listFiles(relativeDir, extension) {
  const dir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(relativeDir, entry.name));
}

test('server, api and lib entry points are syntactically valid', () => {
  const files = [
    'server.js',
    'api/index.js',
    'netlify/functions/api.js',
    ...listFiles('lib', '.js'),
    ...listFiles('lib', '.mjs'),
    ...listFiles('api-routes', '.js'),
    ...listFiles('scripts', '.cjs'),
  ];

  for (const file of files) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'pipe' });
  }
});

test('no handler creates or alters database tables outside migrations', () => {
  const runtimeFiles = [
    'server.js',
    ...listFiles('lib', '.js'),
    ...listFiles('api-routes', '.js'),
    ...listFiles('scripts', '.cjs').filter((file) => !file.includes('run-migrations')),
  ];
  const offenders = [];

  for (const file of runtimeFiles) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/\b(CREATE|ALTER|DROP)\s+TABLE\b/i.test(source)) offenders.push(file);
  }

  assert.deepStrictEqual(offenders, [], `Move DDL into db/migrations: ${offenders.join(', ')}`);
});

test('every SQL migration is registered in the Drizzle journal', () => {
  const journal = readJson('db/migrations/meta/_journal.json');
  const journalTags = new Set((journal.entries || []).map((entry) => entry.tag));
  const sqlFiles = fs
    .readdirSync(path.join(ROOT, 'db/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .map((name) => name.replace(/\.sql$/, ''));

  const missing = sqlFiles.filter((tag) => !journalTags.has(tag));
  assert.deepStrictEqual(missing, [], `Add these migrations to db/migrations/meta/_journal.json: ${missing.join(', ')}`);
});

test('guest booking lookup is redacted while the owner gets full details', async () => {
  const saved = {
    ref: 'BC-REDACT-1',
    status: 'confirmed',
    route: 'EBB -> LHR',
    dates: '2026-11-01',
    flight: { currency: 'USD', segments: [{ departCode: 'EBB', arriveCode: 'LHR' }] },
    passengers: [{ firstName: 'Ada', lastName: 'Lovelace' }],
    contact: { email: 'owner@example.com', phone: '+256700000000' },
    total: 420.5,
    payment: { status: 'paid', last4: '4242' },
    ticket: { airline: 'BA', ticketNumber: '125-1234567890' },
    duffelOrderId: 'ord_123'
  };

  await withEnv({ NODE_ENV: 'test', DATABASE_URL: undefined, JWT_SECRET: 'test-secret' }, async () => {
    global.__bookings = [saved];

    const guestRes = makeRes();
    await bookingsHandler({ method: 'GET', headers: {}, query: { ref: saved.ref } }, guestRes);
    assert.strictEqual(guestRes.statusCode, 200);
    assert.strictEqual(guestRes.body.redacted, true);
    assert.strictEqual(guestRes.body.booking.ref, saved.ref);
    assert.strictEqual(guestRes.body.booking.total, 420.5);
    assert.strictEqual(guestRes.body.booking.passengers, undefined);
    assert.strictEqual(guestRes.body.booking.contact, undefined);
    assert.strictEqual(guestRes.body.booking.payment, undefined);
    assert.strictEqual(guestRes.body.booking.ticket, undefined);
    assert.strictEqual(guestRes.body.booking.duffelOrderId, undefined);

    const ownerToken = signBookingCartJwt({ email: 'owner@example.com' }, { expiresIn: '1h' });
    const ownerRes = makeRes();
    await bookingsHandler(
      { method: 'GET', headers: { authorization: `Bearer ${ownerToken}` }, query: { ref: saved.ref } },
      ownerRes
    );
    assert.strictEqual(ownerRes.statusCode, 200);
    assert.strictEqual(ownerRes.body.redacted, undefined);
    assert.deepStrictEqual(ownerRes.body.booking.passengers, saved.passengers);
    assert.strictEqual(ownerRes.body.booking.ticket.ticketNumber, '125-1234567890');

    const strangerToken = signBookingCartJwt({ email: 'stranger@example.com' }, { expiresIn: '1h' });
    const strangerRes = makeRes();
    await bookingsHandler(
      { method: 'GET', headers: { authorization: `Bearer ${strangerToken}` }, query: { ref: saved.ref } },
      strangerRes
    );
    assert.strictEqual(strangerRes.body.redacted, true);
    assert.strictEqual(strangerRes.body.booking.passengers, undefined);
  });
});

test('every Leaflet map renders the shared keyless basemap layer', () => {
  const files = [...listFiles('src/pages', '.jsx'), ...listFiles('src/components', '.jsx')]
    .filter((file) => !path.basename(file).startsWith('Basemap'));
  const mapFiles = files.filter((file) => /<MapContainer/.test(fs.readFileSync(path.join(ROOT, file), 'utf8')));
  assert.ok(mapFiles.length >= 4, `expected the map surfaces to be detected, found ${mapFiles.length}`);

  for (const file of mapFiles) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /<BasemapLayer/, `${file} must render <BasemapLayer> instead of a hard-coded TileLayer`);
  }

  const tiles = fs.readFileSync(path.join(ROOT, 'src/lib/mapTiles.js'), 'utf8');
  const urls = [...tiles.matchAll(/url: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(urls.length >= 4, 'expected several free basemap providers');
  for (const url of urls) {
    assert.doesNotMatch(url, /\{key\}|\{apikey\}|apikey=|api_key=|access_token/i, `${url} must not need an API key`);
    // CARTO watermarks every tile with "API KEY REQUIRED" unless a key is sent.
    assert.doesNotMatch(url, /cartocdn|stadiamaps|thunderforest|mapbox\.com|maps\.google/i, `${url} requires a key`);
  }

  const defaultProvider = tiles.match(/DEFAULT_MAP_PROVIDER = '([^']+)'/)?.[1];
  assert.ok(defaultProvider, 'DEFAULT_MAP_PROVIDER must be declared');
  assert.match(tiles, new RegExp(`\\n  ${defaultProvider}: \\{`), 'DEFAULT_MAP_PROVIDER must be a registered provider');
  assert.doesNotMatch(tiles, /DEFAULT_MAP_PROVIDER = 'voyager'/, 'CARTO basemaps need a key and cannot be the default');
});

test('geo endpoint resolves location from CDN headers without a key', async () => {
  const geoHandler = require('../api-routes/geo');

  const call = async (req) => {
    const res = makeRes();
    await geoHandler({ method: 'GET', headers: {}, query: {}, ...req }, res);
    return res;
  };

  const london = await call({
    headers: {
      'x-vercel-ip-country': 'gb',
      'x-vercel-ip-city': 'London',
      'x-vercel-ip-latitude': '51.5074',
      'x-vercel-ip-longitude': '-0.1276',
    },
  });
  assert.strictEqual(london.statusCode, 200);
  assert.strictEqual(london.body.countryCode, 'GB');
  assert.strictEqual(london.body.countryName, 'United Kingdom');
  assert.strictEqual(london.body.city, 'London');
  assert.strictEqual(london.body.source, 'edge');
  assert.strictEqual(london.body.latitude, 51.5074);
  assert.ok(!('ip' in london.body), 'the caller IP must never be echoed back');

  // Cloudflare headers work too, and missing coordinates stay null instead of 0
  const nairobi = await call({ headers: { 'cf-ipcountry': 'KE', 'cf-ipcity': 'Nairobi' } });
  assert.strictEqual(nairobi.body.countryCode, 'KE');
  assert.strictEqual(nairobi.body.latitude, null);
  assert.strictEqual(nairobi.body.longitude, null);

  assert.strictEqual((await call({ method: 'POST' })).statusCode, 405);
  assert.strictEqual((await call({ method: 'OPTIONS' })).statusCode, 204);
});

test('location detection has a single source of truth and drops the stale country cache', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(server, /app\.all\('\/api\/geo'/, '/api/geo must be mounted');

  const geoLib = fs.readFileSync(path.join(ROOT, 'src/lib/geo.js'), 'utf8');
  assert.match(geoLib, /LEGACY_CACHE_KEYS = \['bc_geo_data'\]/, 'the old 24h cache key must be cleared');
  assert.match(geoLib, /'\/api\/geo'/, 'the client must prefer our own geo endpoint');
  assert.match(geoLib, /timeZone/, 'a timezone change must invalidate the cached country');
  // The cache must not short-circuit detection, or a VPN/network switch keeps showing
  // the old country until the TTL expires.
  assert.match(geoLib, /getGeo\(\{ useCache = false \} = \{\}\)/, 'getGeo must still export the useCache option');
  assert.doesNotMatch(
    geoLib,
    /export function getGeo[\s\S]{0,200}if \(cached\) return Promise\.resolve\(cached\);/,
    'the cached country must not short-circuit a fresh detection'
  );
  assert.match(geoLib, /OVERRIDE_KEY/, 'a manual location override must be supported');

  const staysLocations = fs.readFileSync(path.join(ROOT, 'api-routes/stays-locations.js'), 'utf8');
  assert.match(staysLocations, /addressdetails=1/, 'the picker needs country codes from Nominatim');
  assert.match(staysLocations, /countryCode/, 'the picker maps a city to its country');

  const homePage = fs.readFileSync(path.join(ROOT, 'src/pages/HomePage.jsx'), 'utf8');
  assert.match(homePage, /explore-location-pill/, 'the explore section must offer a way to change location');
  assert.match(homePage, /setGeoOverride/, 'picking a city must persist as an override');

  for (const file of listFiles('src/pages', '.jsx')) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(code, /bc_geo_data/, `${file} must not read the stale geo cache`);
    assert.doesNotMatch(code, /ipapi\.co|ipwho\.is/, `${file} must use src/lib/geo.js instead of calling geo APIs directly`);
  }
});

test('page modules only enumerate constants they declare', () => {
  // A typo'd constant name inside Object.values() builds fine but crashes at render time.
  for (const file of listFiles('src/pages', '.jsx')) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const declared = new Set([...code.matchAll(/^\s*const ([A-Z][A-Z0-9_]+)\s*=/gm)].map((match) => match[1]));
    for (const match of code.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
      match[1].split(',').forEach((name) => declared.add(name.trim().split(/\s+as\s+/)[0]));
    }
    for (const match of code.matchAll(/Object\.(?:values|keys|entries)\(\s*([A-Z][A-Z0-9_]+)\s*\)/g)) {
      assert.ok(declared.has(match[1]), `${file} references ${match[1]}, which the module never declares`);
    }
  }
});

test('cron endpoint rejects unauthenticated calls and requires CRON_SECRET', async () => {
  const handler = (env, req) =>
    withEnv({ CRON_SECRET: env }, async () => {
      const res = makeRes();
      await cronHandler({ method: 'GET', headers: {}, query: {}, path: '/api/cron/price-tracker', ...req }, res);
      return res;
    });

  assert.strictEqual((await handler(undefined, {})).statusCode, 503);
  assert.strictEqual((await handler('s3cret', {})).statusCode, 401);
  assert.strictEqual(
    (await handler('s3cret', { headers: { authorization: 'Bearer wrong' } })).statusCode,
    401
  );
  assert.strictEqual((await handler('s3cret', { method: 'DELETE' })).statusCode, 405);
});
