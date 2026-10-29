// scratch/cinema-smoke.js — domain-level end-to-end check for the cinema module.
// Run: node scratch/cinema-smoke.js
require('dotenv').config();
const { query } = require('../lib/db');
const C = require('../lib/cinema');
const T = require('../lib/ticketing');

const OWNER = 'blackdenum@gmail.com';

async function ensureCinema() {
  const found = await query(
    `SELECT * FROM bc_attraction_profiles WHERE LOWER(owner_email) = $1 AND category = 'Cinema' ORDER BY id LIMIT 1`,
    [OWNER]
  );
  if (found.rows.length) return found.rows[0];
  const created = await query(
    `INSERT INTO bc_attraction_profiles
       (owner_email, name, category, location, country, city, description, featured_image,
        gallery, tags, price, currency, duration, highlights, contact, opening_hours, amenities,
        status, completeness, views, bookings, deleted, created_at, updated_at)
     VALUES ($1,'Sunset Cineplex','Cinema','Kampala Road','Uganda','Kampala',
             'A three-screen cinema in the heart of Kampala showing new releases daily.',
             'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=80',
             '[]','["Cinema"]',0,'UGX','','[]','{"email":"box@sunsetcine.example","phone":"+256700000000"}',
             '{}','["Parking","Snack bar"]','published',90,0,0,false,NOW(),NOW())
     RETURNING *`,
    [OWNER]
  );
  return created.rows[0];
}

function layoutSeats() {
  const seats = [];
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  rows.forEach((row, rowIndex) => {
    for (let n = 1; n <= 12; n += 1) {
      let category = 'standard';
      if (rowIndex >= 2 && rowIndex <= 4) category = 'premium';
      if (rowIndex >= 5) category = 'vip';
      let status = 'available';
      if (row === 'H' && n >= 11) category = 'wheelchair';
      if (row === 'G' && (n === 5 || n === 6)) category = 'couple';
      if (row === 'D' && n === 12) status = 'blocked';
      seats.push({ row, number: n, category, status, x: n, y: rowIndex + 1 });
    }
  });
  return seats;
}

