// lib/cinema.js
// Cinema ticketing domain: screens, permanent seats, movies, showtimes, seat
// maps, temporary holds and the seat-level checkout.
//
// Two invariants drive the whole file:
//   1. A seat is a permanent row in bc_cinema_seats; what it is *doing* for one
//      screening lives in bc_cinema_seat_states, keyed by (showtime, seat). That
//      key is what makes it impossible to sell the same seat twice.
//   2. Money is always recomputed here from the database. The browser only ever
//      sends seat ids, never prices.
//
// Orders and tickets reuse bc_ticket_orders / bc_attraction_tickets so the
// existing confirmation emails, QR validation desk, printing and reports work
// for cinema seats without a second implementation.

'use strict';

const crypto = require('crypto');
const { query, withTransaction } = require('./db');
const notificationHub = require('./notification-hub');
const T = require('./ticketing');

const SEAT_CATEGORIES = ['standard', 'premium', 'vip', 'couple', 'recliner', 'wheelchair', 'companion'];
const SEAT_CATEGORY_LABELS = {
  standard: 'Standard',
  premium: 'Premium',
  vip: 'VIP',
  couple: 'Couple',
  recliner: 'Recliner',
  wheelchair: 'Wheelchair space',
  companion: 'Companion',
};
// Multipliers applied to the showtime base price when a seat has no override.
const DEFAULT_CATEGORY_MULTIPLIERS = {
  standard: 1,
  premium: 1.3,
  vip: 1.7,
  couple: 2,
  recliner: 1.5,
  wheelchair: 1,
  companion: 0.5,
};
// A couple seat admits two people; everything else admits one.
const CATEGORY_ADMISSIONS = { couple: 2 };

const SCREEN_TYPES = ['standard', 'imax', '3d', 'vip', 'dolby', '4dx'];
const SHOWTIME_STATUSES = ['scheduled', 'on_sale', 'cancelled', 'completed'];
const MAX_SEATS_PER_ORDER = 12;
const HOLD_MAX_MINUTES = 30;
const ORDER_TTL_MINUTES = 30;

// ─── Small helpers ───────────────────────────────────────────────────────────

