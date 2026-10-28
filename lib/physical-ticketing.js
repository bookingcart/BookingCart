'use strict';

/**
 * Physical ticketing + point of sale.
 *
 * A physical ticket is a row in bc_attraction_tickets with source='physical'.
 * It is created in status 'available' (printed stock) and becomes 'valid' only
 * when a POS sale claims it, so printing never counts as a sale. Sales reuse
 * bc_ticket_orders (channel='pos'), which means the same inventory counters,
 * refund policy and QR validation serve both online and counter sales.
 *
 * Write statements bind optional text through COALESCE($n, ''): managed Postgres
 * proxies (Nile) turn an empty-string parameter into NULL.
 */

const crypto = require('crypto');
const { query, withTransaction } = require('./db');
const T = require('./ticketing');
const B = require('./ticket-branding');

const PAYMENT_METHODS = ['cash', 'mobile_money', 'card', 'other', 'complimentary'];
const PRINT_LAYOUTS = ['a4_4', 'a4_8', 'a4_1', 'thermal'];
const BATCH_STATUSES = ['open', 'closed', 'archived'];
const POS_PERMISSIONS = ['sell', 'print', 'reprint', 'void', 'refund', 'reports', 'shift', 'payout', 'viewAllSales'];
const MAX_BATCH_QUANTITY = 500;
const MAX_POS_TICKETS = 50;

const ALL_PERMISSIONS = Object.freeze({
  sell: true, print: true, reprint: true, void: true, refund: true,
  reports: true, shift: true, payout: true, viewAllSales: true,
});

// A cashier is a staff member with the sell permission; everything else is
// opt-in, so granting POS access never silently grants refunds.
const DEFAULT_PERMISSIONS = Object.freeze({
  owner: ALL_PERMISSIONS,
  manager: ALL_PERMISSIONS,
  scanner: Object.freeze({
    sell: true, print: true, reprint: true, void: false, refund: false,
    reports: false, shift: true, payout: false, viewAllSales: false,
  }),
});

// ─── Permissions ─────────────────────────────────────────────────────────────

function permissionsFor(access) {
  const role = String(access?.role || '');
  const base = { ...(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.scanner) };
  if (role === 'owner') return base;
  const stored = access?.staff?.permissions;
  if (!stored || typeof stored !== 'object') return base;
  for (const key of POS_PERMISSIONS) {
    if (typeof stored[key] === 'boolean') base[key] = stored[key];
  }
  return base;
}

function can(access, permission) {
  return Boolean(permissionsFor(access)[permission]);
}

/** Normalise a permission payload from the cashier screen into a stored object. */
function normalizePermissions(input) {
  const source = Array.isArray(input)
    ? Object.fromEntries(input.map((key) => [key, true]))
    : (input && typeof input === 'object' ? input : {});
  const value = {};
  for (const key of POS_PERMISSIONS) {
    if (typeof source[key] === 'boolean') value[key] = source[key];
  }
  return value;
}

// ─── Identifiers ─────────────────────────────────────────────────────────────

