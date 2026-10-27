'use strict';

/**
 * Attraction ticketing domain layer.
 *
 * Everything that decides money, inventory or admission lives here so the owner
 * dashboard, the public checkout and the QR scanner all share one implementation.
 * Totals are always recomputed on the server; the browser only ever sends which
 * ticket types and how many.
 *
 * Write statements bind optional text through COALESCE($n, ''): managed Postgres
 * proxies (Nile) turn an empty-string parameter into NULL, which would violate
 * the NOT NULL "default empty" columns used across the ticketing tables.
 */

const crypto = require('crypto');
const { query, withTransaction } = require('./db');
const { getJwtSecret } = require('./google-verify');
const notificationHub = require('./notification-hub');
const stripeLib = require('./stripe');

const TICKET_CATEGORIES = [
  'adult', 'child', 'student', 'family', 'group', 'vip',
  'resident', 'international', 'guided', 'event',
];

const REFUND_POLICIES = ['flexible', 'moderate', 'non_refundable'];
const STAFF_ROLES = ['manager', 'scanner'];
const RESERVATION_TTL_MINUTES = 30;
const MAX_ORDER_TICKETS = 50;

const ROLE_RANK = { scanner: 1, manager: 2, owner: 3 };

// ─── Small helpers ───────────────────────────────────────────────────────────

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function isDateISO(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

/**
 * Normalise a DATE column (pg hands back a JS Date) or an ISO string into
 * 'YYYY-MM-DD'. String(date) would otherwise yield 'Mon Jun 01…'.
 */
function isoDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  const raw = String(value).trim();
  const head = raw.slice(0, 10);
  if (isDateISO(head)) return head;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : isoDate(parsed);
}