function isTimeHHMM(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function addMinutesHHMM(time, minutes) {
  const [hours, mins] = String(time || '00:00').split(':').map((part) => T.toInt(part, 0));
  const total = hours * 60 + mins + T.toInt(minutes, 0);
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

function isoDateOf(value) {
  return T.isoDate(value);
}

/** Showtimes are stored as UTC built from the venue's wall clock so ordering and
 *  overlap checks never depend on the server's timezone. */
function stampFor(dateISO, timeHHMM) {
  return new Date(`${dateISO}T${isTimeHHMM(timeHHMM) ? timeHHMM : '00:00'}:00Z`);
}

function money(value) {
  return T.round2(Number(value) || 0);
}

function categoryLabel(category) {
  return SEAT_CATEGORY_LABELS[category] || SEAT_CATEGORY_LABELS.standard;
}

function seatKey(rowLabel, seatNo) {
  return `${String(rowLabel || '').toUpperCase()}${T.toInt(seatNo, 0)}`;
}

function newHoldRef() {
  return `CH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// ─── Access ──────────────────────────────────────────────────────────────────

/**
 * Cinema actions ride on the attraction staff model: owners and cinema staff
 * (manager / scanner) only. There is no wildcard, so one cinema can never read
 * another's schedule.
 */
async function requireAccess(email, attractionId, need = 'manager') {
  const access = await T.resolveAccess(email, attractionId);
  if (!access.ok) return access;
  if (!T.roleAllows(access.role, need)) {
    return { ok: false, status: 403, error: `This action requires the ${need} role` };
  }
  return access;
}

// ─── Settings ────────────────────────────────────────────────────────────────

const DEFAULT_CINEMA_SETTINGS = {
  hold_minutes: 10,
  service_fee_percent: 3,
  tax_percent: 0,
  refund_window_hours: 24,
  cancellation_fee_percent: 0,
  allow_online: true,
  allow_pay_at_venue: true,
  cleaning_minutes: 15,
  category_prices: DEFAULT_CATEGORY_MULTIPLIERS,
};

async function getCinemaSettings(attractionId) {
  const id = T.toInt(attractionId, 0);
  await query(
    `INSERT INTO bc_cinema_settings (attraction_id) VALUES ($1) ON CONFLICT (attraction_id) DO NOTHING`,
    [id]
  );
  const result = await query(`SELECT * FROM bc_cinema_settings WHERE attraction_id = $1`, [id]);
  const row = result.rows[0] || {};
  const stored = row.category_prices && typeof row.category_prices === 'object' ? row.category_prices : {};
  return {
    attractionId: id,
    holdMinutes: clampHold(row.hold_minutes),
    serviceFeePercent: Number(row.service_fee_percent ?? DEFAULT_CINEMA_SETTINGS.service_fee_percent),
    taxPercent: Number(row.tax_percent ?? 0),
    refundWindowHours: Number(row.refund_window_hours ?? 24),
    cancellationFeePercent: Number(row.cancellation_fee_percent ?? 0),
    allowOnline: row.allow_online !== false,
    allowPayAtVenue: row.allow_pay_at_venue !== false,
    cleaningMinutes: T.toInt(row.cleaning_minutes, 15),
    categoryPrices: { ...DEFAULT_CATEGORY_MULTIPLIERS, ...stored },
  };
}

function clampHold(value) {
  const minutes = T.toInt(value, 10);
  if (!minutes) return 10;
  return Math.min(HOLD_MAX_MINUTES, Math.max(3, minutes));
}

async function saveCinemaSettings(attractionId, input = {}) {
  const current = await getCinemaSettings(attractionId);
  const next = {
    hold_minutes: clampHold(input.holdMinutes ?? current.holdMinutes),
    service_fee_percent: Math.min(30, Math.max(0, Number(input.serviceFeePercent ?? current.serviceFeePercent) || 0)),
    tax_percent: Math.min(50, Math.max(0, Number(input.taxPercent ?? current.taxPercent) || 0)),
    refund_window_hours: Math.min(720, Math.max(0, T.toInt(input.refundWindowHours ?? current.refundWindowHours, 24))),
    cancellation_fee_percent: Math.min(100, Math.max(0, Number(input.cancellationFeePercent ?? current.cancellationFeePercent) || 0)),
    allow_online: input.allowOnline === undefined ? current.allowOnline : Boolean(input.allowOnline),
    allow_pay_at_venue: input.allowPayAtVenue === undefined ? current.allowPayAtVenue : Boolean(input.allowPayAtVenue),
    cleaning_minutes: Math.min(90, Math.max(0, T.toInt(input.cleaningMinutes ?? current.cleaningMinutes, 15))),
  };

  const prices = { ...current.categoryPrices };
  if (input.categoryPrices && typeof input.categoryPrices === 'object') {
    for (const category of SEAT_CATEGORIES) {
      const value = Number(input.categoryPrices[category]);
      if (Number.isFinite(value) && value >= 0) prices[category] = Math.min(10, value);
    }
  }

  await query(
    `UPDATE bc_cinema_settings
        SET hold_minutes = $2, service_fee_percent = $3, tax_percent = $4,
            refund_window_hours = $5, cancellation_fee_percent = $6,
            allow_online = $7, allow_pay_at_venue = $8, cleaning_minutes = $9,
            category_prices = $10, updated_at = NOW()
      WHERE attraction_id = $1`,
    [
      T.toInt(attractionId, 0), next.hold_minutes, next.service_fee_percent, next.tax_percent,
      next.refund_window_hours, next.cancellation_fee_percent, next.allow_online,
      next.allow_pay_at_venue, next.cleaning_minutes, JSON.stringify(prices),
    ]
  );
  return getCinemaSettings(attractionId);
}

// ─── Cinemas (attraction listings) ───────────────────────────────────────────

/** Public list of cinemas that actually have a screen configured. */
async function listPublicCinemas({ search = '', city = '' } = {}) {
  const term = String(search || '').trim().toLowerCase();
  const place = String(city || '').trim();
  const params = [];
  const where = [`p.deleted IS NOT TRUE`, `p.status IN ('published', 'approved')`];

  if (term) {
    params.push(`%${term}%`);
    where.push(`(LOWER(p.name) LIKE $${params.length} OR LOWER(p.city) LIKE $${params.length} OR LOWER(COALESCE(p.country, '')) LIKE $${params.length})`);
  }
  if (place) {
    params.push(place);
    where.push(`LOWER(p.city) = LOWER($${params.length})`);
  }

  const result = await query(
    `SELECT p.id, p.name, p.city, p.country, p.location, p.description, p.featured_image,
            p.currency, p.contact, p.opening_hours, p.amenities,
            (SELECT COUNT(*) FROM bc_cinema_screens s WHERE s.attraction_id = p.id AND s.status = 'active')::int AS screens,
            (SELECT COUNT(*) FROM bc_cinema_showtimes sh
              WHERE sh.attraction_id = p.id AND sh.status <> 'cancelled' AND sh.show_date >= CURRENT_DATE)::int AS upcoming_showtimes,
            (SELECT MIN(sh.base_price) FROM bc_cinema_showtimes sh
              WHERE sh.attraction_id = p.id AND sh.status <> 'cancelled' AND sh.show_date >= CURRENT_DATE AND sh.base_price > 0) AS from_price
       FROM bc_attraction_profiles p
      WHERE ${where.join(' AND ')}
        AND EXISTS (SELECT 1 FROM bc_cinema_screens s WHERE s.attraction_id = p.id)
      ORDER BY p.name ASC
      LIMIT 60`,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city,
    country: row.country,
    location: row.location,
    description: row.description,
    image: row.featured_image,
    currency: row.currency || 'USD',
    contact: row.contact || {},
    openingHours: row.opening_hours || {},
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    screens: Number(row.screens || 0),
    upcomingShowtimes: Number(row.upcoming_showtimes || 0),
    fromPrice: row.from_price === null ? null : Number(row.from_price),
  }));
}

async function loadCinema(attractionId) {
  const result = await query(
    `SELECT * FROM bc_attraction_profiles WHERE id = $1 AND deleted IS NOT TRUE LIMIT 1`,
    [T.toInt(attractionId, 0)]
  );
  return result.rows[0] || null;
}

// ─── Screens ─────────────────────────────────────────────────────────────────

function mapScreen(row) {
  return {
    id: row.id,
    attractionId: row.attraction_id,
    name: row.name,
    screenType: row.screen_type,
    rowCount: Number(row.row_count || 0),
    seatsPerRow: Number(row.seats_per_row || 0),
    features: row.features && typeof row.features === 'object' ? row.features : {},
    accessibleSeats: Number(row.accessible_seats || 0),
    status: row.status,
    seatCount: row.seat_count === undefined ? undefined : Number(row.seat_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listScreens(attractionId) {
  const result = await query(
    `SELECT s.*, (SELECT COUNT(*) FROM bc_cinema_seats st WHERE st.screen_id = s.id)::int AS seat_count
       FROM bc_cinema_screens s
      WHERE s.attraction_id = $1
      ORDER BY s.sort_order ASC, s.id ASC`,
    [T.toInt(attractionId, 0)]
  );
  return result.rows.map(mapScreen);
}

async function saveScreen(attractionId, ownerEmail, input = {}) {
  const id = T.toInt(input.id, 0);
  const name = T.text(input.name, 60);
  if (name.length < 1) return { ok: false, status: 400, error: 'Give the screen a name or number' };

  const screenType = SCREEN_TYPES.includes(input.screenType) ? input.screenType : 'standard';
  const rowCount = Math.min(30, Math.max(1, T.toInt(input.rowCount, 8)));
  const seatsPerRow = Math.min(40, Math.max(1, T.toInt(input.seatsPerRow, 12)));
  const features = input.features && typeof input.features === 'object' ? input.features : {};
  const status = input.status === 'inactive' ? 'inactive' : 'active';

  if (id) {
    const existing = await query(
      `SELECT id FROM bc_cinema_screens WHERE id = $1 AND attraction_id = $2`,
      [id, T.toInt(attractionId, 0)]
    );
    if (!existing.rows.length) return { ok: false, status: 404, error: 'Screen not found' };
    const updated = await query(
      `UPDATE bc_cinema_screens
          SET name = $3, screen_type = $4, row_count = $5, seats_per_row = $6,
              features = $7, status = $8, updated_at = NOW()
        WHERE id = $1 AND attraction_id = $2
        RETURNING *`,
      [id, T.toInt(attractionId, 0), name, screenType, rowCount, seatsPerRow, JSON.stringify(features), status]
    );
    return { ok: true, screen: mapScreen(updated.rows[0]) };
  }

  const inserted = await query(
    `INSERT INTO bc_cinema_screens
       (attraction_id, owner_email, name, screen_type, row_count, seats_per_row, features, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [T.toInt(attractionId, 0), String(ownerEmail || '').toLowerCase(), name, screenType, rowCount, seatsPerRow,
      JSON.stringify(features), status]
  );
  return { ok: true, screen: mapScreen(inserted.rows[0]) };
}

async function deleteScreen(attractionId, screenId) {
  const id = T.toInt(screenId, 0);
  const used = await query(
    `SELECT
       (SELECT COUNT(*) FROM bc_cinema_showtimes sh WHERE sh.screen_id = $1)::int AS showtimes,
       (SELECT COUNT(*) FROM bc_cinema_seat_states st WHERE st.seat_id IN
          (SELECT id FROM bc_cinema_seats WHERE screen_id = $1) AND st.status = 'sold')::int AS sold`,
    [id]
  );
  const counts = used.rows[0] || {};
  if (Number(counts.sold) > 0) {
    return { ok: false, status: 409, error: 'This screen has sold tickets, so it can only be deactivated.' };
  }
  if (Number(counts.showtimes) > 0) {
    return { ok: false, status: 409, error: 'This screen still has scheduled showtimes. Cancel them or deactivate the screen.' };
  }
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM bc_cinema_seats WHERE screen_id = $1`, [id]);
    await client.query(`DELETE FROM bc_cinema_screens WHERE id = $1 AND attraction_id = $2`, [id, T.toInt(attractionId, 0)]);
  });
  return { ok: true };
}

// ─── Seat layout ─────────────────────────────────────────────────────────────

function mapSeat(row) {
  return {
    id: row.id,
    screenId: row.screen_id,
    label: row.seat_key,
    row: row.row_label,
    number: Number(row.seat_no),
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    x: Number(row.x || 0),
    y: Number(row.y || 0),
    priceOverride: row.price_override === null ? null : Number(row.price_override),
    status: row.status,
  };
}

async function listSeats(screenId) {
  const result = await query(
    `SELECT * FROM bc_cinema_seats WHERE screen_id = $1 ORDER BY y ASC, x ASC, seat_no ASC`,
    [T.toInt(screenId, 0)]
  );
  return result.rows.map(mapSeat);
}

/**
 * Replace the seat layout of one screen. Blocked or custom-positioned seats are
 * supported because the layout arrives as explicit seats rather than a rectangle.
 */
async function saveSeatLayout({ attractionId, screenId, seats }) {
  const screen = await query(
    `SELECT * FROM bc_cinema_screens WHERE id = $1 AND attraction_id = $2`,
    [T.toInt(screenId, 0), T.toInt(attractionId, 0)]
  );
  if (!screen.rows.length) return { ok: false, status: 404, error: 'Screen not found' };
  if (!Array.isArray(seats) || !seats.length) {
    return { ok: false, status: 400, error: 'Add at least one seat to the layout' };
  }
  if (seats.length > 800) {
    return { ok: false, status: 400, error: 'A screen cannot hold more than 800 seats' };
  }

  const busy = await query(
    `SELECT COUNT(*)::int AS locked
       FROM bc_cinema_seat_states st
       JOIN bc_cinema_seats s ON s.id = st.seat_id
      WHERE s.screen_id = $1 AND st.status IN ('sold', 'held')`,
    [T.toInt(screenId, 0)]
  );
  if (Number(busy.rows[0]?.locked || 0) > 0) {
    return {
      ok: false,
      status: 409,
      error: 'Tickets are already sold or held in this screen. Deactivate it and create a new screen to change the layout.',
    };
  }

  const seen = new Set();
  const clean = [];
  for (const seat of seats) {
    const row = String(seat.row || '').trim().toUpperCase().slice(0, 4);
    const number = T.toInt(seat.number ?? seat.no, 0);
    if (!row || number < 1) continue;
    const key = seatKey(row, number);
    if (seen.has(key)) return { ok: false, status: 400, error: `Seat ${key} appears twice in the layout` };
    seen.add(key);
    clean.push({
      row,
      number,
      key,
      category: SEAT_CATEGORIES.includes(seat.category) ? seat.category : 'standard',
      status: ['available', 'blocked', 'out_of_service'].includes(seat.status) ? seat.status : 'available',
      x: Math.max(0, T.toInt(seat.x, number)),
      y: Math.max(0, T.toInt(seat.y, row.charCodeAt(0) - 64)),
      priceOverride: seat.priceOverride === null || seat.priceOverride === undefined || seat.priceOverride === ''
        ? null
        : Math.max(0, Number(seat.priceOverride) || 0),
    });
  }
  if (!clean.length) return { ok: false, status: 400, error: 'None of the seats had a valid row and number' };

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM bc_cinema_seats WHERE screen_id = $1`, [T.toInt(screenId, 0)]);
    for (const seat of clean) {
      await client.query(
        `INSERT INTO bc_cinema_seats
           (screen_id, attraction_id, row_label, seat_no, seat_key, category, x, y, price_override, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [T.toInt(screenId, 0), T.toInt(attractionId, 0), seat.row, seat.number, seat.key,
          seat.category, seat.x, seat.y, seat.priceOverride, seat.status]
      );
    }
    const rowCount = new Set(clean.map((seat) => seat.row)).size;
    const accessible = clean.filter((seat) => seat.category === 'wheelchair').length;
    await client.query(
      `UPDATE bc_cinema_screens
          SET row_count = $2, seats_per_row = $3, accessible_seats = $4, updated_at = NOW()
        WHERE id = $1`,
      [T.toInt(screenId, 0), rowCount, Math.max(...clean.map((seat) => seat.x)), accessible]
    );
  });

  return { ok: true, seats: await listSeats(screenId) };
}

// ─── Movies ──────────────────────────────────────────────────────────────────

function mapMovie(row) {
  return {
    id: row.id,
    attractionId: Number(row.attraction_id || 0),
    title: row.title,
    posterUrl: row.poster_url,
    backdropUrl: row.backdrop_url,
    synopsis: row.synopsis,
    genre: row.genre,
    durationMin: Number(row.duration_min || 0),
    ageRating: row.age_rating,
    language: row.language,
    subtitles: row.subtitles,
    releaseDate: row.release_date ? T.isoDate(row.release_date) : '',
    director: row.director,
    castList: row.cast_list,
    format: row.format,
    trailerUrl: row.trailer_url,
    status: row.status,
  };
}

async function listMovies(ownerEmail, { attractionId = 0, includeArchived = false } = {}) {
  const params = [String(ownerEmail || '').toLowerCase()];
  let scope = '';
  if (attractionId) {
    params.push(T.toInt(attractionId, 0));
    scope = ` AND (m.attraction_id = 0 OR m.attraction_id = $${params.length})`;
  }
  const status = includeArchived ? `1 = 1` : `m.status = 'active'`;
  const result = await query(
    `SELECT m.* FROM bc_cinema_movies m
      WHERE LOWER(BTRIM(m.owner_email)) = $1${scope} AND ${status}
      ORDER BY m.created_at DESC`,
    params
  );
  return result.rows.map(mapMovie);
}

async function saveMovie(ownerEmail, input = {}) {
  const title = T.text(input.title, 140);
  if (title.length < 1) return { ok: false, status: 400, error: 'A movie needs a title' };

  const fields = {
    attraction_id: T.toInt(input.attractionId, 0),
    title,
    poster_url: T.text(input.posterUrl, 500),
    backdrop_url: T.text(input.backdropUrl, 500),
    synopsis: T.text(input.synopsis, 2000),
    genre: T.text(input.genre, 120),
    duration_min: Math.min(600, Math.max(0, T.toInt(input.durationMin, 0))),
    age_rating: T.text(input.ageRating, 20),
    language: T.text(input.language, 60),
    subtitles: T.text(input.subtitles, 120),
    release_date: T.isDateISO(input.releaseDate) ? input.releaseDate : null,
    director: T.text(input.director, 120),
    cast_list: T.text(input.castList, 500),
    format: T.text(input.format, 20) || '2D',
    trailer_url: T.text(input.trailerUrl, 500),
    status: input.status === 'inactive' ? 'inactive' : 'active',
  };

  const id = T.toInt(input.id, 0);
  const email = String(ownerEmail || '').toLowerCase();

  if (id) {
    const own = await query(`SELECT id FROM bc_cinema_movies WHERE id = $1 AND LOWER(BTRIM(owner_email)) = $2`, [id, email]);
    if (!own.rows.length) return { ok: false, status: 404, error: 'Movie not found' };
    const updated = await query(
      `UPDATE bc_cinema_movies SET
         attraction_id = $3, title = $4, poster_url = COALESCE($5, ''), backdrop_url = COALESCE($6, ''),
         synopsis = COALESCE($7, ''), genre = COALESCE($8, ''), duration_min = $9,
         age_rating = COALESCE($10, ''), language = COALESCE($11, ''), subtitles = COALESCE($12, ''),
         release_date = $13, director = COALESCE($14, ''), cast_list = COALESCE($15, ''),
         format = COALESCE($16, '2D'), trailer_url = COALESCE($17, ''), status = $18, updated_at = NOW()
       WHERE id = $1 AND LOWER(BTRIM(owner_email)) = $2
       RETURNING *`,
      [id, email, fields.attraction_id, fields.title, fields.poster_url, fields.backdrop_url,
        fields.synopsis, fields.genre, fields.duration_min, fields.age_rating, fields.language,
        fields.subtitles, fields.release_date, fields.director, fields.cast_list, fields.format,
        fields.trailer_url, fields.status]
    );
    return { ok: true, movie: mapMovie(updated.rows[0]) };
  }

  const inserted = await query(
    `INSERT INTO bc_cinema_movies
       (owner_email, attraction_id, title, poster_url, backdrop_url, synopsis, genre, duration_min,
        age_rating, language, subtitles, release_date, director, cast_list, format, trailer_url, status)
     VALUES ($1,$2,$3,COALESCE($4, ''),COALESCE($5, ''),COALESCE($6, ''),COALESCE($7, ''),$8,
             COALESCE($9, ''),COALESCE($10, ''),COALESCE($11, ''),$12,
             COALESCE($13, ''),COALESCE($14, ''),COALESCE($15, '2D'),COALESCE($16, ''),$17)
     RETURNING *`,
    [email, fields.attraction_id, fields.title, fields.poster_url, fields.backdrop_url, fields.synopsis,
      fields.genre, fields.duration_min, fields.age_rating, fields.language, fields.subtitles,
      fields.release_date, fields.director, fields.cast_list, fields.format, fields.trailer_url, fields.status]
  );
  return { ok: true, movie: mapMovie(inserted.rows[0]) };
}

async function archiveMovie(ownerEmail, movieId) {
  const used = await query(
    `SELECT COUNT(*)::int AS upcoming FROM bc_cinema_showtimes
      WHERE movie_id = $1 AND status <> 'cancelled' AND starts_at >= NOW()`,
    [T.toInt(movieId, 0)]
  );
  if (Number(used.rows[0]?.upcoming || 0) > 0) {
    return { ok: false, status: 409, error: 'This movie still has upcoming showings. Cancel them first.' };
  }
  await query(
    `UPDATE bc_cinema_movies SET status = 'inactive', updated_at = NOW()
      WHERE id = $1 AND LOWER(BTRIM(owner_email)) = $2`,
    [T.toInt(movieId, 0), String(ownerEmail || '').toLowerCase()]
  );
  return { ok: true };
}

// ─── Showtimes ───────────────────────────────────────────────────────────────

function mapShowtime(row) {
  return {
    id: row.id,
    attractionId: Number(row.attraction_id),
    screenId: Number(row.screen_id),
    screenName: row.screen_name || '',
    screenType: row.screen_type || 'standard',
    movieId: Number(row.movie_id),
    movieTitle: row.movie_title || '',
    posterUrl: row.poster_url || '',
    durationMin: Number(row.duration_min || 0),
    format: row.format || '2D',
    ageRating: row.age_rating || '',
    showDate: row.show_date ? T.isoDate(row.show_date) : '',
    startTime: row.start_time || '',
    endTime: row.end_time || '',
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    salesOpenAt: row.sales_open_at,
    salesCloseAt: row.sales_close_at,
    basePrice: Number(row.base_price || 0),
    currency: row.currency || 'USD',
    status: row.status,
    notes: row.notes || '',
    seatsTotal: row.seats_total === undefined ? undefined : Number(row.seats_total || 0),
    seatsSold: row.seats_sold === undefined ? undefined : Number(row.seats_sold || 0),
  };
}

const SHOWTIME_SELECT = `
  SELECT sh.*, sc.name AS screen_name, sc.screen_type,
         mv.title AS movie_title, mv.poster_url, mv.duration_min, mv.format, mv.age_rating,
         (SELECT COUNT(*) FROM bc_cinema_seats st WHERE st.screen_id = sh.screen_id)::int AS seats_total,
         (SELECT COUNT(*) FROM bc_cinema_seat_states ss
            WHERE ss.showtime_id = sh.id AND ss.status = 'sold')::int AS seats_sold
    FROM bc_cinema_showtimes sh
    LEFT JOIN bc_cinema_screens sc ON sc.id = sh.screen_id
    LEFT JOIN bc_cinema_movies mv ON mv.id = sh.movie_id
`;

async function listShowtimes({ attractionId = 0, from = '', to = '', movieId = 0, includeCancelled = false }) {
  const params = [T.isoDate(from || T.isoToday())];
  const where = [`sh.show_date >= $1::date`];
  if (attractionId) { params.push(T.toInt(attractionId, 0)); where.push(`sh.attraction_id = $${params.length}`); }
  if (T.isDateISO(to)) { params.push(to); where.push(`sh.show_date <= $${params.length}::date`); }
  if (movieId) { params.push(T.toInt(movieId, 0)); where.push(`sh.movie_id = $${params.length}`); }
  if (!includeCancelled) where.push(`sh.status <> 'cancelled'`);

  const result = await query(
    `${SHOWTIME_SELECT} WHERE ${where.join(' AND ')} ORDER BY sh.show_date ASC, sh.start_time ASC LIMIT 400`,
    params
  );
  return result.rows.map(mapShowtime);
}

async function loadShowtime(showtimeId) {
  const result = await query(`${SHOWTIME_SELECT} WHERE sh.id = $1 LIMIT 1`, [T.toInt(showtimeId, 0)]);
  if (!result.rows.length) return null;
  const row = result.rows[0];
  row.end_time = addMinutesHHMM(row.start_time, row.duration_min);
  return row;
}

/**
 * Schedule a screening. Two screenings may not overlap on one screen once the
 * cleaning window is taken into account, and a screening may not be published
 * until the screen has seats and the movie has a duration.
 */
async function saveShowtime(attractionId, ownerEmail, input = {}) {
  const id = T.toInt(input.id, 0);
  const screenId = T.toInt(input.screenId, 0);
  const movieId = T.toInt(input.movieId, 0);
  const showDate = T.isDateISO(input.showDate) ? input.showDate : '';
  const startTime = isTimeHHMM(input.startTime) ? input.startTime : '';

  if (!screenId) return { ok: false, status: 400, error: 'Choose a screen' };
  if (!movieId) return { ok: false, status: 400, error: 'Choose a movie' };
  if (!showDate) return { ok: false, status: 400, error: 'Choose a screening date' };
  if (!startTime) return { ok: false, status: 400, error: 'Choose a start time in HH:MM format' };

  const screen = await query(
    `SELECT * FROM bc_cinema_screens WHERE id = $1 AND attraction_id = $2`,
    [screenId, T.toInt(attractionId, 0)]
  );
  if (!screen.rows.length) return { ok: false, status: 404, error: 'Screen not found for this cinema' };
  if (screen.rows[0].status !== 'active') return { ok: false, status: 409, error: 'This screen is deactivated' };

  const seatCount = await query(`SELECT COUNT(*)::int AS n FROM bc_cinema_seats WHERE screen_id = $1`, [screenId]);
  if (Number(seatCount.rows[0]?.n || 0) < 1) {
    return { ok: false, status: 409, error: 'Configure the seat layout for this screen before scheduling it' };
  }

  const movie = await query(
    `SELECT * FROM bc_cinema_movies WHERE id = $1 AND LOWER(BTRIM(owner_email)) = $2`,
    [movieId, String(ownerEmail || '').toLowerCase()]
  );
  if (!movie.rows.length) return { ok: false, status: 404, error: 'Movie not found' };
  const durationMin = Number(movie.rows[0].duration_min || 0);
  if (durationMin < 1) return { ok: false, status: 409, error: 'Set the movie duration before scheduling it' };

  const settings = await getCinemaSettings(attractionId);
  const cinema = await loadCinema(attractionId);
  const currency = String(cinema?.currency || 'USD').toUpperCase();
  const basePrice = Math.max(0, Number(input.basePrice) || 0);

  const startsAt = stampFor(showDate, startTime);
  const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000);

  // Overlap check, including the cleaning / turnaround window on both sides.
  const buffer = settings.cleaningMinutes;
  const clash = await query(
    `SELECT id, show_date, start_time FROM bc_cinema_showtimes
      WHERE screen_id = $1
        AND status <> 'cancelled'
        AND id <> $2
        AND starts_at < ($4::timestamptz + ($5::int * INTERVAL '1 minute'))
        AND ends_at > ($3::timestamptz - ($5::int * INTERVAL '1 minute'))
      LIMIT 1`,
    [screenId, id, startsAt.toISOString(), endsAt.toISOString(), buffer]
  );
  if (clash.rows.length) {
    return {
      ok: false,
      status: 409,
      error: `This screen is busy at ${clash.rows[0].start_time} on ${T.isoDate(clash.rows[0].show_date)} (turnaround ${buffer} min included).`,
    };
  }

  const salesOpenAt = isTimeHHMM(input.salesOpenTime)
    ? stampFor(showDate, input.salesOpenTime)
    : null;
  const salesCloseAt = isTimeHHMM(input.salesCloseTime)
    ? stampFor(showDate, input.salesCloseTime)
    : startsAt;
  const status = SHOWTIME_STATUSES.includes(input.status) ? input.status : 'on_sale';
  const notes = T.text(input.notes, 400);

  if (id) {
    const own = await query(
      `SELECT id FROM bc_cinema_showtimes WHERE id = $1 AND attraction_id = $2`,
      [id, T.toInt(attractionId, 0)]
    );
    if (!own.rows.length) return { ok: false, status: 404, error: 'Showtime not found' };
    const updated = await query(
      `UPDATE bc_cinema_showtimes SET
         screen_id = $3, movie_id = $4, show_date = $5, start_time = $6, starts_at = $7, ends_at = $8,
         sales_open_at = $9, sales_close_at = $10, base_price = $11, currency = $12, status = $13,
         notes = COALESCE($14, ''), updated_at = NOW()
       WHERE id = $1 AND attraction_id = $2
       RETURNING id`,
      [id, T.toInt(attractionId, 0), screenId, movieId, showDate, startTime, startsAt.toISOString(),
        endsAt.toISOString(), salesOpenAt ? salesOpenAt.toISOString() : null,
        salesCloseAt ? salesCloseAt.toISOString() : null, basePrice, currency, status, notes]
    );
    return { ok: true, showtime: mapShowtime(await loadShowtime(updated.rows[0].id)) };
  }

  try {
    const inserted = await query(
      `INSERT INTO bc_cinema_showtimes
         (attraction_id, screen_id, movie_id, owner_email, show_date, start_time, starts_at, ends_at,
          sales_open_at, sales_close_at, base_price, currency, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14, ''))
       RETURNING id`,
      [T.toInt(attractionId, 0), screenId, movieId, String(ownerEmail || '').toLowerCase(), showDate,
        startTime, startsAt.toISOString(), endsAt.toISOString(),
        salesOpenAt ? salesOpenAt.toISOString() : null, salesCloseAt ? salesCloseAt.toISOString() : null,
        basePrice, currency, status, notes]
    );
    return { ok: true, showtime: mapShowtime(await loadShowtime(inserted.rows[0].id)) };
  } catch (error) {
    if (String(error.message || '').includes('uniq_cinema_showtime_slot')) {
      return { ok: false, status: 409, error: 'A screening already starts at that exact time on this screen.' };
    }
    throw error;
  }
}

async function cancelShowtime(attractionId, showtimeId, reason = '') {
  const id = T.toInt(showtimeId, 0);
  const sold = await query(
    `SELECT COUNT(*)::int AS sold FROM bc_cinema_seat_states WHERE showtime_id = $1 AND status = 'sold'`,
    [id]
  );
  if (Number(sold.rows[0]?.sold || 0) > 0) {
    return {
      ok: false,
      status: 409,
      error: 'Tickets are already sold for this screening. Refund those bookings before cancelling the showtime.',
    };
  }
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE bc_cinema_showtimes SET status = 'cancelled', notes = COALESCE($3, ''), updated_at = NOW()
        WHERE id = $1 AND attraction_id = $2`,
      [id, T.toInt(attractionId, 0), T.text(reason, 400)]
    );
    await client.query(`DELETE FROM bc_cinema_seat_states WHERE showtime_id = $1`, [id]);
  });
  return { ok: true };
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