function newBatchRef() {
  return `BT-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function newTicketNo() {
  return `PT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

function newSaleRef() {
  return `POS-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function newReceiptNo() {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `RCP-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function newIdempotencyKey() {
  return `pos-${crypto.randomBytes(10).toString('hex')}`;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function clampRange(from, to, fallbackDays = 30) {
  const start = T.isDateISO(from) ? from : T.addDaysISO(T.isoToday(), -fallbackDays);
  let end = T.isDateISO(to) ? to : T.isoToday();
  if (end < start) end = start;
  const maxEnd = T.addDaysISO(start, 400);
  return { from: start, to: end > maxEnd ? maxEnd : end };
}

function pageOf(body = {}) {
  const page = Math.max(1, Math.min(10000, T.toInt(body.page, 1)));
  const pageSize = Math.max(1, Math.min(100, T.toInt(body.pageSize, 25)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/**
 * Insert one ticket, retrying on the unlikely ticket-number collision. The
 * unique index on ticket_no is the authority, so a duplicate can never exist.
 */
async function insertTicket(client, payload) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const ticketNo = payload.ticketNo || newTicketNo();
    const result = await client.query(
      `INSERT INTO bc_attraction_tickets (
         order_id, order_item_id, ticket_type_id, attraction_id, booking_ref, ticket_no, qr_token,
         holder_name, holder_email, ticket_type_name, visit_date, slot_label,
         admissions_total, admissions_used, status, batch_id, source, unit_price, currency
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,COALESCE($8, ''),COALESCE($9, ''),COALESCE($10, ''),$11,COALESCE($12, ''),
         $13,0,$14,$15,$16,$17,$18
       ) ON CONFLICT (ticket_no) DO NOTHING
       RETURNING *`,
      [
        payload.orderId ?? null, payload.orderItemId ?? null, payload.ticketTypeId, payload.attractionId,
        payload.bookingRef, ticketNo, T.signTicketToken(ticketNo),
        payload.holderName || '', payload.holderEmail || '', payload.ticketTypeName || '',
        payload.visitDate, payload.slotLabel || '', payload.admissions || 1,
        payload.status || 'available', payload.batchId || 0, payload.source || 'physical',
        T.toMoney(payload.unitPrice, 0), payload.currency || 'USD',
      ]
    );
    if (result.rows.length) return result.rows[0];
  }
  throw Object.assign(new Error('Could not allocate a unique ticket number. Please retry.'), { status: 500 });
}

const BATCH_AGG = `
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS generated,
           COUNT(*) FILTER (WHERE t.status = 'available')::int AS available,
           COUNT(*) FILTER (WHERE t.status IN ('valid', 'used'))::int AS sold,
           COUNT(*) FILTER (WHERE t.status = 'used' OR t.admissions_used > 0)::int AS used,
           COUNT(*) FILTER (WHERE t.status = 'void')::int AS voided,
           COUNT(*) FILTER (WHERE t.status = 'expired')::int AS expired,
           COUNT(*) FILTER (WHERE t.printed_count > 0)::int AS printed
      FROM bc_attraction_tickets t
     WHERE t.batch_id = b.id
  ) tk ON TRUE`;

function mapBatch(row, today = T.isoToday()) {
  if (!row) return null;
  const visitDate = T.isoDate(row.visit_date);
  const available = Number(row.available || 0);
  const past = visitDate && visitDate < today;
  return {
    id: row.id,
    batchRef: row.batch_ref,
    attractionId: row.attraction_id,
    name: row.name,
    ticketTypeId: row.ticket_type_id,
    ticketTypeName: row.ticket_type_name,
    slotId: Number(row.slot_id || 0),
    slotLabel: row.slot_label,
    visitDate,
    validTo: T.isoDate(row.valid_to) || null,
    quantity: Number(row.quantity || 0),
    generated: Number(row.generated ?? row.quantity ?? 0),
    printed: Number(row.printed || 0),
    sold: Number(row.sold || 0),
    used: Number(row.used || 0),
    available,
    unsold: available,
    voided: Number(row.voided || 0),
    expired: Number(row.expired || 0) + (row.status === 'open' ? 0 : 0),
    unitPrice: Number(row.unit_price || 0),
    currency: row.currency,
    admissions: Number(row.admissions || 1),
    template: row.template,
    status: row.status,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stale: Boolean(past && available > 0),
  };
}

async function listBatches(attractionId, body = {}) {
  const id = T.toInt(attractionId, 0);
  const params = [id];
  const clauses = ['b.attraction_id = $1'];

  const status = String(body.status || '').toLowerCase();
  if (BATCH_STATUSES.includes(status)) {
    params.push(status);
    clauses.push(`b.status = $${params.length}`);
  }
  const ticketTypeId = T.toInt(body.ticketTypeId, 0);
  if (ticketTypeId) {
    params.push(ticketTypeId);
    clauses.push(`b.ticket_type_id = $${params.length}`);
  }
  const search = T.text(body.search, 80);
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(b.batch_ref ILIKE $${params.length} OR b.name ILIKE $${params.length})`);
  }
  if (T.isDateISO(body.visitFrom)) {
    params.push(body.visitFrom);
    clauses.push(`b.visit_date >= $${params.length}::date`);
  }
  if (T.isDateISO(body.visitTo)) {
    params.push(body.visitTo);
    clauses.push(`b.visit_date <= $${params.length}::date`);
  }

  const { page, pageSize, offset } = pageOf(body);
  const where = clauses.join(' AND ');
  const rows = await query(
    `SELECT b.*, tk.generated, tk.available, tk.sold, tk.used, tk.voided, tk.expired, tk.printed
       FROM bc_ticket_batches b
       ${BATCH_AGG}
      WHERE ${where}
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM bc_ticket_batches b WHERE ${where}`, params);

  const today = T.isoToday();
  const totalsRes = await query(
    `SELECT
       COALESCE(SUM(tk.generated), 0)::int AS generated,
       COALESCE(SUM(tk.printed), 0)::int AS printed,
       COALESCE(SUM(tk.sold), 0)::int AS sold,
       COALESCE(SUM(tk.available), 0)::int AS available,
       COALESCE(SUM(tk.voided), 0)::int AS voided
     FROM bc_ticket_batches b
     ${BATCH_AGG}
     WHERE ${where}`,
    params
  );

  return {
    batches: rows.rows.map((row) => mapBatch(row, today)),
    totals: {
      generated: Number(totalsRes.rows[0]?.generated || 0),
      printed: Number(totalsRes.rows[0]?.printed || 0),
      sold: Number(totalsRes.rows[0]?.sold || 0),
      available: Number(totalsRes.rows[0]?.available || 0),
      voided: Number(totalsRes.rows[0]?.voided || 0),
    },
    pagination: {
      page, pageSize,
      total: Number(countRes.rows[0]?.total || 0),
      pages: Math.max(1, Math.ceil(Number(countRes.rows[0]?.total || 0) / pageSize)),
    },
  };
}

async function loadBatch(attractionId, batchId) {
  const res = await query(
    `SELECT b.*, tk.generated, tk.available, tk.sold, tk.used, tk.voided, tk.expired, tk.printed
       FROM bc_ticket_batches b
       ${BATCH_AGG}
      WHERE b.id = $1 AND b.attraction_id = $2`,
    [T.toInt(batchId, 0), T.toInt(attractionId, 0)]
  );
  const row = res.rows[0];
  if (!row) return null;

  const [ticketsRes, printsRes] = await Promise.all([
    query(
      `SELECT id, ticket_no, qr_token, status, printed_count, last_printed_at, admissions_total,
              admissions_used, holder_name, order_id, unit_price
         FROM bc_attraction_tickets
        WHERE batch_id = $1
        ORDER BY id ASC`,
      [row.id]
    ),
    query(
      `SELECT kind, layout, copies, actor_email, ticket_no, created_at
         FROM bc_ticket_prints
        WHERE batch_id = $1
        ORDER BY created_at DESC LIMIT 30`,
      [row.id]
    ),
  ]);

  return {
    batch: mapBatch(row),
    tickets: ticketsRes.rows.map((ticket) => ({
      id: ticket.id,
      ticketNo: ticket.ticket_no,
      qrToken: ticket.qr_token,
      status: ticket.status,
      printedCount: Number(ticket.printed_count || 0),
      lastPrintedAt: ticket.last_printed_at,
      admissions: Number(ticket.admissions_total || 1),
      admissionsUsed: Number(ticket.admissions_used || 0),
      holderName: ticket.holder_name,
      orderId: ticket.order_id,
      unitPrice: Number(ticket.unit_price || 0),
    })),
    prints: printsRes.rows.map((entry) => ({
      kind: entry.kind,
      layout: entry.layout,
      copies: Number(entry.copies || 1),
      actor: entry.actor_email,
      ticketNo: entry.ticket_no,
      createdAt: entry.created_at,
    })),
  };
}

// ─── Batch creation ──────────────────────────────────────────────────────────

async function createBatch({ attraction, actor, input = {} }) {
  const attractionId = T.toInt(attraction.id, 0);
  const ticketTypeId = T.toInt(input.ticketTypeId, 0);
  if (!ticketTypeId) return { ok: false, status: 400, error: 'Choose a ticket type for this batch' };

  const types = await T.listTicketTypes(attractionId);
  const type = types.find((entry) => Number(entry.id) === ticketTypeId);
  if (!type) return { ok: false, status: 404, error: 'Ticket type not found for this attraction' };
  if (type.status !== 'active') return { ok: false, status: 409, error: `${type.name} is not active, so it cannot be printed` };

  const visitDate = T.isDateISO(input.visitDate) ? input.visitDate : T.isoToday();
  const validTo = T.isDateISO(input.validTo) ? input.validTo : null;
  if (validTo && validTo < visitDate) {
    return { ok: false, status: 400, error: 'The expiry date cannot be before the visit date' };
  }

  const quantity = T.toInt(input.quantity, 0);
  if (quantity < 1) return { ok: false, status: 400, error: 'Generate at least one ticket' };
  if (quantity > MAX_BATCH_QUANTITY) {
    return { ok: false, status: 400, error: `A batch can hold at most ${MAX_BATCH_QUANTITY} tickets` };
  }

  const slotId = T.toInt(input.slotId, 0);
  let slotLabel = '';
  if (slotId) {
    const slot = (type.slots || []).find((entry) => Number(entry.id) === slotId && entry.status === 'active');
    if (!slot) return { ok: false, status: 400, error: 'That entry time is not available for this ticket type' };
    slotLabel = slot.label;
  }

  const calendarRows = await T.getCalendar(attractionId, visitDate, visitDate);
  const calendarRow = T.calendarFor(calendarRows, type.id, visitDate);
  if (T.isClosedOn(calendarRow)) {
    return { ok: false, status: 409, error: `${type.name} is closed on ${visitDate}` };
  }
  const unitPrice = T.resolvePrice(type, calendarRow);
  const name = T.text(input.name, 120) || `${type.name} · ${visitDate}`;
  const remaining = await T.remainingFor(type.id, visitDate, slotId);

  const created = await withTransaction(async (client) => {
    const batch = await client.query(
      `INSERT INTO bc_ticket_batches (
         batch_ref, attraction_id, owner_email, name, ticket_type_id, ticket_type_name,
         slot_id, slot_label, visit_date, valid_to, quantity, unit_price, currency, admissions,
         template, status, notes, created_by
       ) VALUES ($1,$2,COALESCE($3, ''),$4,$5,COALESCE($6, ''),$7,COALESCE($8, ''),$9,$10,$11,$12,$13,$14,$15,'open',COALESCE($16, ''),COALESCE($17, ''))
       RETURNING *`,
      [
        newBatchRef(), attractionId, String(attraction.owner_email || '').toLowerCase(), name,
        type.id, type.name, slotId, slotLabel, visitDate, validTo, quantity, unitPrice,
        type.currency || 'USD', type.admissions || 1,
        PRINT_LAYOUTS.includes(input.template) ? input.template : 'standard',
        T.text(input.notes, 500), String(actor || '').toLowerCase(),
      ]
    );
    const row = batch.rows[0];

    for (let index = 0; index < quantity; index += 1) {
      await insertTicket(client, {
        ticketTypeId: type.id,
        attractionId,
        bookingRef: row.batch_ref,
        ticketTypeName: type.name,
        visitDate,
        slotLabel,
        admissions: Number(type.admissions || 1),
        status: 'available',
        batchId: row.id,
        source: 'physical',
        unitPrice,
        currency: type.currency || 'USD',
      });
    }
    return row;
  });

  await T.writeTicketAudit({
    attractionId, actor, action: 'batch.created', entityType: 'batch', entityId: created.id,
    details: { batchRef: created.batch_ref, quantity, ticketType: type.name, visitDate, unitPrice },
  });

  return {
    ok: true,
    batch: mapBatch({ ...created, generated: quantity, available: quantity, printed: 0, sold: 0, used: 0, voided: 0, expired: 0 }),
    warning: remaining !== null && quantity > remaining
      ? `This batch is larger than the ${remaining} ticket(s) currently available for ${visitDate}. Printing is allowed, but only ${remaining} can be sold.`
      : '',
  };
}

// ─── Printing ────────────────────────────────────────────────────────────────

async function recordPrint({ attraction, actor, input = {} }) {
  const attractionId = T.toInt(attraction.id, 0);
  const batchId = T.toInt(input.batchId, 0);
  const layout = PRINT_LAYOUTS.includes(input.layout) ? input.layout : 'a4_4';
  const kind = input.kind === 'reprint' ? 'reprint' : 'print';
  const ticketNos = Array.isArray(input.ticketNumbers)
    ? input.ticketNumbers.map((value) => T.parseTicketInput(value).ticketNo).filter(Boolean)
    : [];

  const params = [attractionId];
  let filter = '';
  if (ticketNos.length) {
    params.push(ticketNos);
    filter = ` AND UPPER(ticket_no) = ANY($${params.length}::text[])`;
  } else if (batchId) {
    params.push(batchId);
    filter = ` AND batch_id = $${params.length} AND status IN ('available', 'valid')`;
  } else {
    return { ok: false, status: 400, error: 'Choose a batch or at least one ticket to print' };
  }

  const ticketsRes = await query(
    `SELECT id, ticket_no, batch_id, printed_count FROM bc_attraction_tickets
      WHERE attraction_id = $1${filter}
      ORDER BY id ASC LIMIT 500`,
    params
  );
  if (!ticketsRes.rows.length) return { ok: false, status: 404, error: 'No printable tickets found' };

  const copies = Math.max(1, Math.min(10, T.toInt(input.copies, 1)));
  const alreadyPrinted = ticketsRes.rows.some((ticket) => Number(ticket.printed_count) > 0);
  const effectiveKind = kind === 'reprint' || (kind === 'print' && alreadyPrinted) ? 'reprint' : 'print';

  await withTransaction(async (client) => {
    for (const ticket of ticketsRes.rows) {
      await client.query(
        `INSERT INTO bc_ticket_prints (attraction_id, batch_id, ticket_id, ticket_no, kind, layout, copies, actor_email)
         VALUES ($1,$2,$3,COALESCE($4, ''),$5,$6,$7,COALESCE($8, ''))`,
        [attractionId, Number(ticket.batch_id || 0), ticket.id, ticket.ticket_no, effectiveKind, layout, copies, String(actor || '').toLowerCase()]
      );
      await client.query(
        `UPDATE bc_attraction_tickets
            SET printed_count = printed_count + 1, last_printed_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [ticket.id]
      );
    }
    if (batchId) {
      await client.query(
        `UPDATE bc_ticket_batches b
            SET printed_count = (SELECT COUNT(*) FROM bc_attraction_tickets t WHERE t.batch_id = b.id AND t.printed_count > 0),
                updated_at = NOW()
          WHERE b.id = $1 AND b.attraction_id = $2`,
        [batchId, attractionId]
      );
    }
  });

  // Printing never changes stock, payment or admission state — only the audit trail.
  await T.writeTicketAudit({
    attractionId, actor, action: effectiveKind === 'reprint' ? 'batch.reprinted' : 'batch.printed',
    entityType: 'batch', entityId: batchId || ticketsRes.rows[0].batch_id,
    details: { tickets: ticketsRes.rows.length, layout, copies, kind: effectiveKind },
  });

  return {
    ok: true,
    kind: effectiveKind,
    printed: ticketsRes.rows.length,
    tickets: ticketsRes.rows.map((ticket) => ticket.ticket_no),
  };
}

