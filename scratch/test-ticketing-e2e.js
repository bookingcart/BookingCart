'use strict';

/**
 * End-to-end check for the attraction ticketing system against the configured
 * database. It creates a throwaway attraction (owner `__ticketing-e2e__`),
 * exercises availability -> quote -> reserve -> oversell guard -> payment
 * finalisation -> QR admission -> refund, then deletes every row it created.
 *
 * Run with: node scratch/test-ticketing-e2e.js
 */

// Never let the rehearsal send real email.
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.MAILTRAP_API_TOKEN = '';

require('dotenv').config();

const assert = require('node:assert');
const { query, withTransaction, initDb } = require('../lib/db');
const T = require('../lib/ticketing');
const { signBookingCartJwt } = require('../lib/google-verify');
const managerHandler = require('../api-routes/attraction-ticketing');
const salesHandler = require('../api-routes/attraction-ticket-sales');
const checkoutHandler = require('../api-routes/attraction-ticket-checkout');

const OWNER = '__ticketing-e2e__@bookingcart.local';
const CUSTOMER = '__ticketing-e2e-customer__@bookingcart.local';
const VISIT_DATE = T.isoToday();
const createdAttractions = [];

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(body) { this.body = body || ''; return this; },
  };
}

async function call(handler, { method = 'GET', email = '', body = {} } = {}) {
  const headers = {};
  if (email) headers.authorization = `Bearer ${signBookingCartJwt({ email }, { expiresIn: '1h' })}`;
  const res = makeRes();
  await handler(
    { method, headers, body, query: method === 'GET' ? body : undefined },
    res
  );
  return { status: res.statusCode, body: res.body };
}