function priceForSeat(seat, showtime, settings) {
  if (seat.price_override !== null && seat.price_override !== undefined) {
    return money(seat.price_override);
  }
  const multiplier = Number(settings.categoryPrices?.[seat.category] ?? DEFAULT_CATEGORY_MULTIPLIERS[seat.category] ?? 1);
  return money(Number(showtime.base_price || 0) * multiplier);
}

function admissionsForSeat(seat) {
  return CATEGORY_ADMISSIONS[seat.category] || 1;
}

function buildTotals(lines, settings) {
  const subtotal = money(lines.reduce((sum, line) => sum + line.price, 0));
  const serviceFee = money((subtotal * Number(settings.serviceFeePercent || 0)) / 100);
  const taxAmount = money(((subtotal + serviceFee) * Number(settings.taxPercent || 0)) / 100);
  const total = money(subtotal + serviceFee + taxAmount);
  const admissionsTotal = lines.reduce((sum, line) => sum + line.admissions, 0);
  return { subtotal, serviceFee, taxAmount, total, admissionsTotal };
}

async function loadShowtimeForSale(showtimeId) {
  const row = await loadShowtime(showtimeId);
  if (!row) return { ok: false, status: 404, error: 'Screening not found' };
  if (row.status === 'cancelled') return { ok: false, status: 409, error: 'This screening was cancelled' };
  if (row.status === 'completed') return { ok: false, status: 409, error: 'This screening has finished' };

  const now = Date.now();
  if (row.sales_open_at && now < new Date(row.sales_open_at).getTime()) {
    return { ok: false, status: 409, error: 'Ticket sales for this screening have not opened yet' };
  }
  if (row.sales_close_at && now > new Date(row.sales_close_at).getTime()) {
    return { ok: false, status: 409, error: 'Ticket sales for this screening have closed' };
  }
  if (now > new Date(row.ends_at).getTime()) {
    return { ok: false, status: 409, error: 'This screening has already started and finished' };
  }
  return { ok: true, showtime: row };
}

