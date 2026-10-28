'use strict';

/**
 * End-to-end rehearsal for physical tickets + point of sale against the
 * configured database.
 *
 * It walks the acceptance list: create a batch, print it (which must NOT sell
 * anything), sell at the counter with cash, replay the same idempotency key,
 * oversell guard shared with online sales, QR/ticket-number validation,
 * duplicate-scan rejection, refunds, and shift reconciliation. Everything it
 * creates is deleted at the end.
 *
 * Run with: node scratch/test-pos-e2e.js
 */

// Never let the rehearsal send real email.
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.MAILTRAP_API_TOKEN = '';

require('dotenv').config();

const assert = require('node:assert');
const { query, withTransaction, initDb } = require('../lib/db');
const T = require('../lib/ticketing');
const P = require('../lib/physical-ticketing');
const { signBookingCartJwt } = require('../lib/google-verify');
const posHandler = require('../api-routes/attraction-pos');
const salesHandler = require('../api-routes/attraction-ticket-sales');

const OWNER = '__pos-e2e__@bookingcart.local';
const CASHIER = '__pos-e2e-cashier__@bookingcart.local';
const INTRUDER = '__pos-e2e-intruder__@bookingcart.local';
const VISIT_DATE = T.isoToday();
const CAPACITY = 6;
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

async function call(handler, { method = 'POST', email = '', body = {} } = {}) {
  const headers = {};
  if (email) headers.authorization = `Bearer ${signBookingCartJwt({ email }, { expiresIn: '1h' })}`;
  const res = makeRes();
  await handler({ method, headers, body, query: {} }, res);
  return { status: res.statusCode, body: res.body };
}

function step(label, detail = '') {
  console.log(`  ✔ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function inventorySold(ticketTypeId) {
  const res = await query(
    `SELECT sold, reserved FROM bc_ticket_inventory
      WHERE ticket_type_id = $1 AND visit_date = $2 AND slot_id = 0`,
    [ticketTypeId, VISIT_DATE]
  );
  return Number(res.rows[0]?.sold || 0);
}

async function remaining(ticketTypeId) {
  return T.remainingFor(ticketTypeId, VISIT_DATE, 0);
}

/** Buy online through the shared inventory path (no Stripe round trip). */
async function onlinePurchase({ attractionId, ticketTypeId, quantity }) {
  const quote = await T.computeQuote({
    attractionId, visitDate: VISIT_DATE, items: [{ ticketTypeId, quantity }],
  });
  assert.strictEqual(quote.ok, true, `online quote failed: ${quote.error}`);
  const q = quote.quote;

  const types = await T.listTicketTypes(attractionId);
  const typeMap = new Map(types.map((type) => [Number(type.id), type]));
  const calendarRows = await T.getCalendar(attractionId, VISIT_DATE, VISIT_DATE);
  const attraction = await query(`SELECT name, owner_email FROM bc_attraction_profiles WHERE id = $1`, [attractionId]);

  const order = await withTransaction(async (client) => {
    const created = await client.query(
      `INSERT INTO bc_ticket_orders (
         booking_ref, attraction_id, attraction_name, owner_email, customer_name, customer_email,
         customer_phone, visit_date, slot_id, slot_label, subtotal, discount, promo_code,
         tax_amount, service_fee, total, currency, status, payment_status, payment_method,
         admissions_total, quantity_total, notes, channel, expires_at
       ) VALUES ($1,$2,$3,$4,'Online e2e',COALESCE($5, ''),COALESCE($6, ''),$7,0,'',$8,0,'',$9,$10,$11,$12,
                 'pending_payment','unpaid','',$13,$14,'e2e','online', NOW() + interval '30 minutes')
       RETURNING *`,
      [
        T.newBookingRef(), attractionId, attraction.rows[0].name, OWNER, '', '',
        VISIT_DATE, q.subtotal, q.taxAmount, q.serviceFee, q.total, q.currency,
        q.admissionsTotal, q.quantityTotal,
      ]
    );
    const row = created.rows[0];
    for (const line of q.lines) {
      await client.query(
        `INSERT INTO bc_ticket_order_items (
           order_id, ticket_type_id, ticket_type_name, slot_id, visit_date,
           unit_price, quantity, admissions_per_unit, line_total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [row.id, line.ticketTypeId, line.name, line.slotId, VISIT_DATE, line.unitPrice, line.quantity, line.admissions, line.lineTotal]
      );
    }
    await T.reserveInventory(client, { attractionId, visitDate: VISIT_DATE, lines: q.lines, typeMap, calendarRows });
    return row;
  });

  const finalized = await T.finalizeOrder(order.id, { paymentRef: 'offline-e2e', paymentMethod: 'card', actor: OWNER });
  return finalized;
}