// ─── Void / close / archive ──────────────────────────────────────────────────

async function voidTickets({ attraction, actor, input = {} }) {
  const attractionId = T.toInt(attraction.id, 0);
  const reason = T.text(input.reason, 300);
  if (reason.length < 3) return { ok: false, status: 400, error: 'Record a reason for voiding these tickets' };

  const batchId = T.toInt(input.batchId, 0);
  const ticketNos = Array.isArray(input.ticketNumbers)
    ? input.ticketNumbers.map((value) => T.parseTicketInput(value).ticketNo).filter(Boolean)
    : [];
  if (!batchId && !ticketNos.length) {
    return { ok: false, status: 400, error: 'Choose a batch or the tickets to void' };
  }

  const params = [attractionId];
  let filter = '';
  if (ticketNos.length) {
    params.push(ticketNos);
    filter = ` AND UPPER(ticket_no) = ANY($${params.length}::text[])`;
  } else {
    params.push(batchId);
    filter = ` AND batch_id = $${params.length}`;
  }

  const updated = await query(
    `UPDATE bc_attraction_tickets
        SET status = 'void', updated_at = NOW()
      WHERE attraction_id = $1 AND status = 'available'${filter}
      RETURNING ticket_no`,
    params
  );

  await T.writeTicketAudit({
    attractionId, actor, action: 'ticket.voided', entityType: 'batch',
    entityId: batchId || ticketNos.slice(0, 3).join(','),
    details: { voided: updated.rows.length, reason, requested: ticketNos.length || batchId },
  });

  return { ok: true, voided: updated.rows.length, reason };
}

async function setBatchStatus({ attraction, actor, input = {} }) {
  const attractionId = T.toInt(attraction.id, 0);
  const batchId = T.toInt(input.batchId || input.id, 0);
  const status = String(input.status || '').toLowerCase();
  if (!['open', 'closed', 'archived'].includes(status)) {
    return { ok: false, status: 400, error: 'Choose a valid batch status' };
  }

  const batch = await loadBatch(attractionId, batchId);
  if (!batch) return { ok: false, status: 404, error: 'Batch not found' };

  await query(
    `UPDATE bc_ticket_batches SET status = $3, updated_at = NOW() WHERE id = $1 AND attraction_id = $2`,
    [batchId, attractionId, status]
  );
  await T.writeTicketAudit({
    attractionId, actor, action: `batch.${status}`, entityType: 'batch', entityId: batchId,
    details: { batchRef: batch.batch.batchRef },
  });
  return { ok: true, status };
}

