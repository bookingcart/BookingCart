'use strict';

/**
 * Rehearsal for the "I listed an attraction but the ticket office is empty"
 * fix. It proves that a listing created with the "List your event or
 * attraction" wizard (bc_event_profiles) can be imported once into a ticketable
 * attraction (bc_attraction_profiles) with its ticket prices, that doing it
 * twice is harmless, and that the imported tickets are immediately quotable.
 *
 * It uses a throwaway owner and deletes every row it creates.
 *
 * Run with: node scratch/test-import-listings.js
 */

require('dotenv').config();

const assert = require('node:assert');
const { query, initDb } = require('../lib/db');
const T = require('../lib/ticketing');
const { signBookingCartJwt } = require('../lib/google-verify');
const profilesHandler = require('../api-routes/attraction-profiles');
const ticketingHandler = require('../api-routes/attraction-ticketing');

const OWNER = '__import-e2e__@bookingcart.local';
const VISIT_DATE = T.isoToday();
const createdEventIds = [];
const createdAttractionIds = [];

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

async function call(handler, { method = 'GET', email = '', body = {} } = {}) {
  const headers = {};
  if (email) headers.authorization = `Bearer ${signBookingCartJwt({ email }, { expiresIn: '1h' })}`;
  const res = makeRes();
  await handler(
    { method, headers, body, query: method === 'GET' ? body : undefined },
    res
  );
  return { status: res.statusCode, body: res.body };
}

