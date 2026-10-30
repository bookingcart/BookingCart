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
//
// Note: this database coerces an empty-string query parameter to NULL, which
// overrides a column DEFAULT and breaks NOT NULL text columns. Anything that
// may legitimately be blank is therefore bound as COALESCE($n, '').

'use strict';

const crypto = require('crypto');
const { query, withTransaction } = require('./db');
const notificationHub = require('./notification-hub');
const T = require('./ticketing');
const L = require('./cinema-layout');

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
async function listPublicCinemas({ search = '', city = '', country = '', countryCode = '' } = {}) {
  const term = String(search || '').trim().toLowerCase();
  const place = String(city || '').trim();
  const countryName = String(country || '').trim();
  const countryIso = String(countryCode || '').trim().toUpperCase();
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
  // Owners type a country name ("Uganda") and geo lookups hand back a name plus an
  // ISO code, so accept whichever one the row happens to store.
  if (countryName || countryIso) {
    const clauses = [];
    if (countryName) {
      params.push(countryName);
      clauses.push(`LOWER(BTRIM(COALESCE(p.country, ''))) = LOWER($${params.length})`);
    }
    if (countryIso) {
      params.push(countryIso);
      clauses.push(`UPPER(BTRIM(COALESCE(p.country, ''))) = $${params.length}`);
    }
    where.push(`(${clauses.join(' OR ')})`);
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
    hallKind: row.hall_kind || 'standard',
    rowCount: Number(row.row_count || 0),
    seatsPerRow: Number(row.seats_per_row || 0),
    features: row.features && typeof row.features === 'object' ? row.features : {},
    accessibleSeats: Number(row.accessible_seats || 0),
    capacity: Number(row.capacity || 0),
    activeLayoutVersionId: Number(row.active_layout_version_id || 0),
    layoutVersion: row.layout_version === undefined || row.layout_version === null ? null : Number(row.layout_version),
    draftVersions: row.draft_versions === undefined ? 0 : Number(row.draft_versions || 0),
    status: row.status,
    seatCount: row.seat_count === undefined ? undefined : Number(row.seat_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listScreens(attractionId) {
  const result = await query(
    `SELECT s.*,
            v.version AS layout_version,
            (SELECT COUNT(*) FROM bc_cinema_seats st
              WHERE st.screen_id = s.id
                AND (s.active_layout_version_id = 0 OR st.layout_version_id = s.active_layout_version_id))::int AS seat_count,
            (SELECT COUNT(*) FROM bc_cinema_layout_versions d
              WHERE d.screen_id = s.id AND d.status = 'draft')::int AS draft_versions
       FROM bc_cinema_screens s
       LEFT JOIN bc_cinema_layout_versions v ON v.id = s.active_layout_version_id
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
  const hallKind = ['standard', 'imax', '3d', 'vip', 'dolby', '4dx', 'recliner', 'screen'].includes(input.hallKind)
    ? input.hallKind
    : 'standard';
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
              features = $7, status = $8, hall_kind = $9, updated_at = NOW()
        WHERE id = $1 AND attraction_id = $2
        RETURNING *`,
      [id, T.toInt(attractionId, 0), name, screenType, rowCount, seatsPerRow, JSON.stringify(features), status, hallKind]
    );
    return { ok: true, screen: mapScreen(updated.rows[0]) };
  }

  const inserted = await query(
    `INSERT INTO bc_cinema_screens
       (attraction_id, owner_email, name, screen_type, row_count, seats_per_row, features, status, hall_kind)
     VALUES ($1,COALESCE($2, ''),$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [T.toInt(attractionId, 0), String(ownerEmail || '').toLowerCase(), name, screenType, rowCount, seatsPerRow,
      JSON.stringify(features), status, hallKind]
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
    await client.query(`DELETE FROM bc_cinema_layout_versions WHERE screen_id = $1`, [id]);
    await client.query(`DELETE FROM bc_cinema_screens WHERE id = $1 AND attraction_id = $2`, [id, T.toInt(attractionId, 0)]);
  });
  return { ok: true };
}

// ─── Seat types ──────────────────────────────────────────────────────────────

function mapSeatType(row) {
  return {
    id: row.id,
    attractionId: row.attraction_id,
    slug: row.slug,
    name: row.name,
    color: row.color,
    icon: row.icon,
    baseCategory: row.base_category,
    defaultPrice: row.default_price === null || row.default_price === undefined ? null : Number(row.default_price),
    multiplier: Number(row.multiplier || 1),
    admissions: Number(row.admissions || 1),
    bookingMode: row.booking_mode || 'single',
    groupSize: Number(row.group_size || 1),
    splitAllowed: Boolean(row.split_allowed),
    accessible: Boolean(row.accessible),
    companionRequired: Boolean(row.companion_required),
    instructions: row.instructions || '',
    sortOrder: Number(row.sort_order || 0),
    status: row.status || 'active',
  };
}

async function listSeatTypes(attractionId) {
  const result = await query(
    `SELECT * FROM bc_cinema_seat_types WHERE attraction_id = $1 ORDER BY sort_order ASC, id ASC`,
    [T.toInt(attractionId, 0)]
  );
  return result.rows.map(mapSeatType);
}

/** A cinema always has the standard types available, even before it edits them. */
async function ensureSeatTypes(attractionId) {
  const id = T.toInt(attractionId, 0);
  if (!id) return L.DEFAULT_SEAT_TYPES.map((type, index) => ({ ...type, id: 0, defaultPrice: null, sortOrder: index, status: 'active' }));
  const existing = await listSeatTypes(id);
  if (existing.length) {
    // Wheelchair spaces are accessible by definition. Types seeded before those
    // flags existed are repaired once instead of silently losing access rules.
    const required = L.DEFAULT_SEAT_TYPES.filter((type) => type.accessible || type.companionRequired);
    const stale = existing.filter((type) => required.some((entry) => entry.slug === type.slug)
      && (!type.accessible || !type.companionRequired));
    if (stale.length) {
      await query(
        `UPDATE bc_cinema_seat_types SET accessible = TRUE, companion_required = TRUE, updated_at = NOW()
          WHERE attraction_id = $1 AND slug = ANY($2::text[])`,
        [id, stale.map((type) => type.slug)]
      );
      return listSeatTypes(id);
    }
    return existing;
  }
  for (let index = 0; index < L.DEFAULT_SEAT_TYPES.length; index += 1) {
    const type = L.DEFAULT_SEAT_TYPES[index];
    await query(
      `INSERT INTO bc_cinema_seat_types
         (attraction_id, slug, name, color, icon, base_category, multiplier, admissions, accessible, companion_required, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (attraction_id, slug) DO NOTHING`,
      [id, type.slug, type.name, type.color, type.icon, type.baseCategory, type.multiplier,
        type.admissions, Boolean(type.accessible), Boolean(type.companionRequired), index + 1]
    );
  }
  return listSeatTypes(id);
}

async function saveSeatType(attractionId, ownerEmail, input = {}) {
  const id = T.toInt(attractionId, 0);
  const existing = input.id ? (await query(
    `SELECT * FROM bc_cinema_seat_types WHERE id = $1 AND attraction_id = $2`,
    [T.toInt(input.id, 0), id]
  )).rows[0] : null;
  if (input.id && !existing) return { ok: false, status: 404, error: 'Seat type not found' };

  const normalized = L.normalizeSeatType(
    { ...input, slug: input.slug || existing?.slug, color: input.color || existing?.color },
    { fallbackSlug: existing?.slug || '' }
  );
  if (!normalized.ok) return { ok: false, status: 400, error: normalized.error };
  const type = normalized.type;

  if (type.slug === 'standard') type.status = 'active';

  if (existing) {
    await query(
      `UPDATE bc_cinema_seat_types SET
         name = $3, color = $4, icon = $5, base_category = $6, default_price = $7, multiplier = $8,
         admissions = $9, booking_mode = $10, group_size = $11, split_allowed = $12, accessible = $13,
         companion_required = $14, instructions = COALESCE($15, ''), status = $16, updated_at = NOW()
       WHERE id = $1 AND attraction_id = $2`,
      [existing.id, id, type.name, type.color, type.icon, type.baseCategory, type.defaultPrice, type.multiplier,
        type.admissions, type.bookingMode, type.groupSize, type.splitAllowed, type.accessible,
        type.companionRequired, type.instructions, type.status]
    );
    await logLayoutAudit({ attractionId: id, actorEmail: ownerEmail, action: 'seat-type.save', details: { slug: type.slug } });
    return { ok: true, seatType: (await listSeatTypes(id)).find((entry) => entry.id === existing.id) };
  }

  const maxOrder = (await query(
    `SELECT MAX(sort_order)::int AS max_order FROM bc_cinema_seat_types WHERE attraction_id = $1`,
    [id]
  )).rows[0]?.max_order || 0;
  const inserted = await query(
    `INSERT INTO bc_cinema_seat_types
       (attraction_id, slug, name, color, icon, base_category, default_price, multiplier, admissions,
        booking_mode, group_size, split_allowed, accessible, companion_required, instructions, sort_order, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,COALESCE($15, ''),$16,$17)
     ON CONFLICT (attraction_id, slug) DO NOTHING
     RETURNING *`,
    [id, type.slug, type.name, type.color, type.icon, type.baseCategory, type.defaultPrice, type.multiplier,
      type.admissions, type.bookingMode, type.groupSize, type.splitAllowed, type.accessible,
      type.companionRequired, type.instructions, maxOrder + 1, type.status]
  );
  if (!inserted.rows.length) return { ok: false, status: 409, error: `A seat type with the key “${type.slug}” already exists` };
  await logLayoutAudit({ attractionId: id, actorEmail: ownerEmail, action: 'seat-type.create', details: { slug: type.slug } });
  return { ok: true, seatType: mapSeatType(inserted.rows[0]) };
}

async function deleteSeatType(attractionId, ownerEmail, identifier) {
  const id = T.toInt(attractionId, 0);
  const key = String(identifier || '');
  const row = (await query(
    `SELECT * FROM bc_cinema_seat_types WHERE attraction_id = $1 AND (slug = $2 OR id::text = $2) LIMIT 1`,
    [id, key]
  )).rows[0];
  if (!row) return { ok: false, status: 404, error: 'Seat type not found' };
  if (['standard', 'wheelchair', 'companion'].includes(row.slug)) {
    return { ok: false, status: 409, error: 'Standard, wheelchair and companion types are required and can only be renamed.' };
  }
  const used = (await query(
    `SELECT COUNT(*)::int AS used FROM bc_cinema_seats WHERE category = $1 AND attraction_id = $2`,
    [row.slug, id]
  )).rows[0]?.used || 0;
  if (Number(used) > 0) {
    return { ok: false, status: 409, error: 'Seats still use this type. Reassign them in the layout editor first, or just deactivate it.' };
  }
  await query(`DELETE FROM bc_cinema_seat_types WHERE id = $1 AND attraction_id = $2`, [row.id, id]);
  await logLayoutAudit({ attractionId: id, actorEmail: ownerEmail, action: 'seat-type.delete', details: { slug: row.slug } });
  return { ok: true };
}

// ─── Layout versions ─────────────────────────────────────────────────────────

function mapLayoutVersion(row, { withDocument = false } = {}) {
  const mapped = {
    id: row.id,
    attractionId: row.attraction_id,
    screenId: row.screen_id,
    version: Number(row.version || 0),
    name: row.name || '',
    status: row.status,
    capacity: Number(row.capacity || 0),
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    restoredFrom: Number(row.restored_from || 0),
    createdBy: row.created_by || '',
    publishedBy: row.published_by || '',
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (withDocument) mapped.document = row.document && typeof row.document === 'object' ? row.document : {};
  return mapped;
}

async function listLayoutVersions(attractionId, screenId) {
  const result = await query(
    `SELECT * FROM bc_cinema_layout_versions
      WHERE attraction_id = $1 AND screen_id = $2
      ORDER BY version DESC`,
    [T.toInt(attractionId, 0), T.toInt(screenId, 0)]
  );
  return result.rows.map((row) => mapLayoutVersion(row));
}

async function loadScreenRow(attractionId, screenId) {
  const result = await query(
    `SELECT * FROM bc_cinema_screens WHERE id = $1 AND attraction_id = $2`,
    [T.toInt(screenId, 0), T.toInt(attractionId, 0)]
  );
  return result.rows[0] || null;
}

/** Fill in a document for versions published before the editor existed. */
async function documentForVersion(screen, version) {
  const stored = version?.document;
  if (stored && Array.isArray(stored.seats) && stored.seats.length) {
    return L.normalizeDocument(stored).document;
  }
  const seats = version?.id
    ? (await query(`SELECT * FROM bc_cinema_seats WHERE layout_version_id = $1 ORDER BY y ASC, x ASC`, [version.id])).rows
    : [];
  return L.documentFromSeats(seats.map((row) => ({
    id: row.id, row: row.row_label, number: row.seat_no, x: row.x, y: row.y,
    category: row.category, status: row.status, priceOverride: row.price_override, label: row.custom_label,
  })), screen);
}

async function getScreenLayout(attractionId, screenId) {
  const screen = await loadScreenRow(attractionId, screenId);
  if (!screen) return { ok: false, status: 404, error: 'Auditorium not found' };
  const versions = await listLayoutVersions(attractionId, screenId);
  const draftRow = versions.find((entry) => entry.status === 'draft') || null;
  const activeRow = versions.find((entry) => entry.id === Number(screen.active_layout_version_id)) || null;
  const [seatTypes, draftFull, activeFull] = await Promise.all([
    ensureSeatTypes(attractionId),
    draftRow ? query(`SELECT * FROM bc_cinema_layout_versions WHERE id = $1`, [draftRow.id]).then((res) => res.rows[0]) : null,
    activeRow ? query(`SELECT * FROM bc_cinema_layout_versions WHERE id = $1`, [activeRow.id]).then((res) => res.rows[0]) : null,
  ]);
  const draftDocument = draftFull ? await documentForVersion(screen, draftFull) : null;
  const publishedDocument = activeFull ? await documentForVersion(screen, activeFull) : null;
  return {
    ok: true,
    screen: mapScreen(screen),
    versions,
    seatTypes,
    draft: draftFull ? { ...mapLayoutVersion(draftFull), document: draftDocument } : null,
    published: activeFull ? { ...mapLayoutVersion(activeFull), document: publishedDocument } : null,
    templates: L.layoutTemplates(),
  };
}

async function logLayoutAudit({ attractionId, screenId = 0, versionId = 0, actorEmail = '', actorRole = '', action, details = {} }) {
  try {
    await query(
      `INSERT INTO bc_cinema_layout_audit
         (attraction_id, screen_id, version_id, actor_email, actor_role, action, details)
       VALUES ($1,$2,$3,COALESCE($4, ''),COALESCE($5, ''),COALESCE($6, ''),$7)`,
      [T.toInt(attractionId, 0), T.toInt(screenId, 0), T.toInt(versionId, 0), String(actorEmail || '').toLowerCase(),
        String(actorRole || ''), String(action || '').slice(0, 80), JSON.stringify(details || {})]
    );
  } catch (error) {
    console.warn('[cinema] layout audit failed:', error.message);
  }
}

async function nextVersionNumber(client, screenId) {
  const result = await client.query(
    `SELECT COALESCE(MAX(version), 0)::int + 1 AS next FROM bc_cinema_layout_versions WHERE screen_id = $1`,
    [screenId]
  );
  return Number(result.rows[0]?.next || 1);
}

/** Save the working copy. Drafts are per auditorium and never go live by themselves. */
async function saveLayoutDraft({ attractionId, screenId, versionId = 0, document, name = '', actor = '', role = '' }) {
  const cinematicId = T.toInt(attractionId, 0);
  const screen = await loadScreenRow(cinematicId, screenId);
  if (!screen) return { ok: false, status: 404, error: 'Auditorium not found' };
  const seatTypes = await ensureSeatTypes(cinematicId);
  const validation = L.validateLayout(document, { seatTypes });

  let draft = versionId ? (await query(
    `SELECT * FROM bc_cinema_layout_versions WHERE id = $1 AND screen_id = $2 AND attraction_id = $3`,
    [T.toInt(versionId, 0), T.toInt(screenId, 0), cinematicId]
  )).rows[0] : null;
  if (draft && draft.status !== 'draft') {
    return { ok: false, status: 409, error: 'Published layouts are read-only. Restore it to a draft first.' };
  }
  if (!draft) {
    draft = (await query(
      `SELECT * FROM bc_cinema_layout_versions WHERE screen_id = $1 AND status = 'draft' ORDER BY version DESC LIMIT 1`,
      [T.toInt(screenId, 0)]
    )).rows[0] || null;
  }

  const payload = { ...validation.document, meta: { name: String(name || '').slice(0, 80) } };
  if (draft) {
    const updated = await query(
      `UPDATE bc_cinema_layout_versions
          SET document = $2, capacity = $3, warnings = $4, name = COALESCE(NULLIF($5, ''), name),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [draft.id, JSON.stringify(payload), validation.capacity, JSON.stringify(validation.warnings), String(name || '')]
    );
    await logLayoutAudit({
      attractionId: cinematicId, screenId: T.toInt(screenId, 0), versionId: draft.id, actorEmail: actor, actorRole: role,
      action: 'layout.draft-save', details: { seats: validation.seatCount, capacity: validation.capacity, errors: validation.errors.length },
    });
    return { ok: true, version: mapLayoutVersion(updated.rows[0], { withDocument: true }), validation };
  }

  const inserted = await withTransaction(async (client) => {
    const version = await nextVersionNumber(client, T.toInt(screenId, 0));
    const res = await client.query(
      `INSERT INTO bc_cinema_layout_versions
         (attraction_id, screen_id, version, name, status, document, capacity, warnings, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,COALESCE($8, ''))
       RETURNING *`,
      [cinematicId, T.toInt(screenId, 0), version, String(name || `Layout v${version}`).slice(0, 80),
        JSON.stringify(payload), validation.capacity, JSON.stringify(validation.warnings), String(actor || '').toLowerCase()]
    );
    return res.rows[0];
  });
  await logLayoutAudit({
    attractionId: cinematicId, screenId: T.toInt(screenId, 0), versionId: inserted.id, actorEmail: actor, actorRole: role,
    action: 'layout.draft-create', details: { version: inserted.version, seats: validation.seatCount },
  });
  return { ok: true, version: mapLayoutVersion(inserted, { withDocument: true }), validation };
}

/** Write the version's seats as permanent rows. Old versions keep their own rows. */
async function materializeSeats(client, { attractionId, screenId, version }) {
  await client.query(`DELETE FROM bc_cinema_seats WHERE layout_version_id = $1`, [version.id]);
  const seats = L.documentSeats(L.normalizeDocument(version.document).document);
  const chunk = 100;
  for (let start = 0; start < seats.length; start += chunk) {
    const slice = seats.slice(start, start + chunk);
    const values = [];
    const params = [version.id, T.toInt(attractionId, 0), T.toInt(screenId, 0)];
    for (const seat of slice) {
      const base = params.length + 1;
      values.push(`($3,$2,$1,$${base},$${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},COALESCE($${base + 8}, ''))`);
      params.push(seat.row, seat.number, seat.key, seat.category, seat.x, seat.y, seat.priceOverride, seat.status, seat.label);
    }
    await client.query(
      `INSERT INTO bc_cinema_seats
         (screen_id, attraction_id, layout_version_id, row_label, seat_no, seat_key, category, x, y, price_override, status, custom_label)
       VALUES ${values.join(',')}`,
      params
    );
  }
  return seats.length;
}

async function publishLayout({ attractionId, screenId, versionId, actor = '', role = '' }) {
  const cinematicId = T.toInt(attractionId, 0);
  const screen = await loadScreenRow(cinematicId, screenId);
  if (!screen) return { ok: false, status: 404, error: 'Auditorium not found' };
  const versionRow = (await query(
    `SELECT * FROM bc_cinema_layout_versions WHERE id = $1 AND screen_id = $2 AND attraction_id = $3`,
    [T.toInt(versionId, 0), T.toInt(screenId, 0), cinematicId]
  )).rows[0];
  if (!versionRow) return { ok: false, status: 404, error: 'Layout version not found' };
  if (versionRow.status !== 'draft') {
    return {
      ok: false,
      status: 409,
      error: 'Only a draft can be published. Restore this version to a draft to make changes to it.',
    };
  }

  const seatTypes = await ensureSeatTypes(cinematicId);
  const document = await documentForVersion(screen, versionRow);
  const validation = L.validateLayout(document, { seatTypes });
  if (!validation.ok) {
    return {
      ok: false,
      status: 409,
      error: `Fix ${validation.errors.length} problem${validation.errors.length === 1 ? '' : 's'} before publishing.`,
      validation,
    };
  }

  const result = await withTransaction(async (client) => {
    await client.query(`SELECT id FROM bc_cinema_screens WHERE id = $1 FOR UPDATE`, [T.toInt(screenId, 0)]);
    const seatCount = await materializeSeats(client, { attractionId: cinematicId, screenId, version: { ...versionRow, document } });
    await client.query(
      `UPDATE bc_cinema_layout_versions SET status = 'archived', updated_at = NOW()
        WHERE screen_id = $1 AND id <> $2 AND status = 'published'`,
      [T.toInt(screenId, 0), versionRow.id]
    );
    const published = await client.query(
      `UPDATE bc_cinema_layout_versions SET
         status = 'published', document = $2, capacity = $3, warnings = $4,
         published_by = COALESCE($5, ''), published_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [versionRow.id, JSON.stringify(document), validation.capacity, JSON.stringify(validation.warnings), String(actor || '').toLowerCase()]
    );
    const accessible = L.documentSeats(document).filter((seat) => {
      const type = seatTypes.find((entry) => entry.slug === seat.category);
      return type ? type.accessible || type.baseCategory === 'wheelchair' : seat.category === 'wheelchair';
    }).length;
    await client.query(
      `UPDATE bc_cinema_screens SET
         active_layout_version_id = $2, capacity = $3, row_count = $4, seats_per_row = $5,
         accessible_seats = $6, updated_at = NOW()
       WHERE id = $1`,
      [T.toInt(screenId, 0), versionRow.id, validation.capacity, validation.rows,
        Math.max(1, ...L.documentSeats(document).map((seat) => seat.x)), accessible]
    );
    return { version: published.rows[0], seatCount };
  });

  await logLayoutAudit({
    attractionId: cinematicId, screenId: T.toInt(screenId, 0), versionId: result.version.id, actorEmail: actor, actorRole: role,
    action: 'layout.publish',
    details: { version: result.version.version, seats: result.seatCount, capacity: validation.capacity, warnings: validation.warnings },
  });

  return {
    ok: true,
    version: mapLayoutVersion(result.version, { withDocument: true }),
    seats: await listSeats(screenId, { versionId: result.version.id }),
    validation,
  };
}

async function restoreLayoutVersion({ attractionId, screenId, versionId, actor = '', role = '' }) {
  const cinematicId = T.toInt(attractionId, 0);
  const screen = await loadScreenRow(cinematicId, screenId);
  if (!screen) return { ok: false, status: 404, error: 'Auditorium not found' };
  const source = (await query(
    `SELECT * FROM bc_cinema_layout_versions WHERE id = $1 AND screen_id = $2 AND attraction_id = $3`,
    [T.toInt(versionId, 0), T.toInt(screenId, 0), cinematicId]
  )).rows[0];
  if (!source) return { ok: false, status: 404, error: 'Layout version not found' };
  const document = await documentForVersion(screen, source);
  const saved = await saveLayoutDraft({
    attractionId: cinematicId,
    screenId,
    document,
    name: `Restored from v${source.version}`,
    actor,
    role,
  });
  if (!saved.ok) return saved;
  await query(
    `UPDATE bc_cinema_layout_versions SET restored_from = $2 WHERE id = $1`,
    [saved.version.id, source.id]
  );
  await logLayoutAudit({
    attractionId: cinematicId, screenId: T.toInt(screenId, 0), versionId: saved.version.id, actorEmail: actor, actorRole: role,
    action: 'layout.restore', details: { from: source.version },
  });
  return { ...saved, restoredFrom: source.version };
}

/** Copy a layout into a new auditorium (or replace another hall's draft). */
async function duplicateLayout({ attractionId, ownerEmail, sourceScreenId, targetScreenId = 0, targetName = '', actor = '', role = '' }) {
  const cinematicId = T.toInt(attractionId, 0);
  const source = await loadScreenRow(cinematicId, sourceScreenId);
  if (!source) return { ok: false, status: 404, error: 'Source auditorium not found' };
  const layout = await getScreenLayout(cinematicId, sourceScreenId);
  const document = layout.draft?.document || layout.published?.document;
  if (!document) return { ok: false, status: 409, error: 'This auditorium has no layout to copy yet' };

  if (T.toInt(targetScreenId, 0)) {
    const target = await loadScreenRow(cinematicId, targetScreenId);
    if (!target) return { ok: false, status: 404, error: 'Target auditorium not found' };
    const saved = await saveLayoutDraft({ attractionId: cinematicId, screenId: T.toInt(targetScreenId, 0), document, actor, role });
    if (!saved.ok) return saved;
    await logLayoutAudit({
      attractionId: cinematicId, screenId: T.toInt(targetScreenId, 0), versionId: saved.version.id, actorEmail: actor, actorRole: role,
      action: 'layout.duplicate-into', details: { fromScreen: source.id, name: target.name },
    });
    return { ok: true, screenId: T.toInt(targetScreenId, 0), version: saved.version };
  }

  const name = String(targetName || `${source.name} (copy)`).trim().slice(0, 60) || 'Auditorium copy';
  const screen = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO bc_cinema_screens
         (attraction_id, owner_email, name, screen_type, hall_kind, row_count, seats_per_row, features, status, sort_order)
       VALUES ($1,COALESCE($2, ''),$3,$4,$5,$6,$7,$8,'inactive',$9)
       RETURNING *`,
      [cinematicId, String(ownerEmail || '').toLowerCase(), name, source.screen_type, source.hall_kind || 'standard',
        source.row_count, source.seats_per_row, JSON.stringify(source.features || {}), Number(source.sort_order || 0) + 1]
    );
    return inserted.rows[0];
  });
  const saved = await saveLayoutDraft({ attractionId: cinematicId, screenId: screen.id, document, actor, role });
  if (!saved.ok) return saved;
  await logLayoutAudit({
    attractionId: cinematicId, screenId: screen.id, versionId: saved.version.id, actorEmail: actor, actorRole: role,
    action: 'layout.duplicate', details: { fromScreen: source.id, name },
  });
  return { ok: true, screen: mapScreen(screen), version: saved.version };
}

// ─── Seat layout ─────────────────────────────────────────────────────────────

function mapSeat(row) {
  return {
    id: row.id,
    screenId: row.screen_id,
    layoutVersionId: Number(row.layout_version_id || 0),
    label: row.seat_key,
    row: row.row_label,
    number: Number(row.seat_no),
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    x: Number(row.x || 0),
    y: Number(row.y || 0),
    priceOverride: row.price_override === null ? null : Number(row.price_override),
    customLabel: row.custom_label || '',
    status: row.status,
  };
}

async function listSeats(screenId, { versionId = 0 } = {}) {
  const scope = T.toInt(versionId, 0);
  const result = scope
    ? await query(
      `SELECT * FROM bc_cinema_seats WHERE screen_id = $1 AND layout_version_id = $2 ORDER BY y ASC, x ASC, seat_no ASC`,
      [T.toInt(screenId, 0), scope]
    )
    : await query(
      `SELECT * FROM bc_cinema_seats WHERE screen_id = $1 ORDER BY y ASC, x ASC, seat_no ASC LIMIT 2000`,
      [T.toInt(screenId, 0)]
    );
  return result.rows.map(mapSeat);
}

/**
 * Legacy entry point: the old grid editor posts a flat seat list. It now becomes
 * a draft that is published straight away, so the previous version's seats stay
 * attached to screenings that already sold tickets.
 */
async function saveSeatLayout({ attractionId, screenId, seats, actor = '', role = '' }) {
  const screen = await loadScreenRow(attractionId, screenId);
  if (!screen) return { ok: false, status: 404, error: 'Screen not found' };
  if (!Array.isArray(seats) || !seats.length) {
    return { ok: false, status: 400, error: 'Add at least one seat to the layout' };
  }
  if (seats.length > L.MAX_SEATS) {
    return { ok: false, status: 400, error: `A screen cannot hold more than ${L.MAX_SEATS} seats` };
  }

  const prepared = seats.map((seat, index) => ({
    id: seat.id || `legacy-${index}`,
    row: seat.row,
    number: seat.number ?? seat.no,
    x: seat.x,
    y: seat.y,
    category: seat.category,
    status: seat.status,
    priceOverride: seat.priceOverride,
    label: seat.customLabel || seat.label,
  }));
  const document = L.documentFromSeats(prepared, screen);
  const saved = await saveLayoutDraft({
    attractionId,
    screenId,
    document,
    name: 'Grid layout',
    actor,
    role,
  });
  if (!saved.ok) return saved;
  const published = await publishLayout({ attractionId, screenId, versionId: saved.version.id, actor, role });
  if (!published.ok) {
    return { ok: false, status: published.status || 400, error: published.error, validation: published.validation };
  }
  return { ok: true, seats: await listSeats(screenId) };
}

// ─── Pricing rules ───────────────────────────────────────────────────────────

const PRICING_SCOPES = ['all', 'weekday', 'weekend', 'date', 'screening'];

function mapPricingRule(row) {
  return {
    id: row.id,
    attractionId: row.attraction_id,
    name: row.name,
    scope: row.scope || 'all',
    weekdays: Array.isArray(row.weekdays) ? row.weekdays.map(Number) : [],
    dateFrom: row.date_from ? T.isoDate(row.date_from) : '',
    dateTo: row.date_to ? T.isoDate(row.date_to) : '',
    showtimeId: Number(row.showtime_id || 0),
    adjustment: row.adjustment === 'amount' ? 'amount' : 'multiplier',
    value: Number(row.value ?? 1),
    categoryPrices: row.category_prices && typeof row.category_prices === 'object' ? row.category_prices : {},
    priority: Number(row.priority || 0),
    status: row.status || 'active',
  };
}

async function listPricingRules(attractionId) {
  const result = await query(
    `SELECT * FROM bc_cinema_pricing_rules WHERE attraction_id = $1 ORDER BY priority DESC, id DESC`,
    [T.toInt(attractionId, 0)]
  );
  return result.rows.map(mapPricingRule);
}

function cleanCategoryPrices(input) {
  if (!input || typeof input !== 'object') return {};
  const output = {};
  for (const [slug, value] of Object.entries(input)) {
    const key = L.slugify(slug);
    const price = Number(value);
    if (!key || !Number.isFinite(price) || price < 0) continue;
    output[key] = L.round2(price);
  }
  return output;
}

async function savePricingRule(attractionId, ownerEmail, input = {}) {
  const id = T.toInt(input.id, 0);
  const cinematicId = T.toInt(attractionId, 0);
  const name = T.text(input.name, 80);
  if (!name) return { ok: false, status: 400, error: 'Give the pricing rule a name' };
  const scope = PRICING_SCOPES.includes(input.scope) ? input.scope : 'all';
  const adjustment = input.adjustment === 'amount' ? 'amount' : 'multiplier';
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) return { ok: false, status: 400, error: 'Enter a valid adjustment value' };

  const weekdays = Array.isArray(input.weekdays)
    ? Array.from(new Set(input.weekdays.map((day) => T.toInt(day, 0)).filter((day) => day >= 1 && day <= 7)))
    : [];
  const dateFrom = T.isDateISO(input.dateFrom) ? input.dateFrom : null;
  const dateTo = T.isDateISO(input.dateTo) ? input.dateTo : null;
  if (scope === 'date' && (!dateFrom || !dateTo)) {
    return { ok: false, status: 400, error: 'A date-specific rule needs a from and a to date' };
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { ok: false, status: 400, error: 'The rule start date must be before its end date' };
  }
  const showtimeId = scope === 'screening' ? T.toInt(input.showtimeId, 0) : 0;
  if (scope === 'screening' && !showtimeId) return { ok: false, status: 400, error: 'Choose the screening this rule applies to' };

  const rule = {
    name, scope, weekdays, dateFrom, dateTo, showtimeId, adjustment, value,
    categoryPrices: cleanCategoryPrices(input.categoryPrices),
    priority: Math.min(1000, Math.max(0, T.toInt(input.priority, 0))),
    status: input.status === 'inactive' ? 'inactive' : 'active',
  };

  if (id) {
    const existing = await query(
      `SELECT id FROM bc_cinema_pricing_rules WHERE id = $1 AND attraction_id = $2`,
      [id, cinematicId]
    );
    if (!existing.rows.length) return { ok: false, status: 404, error: 'Pricing rule not found' };
    const updated = await query(
      `UPDATE bc_cinema_pricing_rules SET
         name = $3, scope = $4, weekdays = $5, date_from = $6, date_to = $7, showtime_id = $8,
         adjustment = $9, value = $10, category_prices = $11, priority = $12, status = $13, updated_at = NOW()
       WHERE id = $1 AND attraction_id = $2
       RETURNING *`,
      [id, cinematicId, rule.name, rule.scope, JSON.stringify(rule.weekdays), rule.dateFrom, rule.dateTo,
        rule.showtimeId, rule.adjustment, rule.value, JSON.stringify(rule.categoryPrices), rule.priority, rule.status]
    );
    await logLayoutAudit({ attractionId: cinematicId, actorEmail: ownerEmail, action: 'pricing-rule.update', details: { name } });
    return { ok: true, rule: mapPricingRule(updated.rows[0]) };
  }

  const inserted = await query(
    `INSERT INTO bc_cinema_pricing_rules
       (attraction_id, name, scope, weekdays, date_from, date_to, showtime_id, adjustment, value,
        category_prices, priority, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [cinematicId, rule.name, rule.scope, JSON.stringify(rule.weekdays), rule.dateFrom, rule.dateTo,
      rule.showtimeId, rule.adjustment, rule.value, JSON.stringify(rule.categoryPrices), rule.priority, rule.status]
  );
  await logLayoutAudit({ attractionId: cinematicId, actorEmail: ownerEmail, action: 'pricing-rule.create', details: { name } });
  return { ok: true, rule: mapPricingRule(inserted.rows[0]) };
}

async function deletePricingRule(attractionId, ownerEmail, identifier) {
  const cinematicId = T.toInt(attractionId, 0);
  const deleted = await query(
    `DELETE FROM bc_cinema_pricing_rules WHERE attraction_id = $1 AND id = $2::int RETURNING name`,
    [cinematicId, T.toInt(identifier, 0)]
  );
  if (!deleted.rows.length) return { ok: false, status: 404, error: 'Pricing rule not found' };
  await logLayoutAudit({ attractionId: cinematicId, actorEmail: ownerEmail, action: 'pricing-rule.delete', details: { name: deleted.rows[0].name } });
  return { ok: true };
}

// ─── Layout templates ────────────────────────────────────────────────────────

async function saveLayoutTemplate({ attractionId, ownerEmail, name, description = '', document }) {
  const cinematicId = T.toInt(attractionId, 0);
  const label = T.text(name, 80);
  if (!label) return { ok: false, status: 400, error: 'Give the template a name' };
  const seatTypes = await ensureSeatTypes(cinematicId);
  const validation = L.validateLayout(document, { seatTypes });
  if (!validation.ok) return { ok: false, status: 409, error: validation.errors[0], validation };
  const inserted = await query(
    `INSERT INTO bc_cinema_layout_templates
       (attraction_id, name, description, kind, document, capacity, created_by)
     VALUES ($1,$2,COALESCE($3, ''),'custom',$4,$5,COALESCE($6, ''))
     RETURNING *`,
    [cinematicId, label, T.text(description, 240), JSON.stringify(validation.document), validation.capacity,
      String(ownerEmail || '').toLowerCase()]
  );
  await logLayoutAudit({ attractionId: cinematicId, actorEmail: ownerEmail, action: 'template.save', details: { name: label } });
  return { ok: true, template: mapLayoutTemplate(inserted.rows[0]) };
}

function mapLayoutTemplate(row) {
  return {
    id: row.id,
    attractionId: row.attraction_id,
    name: row.name,
    description: row.description || '',
    kind: row.kind || 'custom',
    capacity: Number(row.capacity || 0),
    document: row.document && typeof row.document === 'object' ? row.document : {},
    createdAt: row.created_at,
  };
}

async function listLayoutTemplates(attractionId) {
  const result = await query(
    `SELECT * FROM bc_cinema_layout_templates
      WHERE status = 'active' AND (attraction_id = $1 OR attraction_id = 0)
      ORDER BY id DESC`,
    [T.toInt(attractionId, 0)]
  );
  return result.rows.map(mapLayoutTemplate);
}

async function deleteLayoutTemplate(attractionId, ownerEmail, templateId) {
  const cinematicId = T.toInt(attractionId, 0);
  const deleted = await query(
    `DELETE FROM bc_cinema_layout_templates WHERE id = $1 AND attraction_id = $2 RETURNING name`,
    [T.toInt(templateId, 0), cinematicId]
  );
  if (!deleted.rows.length) return { ok: false, status: 404, error: 'Template not found' };
  await logLayoutAudit({ attractionId: cinematicId, actorEmail: ownerEmail, action: 'template.delete', details: { name: deleted.rows[0].name } });
  return { ok: true };
}

// ─── Admin review ────────────────────────────────────────────────────────────

async function listLayoutPublications({ limit = 100 } = {}) {
  const result = await query(
    `SELECT v.id, v.attraction_id, v.screen_id, v.version, v.name, v.status, v.capacity,
            v.published_by, v.published_at, v.warnings,
            sc.name AS screen_name, p.name AS cinema_name
       FROM bc_cinema_layout_versions v
       LEFT JOIN bc_cinema_screens sc ON sc.id = v.screen_id
       LEFT JOIN bc_attraction_profiles p ON p.id = v.attraction_id
      WHERE v.status IN ('published', 'archived')
      ORDER BY COALESCE(v.published_at, v.created_at) DESC
      LIMIT $1`,
    [Math.min(500, Math.max(1, T.toInt(limit, 100)))]
  );
  const audit = await query(
    `SELECT * FROM bc_cinema_layout_audit ORDER BY created_at DESC LIMIT $1`,
    [Math.min(500, Math.max(1, T.toInt(limit, 100)))]
  );
  return {
    publications: result.rows.map((row) => ({
      id: row.id,
      attractionId: row.attraction_id,
      cinemaName: row.cinema_name || '',
      screenId: row.screen_id,
      screenName: row.screen_name || '',
      version: Number(row.version || 0),
      name: row.name || '',
      status: row.status,
      capacity: Number(row.capacity || 0),
      publishedBy: row.published_by || '',
      publishedAt: row.published_at,
      warnings: Array.isArray(row.warnings) ? row.warnings : [],
    })),
    audit: audit.rows.map((row) => ({
      id: row.id,
      attractionId: row.attraction_id,
      screenId: row.screen_id,
      versionId: row.version_id,
      actorEmail: row.actor_email,
      action: row.action,
      details: row.details || {},
      createdAt: row.created_at,
    })),
  };
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
    layoutVersionId: Number(row.layout_version_id || 0),
    priceRuleId: Number(row.price_rule_id || 0),
    pricingSnapshot: row.pricing_snapshot && typeof row.pricing_snapshot === 'object' ? row.pricing_snapshot : null,
    status: row.status,
    notes: row.notes || '',
    seatsTotal: row.seats_total === undefined ? undefined : Number(row.seats_total || 0),
    seatsSold: row.seats_sold === undefined ? undefined : Number(row.seats_sold || 0),
  };
}

const SHOWTIME_SELECT = `
  SELECT sh.*, sc.name AS screen_name, sc.screen_type,
         mv.title AS movie_title, mv.poster_url, mv.duration_min, mv.format, mv.age_rating,
         (SELECT COUNT(*) FROM bc_cinema_seats st
           WHERE st.screen_id = sh.screen_id
             AND (sh.layout_version_id = 0 OR st.layout_version_id = sh.layout_version_id))::int AS seats_total,
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

  const cinematicId = T.toInt(attractionId, 0);
  const screen = await query(
    `SELECT * FROM bc_cinema_screens WHERE id = $1 AND attraction_id = $2`,
    [screenId, cinematicId]
  );
  if (!screen.rows.length) return { ok: false, status: 404, error: 'Screen not found for this cinema' };
  const screenRow = screen.rows[0];
  if (screenRow.status !== 'active') return { ok: false, status: 409, error: 'This screen is deactivated' };

  const existingShowtime = id
    ? (await query(`SELECT * FROM bc_cinema_showtimes WHERE id = $1 AND attraction_id = $2`, [id, cinematicId])).rows[0]
    : null;
  if (id && !existingShowtime) return { ok: false, status: 404, error: 'Showtime not found' };

  const claimedCount = existingShowtime
    ? Number((await query(
      `SELECT COUNT(*)::int AS n FROM bc_cinema_seat_states WHERE showtime_id = $1`,
      [id]
    )).rows[0]?.n || 0)
    : 0;

  // A screening keeps the layout it was scheduled against. Republishing a hall's
  // layout must never renumber seats that are already held or sold, so an edit
  // only adopts the active layout while nothing has been claimed yet.
  let layoutVersionId = Number(screenRow.active_layout_version_id || 0);
  const pinnedVersionId = Number(existingShowtime?.layout_version_id || 0);
  if (pinnedVersionId && pinnedVersionId !== layoutVersionId && claimedCount > 0) layoutVersionId = pinnedVersionId;

  const seatCount = await query(
    `SELECT COUNT(*)::int AS n FROM bc_cinema_seats WHERE screen_id = $1 AND layout_version_id = $2`,
    [screenId, layoutVersionId]
  );
  if (Number(seatCount.rows[0]?.n || 0) < 1) {
    return { ok: false, status: 409, error: 'Publish a seating layout for this auditorium before scheduling it' };
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

  // Freeze the seat prices for this screening: editing the hall's seat types or
  // pricing rules later must not silently reprice a screening that already sold.
  const seatTypes = await ensureSeatTypes(cinematicId);
  const pricingRules = await listPricingRules(cinematicId);
  const pricingSnapshot = claimedCount > 0 && existingShowtime?.pricing_snapshot
    ? existingShowtime.pricing_snapshot
    : L.buildPricingSnapshot({ basePrice, currency, seatTypes, rules: pricingRules, showDate, showtimeId: id });

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
         notes = COALESCE($14, ''), layout_version_id = $15, pricing_snapshot = $16, price_rule_id = $17,
         updated_at = NOW()
       WHERE id = $1 AND attraction_id = $2
       RETURNING id`,
      [id, cinematicId, screenId, movieId, showDate, startTime, startsAt.toISOString(),
        endsAt.toISOString(), salesOpenAt ? salesOpenAt.toISOString() : null,
        salesCloseAt ? salesCloseAt.toISOString() : null, basePrice, currency, status, notes,
        layoutVersionId, JSON.stringify(pricingSnapshot), Number(pricingSnapshot.ruleId || 0)]
    );
    return { ok: true, showtime: mapShowtime(await loadShowtime(updated.rows[0].id)) };
  }

  try {
    const inserted = await query(
      `INSERT INTO bc_cinema_showtimes
         (attraction_id, screen_id, movie_id, owner_email, show_date, start_time, starts_at, ends_at,
          sales_open_at, sales_close_at, base_price, currency, status, notes,
          layout_version_id, pricing_snapshot, price_rule_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14, ''),$15,$16,$17)
       RETURNING id`,
      [cinematicId, screenId, movieId, String(ownerEmail || '').toLowerCase(), showDate,
        startTime, startsAt.toISOString(), endsAt.toISOString(),
        salesOpenAt ? salesOpenAt.toISOString() : null, salesCloseAt ? salesCloseAt.toISOString() : null,
        basePrice, currency, status, notes,
        layoutVersionId, JSON.stringify(pricingSnapshot), Number(pricingSnapshot.ruleId || 0)]
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

/**
 * Seat price for one screening, in order of authority: the seat's own override,
 * the price frozen on the screening, the seat type's default price, and finally
 * the base price scaled by the type multiplier.
 */
function priceForSeat(seat, showtime, settings, seatTypes = []) {
  if (seat.price_override !== null && seat.price_override !== undefined) {
    return money(seat.price_override);
  }
  const frozen = L.snapshotPrice(showtime.pricing_snapshot, seat.category);
  if (frozen !== null) return money(frozen);

  const type = seatTypes.length ? L.seatTypeMap(seatTypes).get(seat.category) : null;
  if (type && type.defaultPrice !== null && type.defaultPrice !== undefined) {
    return money(type.defaultPrice);
  }
  const multiplier = Number(
    type?.multiplier
    ?? settings.categoryPrices?.[seat.category]
    ?? DEFAULT_CATEGORY_MULTIPLIERS[seat.category]
    ?? 1
  );
  return money(Number(showtime.base_price || 0) * multiplier);
}

function admissionsForSeat(seat, seatTypes = []) {
  if (seatTypes.length) {
    const type = L.seatTypeMap(seatTypes).get(seat.category);
    if (type) return Math.max(1, T.toInt(type.admissions, 1));
  }
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
 * Geometry of the layout a screening was scheduled against — screen, aisles,
 * entrances and sections — so the customer picker can draw the real hall.
 */
async function loadLayoutForShowtime(showtime, versionId) {
  const screen = await loadScreenRow(showtime.attraction_id, showtime.screen_id);
  const version = (await query(
    `SELECT * FROM bc_cinema_layout_versions WHERE id = $1 AND screen_id = $2 LIMIT 1`,
    [T.toInt(versionId, 0), T.toInt(showtime.screen_id, 0)]
  )).rows[0];
  if (!screen || !version) return null;
  const document = await documentForVersion(screen, version);
  return {
    versionId: version.id,
    version: Number(version.version || 0),
    name: version.name || '',
    cols: document.cols,
    spacing: document.spacing,
    screen: document.screen,
    aisles: document.aisles,
    entrances: document.entrances,
    sections: document.sections,
  };
}

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
  const seatTypes = await ensureSeatTypes(showtime.attraction_id);
  const typeMap = L.seatTypeMap(seatTypes);
  const versionId = Number(showtime.layout_version_id || 0);
  const seatsRes = versionId
    ? await query(
      `SELECT * FROM bc_cinema_seats WHERE screen_id = $1 AND layout_version_id = $2 ORDER BY y ASC, x ASC, seat_no ASC`,
      [showtime.screen_id, versionId]
    )
    : await query(
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
    const type = typeMap.get(mapped.category);
    if (type) {
      mapped.categoryLabel = type.name;
      mapped.categoryColor = type.color;
      mapped.categoryIcon = type.icon;
      mapped.baseCategory = type.baseCategory;
      mapped.bookingMode = type.bookingMode || 'single';
      mapped.splitAllowed = Boolean(type.splitAllowed);
      mapped.accessible = Boolean(type.accessible) || type.baseCategory === 'wheelchair';
      mapped.companionRequired = Boolean(type.companionRequired) || type.baseCategory === 'wheelchair';
      mapped.instructions = type.instructions || '';
    }
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
      : priceForSeat(seat, showtime, settings, seatTypes);
    mapped.admissions = admissionsForSeat(seat, seatTypes);
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

  const categories = Array.from(new Set(seats.map((seat) => seat.category)))
    .map((slug) => {
      const type = typeMap.get(slug);
      return {
        id: slug,
        label: type?.name || categoryLabel(slug),
        color: type?.color || '#94a3b8',
        icon: type?.icon || 'ph-armchair',
        count: seats.filter((seat) => seat.category === slug).length,
        price: priceForSeat({ category: slug, price_override: null }, showtime, settings, seatTypes),
      };
    })
    .filter((entry) => entry.count > 0);

  const cinema = await loadCinema(showtime.attraction_id);
  const layout = versionId ? await loadLayoutForShowtime(showtime, versionId) : null;

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
    layout,
    seatTypes: seatTypes.map((type) => ({
      slug: type.slug,
      name: type.name,
      color: type.color,
      icon: type.icon,
      baseCategory: type.baseCategory,
      bookingMode: type.bookingMode,
      groupSize: type.groupSize,
      splitAllowed: type.splitAllowed,
      accessible: type.accessible || type.baseCategory === 'wheelchair',
      companionRequired: type.companionRequired || type.baseCategory === 'wheelchair',
      instructions: type.instructions,
      defaultPrice: type.defaultPrice,
    })),
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
  const seatTypes = await ensureSeatTypes(showtime.attraction_id);
  const versionId = Number(showtime.layout_version_id || 0);

  const outcome = await withTransaction(async (client) => {
    await client.query(`SELECT id FROM bc_cinema_showtimes WHERE id = $1 FOR UPDATE`, [showtime.id]);

    const seatsRes = await client.query(
      `SELECT * FROM bc_cinema_seats
        WHERE id = ANY($1::int[]) AND screen_id = $2 AND status = 'available'
          AND ($3::int = 0 OR layout_version_id = $3::int)`,
      [ids, showtime.screen_id, versionId]
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
      price: priceForSeat(seat, showtime, settings, seatTypes),
      admissions: admissionsForSeat(seat, seatTypes),
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
    const seatTypes = await listSeatTypes(hold.attraction_id);
    const lines = statesRes.rows.map((row) => ({
      seatId: row.seat_id,
      label: row.seat_key,
      category: row.category,
      categoryLabel: categoryLabel(row.category),
      price: money(row.price),
      admissions: admissionsForSeat(row, seatTypes),
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
    const seatTypes = await listSeatTypes(order.attraction_id);
    for (const seat of seatsRes.rows) {
      const admissions = admissionsForSeat(seat, seatTypes);
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
  PRICING_SCOPES,
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
  deleteLayoutTemplate,
  deletePricingRule,
  deleteScreen,
  deleteSeatType,
  documentForVersion,
  duplicateLayout,
  ensureSeatTypes,
  getCinemaSettings,
  getScreenLayout,
  getSeatMap,
  listBookings,
  listLayoutPublications,
  listLayoutTemplates,
  listLayoutVersions,
  listMovies,
  listPricingRules,
  listPublicCinemas,
  listScreens,
  listSeatTypes,
  listSeats,
  listShowtimes,
  loadCinema,
  loadOrderByRef,
  loadScreenRow,
  loadShowtime,
  logLayoutAudit,
  mapLayoutVersion,
  mapOrder,
  mapMovie,
  mapPricingRule,
  mapScreen,
  mapSeat,
  mapSeatType,
  mapShowtime,
  priceForSeat,
  publicOrder,
  publishLayout,
  releaseExpiredHolds,
  releaseHold,
  requireAccess,
  restoreLayoutVersion,
  saveCinemaSettings,
  saveLayoutDraft,
  saveLayoutTemplate,
  saveMovie,
  savePricingRule,
  saveScreen,
  saveSeatLayout,
  saveSeatType,
  saveShowtime,
  settleBooking,
  stampFor,
  buildTotals,
};
