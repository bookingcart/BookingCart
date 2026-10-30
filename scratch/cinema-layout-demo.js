// scratch/cinema-layout-demo.js — leaves one demo auditorium behind for
// browser checks of the layout editor and the customer seat map.
//
//   node scratch/cinema-layout-demo.js           create the hall + screening
//   node scratch/cinema-layout-demo.js cleanup   remove it again
require('dotenv').config();
const { signBookingCartJwt } = require('../lib/google-verify');
const L = require('../lib/cinema-layout');
const { query } = require('../lib/db');

const BASE = `http://localhost:${process.env.API_PORT || 3001}`;
const OWNER = 'blackdenum@gmail.com';
const auth = { Authorization: `Bearer ${signBookingCartJwt({ email: OWNER, name: 'Owner' }, { expiresIn: '2h' })}` };
const HALL = 'QA Demo Hall';

async function call(action, body = {}) {
  const res = await fetch(`${BASE}/api/cinema?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

function addDaysISO(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function ownerCinema() {
  const mine = await call('my-cinemas', {});
  const cinema = (mine.json.cinemas || []).find((row) => row.role === 'owner');
  if (!cinema) throw new Error('no owned cinema for this account');
  return cinema;
}

async function cleanup() {
  const screens = await query(`SELECT id FROM bc_cinema_screens WHERE name = $1`, [HALL]);
  const ids = screens.rows.map((row) => row.id);
  if (!ids.length) { console.log('nothing to clean up'); return; }
  const shows = await query(`SELECT id FROM bc_cinema_showtimes WHERE screen_id = ANY($1::int[])`, [ids]);
  const showIds = shows.rows.map((row) => row.id);
  if (showIds.length) {
    await query(`DELETE FROM bc_cinema_seat_states WHERE showtime_id = ANY($1::int[])`, [showIds]);
    await query(`DELETE FROM bc_cinema_holds WHERE showtime_id = ANY($1::int[])`, [showIds]);
    await query(`DELETE FROM bc_cinema_showtimes WHERE id = ANY($1::int[])`, [showIds]);
  }
  await query(`DELETE FROM bc_cinema_layout_audit WHERE screen_id = ANY($1::int[])`, [ids]);
  await query(`DELETE FROM bc_cinema_layout_versions WHERE screen_id = ANY($1::int[])`, [ids]);
  await query(`DELETE FROM bc_cinema_seats WHERE screen_id = ANY($1::int[])`, [ids]);
  await query(`DELETE FROM bc_cinema_screens WHERE id = ANY($1::int[])`, [ids]);
  console.log('removed the demo hall', ids.join(', '));
}

(async () => {
  if (process.argv[2] === 'cleanup') { await cleanup(); process.exit(0); }
  await cleanup();

  const cinema = await ownerCinema();
  const attractionId = cinema.id;
  const movies = await call('movies', { attractionId });
  const movie = (movies.json.movies || []).find((row) => row.status === 'active' && Number(row.durationMin) > 0);
  if (!movie) throw new Error('no active movie to schedule');

  const screenRes = await call('screen-save', {
    attractionId,
    screen: { name: HALL, screenType: 'standard', hallKind: 'imax', rowCount: 10, seatsPerRow: 14 },
  });
  if (!screenRes.json.ok) throw new Error(JSON.stringify(screenRes.json));
  const screenId = screenRes.json.screen.id;

  const base = L.layoutTemplates().find((entry) => entry.kind === 'medium').document;
  const rows = Array.from(new Set(base.seats.map((seat) => seat.row))).sort();
  const lastRow = rows[rows.length - 1];
  const seats = base.seats.map((seat) => {
    if (seat.row === 'C') return { ...seat, category: 'vip' };
    if (seat.row !== lastRow) return seat;
    if (seat.number === 1) return { ...seat, category: 'wheelchair' };
    if (seat.number === 2) return { ...seat, category: 'companion' };
    if (seat.number === 3) return { ...seat, status: 'blocked' };
    if (seat.number >= 4) return { ...seat, category: 'couple' };
    return seat;
  });
  const document = { ...base, screen: { position: 'bottom', width: 62, label: 'IMAX screen' }, seats };

  const draft = await call('layout-save', { attractionId, screenId, document, name: 'IMAX demo layout' });
  if (!draft.json.ok) throw new Error(JSON.stringify(draft.json).slice(0, 400));
  const published = await call('layout-publish', { attractionId, screenId, versionId: draft.json.version.id });
  if (!published.json.ok) throw new Error(JSON.stringify(published.json).slice(0, 400));

  const showDate = addDaysISO(new Date().toISOString().slice(0, 10), 1);
  const showtimeRes = await call('showtime-save', {
    attractionId,
    showtime: { screenId, movieId: movie.id, showDate, startTime: '19:00', basePrice: 15000, format: 'IMAX' },
  });
  if (!showtimeRes.json.ok) throw new Error(JSON.stringify(showtimeRes.json).slice(0, 400));

  console.log('cinema      ', cinema.name, `#${attractionId}`);
  console.log('auditorium  ', HALL, `#${screenId}`, 'v' + published.json.version.version, 'capacity', published.json.validation.capacity);
  console.log('screening   ', movie.title, showDate, '19:00', `#${showtimeRes.json.showtime.id}`);
  console.log('owner page  ', `http://127.0.0.1:3000/attraction-dashboard/cinema`);
  console.log('customer    ', `http://127.0.0.1:3000/attractions/cinemas/${attractionId}/seats/${showtimeRes.json.showtime.id}`);
  process.exit(0);
})().catch((error) => { console.error('FAILED', error.message); process.exit(1); });