async function deleteBatch({ attraction, actor, input = {} }) {
  const attractionId = T.toInt(attraction.id, 0);
  const batchId = T.toInt(input.batchId || input.id, 0);
  const batch = await loadBatch(attractionId, batchId);
  if (!batch) return { ok: false, status: 404, error: 'Batch not found' };
  if (batch.batch.sold > 0 || batch.batch.used > 0) {
    return {
      ok: false, status: 409,
      error: 'Tickets from this batch were sold or used. Archive the batch instead of deleting it.',
    };
  }

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM bc_attraction_tickets WHERE batch_id = $1 AND attraction_id = $2`, [batchId, attractionId]);
    await client.query(`DELETE FROM bc_ticket_batches WHERE id = $1 AND attraction_id = $2`, [batchId, attractionId]);
  });
  await T.writeTicketAudit({
    attractionId, actor, action: 'batch.deleted', entityType: 'batch', entityId: batchId,
    details: { batchRef: batch.batch.batchRef, removed: batch.batch.generated },
  });
  return { ok: true };
}

// ─── Point of sale ───────────────────────────────────────────────────────────

async function findSaleByIdempotencyKey(attractionId, key) {
  const res = await query(
    `SELECT * FROM bc_ticket_orders WHERE attraction_id = $1 AND idempotency_key = $2 LIMIT 1`,
    [attractionId, key]
  );
  return res.rows[0] || null;
}

/**
 * Claim printed stock from a batch for a sale line. Returns the claimed rows;
 * throws SOLD_OUT when the batch cannot cover the requested quantity.
 */
async function claimBatchTickets(client, { batchId, ticketTypeId, visitDate, quantity, order, item }) {
  const claimed = await client.query(
    `WITH picked AS (
       SELECT id FROM bc_attraction_tickets
        WHERE batch_id = $1 AND ticket_type_id = $2 AND status = 'available'
          AND visit_date = $3::date
        ORDER BY id ASC
        LIMIT $4
        FOR UPDATE SKIP LOCKED
     )
     UPDATE bc_attraction_tickets t
        SET order_id = $5, order_item_id = $6, booking_ref = $7, status = 'valid',
            holder_name = COALESCE($8, ''), holder_email = COALESCE($9, ''),
            slot_label = COALESCE($10, ''), updated_at = NOW()
       FROM picked
      WHERE t.id = picked.id
     RETURNING t.*`,
    [
      batchId, ticketTypeId, visitDate, quantity, order.id, item.id, order.booking_ref,
      order.customer_name, order.customer_email, order.slot_label || '',
    ]
  );
  if (claimed.rows.length < quantity) {
    throw Object.assign(
      new Error(`This batch only has ${claimed.rows.length} unsold ticket(s) left for that date`),
      { code: 'SOLD_OUT' }
    );
  }
  return claimed.rows;
}

function normalizeSaleInput(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  const cleaned = [];
  for (const item of items) {
    const ticketTypeId = T.toInt(item.ticketTypeId, 0);
    const quantity = T.toInt(item.quantity, 0);
    if (!ticketTypeId || quantity <= 0) continue;
    cleaned.push({ ticketTypeId, quantity });
  }
  return cleaned;
}

async function posSale({ access, actor, input = {} }) {
  const attraction = access.attraction;
  const attractionId = T.toInt(attraction.id, 0);
  const settings = await T.getSettings(attractionId);
  if (settings.pos_enabled === false) {
    return { ok: false, status: 409, error: 'Point of sale is disabled for this attraction' };
  }

  const email = String(actor || '').toLowerCase();
  const key = T.text(input.idempotencyKey, 80) || newIdempotencyKey();

  const existing = await findSaleByIdempotencyKey(attractionId, key);
  if (existing) return { ok: true, order: existing, duplicate: true, receipt: await loadReceipt(attractionId, existing.id) };

  const items = normalizeSaleInput(input);
  if (!items.length) return { ok: false, status: 400, error: 'Select at least one ticket type' };

  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  if (total > MAX_POS_TICKETS) {
    return { ok: false, status: 400, error: `A counter sale can hold at most ${MAX_POS_TICKETS} tickets` };
  }

  const visitDate = T.isDateISO(input.visitDate) ? input.visitDate : T.isoToday();
  const slotId = T.toInt(input.slotId, 0);
  const promoCode = T.text(input.promoCode, 40);

  const quote = await T.computeQuote({ attractionId, visitDate, slotId, items, promoCode });
  if (!quote.ok) return quote;
  const q = quote.quote;

  const paymentMethod = PAYMENT_METHODS.includes(input.paymentMethod) ? input.paymentMethod : 'cash';
  // A comp is a zero-value issue: the list price stays on the ticket stub and
  // the line items, but nothing is taken and nothing may be booked as revenue.
  if (paymentMethod === 'complimentary') {
    q.taxAmount = 0;
    q.serviceFee = 0;
    q.total = 0;
  }
  const paymentRefInput = T.text(input.paymentRef, 120);
  let paymentRef = '';
  let amountReceived = 0;
  let changeGiven = 0;
  let paidNow = true;
  let paymentVerified = true;

  if (paymentMethod === 'cash') {
    amountReceived = T.toMoney(input.amountReceived, q.total);
    if (amountReceived < q.total) {
      return {
        ok: false, status: 400,
        error: `Cash received (${q.currency} ${amountReceived.toFixed(2)}) is less than the total (${q.currency} ${q.total.toFixed(2)})`,
      };
    }
    changeGiven = T.round2(amountReceived - q.total);
  } else if (paymentMethod === 'complimentary') {
    paymentRef = `manual:${email || 'counter'}`;
  } else if (paymentMethod === 'mobile_money' || paymentMethod === 'card') {
    const verified = input.verified === true || input.paymentVerified === true;
    if (verified && !paymentRefInput) {
      return { ok: false, status: 400, error: 'Enter the payment reference from the card or mobile money confirmation' };
    }
    if (verified) {
      paymentRef = paymentRefInput;
      amountReceived = q.total;
    } else {
      paidNow = false;
      paymentVerified = false;
    }
  } else {
    paymentRef = paymentRefInput || `other:${newIdempotencyKey()}`;
    amountReceived = T.toMoney(input.amountReceived, q.total);
    changeGiven = T.round2(Math.max(0, amountReceived - q.total));
  }

  const batchId = T.toInt(input.batchId, 0);
  const shiftId = T.toInt(input.shiftId, 0) || null;
  const customerName = T.text(input.customerName, 120) || 'Walk-in guest';
  const customerEmail = String(input.customerEmail || '').trim().toLowerCase();
  if (customerEmail && !T.validEmail(customerEmail)) {
    return { ok: false, status: 400, error: 'Enter a valid visitor email or leave it blank' };
  }

  const receiptNo = newReceiptNo();
  const types = await T.listTicketTypes(attractionId);
  const typeMap = new Map(types.map((type) => [Number(type.id), type]));
  const calendarRows = await T.getCalendar(attractionId, visitDate, visitDate);

  let outcome;
  try {
    outcome = await withTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO bc_ticket_orders (
           booking_ref, attraction_id, attraction_name, owner_email, customer_name, customer_email,
           customer_phone, visit_date, slot_id, slot_label, subtotal, discount, promo_code,
           tax_amount, service_fee, total, currency, status, payment_status, payment_method,
           payment_ref, admissions_total, quantity_total, notes, channel, batch_id, cashier_email,
           shift_id, amount_received, change_given, receipt_no, idempotency_key, payment_verified,
           expires_at
         ) VALUES (
           $1,$2,COALESCE($3, ''),COALESCE($4, ''),$5,COALESCE($6, ''),COALESCE($7, ''),$8,$9,COALESCE($10, ''),$11,$12,COALESCE($13, ''),
           $14,$15,$16,$17,$18,$19,$20,COALESCE($21, ''),$22,$23,COALESCE($24, ''),'pos',$25,COALESCE($26, ''),
           $27,$28,$29,$30,$31,$32, CASE WHEN $18 = 'pending_payment' THEN NOW() + interval '30 minutes' ELSE NULL END
         )
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          newSaleRef(), attractionId, attraction.name || '', String(attraction.owner_email || '').toLowerCase(),
          customerName, customerEmail, T.text(input.customerPhone, 40),
          visitDate, q.slotId, q.slotLabel || '',
          q.subtotal, q.discount, q.promoCode || '', q.taxAmount, q.serviceFee, q.total, q.currency,
          'pending_payment', 'unpaid',
          paymentMethod, paymentRef, q.admissionsTotal, q.quantityTotal,
          T.text(input.notes, 500), batchId, email, shiftId,
          amountReceived, changeGiven, receiptNo, key, paymentVerified,
        ]
      );
      if (!created.rows.length) {
        throw Object.assign(new Error('This sale was already recorded'), { code: 'DUPLICATE_SALE' });
      }
      const order = created.rows[0];

      const ticketRows = [];
      for (const line of q.lines) {
        const itemRes = await client.query(
          `INSERT INTO bc_ticket_order_items (
             order_id, ticket_type_id, ticket_type_name, slot_id, visit_date,
             unit_price, quantity, admissions_per_unit, line_total
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING *`,
          [
            order.id, line.ticketTypeId, line.name, line.slotId, visitDate,
            line.unitPrice, line.quantity, line.admissions, line.lineTotal,
          ]
        );
        const item = itemRes.rows[0];

        let remaining = line.quantity;
        if (batchId) {
          const batchRes = await client.query(
            `SELECT id, ticket_type_id, visit_date FROM bc_ticket_batches WHERE id = $1 AND attraction_id = $2`,
            [batchId, attractionId]
          );
          const batch = batchRes.rows[0];
          if (batch && Number(batch.ticket_type_id) === Number(line.ticketTypeId)
            && T.isoDate(batch.visit_date) === visitDate) {
            const claimed = await claimBatchTickets(client, {
              batchId, ticketTypeId: line.ticketTypeId, visitDate,
              quantity: remaining, order, item,
            });
            ticketRows.push(...claimed);
            remaining = 0;
          }
        }

        for (let index = 0; index < remaining; index += 1) {
          const ticket = await insertTicket(client, {
            orderId: order.id,
            orderItemId: item.id,
            ticketTypeId: line.ticketTypeId,
            attractionId,
            bookingRef: order.booking_ref,
            holderName: order.customer_name,
            holderEmail: order.customer_email,
            ticketTypeName: line.name,
            visitDate,
            slotLabel: order.slot_label || '',
            admissions: line.admissions,
            status: 'valid',
            batchId,
            source: 'physical',
            unitPrice: line.unitPrice,
            currency: q.currency,
          });
          ticketRows.push(ticket);
        }
      }

      await T.reserveInventory(client, {
        attractionId, visitDate, lines: q.lines, typeMap, calendarRows,
      });

      return { order, tickets: ticketRows };
    });
  } catch (error) {
    if (error.code === 'SOLD_OUT') return { ok: false, status: 409, error: error.message };
    if (error.code === 'DUPLICATE_SALE') {
      const duplicate = await findSaleByIdempotencyKey(attractionId, key);
      if (duplicate) {
        return { ok: true, order: duplicate, duplicate: true, receipt: await loadReceipt(attractionId, duplicate.id) };
      }
    }
    throw error;
  }

  let order = outcome.order;
  let tickets = outcome.tickets;

  if (paidNow) {
    const finalized = await T.finalizeOrder(order.id, {
      paymentRef: paymentRef || (paymentMethod === 'cash' ? `cash:${order.booking_ref}` : ''),
      paymentMethod,
      actor: email,
    });
    order = finalized.order;
    tickets = finalized.tickets;

    if (shiftId) {
      await query(`UPDATE bc_ticket_orders SET shift_id = COALESCE(shift_id, $2) WHERE id = $1`, [order.id, shiftId]);
    }

    await T.writeTicketAudit({
      attractionId, actor: email, action: 'pos.sale', entityType: 'order', entityId: order.id,
      details: {
        saleRef: order.booking_ref, ticketCount: tickets.length, total: Number(order.total),
        currency: order.currency, paymentMethod, receiptNo, batchId,
      },
    });

    notifyCustomerReceipt(order, tickets, { receiptNo });
  } else {
    await T.writeTicketAudit({
      attractionId, actor: email, action: 'pos.sale-pending', entityType: 'order', entityId: order.id,
      details: { saleRef: order.booking_ref, paymentMethod, total: Number(order.total) },
    });
  }

  return {
    ok: true,
    order,
    tickets: tickets.map((ticket) => T.publicTicket(ticket)),
    duplicate: false,
    pendingPayment: !paidNow,
    receipt: await loadReceipt(attractionId, order.id),
  };
}

/** Confirm a card / mobile money sale after the payment was verified. */
async function confirmPosPayment({ attraction, actor, input = {} }) {
  const attractionId = T.toInt(attraction.id, 0);
  const orderId = T.toInt(input.id || input.orderId, 0);
  const res = await query(`SELECT * FROM bc_ticket_orders WHERE id = $1 AND attraction_id = $2`, [orderId, attractionId]);
  const order = res.rows[0];
  if (!order) return { ok: false, status: 404, error: 'Sale not found' };
  if (order.payment_status === 'paid' && order.status === 'confirmed') {
    return { ok: true, alreadyConfirmed: true, receipt: await loadReceipt(attractionId, orderId) };
  }
  if (['cancelled', 'refunded', 'expired'].includes(order.status)) {
    return { ok: false, status: 409, error: `This sale is ${order.status}` };
  }

  const paymentRef = T.text(input.paymentRef, 120);
  if (order.payment_method !== 'complimentary' && !paymentRef && !order.payment_ref) {
    return { ok: false, status: 400, error: 'Enter the verified payment reference first' };
  }

  const finalized = await T.finalizeOrder(orderId, {
    paymentRef: paymentRef || order.payment_ref,
    paymentMethod: order.payment_method,
    actor,
  });
  await query(`UPDATE bc_ticket_orders SET payment_verified = true WHERE id = $1`, [orderId]);

  await T.writeTicketAudit({
    attractionId, actor, action: 'pos.payment-confirmed', entityType: 'order', entityId: orderId,
    details: { saleRef: order.booking_ref, paymentRef: paymentRef || order.payment_ref },
  });
  notifyCustomerReceipt(finalized.order, finalized.tickets, { receiptNo: order.receipt_no });

  return {
    ok: true,
    order: finalized.order,
    tickets: finalized.tickets.map((ticket) => T.publicTicket(ticket)),
    receipt: await loadReceipt(attractionId, orderId),
  };
}

// ─── Receipts ────────────────────────────────────────────────────────────────

function notifyCustomerReceipt(order, tickets, { receiptNo }) {
  if (!order?.customer_email) return;
  Promise.resolve()
    .then(() => require('./notification-hub').dispatch({
      recipientId: order.customer_email,
      recipientEmail: order.customer_email,
      recipientRole: 'traveler',
      type: 'TICKET_ISSUED',
      title: 'Your ticket receipt',
      message: `${tickets.length} ticket(s) for ${order.attraction_name} on ${T.isoDate(order.visit_date)}. Receipt ${receiptNo}.`,
      actionUrl: `/attraction-tickets/confirmation?ref=${encodeURIComponent(order.booking_ref)}`,
      metadata: {
        bookingRef: order.booking_ref,
        attractionName: order.attraction_name,
        visitDate: T.isoDate(order.visit_date),
        totalAmount: Number(order.total || 0).toFixed(2),
        currency: order.currency,
        receiptNo,
        tickets: tickets.slice(0, 12).map((ticket) => ({
          ticketNo: ticket.ticket_no, type: ticket.ticket_type_name, admissions: ticket.admissions_total,
        })),
        title: 'Purchase receipt',
        message: `Your tickets for ${order.attraction_name} are ready.`,
        actionUrl: `/attraction-tickets/confirmation?ref=${encodeURIComponent(order.booking_ref)}`,
      },
    }))
    .catch((error) => console.warn('[physical-ticketing] receipt email failed:', error.message));
}

async function loadReceipt(attractionId, orderId) {
  const id = T.toInt(attractionId, 0);
  const res = await query(
    `SELECT o.*, p.name AS attraction_display_name, p.city, p.country,
            s.name AS cashier_name
       FROM bc_ticket_orders o
       LEFT JOIN bc_attraction_profiles p ON p.id = o.attraction_id
       LEFT JOIN bc_ticket_staff s
              ON s.attraction_id = o.attraction_id AND LOWER(s.email) = LOWER(o.cashier_email)
      WHERE o.id = $1 AND o.attraction_id = $2`,
    [T.toInt(orderId, 0), id]
  );
  const order = res.rows[0];
  if (!order) return null;

  const [itemsRes, ticketsRes, settings] = await Promise.all([
    query(`SELECT * FROM bc_ticket_order_items WHERE order_id = $1 ORDER BY id ASC`, [order.id]),
    query(`SELECT * FROM bc_attraction_tickets WHERE order_id = $1 ORDER BY id ASC`, [order.id]),
    T.getSettings(id),
  ]);

  return {
    receiptNo: order.receipt_no,
    saleRef: order.booking_ref,
    attraction: {
      id: order.attraction_id,
      name: order.attraction_display_name || order.attraction_name,
      city: order.city || '',
      country: order.country || '',
      logoUrl: settings.ticket_logo_url || '',
      contact: settings.ticket_contact || '',
      header: settings.receipt_header || '',
      footer: settings.receipt_footer || '',
      terms: settings.ticket_terms || settings.terms || '',
    },
    cashier: { email: order.cashier_email, name: order.cashier_name || '' },
    channel: order.channel,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    visitDate: T.isoDate(order.visit_date),
    slotLabel: order.slot_label,
    currency: order.currency,
    subtotal: Number(order.subtotal || 0),
    discount: Number(order.discount || 0),
    promoCode: order.promo_code,
    taxAmount: Number(order.tax_amount || 0),
    serviceFee: Number(order.service_fee || 0),
    total: Number(order.total || 0),
    amountReceived: Number(order.amount_received || 0),
    changeGiven: Number(order.change_given || 0),
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    paymentVerified: order.payment_verified !== false,
    status: order.status,
    createdAt: order.created_at,
    items: itemsRes.rows.map((item) => ({
      ticketTypeId: item.ticket_type_id,
      name: item.ticket_type_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
      admissionsPerUnit: Number(item.admissions_per_unit),
    })),
    tickets: ticketsRes.rows.map((ticket) => ({
      ticketNo: ticket.ticket_no,
      qrToken: ticket.qr_token,
      type: ticket.ticket_type_name,
      admissions: Number(ticket.admissions_total),
      visitDate: T.isoDate(ticket.visit_date),
      slotLabel: ticket.slot_label,
      status: ticket.status,
    })),
  };
}

// ─── Sales history ───────────────────────────────────────────────────────────

async function listPosSales(attractionId, body = {}) {
  const id = T.toInt(attractionId, 0);
  const params = [id];
  const clauses = [`o.attraction_id = $1`, `o.channel IN ('pos', 'counter')`];

  const search = T.text(body.search, 120);
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(o.booking_ref ILIKE $${params.length} OR o.receipt_no ILIKE $${params.length}
      OR o.customer_name ILIKE $${params.length} OR o.cashier_email ILIKE $${params.length}
      OR EXISTS (SELECT 1 FROM bc_attraction_tickets t WHERE t.order_id = o.id AND t.ticket_no ILIKE $${params.length}))`);
  }

  const cashier = String(body.cashier || '').trim().toLowerCase();
  if (cashier) {
    params.push(cashier);
    clauses.push(`LOWER(o.cashier_email) = $${params.length}`);
  }
  const method = String(body.paymentMethod || '').toLowerCase();
  if (PAYMENT_METHODS.includes(method)) {
    params.push(method);
    clauses.push(`o.payment_method = $${params.length}`);
  }
  const batchId = T.toInt(body.batchId, 0);
  if (batchId) {
    params.push(batchId);
    clauses.push(`o.batch_id = $${params.length}`);
  }
  const ticketTypeId = T.toInt(body.ticketTypeId, 0);
  if (ticketTypeId) {
    params.push(ticketTypeId);
    clauses.push(`EXISTS (SELECT 1 FROM bc_ticket_order_items i WHERE i.order_id = o.id AND i.ticket_type_id = $${params.length})`);
  }
  const status = String(body.status || '').toLowerCase();
  if (['confirmed', 'pending_payment', 'cancelled', 'refunded', 'partially_refunded', 'expired'].includes(status)) {
    params.push(status);
    clauses.push(`o.status = $${params.length}`);
  }

  const range = clampRange(body.from, body.to, 30);
  params.push(range.from, range.to);
  clauses.push(`o.created_at >= $${params.length - 1}::date AND o.created_at < ($${params.length}::date + INTERVAL '1 day')`);

  const { page, pageSize, offset } = pageOf(body);
  const where = clauses.join(' AND ');

  const rows = await query(
    `SELECT o.*,
            (SELECT STRING_AGG(t.ticket_no, ', ' ORDER BY t.id) FROM bc_attraction_tickets t WHERE t.order_id = o.id) AS ticket_nos,
            (SELECT COUNT(*) FROM bc_attraction_tickets t WHERE t.order_id = o.id)::int AS tickets_total,
            (SELECT COALESCE(SUM(t.admissions_used), 0) FROM bc_attraction_tickets t WHERE t.order_id = o.id)::int AS admissions_used,
            (SELECT STRING_AGG(DISTINCT i.ticket_type_name, ', ') FROM bc_ticket_order_items i WHERE i.order_id = o.id) AS ticket_types
       FROM bc_ticket_orders o
      WHERE ${where}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM bc_ticket_orders o WHERE ${where}`, params);
  const totalsRes = await query(
    `SELECT
       COALESCE(SUM(o.total) FILTER (WHERE o.payment_status IN ('paid', 'partially_refunded')), 0)::numeric AS gross,
       COALESCE(SUM(o.refund_amount), 0)::numeric AS refunds,
       COALESCE(SUM(o.quantity_total) FILTER (WHERE o.payment_status IN ('paid', 'partially_refunded')), 0)::int AS tickets
     FROM bc_ticket_orders o WHERE ${where}`,
    params
  );

  return {
    sales: rows.rows.map((row) => ({
      id: row.id,
      saleRef: row.booking_ref,
      receiptNo: row.receipt_no,
      attractionId: row.attraction_id,
      attractionName: row.attraction_name,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      cashier: row.cashier_email,
      shiftId: row.shift_id,
      batchId: Number(row.batch_id || 0),
      visitDate: T.isoDate(row.visit_date),
      slotLabel: row.slot_label,
      ticketTypes: row.ticket_types || '',
      ticketNumbers: row.ticket_nos || '',
      quantity: Number(row.quantity_total || 0),
      ticketsTotal: Number(row.tickets_total || 0),
      admissionsUsed: Number(row.admissions_used || 0),
      subtotal: Number(row.subtotal || 0),
      discount: Number(row.discount || 0),
      taxAmount: Number(row.tax_amount || 0),
      serviceFee: Number(row.service_fee || 0),
      total: Number(row.total || 0),
      refundAmount: Number(row.refund_amount || 0),
      currency: row.currency,
      status: row.status,
      paymentStatus: row.payment_status,
      paymentMethod: row.payment_method,
      amountReceived: Number(row.amount_received || 0),
      changeGiven: Number(row.change_given || 0),
      createdAt: row.created_at,
    })),
    totals: {
      gross: Number(totalsRes.rows[0]?.gross || 0),
      refunds: Number(totalsRes.rows[0]?.refunds || 0),
      tickets: Number(totalsRes.rows[0]?.tickets || 0),
    },
    pagination: {
      page, pageSize,
      total: Number(countRes.rows[0]?.total || 0),
      pages: Math.max(1, Math.ceil(Number(countRes.rows[0]?.total || 0) / pageSize)),
    },
    range,
  };
}

