'use strict';

// Pure-logic coverage for the cinema domain: the parts that decide what a seat
// costs and whether two screenings collide. Anything that needs the database is
// exercised by the end-to-end flow instead, so these tests stay CI-safe.

const test = require('node:test');
const assert = require('node:assert');

const C = require('../lib/cinema');

const settings = {
  serviceFeePercent: 10,
  taxPercent: 5,
  categoryPrices: { ...C.DEFAULT_CATEGORY_MULTIPLIERS },
};

test('every seat category has a label and a price multiplier', () => {
  for (const category of C.SEAT_CATEGORIES) {
    assert.ok(C.SEAT_CATEGORY_LABELS[category], `${category} needs a label`);
    assert.strictEqual(typeof C.DEFAULT_CATEGORY_MULTIPLIERS[category], 'number', `${category} needs a multiplier`);
  }
  assert.deepStrictEqual(Object.keys(C.SEAT_CATEGORY_LABELS).sort(), [...C.SEAT_CATEGORIES].sort());
});

test('categoryLabel falls back to standard for unknown values', () => {
  assert.strictEqual(C.categoryLabel('vip'), 'VIP');
  assert.strictEqual(C.categoryLabel('balcony'), 'Standard');
  assert.strictEqual(C.categoryLabel(undefined), 'Standard');
});

test('accessible seating never costs more than a standard seat', () => {
  assert.ok(C.DEFAULT_CATEGORY_MULTIPLIERS.wheelchair <= C.DEFAULT_CATEGORY_MULTIPLIERS.standard);
  assert.ok(C.DEFAULT_CATEGORY_MULTIPLIERS.companion < C.DEFAULT_CATEGORY_MULTIPLIERS.standard);
});

test('a couple seat admits two people, everything else admits one', () => {
  assert.strictEqual(C.admissionsForSeat({ category: 'couple' }), 2);
  for (const category of C.SEAT_CATEGORIES.filter((entry) => entry !== 'couple')) {
    assert.strictEqual(C.admissionsForSeat({ category }), 1, `${category} admits one`);
  }
});

test('priceForSeat applies the category multiplier to the showtime base price', () => {
  const showtime = { base_price: 20 };
  assert.strictEqual(C.priceForSeat({ category: 'standard', price_override: null }, showtime, settings), 20);
  assert.strictEqual(C.priceForSeat({ category: 'vip', price_override: null }, showtime, settings), 34);
  assert.strictEqual(C.priceForSeat({ category: 'couple', price_override: null }, showtime, settings), 40);
});

test('priceForSeat honours a per-seat override above the multiplier', () => {
  const showtime = { base_price: 20 };
  assert.strictEqual(C.priceForSeat({ category: 'vip', price_override: 12.5 }, showtime, settings), 12.5);
  // A zero override is a real price, not a missing one.
  assert.strictEqual(C.priceForSeat({ category: 'standard', price_override: 0 }, showtime, settings), 0);
});

test('buildTotals adds the booking fee, then tax on the combined amount', () => {
  const lines = [
    { price: 100, admissions: 1 },
    { price: 50, admissions: 2 },
  ];
  const totals = C.buildTotals(lines, settings);
  assert.deepStrictEqual(totals, {
    subtotal: 150,
    serviceFee: 15,
    taxAmount: 8.25,
    total: 173.25,
    admissionsTotal: 3,
  });
});

test('buildTotals stays exact with awkward prices', () => {
  const totals = C.buildTotals([{ price: 33.33, admissions: 1 }], { serviceFeePercent: 2.5, taxPercent: 7.5 });
  assert.strictEqual(totals.subtotal, 33.33);
  assert.strictEqual(totals.serviceFee, 0.83);
  assert.strictEqual(totals.taxAmount, 2.56);
  assert.strictEqual(totals.total, 36.72);
});

test('buildTotals with no fees charged equals the seat subtotal', () => {
  const totals = C.buildTotals([{ price: 12, admissions: 1 }], { serviceFeePercent: 0, taxPercent: 0 });
  assert.strictEqual(totals.total, 12);
  assert.strictEqual(totals.serviceFee, 0);
  assert.strictEqual(totals.taxAmount, 0);
});

test('addMinutesHHMM wraps past midnight, which keeps late screenings ordered', () => {
  assert.strictEqual(C.addMinutesHHMM('23:30', 45), '00:15');
  assert.strictEqual(C.addMinutesHHMM('10:00', 95), '11:35');
  assert.strictEqual(C.addMinutesHHMM('00:00', 1440), '00:00');
});

test('stampFor builds a timezone-free UTC stamp from the venue wall clock', () => {
  const stamp = C.stampFor('2026-03-14', '21:45');
  assert.strictEqual(stamp.toISOString(), '2026-03-14T21:45:00.000Z');
  // Overlapping maths relies on the stamp, so a bad time must not throw.
  assert.ok(!Number.isNaN(C.stampFor('2026-03-14', 'nonsense').getTime()));
});

test('the per-order seat cap is a whole number the checkout can enforce', () => {
  assert.ok(Number.isInteger(C.MAX_SEATS_PER_ORDER));
  assert.ok(C.MAX_SEATS_PER_ORDER >= 1 && C.MAX_SEATS_PER_ORDER <= 20);
  assert.ok(C.HOLD_MAX_MINUTES > 0);
});