function isTimeHHMM(value) {
  if (!value) return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoney(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? round2(parsed) : fallback;
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value, max = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

function validCurrency(value) {
  const code = String(value || '').toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

function todayInZone() {
  return isoToday();
}

// ─── Access control ──────────────────────────────────────────────────────────

function roleAllows(role, need) {
  if (!role) return false;
  const have = ROLE_RANK[role] || 0;
  const want = ROLE_RANK[need] || 3;
  return have >= want;
}

/**
 * Resolve the caller's role for one attraction. Owners and active staff only —
 * there is no wildcard fallback, so a stranger can never manage someone's tickets.
 */
async function resolveAccess(email, attractionId) {
  const lower = String(email || '').toLowerCase();
  const id = toInt(attractionId, 0);
  if (!lower || !id) return { ok: false, status: 400, error: 'Attraction is required' };

  const result = await query(
    `SELECT p.id, p.name, p.owner_email, p.city, p.country, p.status, p.featured_image, p.currency,
            s.role AS staff_role
       FROM bc_attraction_profiles p
       LEFT JOIN bc_ticket_staff s
              ON s.attraction_id = p.id AND LOWER(s.email) = $2 AND s.status = 'active'
      WHERE p.id = $1 AND p.deleted = false
      LIMIT 1`,
    [id, lower]
  );

  const row = result.rows[0];
  if (!row) return { ok: false, status: 404, error: 'Attraction not found' };

  let role = '';
  if (String(row.owner_email || '').toLowerCase() === lower) role = 'owner';
  else if (row.staff_role) role = row.staff_role;

  if (!role) {
    return { ok: false, status: 403, error: 'You do not have ticketing access to this attraction' };
  }

  return { ok: true, role, attraction: row };
}

async function listAccessibleAttractions(email) {
  const lower = String(email || '').toLowerCase();
  const result = await query(
    `SELECT p.id, p.name, p.city, p.country, p.status, p.featured_image, p.currency,
            CASE WHEN LOWER(p.owner_email) = $1 THEN 'owner' ELSE s.role END AS role
       FROM bc_attraction_profiles p
       LEFT JOIN bc_ticket_staff s
              ON s.attraction_id = p.id AND LOWER(s.email) = $1 AND s.status = 'active'
      WHERE p.deleted = false AND (LOWER(p.owner_email) = $1 OR s.id IS NOT NULL)
      ORDER BY p.name ASC`,
    [lower]
  );
  return result.rows;
}

// ─── Settings ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  currency: 'USD',
  tax_percent: 0,
  service_fee_percent: 5,
  advance_booking_days: 180,
  min_lead_hours: 0,
  cancellation_window_hours: 24,
  auto_confirm: true,
  sales_paused: false,
  terms: '',
};

async function getSettings(attractionId) {
  const id = toInt(attractionId, 0);
  await query(`INSERT INTO bc_ticket_settings (attraction_id) VALUES ($1) ON CONFLICT (attraction_id) DO NOTHING`, [id]);
  const result = await query(`SELECT * FROM bc_ticket_settings WHERE attraction_id = $1`, [id]);
  return result.rows[0] || { attraction_id: id, ...DEFAULT_SETTINGS };
}

async function saveSettings(attractionId, input = {}) {
  const id = toInt(attractionId, 0);
  await getSettings(id);
  const currency = validCurrency(input.currency) || 'USD';
  const taxPercent = Math.min(100, Math.max(0, toMoney(input.tax_percent, DEFAULT_SETTINGS.tax_percent)));
  const feePercent = Math.min(100, Math.max(0, toMoney(input.service_fee_percent, DEFAULT_SETTINGS.service_fee_percent)));
  const advanceDays = Math.min(730, Math.max(1, toInt(input.advance_booking_days, DEFAULT_SETTINGS.advance_booking_days)));
  const leadHours = Math.min(720, Math.max(0, toInt(input.min_lead_hours, 0)));
  const cancelWindow = Math.min(720, Math.max(0, toInt(input.cancellation_window_hours, 24)));

  const result = await query(
    `UPDATE bc_ticket_settings
        SET currency = $2, tax_percent = $3, service_fee_percent = $4,
            advance_booking_days = $5, min_lead_hours = $6, cancellation_window_hours = $7,
            auto_confirm = $8, sales_paused = $9, terms = COALESCE($10, ''), updated_at = NOW()
      WHERE attraction_id = $1
      RETURNING *`,
    [
      id, currency, taxPercent, feePercent, advanceDays, leadHours, cancelWindow,
      input.auto_confirm !== false, Boolean(input.sales_paused), text(input.terms, 4000),
    ]
  );
  return result.rows[0];
}

// ─── Ticket types ────────────────────────────────────────────────────────────

function mapType(row) {
  if (!row) return null;
  return {
    id: row.id,
    attractionId: row.attraction_id,
    name: row.name,
    description: row.description,
    category: row.category,
    visitorCategory: row.visitor_category,
    price: Number(row.price || 0),
    currency: row.currency,
    minAge: row.min_age,
    maxAge: row.max_age,
    admissions: Number(row.admissions || 1),
    capacityTotal: Number(row.capacity_total || 0),
    dailyCapacity: Number(row.daily_capacity || 0),
    minPerOrder: Number(row.min_per_order || 1),
    maxPerOrder: Number(row.max_per_order || 10),
    salesStart: isoDate(row.sales_start) || null,
    salesEnd: isoDate(row.sales_end) || null,
    validFrom: isoDate(row.valid_from) || null,
    validTo: isoDate(row.valid_to) || null,
    requiresDate: row.requires_date !== false,
    slotRequired: row.slot_required === true,
    refundPolicy: row.refund_policy,
    refundWindowHours: Number(row.refund_window_hours ?? 24),
    cancellationFeePercent: Number(row.cancellation_fee_percent || 0),
    imageUrl: row.image_url || '',
    terms: row.terms || '',
    status: row.status,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
  };
}

async function listTicketTypes(attractionId, { includeArchived = false } = {}) {
  const id = toInt(attractionId, 0);
  const statuses = includeArchived ? ['active', 'inactive', 'archived'] : ['active', 'inactive'];
  const result = await query(
    `SELECT * FROM bc_ticket_types
      WHERE attraction_id = $1 AND status = ANY($2::text[])
      ORDER BY sort_order ASC, price ASC, id ASC`,
    [id, statuses]
  );
  const types = result.rows.map(mapType);
  if (!types.length) return [];

  const slotRes = await query(
    `SELECT * FROM bc_ticket_slots WHERE attraction_id = $1 ORDER BY start_time ASC, id ASC`,
    [id]
  );
  const slotsByType = new Map();
  for (const slot of slotRes.rows) {
    const list = slotsByType.get(slot.ticket_type_id) || [];
    list.push({
      id: slot.id,
      label: slot.label,
      startTime: slot.start_time,
      endTime: slot.end_time,
      capacity: Number(slot.capacity || 0),
      status: slot.status,
    });
    slotsByType.set(slot.ticket_type_id, list);
  }
  return types.map((type) => ({ ...type, slots: slotsByType.get(type.id) || [] }));
}

/**
 * Validate and normalise an owner's ticket type payload. Returns either
 * { ok:false, error } or { ok:true, value } — the caller never trusts raw input.
 */
function normalizeTicketType(input = {}, settings = DEFAULT_SETTINGS) {
  const name = text(input.name, 120);
  if (name.length < 2) return { ok: false, error: 'Ticket name is required' };

  const category = TICKET_CATEGORIES.includes(String(input.category || '').toLowerCase())
    ? String(input.category).toLowerCase()
    : 'adult';

  const price = toMoney(input.price, NaN);
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'Price must be zero or more' };

  const admissions = toInt(input.admissions, 1);
  if (admissions < 1 || admissions > 200) return { ok: false, error: 'Admissions per ticket must be between 1 and 200' };

  const dailyCapacity = toInt(input.dailyCapacity, 0);
  if (dailyCapacity < 0) return { ok: false, error: 'Daily capacity cannot be negative' };

  const capacityTotal = toInt(input.capacityTotal, 0);
  if (capacityTotal < 0) return { ok: false, error: 'Total sales limit cannot be negative' };

  const minPerOrder = Math.max(1, toInt(input.minPerOrder, 1));
  const maxPerOrder = Math.max(minPerOrder, Math.min(MAX_ORDER_TICKETS, toInt(input.maxPerOrder, 10)));
  if (minPerOrder > maxPerOrder) return { ok: false, error: 'Minimum per order cannot exceed the maximum' };

  const minAge = toNumberOrNull(input.minAge);
  const maxAge = toNumberOrNull(input.maxAge);
  if (minAge !== null && (minAge < 0 || minAge > 120)) return { ok: false, error: 'Minimum age must be between 0 and 120' };
  if (maxAge !== null && (maxAge < 0 || maxAge > 120)) return { ok: false, error: 'Maximum age must be between 0 and 120' };
  if (minAge !== null && maxAge !== null && minAge > maxAge) {
    return { ok: false, error: 'Minimum age cannot exceed maximum age' };
  }

  for (const key of ['salesStart', 'salesEnd', 'validFrom', 'validTo']) {
    if (input[key] && !isDateISO(input[key])) return { ok: false, error: `${key} must be a valid date` };
  }
  if (input.salesStart && input.salesEnd && input.salesStart > input.salesEnd) {
    return { ok: false, error: 'Sale end date must be after the sale start date' };
  }
  if (input.validFrom && input.validTo && input.validFrom > input.validTo) {
    return { ok: false, error: 'Validity end date must be after the validity start date' };
  }

  const refundPolicy = REFUND_POLICIES.includes(String(input.refundPolicy || ''))
    ? String(input.refundPolicy)
    : 'moderate';

  return {
    ok: true,
    value: {
      name,
      description: text(input.description, 2000),
      category,
      visitorCategory: text(input.visitorCategory, 80),
      price,
      currency: validCurrency(input.currency) || settings.currency || 'USD',
      minAge,
      maxAge,
      admissions,
      capacityTotal,
      dailyCapacity,
      minPerOrder,
      maxPerOrder,
      salesStart: input.salesStart || null,
      salesEnd: input.salesEnd || null,
      validFrom: input.validFrom || null,
      validTo: input.validTo || null,
      requiresDate: input.requiresDate !== false,
      slotRequired: Boolean(input.slotRequired),
      refundPolicy,
      refundWindowHours: Math.min(720, Math.max(0, toInt(input.refundWindowHours, 24))),
      cancellationFeePercent: Math.min(100, Math.max(0, toMoney(input.cancellationFeePercent, 0))),
      imageUrl: text(input.imageUrl, 800),
      terms: text(input.terms, 4000),
      status: ['active', 'inactive', 'archived'].includes(input.status) ? input.status : 'active',
      sortOrder: toInt(input.sortOrder, 0),
    },
  };
}

async function saveTicketType(attractionId, ownerEmail, input, existingId = null) {
  const settings = await getSettings(attractionId);
  const normalized = normalizeTicketType(input, settings);
  if (!normalized.ok) return normalized;
  const v = normalized.value;

  if (existingId) {
    const existing = await query(`SELECT id FROM bc_ticket_types WHERE id = $1 AND attraction_id = $2`, [
      toInt(existingId, 0), attractionId,
    ]);
    if (!existing.rows.length) return { ok: false, status: 404, error: 'Ticket type not found' };

    const result = await query(
      `UPDATE bc_ticket_types SET
         name = $3, description = COALESCE($4, ''), category = $5, visitor_category = COALESCE($6, ''),
         price = $7, currency = $8,
         min_age = $9, max_age = $10, admissions = $11, capacity_total = $12, daily_capacity = $13,
         min_per_order = $14, max_per_order = $15, sales_start = $16, sales_end = $17,
         valid_from = $18, valid_to = $19, requires_date = $20, slot_required = $21,
         refund_policy = $22, refund_window_hours = $23, cancellation_fee_percent = $24,
         image_url = COALESCE($25, ''), terms = COALESCE($26, ''), status = $27, sort_order = $28, updated_at = NOW()
       WHERE id = $1 AND attraction_id = $2
       RETURNING *`,
      [
        toInt(existingId), attractionId, v.name, v.description, v.category, v.visitorCategory, v.price, v.currency,
        v.minAge, v.maxAge, v.admissions, v.capacityTotal, v.dailyCapacity, v.minPerOrder, v.maxPerOrder,
        v.salesStart, v.salesEnd, v.validFrom, v.validTo, v.requiresDate, v.slotRequired, v.refundPolicy,
        v.refundWindowHours, v.cancellationFeePercent, v.imageUrl, v.terms, v.status, v.sortOrder,
      ]
    );
    return { ok: true, ticketType: mapType(result.rows[0]) };
  }

  const result = await query(
    `INSERT INTO bc_ticket_types (
       attraction_id, owner_email, name, description, category, visitor_category, price, currency,
       min_age, max_age, admissions, capacity_total, daily_capacity, min_per_order, max_per_order,
       sales_start, sales_end, valid_from, valid_to, requires_date, slot_required, refund_policy,
       refund_window_hours, cancellation_fee_percent, image_url, terms, status, sort_order
     ) VALUES (
       $1,$2,$3,COALESCE($4, ''),$5,COALESCE($6, ''),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,COALESCE($25, ''),COALESCE($26, ''),$27,$28
     ) RETURNING *`,
    [
      attractionId, String(ownerEmail).toLowerCase(), v.name, v.description, v.category, v.visitorCategory,
      v.price, v.currency, v.minAge, v.maxAge, v.admissions, v.capacityTotal, v.dailyCapacity,
      v.minPerOrder, v.maxPerOrder, v.salesStart, v.salesEnd, v.validFrom, v.validTo,
      v.requiresDate, v.slotRequired, v.refundPolicy, v.refundWindowHours, v.cancellationFeePercent,
      v.imageUrl, v.terms, v.status, v.sortOrder,
    ]
  );
  return { ok: true, ticketType: mapType(result.rows[0]) };
}

async function replaceSlots(client, attractionId, ticketTypeId, slots = []) {
  await client.query(`DELETE FROM bc_ticket_slots WHERE ticket_type_id = $1`, [ticketTypeId]);
  for (const slot of slots) {
    const label = text(slot.label, 80) || `${text(slot.startTime, 5)} – ${text(slot.endTime, 5)}`;
    if (!label) continue;
    await client.query(
      `INSERT INTO bc_ticket_slots (ticket_type_id, attraction_id, label, start_time, end_time, capacity, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        ticketTypeId, attractionId, label,
        isTimeHHMM(slot.startTime) ? slot.startTime : '',
        isTimeHHMM(slot.endTime) ? slot.endTime : '',
        Math.max(0, toInt(slot.capacity, 0)),
        slot.status === 'inactive' ? 'inactive' : 'active',
      ]
    );
  }
}

// ─── Calendar / capacity / price resolution ──────────────────────────────────

async function getCalendar(attractionId, from, to) {
  const result = await query(
    `SELECT * FROM bc_ticket_calendar
      WHERE attraction_id = $1 AND visit_date BETWEEN $2 AND $3
      ORDER BY visit_date ASC`,
    [toInt(attractionId), from, to]
  );
  return result.rows;
}

function calendarFor(rows, ticketTypeId, visitDate) {
  const specific = rows.find(
    (row) => Number(row.ticket_type_id) === Number(ticketTypeId) && isoDate(row.visit_date) === visitDate
  );
  if (specific) return specific;
  return rows.find(
    (row) => Number(row.ticket_type_id) === 0 && isoDate(row.visit_date) === visitDate
  ) || null;
}

function resolvePrice(type, calendarRow) {
  if (calendarRow && calendarRow.price !== null && calendarRow.price !== undefined) {
    return round2(Number(calendarRow.price));
  }
  return round2(Number(type.price || 0));
}

function resolveDailyCapacity(type, calendarRow) {
  if (calendarRow && calendarRow.capacity !== null && calendarRow.capacity !== undefined) {
    return Math.max(0, Number(calendarRow.capacity));
  }
  return Math.max(0, Number(type.dailyCapacity || 0));
}

function isClosedOn(calendarRow) {
  return Boolean(calendarRow && (calendarRow.closed || calendarRow.kind === 'blackout'));
}

// ─── Promo codes ─────────────────────────────────────────────────────────────

async function validatePromo(attractionId, code, subtotal) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return { ok: true, discount: 0, promo: null };

  const result = await query(
    `SELECT * FROM bc_ticket_promos WHERE attraction_id = $1 AND UPPER(code) = $2 AND status = 'active' LIMIT 1`,
    [toInt(attractionId), normalized]
  );
  const promo = result.rows[0];
  if (!promo) return { ok: false, error: 'This promo code is not valid for this attraction' };

  const today = isoToday();
  if (promo.starts_at && isoDate(promo.starts_at) > today) {
    return { ok: false, error: 'This promo code is not active yet' };
  }
  if (promo.ends_at && isoDate(promo.ends_at) < today) {
    return { ok: false, error: 'This promo code has expired' };
  }
  if (Number(promo.max_redemptions) > 0 && Number(promo.redeemed) >= Number(promo.max_redemptions)) {
    return { ok: false, error: 'This promo code has reached its redemption limit' };
  }

  const percent = Number(promo.percent_off || 0);
  const amount = Number(promo.amount_off || 0);
  let discount = 0;
  if (percent > 0) discount += (subtotal * percent) / 100;
  if (amount > 0) discount += amount;
  discount = Math.min(subtotal, round2(discount));
  return { ok: true, discount, promo };
}

// ─── Quote (server-side pricing) ─────────────────────────────────────────────

/**
 * @param {object} params
 * @param {number} params.attractionId
 * @param {string} params.visitDate  ISO date
 * @param {number} [params.slotId]
 * @param {Array<{ticketTypeId:number|string, quantity:number}>} params.items
 * @param {string} [params.promoCode]
 * @param {boolean} [params.checkAvailability]  also verify remaining inventory
 */
async function computeQuote({ attractionId, visitDate, slotId = 0, items = [], promoCode = '', checkAvailability = true }) {
  if (!isDateISO(visitDate)) return { ok: false, status: 400, error: 'Choose a valid visit date' };
  if (visitDate < isoToday()) return { ok: false, status: 400, error: 'Visit date cannot be in the past' };

  const settings = await getSettings(attractionId);
  if (settings.sales_paused) return { ok: false, status: 409, error: 'Ticket sales are temporarily paused for this attraction' };

  const types = await listTicketTypes(attractionId);
  const byId = new Map(types.map((type) => [Number(type.id), type]));
  const calendarRows = await getCalendar(attractionId, visitDate, visitDate);

  const wanted = new Map();
  for (const item of items) {
    const id = toInt(item.ticketTypeId, 0);
    const quantity = toInt(item.quantity, 0);
    if (!id || quantity <= 0) continue;
    wanted.set(id, (wanted.get(id) || 0) + quantity);
  }
  if (!wanted.size) return { ok: false, status: 400, error: 'Select at least one ticket' };

  let totalQuantity = 0;
  for (const quantity of wanted.values()) totalQuantity += quantity;
  if (totalQuantity > MAX_ORDER_TICKETS) {
    return { ok: false, status: 400, error: `A single order can hold at most ${MAX_ORDER_TICKETS} tickets` };
  }

  const lines = [];
  let currency = settings.currency || 'USD';
  let slotLabel = '';

  for (const [typeId, quantity] of wanted) {
    const type = byId.get(typeId);
    if (!type) return { ok: false, status: 400, error: 'One of the selected ticket types is not for sale' };
    if (type.status !== 'active') return { ok: false, status: 409, error: `${type.name} is not currently on sale` };

    const calendarRow = calendarFor(calendarRows, typeId, visitDate);
    if (isClosedOn(calendarRow)) {
      return { ok: false, status: 409, error: `${type.name} is not available on ${visitDate}` };
    }
    if (type.salesStart && visitDate < type.salesStart) {
      return { ok: false, status: 409, error: `${type.name} sales open on ${type.salesStart}` };
    }
    if (type.salesEnd && visitDate > type.salesEnd) {
      return { ok: false, status: 409, error: `${type.name} sales closed on ${type.salesEnd}` };
    }
    if (type.validFrom && visitDate < type.validFrom) {
      return { ok: false, status: 409, error: `${type.name} is valid from ${type.validFrom}` };
    }
    if (type.validTo && visitDate > type.validTo) {
      return { ok: false, status: 409, error: `${type.name} is valid until ${type.validTo}` };
    }
    if (visitDate > addDaysISO(isoToday(), Number(settings.advance_booking_days || 180))) {
      return { ok: false, status: 409, error: 'That date is beyond the advance booking window' };
    }
    if (quantity < type.minPerOrder) {
      return { ok: false, status: 400, error: `${type.name} requires at least ${type.minPerOrder} ticket(s)` };
    }
    if (quantity > type.maxPerOrder) {
      return { ok: false, status: 400, error: `${type.name} allows at most ${type.maxPerOrder} ticket(s) per order` };
    }

    let selectedSlot = null;
    if (type.slotRequired) {
      selectedSlot = (type.slots || []).find((slot) => Number(slot.id) === Number(slotId) && slot.status === 'active');
      if (!selectedSlot) {
        return { ok: false, status: 400, error: `Choose an entry time for ${type.name}` };
      }
      slotLabel = selectedSlot.label;
    }

    if (currency && type.currency && type.currency !== currency) {
      return { ok: false, status: 409, error: 'Ticket currencies are inconsistent for this attraction' };
    }
    currency = type.currency || currency;

    const unitPrice = resolvePrice(type, calendarRow);
    lines.push({
      ticketTypeId: type.id,
      name: type.name,
      category: type.category,
      admissions: type.admissions,
      quantity,
      unitPrice,
      lineTotal: round2(unitPrice * quantity),
      slotId: selectedSlot ? selectedSlot.id : 0,
      slotLabel: selectedSlot ? selectedSlot.label : '',
      refundPolicy: type.refundPolicy,
      refundWindowHours: type.refundWindowHours,
      cancellationFeePercent: type.cancellationFeePercent,
    });
  }

  if (checkAvailability) {
    for (const line of lines) {
      const remaining = await remainingFor(line.ticketTypeId, visitDate, line.slotId);
      if (remaining !== null && remaining < line.quantity) {
        return {
          ok: false,
          status: 409,
          error: remaining === 0
            ? `${line.name} is sold out for ${visitDate}`
            : `Only ${remaining} ${line.name} ticket(s) left for ${visitDate}`,
        };
      }
    }
  }

  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const promo = await validatePromo(attractionId, promoCode, subtotal);
  if (!promo.ok) return { ok: false, status: 400, error: promo.error };

  const discount = promo.discount;
  const taxable = Math.max(0, round2(subtotal - discount));
  const taxAmount = round2((taxable * Number(settings.tax_percent || 0)) / 100);
  const serviceFee = round2((taxable * Number(settings.service_fee_percent || 0)) / 100);
  const total = round2(taxable + taxAmount + serviceFee);

  return {
    ok: true,
    quote: {
      attractionId: toInt(attractionId),
      visitDate,
      slotId: toInt(slotId, 0),
      slotLabel,
      lines,
      subtotal,
      discount,
      promoCode: promo.promo ? promo.promo.code : '',
      taxPercent: Number(settings.tax_percent || 0),
      taxAmount,
      serviceFeePercent: Number(settings.service_fee_percent || 0),
      serviceFee,
      total,
      currency,
      quantityTotal: totalQuantity,
      admissionsTotal: lines.reduce((sum, line) => sum + line.admissions * line.quantity, 0),
      settings,
    },
  };
}

// ─── Inventory ───────────────────────────────────────────────────────────────

async function ensureInventoryRow(client, { ticketTypeId, attractionId, visitDate, slotId = 0, capacity }) {
  const runner = client || { query };
  await runner.query(
    `INSERT INTO bc_ticket_inventory (ticket_type_id, attraction_id, visit_date, slot_id, capacity, sold, reserved)
     VALUES ($1,$2,$3,$4,$5,0,0)
     ON CONFLICT (ticket_type_id, visit_date, slot_id) DO NOTHING`,
    [ticketTypeId, attractionId, visitDate, slotId, Math.max(0, Number(capacity) || 0)]
  );
  const row = await runner.query(
    `UPDATE bc_ticket_inventory SET capacity = $4, updated_at = NOW()
      WHERE ticket_type_id = $1 AND visit_date = $2 AND slot_id = $3
      RETURNING *`,
    [ticketTypeId, visitDate, slotId, Math.max(0, Number(capacity) || 0)]
  );
  return row.rows[0];
}

async function lockInventoryRow(client, ticketTypeId, visitDate, slotId) {
  const result = await client.query(
    `SELECT * FROM bc_ticket_inventory
      WHERE ticket_type_id = $1 AND visit_date = $2 AND slot_id = $3
      FOR UPDATE`,
    [ticketTypeId, visitDate, slotId]
  );
  return result.rows[0] || null;
}

async function remainingFor(ticketTypeId, visitDate, slotId = 0) {
  const result = await query(
    `SELECT capacity, sold, reserved FROM bc_ticket_inventory
      WHERE ticket_type_id = $1 AND visit_date = $2 AND slot_id = $3`,
    [ticketTypeId, visitDate, slotId]
  );
  const row = result.rows[0];
  if (!row) {
    const typeRes = await query(`SELECT daily_capacity FROM bc_ticket_types WHERE id = $1`, [ticketTypeId]);
    const capacity = Number(typeRes.rows[0]?.daily_capacity || 0);
    if (!capacity) return null; // unlimited
    return capacity;
  }
  if (Number(row.capacity) <= 0) return null;
  return Math.max(0, Number(row.capacity) - Number(row.sold) - Number(row.reserved));
}

/**
 * Reserve inventory for every line of an order inside the caller's transaction.
 * Throws an Error with `.code = 'SOLD_OUT'` when the remaining stock is short.
 */
async function reserveInventory(client, { attractionId, visitDate, lines, typeMap, calendarRows }) {
  for (const line of lines) {
    const type = typeMap.get(Number(line.ticketTypeId));
    if (!type) throw Object.assign(new Error('Ticket type no longer exists'), { code: 'SOLD_OUT' });

    const calendarRow = calendarFor(calendarRows, type.id, visitDate);
    const dailyCapacity = resolveDailyCapacity(type, calendarRow);
    const dayRow = await ensureInventoryRow(client, {
      ticketTypeId: type.id, attractionId, visitDate, slotId: 0, capacity: dailyCapacity,
    });
    const lockedDay = await lockInventoryRow(client, type.id, visitDate, 0);
    const dayAvailable = Number(lockedDay.capacity) <= 0
      ? Infinity
      : Number(lockedDay.capacity) - Number(lockedDay.sold) - Number(lockedDay.reserved);
    if (dayAvailable < line.quantity) {
      throw Object.assign(
        new Error(`${type.name} only has ${Math.max(0, dayAvailable)} ticket(s) left for ${visitDate}`),
        { code: 'SOLD_OUT' }
      );
    }

    if (line.slotId) {
      const slot = (type.slots || []).find((entry) => Number(entry.id) === Number(line.slotId));
      const slotCapacity = slot ? Number(slot.capacity || 0) : 0;
      await ensureInventoryRow(client, {
        ticketTypeId: type.id, attractionId, visitDate, slotId: line.slotId, capacity: slotCapacity,
      });
      const lockedSlot = await lockInventoryRow(client, type.id, visitDate, line.slotId);
      const slotAvailable = Number(lockedSlot.capacity) <= 0
        ? Infinity
        : Number(lockedSlot.capacity) - Number(lockedSlot.sold) - Number(lockedSlot.reserved);
      if (slotAvailable < line.quantity) {
        throw Object.assign(
          new Error(`${type.name} at ${line.slotLabel} has ${Math.max(0, slotAvailable)} ticket(s) left`),
          { code: 'SOLD_OUT' }
        );
      }
      await client.query(
        `UPDATE bc_ticket_inventory SET reserved = reserved + $4, updated_at = NOW()
          WHERE ticket_type_id = $1 AND visit_date = $2 AND slot_id = $3`,
        [type.id, visitDate, line.slotId, line.quantity]
      );
    }

    await client.query(
      `UPDATE bc_ticket_inventory SET reserved = reserved + $3, updated_at = NOW()
        WHERE ticket_type_id = $1 AND visit_date = $2 AND slot_id = 0`,
      [type.id, visitDate, line.quantity]
    );

    // Store the resolved capacity row id for the caller's convenience.
    line.inventoryDayCapacity = Number(dayRow.capacity || 0);
  }
}

async function releaseReservation(client, orderId) {
  const items = await client.query(`SELECT * FROM bc_ticket_order_items WHERE order_id = $1`, [orderId]);
  for (const item of items.rows) {
    const qty = Number(item.quantity);
    const slots = [0, ...(Number(item.slot_id) ? [Number(item.slot_id)] : [])];
    for (const slotId of slots) {
      await client.query(
        `UPDATE bc_ticket_inventory SET reserved = GREATEST(0, reserved - $4), updated_at = NOW()
          WHERE ticket_type_id = $1 AND visit_date = $2 AND slot_id = $3`,
        [item.ticket_type_id, item.visit_date, slotId, qty]
      );
    }
  }
}

async function releaseExpiredHolds(limit = 50) {
  const expired = await query(
    `SELECT id FROM bc_ticket_orders
      WHERE status = 'pending_payment' AND expires_at IS NOT NULL AND expires_at < NOW()
      ORDER BY expires_at ASC LIMIT $1`,
    [Math.min(200, Math.max(1, toInt(limit, 50)))]
  );
  let released = 0;
  for (const row of expired.rows) {
    try {
      await withTransaction(async (client) => {
        const locked = await client.query(
          `SELECT id, status FROM bc_ticket_orders WHERE id = $1 FOR UPDATE`, [row.id]
        );
        if (!locked.rows.length || locked.rows[0].status !== 'pending_payment') return;
        await releaseReservation(client, row.id);
        await client.query(
          `UPDATE bc_ticket_orders SET status = 'expired', updated_at = NOW() WHERE id = $1`, [row.id]
        );
      });
      released += 1;
    } catch (error) {
      console.warn('[ticketing] Failed to release expired reservation', row.id, error.message);
    }
  }
  return released;
}

// ─── Availability ────────────────────────────────────────────────────────────

async function getAvailability(attractionId, visitDate) {
  const id = toInt(attractionId, 0);
  if (!isDateISO(visitDate)) return { ok: false, status: 400, error: 'Choose a valid visit date' };

  await releaseExpiredHolds(25);

  const settings = await getSettings(id);
  const attractionRes = await query(
    `SELECT id, name, city, country, featured_image, gallery, currency, description
       FROM bc_attraction_profiles WHERE id = $1 AND deleted = false LIMIT 1`,
    [id]
  );
  const attraction = attractionRes.rows[0];
  if (!attraction) return { ok: false, status: 404, error: 'Attraction not found' };

  const types = await listTicketTypes(id);
  const calendarRows = await getCalendar(id, visitDate, visitDate);

  const inventoryRes = await query(
    `SELECT ticket_type_id, slot_id, capacity, sold, reserved FROM bc_ticket_inventory
      WHERE attraction_id = $1 AND visit_date = $2`,
    [id, visitDate]
  );
  const inventory = new Map();
  for (const row of inventoryRes.rows) {
    inventory.set(`${row.ticket_type_id}:${row.slot_id}`, row);
  }

  const slotMap = new Map();
  const publicTypes = [];

  for (const type of types) {
    if (type.status !== 'active') continue;
    const calendarRow = calendarFor(calendarRows, type.id, visitDate);
    const closed = isClosedOn(calendarRow);
    const dayRow = inventory.get(`${type.id}:0`);
    const dailyCapacity = resolveDailyCapacity(type, calendarRow);

    let dayRemaining = null;
    if (dailyCapacity > 0) {
      dayRemaining = Math.max(0, dailyCapacity - Number(dayRow?.sold || 0) - Number(dayRow?.reserved || 0));
    }

    const slots = (type.slots || [])
      .filter((slot) => slot.status === 'active')
      .map((slot) => {
        const slotRow = inventory.get(`${type.id}:${slot.id}`);
        const capacity = Number(slot.capacity || 0);
        const remaining = capacity > 0
          ? Math.max(0, capacity - Number(slotRow?.sold || 0) - Number(slotRow?.reserved || 0))
          : null;
        return {
          id: slot.id,
          label: slot.label,
          startTime: slot.startTime,
          endTime: slot.endTime,
          capacity,
          remaining,
          soldOut: remaining !== null && remaining <= 0,
        };
      });

    for (const slot of slots) {
      const existing = slotMap.get(slot.id);
      if (!existing) slotMap.set(slot.id, { ...slot, typeIds: [type.id] });
      else existing.typeIds.push(type.id);
    }

    const soldOut = dayRemaining !== null ? dayRemaining <= 0 : false;
    const salesClosed = closed
      || Boolean(settings.sales_paused)
      || (type.salesStart && visitDate < type.salesStart)
      || (type.salesEnd && visitDate > type.salesEnd)
      || (type.validFrom && visitDate < type.validFrom)
      || (type.validTo && visitDate > type.validTo)
      || visitDate < isoToday()
      || visitDate > addDaysISO(isoToday(), Number(settings.advance_booking_days || 180));

    publicTypes.push({
      id: type.id,
      name: type.name,
      description: type.description,
      category: type.category,
      visitorCategory: type.visitorCategory,
      price: resolvePrice(type, calendarRow),
      currency: type.currency,
      admissions: type.admissions,
      minAge: type.minAge,
      maxAge: type.maxAge,
      minPerOrder: type.minPerOrder,
      maxPerOrder: type.maxPerOrder,
      slotRequired: type.slotRequired,
      slots,
      remaining: dayRemaining,
      capacity: dailyCapacity,
      soldOut,
      closed: salesClosed,
      refundPolicy: type.refundPolicy,
      refundWindowHours: type.refundWindowHours,
      cancellationFeePercent: type.cancellationFeePercent,
      imageUrl: type.imageUrl,
      terms: type.terms,
      available: !salesClosed && !soldOut,
    });
  }

  return {
    ok: true,
    availability: {
      attraction: {
        id: attraction.id,
        name: attraction.name,
        city: attraction.city,
        country: attraction.country,
        image: attraction.featured_image || (Array.isArray(attraction.gallery) ? attraction.gallery[0]?.url : '') || '',
        description: attraction.description,
      },
      date: visitDate,
      today: isoToday(),
      maxDate: addDaysISO(isoToday(), Number(settings.advance_booking_days || 180)),
      salesPaused: Boolean(settings.sales_paused),
      closed: publicTypes.length > 0 && publicTypes.every((type) => !type.available),
      slots: Array.from(slotMap.values()).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime))),
      types: publicTypes,
      pricing: {
        currency: settings.currency || 'USD',
        taxPercent: Number(settings.tax_percent || 0),
        serviceFeePercent: Number(settings.service_fee_percent || 0),
        terms: settings.terms || '',
      },
    },
  };
}

// ─── QR tokens ───────────────────────────────────────────────────────────────

function tokenSecret() {
  return `${getJwtSecret()}::attraction-ticket`;
}

function signTicketToken(ticketNo) {
  const signature = crypto.createHmac('sha256', tokenSecret()).update(String(ticketNo)).digest('base64url');
  return `bct1.${ticketNo}.${signature}`;
}

/**
 * Accepts either a plain ticket number, a signed payload or the full QR string.
 * Returns { ticketNo, signatureOk }.
 */
function parseTicketInput(raw) {
  const value = String(raw || '').trim();
  if (!value) return { ticketNo: '', signatureOk: false };

  let candidate = value;
  if (candidate.startsWith('BCAT:')) candidate = candidate.slice(5);
  candidate = candidate.split('\n')[0].trim();

  if (candidate.startsWith('bct1.')) {
    const [, ticketNo, signature] = candidate.split('.');
    if (!ticketNo || !signature) return { ticketNo: candidate.toUpperCase(), signatureOk: false };
    const expected = crypto.createHmac('sha256', tokenSecret()).update(String(ticketNo)).digest('base64url');
    const ok = signature.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    return { ticketNo: String(ticketNo).toUpperCase(), signatureOk: ok };
  }

  return { ticketNo: candidate.toUpperCase(), signatureOk: false };
}

function newTicketNo() {
  return `AT-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function newBookingRef() {
  return `ATC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

// ─── Ticket issuance ─────────────────────────────────────────────────────────

async function issueTickets(client, order, items) {
  const tickets = [];
  for (const item of items) {
    for (let index = 0; index < Number(item.quantity); index += 1) {
      const ticketNo = newTicketNo();
      const result = await client.query(
        `INSERT INTO bc_attraction_tickets (
           order_id, order_item_id, ticket_type_id, attraction_id, booking_ref, ticket_no, qr_token,
           holder_name, holder_email, ticket_type_name, visit_date, slot_label,
           admissions_total, admissions_used, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, ''),COALESCE($9, ''),COALESCE($10, ''),$11,COALESCE($12, ''),$13,0,'valid')
         RETURNING *`,
        [
          order.id, item.id, item.ticket_type_id, order.attraction_id, order.booking_ref,
          ticketNo, signTicketToken(ticketNo), order.customer_name, order.customer_email,
          item.ticket_type_name, item.visit_date, order.slot_label || '',
          Number(item.admissions_per_unit || 1),
        ]
      );
      tickets.push(result.rows[0]);
    }
  }
  return tickets;
}

function publicTicket(row) {
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    qrToken: row.qr_token,
    ticketTypeName: row.ticket_type_name,
    visitDate: isoDate(row.visit_date),
    slotLabel: row.slot_label,
    admissionsTotal: Number(row.admissions_total),
    admissionsUsed: Number(row.admissions_used),
    admissionsRemaining: Math.max(0, Number(row.admissions_total) - Number(row.admissions_used)),
    status: row.status,
    holderName: row.holder_name,
    bookingRef: row.booking_ref,
    attractionId: row.attraction_id,
  };
}

/**
 * Flip a reserved order to paid/confirmed and issue its digital tickets.
 * Idempotent: a retried payment callback returns the existing tickets and never
 * sends a second confirmation email.
 */
async function finalizeOrder(orderId, { paymentRef = '', paymentMethod = 'card', actor = 'system' } = {}) {
  const outcome = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM bc_ticket_orders WHERE id = $1 FOR UPDATE`, [orderId]
    );
    const order = locked.rows[0];
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

    const existingTickets = await client.query(
      `SELECT * FROM bc_attraction_tickets WHERE order_id = $1 ORDER BY id ASC`, [orderId]
    );
    if (order.status === 'confirmed' && order.payment_status === 'paid' && existingTickets.rows.length) {
      return { order, tickets: existingTickets.rows, alreadyFinalized: true };
    }
    if (['cancelled', 'refunded', 'expired'].includes(order.status)) {
      throw Object.assign(new Error(`This order is ${order.status} and cannot be confirmed`), { status: 409 });
    }

    await client.query(
      `UPDATE bc_ticket_inventory inv
          SET reserved = GREATEST(0, inv.reserved - items.quantity),
              sold = inv.sold + items.quantity,
              updated_at = NOW()
         FROM bc_ticket_order_items items
        WHERE items.order_id = $1
          AND inv.ticket_type_id = items.ticket_type_id
          AND inv.visit_date = items.visit_date
          AND inv.slot_id = 0`,
      [orderId]
    );
    await client.query(
      `UPDATE bc_ticket_inventory inv
          SET reserved = GREATEST(0, inv.reserved - items.quantity),
              sold = inv.sold + items.quantity,
              updated_at = NOW()
         FROM bc_ticket_order_items items
        WHERE items.order_id = $1
          AND items.slot_id > 0
          AND inv.ticket_type_id = items.ticket_type_id
          AND inv.visit_date = items.visit_date
          AND inv.slot_id = items.slot_id`,
      [orderId]
    );

    const items = await client.query(
      `SELECT * FROM bc_ticket_order_items WHERE order_id = $1 ORDER BY id ASC`, [orderId]
    );

    const tickets = existingTickets.rows.length ? existingTickets.rows : await issueTickets(client, order, items.rows);

    const updated = await client.query(
      `UPDATE bc_ticket_orders
          SET status = 'confirmed', payment_status = 'paid',
              payment_ref = COALESCE(NULLIF($2, ''), payment_ref),
              payment_method = COALESCE(NULLIF($3, ''), payment_method),
              expires_at = NULL, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [orderId, paymentRef, paymentMethod]
    );

    if (order.promo_code) {
      await client.query(
        `UPDATE bc_ticket_promos SET redeemed = redeemed + 1 WHERE attraction_id = $1 AND UPPER(code) = $2`,
        [order.attraction_id, String(order.promo_code).toUpperCase()]
      );
    }

    await client.query(
      `INSERT INTO bc_ticket_audit (attraction_id, actor_email, action, entity_type, entity_id, details)
       VALUES ($1,$2,'order.confirmed','order',$3,$4)`,
      [order.attraction_id, actor, String(orderId), JSON.stringify({ paymentRef, paymentMethod })]
    );

    return { order: updated.rows[0], tickets, alreadyFinalized: false };
  });

  if (!outcome.alreadyFinalized) {
    notifyOrderConfirmed(outcome.order, outcome.tickets);
  }
  return outcome;
}

// ─── Notifications ───────────────────────────────────────────────────────────

function safeDispatch(event) {
  Promise.resolve()
    .then(() => notificationHub.dispatch(event))
    .catch((error) => console.warn('[ticketing] notification failed:', error.message));
}

function notifyOrderConfirmed(order, tickets) {
  const quantity = Number(order.quantity_total || tickets.length || 1);
  const url = `/attraction-tickets/confirmation?ref=${encodeURIComponent(order.booking_ref)}`;

  safeDispatch({
    recipientId: order.customer_email,
    recipientEmail: order.customer_email,
    recipientRole: 'traveler',
    type: 'TICKET_ISSUED',
    title: 'Your attraction tickets are ready',
    message: `${quantity} ticket(s) for ${order.attraction_name} on ${isoDate(order.visit_date)}. Booking ${order.booking_ref}.`,
    actionUrl: url,
    metadata: {
      bookingRef: order.booking_ref,
      attractionName: order.attraction_name,
      visitDate: isoDate(order.visit_date),
      totalAmount: Number(order.total || 0).toFixed(2),
      currency: order.currency,
      quantity,
      tickets: tickets.slice(0, 12).map((ticket) => ({
        ticketNo: ticket.ticket_no,
        type: ticket.ticket_type_name,
        admissions: ticket.admissions_total,
      })),
      title: 'Booking confirmed',
      message: `Your tickets for ${order.attraction_name} are ready.`,
      actionUrl: url,
    },
  });

  // Attraction owner gets a new-sale notification.
  if (order.owner_email) {
    safeDispatch({
      recipientId: order.owner_email,
      recipientEmail: order.owner_email,
      recipientRole: 'attraction_owner',
      type: 'TICKET_SALE',
      title: 'New ticket sale',
      message: `${quantity} ticket(s) sold for ${order.attraction_name} on ${isoDate(order.visit_date)} (${order.currency} ${Number(order.total || 0).toFixed(2)}).`,
      actionUrl: `/attraction-dashboard/ticketing?section=sales`,
      metadata: { bookingRef: order.booking_ref, totalAmount: order.total },
    });
  }
}

function notifyTicketEvent({ order, type, title, message }) {
  if (!order?.customer_email) return;
  safeDispatch({
    recipientId: order.customer_email,
    recipientEmail: order.customer_email,
    recipientRole: 'traveler',
    type,
    title,
    message,
    actionUrl: `/attraction-tickets/confirmation?ref=${encodeURIComponent(order.booking_ref)}`,
    metadata: { bookingRef: order.booking_ref, attractionName: order.attraction_name, title, message },
  });
}

// ─── Audit ───────────────────────────────────────────────────────────────────

async function writeTicketAudit({ attractionId, actor, action, entityType = '', entityId = '', details = {} }) {
  try {
    await query(
      `INSERT INTO bc_ticket_audit (attraction_id, actor_email, action, entity_type, entity_id, details)
       VALUES ($1,COALESCE($2, ''),$3,COALESCE($4, ''),COALESCE($5, ''),$6)`,
      [toInt(attractionId), String(actor || '').toLowerCase(), action, entityType, String(entityId || ''), JSON.stringify(details)]
    );
  } catch (error) {
    console.warn('[ticketing] audit write failed:', error.message);
  }
}

// ─── Refund policy & cancellation ────────────────────────────────────────────

function hoursUntilVisit(visitDate, startTime) {
  const time = isTimeHHMM(startTime) && startTime ? startTime : '09:00';
  const target = new Date(`${visitDate}T${time}:00`);
  if (Number.isNaN(target.getTime())) return 0;
  return (target.getTime() - Date.now()) / 3600000;
}

function refundPolicyForLine(policy, hoursAhead, windowHours, feePercent) {
  if (policy === 'non_refundable') return { percent: 0, reason: 'Non-refundable ticket' };
  if (policy === 'flexible') {
    return hoursAhead >= 0
      ? { percent: 100, reason: 'Flexible policy: full refund before the visit' }
      : { percent: 0, reason: 'The visit date has passed' };
  }
  if (hoursAhead >= Number(windowHours || 0)) {
    return { percent: 100, reason: `Cancelled more than ${Number(windowHours || 0)}h before the visit` };
  }
  const kept = Math.min(100, Math.max(0, Number(feePercent || 0)));
  return {
    percent: 100 - kept,
    reason: kept > 0
      ? `Inside the cancellation window: ${kept}% fee applies`
      : 'Inside the cancellation window: full refund',
  };
}

/**
 * Work out the amount policy allows us to give back on an order.
 * Service fees are kept by the platform; tax is refunded proportionally.
 */
async function quoteRefund(order, items) {
  const slotRes = Number(order.slot_id)
    ? await query(`SELECT start_time FROM bc_ticket_slots WHERE id = $1`, [Number(order.slot_id)])
    : { rows: [] };
  const slotStart = slotRes.rows[0]?.start_time || '';

  const typeIds = Array.from(new Set((items || []).map((item) => Number(item.ticket_type_id))));
  const typesRes = typeIds.length
    ? await query(`SELECT * FROM bc_ticket_types WHERE id = ANY($1::int[])`, [typeIds])
    : { rows: [] };
  const typeMap = new Map(typesRes.rows.map((type) => [Number(type.id), mapType(type)]));

  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount || 0);
  const tax = Number(order.tax_amount || 0);
  const netFactor = subtotal > 0 ? Math.max(0, subtotal - discount) / subtotal : 0;

  const lines = [];
  let refundableSubtotal = 0;
  for (const item of items || []) {
    const type = typeMap.get(Number(item.ticket_type_id));
    const policy = type?.refundPolicy || 'moderate';
    const windowHours = type?.refundWindowHours ?? 24;
    const feePercent = type?.cancellationFeePercent || 0;
    const hours = hoursUntilVisit(isoDate(item.visit_date), slotStart);
    const verdict = refundPolicyForLine(policy, hours, windowHours, feePercent);
    const lineTotal = Number(item.line_total);
    const refundable = round2((lineTotal * verdict.percent) / 100);
    refundableSubtotal += refundable;
    lines.push({
      ticketTypeId: Number(item.ticket_type_id),
      ticketTypeName: item.ticket_type_name,
      policy,
      percent: verdict.percent,
      reason: verdict.reason,
      refundable,
      lineTotal,
    });
  }

  const taxShare = subtotal > 0 ? (refundableSubtotal / subtotal) * tax : 0;
  const gross = round2(refundableSubtotal * netFactor + taxShare);
  const alreadyRefunded = Number(order.refund_amount || 0);
  const allowed = round2(Math.min(Number(order.total || 0), gross));
  const refundAmount = round2(Math.max(0, allowed - alreadyRefunded));

  return {
    refundAmount,
    allowed,
    refundable: refundAmount > 0,
    gross,
    alreadyRefunded,
    lines,
    policy: lines.length && lines.every((line) => line.percent === 100) ? 'full' : 'partial',
  };
}

async function releaseSoldInventory(client, orderId) {
  await client.query(
    `UPDATE bc_ticket_inventory inv
        SET sold = GREATEST(0, inv.sold - items.quantity), updated_at = NOW()
       FROM bc_ticket_order_items items
      WHERE items.order_id = $1
        AND items.visit_date >= CURRENT_DATE
        AND inv.ticket_type_id = items.ticket_type_id
        AND inv.visit_date = items.visit_date
        AND inv.slot_id = 0`,
    [orderId]
  );
  await client.query(
    `UPDATE bc_ticket_inventory inv
        SET sold = GREATEST(0, inv.sold - items.quantity), updated_at = NOW()
       FROM bc_ticket_order_items items
      WHERE items.order_id = $1
        AND items.visit_date >= CURRENT_DATE
        AND items.slot_id > 0
        AND inv.ticket_type_id = items.ticket_type_id
        AND inv.visit_date = items.visit_date
        AND inv.slot_id = items.slot_id`,
    [orderId]
  );
}

/** Send the refund to Stripe. Manual / complimentary orders never touched Stripe. */
async function refundThroughStripe(order, amount) {
  if (!amount || amount <= 0) return { ok: true, refunded: false };
  if (order.payment_status !== 'paid' && order.payment_status !== 'partially_refunded') {
    return { ok: true, refunded: false, reason: 'Order was never paid' };
  }
  if (order.payment_method === 'complimentary' || String(order.payment_ref || '').startsWith('manual:')) {
    return { ok: true, refunded: false, reason: 'No card payment on this order' };
  }
  const isSession = /^cs_/.test(String(order.payment_ref || ''));
  return stripeLib.refundCheckoutSession({
    sessionId: isSession ? order.payment_ref : undefined,
    paymentIntentId: isSession ? undefined : order.payment_ref,
    amount,
    currency: order.currency,
  });
}

function notifyOwnerOfChange(order, { type, title, message }) {
  if (!order?.owner_email) return;
  safeDispatch({
    recipientId: order.owner_email,
    recipientEmail: order.owner_email,
    recipientRole: 'attraction_owner',
    type,
    title,
    message,
    actionUrl: `/attraction-dashboard/ticketing?section=sales`,
    metadata: { bookingRef: order.booking_ref, attractionName: order.attraction_name },
  });
}

/**
 * Cancel an order, applying the ticket-type refund policy. Used by the sales
 * desk and by the customer's own cancellation request so the rules cannot drift.
 */
async function cancelOrder({ order, amount, reason = '', actor = 'system', skipRefund = false }) {
  const items = await query(`SELECT * FROM bc_ticket_order_items WHERE order_id = $1`, [order.id]);
  const policy = await quoteRefund(order, items.rows);

  const requested = amount === undefined || amount === null || amount === ''
    ? policy.refundAmount
    : Math.min(policy.refundAmount, Math.max(0, toMoney(amount, 0)));
  const refundAmount = round2(requested);

  if (!skipRefund && refundAmount > 0) {
    const refunded = await refundThroughStripe(order, refundAmount);
    if (!refunded.ok) return { ok: false, status: 502, error: refunded.error, policy };
  }

  const fullyRefunded = round2(Number(order.refund_amount || 0) + refundAmount) >= Number(order.total || 0);
  const nextStatus = refundAmount > 0
    ? (fullyRefunded ? 'refunded' : 'partially_refunded')
    : 'cancelled';

  await withTransaction(async (client) => {
    await releaseSoldInventory(client, order.id);
    await client.query(
      `UPDATE bc_attraction_tickets SET status = $2, updated_at = NOW()
        WHERE order_id = $1 AND status IN ('valid', 'used')`,
      [order.id, fullyRefunded ? 'refunded' : 'cancelled']
    );
    await client.query(
      `UPDATE bc_ticket_orders
          SET status = $2,
              payment_status = CASE WHEN $3 > 0 THEN $4 ELSE payment_status END,
              refund_amount = refund_amount + $3,
              refunded_at = CASE WHEN $3 > 0 THEN NOW() ELSE refunded_at END,
              notes = COALESCE($5, notes),
              updated_at = NOW()
        WHERE id = $1`,
      [
        order.id, nextStatus, refundAmount,
        fullyRefunded ? 'refunded' : 'partially_refunded',
        text(reason, 500) || order.notes,
      ]
    );
  });

  await writeTicketAudit({
    attractionId: order.attraction_id, actor,
    action: refundAmount > 0 ? 'order.refunded' : 'order.cancelled',
    entityType: 'order', entityId: order.id,
    details: { refundAmount, policy: policy.lines, reason: text(reason, 300) },
  });

  notifyTicketEvent({
    order,
    type: refundAmount > 0 ? 'TICKET_REFUNDED' : 'TICKET_CANCELLED',
    title: refundAmount > 0 ? 'Your tickets were refunded' : 'Your booking was cancelled',
    message: refundAmount > 0
      ? `${order.attraction_name} booking ${order.booking_ref} was cancelled and ${order.currency} ${refundAmount.toFixed(2)} refunded.`
      : `${order.attraction_name} booking ${order.booking_ref} was cancelled.`,
  });
  notifyOwnerOfChange(order, {
    type: 'TICKET_CANCELLED',
    title: 'Booking cancelled',
    message: `${order.booking_ref} was cancelled. Refunded ${order.currency} ${refundAmount.toFixed(2)}.`,
  });

  return { ok: true, status: nextStatus, refundAmount, policy, fullyRefunded };
}

/** Partial or full refund without cancelling the booking. */
async function refundOrder({ order, amount, reason = '', actor = 'system' }) {
  if (order.payment_status !== 'paid' && order.payment_status !== 'partially_refunded') {
    return { ok: false, status: 409, error: 'Only paid bookings can be refunded' };
  }
  const remaining = round2(Number(order.total || 0) - Number(order.refund_amount || 0));
  const requested = amount === undefined || amount === null || amount === ''
    ? remaining
    : Math.max(0, toMoney(amount, 0));
  const value = round2(Math.min(remaining, requested));
  if (value <= 0) return { ok: false, status: 400, error: 'There is nothing left to refund' };

  const refunded = await refundThroughStripe(order, value);
  if (!refunded.ok) return { ok: false, status: 502, error: refunded.error };

  const totalRefunded = round2(Number(order.refund_amount || 0) + value);
  const fullyRefunded = totalRefunded >= Number(order.total || 0);

  await withTransaction(async (client) => {
    if (fullyRefunded) {
      await releaseSoldInventory(client, order.id);
      await client.query(
        `UPDATE bc_attraction_tickets SET status = 'refunded', updated_at = NOW()
          WHERE order_id = $1 AND status IN ('valid', 'used')`,
        [order.id]
      );
    }
    await client.query(
      `UPDATE bc_ticket_orders
          SET status = $2, payment_status = $3, refund_amount = $4, refunded_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [order.id, fullyRefunded ? 'refunded' : 'partially_refunded', fullyRefunded ? 'refunded' : 'partially_refunded', totalRefunded]
    );
  });

  await writeTicketAudit({
    attractionId: order.attraction_id, actor, action: 'order.refunded', entityType: 'order', entityId: order.id,
    details: { amount: value, totalRefunded, refundId: refunded.refundId || '', reason: text(reason, 300) },
  });
  notifyTicketEvent({
    order,
    type: 'TICKET_REFUNDED',
    title: 'Refund processed',
    message: `${order.currency} ${value.toFixed(2)} was refunded on ${order.attraction_name} booking ${order.booking_ref}.`,
  });

  return { ok: true, refunded: value, totalRefunded, status: fullyRefunded ? 'refunded' : 'partially_refunded' };
}

module.exports = {
  DEFAULT_SETTINGS,
  MAX_ORDER_TICKETS,
  REFUND_POLICIES,
  RESERVATION_TTL_MINUTES,
  STAFF_ROLES,
  TICKET_CATEGORIES,
  addDaysISO,
  calendarFor,
  cancelOrder,
  computeQuote,
  finalizeOrder,
  getAvailability,
  getCalendar,
  getSettings,
  isClosedOn,
  isDateISO,
  isoDate,
  issueTickets,
  isoToday,
  listAccessibleAttractions,
  listTicketTypes,
  mapType,
  newBookingRef,
  notifyOrderConfirmed,
  notifyTicketEvent,
  normalizeTicketType,
  parseTicketInput,
  publicTicket,
  quoteRefund,
  refundOrder,
  releaseExpiredHolds,
  releaseReservation,
  releaseSoldInventory,
  remainingFor,
  replaceSlots,
  reserveInventory,
  resolveAccess,
  resolveDailyCapacity,
  resolvePrice,
  roleAllows,
  round2,
  saveSettings,
  saveTicketType,
  signTicketToken,
  text,
  toInt,
  toMoney,
  validCurrency,
  validEmail,
  writeTicketAudit,
};