// ─── Cash shifts ─────────────────────────────────────────────────────────────

function mapShift(row) {
  if (!row) return null;
  return {
    id: row.id,
    attractionId: row.attraction_id,
    cashierEmail: row.cashier_email,
    cashierName: row.cashier_name,
    currency: row.currency,
    openingCash: Number(row.opening_cash || 0),
    countedCash: Number(row.counted_cash || 0),
    expectedCash: Number(row.expected_cash || 0),
    cashSales: Number(row.cash_sales || 0),
    mobileSales: Number(row.mobile_sales || 0),
    cardSales: Number(row.card_sales || 0),
    otherSales: Number(row.other_sales || 0),
    refunds: Number(row.refunds || 0),
    payouts: Number(row.payouts || 0),
    difference: Number(row.difference || 0),
    status: row.status,
    openNote: row.open_note,
    closeNote: row.close_note,
    closedBy: row.closed_by,
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

async function shiftTotals(attractionId, shiftId) {
  const [salesRes, payoutRes, ticketsRes] = await Promise.all([
    query(
      // Cash that physically entered the drawer is gross intake: a sale that was
      // later refunded still went in, and its refund is subtracted separately.
      // Counting it out on both sides would understate the expected balance.
      `SELECT
         COALESCE(SUM(o.total) FILTER (WHERE o.payment_method = 'cash' AND o.payment_status IN ('paid', 'partially_refunded', 'refunded')), 0)::numeric AS cash_sales,
         COALESCE(SUM(o.total) FILTER (WHERE o.payment_method = 'mobile_money' AND o.payment_status IN ('paid', 'partially_refunded', 'refunded')), 0)::numeric AS mobile_sales,
         COALESCE(SUM(o.total) FILTER (WHERE o.payment_method = 'card' AND o.payment_status IN ('paid', 'partially_refunded', 'refunded')), 0)::numeric AS card_sales,
         COALESCE(SUM(o.total) FILTER (WHERE o.payment_method IN ('other', 'complimentary') AND o.payment_status IN ('paid', 'partially_refunded', 'refunded')), 0)::numeric AS other_sales,
         COALESCE(SUM(o.refund_amount), 0)::numeric AS refunds,
         COALESCE(SUM(o.refund_amount) FILTER (WHERE o.payment_method = 'cash'), 0)::numeric AS cash_refunds,
         COALESCE(SUM(o.quantity_total) FILTER (WHERE o.payment_status IN ('paid', 'partially_refunded')), 0)::int AS tickets,
         COUNT(*) FILTER (WHERE o.status = 'pending_payment')::int AS pending
       FROM bc_ticket_orders o
      WHERE o.attraction_id = $1 AND o.shift_id = $2 AND o.channel IN ('pos', 'counter')`,
      [attractionId, shiftId]
    ),
    query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE kind = 'payout'), 0)::numeric AS payouts,
         COALESCE(SUM(amount) FILTER (WHERE kind = 'float'), 0)::numeric AS floats,
         COALESCE(SUM(amount) FILTER (WHERE kind = 'adjustment'), 0)::numeric AS adjustments
       FROM bc_cash_movements WHERE shift_id = $1`,
      [shiftId]
    ),
    query(
      `SELECT COUNT(*)::int AS tickets, COALESCE(SUM(t.admissions_used), 0)::int AS admissions
         FROM bc_attraction_tickets t
        WHERE t.order_id IN (SELECT id FROM bc_ticket_orders WHERE shift_id = $1 AND attraction_id = $2)`,
      [shiftId, attractionId]
    ),
  ]);

  const sales = salesRes.rows[0] || {};
  const moves = payoutRes.rows[0] || {};
  return {
    cashSales: Number(sales.cash_sales || 0),
    mobileSales: Number(sales.mobile_sales || 0),
    cardSales: Number(sales.card_sales || 0),
    otherSales: Number(sales.other_sales || 0),
    refunds: Number(sales.refunds || 0),
    cashRefunds: Number(sales.cash_refunds || 0),
    payouts: Number(moves.payouts || 0),
    floats: Number(moves.floats || 0),
    adjustments: Number(moves.adjustments || 0),
    tickets: Number(sales.tickets || 0),
    pendingSales: Number(sales.pending || 0),
    admissionsUsed: Number(ticketsRes.rows[0]?.admissions || 0),
  };
}

async function openShift({ access, actor, input = {} }) {
  const attractionId = T.toInt(access.attraction.id, 0);
  const email = String(actor || '').toLowerCase();
  const cashierName = T.text(input.cashierName, 120) || T.text(access.staff?.name, 120);
  const settings = await T.getSettings(attractionId);
  const openingCash = Math.max(0, T.toMoney(input.openingCash, 0));

  const existing = await query(
    `SELECT * FROM bc_cash_shifts WHERE attraction_id = $1 AND LOWER(cashier_email) = $2 AND status = 'open' LIMIT 1`,
    [attractionId, email]
  );
  if (existing.rows.length) {
    return { ok: true, shift: mapShift(existing.rows[0]), alreadyOpen: true };
  }

  const created = await query(
    `INSERT INTO bc_cash_shifts (attraction_id, cashier_email, cashier_name, currency, opening_cash, status, open_note)
     VALUES ($1,$2,COALESCE($3, ''),$4,$5,'open',COALESCE($6, ''))
     RETURNING *`,
    [attractionId, email, cashierName, settings.currency || 'USD', openingCash, T.text(input.note, 300)]
  );
  await T.writeTicketAudit({
    attractionId, actor: email, action: 'shift.opened', entityType: 'shift', entityId: created.rows[0].id,
    details: { openingCash, currency: settings.currency },
  });
  return { ok: true, shift: mapShift(created.rows[0]) };
}

async function getOpenShift(attractionId, email) {
  const res = await query(
    `SELECT * FROM bc_cash_shifts
      WHERE attraction_id = $1 AND LOWER(cashier_email) = $2 AND status = 'open'
      LIMIT 1`,
    [T.toInt(attractionId, 0), String(email || '').toLowerCase()]
  );
  const row = res.rows[0];
  if (!row) return null;
  const totals = await shiftTotals(row.attraction_id, row.id);
  return { ...mapShift(row), ...totals, expectedCashNow: T.round2(Number(row.opening_cash) + totals.cashSales - totals.cashRefunds - totals.payouts) };
}

async function closeShift({ attraction, actor, input = {} }) {
  const attractionId = T.toInt(attraction.id, 0);
  const email = String(actor || '').toLowerCase();
  const shiftId = T.toInt(input.shiftId, 0);

  const res = await query(
    `SELECT * FROM bc_cash_shifts
      WHERE attraction_id = $1 AND status = 'open' AND ($2 = 0 OR id = $2)
        AND ($2 > 0 OR LOWER(cashier_email) = $3)
      ORDER BY opened_at ASC LIMIT 1`,
    [attractionId, shiftId, email]
  );
  const shift = res.rows[0];
  if (!shift) return { ok: false, status: 404, error: 'No open shift found for this cashier' };

  const totals = await shiftTotals(attractionId, shift.id);
  const openingCash = Number(shift.opening_cash || 0);
  const expectedCash = T.round2(openingCash + totals.cashSales - totals.cashRefunds - totals.payouts);
  const countedCash = input.countedCash === undefined || input.countedCash === ''
    ? expectedCash
    : Math.max(0, T.toMoney(input.countedCash, expectedCash));
  const difference = T.round2(countedCash - expectedCash);
  const note = T.text(input.note || input.reason, 400);
  if (Math.abs(difference) >= 0.01 && note.length < 3) {
    return { ok: false, status: 400, error: 'Record a reason for the cash discrepancy' };
  }

  const updated = await query(
    `UPDATE bc_cash_shifts
        SET status = 'closed', counted_cash = $2, expected_cash = $3, difference = $4,
            cash_sales = $5, mobile_sales = $6, card_sales = $7, other_sales = $8,
            refunds = $9, payouts = $10, close_note = COALESCE($11, ''), closed_by = COALESCE($12, ''),
            closed_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      shift.id, countedCash, expectedCash, difference,
      totals.cashSales, totals.mobileSales, totals.cardSales, totals.otherSales,
      totals.refunds, totals.payouts, note, email,
    ]
  );

  await T.writeTicketAudit({
    attractionId, actor: email, action: 'shift.closed', entityType: 'shift', entityId: shift.id,
    details: { expectedCash, countedCash, difference, note, tickets: totals.tickets },
  });

  return { ok: true, shift: mapShift(updated.rows[0]), totals, discrepancy: Math.abs(difference) >= 0.01 };
}