// ─── Seat map ────────────────────────────────────────────────────────────────

/**
 * Public seat map for one screening: every physical seat, decorated with the
 * state it is in for *this* showtime only.
 */
async function getSeatMap(showtimeId, { enforceSale = true } = {}) {
  const row = await loadShowtime(showtimeId);
  if (!row) return { ok: false, status: 404, error: 'Screening not found' };

  const found = enforceSale
    ? await loadShowtimeForSale(showtimeId)
    : { ok: true, showtime: row };
  if (!found.ok) return found;
  const showtime = found.showtime;

  const settings = await getCinemaSettings(showtime.attraction_id);
  const seatsRes = await query(
    `SELECT * FROM bc_cinema_seats WHERE screen_id = $1 ORDER BY y ASC, x ASC, seat_no ASC`,
    [showtime.screen_id]
  );
  const statesRes = await query(
    `SELECT seat_id, status, expires_at, price FROM bc_cinema_seat_states WHERE showtime_id = $1`,
    [showtime.id]
  );

  const nowMs = Date.now();
  const stateBySeat = new Map();
  for (const state of statesRes.rows) {
    const expired = state.expires_at && new Date(state.expires_at).getTime() < nowMs && state.status === 'held';
    stateBySeat.set(Number(state.seat_id), expired ? { status: 'available' } : state);
  }

  const seats = seatsRes.rows.map((seat) => {
    const mapped = mapSeat(seat);
    const state = stateBySeat.get(mapped.id);
    let status = 'available';
    if (seat.status === 'blocked') status = 'blocked';
    else if (seat.status === 'out_of_service') status = 'unavailable';
    else if (state?.status === 'sold') status = 'sold';
    else if (state?.status === 'held') status = 'held';
    else if (state?.status === 'blocked') status = 'blocked';
    mapped.status = status;
    mapped.price = state?.status === 'sold'
      ? money(state.price)
      : priceForSeat(seat, showtime, settings);
    mapped.admissions = admissionsForSeat(seat);
    return mapped;
  });

  const rows = [];
  const rowIndex = new Map();
  for (const seat of seats) {
    if (!rowIndex.has(seat.row)) {
      rowIndex.set(seat.row, { label: seat.row, seats: [] });
      rows.push(rowIndex.get(seat.row));
    }
    rowIndex.get(seat.row).seats.push(seat);
  }

  const stats = {
    total: seats.length,
    sold: seats.filter((seat) => seat.status === 'sold').length,
    held: seats.filter((seat) => seat.status === 'held').length,
    blocked: seats.filter((seat) => seat.status === 'blocked' || seat.status === 'unavailable').length,
    available: seats.filter((seat) => seat.status === 'available').length,
  };

  const categories = SEAT_CATEGORIES
    .map((category) => ({
      id: category,
      label: categoryLabel(category),
      count: seats.filter((seat) => seat.category === category).length,
      price: priceForSeat({ category, price_override: null }, showtime, settings),
    }))
    .filter((entry) => entry.count > 0);

  const cinema = await loadCinema(showtime.attraction_id);

  return {
    ok: true,
    showtime: {
      ...mapShowtime(showtime),
      cinemaId: Number(showtime.attraction_id),
      cinemaName: cinema?.name || '',
      cinemaCity: cinema?.city || '',
      cinemaAddress: cinema?.location || '',
    },
    rows,
    seats,
    stats,
    categories,
    pricing: {
      currency: showtime.currency || 'USD',
      serviceFeePercent: settings.serviceFeePercent,
      taxPercent: settings.taxPercent,
      maxSeats: MAX_SEATS_PER_ORDER,
    },
    holdMinutes: settings.holdMinutes,
    allowPayAtVenue: settings.allowPayAtVenue,
    allowOnline: settings.allowOnline,
  };
}

