'use strict';

// Pure-logic coverage for the auditorium layout domain. These are the rules the
// Publish button obeys and the prices a screening freezes, so they are worth
// pinning down without touching the database.

const test = require('node:test');
const assert = require('node:assert');

const L = require('../lib/cinema-layout');
const C = require('../lib/cinema');

const settings = {
  serviceFeePercent: 10,
  taxPercent: 5,
  categoryPrices: { ...C.DEFAULT_CATEGORY_MULTIPLIERS },
};

function seat(overrides = {}) {
  return { id: `s-${overrides.row || 'A'}${overrides.number || 1}`, row: 'A', number: 1, x: 1, y: 1, category: 'standard', status: 'available', priceOverride: null, ...overrides };
}

test('starter templates all publish as-is and grow with their name', () => {
  const templates = L.layoutTemplates();
  assert.strictEqual(templates.length, 7);
  const counts = {};
  for (const template of templates) {
    const validation = L.validateLayout(template.document);
    assert.ok(validation.ok, `${template.kind} must publish: ${validation.errors.join(', ')}`);
    counts[template.kind] = validation.seatCount;
  }
  assert.strictEqual(counts.small, 60);
  assert.strictEqual(counts.medium, 140);
  assert.strictEqual(counts.large, 280);
  assert.ok(counts.large > counts.medium && counts.medium > counts.small);
  // The VIP and recliner halls are made of their own seat types, not clone rows.
  const vip = templates.find((entry) => entry.kind === 'vip').document;
  assert.ok(vip.seats.every((entry) => ['recliner', 'sofa'].includes(entry.category)));
  const couples = templates.find((entry) => entry.kind === 'couples').document;
  assert.ok(couples.seats.some((entry) => entry.category === 'couple'));
});

test('validateLayout refuses duplicate seat numbers on the same row', () => {
  const validation = L.validateLayout({
    cols: 10,
    seats: [seat({ id: 'a', x: 1 }), seat({ id: 'b', x: 2, number: 1 })],
  });
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.some((error) => /Duplicate seat numbers/.test(error)));
});

test('validateLayout refuses stacked seats, bad positions and unknown types', () => {
  const stacked = L.validateLayout({
    cols: 10,
    seats: [seat({ id: 'a', x: 3, number: 1 }), seat({ id: 'b', x: 3, number: 2 })],
  });
  assert.ok(stacked.errors.some((error) => /same spot/.test(error)));

  const outside = L.validateLayout({ cols: 6, seats: [seat({ x: 9 })] });
  assert.ok(outside.errors.some((error) => /outside the auditorium width/.test(error)));

  const unknown = L.validateLayout({ cols: 10, seats: [seat({ category: 'hammock' })] });
  assert.ok(unknown.errors.some((error) => /unknown seat type/.test(error)));

  const empty = L.validateLayout({ cols: 10, seats: [] });
  assert.strictEqual(empty.ok, false);
});

test('validateLayout warns instead of blocking when accessibility is missing', () => {
  const bare = L.validateLayout({ cols: 10, seats: [seat()] });
  assert.strictEqual(bare.ok, true);
  assert.ok(bare.warnings.some((warning) => /wheelchair space/.test(warning)));

  const withSpace = L.validateLayout({
    cols: 10,
    seats: [seat({ id: 'w', category: 'wheelchair', x: 1 }), seat({ id: 'p', x: 2, number: 2 })],
  });
  assert.ok(withSpace.warnings.some((warning) => /companion/.test(warning)));
});

test('capacity counts only seats that can actually be sold', () => {
  const seats = [seat({ id: 'a' }), seat({ id: 'b', blocked: true, status: 'blocked', number: 2 }), seat({ id: 'c', status: 'out_of_service', number: 3 })];
  assert.strictEqual(L.capacityOf(seats), 1);
  const stats = L.seatStats(seats);
  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.blocked, 2);
  assert.strictEqual(stats.rows, 1);
});

