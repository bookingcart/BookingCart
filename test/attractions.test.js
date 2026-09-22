const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  safeHttpsUrl,
  normalizeGeoapify,
  normalizeWikiPage,
  normalizeGetYourGuide,
  dedupeAttractions,
} = require('../lib/attractions');
const attractionsHandler = require('../api-routes/attractions');

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test('attraction external URLs only accept HTTPS', () => {
  assert.equal(safeHttpsUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpsUrl('http://example.com'), '');
  assert.equal(safeHttpsUrl('https://example.com/tour'), 'https://example.com/tour');
});

test('Geoapify normalization never invents booking data', () => {
  const item = normalizeGeoapify({ geometry: { coordinates: [30.06, -1.94] }, properties: { place_id: 'kigali-1', name: 'Kigali Genocide Memorial', categories: ['tourism.sights'], city: 'Kigali', country: 'Rwanda', formatted: 'KG 14 Ave, Kigali' } });
  assert.equal(item.id, 'geoapify:kigali-1');
  assert.equal(item.bookable, false);
  assert.deepEqual(item.offers, []);
  assert.equal(item.image, null);
});

test('Wikimedia normalization preserves source attribution and image', () => {
  const item = normalizeWikiPage({ pageid: 42, title: 'Museum', fullurl: 'https://en.wikipedia.org/wiki/Museum', coordinates: [{ lat: 1, lon: 2 }], thumbnail: { source: 'https://upload.wikimedia.org/image.jpg' }, description: 'A museum' });
  assert.equal(item.source, 'wikimedia');
  assert.equal(item.attribution.label, 'Wikipedia contributors');
  assert.equal(item.image.url, 'https://upload.wikimedia.org/image.jpg');
});

test('GetYourGuide normalization requires a valid HTTPS handoff', () => {
  assert.equal(normalizeGetYourGuide({ id: 1, title: 'Tour', url: '#' }), null);
  const item = normalizeGetYourGuide({ id: 1, title: 'Tour', url: 'https://www.getyourguide.com/tour', price: { amount: 25, currency: 'USD' } }, 'partner-1');
  assert.equal(item.bookable, true);
  assert.match(item.offers[0].url, /partner_id=partner-1/);
});

test('attraction deduplication collapses same name and nearby coordinates', () => {
  const items = dedupeAttractions([{ id: 'a', name: 'National Museum', lat: 1.0001, lon: 2.0001 }, { id: 'b', name: 'National Museum', lat: 1.0002, lon: 2.0002 }]);
  assert.equal(items.length, 1);
});

test('search endpoint rejects missing destination coordinates', async () => {
  const req = { method: 'GET', headers: {}, query: { q: 'Kigali' }, params: { action: 'search' }, socket: {} };
  const res = responseRecorder();
  await attractionsHandler(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Choose a destination/);
});

test('analytics endpoint rejects unknown event types', async () => {
  const req = { method: 'POST', headers: {}, query: {}, body: { eventType: 'made_up' }, params: { action: 'events' }, socket: {} };
  const res = responseRecorder();
  await attractionsHandler(req, res);
  assert.equal(res.statusCode, 400);
});

test('Attractions routes have Express and Netlify deployment parity', () => {
  const server = fs.readFileSync(require.resolve('../server'), 'utf8');
  const netlify = fs.readFileSync(require.resolve('../netlify/functions/api'), 'utf8');
  for (const route of ['attractions/destinations','attractions/search','attractions/events','attractions/analytics']) {
    assert.match(server, new RegExp(route.replace('/', '\\/')));
    assert.match(netlify, new RegExp(route.replace('/', '\\/')));
  }
});
