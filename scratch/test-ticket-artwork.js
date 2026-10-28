'use strict';

/**
 * Rehearsal for platform ticket artwork + the client artwork space.
 *
 * Proves that:
 *   - the company panel is one platform row an administrator can read and save,
 *   - a non-administrator cannot change it,
 *   - artwork URLs are sanitised before they can reach print HTML,
 *   - the attraction's own artwork is saved on its ticket settings, sanitised,
 *     and returned by the ticket-office context that every print screen uses.
 *
 * It restores the company panel and deletes its fixture afterwards.
 *
 * Run with: node scratch/test-ticket-artwork.js
 */

require('dotenv').config();

const assert = require('node:assert');
const { query, initDb } = require('../lib/db');
const T = require('../lib/ticketing');
const B = require('../lib/ticket-branding');
const { signBookingCartJwt } = require('../lib/google-verify');
const posHandler = require('../api-routes/attraction-pos');

const OWNER = '__artwork-e2e__@bookingcart.local';
const createdAttractionIds = [];
let originalBranding = null;

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(body) { this.body = body || ''; return this; },
  };
}

async function call({ method = 'GET', email = '', body = {} } = {}) {
  const headers = {};
  if (email) headers.authorization = `Bearer ${signBookingCartJwt({ email }, { expiresIn: '1h' })}`;
  const res = makeRes();
  await posHandler(
    { method, headers, body, query: method === 'GET' ? body : {} },
    res
  );
  return { status: res.statusCode, body: res.body };
}