async function recordCashMovement({ attraction, actor, input = {} }) {
  const attractionId = T.toInt(attraction.id, 0);
  const shiftId = T.toInt(input.shiftId, 0);
  const kind = ['payout', 'float', 'adjustment'].includes(input.kind) ? input.kind : 'payout';
  const amount = T.toMoney(input.amount, 0);
  const reason = T.text(input.reason, 300);
  if (amount <= 0) return { ok: false, status: 400, error: 'Enter an amount greater than zero' };
  if (reason.length < 3) return { ok: false, status: 400, error: 'Record a reason for this cash movement' };

  const res = await query(
    `SELECT id FROM bc_cash_shifts WHERE id = $1 AND attraction_id = $2 AND status = 'open'`,
    [shiftId, attractionId]
  );
  if (!res.rows.length) return { ok: false, status: 404, error: 'Open shift not found' };

  await query(
    `INSERT INTO bc_cash_movements (shift_id, attraction_id, kind, amount, reason, actor_email)
     VALUES ($1,$2,$3,$4,COALESCE($5, ''),COALESCE($6, ''))`,
    [shiftId, attractionId, kind, amount, reason, String(actor || '').toLowerCase()]
  );
  await T.writeTicketAudit({
    attractionId, actor, action: `cash.${kind}`, entityType: 'shift', entityId: shiftId,
    details: { amount, reason },
  });
  return { ok: true, kind, amount };
}

