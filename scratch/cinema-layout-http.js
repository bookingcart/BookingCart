// scratch/cinema-layout-http.js — end-to-end check of the auditorium layout editor API.
// Run: API_ONLY=1 PORT=3001 node server.js &  then  node scratch/cinema-layout-http.js
//
// Creates a throwaway "QA Layout Hall" with its own published layout, screening,
// holds and pricing rule, asserts the behaviour, then removes everything again.
require('dotenv').config();
const { signBookingCartJwt } = require('../lib/google-verify');
const L = require('../lib/cinema-layout');
const { query } = require('../lib/db');

const BASE = `http://localhost:${process.env.PORT || 3001}`;
const OWNER = 'blackdenum@gmail.com';
const auth = { Authorization: `Bearer ${signBookingCartJwt({ email: OWNER, name: 'Owner' }, { expiresIn: '2h' })}` };

const created = { screens: [], showtimes: [], rules: [], templates: [] };

async function call(action, body = {}, headers = auth) {
  const res = await fetch(`${BASE}/api/cinema?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

function fail(message) {
  console.error('FAILED:', message);
  process.exit(1);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function addDaysISO(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Saturday of the current week, so weekend rules definitely match. */
function saturdayISO() {
  const date = new Date();
  date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7 || 7));
  return date.toISOString().slice(0, 10);
}

async function cleanup(attractionId) {
  console.log('\nCleaning up the QA hall…');
  if (created.showtimes.length) {
    await query(`DELETE FROM bc_cinema_seat_states WHERE showtime_id = ANY($1::int[])`, [created.showtimes]);
    await query(`DELETE FROM bc_cinema_holds WHERE showtime_id = ANY($1::int[])`, [created.showtimes]);
    await query(`DELETE FROM bc_cinema_showtimes WHERE id = ANY($1::int[])`, [created.showtimes]);
  }
  if (created.screens.length) {
    await query(`DELETE FROM bc_cinema_layout_audit WHERE screen_id = ANY($1::int[])`, [created.screens]);
    await query(`DELETE FROM bc_cinema_layout_versions WHERE screen_id = ANY($1::int[])`, [created.screens]);
    await query(`DELETE FROM bc_cinema_seats WHERE screen_id = ANY($1::int[])`, [created.screens]);
    await query(`DELETE FROM bc_cinema_screens WHERE id = ANY($1::int[])`, [created.screens]);
  }
  if (created.rules.length) await query(`DELETE FROM bc_cinema_pricing_rules WHERE id = ANY($1::int[])`, [created.rules]);
  if (created.templates.length) await query(`DELETE FROM bc_cinema_layout_templates WHERE id = ANY($1::int[])`, [created.templates]);
  await query(`DELETE FROM bc_cinema_seat_types WHERE attraction_id = $1 AND slug = 'balcony'`, [attractionId]);
  await query(`DELETE FROM bc_cinema_layout_audit WHERE attraction_id = $1 AND action LIKE 'pricing-rule.%' AND created_at > NOW() - INTERVAL '10 minutes'`, [attractionId]);
  console.log('   done');
}

/** Delete anything an earlier run left behind when it stopped before its own cleanup. */
async function sweep(attractionId) {
  const stale = await query(
    `SELECT id FROM bc_cinema_screens WHERE attraction_id = $1 AND name LIKE 'QA Layout%'`,
    [attractionId]
  );
  const screenIds = stale.rows.map((row) => row.id);
  if (screenIds.length) {
    const shows = await query(`SELECT id FROM bc_cinema_showtimes WHERE screen_id = ANY($1::int[])`, [screenIds]);
    const showIds = shows.rows.map((row) => row.id);
    if (showIds.length) {
      await query(`DELETE FROM bc_cinema_seat_states WHERE showtime_id = ANY($1::int[])`, [showIds]);
      await query(`DELETE FROM bc_cinema_holds WHERE showtime_id = ANY($1::int[])`, [showIds]);
      await query(`DELETE FROM bc_cinema_showtimes WHERE id = ANY($1::int[])`, [showIds]);
    }
    await query(`DELETE FROM bc_cinema_layout_audit WHERE screen_id = ANY($1::int[])`, [screenIds]);
    await query(`DELETE FROM bc_cinema_layout_versions WHERE screen_id = ANY($1::int[])`, [screenIds]);
    await query(`DELETE FROM bc_cinema_seats WHERE screen_id = ANY($1::int[])`, [screenIds]);
    await query(`DELETE FROM bc_cinema_screens WHERE id = ANY($1::int[])`, [screenIds]);
  }
  await query(`DELETE FROM bc_cinema_seat_types WHERE attraction_id = $1 AND slug = 'balcony'`, [attractionId]);
  await query(`DELETE FROM bc_cinema_pricing_rules WHERE attraction_id = $1 AND name = 'QA weekend'`, [attractionId]);
  await query(`DELETE FROM bc_cinema_layout_templates WHERE attraction_id = $1 AND name = 'QA template'`, [attractionId]);
}

(async () => {
  // 1. The owner's cinema
  const mine = await call('my-cinemas', {});
  check(mine.json.ok && mine.json.cinemas?.length, `my-cinemas: ${JSON.stringify(mine.json).slice(0, 200)}`);
  const cinema = mine.json.cinemas.find((row) => row.role === 'owner') || mine.json.cinemas[0];
  const attractionId = cinema.id;
  console.log('1. cinema —', cinema.name, `(#${attractionId})`, 'role', cinema.role);
  await sweep(attractionId);

  const movies = await call('movies', { attractionId });
  const movie = (movies.json.movies || []).find((row) => row.status === 'active' && Number(row.durationMin) > 0);
  check(movie, 'no active movie with a runtime to schedule');

  // 2. A brand-new auditorium has no layout yet
  const screenRes = await call('screen-save', {
    attractionId,
    screen: { name: 'QA Layout Hall', screenType: 'standard', hallKind: 'standard', rowCount: 4, seatsPerRow: 6 },
  });
  check(screenRes.json.ok, `screen-save: ${JSON.stringify(screenRes.json)}`);
  const screenId = screenRes.json.screen.id;
  created.screens.push(screenId);
  console.log('2. auditorium created —', screenRes.json.screen.name, `(#${screenId})`, 'capacity', screenRes.json.screen.capacity);

  const empty = await call('screen-layout', { attractionId, screenId });
  check(empty.json.ok, `screen-layout: ${JSON.stringify(empty.json)}`);
  check(!empty.json.published && !empty.json.draft, 'a new hall must not already have a layout');
  check((empty.json.seatTypes || []).length >= 8, 'the default seat types must exist');
  console.log('   layout state — no draft, no published version,', empty.json.seatTypes.length, 'seat types');

  // 3. A custom seat type, then use it inside the layout
  const typeSave = await call('seat-type-save', {
    attractionId,
    seatType: {
      name: 'Balcony', baseCategory: 'premium', color: '#0ea5e9', icon: 'ph-star',
      defaultPrice: 45, multiplier: 1.4, admissions: 1, bookingMode: 'single', groupSize: 1,
    },
  });
  check(typeSave.json.ok, `seat-type-save: ${JSON.stringify(typeSave.json)}`);
  console.log('3. custom seat type —', typeSave.json.seatType.name, typeSave.json.seatType.slug, typeSave.json.seatType.defaultPrice);

  // 4. Save a draft: medium template + aisle + wheelchair/companion + blocked + couple pair + balcony row
  const base = L.layoutTemplates().find((entry) => entry.kind === 'medium').document;
  const lastRow = Array.from(new Set(base.seats.map((seat) => seat.row))).sort().pop();
  const seats = base.seats.map((seat) => {
    if (seat.row === lastRow && seat.number === 1) return { ...seat, category: 'wheelchair' };
    if (seat.row === lastRow && seat.number === 2) return { ...seat, category: 'companion' };
    if (seat.row === lastRow && seat.number === 3) return { ...seat, status: 'blocked' };
    if (seat.row === lastRow && seat.number === 4) return { ...seat, category: 'couple' };
    if (seat.row === lastRow && seat.number === 5) return { ...seat, category: 'couple' };
    return seat;
  });
  const lastY = Math.max(...base.seats.map((seat) => seat.y));
  for (let index = 0; index < 3; index += 1) {
    seats.push({
      id: `qa-balcony-${index + 1}`, row: 'K', number: index + 1, x: 9 + index, y: lastY + 1,
      category: 'balcony', status: 'available', priceOverride: null, label: '',
    });
  }
  const document = {
    ...base,
    cols: Math.max(base.cols, 12),
    screen: { position: 'bottom', width: 60, label: 'QA IMAX screen' },
    seats,
  };
  const draft = await call('layout-save', { attractionId, screenId, document, name: 'QA medium with balcony' });
  check(draft.json.ok, `layout-save: ${JSON.stringify(draft.json).slice(0, 300)}`);
  const draftId = draft.json.version.id;
  console.log('4. draft saved — v' + draft.json.version.version, 'seats', draft.json.validation.seatCount, 'capacity', draft.json.validation.capacity, 'warnings', draft.json.validation.warnings.length);

  // Invalid documents must be refused at publish time, not silently stored.
  const broken = await call('layout-save', {
    attractionId, screenId, versionId: draftId,
    document: { ...document, seats: [document.seats[0], { ...document.seats[1], number: document.seats[0].number, x: document.seats[0].x }] },
  });
  check(broken.json.ok, 'a broken draft can still be saved');
  const refused = await call('layout-publish', { attractionId, screenId, versionId: draftId });
  check(!refused.json.ok && refused.json.validation?.errors?.length, 'publishing duplicate seats must be refused');
  console.log('5. publish refused a document with', refused.json.validation.errors.length, 'error(s):', refused.json.validation.errors[0]);

  // Restore the good document and publish it.
  const redraft = await call('layout-save', { attractionId, screenId, versionId: draftId, document });
  check(redraft.json.ok, 'could not restore the valid draft');
  const published = await call('layout-publish', { attractionId, screenId, versionId: draftId });
  check(published.json.ok, `layout-publish: ${JSON.stringify(published.json).slice(0, 300)}`);
  console.log('6. published — v' + published.json.version.version, 'capacity', published.json.validation.capacity, 'seats', published.json.seats.length);

  const screens = await call('screens', { attractionId });
  const hall = screens.json.screens.find((row) => row.id === screenId);
  check(Number(hall.capacity) === published.json.validation.capacity, 'the hall must advertise the published capacity');
  check(Number(hall.layoutVersion) === Number(published.json.version.version), 'the hall must advertise the published version');
  console.log('   hall card — capacity', hall.capacity, 'layout v' + hall.layoutVersion, 'accessible', hall.accessibleSeats);

  // 6. Version history + restore
  const versions = await call('layout-versions', { attractionId, screenId });
  check(versions.json.ok && versions.json.versions.length >= 1, 'version history must list the published layout');
  const restore = await call('layout-restore', { attractionId, screenId, versionId: versions.json.versions[0].id });
  check(restore.json.ok, `layout-restore: ${JSON.stringify(restore.json).slice(0, 240)}`);
  console.log('7. restore — new draft v' + restore.json.version.version, 'from v' + restore.json.restoredFrom);

  const stateAfterRestore = await call('screen-layout', { attractionId, screenId });
  check(stateAfterRestore.json.draft && stateAfterRestore.json.published, 'both a draft and the published layout must exist');
  check(stateAfterRestore.json.published.id !== stateAfterRestore.json.draft.id, 'restoring must not overwrite the live layout');
  console.log('   live layout still v' + stateAfterRestore.json.published.version, '· draft v' + stateAfterRestore.json.draft.version);

  // 7. Duplicate the layout into a second auditorium
  const duplicate = await call('layout-duplicate', { attractionId, sourceScreenId: screenId, targetName: 'QA Layout Copy' });
  check(duplicate.json.ok, `layout-duplicate: ${JSON.stringify(duplicate.json).slice(0, 240)}`);
  const copyId = duplicate.json.screen.id;
  created.screens.push(copyId);
  const copyLayout = await call('screen-layout', { attractionId, screenId: copyId });
  const copySeats = copyLayout.json.draft?.document?.seats || copyLayout.json.published?.document?.seats || [];
  check(copySeats.length === document.seats.length, `the copy kept ${copySeats.length}/${document.seats.length} seats`);
  console.log('8. duplicate —', duplicate.json.screen.name, `(#${copyId})`, copySeats.length, 'seats copied');

  // 8. Pricing: a weekend rule, then the frozen snapshot preview
  const rule = await call('pricing-rule-save', {
    attractionId,
    rule: { name: 'QA weekend', scope: 'weekend', adjustment: 'multiplier', value: 1.5, priority: 1000, weekdays: [6, 7] },
  });
  check(rule.json.ok, `pricing-rule-save: ${JSON.stringify(rule.json)}`);
  created.rules.push(rule.json.rule.id);

  const saturday = saturdayISO();
  const preview = await call('pricing-preview', { attractionId, date: saturday, basePrice: 20 });
  check(preview.json.ok, `pricing-preview: ${JSON.stringify(preview.json)}`);
  const snapshot = preview.json.snapshot;
  check(snapshot.ruleName === 'QA weekend', `weekend rule did not win on ${saturday}`);
  check(snapshot.seatPrices.standard === 30, `standard should be 20 × 1.5 = 30, got ${snapshot.seatPrices.standard}`);
  check(snapshot.seatPrices.balcony === 67.5, `balcony should be 45 × 1.5 = 67.5, got ${snapshot.seatPrices.balcony}`);
  console.log('9. pricing —', saturday, 'standard', snapshot.seatPrices.standard, 'balcony', snapshot.seatPrices.balcony, 'rule', snapshot.ruleName);

  // 9. Schedule a screening on that Saturday; it must pin the published layout + snapshot
  const showtimeRes = await call('showtime-save', {
    attractionId,
    showtime: { screenId, movieId: movie.id, showDate: saturday, startTime: '18:30', basePrice: 20, format: '2D' },
  });
  check(showtimeRes.json.ok, `showtime-save: ${JSON.stringify(showtimeRes.json).slice(0, 300)}`);
  const showtime = showtimeRes.json.showtime;
  created.showtimes.push(showtime.id);
  check(Number(showtime.layoutVersionId) === Number(published.json.version.id), 'the screening must pin the published layout');
  check(showtime.pricingSnapshot?.ruleName === 'QA weekend', 'the screening must freeze the weekend prices');
  // Capacity counts saleable seats, so one blocked seat leaves 143 seats / 142 capacity.
  check(Number(showtime.seatsTotal) === published.json.seats.length, `seatsTotal ${showtime.seatsTotal} != ${published.json.seats.length} seats`);
  console.log('10. screening —', showtime.movieTitle, showtime.showDate, showtime.startTime, 'v' + showtime.layoutVersionId, 'seats', showtime.seatsTotal, 'rule', showtime.pricingSnapshot.ruleName);

  // 10. The public seat map renders the published layout
  const map = await call('seat-map', { showtimeId: showtime.id }, {});
  check(map.json.ok, `seat-map: ${JSON.stringify(map.json).slice(0, 200)}`);
  const layout = map.json.layout;
  check(layout, 'the customer seat map must carry the auditorium layout');
  check(layout.screen?.position === 'bottom' && layout.screen?.label === 'QA IMAX screen', 'screen position/label did not reach the customer map');
  check(layout.aisles?.length >= 1, 'aisles did not reach the customer map');
  const balcony = map.json.seats.filter((seat) => seat.category === 'balcony');
  const wheelchair = map.json.seats.find((seat) => seat.category === 'wheelchair');
  const blocked = map.json.seats.find((seat) => seat.status === 'blocked');
  check(balcony.length === 3, `expected 3 balcony seats, got ${balcony.length}`);
  check(balcony.every((seat) => seat.categoryColor === '#0ea5e9'), 'seat type colour missing from the map');
  check(balcony.every((seat) => seat.price === 67.5), `balcony seats should cost 67.5, got ${balcony.map((seat) => seat.price).join(',')}`);
  check(wheelchair?.accessible === true, 'wheelchair seats must be flagged accessible');
  check(blocked, 'the blocked seat must stay blocked');
  console.log('11. customer map —', map.json.seats.length, 'seats, aisles', layout.aisles.length, 'entrances', layout.entrances.length, 'categories', map.json.categories.map((entry) => entry.id).join('/'));

  // 11. Holds are per screening and race-safe
  const free = map.json.seats.filter((seat) => seat.status === 'available').slice(0, 2);
  check(free.length === 2, 'not enough free seats for the hold test');
  const [holdA, holdB] = await Promise.all([
    call('hold', { showtimeId: showtime.id, seatIds: [free[0].id], customerEmail: 'qa-a@example.com' }),
    call('hold', { showtimeId: showtime.id, seatIds: [free[0].id], customerEmail: 'qa-b@example.com' }),
  ]);
  const winners = [holdA, holdB].filter((entry) => entry.json.ok);
  check(winners.length === 1, `exactly one concurrent hold must win, got ${winners.length}`);
  console.log('12. concurrent holds — one won, one was refused:', [holdA, holdB].find((entry) => !entry.json.ok).json.error);

  const winner = winners[0].json.hold;
  const heldMap = await call('seat-map', { showtimeId: showtime.id }, {});
  check(heldMap.json.seats.find((seat) => seat.id === free[0].id).status === 'held', 'the held seat must show as held');
  const release = await call('release-hold', { holdRef: winner.holdRef });
  check(release.json.ok, `release-hold: ${JSON.stringify(release.json)}`);
  const releasedMap = await call('seat-map', { showtimeId: showtime.id }, {});
  check(releasedMap.json.seats.find((seat) => seat.id === free[0].id).status === 'available', 'a released seat must be sellable again');
  console.log('    hold released, seat is available again');

  // 12. A second screening of the same hall has its own inventory
  const otherRes = await call('showtime-save', {
    attractionId,
    showtime: { screenId, movieId: movie.id, showDate: addDaysISO(saturday, 1), startTime: '18:30', basePrice: 20, format: '2D' },
  });
  check(otherRes.json.ok, `second showtime: ${JSON.stringify(otherRes.json).slice(0, 240)}`);
  created.showtimes.push(otherRes.json.showtime.id);
  const otherHold = await call('hold', {
    showtimeId: otherRes.json.showtime.id, seatIds: [free[0].id], customerEmail: 'qa-c@example.com',
  });
  check(otherHold.json.ok, 'the same seat must be free at a different screening');
  const mapAfter = await call('seat-map', { showtimeId: showtime.id }, {});
  check(mapAfter.json.seats.find((seat) => seat.id === free[0].id).status === 'available', 'holding a seat at the other screening must not hold it here');
  console.log('13. screening inventory — the same seat is held at', addDaysISO(saturday, 1), 'and still free on', saturday);
  await call('release-hold', { holdRef: otherHold.json.hold.holdRef });

  // 13. Templates: built-in list + saving the hall as a reusable template
  const templateSave = await call('template-save', { attractionId, name: 'QA template', description: 'scratch check', document });
  check(templateSave.json.ok, `template-save: ${JSON.stringify(templateSave.json).slice(0, 240)}`);
  created.templates.push(templateSave.json.template.id);
  const templates = await call('layout-templates', { attractionId });
  check(templates.json.ok && templates.json.builtIn.length === 7 && templates.json.saved.some((row) => row.id === templateSave.json.template.id), 'saved templates must appear next to the built-ins');
  console.log('14. templates —', templates.json.builtIn.length, 'built-in,', templates.json.saved.length, 'saved');

  // 14. Owner scoping: another account cannot read this cinema
  const strangerToken = signBookingCartJwt({ email: 'qa-stranger@example.com', name: 'Stranger' }, { expiresIn: '1h' });
  const stranger = await call('screen-layout', { attractionId, screenId }, { Authorization: `Bearer ${strangerToken}` });
  check(!stranger.json.ok, 'a stranger must not read the layout');
  console.log('15. stranger refused:', stranger.status, stranger.json.error);

  // 15. Publishing a new layout keeps the old screening's seats intact
  const v1SeatIds = map.json.seats.map((seat) => seat.id).sort();
  const second = await call('layout-save', {
    attractionId, screenId,
    document: { ...document, seats: document.seats.filter((seat) => seat.category !== 'balcony') },
    name: 'QA medium without balcony',
  });
  check(second.json.ok, 'second draft save failed');
  const republished = await call('layout-publish', { attractionId, screenId, versionId: second.json.version.id });
  check(republished.json.ok, `second publish: ${JSON.stringify(republished.json).slice(0, 240)}`);
  const oldMap = await call('seat-map', { showtimeId: showtime.id }, {});
  check(
    JSON.stringify(oldMap.json.seats.map((seat) => seat.id).sort()) === JSON.stringify(v1SeatIds),
    'the existing screening lost its seats after the hall was republished'
  );
  check(oldMap.json.seats.some((seat) => seat.category === 'balcony'), 'the existing screening must keep its balcony seats');
  console.log('16. republish — the 18:30 screening still has all', oldMap.json.seats.length, 'of its own seats');

  const newShowtime = await call('showtime-save', {
    attractionId,
    showtime: { screenId, movieId: movie.id, showDate: saturday, startTime: '11:00', basePrice: 20, format: '2D' },
  });
  check(newShowtime.json.ok, `third showtime: ${JSON.stringify(newShowtime.json).slice(0, 240)}`);
  created.showtimes.push(newShowtime.json.showtime.id);
  check(Number(newShowtime.json.showtime.layoutVersionId) === Number(second.json.version.id), 'a new screening must adopt the new layout');
  console.log('    a screening scheduled afterwards uses v' + second.json.version.version);

  await cleanup(attractionId);
  console.log('\nDONE');
  process.exit(0);
})().catch(async (error) => {
  console.error('FAILED', error);
  try { await cleanup(0); } catch { /* best effort */ }
  process.exit(1);
});