(async () => {
  const cinema = await ensureCinema();
  const attractionId = cinema.id;
  console.log('cinema', attractionId, cinema.name, cinema.status);

  // Clean slate for repeat runs.
  await query(`DELETE FROM bc_cinema_seat_states WHERE attraction_id = $1`, [attractionId]);
  await query(`DELETE FROM bc_cinema_holds WHERE attraction_id = $1`, [attractionId]);
  await query(`DELETE FROM bc_attraction_tickets WHERE attraction_id = $1 AND cinema_showtime_id > 0`, [attractionId]);
  await query(`DELETE FROM bc_ticket_orders WHERE attraction_id = $1 AND cinema_showtime_id > 0`, [attractionId]);
  await query(`DELETE FROM bc_cinema_showtimes WHERE attraction_id = $1`, [attractionId]);
  await query(`DELETE FROM bc_cinema_seats WHERE attraction_id = $1`, [attractionId]);
  await query(`DELETE FROM bc_cinema_screens WHERE attraction_id = $1`, [attractionId]);
  await query(`DELETE FROM bc_cinema_movies WHERE owner_email = $1 AND attraction_id = $2`, [OWNER, attractionId]);

  const screen = await C.saveScreen(attractionId, OWNER, {
    name: 'Screen 1', screenType: 'standard', rowCount: 8, seatsPerRow: 12,
  });
  if (!screen.ok) throw new Error(screen.error);
  console.log('screen', screen.screen.id);

  const layout = await C.saveSeatLayout({ attractionId, screenId: screen.screen.id, seats: layoutSeats() });
  if (!layout.ok) throw new Error(layout.error);
  console.log('seats saved', layout.seats.length);

  const movie = await C.saveMovie(OWNER, {
    attractionId, title: 'Neon Horizon', genre: 'Sci-Fi', durationMin: 128, ageRating: 'PG-13',
    language: 'English', format: '2D', releaseDate: T.isoToday(),
    posterUrl: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=600&q=80',
    synopsis: 'A courier discovers the city she delivers across is not the one she was born in.',
  });
  if (!movie.ok) throw new Error(movie.error);
  console.log('movie', movie.movie.id);

  const today = T.isoToday();
  const show = await C.saveShowtime(attractionId, OWNER, {
    screenId: screen.screen.id, movieId: movie.movie.id, showDate: today,
    startTime: '23:59', basePrice: 20000, status: 'on_sale',
  });
  if (!show.ok) throw new Error(show.error);
  console.log('showtime', show.showtime.id, show.showtime.startTime, show.showtime.endTime);

  const clash = await C.saveShowtime(attractionId, OWNER, {
    screenId: screen.screen.id, movieId: movie.movie.id, showDate: today,
    startTime: '23:59', basePrice: 20000,
  });
  console.log('overlap blocked:', !clash.ok, clash.error || '');

  const map = await C.getSeatMap(show.showtime.id);
  if (!map.ok) throw new Error(map.error);
  console.log('seat map', map.seats.length, JSON.stringify(map.stats), 'categories', map.categories.map((c) => `${c.id}:${c.price}`).join(' '));

  const vipSeat = map.seats.find((seat) => seat.category === 'vip');
  const coupleSeat = map.seats.find((seat) => seat.category === 'couple');
  console.log('vip price', vipSeat.price, 'couple price', coupleSeat.price, 'couple admits', coupleSeat.admissions);

  const holdA = await C.createHold({ showtimeId: show.showtime.id, seatIds: [vipSeat.id, coupleSeat.id] });
  if (!holdA.ok) throw new Error(holdA.error);
  console.log('hold', holdA.hold.holdRef, holdA.hold.subtotal, holdA.hold.total, 'expires in', holdA.hold.expiresInSeconds);

  const holdB = await C.createHold({ showtimeId: show.showtime.id, seatIds: [vipSeat.id] });
  console.log('double-book blocked:', !holdB.ok, holdB.error || '');

  const order = await C.createOrder({
    holdRef: holdA.hold.holdRef, customerName: 'Amina Test', customerEmail: 'amina@example.com',
    paymentMethod: 'venue',
  });
  if (!order.ok) throw new Error(order.error);
  console.log('order', order.order.booking_ref, order.order.status, order.order.total, order.order.seat_labels);

  const settled = await C.settleBooking({ ref: order.order.booking_ref, paymentMethod: 'cash', actor: OWNER });
  if (!settled.ok) throw new Error(settled.error);
  console.log('settled', settled.order.status, settled.order.paymentStatus, 'tickets', settled.order.tickets.map((t) => `${t.ticketNo}/${t.seatLabel}`).join(' '));

  const after = await C.getSeatMap(show.showtime.id);
  console.log('after sale stats', JSON.stringify(after.stats));

  // Second showtime must still be able to sell the same seats.
  const show2 = await C.saveShowtime(attractionId, OWNER, {
    screenId: screen.screen.id, movieId: movie.movie.id, showDate: T.addDaysISO(today, 1),
    startTime: '18:00', basePrice: 20000, status: 'on_sale',
  });
  if (!show2.ok) throw new Error(show2.error);
  const map2 = await C.getSeatMap(show2.showtime.id);
  console.log('next day same seat available:', map2.seats.find((s) => s.id === vipSeat.id)?.status);

  const overview = await C.cinemaOverview(attractionId);
  console.log('overview', JSON.stringify(overview));

  const report = await C.cinemaReport(attractionId, { from: today, to: today });
  console.log('report movies', JSON.stringify(report.byMovie), 'attendance', JSON.stringify(report.attendance));

  console.log('\nDONE');
  process.exit(0);
})().catch((error) => {
  console.error('FAILED', error);
  process.exit(1);
});
