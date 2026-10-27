// api-routes/attraction-ticket-sales.js
// Owner / staff side of ticketing: the sales ledger, refunds & cancellations,
// manual admissions and the QR validation desk.
//
// Every money decision is recomputed here from stored line items; every state
// change writes to bc_ticket_audit and every scan writes to bc_ticket_validations.

const { query, withTransaction, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { verifyRequestBearer } = require('../lib/google-verify');
const notificationHub = require('../lib/notification-hub');
const T = require('../lib/ticketing');

const SORTABLE = {
  created_at: 'o.created_at',
  visit_date: 'o.visit_date',
  total: 'o.total',
  customer_name: 'o.customer_name',
  status: 'o.status',
  payment_status: 'o.payment_status',
};

const ORDER_STATUSES = ['pending_payment', 'confirmed', 'cancelled', 'refunded', 'partially_refunded', 'expired'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded', 'partially_refunded'];

function clampRange(from, to, fallbackDays = 30) {
  const start = T.isDateISO(from) ? from : T.addDaysISO(T.isoToday(), -fallbackDays);
  let end = T.isDateISO(to) ? to : T.isoToday();
  if (end < start) end = start;
  const maxEnd = T.addDaysISO(start, 400);
  return { from: start, to: end > maxEnd ? maxEnd : end };
}

function pageOf(body) {
  const page = Math.max(1, Math.min(10000, T.toInt(body.page, 1)));
  const pageSize = Math.max(1, Math.min(100, T.toInt(body.pageSize, 25)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function requireAccess(email, attractionId, need) {
  const access = await T.resolveAccess(email, attractionId);
  if (!access.ok) return access;
  if (!T.roleAllows(access.role, need)) {
    return { ok: false, status: 403, error: `This action requires the ${need} role` };
  }
  return access;
}

function mapOrder(row) {
  const ticketsTotal = Number(row.tickets_total || 0);
  const ticketsUsed = Number(row.tickets_used || 0);
  const ticketsCancelled = Number(row.tickets_cancelled || 0);
  let validationStatus = 'not_validated';
  if (row.status === 'cancelled' || row.status === 'refunded') validationStatus = 'cancelled';
  else if (ticketsTotal > 0 && ticketsCancelled >= ticketsTotal) validationStatus = 'cancelled';
  else if (ticketsUsed > 0 && ticketsUsed >= ticketsTotal) validationStatus = 'used';
  else if (ticketsUsed > 0) validationStatus = 'partially_used';

  return {
    id: row.id,
    bookingRef: row.booking_ref,
    attractionId: row.attraction_id,
    attractionName: row.attraction_name,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    visitDate: T.isoDate(row.visit_date),
    slotId: Number(row.slot_id || 0),
    slotLabel: row.slot_label,
    ticketTypes: row.ticket_types || '',
    quantity: Number(row.quantity_total || 0),
    admissionsTotal: Number(row.ticket_admissions_total ?? row.admissions_total ?? 0),
    admissionsUsed: Number(row.admissions_used || 0),
    subtotal: Number(row.subtotal || 0),
    discount: Number(row.discount || 0),
    promoCode: row.promo_code,
    taxAmount: Number(row.tax_amount || 0),
    serviceFee: Number(row.service_fee || 0),
    total: Number(row.total || 0),
    refundAmount: Number(row.refund_amount || 0),
    refundedAt: row.refunded_at,
    currency: row.currency,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    channel: row.channel,
    notes: row.notes,
    validationStatus,
    ticketsTotal,
    ticketsUsed,
    ticketNumbers: row.ticket_nos || '',
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

// ─── Sales ledger ────────────────────────────────────────────────────────────

function buildSalesWhere(attractionId, body) {
  const params = [attractionId];
  const clauses = ['o.attraction_id = $1'];

  const search = T.text(body.search, 120);
  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    clauses.push(`(o.booking_ref ILIKE $${idx} OR o.customer_name ILIKE $${idx} OR o.customer_email ILIKE $${idx}
      OR EXISTS (SELECT 1 FROM bc_attraction_tickets t WHERE t.order_id = o.id AND t.ticket_no ILIKE $${idx}))`);
  }

  const status = String(body.status || '').toLowerCase();
  if (ORDER_STATUSES.includes(status)) {
    params.push(status);
    clauses.push(`o.status = $${params.length}`);
  }

  const paymentStatus = String(body.paymentStatus || '').toLowerCase();
  if (PAYMENT_STATUSES.includes(paymentStatus)) {
    params.push(paymentStatus);
    clauses.push(`o.payment_status = $${params.length}`);
  }

  const ticketTypeId = T.toInt(body.ticketTypeId, 0);
  if (ticketTypeId) {
    params.push(ticketTypeId);
    clauses.push(`EXISTS (SELECT 1 FROM bc_ticket_order_items i WHERE i.order_id = o.id AND i.ticket_type_id = $${params.length})`);
  }

  const purchase = clampRange(body.from || body.purchaseFrom, body.to || body.purchaseTo);
  params.push(purchase.from, purchase.to);
  clauses.push(`o.created_at >= $${params.length - 1}::date AND o.created_at < ($${params.length}::date + INTERVAL '1 day')`);

  if (T.isDateISO(body.visitFrom)) {
    params.push(body.visitFrom);
    clauses.push(`o.visit_date >= $${params.length}::date`);
  }
  if (T.isDateISO(body.visitTo)) {
    params.push(body.visitTo);
    clauses.push(`o.visit_date <= $${params.length}::date`);
  }

  return { where: clauses.join(' AND '), params };
}

const TICKET_NUMBERS = `(SELECT STRING_AGG(t.ticket_no, ', ' ORDER BY t.id)
                            FROM bc_attraction_tickets t WHERE t.order_id = o.id) AS ticket_nos`;

const TICKET_AGG = `
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS tickets_total,
           COUNT(*) FILTER (WHERE t.admissions_used > 0)::int AS tickets_used,
           COUNT(*) FILTER (WHERE t.status = 'cancelled')::int AS tickets_cancelled,
           COALESCE(SUM(t.admissions_total), 0)::int AS admissions_total,
           COALESCE(SUM(t.admissions_used), 0)::int AS admissions_used
      FROM bc_attraction_tickets t
     WHERE t.order_id = o.id
  ) tk ON TRUE`;

async function listSales(attractionId, body) {
  const { where, params } = buildSalesWhere(attractionId, body);
  const { page, pageSize, offset } = pageOf(body);
  const sortKey = SORTABLE[String(body.sort || 'created_at')] || SORTABLE.created_at;
  const direction = String(body.direction || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const countRes = await query(`SELECT COUNT(*)::int AS total FROM bc_ticket_orders o WHERE ${where}`, params);

  const listParams = [...params, pageSize, offset];
  const rowsRes = await query(
    `SELECT o.*, tk.tickets_total, tk.tickets_used, tk.tickets_cancelled,
            tk.admissions_total AS ticket_admissions_total,
            tk.admissions_used AS admissions_used,
            ${TICKET_NUMBERS},
            (SELECT STRING_AGG(DISTINCT i.ticket_type_name, ', ')
               FROM bc_ticket_order_items i WHERE i.order_id = o.id) AS ticket_types
       FROM bc_ticket_orders o
       ${TICKET_AGG}
      WHERE ${where}
      ORDER BY ${sortKey} ${direction}, o.id DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  const totalsRes = await query(
    `SELECT
       COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid'), 0)::numeric AS revenue,
       COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'unpaid'), 0)::numeric AS pending,
       COALESCE(SUM(o.refund_amount), 0)::numeric AS refunded,
       COALESCE(SUM(o.quantity_total) FILTER (WHERE o.payment_status = 'paid'), 0)::int AS tickets
     FROM bc_ticket_orders o WHERE ${where}`,
    params
  );

  return {
    sales: rowsRes.rows.map(mapOrder),
    pagination: {
      page,
      pageSize,
      total: Number(countRes.rows[0]?.total || 0),
      pages: Math.max(1, Math.ceil(Number(countRes.rows[0]?.total || 0) / pageSize)),
    },
    totals: {
      revenue: Number(totalsRes.rows[0]?.revenue || 0),
      pending: Number(totalsRes.rows[0]?.pending || 0),
      refunded: Number(totalsRes.rows[0]?.refunded || 0),
      tickets: Number(totalsRes.rows[0]?.tickets || 0),
    },
  };
}

async function loadSale(attractionId, orderId) {
  const orderRes = await query(
    `SELECT o.*, tk.tickets_total, tk.tickets_used, tk.tickets_cancelled,
            tk.admissions_total AS ticket_admissions_total,
            tk.admissions_used AS admissions_used,
            ${TICKET_NUMBERS},
            (SELECT STRING_AGG(DISTINCT i.ticket_type_name, ', ')
               FROM bc_ticket_order_items i WHERE i.order_id = o.id) AS ticket_types
       FROM bc_ticket_orders o
       ${TICKET_AGG}
      WHERE o.id = $1 AND o.attraction_id = $2`,
    [orderId, attractionId]
  );
  const row = orderRes.rows[0];
  if (!row) return null;

  const [itemsRes, ticketsRes, auditRes] = await Promise.all([
    query(`SELECT * FROM bc_ticket_order_items WHERE order_id = $1 ORDER BY id ASC`, [orderId]),
    query(`SELECT * FROM bc_attraction_tickets WHERE order_id = $1 ORDER BY id ASC`, [orderId]),
    query(
      `SELECT actor_email, action, details, created_at FROM bc_ticket_audit
        WHERE attraction_id = $1 AND entity_type = 'order' AND entity_id = $2::text
        ORDER BY created_at DESC LIMIT 25`,
      [attractionId, String(orderId)]
    ),
  ]);

  const ticketNumbers = ticketsRes.rows.map((ticket) => ticket.ticket_no);
  let validations = [];
  if (ticketNumbers.length) {
    const valRes = await query(
      `SELECT ticket_number, action_performed, result, rejection_reason, validated_by_name,
              validated_by_email, details, created_at
         FROM bc_ticket_validations
        WHERE ticket_number = ANY($1::text[])
        ORDER BY created_at DESC LIMIT 100`,
      [ticketNumbers]
    );
    validations = valRes.rows.map((entry) => ({
      ticketNumber: entry.ticket_number,
      action: entry.action_performed,
      result: entry.result,
      reason: entry.rejection_reason,
      staff: entry.validated_by_name || entry.validated_by_email,
      details: entry.details,
      createdAt: entry.created_at,
    }));
  }

  return {
    order: mapOrder(row),
    items: itemsRes.rows.map((item) => ({
      id: item.id,
      ticketTypeId: item.ticket_type_id,
      ticketTypeName: item.ticket_type_name,
      visitDate: T.isoDate(item.visit_date),
      slotId: Number(item.slot_id || 0),
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity),
      admissionsPerUnit: Number(item.admissions_per_unit),
      lineTotal: Number(item.line_total),
    })),
    tickets: ticketsRes.rows.map((ticket) => ({
      ...T.publicTicket(ticket),
      holderEmail: ticket.holder_email,
      issuedAt: ticket.issued_at,
    })),
    validations,
    audit: auditRes.rows.map((entry) => ({
      actor: entry.actor_email,
      action: entry.action,
      details: entry.details,
      createdAt: entry.created_at,
    })),
  };
}

// Refund policy, inventory release and the Stripe call live in lib/ticketing.js
// so the sales desk and customer self-service can never disagree.

// ─── Validation desk ─────────────────────────────────────────────────────────

const OUTCOME_MESSAGES = {
  valid: 'Valid ticket — admission can proceed',
  already_used: 'This ticket has already been used',
  expired: 'This ticket has expired',
  cancelled: 'This ticket was cancelled',
  refunded: 'This ticket was refunded',
  wrong_attraction: 'This ticket belongs to a different attraction',
  invalid: 'This ticket could not be verified',
  not_yet_valid: 'This ticket is not valid yet',
  unpaid: 'Payment for this booking has not been confirmed',
};

function entryWindow(visitDate, startTime, endTime) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(startTime || ''))) {
    return { enforced: false, label: 'All day' };
  }
  const start = new Date(`${visitDate}T${startTime}:00`);
  const end = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(endTime || ''))
    ? new Date(`${visitDate}T${endTime}:00`)
    : new Date(start.getTime() + 3 * 3600000);
  const from = new Date(start.getTime() - 60 * 60000);
  const until = new Date(end.getTime() + 60 * 60000);
  return {
    enforced: true,
    from: from.toISOString(),
    until: until.toISOString(),
    label: `${startTime} – ${(endTime || '') || 'open'}`,
  };
}

async function lastValidation(ticketNo) {
  const res = await query(
    `SELECT action_performed, result, validated_by_name, validated_by_email, created_at, details
       FROM bc_ticket_validations
      WHERE ticket_number = $1 AND result = 'success'
      ORDER BY created_at DESC LIMIT 1`,
    [ticketNo]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    action: row.action_performed,
    staff: row.validated_by_name || row.validated_by_email,
    at: row.created_at,
    admissions: Number(row.details?.admissions || 0),
  };
}

async function logValidation({ attraction, email, staffName, ticketNo, action, result, reason, guestName, details }) {
  try {
    await query(
      `INSERT INTO bc_ticket_validations (
         ticket_number, operator_type, service_id, service_name, action_performed, result,
         rejection_reason, validated_by_email, validated_by_name, guest_name, details
       ) VALUES ($1,'attraction',$2,COALESCE($3, ''),$4,$5,COALESCE($6, ''),COALESCE($7, ''),COALESCE($8, ''),COALESCE($9, ''),$10)`,
      [
        ticketNo, String(attraction.id), attraction.name || '', action,
        result, String(reason || '').slice(0, 300), String(email || '').toLowerCase(), staffName || '',
        guestName || '', JSON.stringify(details || {}),
      ]
    );
  } catch (error) {
    console.warn('[ticket-sales] validation log failed:', error.message);
  }
}

async function staffNameFor(attractionId, email) {
  const res = await query(
    `SELECT name FROM bc_ticket_staff WHERE attraction_id = $1 AND LOWER(email) = $2 LIMIT 1`,
    [attractionId, String(email || '').toLowerCase()]
  );
  return res.rows[0]?.name || '';
}

/**
 * Resolve a scanned/typed ticket into an outcome. `consume` performs the atomic
 * admission update; without it this is a read-only pre-check.
 */
async function checkTicket({ attraction, email, staffName, rawTicket, admissions, consume }) {
  const parsed = T.parseTicketInput(rawTicket);
  const base = {
    ticketNumber: parsed.ticketNo,
    signatureOk: parsed.signatureOk,
    admissionsRequested: admissions,
  };

  if (!parsed.ticketNo) {
    return { outcome: 'invalid', ok: false, ...base, message: OUTCOME_MESSAGES.invalid };
  }
  if (String(rawTicket).trim().startsWith('bct1.') && !parsed.signatureOk) {
    return { outcome: 'invalid', ok: false, ...base, message: 'The QR signature does not match this ticket' };
  }

  const res = await query(
    `SELECT t.*, o.status AS order_status, o.payment_status AS order_payment_status,
            o.customer_name, o.slot_id, o.attraction_name
       FROM bc_attraction_tickets t
       JOIN bc_ticket_orders o ON o.id = t.order_id
      WHERE UPPER(t.ticket_no) = $1
      LIMIT 1`,
    [parsed.ticketNo]
  );
  const ticket = res.rows[0];
  if (!ticket) {
    return { outcome: 'invalid', ok: false, ...base, message: OUTCOME_MESSAGES.invalid };
  }

  const slotRes = ticket.slot_id
    ? await query(`SELECT start_time, end_time FROM bc_ticket_slots WHERE id = $1`, [ticket.slot_id])
    : { rows: [] };
  const window = entryWindow(
    T.isoDate(ticket.visit_date),
    slotRes.rows[0]?.start_time,
    slotRes.rows[0]?.end_time
  );

  const payload = {
    ...base,
    ticketNumber: ticket.ticket_no,
    bookingRef: ticket.booking_ref,
    attractionId: Number(ticket.attraction_id),
    attractionName: ticket.attraction_name,
    ticketTypeName: ticket.ticket_type_name,
    holderName: ticket.holder_name || ticket.customer_name,
    visitDate: T.isoDate(ticket.visit_date),
    slotLabel: ticket.slot_label,
    ticketStatus: ticket.status,
    admissionsTotal: Number(ticket.admissions_total),
    admissionsUsed: Number(ticket.admissions_used),
    admissionsRemaining: Math.max(0, Number(ticket.admissions_total) - Number(ticket.admissions_used)),
    window,
  };

  const reject = async (outcome, message, extra = {}) => {
    await logValidation({
      attraction, email, staffName, ticketNo: ticket.ticket_no,
      action: consume ? 'admit' : 'validate', result: 'rejected', reason: outcome,
      guestName: ticket.holder_name, details: { outcome, admissions, ...extra },
    });
    return { outcome, ok: false, ...payload, message, ...extra };
  };

  if (Number(ticket.attraction_id) !== Number(attraction.id)) {
    return reject('wrong_attraction', OUTCOME_MESSAGES.wrong_attraction);
  }
  if (ticket.status === 'cancelled') return reject('cancelled', OUTCOME_MESSAGES.cancelled);
  if (ticket.status === 'refunded') return reject('refunded', OUTCOME_MESSAGES.refunded);
  if (ticket.order_status === 'cancelled') return reject('cancelled', OUTCOME_MESSAGES.cancelled);
  if (ticket.order_status === 'refunded') return reject('refunded', OUTCOME_MESSAGES.refunded);
  if (ticket.order_payment_status !== 'paid' || ticket.order_status !== 'confirmed') {
    return reject('unpaid', OUTCOME_MESSAGES.unpaid);
  }

  const visitDate = T.isoDate(ticket.visit_date);
  const today = T.isoToday();
  if (visitDate > today) {
    return reject('not_yet_valid', `This ticket is valid on ${visitDate}`, { permittedFrom: visitDate });
  }
  if (visitDate < today) return reject('expired', OUTCOME_MESSAGES.expired);

  if (window.enforced) {
    const now = Date.now();
    if (now < new Date(window.from).getTime()) {
      return reject('not_yet_valid', `Entry opens at ${window.label}`, { permittedFrom: window.from, permittedUntil: window.until });
    }
    if (now > new Date(window.until).getTime()) {
      return reject('expired', `The entry window (${window.label}) has closed`, { permittedUntil: window.until });
    }
  }

  if (ticket.status === 'used' || Number(ticket.admissions_used) >= Number(ticket.admissions_total)) {
    const previous = await lastValidation(ticket.ticket_no);
    await logValidation({
      attraction, email, staffName, ticketNo: ticket.ticket_no,
      action: consume ? 'admit' : 'validate', result: 'rejected', reason: 'already_used',
      guestName: ticket.holder_name, details: { outcome: 'already_used', admissions, previous },
    });
    return {
      outcome: 'already_used', ok: false, ...payload,
      admissionsRemaining: 0, previous,
      message: previous?.at
        ? `Already used on ${new Date(previous.at).toLocaleString()} by ${previous.staff || 'staff'}`
        : OUTCOME_MESSAGES.already_used,
    };
  }

  if (!consume) {
    await logValidation({
      attraction, email, staffName, ticketNo: ticket.ticket_no,
      action: 'validate', result: 'success', reason: '', guestName: ticket.holder_name,
      details: { outcome: 'valid', admissions },
    });
    return { outcome: 'valid', ok: true, ...payload, message: OUTCOME_MESSAGES.valid };
  }

  // Atomic consumption: the WHERE clause guarantees the same admission can
  // never be counted twice, even with simultaneous scans.
  const updated = await query(
    `UPDATE bc_attraction_tickets
        SET admissions_used = admissions_used + $2,
            status = CASE WHEN admissions_used + $2 >= admissions_total THEN 'used' ELSE status END,
            updated_at = NOW()
      WHERE id = $1
        AND status = 'valid'
        AND admissions_used + $2 <= admissions_total
      RETURNING *`,
    [ticket.id, admissions]
  );

  if (!updated.rows.length) {
    const previous = await lastValidation(ticket.ticket_no);
    await logValidation({
      attraction, email, staffName, ticketNo: ticket.ticket_no,
      action: 'admit', result: 'rejected', reason: 'already_used',
      guestName: ticket.holder_name, details: { outcome: 'already_used', admissions, previous },
    });
    return { outcome: 'already_used', ok: false, ...payload, admissionsRemaining: 0, previous, message: OUTCOME_MESSAGES.already_used };
  }

  const fresh = updated.rows[0];
  const remaining = Math.max(0, Number(fresh.admissions_total) - Number(fresh.admissions_used));
  await query(`UPDATE bc_ticket_orders SET updated_at = NOW() WHERE id = $1`, [ticket.order_id]);

  await logValidation({
    attraction, email, staffName, ticketNo: fresh.ticket_no,
    action: 'admit', result: 'success', reason: '', guestName: fresh.holder_name,
    details: {
      outcome: 'valid',
      admissions,
      admissionsUsed: Number(fresh.admissions_used),
      admissionsTotal: Number(fresh.admissions_total),
      remaining,
      bookingRef: fresh.booking_ref,
    },
  });
  await T.writeTicketAudit({
    attractionId: attraction.id, actor: email, action: 'ticket.admitted',
    entityType: 'ticket', entityId: fresh.ticket_no,
    details: { admissions, remaining, bookingRef: fresh.booking_ref },
  });

  return {
    outcome: 'valid',
    ok: true,
    ...payload,
    admissionsUsed: Number(fresh.admissions_used),
    admissionsRemaining: remaining,
    message: remaining > 0
      ? `Admitted ${admissions} of ${fresh.admissions_total} — ${remaining} admission(s) remaining`
      : `Admitted ${admissions} — all admissions for this ticket are now used`,
  };
}

async function listScans(attractionId, body) {
  const { page, pageSize, offset } = pageOf(body);
  const params = [String(attractionId)];
  let filter = '';
  if (T.text(body.search, 60)) {
    params.push(`%${T.text(body.search, 60)}%`);
    filter = ` AND (ticket_number ILIKE $${params.length} OR guest_name ILIKE $${params.length})`;
  }
  const rows = await query(
    `SELECT ticket_number, action_performed, result, rejection_reason, validated_by_name,
            validated_by_email, guest_name, details, created_at
       FROM bc_ticket_validations
      WHERE operator_type = 'attraction' AND service_id = $1${filter}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM bc_ticket_validations
      WHERE operator_type = 'attraction' AND service_id = $1${filter}`,
    params
  );
  return {
    scans: rows.rows.map((row) => ({
      ticketNumber: row.ticket_number,
      action: row.action_performed,
      result: row.result,
      reason: row.rejection_reason,
      staff: row.validated_by_name || row.validated_by_email,
      guestName: row.guest_name,
      details: row.details,
      createdAt: row.created_at,
    })),
    pagination: {
      page, pageSize,
      total: Number(countRes.rows[0]?.total || 0),
      pages: Math.max(1, Math.ceil(Number(countRes.rows[0]?.total || 0) / pageSize)),
    },
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

module.exports = async function attractionTicketSalesHandler(req, res) {
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
    console.warn('[attraction-ticket-sales] DB unavailable:', error.message);
  }
  if (!dbReady) {
    return res.status(503).json({ ok: false, error: 'Ticketing requires the database. Run the migrations first.' });
  }

  const auth = await verifyRequestBearer(req);
  if (!auth.ok) return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'Authentication required' });
  const email = auth.email;

  const body = req.method === 'GET' ? req.query : (req.body || {});
  const action = String(body.action || req.query.action || '').toLowerCase();
  const attractionId = T.toInt(body.attractionId || req.query.attractionId, 0);

  try {
    if (!attractionId) return res.status(400).json({ ok: false, error: 'attractionId is required' });

    // QR validation and entry are the only actions a scanner needs.
    if (action === 'validate' || action === 'admit') {
      const access = await requireAccess(email, attractionId, 'scanner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

      const admissions = Math.max(1, Math.min(50, T.toInt(body.admissions || body.quantity, 1)));
      const staffName = await staffNameFor(attractionId, email);
      const outcome = await checkTicket({
        attraction: access.attraction,
        email,
        staffName,
        rawTicket: body.ticket || body.ticketNumber || body.qr || '',
        admissions,
        consume: action === 'admit',
      });
      return res.json({
        ok: outcome.ok,
        outcome: outcome.outcome,
        message: outcome.message,
        role: access.role,
        ...outcome,
      });
    }

    if (action === 'sales') {
      const access = await requireAccess(email, attractionId, 'scanner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const data = await listSales(attractionId, body);
      return res.json({ ok: true, ...data, role: access.role });
    }

    if (action === 'sale') {
      const access = await requireAccess(email, attractionId, 'scanner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const sale = await loadSale(attractionId, T.toInt(body.id || body.orderId, 0));
      if (!sale) return res.status(404).json({ ok: false, error: 'Booking not found' });
      return res.json({ ok: true, ...sale, role: access.role });
    }

    if (action === 'scans') {
      const access = await requireAccess(email, attractionId, 'scanner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const data = await listScans(attractionId, body);
      return res.json({ ok: true, ...data });
    }

    if (action === 'ticket-history') {
      const access = await requireAccess(email, attractionId, 'scanner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const ticketNo = T.parseTicketInput(body.ticket || body.ticketNumber || '').ticketNo;
      const res2 = await query(
        `SELECT ticket_number, action_performed, result, rejection_reason, validated_by_name,
                validated_by_email, details, created_at
           FROM bc_ticket_validations
          WHERE UPPER(ticket_number) = $1
          ORDER BY created_at DESC LIMIT 50`,
        [ticketNo]
      );
      return res.json({
        ok: true,
        ticketNumber: ticketNo,
        history: res2.rows.map((row) => ({
          action: row.action_performed,
          result: row.result,
          reason: row.rejection_reason,
          staff: row.validated_by_name || row.validated_by_email,
          admissions: Number(row.details?.admissions || 0),
          createdAt: row.created_at,
        })),
      });
    }

    const managerAccess = await requireAccess(email, attractionId, 'manager');
    if (!managerAccess.ok) return res.status(managerAccess.status).json({ ok: false, error: managerAccess.error });

    if (action === 'refund-quote') {
      const orderId = T.toInt(body.id || body.orderId, 0);
      const orderRes = await query(`SELECT * FROM bc_ticket_orders WHERE id = $1 AND attraction_id = $2`, [
        orderId, attractionId,
      ]);
      const order = orderRes.rows[0];
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });
      const itemsRes = await query(`SELECT * FROM bc_ticket_order_items WHERE order_id = $1`, [orderId]);
      const quote = await T.quoteRefund(order, itemsRes.rows);
      return res.json({
        ok: true,
        quote,
        currency: order.currency,
        total: Number(order.total || 0),
        refunded: Number(order.refund_amount || 0),
        paid: order.payment_status === 'paid' || order.payment_status === 'partially_refunded',
      });
    }

    if (action === 'resend') {
      const orderId = T.toInt(body.id || body.orderId, 0);
      const sale = await loadSale(attractionId, orderId);
      if (!sale) return res.status(404).json({ ok: false, error: 'Booking not found' });
      if (sale.order.status !== 'confirmed') {
        return res.status(409).json({ ok: false, error: 'Only confirmed bookings can be re-sent' });
      }
      const url = `/attraction-tickets/confirmation?ref=${encodeURIComponent(sale.order.bookingRef)}`;
      Promise.resolve()
        .then(() => notificationHub.dispatch({
          recipientId: sale.order.customerEmail,
          recipientEmail: sale.order.customerEmail,
          recipientRole: 'traveler',
          type: 'TICKET_ISSUED',
          title: 'Your attraction tickets (resent)',
          message: `${sale.order.quantity} ticket(s) for ${sale.order.attractionName} on ${sale.order.visitDate}. Booking ${sale.order.bookingRef}.`,
          actionUrl: url,
          metadata: {
            bookingRef: sale.order.bookingRef,
            attractionName: sale.order.attractionName,
            visitDate: sale.order.visitDate,
            totalAmount: sale.order.total.toFixed(2),
            currency: sale.order.currency,
            quantity: sale.order.quantity,
            tickets: sale.tickets.map((ticket) => ({
              ticketNo: ticket.ticketNo, type: ticket.ticketTypeName, admissions: ticket.admissionsTotal,
            })),
            title: 'Booking confirmed',
            message: `Your tickets for ${sale.order.attractionName} are ready.`,
            actionUrl: url,
          },
        }))
        .catch((error) => console.warn('[ticket-sales] resend failed:', error.message));

      await T.writeTicketAudit({
        attractionId, actor: email, action: 'order.confirmation-resent',
        entityType: 'order', entityId: orderId, details: { to: sale.order.customerEmail },
      });
      return res.json({ ok: true, message: `Confirmation sent to ${sale.order.customerEmail}` });
    }

    if (action === 'mark-paid') {
      const orderId = T.toInt(body.id || body.orderId, 0);
      const orderRes = await query(`SELECT * FROM bc_ticket_orders WHERE id = $1 AND attraction_id = $2`, [
        orderId, attractionId,
      ]);
      const order = orderRes.rows[0];
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });
      if (order.status === 'confirmed' && order.payment_status === 'paid') {
        return res.json({ ok: true, alreadyConfirmed: true });
      }
      if (['cancelled', 'refunded', 'expired'].includes(order.status)) {
        return res.status(409).json({ ok: false, error: `This booking is ${order.status}` });
      }
      const outcome = await T.finalizeOrder(orderId, {
        paymentRef: T.text(body.paymentRef, 120) || 'offline',
        paymentMethod: T.text(body.paymentMethod, 40) || 'cash',
        actor: email,
      });
      return res.json({
        ok: true,
        order: mapOrder({ ...outcome.order, tickets_total: outcome.tickets.length }),
        tickets: outcome.tickets.map((ticket) => T.publicTicket(ticket)),
      });
    }

    if (action === 'cancel') {
      const orderId = T.toInt(body.id || body.orderId, 0);
      const orderRes = await query(`SELECT * FROM bc_ticket_orders WHERE id = $1 AND attraction_id = $2`, [
        orderId, attractionId,
      ]);
      const order = orderRes.rows[0];
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });
      if (['cancelled', 'refunded', 'partially_refunded'].includes(order.status)) {
        return res.status(409).json({ ok: false, error: `This booking is already ${order.status}` });
      }

      const skipRefund = body.skipRefund === true || body.skipRefund === 'true'
        || body.skipRefund === 1 || body.skipRefund === '1';
      const outcome = await T.cancelOrder({
        order,
        amount: body.amount,
        reason: T.text(body.reason, 500),
        actor: email,
        skipRefund,
      });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });

      return res.json({
        ok: true,
        status: outcome.status,
        refundAmount: outcome.refundAmount,
        refundQuote: outcome.policy,
        message: outcome.refundAmount > 0
          ? `Cancelled and refunded ${order.currency} ${outcome.refundAmount.toFixed(2)}`
          : 'Booking cancelled',
      });
    }

    if (action === 'refund') {
      const orderId = T.toInt(body.id || body.orderId, 0);
      const orderRes = await query(`SELECT * FROM bc_ticket_orders WHERE id = $1 AND attraction_id = $2`, [
        orderId, attractionId,
      ]);
      const order = orderRes.rows[0];
      if (!order) return res.status(404).json({ ok: false, error: 'Booking not found' });

      const outcome = await T.refundOrder({
        order,
        amount: body.amount,
        reason: T.text(body.reason, 300),
        actor: email,
      });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({ ok: true, ...outcome });
    }

    if (action === 'manual-admission') {
      const visitDate = String(body.visitDate || '');
      if (!T.isDateISO(visitDate)) return res.status(400).json({ ok: false, error: 'Choose a valid visit date' });
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return res.status(400).json({ ok: false, error: 'Add at least one ticket type' });

      const customerName = T.text(body.customerName, 120) || 'Walk-in guest';
      const customerEmail = String(body.customerEmail || '').trim().toLowerCase();
      if (customerEmail && !T.validEmail(customerEmail)) {
        return res.status(400).json({ ok: false, error: 'Enter a valid visitor email' });
      }

      const quote = await T.computeQuote({
        attractionId,
        visitDate,
        slotId: T.toInt(body.slotId, 0),
        items,
        promoCode: '',
      });
      if (!quote.ok) return res.status(quote.status || 400).json({ ok: false, error: quote.error });
      const q = quote.quote;

      const types = await T.listTicketTypes(attractionId);
      const typeMap = new Map(types.map((type) => [Number(type.id), type]));
      const calendarRows = await T.getCalendar(attractionId, visitDate, visitDate);

      let order;
      try {
        order = await withTransaction(async (client) => {
          const created = await client.query(
            `INSERT INTO bc_ticket_orders (
               booking_ref, attraction_id, attraction_name, owner_email, customer_name, customer_email,
               customer_phone, visit_date, slot_id, slot_label, subtotal, discount, promo_code,
               tax_amount, service_fee, total, currency, status, payment_status, payment_method,
               admissions_total, quantity_total, notes, channel
             ) VALUES ($1,$2,COALESCE($3, ''),COALESCE($4, ''),$5,$6,COALESCE($7, ''),$8,$9,COALESCE($10, ''),$11,$12,'',$13,$14,0,$15,'pending_payment','unpaid','complimentary',$16,$17,COALESCE($18, ''),'counter')
             RETURNING *`,
            [
              T.newBookingRef(), attractionId, managerAccess.attraction.name || '',
              String(managerAccess.attraction.owner_email || '').toLowerCase(),
              customerName, customerEmail, T.text(body.customerPhone, 40),
              visitDate, q.slotId, q.slotLabel || '',
              q.subtotal, q.subtotal, q.taxAmount, q.serviceFee,
              q.currency, q.admissionsTotal, q.quantityTotal,
              T.text(body.reason || body.notes, 500) || 'Manual admission recorded by staff',
            ]
          );
          const orderRow = created.rows[0];

          for (const line of q.lines) {
            await client.query(
              `INSERT INTO bc_ticket_order_items (
                 order_id, ticket_type_id, ticket_type_name, slot_id, visit_date,
                 unit_price, quantity, admissions_per_unit, line_total
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [
                orderRow.id, line.ticketTypeId, line.name, line.slotId, visitDate,
                line.unitPrice, line.quantity, line.admissions, line.lineTotal,
              ]
            );
          }

          await T.reserveInventory(client, { attractionId, visitDate, lines: q.lines, typeMap, calendarRows });
          return orderRow;
        });
      } catch (error) {
        if (error.code === 'SOLD_OUT') return res.status(409).json({ ok: false, error: error.message });
        throw error;
      }

      const finalized = await T.finalizeOrder(order.id, {
        paymentRef: `manual:${email}`,
        paymentMethod: 'complimentary',
        actor: email,
      });

      await T.writeTicketAudit({
        attractionId, actor: email, action: 'order.manual-admission',
        entityType: 'order', entityId: order.id,
        details: { visitDate, quantity: q.quantityTotal, admissions: q.admissionsTotal, reason: T.text(body.reason, 300) },
      });

      return res.json({
        ok: true,
        order: mapOrder({ ...finalized.order, tickets_total: finalized.tickets.length }),
        tickets: finalized.tickets.map((ticket) => T.publicTicket(ticket)),
      });
    }

    return res.status(400).json({ ok: false, error: 'Unknown ticket sales action' });
  } catch (error) {
    console.error('[attraction-ticket-sales]', error);
    const status = error.status || 500;
    return res.status(status).json({ ok: false, error: error.message || 'Ticket request failed' });
  }
};
