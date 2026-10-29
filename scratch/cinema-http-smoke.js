// scratch/cinema-http-smoke.js — HTTP end-to-end check for the cinema public API.
// Run: PORT=3101 node server.js &  then  node scratch/cinema-http-smoke.js
const BASE = `http://localhost:${process.env.PORT || 3101}/api/cinema`;

async function call(action, body = {}, method = 'POST') {
  const url = `${BASE}?action=${action}`;
  const res = method === 'GET'
    ? await fetch(url)
    : await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  // 1. Public listing
  const list = await call('cinemas', {}, 'GET');
  if (!list.json.ok) fail(`cinemas: ${JSON.stringify(list.json)}`);
  const cinema = (list.json.cinemas || []).find((c) => c.name === 'Sunset Cineplex');
  if (!cinema) fail(`Sunset Cineplex missing from ${JSON.stringify((list.json.cinemas || []).map((c) => c.name))}`);
  console.log('1. listing ok —', list.json.cinemas.length, 'cinema(s); demo =', cinema.id, cinema.name, cinema.city);

  // 2. Venue detail
  const detail = await call('cinema', { cinemaId: cinema.id });
  if (!detail.json.ok) fail(`cinema detail: ${JSON.stringify(detail.json)}`);
  const { screens, movies, showtimes, dates } = detail.json;
  console.log('2. detail ok — screens', screens.length, 'movies', movies.length, 'showtimes', showtimes.length, 'dates', dates.length);
  if (!showtimes.length) fail('no showtimes on the venue page');

  const showtime = showtimes[0];
  console.log('   first showtime', showtime.id, showtime.movieTitle, showtime.showDate, showtime.startTime, `${showtime.seatsSold}/${showtime.seatsTotal}`);

  // 3. Seat map
  const map = await call('seat-map', { showtimeId: showtime.id });
  if (!map.json.ok) fail(`seat-map: ${JSON.stringify(map.json)}`);
  const free = map.json.seats.filter((s) => s.status === 'available');
  if (free.length < 4) fail(`only ${free.length} free seats`);
  console.log('3. seat map ok —', map.json.seats.length, 'seats', JSON.stringify(map.json.stats));
  console.log('   categories', map.json.categories.map((c) => `${c.id}@${c.price}`).join(' '));

  const picks = [free[0], free[free.length - 1]];

  // 4. Hold
  const hold = await call('hold', { showtimeId: showtime.id, seatIds: picks.map((s) => s.id), customerEmail: 'http-smoke@example.com' });
  if (!hold.json.ok) fail(`hold: ${JSON.stringify(hold.json)}`);
  const holdRef = hold.json.hold.holdRef;
  console.log('4. hold ok —', holdRef, 'seats', picks.map((s) => s.label).join(','), 'total', hold.json.hold.total, hold.json.hold.currency, 'expires in', `${hold.json.hold.expiresInSeconds}s`);

  // 4b. Race: the same seats must be refused
  const race = await call('hold', { showtimeId: showtime.id, seatIds: [picks[0].id] });
  console.log('4b. double-book refused:', !race.json.ok, '—', race.json.error || '(no error text)');
  if (race.json.ok) fail('a second hold on the same seat succeeded');

  // 4c. Seat map reflects the hold
  const heldMap = await call('seat-map', { showtimeId: showtime.id });
  const heldStatus = picks.map((s) => heldMap.json.seats.find((x) => x.id === s.id)?.status);
  console.log('4c. seat states now', heldStatus.join(','));
  if (!heldStatus.every((s) => s === 'held' || s === 'sold')) fail('held seats not reflected in the map');

  // 5. Order
  const order = await call('create-order', {
    holdRef, customerName: 'HTTP Smoke', customerEmail: 'http-smoke@example.com', paymentMethod: 'venue',
  });
  if (!order.json.ok) fail(`create-order: ${JSON.stringify(order.json)}`);
  const bookingRef = order.json.order.bookingRef;
  console.log('5. order ok —', bookingRef, order.json.order.status, order.json.order.paymentStatus, order.json.order.total, order.json.order.currency);

  // 6. Public order lookup
  const lookup = await call('order', { ref: bookingRef });
  if (!lookup.json.ok) fail(`order lookup: ${JSON.stringify(lookup.json)}`);
  const seatCount = (lookup.json.order.seats || []).length;
  console.log('6. lookup ok —', lookup.json.order.status, 'seats', seatCount);

  // 7. Abandon releases the seats
  const abandon = await call('abandon', { ref: bookingRef });
  console.log('7. abandon ok —', JSON.stringify(abandon.json));
  const afterMap = await call('seat-map', { showtimeId: showtime.id });
  const released = picks.map((s) => afterMap.json.seats.find((x) => x.id === s.id)?.status);
  console.log('   seat states after abandon', released.join(','));
  if (!released.every((s) => s === 'available')) fail('seats were not released on abandon');

  // 8. Re-hold, then prove another showtime still sells the same seats
  const rehold = await call('hold', { showtimeId: showtime.id, seatIds: picks.map((s) => s.id), customerEmail: 'http-smoke@example.com' });
  if (!rehold.json.ok) fail(`re-hold after abandon: ${JSON.stringify(rehold.json)}`);
  console.log('8. re-hold ok —', rehold.json.hold.holdRef);

  const other = showtimes.find((s) => s.id !== showtime.id);
  if (other) {
    const otherMap = await call('seat-map', { showtimeId: other.id });
    const overlap = picks.map((s) => otherMap.json.seats.find((x) => x.id === s.id)?.status);
    console.log('   same seats at showtime', other.id, '=>', overlap.join(','));
    if (!overlap.every((s) => s === 'available')) fail('the same seat is not independently available at another showtime');
  }

  // 9. Malformed input guards
  const noSeats = await call('hold', { showtimeId: showtime.id, seatIds: [] });
  const badShow = await call('seat-map', { showtimeId: 999999 });
  console.log('9. guards — empty hold rejected:', noSeats.status, noSeats.json.ok === false, '| unknown showtime:', badShow.status, badShow.json.ok === false);

  // Clean up the hold we left behind
  await call('release-hold', { holdRef: rehold.json.hold.holdRef });

  console.log('\nDONE');
})().catch((error) => {
  console.error('FAILED', error);
  process.exit(1);
});