async function listShifts(attractionId, body = {}) {
  const id = T.toInt(attractionId, 0);
  const range = clampRange(body.from, body.to, 30);
  const params = [id, range.from, range.to];
  let filter = '';
  const cashier = String(body.cashier || '').trim().toLowerCase();
  if (cashier) {
    params.push(cashier);
    filter += ` AND LOWER(s.cashier_email) = $${params.length}`;
  }
  const status = String(body.status || '').toLowerCase();
  if (['open', 'closed'].includes(status)) {
    params.push(status);
    filter += ` AND s.status = $${params.length}`;
  }

  const rows = await query(
    `SELECT s.*, 
            (SELECT COUNT(*)::int FROM bc_ticket_orders o WHERE o.shift_id = s.id AND o.status = 'pending_payment') AS pending_sales
       FROM bc_cash_shifts s
      WHERE s.attraction_id = $1 AND s.opened_at >= $2::date AND s.opened_at < ($3::date + INTERVAL '1 day')${filter}
      ORDER BY s.opened_at DESC
      LIMIT 100`,
    params
  );

  const totalsRes = await query(
    `SELECT
       COALESCE(SUM(counted_cash - expected_cash) FILTER (WHERE status = 'closed'), 0)::numeric AS net_difference,
       COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_shifts,
       COUNT(*) FILTER (WHERE status = 'open')::int AS open_shifts,
       COALESCE(SUM(cash_sales) FILTER (WHERE status = 'closed'), 0)::numeric AS cash_sales
     FROM bc_cash_shifts s
     WHERE s.attraction_id = $1 AND s.opened_at >= $2::date AND s.opened_at < ($3::date + INTERVAL '1 day')${filter}`,
    params
  );

  return {
    shifts: rows.rows.map((row) => ({ ...mapShift(row), pendingSales: Number(row.pending_sales || 0) })),
    totals: {
      netDifference: Number(totalsRes.rows[0]?.net_difference || 0),
      closedShifts: Number(totalsRes.rows[0]?.closed_shifts || 0),
      openShifts: Number(totalsRes.rows[0]?.open_shifts || 0),
      cashSales: Number(totalsRes.rows[0]?.cash_sales || 0),
    },
    range,
  };
}

// ─── Reports ─────────────────────────────────────────────────────────────────