async function cleanup() {
  for (const id of createdAttractions) {
    await query(`DELETE FROM bc_ticket_prints WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_attraction_tickets WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_ticket_batches WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_cash_movements WHERE attraction_id = $1`, [id]);
    await query(`DELETE FROM bc_cash_shifts WHERE attraction_id = $1`, [id]);
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
  console.log('\nPhysical ticketing / POS end-to-end rehearsal\n');

  const profile = await query(
    `INSERT INTO bc_attraction_profiles (owner_email, name, city, country, status, currency, description)
     VALUES ($1, '__E2E Ticket Office__', 'Kampala', 'Uganda', 'published', 'USD', 'Throwaway fixture')
     RETURNING id`,
    [OWNER]
  );
  const attractionId = profile.rows[0].id;
  createdAttractions.push(attractionId);

  const type = await T.saveTicketType(attractionId, OWNER, {
    name: 'E2E Gate Adult', category: 'adult', price: 10, admissions: 1,
    dailyCapacity: CAPACITY, minPerOrder: 1, maxPerOrder: 6, refundPolicy: 'flexible',
  });
  assert.strictEqual(type.ok, true, type.error);
  const ticketTypeId = type.ticketType.id;
  step('fixture ready', `attraction #${attractionId}, type #${ticketTypeId}, capacity ${CAPACITY}`);

  // ── Cashier management ────────────────────────────────────────────────────
  const grant = await call(posHandler, {
    email: OWNER,
    body: {
      action: 'save-cashier', attractionId, email: CASHIER, name: 'Gate cashier', role: 'scanner',
      permissions: { sell: true, print: true, reprint: true, shift: true },
    },
  });
  assert.strictEqual(grant.status, 200, JSON.stringify(grant.body));

  const cashierContext = await call(posHandler, { email: CASHIER, body: { action: 'context', attractionId } });
  assert.strictEqual(cashierContext.status, 200, JSON.stringify(cashierContext.body));
  assert.strictEqual(cashierContext.body.permissions.sell, true);
  assert.strictEqual(cashierContext.body.permissions.refund, false, 'selling must not grant refunds');
  assert.strictEqual(cashierContext.body.permissions.reports, false);
  assert.strictEqual(cashierContext.body.types.length, 1);
  step('cashier permissions', 'sell/print/shift granted, refund/reports denied');

  const ownerOnly = await call(posHandler, {
    email: CASHIER, body: { action: 'save-cashier', attractionId, email: INTRUDER, role: 'scanner' },
  });
  assert.strictEqual(ownerOnly.status, 403);
  step('permission enforced', 'cashier cannot create cashiers (403)');

  // ── Batch creation (does not sell anything) ───────────────────────────────
  const batchRes = await call(posHandler, {
    email: OWNER,
    body: {
      action: 'create-batch', attractionId, ticketTypeId, quantity: 4, visitDate: VISIT_DATE,
      name: 'E2E gate batch', template: 'a4_4',
    },
  });
  assert.strictEqual(batchRes.status, 200, JSON.stringify(batchRes.body));
  const batchId = batchRes.body.batch.id;
  assert.strictEqual(batchRes.body.batch.generated, 4);
  assert.strictEqual(batchRes.body.batch.sold, 0);
  assert.strictEqual(await inventorySold(ticketTypeId), 0, 'generating tickets must not touch inventory');
  assert.strictEqual(await remaining(ticketTypeId), CAPACITY);
  step('batch created', `${batchRes.body.batch.batchRef} · 4 tickets, 0 sold, inventory untouched`);

  const detail = await call(posHandler, { email: OWNER, body: { action: 'batch', attractionId, id: batchId } });
  assert.strictEqual(detail.status, 200);
  assert.strictEqual(detail.body.tickets.length, 4);
  assert.ok(detail.body.tickets.every((ticket) => ticket.status === 'available'));
  assert.ok(detail.body.tickets.every((ticket) => /^bct1\.PT-[0-9A-F]{12}\./.test(ticket.qrToken)));
  step('tickets carry signed QR tokens', 'all 4 available, bct1.<PT-no>.<sig>');

  const cashierBatch = await call(posHandler, {
    email: CASHIER, body: { action: 'create-batch', attractionId, ticketTypeId, quantity: 1, visitDate: VISIT_DATE },
  });
  assert.strictEqual(cashierBatch.status, 403, 'batch creation needs the manager role');
  step('batch creation is manager-only', `scanner got ${cashierBatch.status}`);

  // ── Printing never sells ──────────────────────────────────────────────────
  const printable = detail.body.tickets.map((ticket) => ticket.ticketNo);
  const firstPrint = await call(posHandler, {
    email: CASHIER, body: { action: 'print', attractionId, batchId, layout: 'a4_4' },
  });
  assert.strictEqual(firstPrint.status, 200, JSON.stringify(firstPrint.body));
  assert.strictEqual(firstPrint.body.kind, 'print');
  assert.strictEqual(firstPrint.body.printed, 4);

  const secondPrint = await call(posHandler, {
    email: CASHIER, body: { action: 'print', attractionId, batchId, layout: 'a4_4' },
  });
  assert.strictEqual(secondPrint.body.kind, 'reprint', 'printing already-printed stock is a reprint');
  assert.strictEqual(await inventorySold(ticketTypeId), 0);
  const ordersAfterPrint = await query(
    `SELECT COUNT(*)::int AS total FROM bc_ticket_orders WHERE attraction_id = $1`, [attractionId]
  );
  assert.strictEqual(ordersAfterPrint.rows[0].total, 0, 'printing must never create a sale');
  step('printing is inert', 'printed 4, reprint detected, 0 orders, 0 inventory');

  // ── Void a printed ticket ─────────────────────────────────────────────────
  const voidedTicketNo = printable[3];
  const voidRes = await call(posHandler, {
    email: OWNER, body: { action: 'void-tickets', attractionId, ticketNumbers: [voidedTicketNo], reason: 'Damaged in the printer' },
  });
  assert.strictEqual(voidRes.status, 200, JSON.stringify(voidRes.body));
  assert.strictEqual(voidRes.body.voided, 1);
  step('unsold ticket voided', voidedTicketNo);

  // A second batch that is never sold: printing alone must not issue admission.
  const spareBatch = await call(posHandler, {
    email: OWNER,
    body: { action: 'create-batch', attractionId, ticketTypeId, quantity: 1, visitDate: VISIT_DATE, name: 'E2E spare' },
  });
  assert.strictEqual(spareBatch.status, 200, JSON.stringify(spareBatch.body));
  const spareDetail = await call(posHandler, {
    email: OWNER, body: { action: 'batch', attractionId, id: spareBatch.body.batch.id },
  });
  const spareTicketNo = spareDetail.body.tickets[0].ticketNo;

  // ── Open the cashier shift ────────────────────────────────────────────────
  const openShift = await call(posHandler, {
    email: CASHIER, body: { action: 'open-shift', attractionId, openingCash: 20 },
  });
  assert.strictEqual(openShift.status, 200, JSON.stringify(openShift.body));
  const shiftId = openShift.body.shift.id;
  assert.strictEqual(openShift.body.shift.cashierName, 'Gate cashier');
  step('shift opened', `float 20, shift #${shiftId}`);

  // ── Counter sale: 2 tickets, cash ─────────────────────────────────────────
  // The counter totals come from the same pricing engine as online, so a
  // walk-in and a web visitor always pay the same price for the same ticket.
  const cashQuote = await T.computeQuote({
    attractionId, visitDate: VISIT_DATE, items: [{ ticketTypeId, quantity: 2 }],
  });
  assert.strictEqual(cashQuote.ok, true, cashQuote.error);
  const cashTotal = cashQuote.quote.total;
  const cashTendered = T.round2(cashTotal + 30);

  const key = P.newIdempotencyKey();
  const sale = await call(posHandler, {
    email: CASHIER,
    body: {
      action: 'pos-sale', attractionId, visitDate: VISIT_DATE, batchId,
      items: [{ ticketTypeId, quantity: 2 }],
      paymentMethod: 'cash', amountReceived: cashTendered, idempotencyKey: key,
      customerName: 'Walk-in e2e',
    },
  });
  assert.strictEqual(sale.status, 200, JSON.stringify(sale.body));
  assert.strictEqual(sale.body.order.status, 'confirmed');
  assert.strictEqual(sale.body.order.payment_status, 'paid');
  assert.strictEqual(Number(sale.body.order.total), cashTotal);
  assert.strictEqual(Number(sale.body.order.amount_received), cashTendered);
  assert.strictEqual(Number(sale.body.order.change_given), 30);
  assert.strictEqual(sale.body.tickets.length, 2);
  assert.match(sale.body.receipt.receiptNo, /^RCP-/);
  step('cash sale recorded', `total ${cashTotal}, change 30, receipt ${sale.body.receipt.receiptNo}`);

  const claimed = await query(
    `SELECT ticket_no, status, batch_id, source, order_id FROM bc_attraction_tickets
      WHERE order_id = $1 ORDER BY id ASC`, [sale.body.order.id]
  );
  assert.strictEqual(claimed.rows.length, 2);
  assert.ok(claimed.rows.every((row) => row.status === 'valid'));
  assert.ok(claimed.rows.every((row) => Number(row.batch_id) === Number(batchId)));
  assert.ok(claimed.rows.every((row) => row.source === 'physical'));
  assert.strictEqual(await inventorySold(ticketTypeId), 2);
  assert.strictEqual(await remaining(ticketTypeId), CAPACITY - 2);
  step('sale claimed batch stock', '2 valid tickets, inventory sold 2, 4 left');

  const batchAfterSale = await call(posHandler, { email: OWNER, body: { action: 'batch', attractionId, id: batchId } });
  assert.strictEqual(batchAfterSale.body.batch.sold, 2);
  assert.strictEqual(batchAfterSale.body.batch.available, 1);
  assert.strictEqual(batchAfterSale.body.batch.voided, 1);
  step('batch counters', `sold 2 · unsold 1 · voided 1 · printed 4`);

  // ── Double click / retry: the same key must not sell twice ────────────────
  const replay = await call(posHandler, {
    email: CASHIER,
    body: {
      action: 'pos-sale', attractionId, visitDate: VISIT_DATE, batchId,
      items: [{ ticketTypeId, quantity: 2 }],
      paymentMethod: 'cash', amountReceived: cashTendered, idempotencyKey: key,
    },
  });
  assert.strictEqual(replay.status, 200);
  assert.strictEqual(replay.body.duplicate, true);
  assert.strictEqual(replay.body.order.id, sale.body.order.id);
  assert.strictEqual(await inventorySold(ticketTypeId), 2, 'a replay must not consume more inventory');
  const orderCount = await query(`SELECT COUNT(*)::int AS total FROM bc_ticket_orders WHERE attraction_id = $1`, [attractionId]);
  assert.strictEqual(orderCount.rows[0].total, 1);
  step('idempotency', 'replayed key returned the original sale, no duplicates');

  // ── Capacity is shared with online sales ──────────────────────────────────
  await onlinePurchase({ attractionId, ticketTypeId, quantity: 3 });
  assert.strictEqual(await remaining(ticketTypeId), 1);
  const oversell = await call(posHandler, {
    email: CASHIER,
    body: {
      action: 'pos-sale', attractionId, visitDate: VISIT_DATE,
      items: [{ ticketTypeId, quantity: 2 }],
      paymentMethod: 'cash', amountReceived: 100, idempotencyKey: P.newIdempotencyKey(),
    },
  });
  assert.strictEqual(oversell.status, 409, JSON.stringify(oversell.body));
  assert.match(oversell.body.error, /ticket\(s\) left|sold out/i);
  step('shared capacity guard', 'online 3 + physical 2 = 5, the 6th+ ticket is refused');

  const cardQuote = await T.computeQuote({
    attractionId, visitDate: VISIT_DATE, items: [{ ticketTypeId, quantity: 1 }],
  });
  assert.strictEqual(cardQuote.ok, true, cardQuote.error);
  const cardTotal = cardQuote.quote.total;

  const last = await call(posHandler, {
    email: CASHIER,
    body: {
      action: 'pos-sale', attractionId, visitDate: VISIT_DATE, batchId,
      items: [{ ticketTypeId, quantity: 1 }],
      paymentMethod: 'card', paymentRef: 'TERM-0001', verified: true,
      idempotencyKey: P.newIdempotencyKey(),
    },
  });
  assert.strictEqual(last.status, 200, JSON.stringify(last.body));
  assert.strictEqual(Number(last.body.order.total), cardTotal);
  assert.strictEqual(await remaining(ticketTypeId), 0);
  step('card sale verified', `last admission sold for ${cardTotal}, capacity exhausted`);

  // ── Pending card sale cannot be admitted before payment ───────────────────
  const pendingCtx = await call(posHandler, {
    email: OWNER, body: { action: 'create-batch', attractionId, ticketTypeId, quantity: 1, visitDate: T.addDaysISO(VISIT_DATE, 1) },
  });
  assert.strictEqual(pendingCtx.status, 200, JSON.stringify(pendingCtx.body));
  const tomorrowBatchId = pendingCtx.body.batch.id;
  const pendingSale = await call(posHandler, {
    email: CASHIER,
    body: {
      action: 'pos-sale', attractionId, visitDate: T.addDaysISO(VISIT_DATE, 1), batchId: tomorrowBatchId,
      items: [{ ticketTypeId, quantity: 1 }],
      paymentMethod: 'mobile_money', idempotencyKey: P.newIdempotencyKey(),
    },
  });
  assert.strictEqual(pendingSale.status, 200, JSON.stringify(pendingSale.body));
  assert.strictEqual(pendingSale.body.pendingPayment, true);
  const pendingTicket = pendingSale.body.tickets[0].ticketNo;
  const pendingScan = await call(salesHandler, {
    email: CASHIER, body: { action: 'validate', attractionId, ticket: pendingTicket },
  });
  assert.strictEqual(pendingScan.body.outcome, 'unpaid', JSON.stringify(pendingScan.body));
  step('unverified payment blocks entry', `outcome ${pendingScan.body.outcome}`);

  const confirmed = await call(posHandler, {
    email: CASHIER,
    body: { action: 'confirm-payment', attractionId, id: pendingSale.body.order.id, paymentRef: 'MOMO-7788' },
  });
  assert.strictEqual(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.strictEqual(confirmed.body.order.payment_status, 'paid');
  step('payment confirmed after verification', 'pending sale finalised with MOMO-7788');

  // Roll that side sale back so the capacity maths stay easy to reason about.
  const sideRefund = await call(posHandler, {
    email: OWNER, body: { action: 'refund-sale', attractionId, id: pendingSale.body.order.id, reason: 'E2E cleanup of side sale' },
  });
  assert.strictEqual(sideRefund.status, 200, JSON.stringify(sideRefund.body));
  step('physical refund', `refunded ${sideRefund.body.refunded}`);

  // A complimentary issue still consumes capacity and issues a real ticket, but
  // it must never be counted as money taken.
  const compSale = await call(posHandler, {
    email: CASHIER,
    body: {
      action: 'pos-sale', attractionId, visitDate: T.addDaysISO(VISIT_DATE, 1),
      items: [{ ticketTypeId, quantity: 1 }],
      paymentMethod: 'complimentary', idempotencyKey: P.newIdempotencyKey(),
    },
  });
  assert.strictEqual(compSale.status, 200, JSON.stringify(compSale.body));
  assert.strictEqual(compSale.body.order.payment_status, 'paid');
  assert.strictEqual(Number(compSale.body.order.total), 0, 'a comp must not book revenue');
  assert.ok(Number(compSale.body.order.subtotal) > 0, 'the stub still shows the list price');
  step('complimentary issue', 'ticket issued at zero value, list price kept on the stub');

  // ── QR / ticket-number validation ─────────────────────────────────────────
  const soldTicketNo = claimed.rows[0].ticket_no;
  const unsigned = await call(salesHandler, {
    email: CASHIER, body: { action: 'validate', attractionId, ticket: soldTicketNo },
  });
  assert.strictEqual(unsigned.body.outcome, 'valid', JSON.stringify(unsigned.body));
  step('manual ticket number validates', soldTicketNo);

  const byQr = await call(salesHandler, {
    email: CASHIER, body: { action: 'admit', attractionId, ticket: `bct1.${soldTicketNo}.${''}` },
  });
  assert.strictEqual(byQr.body.outcome, 'invalid', 'a malformed QR signature must be rejected');
  step('tampered QR rejected', byQr.body.outcome);

  // The code printed on the stub is the real signed token, so scan it as-is.
  const qrTicketNo = claimed.rows[1].ticket_no;
  const qrAdmit = await call(salesHandler, {
    email: CASHIER, body: { action: 'admit', attractionId, ticket: T.signTicketToken(qrTicketNo), admissions: 1 },
  });
  assert.strictEqual(qrAdmit.body.outcome, 'valid', JSON.stringify(qrAdmit.body));
  step('printed QR admits', `${qrTicketNo} accepted from the signed stub`);

  const admit = await call(salesHandler, {
    email: CASHIER, body: { action: 'admit', attractionId, ticket: soldTicketNo, admissions: 1 },
  });
  assert.strictEqual(admit.body.outcome, 'valid', JSON.stringify(admit.body));
  step('admission recorded', `${soldTicketNo} admitted once`);

  const duplicate = await call(salesHandler, {
    email: CASHIER, body: { action: 'admit', attractionId, ticket: soldTicketNo, admissions: 1 },
  });
  assert.strictEqual(duplicate.body.outcome, 'already_used', JSON.stringify(duplicate.body));
  step('duplicate scan refused', duplicate.body.outcome);

  const unsoldScan = await call(salesHandler, {
    email: CASHIER, body: { action: 'validate', attractionId, ticket: spareTicketNo },
  });
  assert.strictEqual(unsoldScan.body.outcome, 'not_issued', JSON.stringify(unsoldScan.body));
  step('printed-but-unsold ticket refused', unsoldScan.body.outcome);

  const voidScan = await call(salesHandler, {
    email: CASHIER, body: { action: 'validate', attractionId, ticket: voidedTicketNo },
  });
  assert.strictEqual(voidScan.body.outcome, 'voided', JSON.stringify(voidScan.body));
  step('voided ticket refused', voidScan.body.outcome);

  const stranger = await call(salesHandler, {
    email: INTRUDER, body: { action: 'validate', attractionId, ticket: soldTicketNo },
  });
  assert.strictEqual(stranger.status, 403);
  step('authorization enforced', 'stranger cannot validate (403)');

  // ── Refund reverses payment, capacity and admission rights ────────────────
  const refund = await call(posHandler, {
    email: OWNER, body: { action: 'refund-sale', attractionId, id: sale.body.order.id, reason: 'Visitor cancelled at the gate' },
  });
  assert.strictEqual(refund.status, 200, JSON.stringify(refund.body));
  assert.strictEqual(refund.body.refunded, cashTotal);
  assert.strictEqual(await remaining(ticketTypeId), 2, 'refunding returns the admissions to inventory');
  const refundedScan = await call(salesHandler, {
    email: CASHIER, body: { action: 'validate', attractionId, ticket: soldTicketNo },
  });
  assert.ok(['refunded', 'cancelled'].includes(refundedScan.body.outcome), JSON.stringify(refundedScan.body));
  step('refund releases capacity', `tickets ${refundedScan.body.outcome}, 2 admissions back on sale`);

  const cashierRefund = await call(posHandler, {
    email: CASHIER, body: { action: 'refund-sale', attractionId, id: last.body.order.id, reason: 'try' },
  });
  assert.strictEqual(cashierRefund.status, 403, 'a cashier without the refund permission must be blocked');
  step('refund permission enforced', `scanner got ${cashierRefund.status}`);

  // ── Shift reconciliation ──────────────────────────────────────────────────
  const shift = await call(posHandler, { email: CASHIER, body: { action: 'shift', attractionId } });
  assert.strictEqual(shift.status, 200, JSON.stringify(shift.body));
  // Gross cash intake is still reported and the refund is subtracted on its own
  // line, while a card payment must never be counted as cash in the drawer.
  assert.strictEqual(shift.body.shift.cashSales, cashTotal);
  assert.strictEqual(shift.body.shift.cashRefunds, cashTotal);
  assert.strictEqual(shift.body.shift.cardSales, cardTotal);
  assert.strictEqual(shift.body.shift.expectedCashNow, 20, 'opening float + cash in - cash refunded');

  const badClose = await call(posHandler, {
    email: CASHIER, body: { action: 'close-shift', attractionId, shiftId, countedCash: 18 },
  });
  assert.strictEqual(badClose.status, 400, 'a discrepancy needs a reason');
  step('discrepancy requires a reason', `status ${badClose.status}`);

  const closed = await call(posHandler, {
    email: CASHIER, body: { action: 'close-shift', attractionId, shiftId, countedCash: 18, note: 'Short 2 — change given from the float' },
  });
  assert.strictEqual(closed.status, 200, JSON.stringify(closed.body));
  assert.strictEqual(closed.body.shift.status, 'closed');
  assert.strictEqual(closed.body.shift.expectedCash, 20);
  assert.strictEqual(closed.body.shift.difference, -2);
  assert.strictEqual(closed.body.discrepancy, true);
  step('shift reconciled', 'expected 20, counted 18, difference -2 recorded');

  // ── Reports keep generated / printed / sold / used apart ──────────────────
  const reports = await call(posHandler, {
    email: OWNER, body: { action: 'reports', attractionId, from: VISIT_DATE, to: VISIT_DATE },
  });
  assert.strictEqual(reports.status, 200, JSON.stringify(reports.body));
  const states = reports.body.ticketStates;
  assert.ok(states.generated >= 5, JSON.stringify(states));
  assert.ok(states.printed >= 4);
  assert.ok(states.sold >= 1);
  assert.ok(states.used >= 1);
  assert.ok(reports.body.byChannel.some((row) => row.channel === 'pos'));
  assert.ok(reports.body.byChannel.some((row) => row.channel === 'online'));
  assert.ok(reports.body.byPaymentMethod.some((row) => row.method === 'card'));
  assert.ok(reports.body.byCashier.some((row) => String(row.cashier).includes(CASHIER)));
  assert.strictEqual(reports.body.shifts.discrepancies, 1);
  step('reports', `generated ${states.generated} · printed ${states.printed} · sold ${states.sold} · used ${states.used}`);

  // Sensitive actions must leave a trail, not just change numbers.
  const audit = await query(
    `SELECT action, COUNT(*)::int AS total FROM bc_ticket_audit
      WHERE attraction_id = $1 GROUP BY action`, [attractionId]
  );
  const audited = new Map(audit.rows.map((row) => [row.action, row.total]));
  for (const expected of ['batch.created', 'batch.printed', 'batch.reprinted', 'ticket.voided', 'ticket.admitted', 'pos.sale', 'order.refunded', 'shift.closed']) {
    assert.ok(audited.get(expected) >= 1, `expected an audit entry for ${expected}, saw ${[...audited.keys()].join(', ')}`);
  }
  step('audit trail', `${audit.rows.length} action types on record`);

  const cashierReports = await call(posHandler, {
    email: CASHIER, body: { action: 'reports', attractionId, from: VISIT_DATE, to: VISIT_DATE },
  });
  assert.strictEqual(cashierReports.status, 403);
  step('reports permission enforced', 'cashier blocked');

  // ── Batch lifecycle: sold batches archive, never delete ───────────────────
  const deleteBlocked = await call(posHandler, {
    email: OWNER, body: { action: 'delete-batch', attractionId, batchId },
  });
  assert.strictEqual(deleteBlocked.status, 409, JSON.stringify(deleteBlocked.body));
  assert.match(deleteBlocked.body.error, /Archive/);
  step('sold batch cannot be deleted', 'archive instead');

  const archived = await call(posHandler, {
    email: OWNER, body: { action: 'archive-batch', attractionId, batchId },
  });
  assert.strictEqual(archived.status, 200, JSON.stringify(archived.body));
  assert.strictEqual(archived.body.status, 'archived');
  step('batch archived', `${batchRes.body.batch.batchRef}`);

  const emptyBatch = await call(posHandler, {
    email: OWNER, body: { action: 'create-batch', attractionId, ticketTypeId, quantity: 2, visitDate: T.addDaysISO(VISIT_DATE, 3) },
  });
  const removed = await call(posHandler, {
    email: OWNER, body: { action: 'delete-batch', attractionId, batchId: emptyBatch.body.batch.id },
  });
  assert.strictEqual(removed.status, 200, JSON.stringify(removed.body));
  step('unsold batch deleted', 'nothing was ever sold from it');

  console.log('\nAll physical ticketing checks passed.\n');
}

main()
  .catch(async (error) => {
    console.error('\nFAILED:', error.message, '\n', error.stack);
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