function step(label, detail = '') {
  console.log(`  ✔ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function cleanup() {
  for (const id of createdAttractionIds) {
    await query(`DELETE FROM bc_ticket_inventory WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_slots WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_types WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_settings WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_attraction_profiles WHERE id = $1`, [id]);
  }
  for (const id of createdEventIds) {
    await query(`DELETE FROM bc_event_profiles WHERE id = $1`, [id]);
  }
}

async function main() {
  await initDb();

  // ── A real account's listings are discoverable (read only) ────────────────
  const live = await call(profilesHandler, {
    method: 'GET',
    email: 'vault.pocket@gmail.com',
    body: { action: 'event-listings' },
  });
  assert.strictEqual(live.status, 200, JSON.stringify(live.body));
  assert.strictEqual(live.body.signedInAs, 'vault.pocket@gmail.com');
  assert.ok(Array.isArray(live.body.listings), 'listings must be a list');
  step('live account listings load', `${live.body.listings.length} found`);

  // ── A wizard listing becomes a ticketable attraction ──────────────────────
  const inserted = await query(
    `INSERT INTO bc_event_profiles
       (email, step_event_info, step_location, step_tickets, step_contact, step_policies, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'approved')
     RETURNING id`,
    [
      OWNER,
      JSON.stringify({
        eventName: 'Import Rehearsal Park',
        eventType: 'Historic Site',
        description: 'A fixture attraction used to prove the import bridge works end to end.',
        totalCapacity: 40,
      }),
      JSON.stringify({ city: 'Kampala', country: 'Uganda', address: 'Plot 1 Rehearsal Road' }),
      JSON.stringify({
        list: [
          { name: 'Adult', type: 'adult', price: 25, currency: 'Ugx' },
          { name: 'Child', type: 'child', price: 10, currency: 'Ugx' },
        ],
      }),
      JSON.stringify({ bookingEmail: OWNER, phone: '+256700000000' }),
      JSON.stringify({ startTime: '08:00', endTime: '18:00' }),
    ]
  );
  createdEventIds.push(inserted.rows[0].id);
  const eventId = inserted.rows[0].id;

  const listed = await call(profilesHandler, {
    method: 'GET', email: OWNER, body: { action: 'event-listings' },
  });
  assert.strictEqual(listed.status, 200, JSON.stringify(listed.body));
  const found = listed.body.listings.find((item) => item.id === eventId);
  assert.ok(found, 'the new wizard listing must be offered for import');
  assert.strictEqual(found.ticketCount, 2);
  assert.strictEqual(found.importedAttractionId, null);
  step('wizard listing is offered', `${found.name} · ${found.ticketCount} tickets`);

  const imported = await call(profilesHandler, {
    method: 'POST', email: OWNER, body: { action: 'import-event', eventId },
  });
  assert.strictEqual(imported.status, 201, JSON.stringify(imported.body));
  assert.strictEqual(imported.body.created, true);
  const attraction = imported.body.attraction;
  createdAttractionIds.push(attraction.id);
  assert.strictEqual(attraction.name, 'Import Rehearsal Park');
  assert.strictEqual(attraction.owner_email, OWNER);
  assert.strictEqual(imported.body.ticketTypes.length, 2, 'both ticket prices must come across');
  step('listing imported', `attraction #${attraction.id}`);

  // ── Importing again must not duplicate anything ───────────────────────────
  const again = await call(profilesHandler, {
    method: 'POST', email: OWNER, body: { action: 'import-event', eventId },
  });
  assert.strictEqual(again.status, 200, JSON.stringify(again.body));
  assert.strictEqual(again.body.created, false);
  assert.strictEqual(again.body.attraction.id, attraction.id);
  const typesNow = await T.listTicketTypes(attraction.id);
  assert.strictEqual(typesNow.length, 2, 'a double click must not duplicate ticket types');
  step('repeat import is idempotent');

  // The wizard stores currency loose-cased ("Ugx"); the till must still quote
  // in the listing's currency rather than defaulting the settings row to USD.
  const settings = await T.getSettings(attraction.id);
  assert.strictEqual(settings.currency, 'UGX', 'ticket settings must adopt the listing currency');
  assert.ok(typesNow.every((type) => type.currency === 'UGX'), 'every imported price keeps its currency');
  step('imported currency reaches the till', settings.currency);

  const afterImport = await call(profilesHandler, {
    method: 'GET', email: OWNER, body: { action: 'event-listings' },
  });
  assert.strictEqual(
    afterImport.body.listings.find((item) => item.id === eventId).importedAttractionId,
    attraction.id,
    'the UI marks an imported listing'
  );

  // ── The ticket office now sees it, and the tickets are sellable ───────────
  const access = await call(ticketingHandler, {
    method: 'GET', email: OWNER, body: { action: 'attractions' },
  });
  assert.strictEqual(access.status, 200, JSON.stringify(access.body));
  assert.strictEqual(access.body.signedInAs, OWNER);
  const mine = access.body.attractions.find((item) => Number(item.id) === Number(attraction.id));
  assert.ok(mine, 'the imported attraction must appear in Ticketing Management');
  assert.strictEqual(mine.role, 'owner');
  step('attraction visible in ticketing', `role=${mine.role}`);

  const adult = typesNow.find((type) => type.name === 'Adult');
  const quote = await T.computeQuote({
    attractionId: attraction.id,
    visitDate: VISIT_DATE,
    items: [{ ticketTypeId: adult.id, quantity: 2 }],
  });
  assert.strictEqual(quote.ok, true, quote.error);
  assert.ok(quote.quote.total > 0, 'the imported price must carry through to the quote');
  assert.strictEqual(quote.quote.currency, 'UGX', 'the quote must not silently switch currency');
  step('imported tickets are immediately sellable', `total=${quote.quote.total} ${quote.quote.currency}`);

  // ── Somebody else cannot import it ────────────────────────────────────────
  const stranger = await call(profilesHandler, {
    method: 'POST', email: '__import-e2e-other__@bookingcart.local',
    body: { action: 'import-event', eventId },
  });
  assert.strictEqual(stranger.status, 404, JSON.stringify(stranger.body));
  step('another account cannot import it', `status=${stranger.status}`);

  // ── Whitespace / legacy casing in the stored owner address ────────────────
  await query(`UPDATE bc_attraction_profiles SET owner_email = $2 WHERE id = $1`, [
    attraction.id, `  ${OWNER.toUpperCase()} `,
  ]);
  const tolerant = await call(ticketingHandler, {
    method: 'GET', email: OWNER, body: { action: 'attractions' },
  });
  assert.ok(
    tolerant.body.attractions.some((item) => Number(item.id) === Number(attraction.id)),
    'a padded or upper-cased owner address must still find the listing'
  );
  step('ownership match ignores case and padding');

  console.log('\nAll import checks passed.');
}

main()
  .then(async () => { await cleanup(); process.exit(0); })
  .catch(async (err) => {
    console.error('\nFAILED:', err.message);
    await cleanup().catch(() => {});
    process.exit(1);
  });