function step(label, detail = '') {
  console.log(`  ✔ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function reserveOrder({ attractionId, lines, customerName }) {
  const quote = await T.computeQuote({ attractionId, visitDate: VISIT_DATE, items: lines });
  assert.strictEqual(quote.ok, true, `quote failed: ${quote.error}`);
  const q = quote.quote;
  const types = await T.listTicketTypes(attractionId);
  const typeMap = new Map(types.map((type) => [Number(type.id), type]));
  const calendarRows = await T.getCalendar(attractionId, VISIT_DATE, VISIT_DATE);

  const order = await withTransaction(async (client) => {
    const attraction = await client.query(
      `SELECT id, name, owner_email FROM bc_attraction_profiles WHERE id = $1`, [attractionId]
    );
    const created = await client.query(
      `INSERT INTO bc_ticket_orders (
         booking_ref, attraction_id, attraction_name, owner_email, customer_name, customer_email,
         customer_phone, visit_date, slot_id, slot_label, subtotal, discount, promo_code,
         tax_amount, service_fee, total, currency, status, payment_status, payment_method,
         admissions_total, quantity_total, notes, channel, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'',$7,0,'',$8,0,'',$9,$10,$11,$12,
                 'pending_payment','unpaid','',$13,$14,'e2e','online', NOW() + interval '30 minutes')
       RETURNING *`,
      [
        T.newBookingRef(), attractionId, attraction.rows[0].name, OWNER, customerName, CUSTOMER,
        VISIT_DATE, q.subtotal, q.taxAmount, q.serviceFee, q.total, q.currency,
        q.admissionsTotal, q.quantityTotal,
      ]
    );
    for (const line of q.lines) {
      await client.query(
        `INSERT INTO bc_ticket_order_items (
           order_id, ticket_type_id, ticket_type_name, slot_id, visit_date,
           unit_price, quantity, admissions_per_unit, line_total
         ) VALUES ($1,$2,$3,0,$4,$5,$6,$7,$8)`,
        [created.rows[0].id, line.ticketTypeId, line.name, VISIT_DATE, line.unitPrice, line.quantity, line.admissions, line.lineTotal]
      );
    }
    await T.reserveInventory(client, {
      attractionId, visitDate: VISIT_DATE, lines: q.lines, typeMap, calendarRows,
    });
    return { ...created.rows[0], quote: q };
  });

  return order;
}

async function loadOrder(orderId) {
  const res = await query(`SELECT * FROM bc_ticket_orders WHERE id = $1`, [orderId]);
  return res.rows[0];
}

async function ticketsFor(orderId) {
  const res = await query(`SELECT * FROM bc_attraction_tickets WHERE order_id = $1 ORDER BY id ASC`, [orderId]);
  return res.rows;
}

async function cleanup() {
  for (const id of createdAttractions) {
    await query(`DELETE FROM bc_attraction_tickets WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_order_items WHERE order_id IN (SELECT id FROM bc_ticket_orders WHERE attraction_id = $1)`, [id]);
    await query(`DELETE FROM bc_ticket_orders WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_inventory WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_calendar WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_promos WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_slots WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_types WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_settings WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_staff WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_audit WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_validations WHERE service_id = $1`, [String(id)]);
    await query(`DELETE FROM bc_attraction_profiles WHERE id = $1 AND owner_email = $2`, [id, OWNER]);
  }
}

async function main() {
  await initDb();
  console.log('\nTicketing end-to-end rehearsal\n');

  const profile = await query(
    `INSERT INTO bc_attraction_profiles (owner_email, name, city, country, status, currency, description)
     VALUES ($1, '__E2E Ticketing Attraction__', 'Kampala', 'Uganda', 'published', 'USD', 'Throwaway fixture')
     RETURNING id`,
    [OWNER]
  );
  const attractionId = profile.rows[0].id;
  createdAttractions.push(attractionId);

  // ── Owner configures the listing ──────────────────────────────────────────
  await managerHandler(
    { method: 'POST', headers: { authorization: `Bearer ${signBookingCartJwt({ email: OWNER })}` },
      body: { action: 'save-settings', attractionId, settings: { tax_percent: 10, service_fee_percent: 5, auto_confirm: true } } },
    makeRes()
  );
  const settings = await T.getSettings(attractionId);
  assert.strictEqual(Number(settings.tax_percent), 10);
  step('owner settings saved', `tax ${settings.tax_percent}% / fee ${settings.service_fee_percent}%`);

  const group = await T.saveTicketType(attractionId, OWNER, {
    name: 'E2E Group Pass', category: 'family', price: 20, admissions: 2, dailyCapacity: 5,
    minPerOrder: 1, maxPerOrder: 4, refundPolicy: 'flexible',
  });
  const single = await T.saveTicketType(attractionId, OWNER, {
    name: 'E2E Single', category: 'adult', price: 10, admissions: 1, dailyCapacity: 2,
    minPerOrder: 1, maxPerOrder: 2, refundPolicy: 'flexible',
  });
  assert.strictEqual(group.ok, true, group.error);
  assert.strictEqual(single.ok, true, single.error);
  const groupId = group.ticketType.id;
  const singleId = single.ticketType.id;
  step('ticket types published', `#${groupId} group, #${singleId} single`);

  // ── Public availability + server-side pricing ─────────────────────────────
  const availability = await call(checkoutHandler, { body: { action: 'availability', attractionId, date: VISIT_DATE } });
  assert.strictEqual(availability.status, 200, JSON.stringify(availability.body));
  const groupPublic = availability.body.types.find((type) => type.id === groupId);
  assert.strictEqual(groupPublic.remaining, 5);
  assert.strictEqual(groupPublic.available, true);
  step('public availability', `${groupPublic.name} ${groupPublic.remaining} left @ ${groupPublic.price}`);

  const quote = await call(checkoutHandler, {
    body: { action: 'quote', attractionId, visitDate: VISIT_DATE, items: [{ ticketTypeId: groupId, quantity: 2 }] },
  });
  assert.strictEqual(quote.status, 200, JSON.stringify(quote.body));
  assert.strictEqual(quote.body.quote.subtotal, 40);
  assert.strictEqual(quote.body.quote.taxAmount, 4);
  assert.strictEqual(quote.body.quote.serviceFee, 2);
  assert.strictEqual(quote.body.quote.total, 46);
  step('server-side quote', 'subtotal 40 + tax 4 + fee 2 = 46');

  // ── Reservation holds inventory ───────────────────────────────────────────
  const groupOrder = await reserveOrder({
    attractionId, customerName: 'E2E Buyer',
    lines: [{ ticketTypeId: groupId, quantity: 2 }],
  });
  let remaining = await T.remainingFor(groupId, VISIT_DATE);
  assert.strictEqual(remaining, 3);
  step('reservation holds inventory', `${remaining} of 5 left`);

  const singleOrder = await reserveOrder({
    attractionId, customerName: 'E2E Single Buyer',
    lines: [{ ticketTypeId: singleId, quantity: 2 }],
  });
  assert.strictEqual(await T.remainingFor(singleId, VISIT_DATE), 0);

  // Oversell guard: the last ticket is gone, so both the public quote and a
  // direct reservation attempt must refuse to hand out stock.
  const soldOutQuote = await T.computeQuote({
    attractionId, visitDate: VISIT_DATE, items: [{ ticketTypeId: singleId, quantity: 1 }],
  });
  assert.strictEqual(soldOutQuote.ok, false);

  const oversell = await (async () => {
    const types = await T.listTicketTypes(attractionId);
    const typeMap = new Map(types.map((type) => [Number(type.id), type]));
    const calendarRows = await T.getCalendar(attractionId, VISIT_DATE, VISIT_DATE);
    const lines = [{
      ticketTypeId: singleId, name: 'E2E Single', slotId: 0, slotLabel: '',
      unitPrice: 10, quantity: 1, admissions: 1, lineTotal: 10,
    }];
    try {
      await withTransaction((client) => T.reserveInventory(client, {
        attractionId, visitDate: VISIT_DATE, lines, typeMap, calendarRows,
      }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message, code: error.code };
    }
  })();
  assert.strictEqual(oversell.ok, false);
  assert.strictEqual(oversell.code, 'SOLD_OUT');
  step('oversell blocked', oversell.error);

  // ── Payment finalisation issues tickets ───────────────────────────────────
  const finalized = await T.finalizeOrder(groupOrder.id, { paymentRef: 'e2e-manual', paymentMethod: 'card' });
  assert.strictEqual(finalized.alreadyFinalized, false);
  const groupTickets = await ticketsFor(groupOrder.id);
  assert.strictEqual(groupTickets.length, 2);
  assert.strictEqual(Number(groupTickets[0].admissions_total), 2);
  assert.ok(groupTickets[0].qr_token.startsWith('bct1.'));
  const again = await T.finalizeOrder(groupOrder.id, { paymentRef: 'e2e-manual', paymentMethod: 'card' });
  assert.strictEqual(again.alreadyFinalized, true);
  assert.strictEqual((await ticketsFor(groupOrder.id)).length, 2);
  const invAfterSale = await query(
    `SELECT sold, reserved FROM bc_ticket_inventory WHERE ticket_type_id = $1 AND visit_date = $2 AND slot_id = 0`,
    [groupId, VISIT_DATE]
  );
  assert.strictEqual(Number(invAfterSale.rows[0].sold), 2);
  assert.strictEqual(Number(invAfterSale.rows[0].reserved), 0);
  step('payment finalised', '2 tickets issued, sold 2 / reserved 0, retry is idempotent');

  await T.finalizeOrder(singleOrder.id, { paymentRef: 'e2e-manual', paymentMethod: 'card' });
  const singleTickets = await ticketsFor(singleOrder.id);

  // ── QR admission through the real handler ─────────────────────────────────
  const auth = { email: OWNER, body: { attractionId } };
  const groupTicket = groupTickets[0];
  const scan = await call(salesHandler, {
    method: 'POST', email: OWNER,
    body: { action: 'admit', attractionId, ticket: groupTicket.qr_token, admissions: 1 },
  });
  assert.strictEqual(scan.body.ok, true, JSON.stringify(scan.body));
  assert.strictEqual(scan.body.admissionsRemaining, 1);
  step('QR admission', `${groupTicket.ticket_no} admitted 1/2`);

  const scanAgain = await call(salesHandler, {
    method: 'POST', email: OWNER,
    body: { action: 'admit', attractionId, ticket: groupTicket.ticket_no, admissions: 1 },
  });
  assert.strictEqual(scanAgain.body.ok, true);
  assert.strictEqual(scanAgain.body.admissionsRemaining, 0);

  const scanThird = await call(salesHandler, {
    method: 'POST', email: OWNER,
    body: { action: 'admit', attractionId, ticket: groupTicket.ticket_no, admissions: 1 },
  });
  assert.strictEqual(scanThird.body.ok, false);
  assert.strictEqual(scanThird.body.outcome, 'already_used');
  step('group admissions tracked', 'third admission rejected as already_used');

  // Concurrent double scan of a single-use ticket must admit exactly once.
  const concurrent = await Promise.all([
    call(salesHandler, { method: 'POST', email: OWNER, body: { action: 'admit', attractionId, ticket: singleTickets[0].ticket_no } }),
    call(salesHandler, { method: 'POST', email: OWNER, body: { action: 'admit', attractionId, ticket: singleTickets[0].ticket_no } }),
  ]);
  const admitted = concurrent.filter((result) => result.body.ok).length;
  assert.strictEqual(admitted, 1, JSON.stringify(concurrent.map((result) => result.body.outcome)));
  step('duplicate scan blocked', 'one of two concurrent scans admitted');

  // Scanning from another attraction is rejected.
  const other = await query(
    `INSERT INTO bc_attraction_profiles (owner_email, name, status) VALUES ($1, '__E2E Other__', 'published') RETURNING id`,
    [OWNER]
  );
  const otherId = other.rows[0].id;
  createdAttractions.push(otherId);
  const wrong = await call(salesHandler, {
    method: 'POST', email: OWNER, body: { action: 'validate', attractionId: otherId, ticket: singleTickets[1].ticket_no },
  });
  assert.strictEqual(wrong.body.outcome, 'wrong_attraction');
  step('wrong attraction rejected', wrong.body.message);

  // ── Sales ledger reads real rows ──────────────────────────────────────────
  const ledger = await call(salesHandler, {
    email: OWNER,
    body: { action: 'sales', attractionId, from: VISIT_DATE, to: VISIT_DATE },
  });
  assert.strictEqual(ledger.status, 200);
  assert.ok(ledger.body.sales.length >= 2);
  const detail = await call(salesHandler, { email: OWNER, body: { action: 'sale', attractionId, id: groupOrder.id } });
  assert.strictEqual(detail.body.order.visitDate, VISIT_DATE);
  assert.ok(detail.body.order.ticketNumbers.includes(groupTicket.ticket_no));
  step('sales ledger', `${ledger.body.sales.length} bookings, detail has ticket numbers`);

  // ── Refund releases inventory and invalidates tickets ─────────────────────
  await query(`UPDATE bc_ticket_orders SET payment_method = 'complimentary' WHERE id = $1`, [groupOrder.id]);
  const paidOrder = await loadOrder(groupOrder.id);
  const cancelled = await T.cancelOrder({ order: paidOrder, reason: 'e2e cancel', actor: OWNER });
  assert.strictEqual(cancelled.ok, true, JSON.stringify(cancelled));
  const refreshed = await loadOrder(groupOrder.id);
  // The visit starts at 09:00 and is already under way, so the flexible policy
  // refunds nothing and the booking lands in `cancelled`.
  assert.strictEqual(refreshed.status, 'cancelled');
  assert.strictEqual(await T.remainingFor(groupId, VISIT_DATE), 5);
  const refundedScan = await call(salesHandler, {
    method: 'POST', email: OWNER,
    body: { action: 'validate', attractionId, ticket: groupTicket.ticket_no },
  });
  assert.strictEqual(refundedScan.body.outcome, 'cancelled');
  step('cancellation processed', 'inventory released, tickets voided');

  // ── Refund of a future visit returns the money and the stock ──────────────
  const tomorrow = T.addDaysISO(VISIT_DATE, 3);
  const futureType = await T.saveTicketType(attractionId, OWNER, {
    name: 'E2E Future Pass', category: 'adult', price: 15, admissions: 1, dailyCapacity: 3,
    refundPolicy: 'flexible',
  });
  const futureTypeId = futureType.ticketType.id;
  const futureQuote = (await T.computeQuote({
    attractionId, visitDate: tomorrow, items: [{ ticketTypeId: futureTypeId, quantity: 2 }],
  })).quote;
  const futureOrder = await withTransaction(async (client) => {
    const created = await client.query(
      `INSERT INTO bc_ticket_orders (
         booking_ref, attraction_id, attraction_name, owner_email, customer_name, customer_email,
         customer_phone, visit_date, slot_id, slot_label, subtotal, discount, promo_code,
         tax_amount, service_fee, total, currency, status, payment_status, payment_method,
         admissions_total, quantity_total, notes, channel, expires_at
       ) VALUES ($1,$2,'Future fixture',$3,'E2E Future',$4,'',$5,0,'',$6,0,'',$7,$8,$9,$10,
                 'pending_payment','unpaid','',$11,$12,'e2e refund','online', NOW() + interval '30 minutes')
       RETURNING *`,
      [T.newBookingRef(), attractionId, OWNER, CUSTOMER, tomorrow, futureQuote.subtotal,
        futureQuote.taxAmount, futureQuote.serviceFee, futureQuote.total, futureQuote.currency,
        futureQuote.admissionsTotal, futureQuote.quantityTotal]
    );
    for (const line of futureQuote.lines) {
      await client.query(
        `INSERT INTO bc_ticket_order_items (
           order_id, ticket_type_id, ticket_type_name, slot_id, visit_date,
           unit_price, quantity, admissions_per_unit, line_total
         ) VALUES ($1,$2,$3,0,$4,$5,$6,$7,$8)`,
        [created.rows[0].id, line.ticketTypeId, line.name, tomorrow, line.unitPrice, line.quantity, line.admissions, line.lineTotal]
      );
    }
    const types = await T.listTicketTypes(attractionId);
    await T.reserveInventory(client, {
      attractionId, visitDate: tomorrow, lines: futureQuote.lines,
      typeMap: new Map(types.map((type) => [Number(type.id), type])),
      calendarRows: await T.getCalendar(attractionId, tomorrow, tomorrow),
    });
    return created.rows[0];
  });
  await T.finalizeOrder(futureOrder.id, { paymentRef: 'e2e-manual', paymentMethod: 'complimentary' });
  assert.strictEqual(await T.remainingFor(futureTypeId, tomorrow), 1);

  const refund = await T.refundOrder({ order: await loadOrder(futureOrder.id), actor: OWNER, reason: 'e2e refund' });
  assert.strictEqual(refund.ok, true, JSON.stringify(refund));
  assert.strictEqual(refund.status, 'refunded');
  assert.strictEqual(await T.remainingFor(futureTypeId, tomorrow), 3);
  const futureTickets = await ticketsFor(futureOrder.id);
  assert.ok(futureTickets.every((ticket) => ticket.status === 'refunded'));
  const audit = await query(`SELECT action FROM bc_ticket_audit WHERE attraction_id = $1`, [attractionId]);
  assert.ok(audit.rows.some((row) => row.action === 'order.refunded'));
  step('refund processed', `refunded ${refund.refunded}, stock back to ${await T.remainingFor(futureTypeId, tomorrow)}`);

  // ── Reports and overview read the same rows ───────────────────────────────
  const overview = await call(managerHandler, {
    email: OWNER,
    body: { action: 'overview', attractionId, from: VISIT_DATE, to: VISIT_DATE },
  });
  assert.strictEqual(overview.status, 200, JSON.stringify(overview.body));
  const stats = overview.body.stats;
  assert.strictEqual(stats.totalOrders, 3, JSON.stringify(stats));
  // The cancelled group booking keeps its paid revenue while the refunded
  // future booking drops out, so three of the four issued admissions count.
  assert.ok(stats.ticketsSold >= 3, JSON.stringify(stats));
  assert.strictEqual(stats.confirmedBookings, 1);
  assert.ok(stats.cancelledBookings >= 2);
  assert.ok(stats.refunded > 0);
  assert.ok(stats.visitorsCheckedIn >= 2);
  const reports = await call(managerHandler, {
    email: OWNER,
    body: { action: 'reports', attractionId, from: VISIT_DATE, to: VISIT_DATE },
  });
  assert.strictEqual(reports.status, 200);
  assert.ok(reports.body.byDay.length >= 1);
  assert.ok(reports.body.cancellations.cancelled >= 2);
  step('overview + reports', `${stats.ticketsSold} tickets, ${reports.body.byDay.length} day buckets, ${stats.visitorsCheckedIn} checked in`);

  // ── Authorization: a stranger cannot read the ledger ──────────────────────
  const stranger = await call(salesHandler, {
    email: '__ticketing-e2e-intruder__@bookingcart.local',
    body: { action: 'sales', attractionId },
  });
  assert.strictEqual(stranger.status, 403);
  step('authorization enforced', 'non-owner blocked with 403');

  console.log('\nAll end-to-end checks passed.\n');
}

main()
  .catch(async (error) => {
    console.error('\nFAILED:', error.message, '\n');
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
      console.log('Cleaned up rehearsal data.');
    } catch (error) {
      console.error('Cleanup failed:', error.message);
      process.exitCode = 1;
    }
    process.exit(process.exitCode || 0);
  });