test('normalizeDocument clamps the canvas instead of trusting the editor', () => {
  const { document } = L.normalizeDocument({
    cols: 500,
    spacing: { seat: 99, row: -4 },
    screen: { position: 'sideways', width: 500, label: 'IMAX' },
    seats: [{ row: 'aa1', number: '7', x: 9999, y: -2, category: 'Premium Seats' }],
    sections: [{ name: 'Balcony', color: 'not-a-color', rows: ['a', 'a'] }],
  });
  assert.strictEqual(document.cols, L.MAX_COLS);
  assert.strictEqual(document.spacing.seat, 24);
  assert.strictEqual(document.spacing.row, 0);
  assert.strictEqual(document.screen.position, 'top');
  assert.strictEqual(document.screen.width, 100);
  assert.strictEqual(document.seats[0].row, 'AA1');
  assert.strictEqual(document.seats[0].number, 7);
  assert.strictEqual(document.seats[0].x, L.MAX_COLS);
  assert.strictEqual(document.seats[0].category, 'premium-seats');
  assert.strictEqual(document.sections[0].color, '');
  assert.deepStrictEqual(document.sections[0].rows, ['A']);
});

test('documentSeats produces database rows sorted by position without duplicates', () => {
  const seats = L.documentSeats({
    seats: [
      seat({ id: 'b', x: 2, number: 2 }),
      seat({ id: 'a', x: 1, number: 1 }),
      seat({ id: 'dupe', x: 3, number: 1 }),
    ],
  });
  assert.deepStrictEqual(seats.map((entry) => entry.key), ['A1', 'A2']);
  assert.strictEqual(seats[0].x, 1);
});

test('a pricing snapshot freezes seat prices and names the winning rule', () => {
  const seatTypes = [
    { slug: 'standard', defaultPrice: null, multiplier: 1 },
    { slug: 'vip', defaultPrice: 30, multiplier: 1.7 },
  ];
  const plain = L.buildPricingSnapshot({ basePrice: 20, seatTypes, rules: [], showDate: '2026-10-27' });
  // Every built-in type stays priceable even before the owner customises it.
  assert.strictEqual(plain.seatPrices.standard, 20);
  assert.strictEqual(plain.seatPrices.vip, 30);
  assert.strictEqual(plain.seatPrices.recliner, 35);
  assert.strictEqual(plain.ruleId, 0);

  const busy = L.buildPricingSnapshot({
    basePrice: 20,
    seatTypes,
    rules: [{ id: 4, name: 'Weekend', scope: 'weekend', adjustment: 'multiplier', value: 1.5, status: 'active' }],
    showDate: '2026-10-31',
  });
  assert.strictEqual(busy.seatPrices.standard, 30);
  assert.strictEqual(busy.seatPrices.vip, 45);
  assert.strictEqual(busy.ruleId, 4);
  assert.strictEqual(busy.ruleName, 'Weekend');
  assert.strictEqual(busy.currency, 'USD');
  assert.ok(busy.capturedAt);
});

test('amount rules add up and fixed category prices win over the adjustment', () => {
  const snapshot = L.buildPricingSnapshot({
    basePrice: 10,
    seatTypes: [{ slug: 'standard' }, { slug: 'recliner' }],
    rules: [{
      id: 9, name: 'Christmas', scope: 'date', dateFrom: '2026-12-20', dateTo: '2026-12-31',
      adjustment: 'amount', value: 5, categoryPrices: { recliner: 60 }, status: 'active',
    }],
    showDate: '2026-12-24',
  });
  assert.strictEqual(snapshot.seatPrices.standard, 15);
  assert.strictEqual(snapshot.seatPrices.recliner, 60);
  // A date outside the window keeps the base prices.
  const outside = L.buildPricingSnapshot({
    basePrice: 10,
    seatTypes: [{ slug: 'standard' }],
    rules: [{ id: 9, name: 'Christmas', scope: 'date', dateFrom: '2026-12-20', dateTo: '2026-12-31', adjustment: 'amount', value: 5, status: 'active' }],
    showDate: '2026-11-02',
  });
  assert.strictEqual(outside.seatPrices.standard, 10);
  assert.strictEqual(outside.ruleId, 0);
});