function step(label, detail = '') {
  console.log(`  ✔ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function cleanup() {
  for (const id of createdAttractionIds) {
    await query(`DELETE FROM bc_ticket_settings WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_staff WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_attraction_profiles WHERE id = $1`, [id]);
  }
  if (originalBranding) {
    await B.saveBranding(originalBranding, 'rehearsal-cleanup');
  }
}

async function main() {
  await initDb();
  originalBranding = await B.getBranding();
  assert.strictEqual(typeof originalBranding.companyName, 'string');

  // ── URL sanitising ────────────────────────────────────────────────────────
  assert.strictEqual(B.sanitizeImageUrl('https://cdn.example.com/art.png'), 'https://cdn.example.com/art.png');
  assert.strictEqual(B.sanitizeImageUrl('/api/upload/abc'), '/api/upload/abc');
  assert.strictEqual(B.sanitizeImageUrl('javascript:alert(1)'), '');
  assert.strictEqual(B.sanitizeImageUrl('data:image/png;base64,AAAA'), '');
  assert.strictEqual(B.sanitizeImageUrl('//evil.example.com/x.png'), '');
  assert.strictEqual(B.sanitizeImageUrl('https://x/"><script>alert(1)</script>'), '');
  step('artwork URLs are restricted to http(s) and site-relative paths');

  // ── Only an administrator may change the company panel ────────────────────
  const notAdmin = await call({
    method: 'POST',
    email: OWNER,
    body: { action: 'save-branding', companyName: 'Hijack' },
  });
  assert.ok([403, 503].includes(notAdmin.status), JSON.stringify(notAdmin.body));
  step('a non-administrator cannot save the company artwork', `status=${notAdmin.status}`);

  const adminEmail = String(process.env.VITE_ADMIN_EMAILS || '').split(',')[0].trim();
  if (adminEmail) {
    const saved = await call({
      method: 'POST',
      email: adminEmail,
      body: {
        action: 'save-branding',
        companyName: 'BookingCart Rehearsal',
        companyTagline: 'Compare. Book. Instant.',
        companyWebsite: 'www.bookingcart.online',
        artworkUrl: 'javascript:alert(1)',
        artworkFit: 'contain',
      },
    });
    assert.strictEqual(saved.status, 200, JSON.stringify(saved.body));
    assert.strictEqual(saved.body.branding.companyName, 'BookingCart Rehearsal');
    assert.strictEqual(saved.body.branding.artworkUrl, '', 'a script URL must never be stored');
    assert.strictEqual(saved.body.branding.artworkFit, 'contain');

    const reread = await call({ method: 'GET', email: adminEmail, body: { action: 'branding' } });
    assert.strictEqual(reread.status, 200, JSON.stringify(reread.body));
    assert.strictEqual(reread.body.branding.companyName, 'BookingCart Rehearsal');
    step('administrator saves and reads the company panel', adminEmail);
  } else {
    console.warn('  ! VITE_ADMIN_EMAILS is empty — skipping the administrator round trip');
  }

  // ── A client's own artwork space ──────────────────────────────────────────
  const profile = await query(
    `INSERT INTO bc_attraction_profiles (owner_email, name, city, country, status, currency)
     VALUES ($1, 'Artwork Rehearsal Trails', 'Kampala', 'Uganda', 'approved', 'UGX')
     RETURNING id`,
    [OWNER]
  );
  const attractionId = profile.rows[0].id;
  createdAttractionIds.push(attractionId);

  const blocked = await call({
    method: 'POST',
    email: OWNER,
    body: { action: 'save-settings', attractionId, ticketArtworkUrl: 'javascript:alert(2)' },
  });
  assert.strictEqual(blocked.status, 200, JSON.stringify(blocked.body));
  assert.strictEqual(blocked.body.settings.ticketArtworkUrl, '', 'a script URL must never reach the ticket');
  step('client artwork URL is sanitised on save');

  const artworkUrl = '/api/upload/11111111-1111-1111-1111-111111111111';
  const withArtwork = await call({
    method: 'POST',
    email: OWNER,
    body: {
      action: 'save-settings',
      attractionId,
      ticketArtworkUrl: artworkUrl,
      ticketArtworkFit: 'contain',
      ticketContact: '+256 700 000 000',
    },
  });
  assert.strictEqual(withArtwork.status, 200, JSON.stringify(withArtwork.body));
  assert.strictEqual(withArtwork.body.settings.ticketArtworkUrl, artworkUrl);
  assert.strictEqual(withArtwork.body.settings.ticketArtworkFit, 'contain');
  step('client artwork is stored on the ticket settings');

  // Saving twice without the artwork fields must keep the upload.
  const untouched = await call({
    method: 'POST',
    email: OWNER,
    body: { action: 'save-settings', attractionId, ticketContact: '+256 700 000 001' },
  });
  assert.strictEqual(untouched.body.settings.ticketArtworkUrl, artworkUrl, 'an unrelated save must not drop the artwork');
  step('an unrelated design save keeps the uploaded artwork');

  const context = await call({ method: 'GET', email: OWNER, body: { action: 'context', attractionId } });
  assert.strictEqual(context.status, 200, JSON.stringify(context.body));
  assert.strictEqual(context.body.settings.ticketArtworkUrl, artworkUrl);
  assert.strictEqual(context.body.settings.ticketArtworkFit, 'contain');
  assert.strictEqual(context.body.attraction.artworkUrl, artworkUrl, 'print screens read the artwork from the context');
  assert.ok(context.body.company, 'every print screen receives the company panel');
  assert.strictEqual(typeof context.body.company.companyName, 'string');
  step('the ticket-office context carries both artwork panels', context.body.company.companyName);

  // ── Settings survive a read back through the settings table ───────────────
  const stored = await T.getSettings(attractionId);
  assert.strictEqual(stored.ticket_artwork_url, artworkUrl);
  assert.strictEqual(stored.ticket_artwork_fit, 'contain');
  step('artwork is persisted in bc_ticket_settings');

  console.log('\nAll ticket artwork checks passed.');
}

main()
  .then(async () => { await cleanup(); process.exit(0); })
  .catch(async (err) => {
    console.error('\nFAILED:', err.message);
    await cleanup().catch(() => {});
    process.exit(1);
  });
