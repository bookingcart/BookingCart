// scratch/cinema-owner-http.js — owner / box-office / scanner end-to-end check over HTTP.
// Run: node server.js (PORT=3001) &  then  node scratch/cinema-owner-http.js
require('dotenv').config();
const { signBookingCartJwt } = require('../lib/google-verify');

const BASE = `http://localhost:${process.env.PORT || 3001}`;
const OWNER = 'blackdenum@gmail.com';
const token = signBookingCartJwt({ email: OWNER, name: 'Owner' }, { expiresIn: '2h' });
const auth = { Authorization: `Bearer ${token}` };

async function call(action, body = {}, headers = auth, route = '/api/cinema') {
  const res = await fetch(`${BASE}${route}?action=${action}`, {
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

(async () => {
  // 1. Which cinemas can this account manage?
  const mine = await call('my-cinemas', {});
  if (!mine.json.ok) fail(`my-cinemas: ${JSON.stringify(mine.json)}`);
  const cinema = (mine.json.cinemas || []).find((row) => row.name === 'Sunset Cineplex');
  if (!cinema) fail(`Sunset Cineplex not in ${JSON.stringify(mine.json.cinemas)}`);
  const attractionId = cinema.id;
  console.log('1. my-cinemas ok —', cinema.name, 'role', cinema.role, 'screens', cinema.screens);

  // 2. Access + overview
  const access = await call('access', { attractionId });
  if (!access.json.ok) fail(`access: ${JSON.stringify(access.json)}`);
  console.log('2. access ok — role', access.json.role, 'multipliers', JSON.stringify(access.json.settings?.categoryMultipliers || {}).slice(0, 80));

  const overview = await call('overview', { attractionId });
  if (!overview.json.ok) fail(`overview: ${JSON.stringify(overview.json)}`);
  console.log('   overview — today', overview.json.todayShowtimes, 'upcoming', overview.json.upcomingShowtimes, 'revenue', JSON.stringify(overview.json.revenue));

  // 3. Catalogue
  const screens = await call('screens', { attractionId });
  const movies = await call('movies', { attractionId });
  const showtimes = await call('showtimes', { attractionId });
  console.log('3. catalogue — screens', screens.json.screens?.length, 'movies', movies.json.movies?.length, 'showtimes', showtimes.json.showtimes?.length);
  if (!screens.json.screens?.length) fail('no screens');

  const screen = screens.json.screens[0];
  const seats = await call('seats', { attractionId, screenId: screen.id });
  console.log('   screen', screen.name, screen.screenType, 'seats', seats.json.seats?.length);

  // 4. Box office: live screenings + admin seat map
  const pos = await call('pos-showtimes', { attractionId });
  if (!pos.json.ok) fail(`pos-showtimes: ${JSON.stringify(pos.json)}`);
  if (!pos.json.showtimes?.length) fail('no screenings available for the counter');
  const show = pos.json.showtimes[0];
  console.log('4. pos ok —', pos.json.showtimes.length, 'screening(s); first', show.id, show.movieTitle, show.showDate, show.startTime, `${show.seatsSold}/${show.seatsTotal}`);

  const adminMap = await call('pos-seat-map', { attractionId, showtimeId: show.id });
  if (!adminMap.json.ok) fail(`pos-seat-map: ${JSON.stringify(adminMap.json)}`);
  const free = adminMap.json.seats.filter((s) => s.status === 'available');
  if (!free.length) fail('no free seat for the counter sale');
  const seat = free[Math.floor(free.length / 2)];
  console.log('   admin map —', adminMap.json.seats.length, 'seats', JSON.stringify(adminMap.json.stats), 'picked', seat.label, seat.category, seat.price);

  // 5. Counter sale (cash) — same inventory as the website
  const sale = await call('pos-sell', {
    attractionId, showtimeId: show.id, seatIds: [seat.id],
    customerName: 'Counter Guest', paymentMethod: 'cash', reference: 'TILL-1',
  });
  if (!sale.json.ok) fail(`pos-sell: ${JSON.stringify(sale.json)}`);
  const sold = sale.json.order;
  console.log('5. pos-sell ok —', sold.bookingRef, sold.status, sold.paymentStatus, sold.total, sold.currency, 'tickets', sold.tickets.map((t) => `${t.ticketNo}/${t.seatLabel}`).join(' '));

  // 6. The website seat map must show the counter seat as sold immediately
  const publicMap = await call('seat-map', { showtimeId: show.id }, {}, '/api/cinema');
  const publicSeat = publicMap.json.seats.find((s) => s.id === seat.id);
  console.log('6. shared inventory — website sees', publicSeat.status);
  if (publicSeat.status !== 'sold') fail(`counter sale did not reach the website map (${publicSeat.status})`);

  // 7. Bookings list + detail
  const bookings = await call('bookings', { attractionId, limit: 20 });
  if (!bookings.json.ok) fail(`bookings: ${JSON.stringify(bookings.json)}`);
  const row = (bookings.json.bookings || []).find((b) => b.bookingRef === sold.bookingRef);
  if (!row) fail('counter sale missing from the bookings table');
  console.log('7. bookings ok —', bookings.json.bookings.length, 'row(s); counter sale present, summary', JSON.stringify(bookings.json.summary));

  const detail = await call('booking', { attractionId, ref: sold.bookingRef });
  console.log('   detail —', detail.json.order?.status, 'tickets', detail.json.order?.tickets?.length);

  // 8. QR validation: peek, admit, then refuse the duplicate
  const ticketNo = sold.tickets[0].ticketNo;
  const check = await call('validate', { attractionId, ticket: ticketNo }, auth, '/api/attraction-ticket-sales');
  console.log('8. scan peek —', check.json.outcome, '|', check.json.message);
  const admit = await call('admit', { attractionId, ticket: ticketNo }, auth, '/api/attraction-ticket-sales');
  console.log('   admit —', admit.json.outcome, '|', admit.json.message);
  const again = await call('admit', { attractionId, ticket: ticketNo }, auth, '/api/attraction-ticket-sales');
  console.log('   duplicate —', again.json.outcome, '|', again.json.message);
  if (again.json.outcome === 'admitted') fail('the same QR was admitted twice');

  // 9. Reports + CSV
  const reports = await call('reports', { attractionId, from: show.showDate, to: show.showDate });
  if (!reports.json.ok) fail(`reports: ${JSON.stringify(reports.json)}`);
  console.log('9. reports ok — movies', JSON.stringify(reports.json.byMovie), 'attendance', JSON.stringify(reports.json.attendance));
  const csvRes = await fetch(`${BASE}/api/cinema?action=report-export&attractionId=${attractionId}&tab=movies&from=${show.showDate}&to=${show.showDate}`, { headers: auth });
  const csv = await csvRes.text();
  console.log('   csv export —', csvRes.status, csvRes.headers.get('content-type'), csv.split('\n').length, 'line(s)');

  // 10. Settings round-trip
  const before = await call('settings', { attractionId });
  const saved = await call('settings-save', { attractionId, ...(before.json.settings || {}), cleaningMinutes: 20 });
  console.log('10. settings — save', saved.json.ok, 'cleaningMinutes', saved.json.settings?.cleaningMinutes);
  if (!saved.json.ok) fail(`settings-save: ${JSON.stringify(saved.json)}`);

  // 11. A guest may not reach the owner endpoints
  const anon = await call('overview', { attractionId }, {});
  console.log('11. anonymous owner call rejected:', anon.status, anon.json.ok === false);
  if (anon.json.ok) fail('overview answered an anonymous caller');

  console.log('\nDONE');
})().catch((error) => {
  console.error('FAILED', error);
  process.exit(1);
});