// ─── Holds ───────────────────────────────────────────────────────────────────

async function releaseExpiredHolds() {
  await query(
    `DELETE FROM bc_cinema_seat_states s
      USING bc_ticket_orders o
      WHERE s.order_id = o.id
        AND o.status = 'pending_payment'
        AND o.expires_at IS NOT NULL
        AND o.expires_at < NOW()`
  );
  await query(
    `UPDATE bc_ticket_orders SET status = 'expired', updated_at = NOW()
      WHERE status = 'pending_payment' AND cinema_showtime_id > 0
        AND expires_at IS NOT NULL AND expires_at < NOW()`
  );
  await query(
    `DELETE FROM bc_cinema_seat_states
      WHERE status = 'held' AND expires_at IS NOT NULL AND expires_at < NOW()`
  );
  await query(
    `UPDATE bc_cinema_holds SET status = 'expired' WHERE status = 'active' AND expires_at < NOW()`
  );
}

/**
 * Claim seats for the checkout window. The showtime row is locked for the length
 * of the transaction, so two customers racing for seat B5 are serialised and the
 * second one is told exactly which seats went.
 */
async function createHold({ showtimeId, seatIds, customerEmail = '' }) {
  const ids = Array.from(new Set((Array.isArray(seatIds) ? seatIds : []).map((id) => T.toInt(id, 0)))).filter(Boolean);
  if (!ids.length) return { ok: false, status: 400, error: 'Select at least one seat' };
  if (ids.length > MAX_SEATS_PER_ORDER) {
    return { ok: false, status: 400, error: `You can book up to ${MAX_SEATS_PER_ORDER} seats at a time` };
  }

  await releaseExpiredHolds();
  const found = await loadShowtimeForSale(showtimeId);
  if (!found.ok) return found;
  const showtime = found.showtime;
  const settings = await getCinemaSettings(showtime.attraction_id);

  const outcome = await withTransaction(async (client) => {
    await client.query(`SELECT id FROM bc_cinema_showtimes WHERE id = $1 FOR UPDATE`, [showtime.id]);

    const seatsRes = await client.query(
      `SELECT * FROM bc_cinema_seats
        WHERE id = ANY($1::int[]) AND screen_id = $2 AND status = 'available'`,
      [ids, showtime.screen_id]
    );
    if (seatsRes.rows.length !== ids.length) {
      return { ok: false, status: 409, error: 'Some of those seats are not available in this screen' };
    }

    const takenRes = await client.query(
      `SELECT s.seat_key FROM bc_cinema_seat_states st
         JOIN bc_cinema_seats s ON s.id = st.seat_id
        WHERE st.showtime_id = $1 AND st.seat_id = ANY($2::int[])
          AND st.status IN ('sold', 'held', 'blocked')`,
      [showtime.id, ids]
    );
    if (takenRes.rows.length) {
      return {
        ok: false,
        status: 409,
        error: `Seat ${takenRes.rows.map((row) => row.seat_key).join(', ')} was just taken. Please pick another.`,
        taken: takenRes.rows.map((row) => row.seat_key),
      };
    }

    const lines = seatsRes.rows.map((seat) => ({
      seatId: seat.id,
      label: seat.seat_key,
      category: seat.category,
      categoryLabel: categoryLabel(seat.category),
      price: priceForSeat(seat, showtime, settings),
      admissions: admissionsForSeat(seat),
    }));
    const totals = buildTotals(lines, settings);
    const expiresAt = new Date(Date.now() + settings.holdMinutes * 60 * 1000);

    const holdRes = await client.query(
      `INSERT INTO bc_cinema_holds
         (hold_ref, showtime_id, attraction_id, customer_email, seat_ids, subtotal, currency, status, expires_at)
       VALUES ($1,$2,$3,COALESCE($4, ''),$5,$6,$7,'active',$8)
       RETURNING *`,
      [newHoldRef(), showtime.id, showtime.attraction_id, String(customerEmail || '').toLowerCase(),
        JSON.stringify(ids), totals.subtotal, showtime.currency, expiresAt.toISOString()]
    );
    const hold = holdRes.rows[0];

    for (const line of lines) {
      const inserted = await client.query(
        `INSERT INTO bc_cinema_seat_states
           (showtime_id, seat_id, attraction_id, status, hold_id, price, currency, expires_at)
         VALUES ($1,$2,$3,'held',$4,$5,$6,$7)
         ON CONFLICT (showtime_id, seat_id) DO NOTHING
         RETURNING seat_id`,
        [showtime.id, line.seatId, showtime.attraction_id, hold.id, line.price, showtime.currency, expiresAt.toISOString()]
      );
      if (!inserted.rows.length) {
        // A conflicting claim slipped in; abort the whole hold.
        throw Object.assign(new Error('seat_conflict'), { seatConflict: true, label: line.label });
      }
    }

    return {
      ok: true,
      hold: {
        id: hold.id,
        holdRef: hold.hold_ref,
        showtimeId: showtime.id,
        expiresAt: hold.expires_at,
        expiresInSeconds: Math.round((expiresAt.getTime() - Date.now()) / 1000),
        seats: lines,
        ...totals,
        currency: showtime.currency,
      },
    };
  }).catch((error) => {
    if (error && error.seatConflict) {
      return { ok: false, status: 409, error: `Seat ${error.label} was just taken. Please pick another.` };
    }
    throw error;
  });

  return outcome;
}

async function releaseHold(holdRef, actor = 'customer') {
  const ref = String(holdRef || '').trim().toUpperCase();
  if (!ref) return { ok: true };
  await withTransaction(async (client) => {
    const holdRes = await client.query(`SELECT * FROM bc_cinema_holds WHERE hold_ref = $1 FOR UPDATE`, [ref]);
    const hold = holdRes.rows[0];
    if (!hold) return;
    await client.query(`DELETE FROM bc_cinema_seat_states WHERE hold_id = $1`, [hold.id]);
    await client.query(
      `UPDATE bc_cinema_holds SET status = 'released' WHERE id = $1 AND status = 'active'`,
      [hold.id]
    );
  });
  return { ok: true, released: ref, actor };
}

// ─── Orders ──────────────────────────────────────────────────────────────────

function mapOrder(order, tickets = []) {
  return {
    id: order.id,
    bookingRef: order.booking_ref,
    attractionId: order.attraction_id,
    attractionName: order.attraction_name,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    customerPhone: order.customer_phone,
    showtimeId: Number(order.cinema_showtime_id || 0),
    screenName: order.cinema_screen_name || '',
    movieTitle: order.cinema_movie_title || '',
    showDate: order.visit_date ? T.isoDate(order.visit_date) : '',
    slotLabel: order.slot_label || '',
    seatLabels: order.seat_labels ? String(order.seat_labels).split(',').filter(Boolean) : [],
    quantity: Number(order.quantity_total || 0),
    admissionsTotal: Number(order.admissions_total || 0),
    subtotal: Number(order.subtotal || 0),
    serviceFee: Number(order.service_fee || 0),
    taxAmount: Number(order.tax_amount || 0),
    total: Number(order.total || 0),
    refundAmount: Number(order.refund_amount || 0),
    currency: order.currency,
    status: order.status,
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    channel: order.channel,
    expiresAt: order.expires_at,
    createdAt: order.created_at,
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      ticketNo: ticket.ticket_no,
      qrToken: ticket.qr_token,
      seatLabel: ticket.seat_label || '',
      seatCategory: ticket.seat_category || '',
      screenName: ticket.screen_name || '',
      movieTitle: ticket.movie_title || '',
      showDate: ticket.visit_date ? T.isoDate(ticket.visit_date) : '',
      slotLabel: ticket.slot_label || '',
      createdAt: ticket.created_at || null,
      admissionsTotal: Number(ticket.admissions_total || 1),
      admissionsUsed: Number(ticket.admissions_used || 0),
      status: ticket.status,
      holderName: ticket.holder_name,
      unitPrice: Number(ticket.unit_price || 0),
      currency: ticket.currency,
    })),
  };
}