test('the highest priority matching rule wins, and paused rules never do', () => {
  const rules = [
    { id: 1, name: 'Weekend', scope: 'weekend', adjustment: 'multiplier', value: 1.2, priority: 1, status: 'active' },
    { id: 2, name: 'Premiere', scope: 'screening', showtimeId: 77, adjustment: 'multiplier', value: 2, priority: 10, status: 'active' },
    { id: 3, name: 'Paused', scope: 'all', adjustment: 'multiplier', value: 9, priority: 99, status: 'inactive' },
  ];
  const premiere = L.matchPricingRule(rules, { showDate: '2026-10-31', showtimeId: 77 });
  assert.strictEqual(premiere.id, 2);
  // Without the screening id, a screening-only rule cannot match.
  const weekend = L.matchPricingRule(rules, { showDate: '2026-10-31', showtimeId: 0 });
  assert.strictEqual(weekend.id, 1);
  // A Tuesday is neither weekend nor premiere.
  assert.strictEqual(L.matchPricingRule(rules, { showDate: '2026-10-27', showtimeId: 0 }), null);
});

test('snapshotPrice returns null for seats the snapshot does not know', () => {
  const snapshot = { seatPrices: { vip: 30 } };
  assert.strictEqual(L.snapshotPrice(snapshot, 'vip'), 30);
  assert.strictEqual(L.snapshotPrice(snapshot, 'standard'), null);
  assert.strictEqual(L.snapshotPrice(null, 'vip'), null);
});

test('priceForSeat obeys the authority order: override, snapshot, type price, multiplier', () => {
  const showtime = { base_price: 20, pricing_snapshot: { seatPrices: { vip: 55 } } };
  const seatTypes = [
    { slug: 'vip', defaultPrice: 30, multiplier: 2, admissions: 1 },
    { slug: 'couple', defaultPrice: null, multiplier: 2, admissions: 2 },
  ];
  // A seat-specific override beats everything, including the frozen snapshot.
  assert.strictEqual(C.priceForSeat({ category: 'vip', price_override: 12 }, showtime, settings, seatTypes), 12);
  // Then the snapshot frozen onto the screening.
  assert.strictEqual(C.priceForSeat({ category: 'vip', price_override: null }, showtime, settings, seatTypes), 55);
  // A type default price beats the multiplier.
  assert.strictEqual(C.priceForSeat({ category: 'vip', price_override: null }, { base_price: 20 }, settings, seatTypes), 30);
  // Otherwise the base price times the seat type multiplier.
  assert.strictEqual(C.priceForSeat({ category: 'couple', price_override: null }, { base_price: 20 }, settings, seatTypes), 40);
});

test('admissions follow the seat type, falling back to the built-in categories', () => {
  const seatTypes = [{ slug: 'loveseat', baseCategory: 'couple', admissions: 4 }];
  assert.strictEqual(C.admissionsForSeat({ category: 'loveseat' }, seatTypes), 4);
  assert.strictEqual(C.admissionsForSeat({ category: 'couple' }, []), 2);
  assert.strictEqual(C.admissionsForSeat({ category: 'standard' }, []), 1);
});

test('seat type slugs are unique and every default type carries a colour', () => {
  const slugs = L.DEFAULT_SEAT_TYPES.map((type) => type.slug);
  assert.deepStrictEqual(slugs, Array.from(new Set(slugs)));
  for (const type of L.DEFAULT_SEAT_TYPES) {
    assert.match(type.color, /^#[0-9a-f]{6}$/i, `${type.slug} needs a hex colour`);
    assert.ok(type.name, `${type.slug} needs a display name`);
  }
  assert.strictEqual(L.slugify('Couples Loveseat!'), 'couples-loveseat');
  assert.strictEqual(L.typeLabel([], 'wheelchair'), 'Wheelchair space');
});
