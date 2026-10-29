// api-routes/cinema.js
// Cinema ticketing API.
//
//   Public  — discover cinemas, browse showtimes, read a live seat map, hold
//             seats, pay (card via Stripe, or pay-at-venue) and read a booking.
//   Owner   — screens, seat layouts, movies, showtimes, bookings, counter sales,
//             settings and reports. Scoped to a cinema the caller owns or staffs.
//
// Every price is recomputed by lib/cinema from the database, so a tampered
// request can never buy a VIP seat for the standard price.

const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { verifyRequestBearer } = require('../lib/google-verify');
const stripeLib = require('../lib/stripe');
const notificationHub = require('../lib/notification-hub');
const T = require('../lib/ticketing');
const C = require('../lib/cinema');

function resolveOrigin(req) {
  const configured = String(process.env.APP_URL || process.env.PUBLIC_URL || '').trim();
  if (/^https?:\/\//.test(configured)) return configured.replace(/\/+$/, '');
  const origin = req.headers.origin
    || (req.headers.host ? `http://${req.headers.host}` : 'http://localhost:5173');
  return String(origin).replace(/\/+$/, '');
}

function csvCell(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function toCsv(rows, columns) {
  const head = columns.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(','));
  return [head, ...body].join('\n');
}

async function startPaymentSession(req, order) {
  const configError = stripeLib.getStripeConfigError();
  if (configError) return { ok: false, status: 503, error: configError };

  const origin = resolveOrigin(req);
  const stripe = stripeLib.getStripeClient();
  const currency = String(order.currency || 'USD').toLowerCase();
  const amount = stripeLib.toStripeAmount(order.total, currency);
  if (amount < 50) return { ok: false, status: 400, error: 'This booking total is below the card minimum' };

  const successPath = `/attractions/cinemas/confirmation?ref=${encodeURIComponent(order.booking_ref)}`;
  const cancelPath = `/attractions/cinemas/seats/${order.cinema_showtime_id}?ref=${encodeURIComponent(order.booking_ref)}&canceled=1`;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card', 'link'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `${order.cinema_movie_title || 'Cinema'} — ${order.cinema_screen_name || 'Screen'}`.slice(0, 120),
                description: `${order.quantity_total} seat(s) · ${order.seat_labels} · ${T.isoDate(order.visit_date)} ${order.slot_label}`.slice(0, 300),
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        customer_email: order.customer_email || undefined,
        client_reference_id: order.booking_ref,
        metadata: {
          paymentPurpose: 'cinema_ticket',
          bookingRef: order.booking_ref,
          showtimeId: String(order.cinema_showtime_id),
          attractionId: String(order.attraction_id),
        },
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        success_url: `${origin}${successPath}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${cancelPath}`,
      },
      { idempotencyKey: `cinema-ticket-${order.booking_ref}` }
    );

    await query(
      `UPDATE bc_ticket_orders SET payment_ref = $2, payment_method = 'card', updated_at = NOW() WHERE id = $1`,
      [order.id, session.id]
    );
    return { ok: true, sessionId: session.id, url: session.url };
  } catch (error) {
    console.error('[cinema] Stripe session error:', error.message);
    return { ok: false, status: 502, error: 'Could not open the payment page. Please try again.' };
  }
}

