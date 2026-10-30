'use strict';

// Pure layout domain for the cinema auditorium editor.
//
// Nothing in here talks to the database: the editor, the API and the tests all
// run the same normalisation, validation and pricing maths, so a layout that
// previews cleanly is exactly the layout that gets published.

const SEAT_STATUSES = ['available', 'blocked', 'out_of_service'];
const BOOKING_MODES = ['single', 'group'];
const BASE_CATEGORIES = ['standard', 'premium', 'vip', 'couple', 'recliner', 'wheelchair', 'companion'];
const MAX_COLS = 60;
const MAX_ROWS = 200;
const MAX_SEATS = 800;
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const DEFAULT_SEAT_TYPES = [
  { slug: 'standard', name: 'Standard', color: '#94a3b8', icon: 'ph-armchair', baseCategory: 'standard', multiplier: 1, admissions: 1 },
  { slug: 'premium', name: 'Premium', color: '#38bdf8', icon: 'ph-armchair', baseCategory: 'premium', multiplier: 1.3, admissions: 1 },
  { slug: 'vip', name: 'VIP', color: '#a855f7', icon: 'ph-crown', baseCategory: 'vip', multiplier: 1.7, admissions: 1 },
  { slug: 'recliner', name: 'Recliner', color: '#f59e0b', icon: 'ph-bed', baseCategory: 'recliner', multiplier: 1.75, admissions: 1 },
  { slug: 'couple', name: 'Couples', color: '#f43f5e', icon: 'ph-heart', baseCategory: 'couple', multiplier: 2, admissions: 2 },
  { slug: 'sofa', name: 'Sofa', color: '#8b5cf6', icon: 'ph-couch', baseCategory: 'couple', multiplier: 2, admissions: 2 },
  { slug: 'wheelchair', name: 'Wheelchair space', color: '#3b82f6', icon: 'ph-wheelchair', baseCategory: 'wheelchair', multiplier: 1, admissions: 1, accessible: true, companionRequired: true },
  { slug: 'companion', name: 'Companion', color: '#14b8a6', icon: 'ph-users', baseCategory: 'companion', multiplier: 0.7, admissions: 1 },
];