async function loadOrderByRef(ref) {
  const value = String(ref || '').trim().toUpperCase();
  if (!/^ATC-[A-Z0-9]{6,20}$/.test(value)) return null;
  const result = await query(`SELECT * FROM bc_ticket_orders WHERE UPPER(booking_ref) = $1 LIMIT 1`, [value]);
  return result.rows[0] || null;
}

async function loadOrderTickets(orderId) {
  const result = await query(
    `SELECT * FROM bc_attraction_tickets WHERE order_id = $1 ORDER BY id ASC`,
    [orderId]
  );
  return result.rows;
}

async function publicOrder(ref) {
  const order = await loadOrderByRef(ref);
  if (!order) return { ok: false, status: 404, error: 'Booking not found' };
  const tickets = await loadOrderTickets(order.id);
  const cinema = await loadCinema(order.attraction_id);
  // The poster is what turns the ticket into a keepsake, so resolve it from the
  // screening rather than trusting a title match.
  const posterRes = await query(
    `SELECT mv.poster_url
       FROM bc_cinema_showtimes sh
       JOIN bc_cinema_movies mv ON mv.id = sh.movie_id
      WHERE sh.id = $1
      LIMIT 1`,
    [T.toInt(order.cinema_showtime_id, 0)]
  );
  const poster = posterRes.rows[0]?.poster_url || '';
  return {
    ok: true,
    order: { ...mapOrder(order, tickets), moviePoster: poster },
    cinema: cinema
      ? { id: cinema.id, name: cinema.name, city: cinema.city, address: cinema.location, image: cinema.featured_image }
      : null,
  };
}

/**
 * Turn a live hold into a pending order and move the seat states over to it.
 * Nothing is sold here: the seats stay held until the payment is verified.
 */
async function createOrder({
  holdRef,
  customerName,
  customerEmail,
  customerPhone = '',
  notes = '',
  paymentMethod = 'card',
  channel = 'online',
}) {
  const ref = String(holdRef || '').trim().toUpperCase();
  if (!ref) return { ok: false, status: 400, error: 'Your seat hold expired. Please pick your seats again.' };

  await releaseExpiredHolds();

  return withTransaction(async (client) => {
    const holdRes = await client.query(`SELECT * FROM bc_cinema_holds WHERE hold_ref = $1 FOR UPDATE`, [ref]);
    const hold = holdRes.rows[0];
    if (!hold) return { ok: false, status: 404, error: 'Your seat hold was not found. Please pick your seats again.' };
    if (hold.status !== 'active') {
      return { ok: false, status: 409, error: 'This hold has already been used or released. Please pick your seats again.' };
    }
    if (new Date(hold.expires_at).getTime() < Date.now()) {
      return { ok: false, status: 409, error: 'Your seat hold expired. Please pick your seats again.' };
    }

    const showtimeRes = await client.query(
      `SELECT sh.*, sc.name AS screen_name, sc.screen_type, mv.title AS movie_title, mv.duration_min
         FROM bc_cinema_showtimes sh
         LEFT JOIN bc_cinema_screens sc ON sc.id = sh.screen_id
         LEFT JOIN bc_cinema_movies mv ON mv.id = sh.movie_id
        WHERE sh.id = $1`,
      [hold.showtime_id]
    );
    const showtime = showtimeRes.rows[0];
    if (!showtime) return { ok: false, status: 404, error: 'Screening not found' };
    if (showtime.status === 'cancelled') return { ok: false, status: 409, error: 'This screening was cancelled' };

    const statesRes = await client.query(
      `SELECT st.*, s.seat_key, s.category FROM bc_cinema_seat_states st
         JOIN bc_cinema_seats s ON s.id = st.seat_id
        WHERE st.hold_id = $1 AND st.showtime_id = $2
        ORDER BY s.y ASC, s.x ASC`,
      [hold.id, hold.showtime_id]
    );
    if (!statesRes.rows.length) {
      return { ok: false, status: 409, error: 'These seats are no longer held. Please pick your seats again.' };
    }

    const settings = await getCinemaSettings(hold.attraction_id);
    const lines = statesRes.rows.map((row) => ({
      seatId: row.seat_id,
      label: row.seat_key,
      category: row.category,
      categoryLabel: categoryLabel(row.category),
      price: money(row.price),
      admissions: CATEGORY_ADMISSIONS[row.category] || 1,
    }));
    const totals = buildTotals(lines, settings);
    const expiresAt = new Date(Date.now() + ORDER_TTL_MINUTES * 60 * 1000);
    const cinema = await loadCinema(hold.attraction_id);
    const bookingRef = T.newBookingRef();
    const seatLabels = lines.map((line) => line.label).join(',');
    const startTime = showtime.start_time;

    const orderRes = await client.query(
      `INSERT INTO bc_ticket_orders (
         booking_ref, attraction_id, attraction_name, owner_email, customer_name, customer_email,
         customer_phone, visit_date, slot_id, slot_label, subtotal, discount, promo_code,
         tax_amount, service_fee, total, currency, status, payment_status, payment_method,
         admissions_total, quantity_total, notes, channel, expires_at, payment_verified,
         cinema_showtime_id, cinema_screen_name, cinema_movie_title, seat_labels, cinema_hold_ref
       ) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, ''),$8,0,$9,$10,0,'',$11,$12,$13,$14,'pending_payment','unpaid',$15,
                 $16,$17,COALESCE($18, ''),$19,$20,false,$21,COALESCE($22, ''),COALESCE($23, ''),$24,$25)
       RETURNING *`,
      [
        bookingRef, hold.attraction_id, cinema?.name || '', cinema?.owner_email || '',
        customerName, customerEmail, customerPhone, T.isoDate(showtime.show_date),
        `${startTime} · ${showtime.screen_name || 'Screen'}`,
        totals.subtotal, totals.taxAmount, totals.serviceFee, totals.total,
        (showtime.currency || 'USD').toUpperCase(), paymentMethod,
        totals.admissionsTotal, lines.length, notes, channel, expiresAt.toISOString(),
        showtime.id, showtime.screen_name || '', showtime.movie_title || '', seatLabels, hold.hold_ref,
      ]
    );
    const order = orderRes.rows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO bc_ticket_order_items
           (order_id, ticket_type_id, ticket_type_name, slot_id, visit_date, unit_price, quantity,
            admissions_per_unit, line_total)
         VALUES ($1,0,$2,0,$3,$4,1,$5,$4)`,
        [order.id, `${line.categoryLabel} seat ${line.label}`, T.isoDate(showtime.show_date), line.price, line.admissions]
      );
    }

    await client.query(
      `UPDATE bc_cinema_seat_states
          SET status = 'held', order_id = $1, expires_at = $2, updated_at = NOW()
        WHERE hold_id = $3 AND showtime_id = $4`,
      [order.id, expiresAt.toISOString(), hold.id, hold.showtime_id]
    );
    await client.query(
      `UPDATE bc_cinema_holds SET status = 'converted' WHERE id = $1`,
      [hold.id]
    );

    return { ok: true, order, lines, totals, showtime };
  });
}

/** Seat states belong to an order that could not be paid for: free them. */
async function abandonOrder(orderId) {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM bc_cinema_seat_states WHERE order_id = $1`, [orderId]);
    await client.query(
      `UPDATE bc_ticket_orders SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status = 'pending_payment'`,
      [orderId]
    );
  });
}

/**
 * Mark the order paid and mint one ticket per seat. Idempotent: a retried payment
 * callback returns the tickets that were already issued.
 */