/** Public cinema page: venue, screens, the next fortnight of screenings. */
async function publicCinemaPage(attractionId) {
  const cinema = await C.loadCinema(attractionId);
  if (!cinema) return { ok: false, status: 404, error: 'Cinema not found' };
  if (cinema.deleted) return { ok: false, status: 404, error: 'Cinema not found' };

  const screens = (await C.listScreens(attractionId)).filter((screen) => screen.status === 'active');
  const from = T.isoToday();
  const to = T.addDaysISO(from, 13);
  const showtimes = await C.listShowtimes({ attractionId, from, to });

  const movieIds = Array.from(new Set(showtimes.map((row) => row.movieId)));
  const movies = movieIds.length
    ? (await query(
        `SELECT * FROM bc_cinema_movies WHERE id = ANY($1::int[]) ORDER BY title ASC`,
        [movieIds]
      )).rows.map(C.mapMovie)
    : [];

  const dates = [];
  for (let index = 0; index < 14; index += 1) {
    const iso = T.addDaysISO(from, index);
    dates.push({
      date: iso,
      shows: showtimes.filter((row) => row.showDate === iso).length,
    });
  }

  return {
    ok: true,
    cinema: {
      id: cinema.id,
      name: cinema.name,
      city: cinema.city,
      country: cinema.country,
      address: cinema.location,
      description: cinema.description,
      image: cinema.featured_image,
      gallery: Array.isArray(cinema.gallery) ? cinema.gallery : [],
      currency: cinema.currency || 'USD',
      contact: cinema.contact || {},
      openingHours: cinema.opening_hours || {},
      amenities: Array.isArray(cinema.amenities) ? cinema.amenities : [],
    },
    screens: screens.map((screen) => ({
      id: screen.id, name: screen.name, screenType: screen.screenType, seatCount: screen.seatCount,
    })),
    movies,
    showtimes,
    dates,
  };
}

/** Movies playing anywhere on the platform, for the browse page hero strip. */
async function nowShowing() {
  const result = await query(
    `SELECT m.*, COUNT(sh.id)::int AS showings, MIN(sh.base_price) AS from_price
       FROM bc_cinema_movies m
       JOIN bc_cinema_showtimes sh ON sh.movie_id = m.id AND sh.status <> 'cancelled'
      WHERE m.status = 'active' AND sh.show_date >= CURRENT_DATE
        AND sh.show_date <= (CURRENT_DATE + INTERVAL '14 days')
      GROUP BY m.id
      ORDER BY showings DESC, m.title ASC
      LIMIT 12`
  );
  return result.rows.map((row) => ({
    ...C.mapMovie(row),
    showings: Number(row.showings || 0),
    fromPrice: row.from_price === null ? null : Number(row.from_price),
  }));
}