function round2(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function toInt(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function rowLabel(index) {
  let value = '';
  let remaining = Math.max(0, toInt(index, 0));
  do {
    value = String.fromCharCode(65 + (remaining % 26)) + value;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return value;
}

function rowLabelIndex(label) {
  const value = String(label || '').toUpperCase();
  if (!/^[A-Z]{1,4}$/.test(value)) return -1;
  let total = 0;
  for (const character of value) total = total * 26 + (character.charCodeAt(0) - 64);
  return total - 1;
}

function isoWeekday(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return -1;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const day = date.getUTCDay();
  return day === 0 ? 7 : day; // 1 = Monday … 7 = Sunday
}

// ─── Seat types ──────────────────────────────────────────────────────────────

function normalizeSeatType(input = {}, { fallbackSlug = '' } = {}) {
  const name = String(input.name || '').trim().slice(0, 60);
  const slug = slugify(input.slug || fallbackSlug || name);
  if (!name) return { ok: false, error: 'Every seat type needs a display name' };
  if (!slug) return { ok: false, error: 'Give the seat type a name with at least one letter or number' };

  const baseCategory = BASE_CATEGORIES.includes(input.baseCategory) ? input.baseCategory : 'standard';
  const color = HEX_COLOR.test(String(input.color || '')) ? String(input.color) : '#94a3b8';
  const icon = String(input.icon || 'ph-armchair').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'ph-armchair';
  const bookingMode = BOOKING_MODES.includes(input.bookingMode) ? input.bookingMode : 'single';
  const admissions = clamp(toInt(input.admissions, baseCategory === 'couple' ? 2 : 1), 1, 10);
  const groupSize = clamp(toInt(input.groupSize, bookingMode === 'group' ? 2 : 1), 1, 12);

  return {
    ok: true,
    type: {
      slug,
      name,
      color,
      icon,
      baseCategory,
      defaultPrice: input.defaultPrice === null || input.defaultPrice === undefined || input.defaultPrice === ''
        ? null
        : Math.max(0, round2(input.defaultPrice)),
      multiplier: clamp(Number(input.multiplier ?? 1) || 0, 0, 20),
      admissions,
      bookingMode,
      groupSize,
      splitAllowed: Boolean(input.splitAllowed),
      accessible: Boolean(input.accessible) || baseCategory === 'wheelchair',
      companionRequired: Boolean(input.companionRequired) || baseCategory === 'wheelchair',
      instructions: String(input.instructions || '').slice(0, 240),
      status: input.status === 'inactive' ? 'inactive' : 'active',
    },
  };
}

function seatTypeMap(types = []) {
  const map = new Map();
  for (const type of types) map.set(type.slug, type);
  for (const type of DEFAULT_SEAT_TYPES) if (!map.has(type.slug)) map.set(type.slug, type);
  return map;
}

function typeLabel(types, slug) {
  const map = seatTypeMap(types);
  return map.get(slug)?.name || String(slug || 'Standard');
}

function typeAdmissions(types, slug) {
  const type = seatTypeMap(types).get(slug);
  return clamp(toInt(type?.admissions, 1), 1, 10);
}

// ─── Documents ───────────────────────────────────────────────────────────────

function emptyDocument({ cols = 16, rows = 8, seatsPerRow = 12, pitch = 1 } = {}) {
  const width = clamp(toInt(seatsPerRow, 12), 1, MAX_COLS - 2);
  const startX = Math.max(1, Math.floor((cols - width) / 2) + 1);
  const seats = [];
  for (let r = 0; r < clamp(toInt(rows, 8), 1, 60); r += 1) {
    for (let s = 0; s < width; s += 1) {
      seats.push({
        id: `s-${rowLabel(r)}-${s + 1}`,
        row: rowLabel(r),
        number: s + 1,
        x: startX + s * pitch,
        y: r + 1,
        category: 'standard',
        status: 'available',
        priceOverride: null,
        label: '',
      });
    }
  }
  return normalizeDocument({
    v: 1,
    cols,
    spacing: { seat: 4, row: 10 },
    screen: { position: 'top', width: 70, label: '' },
    seats,
    aisles: [],
    entrances: [],
    sections: [],
  }).document;
}

function normalizeSeat(seat = {}, index = 0) {
  const row = String(seat.row || seat.rowLabel || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 4);
  const number = toInt(seat.number ?? seat.no, 0);
  const category = slugify(seat.category || seat.type || 'standard') || 'standard';
  const status = SEAT_STATUSES.includes(seat.status) ? seat.status : 'available';
  const priceOverride = seat.priceOverride === null || seat.priceOverride === undefined || seat.priceOverride === ''
    ? null
    : Math.max(0, round2(seat.priceOverride));
  return {
    id: String(seat.id || `s-${row || 'x'}-${number || index}`),
    row,
    number,
    x: clamp(toInt(seat.x, 0), 0, MAX_COLS),
    y: clamp(toInt(seat.y, 0), 0, MAX_ROWS),
    category,
    status,
    priceOverride,
    label: String(seat.label || seat.customLabel || '').slice(0, 24),
  };
}

function normalizeAisle(aisle = {}, index = 0) {
  return {
    id: String(aisle.id || `a-${index}`),
    fromX: clamp(toInt(aisle.fromX ?? aisle.x, 1), 1, MAX_COLS),
    width: clamp(toInt(aisle.width, 1), 1, 8),
    fromY: clamp(toInt(aisle.fromY ?? aisle.y0, 1), 1, MAX_ROWS),
    toY: clamp(toInt(aisle.toY ?? aisle.y1, MAX_ROWS), 1, MAX_ROWS),
    label: String(aisle.label || '').slice(0, 24),
  };
}

function normalizeEntrance(entrance = {}, index = 0) {
  const side = ['left', 'right', 'top', 'bottom'].includes(entrance.side) ? entrance.side : 'left';
  return {
    id: String(entrance.id || `e-${index}`),
    side,
    offset: clamp(toInt(entrance.offset, 50), 0, 100),
    label: String(entrance.label || 'Entrance').slice(0, 24),
  };
}

function normalizeSection(section = {}, index = 0) {
  const rows = Array.isArray(section.rows)
    ? section.rows.map((row) => String(row || '').toUpperCase().slice(0, 4)).filter(Boolean)
    : [];
  return {
    id: String(section.id || `sec-${index}`),
    name: String(section.name || `Section ${index + 1}`).slice(0, 40),
    color: HEX_COLOR.test(String(section.color || '')) ? String(section.color) : '',
    rows: Array.from(new Set(rows)),
  };
}

/**
 * Turn whatever the editor (or an older API call) posted into a predictable
 * document. Duplicates are preserved on purpose: validation needs to name them.
 */
function normalizeDocument(input = {}) {
  const spacing = input.spacing && typeof input.spacing === 'object' ? input.spacing : {};
  const screen = input.screen && typeof input.screen === 'object' ? input.screen : {};
  const rawSeats = Array.isArray(input.seats) ? input.seats : [];

  const seats = rawSeats.slice(0, MAX_SEATS + 50).map(normalizeSeat);
  const document = {
    v: 1,
    cols: clamp(toInt(input.cols, 16), 4, MAX_COLS),
    spacing: {
      seat: clamp(toInt(spacing.seat, 4), 0, 24),
      row: clamp(toInt(spacing.row, 10), 0, 40),
    },
    screen: {
      position: screen.position === 'bottom' ? 'bottom' : 'top',
      width: clamp(toInt(screen.width, 70), 20, 100),
      label: String(screen.label || '').slice(0, 40),
    },
    seats,
    aisles: (Array.isArray(input.aisles) ? input.aisles : []).slice(0, 40).map(normalizeAisle),
    entrances: (Array.isArray(input.entrances) ? input.entrances : []).slice(0, 20).map(normalizeEntrance),
    sections: (Array.isArray(input.sections) ? input.sections : []).slice(0, 20).map(normalizeSection),
  };
  return { ok: true, document };
}

/** Rebuild an editor document from published seat rows (legacy/backfilled versions). */
function documentFromSeats(seats = [], screen = {}) {
  const cols = Math.max(4, ...seats.map((seat) => toInt(seat.x, 0)), toInt(screen.seats_per_row, 12));
  return normalizeDocument({
    v: 1,
    cols,
    spacing: { seat: 4, row: 10 },
    screen: { position: 'top', width: 70, label: screen.name || '' },
    seats: seats.map((seat) => ({
      id: `seat-${seat.id || `${seat.row}-${seat.number}`}`,
      row: seat.row || seat.row_label,
      number: seat.number ?? seat.seat_no,
      x: seat.x || seat.number || 1,
      y: seat.y || Math.max(1, rowLabelIndex(seat.row || seat.row_label) + 1),
      category: seat.category,
      status: seat.status === 'blocked' || seat.status === 'out_of_service' ? seat.status : 'available',
      priceOverride: seat.priceOverride ?? seat.price_override ?? null,
      label: seat.label || seat.custom_label || '',
    })),
  }).document;
}

/** Flat, de-duplicated seat list ready for the database. */
function documentSeats(document, { keepDuplicates = false } = {}) {
  const seats = Array.isArray(document?.seats) ? document.seats : [];
  const seen = new Set();
  const output = [];
  for (const seat of seats) {
    const key = `${seat.row}${seat.number}`;
    if (!keepDuplicates && seen.has(key)) continue;
    seen.add(key);
    output.push({
      row: seat.row,
      number: seat.number,
      key,
      category: seat.category,
      status: seat.status,
      x: seat.x,
      y: seat.y,
      priceOverride: seat.priceOverride === null ? null : round2(seat.priceOverride),
      label: seat.label || '',
    });
  }
  return output.sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.number - b.number));
}

function capacityOf(seats = []) {
  return seats.filter((seat) => seat.status === 'available').length;
}

function seatStats(seats = []) {
  const byCategory = {};
  for (const seat of seats) byCategory[seat.category] = (byCategory[seat.category] || 0) + 1;
  return {
    total: seats.length,
    saleable: seats.filter((seat) => seat.status === 'available').length,
    blocked: seats.filter((seat) => seat.status !== 'available').length,
    rows: new Set(seats.map((seat) => seat.row)).size,
    byCategory,
  };
}

/**
 * Everything the Publish button must refuse or warn about. Errors block the
 * publish; warnings are shown but can be published anyway.
 */
function validateLayout(input = {}, { seatTypes = [] } = {}) {
  const { document } = normalizeDocument(input);
  const errors = [];
  const warnings = [];
  const types = seatTypeMap(seatTypes);
  const seats = document.seats;

  if (!seats.length) errors.push('Add at least one seat before publishing.');
  if (seats.length > MAX_SEATS) errors.push(`An auditorium cannot hold more than ${MAX_SEATS} seats.`);

  const seen = new Set();
  const duplicates = new Set();
  const cells = new Map();
  for (const seat of seats) {
    const key = `${seat.row}${seat.number}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
    if (!seat.row) errors.push(`A seat in row ${seat.y} has no row label.`);
    if (seat.number < 1) errors.push(`Seat ${seat.row || '?'} has an invalid number.`);
    if (seat.x < 1 || seat.x > document.cols) errors.push(`Seat ${key} sits outside the auditorium width.`);
    if (seat.y < 1) errors.push(`Seat ${key} has no row position.`);
    if (!types.has(seat.category)) errors.push(`Seat ${key} uses an unknown seat type “${seat.category}”.`);
    const cell = `${seat.x}:${seat.y}`;
    if (cells.has(cell)) errors.push(`Seats ${cells.get(cell)} and ${key} are stacked on the same spot.`);
    else cells.set(cell, key);
  }
  if (duplicates.size) errors.push(`Duplicate seat numbers: ${Array.from(duplicates).slice(0, 8).join(', ')}.`);

  const accessible = seats.filter((seat) => {
    const type = types.get(seat.category);
    return type?.accessible || type?.baseCategory === 'wheelchair' || seat.category === 'wheelchair';
  });
  const companions = seats.filter((seat) => types.get(seat.category)?.baseCategory === 'companion');
  if (!accessible.length) warnings.push('No wheelchair space yet — add one so the auditorium is accessible.');
  else if (!companions.length) warnings.push('Wheelchair spaces have no companion seat next to them.');

  const untyped = seats.filter((seat) => !seat.category);
  if (untyped.length) errors.push(`${untyped.length} seat(s) have no seat type.`);

  const rowLabels = Array.from(new Set(seats.map((seat) => seat.row))).sort((a, b) => rowLabelIndex(a) - rowLabelIndex(b));
  const capacity = capacityOf(seats);

  return {
    ok: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    capacity,
    seatCount: seats.length,
    rows: rowLabels.length,
    rowLabels,
    document,
  };
}

// ─── Templates ───────────────────────────────────────────────────────────────

function gridDocument({ rows, seatsPerRow, category = 'standard', aisleAt = 0, cols, screenWidth = 70 }) {
  const base = emptyDocument({ cols: cols || seatsPerRow + (aisleAt ? 4 : 2), rows, seatsPerRow });
  if (!aisleAt) return base;
  const startX = Math.max(1, Math.floor((base.cols - seatsPerRow) / 2) + 1);
  return normalizeDocument({
    ...base,
    screen: { ...base.screen, width: screenWidth },
    aisles: [{ id: 'aisle-left', fromX: Math.max(1, startX - 2), width: 1, fromY: 1, toY: rows }],
    seats: base.seats.map((seat) => ({
      ...seat,
      x: seat.x >= startX + aisleAt ? seat.x + 1 : seat.x,
    })),
  }).document;
}

function layoutTemplates() {
  const small = gridDocument({ rows: 6, seatsPerRow: 10, cols: 14 });
  const medium = (() => {
    const base = emptyDocument({ cols: 20, rows: 10, seatsPerRow: 14 });
    const seats = base.seats.map((seat) => ({
      ...seat,
      category: seat.row <= 'B' ? 'premium' : 'standard',
      x: seat.x >= 11 ? seat.x + 1 : seat.x,
    }));
    return normalizeDocument({
      ...base,
      aisles: [{ id: 'center', fromX: 10, width: 1, fromY: 1, toY: 10, label: 'Center aisle' }],
      entrances: [
        { id: 'ent-left', side: 'left', offset: 50, label: 'Door A' },
        { id: 'ent-right', side: 'right', offset: 50, label: 'Door B' },
      ],
      seats,
    }).document;
  })();
  const large = (() => {
    const base = emptyDocument({ cols: 26, rows: 14, seatsPerRow: 20 });
    return normalizeDocument({
      ...base,
      aisles: [
        { id: 'aisle-left', fromX: 4, width: 1, fromY: 1, toY: 14 },
        { id: 'aisle-right', fromX: 23, width: 1, fromY: 1, toY: 14 },
      ],
      entrances: [
        { id: 'ent-left', side: 'left', offset: 40, label: 'Door A' },
        { id: 'ent-right', side: 'right', offset: 40, label: 'Door B' },
      ],
      seats: base.seats.map((seat) => ({ ...seat, x: seat.x >= 16 ? seat.x + 1 : seat.x })),
    }).document;
  })();
  const vip = (() => {
    const base = emptyDocument({ cols: 14, rows: 5, seatsPerRow: 8 });
    return normalizeDocument({
      ...base,
      seats: base.seats.map((seat) => ({ ...seat, category: seat.row === 'E' ? 'sofa' : 'recliner' })),
    }).document;
  })();
  const recliner = (() => {
    const base = emptyDocument({ cols: 16, rows: 6, seatsPerRow: 10 });
    return normalizeDocument({
      ...base,
      seats: base.seats.map((seat) => ({ ...seat, category: 'recliner' })),
    }).document;
  })();
  const couples = (() => {
    const base = emptyDocument({ cols: 18, rows: 6, seatsPerRow: 12 });
    return normalizeDocument({
      ...base,
      seats: base.seats.map((seat) => ({ ...seat, category: seat.number % 2 === 0 ? 'couple' : 'standard' })),
    }).document;
  })();
  return [
    { kind: 'small', name: 'Small auditorium', description: '6 rows · 10 seats · 60 places', document: small },
    { kind: 'medium', name: 'Medium auditorium', description: '10 rows · 14 seats with a centre aisle', document: medium },
    { kind: 'large', name: 'Large auditorium', description: '14 rows · 20 seats with two side aisles', document: large },
    { kind: 'vip', name: 'VIP auditorium', description: '5 rows of recliners with sofas at the back', document: vip },
    { kind: 'recliner', name: 'Recliner hall', description: '6 rows of spacious recliners', document: recliner },
    { kind: 'couples', name: "Couples' auditorium", description: 'Pairs of loveseats with standard fillers', document: couples },
    { kind: 'custom', name: 'Empty hall', description: 'Start from a blank canvas and paint every seat', document: emptyDocument({ cols: 16, rows: 6, seatsPerRow: 10 }) },
  ];
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

function ruleMatches(rule, { showDate = '', showtimeId = 0 } = {}) {
  const scope = String(rule.scope || 'all');
  if (scope === 'screening') return Number(rule.showtimeId || 0) === Number(showtimeId || 0) && showtimeId > 0;
  if (scope === 'date') {
    if (!showDate) return false;
    const from = String(rule.dateFrom || '').slice(0, 10);
    const to = String(rule.dateTo || '').slice(0, 10);
    if (from && showDate < from) return false;
    if (to && showDate > to) return false;
    return true;
  }
  if (scope === 'weekday') {
    const days = Array.isArray(rule.weekdays) ? rule.weekdays.map((day) => toInt(day, 0)).filter(Boolean) : [];
    return days.includes(isoWeekday(showDate));
  }
  if (scope === 'weekend') {
    const days = Array.isArray(rule.weekdays) && rule.weekdays.length ? rule.weekdays.map((day) => toInt(day, 0)) : [6, 7];
    return days.includes(isoWeekday(showDate));
  }
  return scope === 'all';
}

function matchPricingRule(rules = [], { showDate = '', showtimeId = 0 } = {}) {
  const matches = rules
    .filter((rule) => String(rule.status || 'active') === 'active' && ruleMatches(rule, { showDate, showtimeId }))
    .sort((a, b) => {
      const priority = Number(b.priority || 0) - Number(a.priority || 0);
      if (priority) return priority;
      return Number(b.id || 0) - Number(a.id || 0);
    });
  return matches[0] || null;
}

/**
 * Freeze the price of every seat type at scheduling time. Later edits to seat
 * types or pricing rules never touch an existing screening.
 */
function buildPricingSnapshot({ basePrice = 0, currency = 'USD', seatTypes = [], rules = [], showDate = '', showtimeId = 0 } = {}) {
  const rule = matchPricingRule(rules, { showDate, showtimeId });
  const seatPrices = {};
  for (const type of seatTypeMap(seatTypes).values()) {
    let price = type.defaultPrice !== null && type.defaultPrice !== undefined
      ? Number(type.defaultPrice)
      : Number(basePrice) * Number(type.multiplier ?? 1);
    if (rule) {
      if (rule.adjustment === 'amount') price += Number(rule.value || 0);
      else price *= Number(rule.value ?? 1) || 1;
      const override = rule.categoryPrices && typeof rule.categoryPrices === 'object' ? rule.categoryPrices[type.slug] : undefined;
      if (override !== undefined && override !== null && override !== '') price = Number(override);
    }
    seatPrices[type.slug] = Math.max(0, round2(price));
  }
  return {
    basePrice: Math.max(0, round2(basePrice)),
    currency: String(currency || 'USD').toUpperCase(),
    seatPrices,
    ruleId: rule ? Number(rule.id || 0) : 0,
    ruleName: rule ? String(rule.name || '') : '',
    capturedAt: new Date().toISOString(),
  };
}

function snapshotPrice(snapshot, category) {
  const prices = snapshot && typeof snapshot === 'object' ? snapshot.seatPrices : null;
  if (!prices) return null;
  const value = prices[category];
  return value === undefined || value === null ? null : Number(value);
}

module.exports = {
  BASE_CATEGORIES,
  BOOKING_MODES,
  DEFAULT_SEAT_TYPES,
  MAX_COLS,
  MAX_ROWS,
  MAX_SEATS,
  SEAT_STATUSES,
  buildPricingSnapshot,
  capacityOf,
  documentFromSeats,
  documentSeats,
  emptyDocument,
  isoWeekday,
  layoutTemplates,
  matchPricingRule,
  normalizeDocument,
  normalizeSeatType,
  rowLabel,
  rowLabelIndex,
  round2,
  seatStats,
  seatTypeMap,
  slugify,
  snapshotPrice,
  typeAdmissions,
  typeLabel,
  validateLayout,
};