async function confirmOrder(orderId, { paymentRef = '', paymentMethod = 'card', actor = 'system' } = {}) {
  const outcome = await withTransaction(async (client) => {
    const locked = await client.query(`SELECT * FROM bc_ticket_orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = locked.rows[0];
    if (!order) return { ok: false, status: 404, error: 'Booking not found' };

    if (order.status === 'confirmed' && order.payment_status === 'paid') {
      const tickets = await client.query(`SELECT * FROM bc_attraction_tickets WHERE order_id = $1 ORDER BY id`, [orderId]);
      return { ok: true, order, tickets: tickets.rows, alreadyConfirmed: true };
    }
    if (['cancelled', 'refunded', 'expired'].includes(order.status)) {
      return { ok: false, status: 409, error: `This booking is ${order.status}` };
    }

    const seatsRes = await client.query(
      `SELECT st.*, s.seat_key, s.category FROM bc_cinema_seat_states st
         JOIN bc_cinema_seats s ON s.id = st.seat_id
        WHERE st.order_id = $1
        ORDER BY s.y ASC, s.x ASC`,
      [orderId]
    );
    if (!seatsRes.rows.length) {
      return { ok: false, status: 409, error: 'The seats for this booking were released before payment completed.' };
    }

    await client.query(
      `UPDATE bc_cinema_seat_states
          SET status = 'sold', expires_at = NULL, updated_at = NOW()
        WHERE order_id = $1`,
      [orderId]
    );
    await client.query(
      `UPDATE bc_ticket_orders
          SET status = 'confirmed', payment_status = 'paid', payment_method = $2,
              payment_ref = COALESCE(NULLIF($3, ''), payment_ref), payment_verified = true,
              expires_at = NULL, updated_at = NOW()
        WHERE id = $1`,
      [orderId, paymentMethod, paymentRef]
    );

    const showtimeRes = await client.query(
      `SELECT sh.*, sc.name AS screen_name, mv.title AS movie_title
         FROM bc_cinema_showtimes sh
         LEFT JOIN bc_cinema_screens sc ON sc.id = sh.screen_id
         LEFT JOIN bc_cinema_movies mv ON mv.id = sh.movie_id
        WHERE sh.id = $1`,
      [order.cinema_showtime_id]
    );
    const showtime = showtimeRes.rows[0] || {};

    const tickets = [];
    for (const seat of seatsRes.rows) {
      const admissions = CATEGORY_ADMISSIONS[seat.category] || 1;
      const ticketNo = `CT-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const inserted = await client.query(
        `INSERT INTO bc_attraction_tickets (
           order_id, order_item_id, ticket_type_id, attraction_id, booking_ref, ticket_no, qr_token,
           holder_name, holder_email, ticket_type_name, visit_date, slot_label,
           admissions_total, admissions_used, status, source, unit_price, currency,
           cinema_showtime_id, cinema_seat_id, seat_label, seat_category, screen_name, movie_title
         ) VALUES ($1,NULL,0,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, ''),$11,0,'valid','online',$12,$13,$14,$15,$16,$17,COALESCE($18, ''),COALESCE($19, ''))
         RETURNING *`,
        [
          orderId, order.attraction_id, order.booking_ref, ticketNo, T.signTicketToken(ticketNo),
          order.customer_name, order.customer_email,
          `${categoryLabel(seat.category)} seat ${seat.seat_key}`,
          T.isoDate(order.visit_date), order.slot_label || '', admissions,
          money(seat.price), (order.currency || 'USD').toUpperCase(),
          order.cinema_showtime_id, seat.seat_id, seat.seat_key, seat.category,
          showtime.screen_name || order.cinema_screen_name, showtime.movie_title || order.cinema_movie_title,
        ]
      );
      tickets.push(inserted.rows[0]);
    }

    const fresh = await client.query(`SELECT * FROM bc_ticket_orders WHERE id = $1`, [orderId]);
    return { ok: true, order: fresh.rows[0], tickets };
  });

  if (outcome.ok) {
    const { order, tickets } = outcome;
    safeDispatch({
      recipientId: order.customer_email,
      recipientEmail: order.customer_email,
      recipientRole: 'traveler',
      type: 'TICKET_ISSUED',
      title: 'Your cinema tickets are ready',
      message: `${order.cinema_movie_title} · ${Number(order.quantity_total)} seat(s) · ${T.isoDate(order.visit_date)} ${order.slot_label}. Booking ${order.booking_ref}.`,
      actionUrl: `/attractions/cinemas/confirmation?ref=${encodeURIComponent(order.booking_ref)}`,
      metadata: {
        bookingRef: order.booking_ref,
        attractionName: order.attraction_name,
        movieTitle: order.cinema_movie_title,
        showDate: T.isoDate(order.visit_date),
        seats: order.seat_labels,
        totalAmount: Number(order.total || 0).toFixed(2),
        currency: order.currency,
        tickets: tickets.slice(0, 12).map((ticket) => ({
          ticketNo: ticket.ticket_no,
          seat: ticket.seat_label,
        })),
        title: 'Booking confirmed',
        message: `Your seats for ${order.cinema_movie_title} are confirmed.`,
        actionUrl: `/attractions/cinemas/confirmation?ref=${encodeURIComponent(order.booking_ref)}`,
      },
    });

    if (order.owner_email) {
      safeDispatch({
        recipientId: order.owner_email,
        recipientEmail: order.owner_email,
        recipientRole: 'attraction_owner',
        type: 'TICKET_SALE',
        title: 'New cinema booking',
        message: `${order.seat_labels} for ${order.cinema_movie_title} (${T.isoDate(order.visit_date)} ${order.slot_label}).`,
        actionUrl: '/attraction-dashboard/cinema?section=bookings',
        metadata: { bookingRef: order.booking_ref, totalAmount: order.total },
      });
    }

    await T.writeTicketAudit({
      attractionId: order.attraction_id,
      actor,
      action: 'cinema.booking.confirmed',
      entityType: 'booking',
      entityId: order.booking_ref,
      details: { seats: order.seat_labels, total: order.total, currency: order.currency },
    });
  }

  return outcome;
}

function safeDispatch(event) {
  Promise.resolve()
    .then(() => notificationHub.dispatch(event))
    .catch((error) => console.warn('[cinema] notification failed:', error.message));
}

/** Cancel a cinema booking, freeing the seats so they can be resold. */
async function cancelBooking({ ref, reason = '', actor = 'system' }) {
  const order = await loadOrderByRef(ref);
  if (!order) return { ok: false, status: 404, error: 'Booking not found' };
  if (order.status === 'cancelled') return { ok: true, order, alreadyCancelled: true };
  if (order.status === 'refunded') return { ok: false, status: 409, error: 'This booking was already refunded' };

  const settings = await getCinemaSettings(order.attraction_id);
  if (order.status === 'confirmed') {
    const startsAt = new Date(`${T.isoDate(order.visit_date)}T${(order.slot_label || '00:00').slice(0, 5)}:00Z`);
    const hoursAhead = (startsAt.getTime() - Date.now()) / 3600000;
    if (hoursAhead < 0) return { ok: false, status: 409, error: 'This screening has already started' };
    if (hoursAhead < settings.refundWindowHours) {
      return {
        ok: false,
        status: 409,
        error: `Cancellations close ${settings.refundWindowHours} hours before the screening.`,
      };
    }
  }

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM bc_cinema_seat_states WHERE order_id = $1`, [order.id]);
    await client.query(
      `UPDATE bc_attraction_tickets SET status = 'cancelled', updated_at = NOW() WHERE order_id = $1`,
      [order.id]
    );
    await client.query(
      `UPDATE bc_ticket_orders
          SET status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE 'cancelled' END,
              refund_amount = CASE WHEN payment_status = 'paid' THEN total ELSE refund_amount END,
              refunded_at = CASE WHEN payment_status = 'paid' THEN NOW() ELSE refunded_at END,
              notes = COALESCE($2, ''), updated_at = NOW()
        WHERE id = $1`,
      [order.id, T.text(reason, 400)]
    );
  });

  await T.writeTicketAudit({
    attractionId: order.attraction_id,
    actor,
    action: 'cinema.booking.cancelled',
    entityType: 'booking',
    entityId: order.booking_ref,
    details: { reason, seats: order.seat_labels, total: order.total },
  });

  const fresh = await query(`SELECT * FROM bc_ticket_orders WHERE id = $1`, [order.id]);
  const tickets = await loadOrderTickets(order.id);
  return { ok: true, order: mapOrder(fresh.rows[0], tickets) };
}

/** Cash / pay-at-venue settlement taken at the counter. */
async function settleBooking({ ref, paymentMethod = 'cash', paymentRef = '', actor = '' }) {
  const order = await loadOrderByRef(ref);
  if (!order) return { ok: false, status: 404, error: 'Booking not found' };
  if (order.status === 'confirmed' && order.payment_status === 'paid') {
    return publicOrder(order.booking_ref);
  }
  if (['cancelled', 'refunded', 'expired'].includes(order.status)) {
    return { ok: false, status: 409, error: `This booking is ${order.status}` };
  }
  const confirmed = await confirmOrder(order.id, { paymentMethod, paymentRef, actor });
  if (!confirmed.ok) return confirmed;
  return publicOrder(order.booking_ref);
}

// ─── Reporting ───────────────────────────────────────────────────────────────

async function cinemaOverview(attractionId) {
  const id = T.toInt(attractionId, 0);
  const [screens, movies, upcoming, today, revenue, occupancy] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'active')::int AS active
             FROM bc_cinema_screens WHERE attraction_id = $1`, [id]),
    query(`SELECT COUNT(*)::int AS total FROM bc_cinema_movies m
            WHERE m.status = 'active' AND EXISTS (
              SELECT 1 FROM bc_cinema_showtimes sh WHERE sh.movie_id = m.id AND sh.attraction_id = $1)`, [id]),
    query(`SELECT COUNT(*)::int AS total FROM bc_cinema_showtimes
            WHERE attraction_id = $1 AND status <> 'cancelled' AND starts_at >= NOW()`, [id]),
    query(`SELECT COUNT(*)::int AS total FROM bc_cinema_showtimes
            WHERE attraction_id = $1 AND status <> 'cancelled' AND show_date = CURRENT_DATE`, [id]),
    query(`SELECT COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS paid,
                  COALESCE(SUM(total) FILTER (WHERE payment_status = 'unpaid' AND status = 'pending_payment'), 0)::numeric AS pending,
                  COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS bookings,
                  COUNT(*) FILTER (WHERE channel = 'pos' AND payment_status = 'paid')::int AS counter_bookings
             FROM bc_ticket_orders
            WHERE attraction_id = $1 AND cinema_showtime_id > 0
              AND created_at >= CURRENT_DATE - INTERVAL '30 days'`, [id]),
    query(`SELECT
             (SELECT COUNT(*) FROM bc_cinema_seats s
               JOIN bc_cinema_screens sc ON sc.id = s.screen_id WHERE sc.attraction_id = $1)::int AS seats,
             (SELECT COUNT(*) FROM bc_cinema_seat_states st
               JOIN bc_cinema_showtimes sh ON sh.id = st.showtime_id
              WHERE sh.attraction_id = $1 AND st.status = 'sold')::int AS sold`, [id]),
  ]);

  const seatTotal = Number(occupancy.rows[0]?.seats || 0);
  const soldTotal = Number(occupancy.rows[0]?.sold || 0);

  return {
    screens: { total: Number(screens.rows[0]?.total || 0), active: Number(screens.rows[0]?.active || 0) },
    movies: Number(movies.rows[0]?.total || 0),
    upcomingShowtimes: Number(upcoming.rows[0]?.total || 0),
    todayShowtimes: Number(today.rows[0]?.total || 0),
    revenue: {
      paid: Number(revenue.rows[0]?.paid || 0),
      pending: Number(revenue.rows[0]?.pending || 0),
      bookings: Number(revenue.rows[0]?.bookings || 0),
      counterBookings: Number(revenue.rows[0]?.counter_bookings || 0),
    },
    occupancy: {
      seats: seatTotal,
      sold: soldTotal,
      percent: seatTotal > 0 ? Math.round((soldTotal / seatTotal) * 100) : 0,
    },
  };
}