module.exports = async function cinemaHandler(req, res) {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let dbReady = false;
  try {
    if (isDbConfigured()) {
      await initDb();
      dbReady = true;
    }
  } catch (error) {
    console.warn('[cinema] DB unavailable:', error.message);
  }
  if (!dbReady) {
    return res.status(503).json({ ok: false, error: 'Cinema ticketing requires the database. Run the migrations first.' });
  }

  const body = req.method === 'GET' ? req.query : (req.body || {});
  const action = String(body.action || req.query.action || '').toLowerCase();
  const attractionId = T.toInt(body.attractionId || req.query.attractionId || body.cinemaId, 0);

  try {
    // ─── Public ──────────────────────────────────────────────────────────────

    if (action === 'cinemas' || action === '') {
      const cinemas = await C.listPublicCinemas({
        search: body.search || '',
        city: body.city || '',
        country: body.country || '',
        countryCode: body.countryCode || '',
      });
      return res.json({ ok: true, cinemas });
    }

    if (action === 'now-showing') {
      return res.json({ ok: true, movies: await nowShowing() });
    }

    if (action === 'cinema') {
      if (!attractionId) return res.status(400).json({ ok: false, error: 'cinemaId is required' });
      const page = await publicCinemaPage(attractionId);
      return page.ok ? res.json(page) : res.status(page.status || 400).json({ ok: false, error: page.error });
    }

    if (action === 'showtimes') {
      const showtimes = await C.listShowtimes({
        attractionId,
        from: body.date || body.from,
        to: body.date || body.to,
        movieId: T.toInt(body.movieId, 0),
      });
      return res.json({ ok: true, showtimes });
    }

    if (action === 'showtime' || action === 'seat-map') {
      const showtimeId = T.toInt(body.showtimeId || body.id, 0);
      if (!showtimeId) return res.status(400).json({ ok: false, error: 'showtimeId is required' });
      await C.releaseExpiredHolds();
      const map = await C.getSeatMap(showtimeId);
      return map.ok ? res.json(map) : res.status(map.status || 400).json({ ok: false, error: map.error });
    }

    if (action === 'hold') {
      const hold = await C.createHold({
        showtimeId: T.toInt(body.showtimeId, 0),
        seatIds: Array.isArray(body.seatIds) ? body.seatIds : [],
        customerEmail: String(body.customerEmail || '').trim().toLowerCase(),
      });
      return hold.ok ? res.json(hold) : res.status(hold.status || 400).json({ ok: false, error: hold.error, taken: hold.taken });
    }

    if (action === 'release-hold') {
      await C.releaseHold(body.holdRef, 'customer');
      return res.json({ ok: true });
    }

    // Returning from an abandoned card payment: give the seats straight back
    // instead of making everyone wait for the order to time out.
    if (action === 'abandon') {
      const order = await C.loadOrderByRef(body.ref || body.bookingRef || '');
      if (!order) return res.json({ ok: true });
      if (order.status === 'pending_payment' && order.payment_status !== 'paid') {
        await C.abandonOrder(order.id);
      }
      return res.json({ ok: true, status: order.status });
    }

    if (action === 'quote') {
      const quote = await quoteSeats({
        showtimeId: T.toInt(body.showtimeId, 0),
        seatIds: Array.isArray(body.seatIds) ? body.seatIds : [],
      });
      return quote.ok ? res.json(quote) : res.status(quote.status || 400).json({ ok: false, error: quote.error });
    }

    if (action === 'create-order') {
      const customerName = T.text(body.customerName || body.name, 120);
      if (customerName.length < 2) return res.status(400).json({ ok: false, error: 'Enter the lead customer name' });
      const customerEmail = String(body.customerEmail || body.email || '').trim().toLowerCase();
      if (!T.validEmail(customerEmail)) return res.status(400).json({ ok: false, error: 'Enter a valid email address' });
      const customerPhone = T.text(body.customerPhone || body.phone, 40);
      const paymentMethod = ['card', 'venue'].includes(String(body.paymentMethod || '').toLowerCase())
        ? String(body.paymentMethod).toLowerCase()
        : 'card';

      const created = await C.createOrder({
        holdRef: body.holdRef,
        customerName,
        customerEmail,
        customerPhone,
        notes: T.text(body.notes, 500),
        paymentMethod,
        channel: 'online',
      });
      if (!created.ok) return res.status(created.status || 400).json({ ok: false, error: created.error });

      if (paymentMethod === 'venue') {
        return res.json({
          ok: true,
          bookingRef: created.order.booking_ref,
          order: C.mapOrder(created.order),
          payment: { method: 'venue', url: `/attractions/cinemas/confirmation?ref=${encodeURIComponent(created.order.booking_ref)}` },
          message: `Seats held. Pay at the box office within ${Math.round((new Date(created.order.expires_at).getTime() - Date.now()) / 60000)} minutes to confirm.`,
        });
      }

      const payment = await startPaymentSession(req, created.order);
      if (!payment.ok) {
        await C.abandonOrder(created.order.id);
        return res.status(payment.status || 502).json({ ok: false, error: payment.error });
      }

      return res.json({
        ok: true,
        bookingRef: created.order.booking_ref,
        order: C.mapOrder(created.order),
        payment: { method: 'card', sessionId: payment.sessionId, url: payment.url },
      });
    }

    if (action === 'confirm') {
      const order = await C.loadOrderByRef(body.ref || body.bookingRef || '');
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });
      if (order.status === 'confirmed' && order.payment_status === 'paid') {
        return (await C.publicOrder(order.booking_ref)).ok
          ? res.json({ ...(await C.publicOrder(order.booking_ref)), alreadyConfirmed: true })
          : res.status(404).json({ ok: false, error: 'Booking not found' });
      }
      if (['cancelled', 'refunded', 'expired'].includes(order.status)) {
        return res.status(409).json({ ok: false, error: `This booking is ${order.status}` });
      }

      const sessionId = T.text(body.sessionId || body.session_id, 200);
      if (!sessionId) return res.status(400).json({ ok: false, error: 'A payment session is required' });

      const session = await stripeLib.verifyCheckoutSession(sessionId);
      if (!session.ok) return res.status(502).json({ ok: false, error: session.error });

      const refFromStripe = String(session.metadata?.bookingRef || '');
      if (refFromStripe && refFromStripe.toUpperCase() !== order.booking_ref.toUpperCase()) {
        return res.status(409).json({ ok: false, error: 'This payment belongs to a different booking' });
      }
      if (!session.paid) {
        return res.status(402).json({ ok: false, pending: true, error: 'Payment has not completed yet. Refresh in a moment.' });
      }
      const paidAmount = Number(session.amountTotal || 0) / (String(order.currency || 'USD').toLowerCase() === 'jpy' ? 1 : 100);
      if (paidAmount + 0.01 < Number(order.total || 0)) {
        return res.status(409).json({ ok: false, error: 'The amount paid does not match this booking' });
      }

      const confirmed = await C.confirmOrder(order.id, {
        paymentRef: sessionId,
        paymentMethod: 'card',
        actor: order.customer_email,
      });
      if (!confirmed.ok) return res.status(confirmed.status || 409).json({ ok: false, error: confirmed.error });
      return res.json(await C.publicOrder(order.booking_ref));
    }

    if (action === 'order') {
      const result = await C.publicOrder(body.ref || body.bookingRef || '');
      return result.ok ? res.json(result) : res.status(result.status || 404).json({ ok: false, error: result.error });
    }

    if (action === 'cancel') {
      const auth = await verifyRequestBearer(req);
      if (!auth.ok) return res.status(401).json({ ok: false, error: 'Sign in to cancel a booking' });
      const order = await C.loadOrderByRef(body.ref || body.bookingRef || '');
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });
      if (String(order.customer_email || '').toLowerCase() !== String(auth.email || '').toLowerCase()) {
        return res.status(403).json({ ok: false, error: 'This booking belongs to a different account' });
      }
      const result = await C.cancelBooking({
        ref: order.booking_ref,
        reason: T.text(body.reason, 300) || 'Cancelled by customer',
        actor: auth.email,
      });
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    if (action === 'my') {
      const auth = await verifyRequestBearer(req);
      if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });
      const result = await query(
        `SELECT o.*, (SELECT COUNT(*) FROM bc_attraction_tickets t WHERE t.order_id = o.id)::int AS tickets
           FROM bc_ticket_orders o
          WHERE LOWER(o.customer_email) = $1 AND o.cinema_showtime_id > 0
          ORDER BY o.visit_date DESC, o.created_at DESC
          LIMIT 60`,
        [String(auth.email).toLowerCase()]
      );
      const orders = [];
      for (const row of result.rows) {
        orders.push(C.mapOrder(row, await loadTickets(row.id)));
      }
      return res.json({ ok: true, orders });
    }

    // ─── Owner / staff ───────────────────────────────────────────────────────

    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });
    const email = String(auth.email || '').toLowerCase();

    if (action === 'my-cinemas') {
      // Only attractions the caller can work on *and* that are cinemas, so the
      // console never offers a museum a seat map.
      const result = await query(
        `SELECT p.id, p.name, p.city, p.country, p.status, p.featured_image, p.currency,
                CASE WHEN LOWER(BTRIM(COALESCE(p.owner_email, ''))) = $1 THEN 'owner' ELSE s.role END AS role,
                (SELECT COUNT(*) FROM bc_cinema_screens sc WHERE sc.attraction_id = p.id)::int AS screens
           FROM bc_attraction_profiles p
           LEFT JOIN bc_ticket_staff s
                  ON s.attraction_id = p.id AND LOWER(BTRIM(s.email)) = $1 AND s.status = 'active'
          WHERE p.deleted IS NOT TRUE
            AND LOWER(BTRIM(COALESCE(p.category, ''))) = 'cinema'
            AND (LOWER(BTRIM(COALESCE(p.owner_email, ''))) = $1 OR s.id IS NOT NULL)
          ORDER BY p.name ASC`,
        [email]
      );
      return res.json({ ok: true, cinemas: result.rows });
    }

    if (!attractionId) return res.status(400).json({ ok: false, error: 'attractionId is required' });

    // Read-only staff actions only need scanner access; everything that changes
    // the schedule, seating or money needs a manager.
    const READ_ACTIONS = new Set([
      'access', 'overview', 'screens', 'seats', 'movies', 'showtimes', 'bookings', 'booking',
      'reports', 'settings', 'seat-map-admin', 'pos-showtimes',
    ]);
    const need = READ_ACTIONS.has(action) ? 'scanner' : 'manager';
    const access = await C.requireAccess(email, attractionId, need);
    if (!access.ok) return res.status(access.status || 403).json({ ok: false, error: access.error });

    if (action === 'access') {
      const settings = await C.getCinemaSettings(attractionId);
      return res.json({
        ok: true,
        role: access.role,
        cinema: {
          id: access.attraction.id,
          name: access.attraction.name,
          city: access.attraction.city,
          currency: access.attraction.currency,
        },
        settings,
      });
    }

    if (action === 'overview') {
      return res.json({ ok: true, overview: await C.cinemaOverview(attractionId) });
    }

    if (action === 'screens') {
      return res.json({ ok: true, screens: await C.listScreens(attractionId) });
    }

    if (action === 'screen-save') {
      const result = await C.saveScreen(attractionId, email, body.screen || body);
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    if (action === 'screen-delete') {
      const result = await C.deleteScreen(attractionId, body.screenId || body.id);
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    if (action === 'seats') {
      const screenId = T.toInt(body.screenId, 0);
      if (!screenId) return res.status(400).json({ ok: false, error: 'screenId is required' });
      const owned = await query(
        `SELECT id FROM bc_cinema_screens WHERE id = $1 AND attraction_id = $2`,
        [screenId, attractionId]
      );
      if (!owned.rows.length) return res.status(404).json({ ok: false, error: 'Screen not found' });
      return res.json({ ok: true, seats: await C.listSeats(screenId) });
    }

    if (action === 'seats-save') {
      const result = await C.saveSeatLayout({
        attractionId,
        screenId: T.toInt(body.screenId, 0),
        seats: Array.isArray(body.seats) ? body.seats : [],
      });
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    if (action === 'movies') {
      return res.json({ ok: true, movies: await C.listMovies(email, { attractionId, includeArchived: Boolean(body.includeArchived) }) });
    }

    if (action === 'movie-save') {
      const result = await C.saveMovie(email, { ...(body.movie || body), attractionId });
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    if (action === 'movie-archive') {
      const result = await C.archiveMovie(email, body.movieId || body.id);
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    if (action === 'showtimes') {
      return res.json({
        ok: true,
        showtimes: await C.listShowtimes({
          attractionId,
          from: body.from || body.date || T.isoToday(),
          to: body.to,
          movieId: T.toInt(body.movieId, 0),
          includeCancelled: body.includeCancelled === true || body.includeCancelled === 'true',
        }),
      });
    }

    if (action === 'showtime-save') {
      const result = await C.saveShowtime(attractionId, email, body.showtime || body);
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    if (action === 'showtime-cancel') {
      const result = await C.cancelShowtime(attractionId, body.showtimeId || body.id, T.text(body.reason, 300));
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    if (action === 'seat-map-admin' || action === 'pos-seat-map') {
      const showtimeId = T.toInt(body.showtimeId || body.id, 0);
      const owned = await query(
        `SELECT id FROM bc_cinema_showtimes WHERE id = $1 AND attraction_id = $2`,
        [showtimeId, attractionId]
      );
      if (!owned.rows.length) return res.status(404).json({ ok: false, error: 'Showtime not found' });
      const map = await C.getSeatMap(showtimeId, { enforceSale: false });
      return map.ok ? res.json(map) : res.status(map.status || 400).json({ ok: false, error: map.error });
    }

    if (action === 'pos-showtimes') {
      return res.json({
        ok: true,
        showtimes: await C.listShowtimes({
          attractionId,
          from: T.isoToday(),
          to: T.addDaysISO(T.isoToday(), 2),
        }),
      });
    }

    if (action === 'pos-sell') {
      const seatIds = Array.isArray(body.seatIds) ? body.seatIds : [];
      const showtimeId = T.toInt(body.showtimeId, 0);
      const customerName = T.text(body.customerName, 120) || 'Walk-in customer';
      const customerEmail = String(body.customerEmail || '').trim().toLowerCase() || 'counter@bookingcart.local';
      const paymentMethod = ['cash', 'card', 'mobile'].includes(String(body.paymentMethod || '').toLowerCase())
        ? String(body.paymentMethod).toLowerCase()
        : 'cash';

      const hold = await C.createHold({ showtimeId, seatIds });
      if (!hold.ok) return res.status(hold.status || 400).json({ ok: false, error: hold.error });

      const created = await C.createOrder({
        holdRef: hold.hold.holdRef,
        customerName,
        customerEmail,
        customerPhone: T.text(body.customerPhone, 40),
        notes: `Counter sale by ${email}`,
        paymentMethod,
        channel: 'pos',
      });
      if (!created.ok) {
        await C.releaseHold(hold.hold.holdRef, 'pos');
        return res.status(created.status || 400).json({ ok: false, error: created.error });
      }

      const confirmed = await C.confirmOrder(created.order.id, {
        paymentMethod,
        paymentRef: `counter:${created.order.booking_ref}`,
        actor: email,
      });
      if (!confirmed.ok) return res.status(confirmed.status || 400).json({ ok: false, error: confirmed.error });

      const receipt = await C.publicOrder(created.order.booking_ref);
      return res.json({ ...receipt, ok: true, cashier: email });
    }

    if (action === 'bookings') {
      return res.json({
        ok: true,
        bookings: await C.listBookings({
          attractionId,
          from: body.from,
          to: body.to,
          movieId: T.toInt(body.movieId, 0),
          status: body.status || '',
          channel: body.channel || '',
          search: body.search || '',
          limit: T.toInt(body.limit, 100),
        }),
      });
    }

    if (action === 'booking') {
      const result = await C.publicOrder(body.ref || body.bookingRef || '');
      if (!result.ok) return res.status(result.status || 404).json({ ok: false, error: result.error });
      if (Number(result.order.attractionId) !== Number(attractionId)) {
        return res.status(403).json({ ok: false, error: 'This booking belongs to another cinema' });
      }
      return res.json(result);
    }

    if (action === 'booking-settle') {
      const result = await C.settleBooking({
        ref: body.ref || body.bookingRef || '',
        paymentMethod: ['cash', 'card', 'mobile'].includes(String(body.paymentMethod || '').toLowerCase())
          ? String(body.paymentMethod).toLowerCase()
          : 'cash',
        paymentRef: T.text(body.paymentRef, 120) || `counter:${Date.now()}`,
        actor: email,
      });
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    if (action === 'booking-resend') {
      const order = await C.loadOrderByRef(body.ref || body.bookingRef || '');
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });
      if (Number(order.attraction_id) !== Number(attractionId)) {
        return res.status(403).json({ ok: false, error: 'This booking belongs to another cinema' });
      }
      if (!order.customer_email) return res.status(400).json({ ok: false, error: 'This booking has no customer email' });

      const link = `${resolveOrigin(req)}/attractions/cinemas/confirmation?ref=${encodeURIComponent(order.booking_ref)}`;
      await notificationHub.dispatch({
        recipientId: order.customer_email,
        recipientEmail: order.customer_email,
        recipientPhone: order.customer_phone || '',
        type: 'PAYMENT_COMPLETED',
        title: `Your tickets for ${order.cinema_movie_title || 'the cinema'}`,
        message: `Booking ${order.booking_ref} · ${T.isoDate(order.visit_date)} ${order.slot_label || ''} · seats ${order.seat_labels || ''}. Show the QR code at the door.`,
        actionUrl: link,
        metadata: {
          bookingRef: order.booking_ref,
          movie: order.cinema_movie_title,
          date: T.isoDate(order.visit_date),
          time: order.slot_label,
          seats: order.seat_labels,
          total: order.total,
          currency: order.currency,
        },
      });
      return res.json({ ok: true, sentTo: order.customer_email });
    }

    if (action === 'booking-cancel') {
      const order = await C.loadOrderByRef(body.ref || body.bookingRef || '');
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });
      if (Number(order.attraction_id) !== Number(attractionId)) {
        return res.status(403).json({ ok: false, error: 'This booking belongs to another cinema' });
      }
      const result = await C.cancelBooking({
        ref: order.booking_ref,
        reason: T.text(body.reason, 300) || 'Cancelled by staff',
        actor: email,
      });
      return result.ok ? res.json(result) : res.status(result.status || 400).json({ ok: false, error: result.error });
    }

    if (action === 'settings') {
      return res.json({ ok: true, settings: await C.getCinemaSettings(attractionId) });
    }

    if (action === 'settings-save') {
      const settings = await C.saveCinemaSettings(attractionId, body.settings || body);
      return res.json({ ok: true, settings });
    }

    if (action === 'reports') {
      const report = await C.cinemaReport(attractionId, { from: body.from, to: body.to });
      return res.json({ ok: true, report });
    }

    if (action === 'report-export') {
      const report = await C.cinemaReport(attractionId, { from: body.from, to: body.to });
      const kind = String(body.report || 'movies');
      const columns = kind === 'category'
        ? [{ key: 'category', label: 'Seat category' }, { key: 'tickets', label: 'Tickets' }, { key: 'revenue', label: 'Revenue' }]
        : kind === 'channel'
          ? [{ key: 'channel', label: 'Channel' }, { key: 'bookings', label: 'Bookings' }, { key: 'revenue', label: 'Revenue' }]
          : [{ key: 'movie', label: 'Movie' }, { key: 'bookings', label: 'Bookings' }, { key: 'seats', label: 'Seats' }, { key: 'revenue', label: 'Revenue' }];
      const rows = kind === 'category' ? report.byCategory : kind === 'channel' ? report.channels : report.byMovie;
      const csv = toCsv(rows, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cinema-${kind}-${report.range.from}-to-${report.range.to}.csv"`);
      return res.send(csv);
    }

    return res.status(400).json({ ok: false, error: `Unknown cinema action "${action}"` });
  } catch (error) {
    console.error('[cinema] handler error:', error);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
};

async function loadTickets(orderId) {
  const result = await query(`SELECT * FROM bc_attraction_tickets WHERE order_id = $1 ORDER BY id ASC`, [orderId]);
  return result.rows;
}

/** Read-only price preview, so the checkout can show the exact server figure. */
async function quoteSeats({ showtimeId, seatIds }) {
  const map = await C.getSeatMap(showtimeId);
  if (!map.ok) return map;
  const ids = Array.from(new Set((Array.isArray(seatIds) ? seatIds : []).map((id) => T.toInt(id, 0)))).filter(Boolean);
  if (!ids.length) return { ok: false, status: 400, error: 'Select at least one seat' };
  if (ids.length > C.MAX_SEATS_PER_ORDER) {
    return { ok: false, status: 400, error: `You can book up to ${C.MAX_SEATS_PER_ORDER} seats at a time` };
  }

  const chosen = ids.map((id) => map.seats.find((seat) => seat.id === id)).filter(Boolean);
  if (chosen.length !== ids.length) return { ok: false, status: 400, error: 'Some seats are not in this screen' };
  const blocked = chosen.filter((seat) => seat.status !== 'available');
  if (blocked.length) {
    return {
      ok: false,
      status: 409,
      error: `Seat ${blocked.map((seat) => seat.label).join(', ')} is no longer available`,
      taken: blocked.map((seat) => seat.label),
    };
  }

  const subtotal = T.round2(chosen.reduce((sum, seat) => sum + Number(seat.price || 0), 0));
  const serviceFee = T.round2((subtotal * map.pricing.serviceFeePercent) / 100);
  const taxAmount = T.round2(((subtotal + serviceFee) * map.pricing.taxPercent) / 100);
  return {
    ok: true,
    quote: {
      showtimeId: map.showtime.id,
      seats: chosen.map((seat) => ({
        id: seat.id, label: seat.label, category: seat.category, categoryLabel: seat.categoryLabel,
        price: Number(seat.price || 0), admissions: seat.admissions,
      })),
      subtotal,
      serviceFee,
      taxAmount,
      total: T.round2(subtotal + serviceFee + taxAmount),
      currency: map.pricing.currency,
      admissionsTotal: chosen.reduce((sum, seat) => sum + Number(seat.admissions || 1), 0),
      serviceFeePercent: map.pricing.serviceFeePercent,
      taxPercent: map.pricing.taxPercent,
    },
  };
}