async function loadReports(attractionId, body = {}) {
  const id = T.toInt(attractionId, 0);
  const range = clampRange(body.from, body.to, 30);
  const params = [id, range.from, range.to];
  const clauses = [`o.attraction_id = $1`, `o.created_at >= $2::date`, `o.created_at < ($3::date + INTERVAL '1 day')`];

  const channel = String(body.channel || '').toLowerCase();
  if (['online', 'pos', 'counter', 'physical'].includes(channel)) {
    params.push(channel === 'physical' ? 'pos' : channel);
    clauses.push(`o.channel = $${params.length}`);
  }
  const cashier = String(body.cashier || '').trim().toLowerCase();
  if (cashier) {
    params.push(cashier);
    clauses.push(`LOWER(o.cashier_email) = $${params.length}`);
  }
  const method = String(body.paymentMethod || '').toLowerCase();
  if (PAYMENT_METHODS.includes(method)) {
    params.push(method);
    clauses.push(`o.payment_method = $${params.length}`);
  }
  const ticketTypeId = T.toInt(body.ticketTypeId, 0);
  if (ticketTypeId) {
    params.push(ticketTypeId);
    clauses.push(`EXISTS (SELECT 1 FROM bc_ticket_order_items i WHERE i.order_id = o.id AND i.ticket_type_id = $${params.length})`);
  }
  const batchId = T.toInt(body.batchId, 0);
  if (batchId) {
    params.push(batchId);
    clauses.push(`o.batch_id = $${params.length}`);
  }

  const where = clauses.join(' AND ');
  const paid = `o.payment_status IN ('paid', 'partially_refunded')`;

  const [byChannel, byCategory, byMethod, byCashier, daily, states, shiftsRes, batchRes] = await Promise.all([
    query(
      `SELECT o.channel,
              COALESCE(SUM(o.quantity_total) FILTER (WHERE ${paid}), 0)::int AS tickets,
              COALESCE(SUM(o.total) FILTER (WHERE ${paid}), 0)::numeric AS gross,
              COALESCE(SUM(o.refund_amount), 0)::numeric AS refunds,
              COALESCE(SUM(o.tax_amount) FILTER (WHERE ${paid}), 0)::numeric AS taxes,
              COALESCE(SUM(o.service_fee) FILTER (WHERE ${paid}), 0)::numeric AS fees
         FROM bc_ticket_orders o WHERE ${where} GROUP BY 1 ORDER BY 1`,
      params
    ),
    query(
      `SELECT COALESCE(ty.category, 'other') AS category,
              COALESCE(SUM(i.quantity) FILTER (WHERE ${paid}), 0)::int AS tickets,
              COALESCE(SUM(i.line_total) FILTER (WHERE ${paid}), 0)::numeric AS gross
         FROM bc_ticket_order_items i
         JOIN bc_ticket_orders o ON o.id = i.order_id
         LEFT JOIN bc_ticket_types ty ON ty.id = i.ticket_type_id
        WHERE ${where} GROUP BY 1 ORDER BY gross DESC`,
      params
    ),
    query(
      `SELECT COALESCE(NULLIF(o.payment_method, ''), 'unknown') AS method,
              COUNT(*)::int AS sales,
              COALESCE(SUM(o.quantity_total) FILTER (WHERE ${paid}), 0)::int AS tickets,
              COALESCE(SUM(o.total) FILTER (WHERE ${paid}), 0)::numeric AS gross,
              COALESCE(SUM(o.refund_amount), 0)::numeric AS refunds
         FROM bc_ticket_orders o WHERE ${where} GROUP BY 1 ORDER BY gross DESC`,
      params
    ),
    query(
      `SELECT COALESCE(NULLIF(o.cashier_email, ''), 'online') AS cashier,
              COUNT(*)::int AS sales,
              COALESCE(SUM(o.quantity_total) FILTER (WHERE ${paid}), 0)::int AS tickets,
              COALESCE(SUM(o.total) FILTER (WHERE ${paid}), 0)::numeric AS gross,
              COALESCE(SUM(o.total) FILTER (WHERE ${paid} AND o.payment_method = 'cash'), 0)::numeric AS cash
         FROM bc_ticket_orders o WHERE ${where} GROUP BY 1 ORDER BY gross DESC LIMIT 50`,
      params
    ),
    query(
      `SELECT o.created_at::date AS day, o.channel,
              COALESCE(SUM(o.total) FILTER (WHERE ${paid}), 0)::numeric AS gross,
              COALESCE(SUM(o.quantity_total) FILTER (WHERE ${paid}), 0)::int AS tickets
         FROM bc_ticket_orders o WHERE ${where} GROUP BY 1, 2 ORDER BY 1 ASC`,
      params
    ),
    query(
      `SELECT
         COUNT(*)::int AS generated,
         COUNT(*) FILTER (WHERE t.printed_count > 0)::int AS printed,
         COUNT(*) FILTER (WHERE t.status IN ('valid', 'used'))::int AS sold,
         COUNT(*) FILTER (WHERE t.status = 'used' OR t.admissions_used > 0)::int AS used,
         COALESCE(SUM(t.admissions_used), 0)::int AS admissions,
         COUNT(*) FILTER (WHERE t.status = 'void')::int AS voided,
         COUNT(*) FILTER (WHERE t.status = 'available' AND t.visit_date >= CURRENT_DATE)::int AS unsold,
         COUNT(*) FILTER (WHERE t.status = 'expired' OR (t.status = 'available' AND t.visit_date < CURRENT_DATE))::int AS expired
       FROM bc_attraction_tickets t
      WHERE t.attraction_id = $1 AND t.source = 'physical'
        AND t.issued_at >= $2::date AND t.issued_at < ($3::date + INTERVAL '1 day')`,
      [id, range.from, range.to]
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE s.status = 'closed')::int AS closed_shifts,
              COUNT(*) FILTER (WHERE s.status = 'closed' AND ABS(s.difference) >= 0.01)::int AS discrepancies,
              COALESCE(SUM(s.difference) FILTER (WHERE s.status = 'closed'), 0)::numeric AS net_difference
         FROM bc_cash_shifts s
        WHERE s.attraction_id = $1 AND s.opened_at >= $2::date AND s.opened_at < ($3::date + INTERVAL '1 day')`,
      [id, range.from, range.to]
    ),
    query(
      `SELECT b.id, b.batch_ref, b.name, b.status, b.visit_date,
              tk.generated, tk.printed, tk.sold, tk.available, tk.voided
         FROM bc_ticket_batches b
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS generated,
                  COUNT(*) FILTER (WHERE t.printed_count > 0)::int AS printed,
                  COUNT(*) FILTER (WHERE t.status IN ('valid', 'used'))::int AS sold,
                  COUNT(*) FILTER (WHERE t.status = 'available')::int AS available,
                  COUNT(*) FILTER (WHERE t.status = 'void')::int AS voided
             FROM bc_attraction_tickets t WHERE t.batch_id = b.id
         ) tk ON TRUE
        WHERE b.attraction_id = $1
        ORDER BY b.created_at DESC LIMIT 100`,
      [id]
    ),
  ]);

  const channelRows = byChannel.rows.map((row) => ({
    channel: row.channel,
    tickets: Number(row.tickets || 0),
    gross: Number(row.gross || 0),
    refunds: Number(row.refunds || 0),
    net: T.round2(Number(row.gross || 0) - Number(row.refunds || 0) - Number(row.fees || 0)),
    fees: Number(row.fees || 0),
    taxes: Number(row.taxes || 0),
  }));
  const state = states.rows[0] || {};

  return {
    range,
    byChannel: channelRows,
    byCategory: byCategory.rows.map((row) => ({
      category: row.category, tickets: Number(row.tickets || 0), gross: Number(row.gross || 0),
    })),
    byPaymentMethod: byMethod.rows.map((row) => ({
      method: row.method, sales: Number(row.sales || 0), tickets: Number(row.tickets || 0),
      gross: Number(row.gross || 0), refunds: Number(row.refunds || 0),
    })),
    byCashier: byCashier.rows.map((row) => ({
      cashier: row.cashier, sales: Number(row.sales || 0), tickets: Number(row.tickets || 0),
      gross: Number(row.gross || 0), cash: Number(row.cash || 0),
    })),
    daily: daily.rows.map((row) => ({
      day: T.isoDate(row.day), channel: row.channel,
      gross: Number(row.gross || 0), tickets: Number(row.tickets || 0),
    })),
    ticketStates: {
      generated: Number(state.generated || 0),
      printed: Number(state.printed || 0),
      sold: Number(state.sold || 0),
      used: Number(state.used || 0),
      admissions: Number(state.admissions || 0),
      voided: Number(state.voided || 0),
      unsold: Number(state.unsold || 0),
      expired: Number(state.expired || 0),
    },
    shifts: {
      closed: Number(shiftsRes.rows[0]?.closed_shifts || 0),
      discrepancies: Number(shiftsRes.rows[0]?.discrepancies || 0),
      netDifference: Number(shiftsRes.rows[0]?.net_difference || 0),
    },
    batches: batchRes.rows.map((row) => ({
      id: row.id, batchRef: row.batch_ref, name: row.name, status: row.status,
      visitDate: T.isoDate(row.visit_date),
      generated: Number(row.generated || 0), printed: Number(row.printed || 0),
      sold: Number(row.sold || 0), available: Number(row.available || 0), voided: Number(row.voided || 0),
    })),
  };
}

// ─── Settings ────────────────────────────────────────────────────────────────

async function savePhysicalSettings(attractionId, input = {}) {
  const settings = await T.getSettings(attractionId);
  const result = await query(
    `UPDATE bc_ticket_settings
        SET pos_enabled = $2, ticket_logo_url = COALESCE($3, ''), ticket_contact = COALESCE($4, ''),
            ticket_terms = COALESCE($5, ''), print_layout = $6, paper_size = $7,
            receipt_header = COALESCE($8, ''), receipt_footer = COALESCE($9, ''),
            ticket_artwork_url = COALESCE($10, ''), ticket_artwork_fit = $11, updated_at = NOW()
      WHERE attraction_id = $1
      RETURNING *`,
    [
      T.toInt(attractionId, 0),
      input.posEnabled === undefined ? settings.pos_enabled !== false : Boolean(input.posEnabled),
      T.text(input.ticketLogoUrl, 800) || '',
      T.text(input.ticketContact, 300) || '',
      T.text(input.ticketTerms, 4000) || '',
      PRINT_LAYOUTS.includes(input.printLayout) ? input.printLayout : (settings.print_layout || 'a4_4'),
      ['A4', 'A5', 'Letter', 'Thermal 80mm'].includes(input.paperSize) ? input.paperSize : (settings.paper_size || 'A4'),
      T.text(input.receiptHeader, 400) || '',
      T.text(input.receiptFooter, 400) || '',
      // The client artwork space is printed into HTML, so the URL is sanitised
      // exactly like the platform artwork panel.
      input.ticketArtworkUrl === undefined
        ? (settings.ticket_artwork_url || '')
        : B.sanitizeImageUrl(input.ticketArtworkUrl),
      input.ticketArtworkFit === undefined
        ? (settings.ticket_artwork_fit || 'cover')
        : B.normalizeFit(input.ticketArtworkFit),
    ]
  );
  return result.rows[0];
}

module.exports = {
  BATCH_STATUSES,
  DEFAULT_PERMISSIONS,
  MAX_BATCH_QUANTITY,
  MAX_POS_TICKETS,
  PAYMENT_METHODS,
  POS_PERMISSIONS,
  PRINT_LAYOUTS,
  can,
  claimBatchTickets,
  closeShift,
  confirmPosPayment,
  createBatch,
  deleteBatch,
  getOpenShift,
  insertTicket,
  listBatches,
  listPosSales,
  listShifts,
  loadBatch,
  loadReceipt,
  loadReports,
  mapBatch,
  mapShift,
  newBatchRef,
  newIdempotencyKey,
  newReceiptNo,
  newSaleRef,
  newTicketNo,
  normalizePermissions,
  openShift,
  permissionsFor,
  posSale,
  recordCashMovement,
  recordPrint,
  savePhysicalSettings,
  setBatchStatus,
  shiftTotals,
  voidTickets,
};