async function cinemaReport(attractionId, { from, to }) {
  const id = T.toInt(attractionId, 0);
  const start = T.isDateISO(from) ? from : T.addDaysISO(T.isoToday(), -30);
  const end = T.isDateISO(to) ? to : T.isoToday();

  const [byMovie, byShowtime, byCategory, channels, scans] = await Promise.all([
    query(
      `SELECT o.cinema_movie_title AS movie,
              COUNT(DISTINCT o.id)::int AS bookings,
              COALESCE(SUM(o.quantity_total), 0)::int AS seats,
              COALESCE(SUM(o.total), 0)::numeric AS revenue
         FROM bc_ticket_orders o
        WHERE o.attraction_id = $1 AND o.cinema_showtime_id > 0 AND o.payment_status = 'paid'
          AND o.created_at >= $2::date AND o.created_at < ($3::date + INTERVAL '1 day')
        GROUP BY o.cinema_movie_title
        ORDER BY revenue DESC`,
      [id, start, end]
    ),
    query(
      `SELECT o.cinema_movie_title AS movie, o.visit_date, o.slot_label,
              COUNT(*)::int AS bookings,
              COALESCE(SUM(o.quantity_total), 0)::int AS seats,
              COALESCE(SUM(o.total), 0)::numeric AS revenue
         FROM bc_ticket_orders o
        WHERE o.attraction_id = $1 AND o.cinema_showtime_id > 0 AND o.payment_status = 'paid'
          AND o.visit_date >= $2::date AND o.visit_date <= $3::date
        GROUP BY o.cinema_movie_title, o.visit_date, o.slot_label
        ORDER BY o.visit_date DESC, o.slot_label ASC`,
      [id, start, end]
    ),
    query(
      `SELECT t.seat_category AS category,
              COUNT(*)::int AS tickets,
              COALESCE(SUM(t.unit_price), 0)::numeric AS revenue
         FROM bc_attraction_tickets t
        WHERE t.attraction_id = $1 AND t.cinema_showtime_id > 0 AND t.status <> 'cancelled'
          AND t.issued_at >= $2::date AND t.issued_at < ($3::date + INTERVAL '1 day')
        GROUP BY t.seat_category
        ORDER BY revenue DESC`,
      [id, start, end]
    ),
    query(
      `SELECT o.channel,
              COUNT(*)::int AS bookings,
              COALESCE(SUM(o.total), 0)::numeric AS revenue
         FROM bc_ticket_orders o
        WHERE o.attraction_id = $1 AND o.cinema_showtime_id > 0 AND o.payment_status = 'paid'
          AND o.created_at >= $2::date AND o.created_at < ($3::date + INTERVAL '1 day')
        GROUP BY o.channel`,
      [id, start, end]
    ),
    query(
      `SELECT COUNT(*)::int AS admitted, COALESCE(SUM(t.admissions_used), 0)::int AS admissions
         FROM bc_attraction_tickets t
        WHERE t.attraction_id = $1 AND t.cinema_showtime_id > 0 AND t.admissions_used > 0
          AND t.updated_at >= $2::date AND t.updated_at < ($3::date + INTERVAL '1 day')`,
      [id, start, end]
    ),
  ]);

  const ticketsIssued = byCategory.rows.reduce((sum, row) => sum + Number(row.tickets || 0), 0);
  return {
    range: { from: start, to: end },
    byMovie: byMovie.rows.map((row) => ({
      movie: row.movie, bookings: Number(row.bookings), seats: Number(row.seats), revenue: Number(row.revenue),
    })),
    byShowtime: byShowtime.rows.map((row) => ({
      movie: row.movie, showDate: T.isoDate(row.visit_date), slotLabel: row.slot_label,
      bookings: Number(row.bookings), seats: Number(row.seats), revenue: Number(row.revenue),
    })),
    byCategory: byCategory.rows.map((row) => ({
      category: row.category || 'standard',
      label: categoryLabel(row.category || 'standard'),
      tickets: Number(row.tickets),
      revenue: Number(row.revenue),
    })),
    channels: channels.rows.map((row) => ({
      channel: row.channel, bookings: Number(row.bookings), revenue: Number(row.revenue),
    })),
    attendance: {
      ticketsIssued,
      ticketsScanned: Number(scans.rows[0]?.admitted || 0),
      admissions: Number(scans.rows[0]?.admissions || 0),
    },
  };
}

// ─── Admin bookings list ─────────────────────────────────────────────────────

async function listBookings({ attractionId, from = '', to = '', movieId = 0, status = '', channel = '', search = '', limit = 100 }) {
  const id = T.toInt(attractionId, 0);
  const params = [id];
  const where = [`o.attraction_id = $1`, `o.cinema_showtime_id > 0`];

  if (T.isDateISO(from)) { params.push(from); where.push(`o.visit_date >= $${params.length}::date`); }
  if (T.isDateISO(to)) { params.push(to); where.push(`o.visit_date <= $${params.length}::date`); }
  if (status) { params.push(String(status)); where.push(`o.status = $${params.length}`); }
  if (channel) { params.push(String(channel)); where.push(`o.channel = $${params.length}`); }
  if (movieId) { params.push(T.toInt(movieId, 0)); where.push(`o.cinema_showtime_id IN (SELECT id FROM bc_cinema_showtimes WHERE movie_id = $${params.length})`); }
  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    where.push(`(LOWER(o.booking_ref) LIKE $${params.length} OR LOWER(o.customer_name) LIKE $${params.length} OR LOWER(o.customer_email) LIKE $${params.length} OR LOWER(o.seat_labels) LIKE $${params.length})`);
  }
  params.push(Math.min(400, Math.max(1, T.toInt(limit, 100))));

  const result = await query(
    `SELECT o.*,
            (SELECT COUNT(*) FROM bc_attraction_tickets t WHERE t.order_id = o.id)::int AS tickets,
            (SELECT COUNT(*) FROM bc_attraction_tickets t WHERE t.order_id = o.id AND t.admissions_used > 0)::int AS scanned
       FROM bc_ticket_orders o
      WHERE ${where.join(' AND ')}
      ORDER BY o.visit_date DESC, o.slot_label DESC, o.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return result.rows.map((row) => ({ ...mapOrder(row), ticketsIssued: Number(row.tickets || 0), ticketsScanned: Number(row.scanned || 0) }));
}

module.exports = {
  DEFAULT_CATEGORY_MULTIPLIERS,
  DEFAULT_CINEMA_SETTINGS,
  HOLD_MAX_MINUTES,
  MAX_SEATS_PER_ORDER,
  SCREEN_TYPES,
  SEAT_CATEGORIES,
  SEAT_CATEGORY_LABELS,
  abandonOrder,
  addMinutesHHMM,
  admissionsForSeat,
  archiveMovie,
  cancelBooking,
  cancelShowtime,
  categoryLabel,
  cinemaOverview,
  cinemaReport,
  confirmOrder,
  createHold,
  createOrder,
  deleteScreen,
  getCinemaSettings,
  getSeatMap,
  listBookings,
  listMovies,
  listPublicCinemas,
  listScreens,
  listSeats,
  listShowtimes,
  loadCinema,
  loadOrderByRef,
  loadShowtime,
  mapOrder,
  mapMovie,
  mapScreen,
  mapSeat,
  mapShowtime,
  priceForSeat,
  publicOrder,
  releaseExpiredHolds,
  releaseHold,
  requireAccess,
  saveCinemaSettings,
  saveMovie,
  saveScreen,
  saveSeatLayout,
  saveShowtime,
  settleBooking,
  stampFor,
  buildTotals,
};
