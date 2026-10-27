// api-routes/attraction-ticketing.js
// Attraction owner / staff API: ticket types, inventory, settings, staff,
// promotional codes, overview metrics and reports.
//
// All actions are scoped to an attraction the caller owns or works for; there is
// no wildcard fallback, so an owner can never read or change another listing.

const { query, isDbConfigured, initDb, withTransaction } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { verifyRequestBearer } = require('../lib/google-verify');
const T = require('../lib/ticketing');

const MAX_RANGE_DAYS = 400;

function dayStart(value, fallback) {
  return T.isDateISO(value) ? value : fallback;
}

function defaultFrom() {
  return T.addDaysISO(T.isoToday(), -30);
}

function defaultTo() {
  return T.isoToday();
}

function clampRange(from, to) {
  const start = dayStart(from, defaultFrom());
  let end = dayStart(to, defaultTo());
  if (end < start) end = start;
  const maxEnd = T.addDaysISO(start, MAX_RANGE_DAYS);
  return { from: start, to: end > maxEnd ? maxEnd : end };
}

function csvCell(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function toCsv(rows, columns) {
  const head = columns.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(','));
  return [head, ...body].join('\n');
}

async function requireAccess(email, attractionId, need) {
  const access = await T.resolveAccess(email, attractionId);
  if (!access.ok) return access;
  if (!T.roleAllows(access.role, need)) {
    return { ok: false, status: 403, error: `This action requires the ${need} role` };
  }
  return access;
}

// ─── Overview ────────────────────────────────────────────────────────────────

async function loadOverview(attractionId, { from, to, ticketTypeId }) {
  const params = [attractionId, from, to];
  let typeFilter = '';
  if (ticketTypeId) {
    params.push(ticketTypeId);
    typeFilter = ` AND EXISTS (SELECT 1 FROM bc_ticket_order_items i WHERE i.order_id = o.id AND i.ticket_type_id = $4)`;
  }

  const statsRes = await query(
    `SELECT
       COUNT(*)::int AS total_orders,
       COALESCE(SUM(o.quantity_total) FILTER (WHERE o.payment_status = 'paid'), 0)::int AS tickets_sold,
       COALESCE(SUM(o.quantity_total) FILTER (WHERE o.payment_status = 'paid' AND o.created_at::date = CURRENT_DATE), 0)::int AS tickets_today,
       COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid'), 0)::numeric AS revenue,
       COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'unpaid'), 0)::numeric AS pending_payments,
       COALESCE(SUM(o.service_fee) FILTER (WHERE o.payment_status = 'paid'), 0)::numeric AS service_fees,
       COALESCE(SUM(o.tax_amount) FILTER (WHERE o.payment_status = 'paid'), 0)::numeric AS taxes,
       COALESCE(SUM(o.refund_amount), 0)::numeric AS refunded,
       COUNT(*) FILTER (WHERE o.status = 'confirmed')::int AS confirmed_bookings,
       COUNT(*) FILTER (WHERE o.status IN ('cancelled', 'refunded', 'partially_refunded'))::int AS cancelled_bookings,
       COUNT(*) FILTER (WHERE o.status = 'pending_payment')::int AS pending_bookings,
       COALESCE(SUM(o.admissions_total) FILTER (WHERE o.payment_status = 'paid'), 0)::int AS admissions_sold
     FROM bc_ticket_orders o
     WHERE o.attraction_id = $1
       AND o.created_at >= $2::date
       AND o.created_at < ($3::date + INTERVAL '1 day')${typeFilter}`,
    params
  );

  // Admissions actually used live on the individual tickets, not the order header.
  const checkedInRes = await query(
    `SELECT COALESCE(SUM(t.admissions_used), 0)::int AS checked_in
       FROM bc_attraction_tickets t
       JOIN bc_ticket_orders o ON o.id = t.order_id
      WHERE o.attraction_id = $1
        AND o.payment_status = 'paid'
        AND o.created_at >= $2::date
        AND o.created_at < ($3::date + INTERVAL '1 day')${typeFilter}`,
    params
  );

  const remainingRes = await query(
    `SELECT COALESCE(SUM(GREATEST(0, capacity - sold - reserved)), 0)::int AS remaining,
            COALESCE(SUM(sold), 0)::int AS sold,
            COALESCE(SUM(reserved), 0)::int AS reserved
       FROM bc_ticket_inventory
      WHERE attraction_id = $1 AND visit_date >= CURRENT_DATE AND capacity > 0`,
    [attractionId]
  );

  const recentRes = await query(
    `SELECT o.id, o.booking_ref, o.customer_name, o.customer_email, o.visit_date, o.slot_label,
            o.quantity_total, o.total, o.currency, o.status, o.payment_status, o.created_at,
            (SELECT STRING_AGG(DISTINCT i.ticket_type_name, ', ') FROM bc_ticket_order_items i WHERE i.order_id = o.id) AS ticket_types
       FROM bc_ticket_orders o
      WHERE o.attraction_id = $1
      ORDER BY o.created_at DESC
      LIMIT 8`,
    [attractionId]
  );

  const upcomingRes = await query(
    `SELECT o.id, o.booking_ref, o.customer_name, o.visit_date, o.slot_label,
            o.quantity_total, o.admissions_total,
            COALESCE((SELECT SUM(t.admissions_used) FROM bc_attraction_tickets t WHERE t.order_id = o.id), 0)::int AS admissions_used,
            o.status, o.currency, o.total
       FROM bc_ticket_orders o
      WHERE o.attraction_id = $1 AND o.status = 'confirmed' AND o.visit_date >= CURRENT_DATE
      ORDER BY o.visit_date ASC, o.slot_label ASC
      LIMIT 6`,
    [attractionId]
  );

  const validationsRes = await query(
    `SELECT id, ticket_number, action_performed, result, rejection_reason, validated_by_name,
            validated_by_email, guest_name, created_at
       FROM bc_ticket_validations
      WHERE operator_type = 'attraction' AND service_id = $1::text
      ORDER BY created_at DESC
      LIMIT 8`,
    [String(attractionId)]
  );

  const seriesRes = await query(
    `SELECT o.created_at::date AS day,
            COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid'), 0)::numeric AS revenue,
            COALESCE(SUM(o.quantity_total) FILTER (WHERE o.payment_status = 'paid'), 0)::int AS tickets
       FROM bc_ticket_orders o
      WHERE o.attraction_id = $1 AND o.created_at >= $2::date AND o.created_at < ($3::date + INTERVAL '1 day')
      GROUP BY 1 ORDER BY 1 ASC`,
    [attractionId, from, to]
  );

  const stats = statsRes.rows[0] || {};
  const totalRevenue = Number(stats.revenue || 0);
  const refunded = Number(stats.refunded || 0);

  return {
    stats: {
      ticketsSold: Number(stats.tickets_sold || 0),
      ticketsToday: Number(stats.tickets_today || 0),
      revenue: totalRevenue,
      netRevenue: T.round2(totalRevenue - refunded - Number(stats.service_fees || 0)),
      serviceFees: Number(stats.service_fees || 0),
      taxes: Number(stats.taxes || 0),
      pendingPayments: Number(stats.pending_payments || 0),
      pendingBookings: Number(stats.pending_bookings || 0),
      confirmedBookings: Number(stats.confirmed_bookings || 0),
      cancelledBookings: Number(stats.cancelled_bookings || 0),
      refunded,
      visitorsCheckedIn: Number(checkedInRes.rows[0]?.checked_in || 0),
      admissionsSold: Number(stats.admissions_sold || 0),
      ticketsRemaining: Number(remainingRes.rows[0]?.remaining || 0),
      ticketsSoldAllTime: Number(remainingRes.rows[0]?.sold || 0),
      ticketsReserved: Number(remainingRes.rows[0]?.reserved || 0),
      totalOrders: Number(stats.total_orders || 0),
    },
    recentSales: recentRes.rows.map((row) => ({
      id: row.id,
      bookingRef: row.booking_ref,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      visitDate: T.isoDate(row.visit_date),
      slotLabel: row.slot_label,
      quantity: Number(row.quantity_total),
      total: Number(row.total),
      currency: row.currency,
      status: row.status,
      paymentStatus: row.payment_status,
      ticketTypes: row.ticket_types || '',
      createdAt: row.created_at,
    })),
    upcomingVisits: upcomingRes.rows.map((row) => ({
      id: row.id,
      bookingRef: row.booking_ref,
      customerName: row.customer_name,
      visitDate: T.isoDate(row.visit_date),
      slotLabel: row.slot_label,
      quantity: Number(row.quantity_total),
      admissionsTotal: Number(row.admissions_total),
      admissionsUsed: Number(row.admissions_used),
      total: Number(row.total),
      currency: row.currency,
    })),
    recentValidations: validationsRes.rows.map((row) => ({
      id: row.id,
      ticketNumber: row.ticket_number,
      action: row.action_performed,
      result: row.result,
      reason: row.rejection_reason,
      staff: row.validated_by_name || row.validated_by_email,
      guestName: row.guest_name,
      createdAt: row.created_at,
    })),
    series: seriesRes.rows.map((row) => ({
      day: T.isoDate(row.day),
      revenue: Number(row.revenue),
      tickets: Number(row.tickets),
    })),
    range: { from, to },
  };
}

// ─── Reports ─────────────────────────────────────────────────────────────────

async function loadReports(attractionId, { from, to }) {
  const [byType, byDay, bySlot, admissions, unused, promo, cancellations] = await Promise.all([
    query(
      `SELECT i.ticket_type_name AS label,
              SUM(i.quantity)::int AS tickets,
              SUM(i.line_total)::numeric AS gross,
              SUM(i.admissions_per_unit * i.quantity)::int AS admissions
         FROM bc_ticket_order_items i
         JOIN bc_ticket_orders o ON o.id = i.order_id
        WHERE o.attraction_id = $1 AND o.payment_status = 'paid'
          AND o.created_at >= $2::date AND o.created_at < ($3::date + INTERVAL '1 day')
        GROUP BY 1 ORDER BY gross DESC`,
      [attractionId, from, to]
    ),
    query(
      `SELECT o.created_at::date AS label,
              SUM(o.quantity_total)::int AS tickets,
              SUM(o.total)::numeric AS gross,
              SUM(o.refund_amount)::numeric AS refunds,
              SUM(o.service_fee)::numeric AS fees,
              SUM(o.tax_amount)::numeric AS taxes
         FROM bc_ticket_orders o
        WHERE o.attraction_id = $1 AND o.payment_status IN ('paid', 'partially_refunded', 'refunded')
          AND o.created_at >= $2::date AND o.created_at < ($3::date + INTERVAL '1 day')
        GROUP BY 1 ORDER BY 1 ASC`,
      [attractionId, from, to]
    ),
    query(
      `SELECT CASE WHEN i.slot_id = 0 THEN 'No time slot' ELSE COALESCE(NULLIF(o.slot_label, ''), 'Slot') END AS label,
              SUM(i.quantity)::int AS tickets,
              SUM(i.line_total)::numeric AS gross
         FROM bc_ticket_order_items i
         JOIN bc_ticket_orders o ON o.id = i.order_id
        WHERE o.attraction_id = $1 AND o.payment_status = 'paid'
          AND o.created_at >= $2::date AND o.created_at < ($3::date + INTERVAL '1 day')
        GROUP BY 1 ORDER BY gross DESC`,
      [attractionId, from, to]
    ),
    query(
      `SELECT t.visit_date AS label,
              SUM(t.admissions_total)::int AS admissions,
              SUM(t.admissions_used)::int AS checked_in
         FROM bc_attraction_tickets t
         JOIN bc_ticket_orders o ON o.id = t.order_id
        WHERE t.attraction_id = $1 AND o.payment_status = 'paid' AND t.status <> 'cancelled'
          AND t.visit_date BETWEEN $2::date AND $3::date
        GROUP BY 1 ORDER BY 1 ASC`,
      [attractionId, from, to]
    ),
    query(
      `SELECT COUNT(*)::int AS unused,
              COALESCE(SUM(t.admissions_total - t.admissions_used), 0)::int AS unused_admissions
         FROM bc_attraction_tickets t
        WHERE t.attraction_id = $1 AND t.status = 'valid'
          AND t.visit_date < CURRENT_DATE AND t.admissions_used < t.admissions_total`,
      [attractionId]
    ),
    query(
      `SELECT COALESCE(NULLIF(o.promo_code, ''), 'No promo') AS label,
              COUNT(*)::int AS orders,
              SUM(o.discount)::numeric AS discount,
              SUM(o.total)::numeric AS revenue
         FROM bc_ticket_orders o
        WHERE o.attraction_id = $1 AND o.payment_status = 'paid'
          AND o.created_at >= $2::date AND o.created_at < ($3::date + INTERVAL '1 day')
        GROUP BY 1 ORDER BY revenue DESC`,
      [attractionId, from, to]
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE o.status IN ('cancelled', 'refunded', 'partially_refunded'))::int AS cancelled,
              COUNT(*)::int AS total,
              COALESCE(SUM(o.refund_amount), 0)::numeric AS refunded
         FROM bc_ticket_orders o
        WHERE o.attraction_id = $1
          AND o.created_at >= $2::date AND o.created_at < ($3::date + INTERVAL '1 day')`,
      [attractionId, from, to]
    ),
  ]);

  const cancel = cancellations.rows[0] || {};
  return {
    range: { from, to },
    byTicketType: byType.rows.map((row) => ({
      label: row.label, tickets: Number(row.tickets), gross: Number(row.gross), admissions: Number(row.admissions),
    })),
    byDay: byDay.rows.map((row) => ({
      label: T.isoDate(row.label),
      tickets: Number(row.tickets),
      gross: Number(row.gross),
      refunds: Number(row.refunds),
      fees: Number(row.fees),
      taxes: Number(row.taxes),
    })),
    bySlot: bySlot.rows.map((row) => ({ label: row.label, tickets: Number(row.tickets), gross: Number(row.gross) })),
    admissionsByVisitDate: admissions.rows.map((row) => ({
      label: T.isoDate(row.label),
      admissions: Number(row.admissions),
      checkedIn: Number(row.checked_in),
    })),
    unusedTickets: {
      tickets: Number(unused.rows[0]?.unused || 0),
      admissions: Number(unused.rows[0]?.unused_admissions || 0),
    },
    promos: promo.rows.map((row) => ({
      label: row.label, orders: Number(row.orders), discount: Number(row.discount), revenue: Number(row.revenue),
    })),
    cancellations: {
      cancelled: Number(cancel.cancelled || 0),
      total: Number(cancel.total || 0),
      refunded: Number(cancel.refunded || 0),
      rate: Number(cancel.total) > 0 ? T.round2((Number(cancel.cancelled) / Number(cancel.total)) * 100) : 0,
    },
  };
}

// ─── Inventory snapshot ──────────────────────────────────────────────────────

async function loadInventory(attractionId, from, to) {
  const types = await T.listTicketTypes(attractionId);
  const calendar = await T.getCalendar(attractionId, from, to);
  const invRes = await query(
    `SELECT ticket_type_id, visit_date, slot_id, capacity, sold, reserved
       FROM bc_ticket_inventory
      WHERE attraction_id = $1 AND visit_date BETWEEN $2 AND $3
      ORDER BY visit_date ASC`,
    [attractionId, from, to]
  );
  const settings = await T.getSettings(attractionId);

  const rows = invRes.rows.map((row) => ({
    ticketTypeId: row.ticket_type_id,
    date: T.isoDate(row.visit_date),
    slotId: Number(row.slot_id),
    capacity: Number(row.capacity),
    sold: Number(row.sold),
    reserved: Number(row.reserved),
    available: Math.max(0, Number(row.capacity) - Number(row.sold) - Number(row.reserved)),
  }));

  return {
    types,
    settings: {
      salesPaused: Boolean(settings.sales_paused),
      advanceBookingDays: Number(settings.advance_booking_days),
      minLeadHours: Number(settings.min_lead_hours),
      currency: settings.currency,
    },
    calendar: calendar.map((row) => ({
      id: row.id,
      ticketTypeId: Number(row.ticket_type_id),
      date: T.isoDate(row.visit_date),
      kind: row.kind,
      closed: row.closed,
      price: row.price === null ? null : Number(row.price),
      capacity: row.capacity === null ? null : Number(row.capacity),
      note: row.note,
    })),
    inventory: rows,
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

module.exports = async function attractionTicketingHandler(req, res) {
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
    console.warn('[attraction-ticketing] DB unavailable:', error.message);
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
    // ── Attractions the caller can manage ──
    if (action === 'attractions') {
      const attractions = await T.listAccessibleAttractions(email);
      return res.json({ ok: true, attractions });
    }

    if (!attractionId) return res.status(400).json({ ok: false, error: 'attractionId is required' });

    // ── Overview ──
    if (action === 'overview') {
      const access = await requireAccess(email, attractionId, 'scanner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const range = clampRange(body.from, body.to);
      const data = await loadOverview(attractionId, { ...range, ticketTypeId: T.toInt(body.ticketTypeId, 0) });
      return res.json({ ok: true, ...data, role: access.role, attraction: access.attraction });
    }

    // ── Ticket types ──
    if (action === 'ticket-types') {
      const access = await requireAccess(email, attractionId, 'scanner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const ticketTypes = await T.listTicketTypes(attractionId, { includeArchived: String(body.includeArchived || '') === '1' });
      const settings = await T.getSettings(attractionId);
      return res.json({ ok: true, ticketTypes, role: access.role, currency: settings.currency, categories: T.TICKET_CATEGORIES });
    }

    if (action === 'save-ticket-type') {
      const access = await requireAccess(email, attractionId, 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const payload = body.ticketType || body.data || {};
      const saved = await T.saveTicketType(attractionId, email, payload, body.id ? T.toInt(body.id) : null);
      if (!saved.ok) return res.status(saved.status || 400).json({ ok: false, error: saved.error });

      // Slots are replaced whenever the type requires entry times.
      if (Array.isArray(payload.slots)) {
        await withTransaction(async (client) => {
          await T.replaceSlots(client, attractionId, saved.ticketType.id, payload.slots);
        });
      }
      await T.writeTicketAudit({
        attractionId, actor: email,
        action: body.id ? 'ticket-type.updated' : 'ticket-type.created',
        entityType: 'ticket_type', entityId: saved.ticketType.id, details: { name: saved.ticketType.name },
      });
      const ticketTypes = await T.listTicketTypes(attractionId);
      return res.json({ ok: true, ticketType: ticketTypes.find((type) => type.id === saved.ticketType.id) || saved.ticketType });
    }

    if (action === 'duplicate-ticket-type') {
      const access = await requireAccess(email, attractionId, 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const sourceRes = await query(`SELECT * FROM bc_ticket_types WHERE id = $1 AND attraction_id = $2`, [
        T.toInt(body.id), attractionId,
      ]);
      const source = sourceRes.rows[0];
      if (!source) return res.status(404).json({ ok: false, error: 'Ticket type not found' });

      const created = await T.saveTicketType(attractionId, email, {
        ...T.mapType(source),
        name: `${source.name} (copy)`,
        status: 'inactive',
      });
      if (!created.ok) return res.status(400).json({ ok: false, error: created.error });

      await withTransaction(async (client) => {
        const slots = await client.query(`SELECT * FROM bc_ticket_slots WHERE ticket_type_id = $1`, [source.id]);
        await T.replaceSlots(client, attractionId, created.ticketType.id, slots.rows.map((slot) => ({
          label: slot.label, startTime: slot.start_time, endTime: slot.end_time, capacity: slot.capacity,
        })));
      });
      await T.writeTicketAudit({
        attractionId, actor: email, action: 'ticket-type.duplicated',
        entityType: 'ticket_type', entityId: created.ticketType.id, details: { sourceId: source.id },
      });
      return res.json({ ok: true, ticketType: created.ticketType });
    }

    if (action === 'set-ticket-type-status') {
      const access = await requireAccess(email, attractionId, 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const status = String(body.status || '');
      if (!['active', 'inactive', 'archived'].includes(status)) {
        return res.status(400).json({ ok: false, error: 'Invalid status' });
      }
      const result = await query(
        `UPDATE bc_ticket_types SET status = $3, updated_at = NOW()
          WHERE id = $1 AND attraction_id = $2 RETURNING *`,
        [T.toInt(body.id), attractionId, status]
      );
      if (!result.rows.length) return res.status(404).json({ ok: false, error: 'Ticket type not found' });
      await T.writeTicketAudit({
        attractionId, actor: email, action: `ticket-type.${status}`,
        entityType: 'ticket_type', entityId: body.id,
      });
      return res.json({ ok: true, ticketType: T.mapType(result.rows[0]) });
    }

    // ── Inventory ──
    if (action === 'inventory') {
      const access = await requireAccess(email, attractionId, 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const from = dayStart(body.from, T.isoToday());
      const to = dayStart(body.to, T.addDaysISO(T.isoToday(), 30));
      const data = await loadInventory(attractionId, from, to);
      return res.json({ ok: true, ...data, role: access.role, from, to });
    }

    if (action === 'save-inventory') {
      const access = await requireAccess(email, attractionId, 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const visitDate = String(body.date || '');
      if (!T.isDateISO(visitDate)) return res.status(400).json({ ok: false, error: 'Choose a valid date' });
      if (visitDate < T.isoToday()) return res.status(400).json({ ok: false, error: 'Cannot edit inventory for a past date' });

      const ticketTypeId = T.toInt(body.ticketTypeId, 0);
      if (ticketTypeId) {
        const ownsType = await query(`SELECT id FROM bc_ticket_types WHERE id = $1 AND attraction_id = $2`, [
          ticketTypeId, attractionId,
        ]);
        if (!ownsType.rows.length) return res.status(404).json({ ok: false, error: 'Ticket type not found' });
      }

      const kind = ['blackout', 'price', 'capacity'].includes(body.kind) ? body.kind : 'capacity';
      const capacity = body.capacity === undefined || body.capacity === '' ? null : Math.max(0, T.toInt(body.capacity));
      const price = body.price === undefined || body.price === '' ? null : Math.max(0, T.toMoney(body.price));
      const closed = body.closed === undefined ? kind === 'blackout' : Boolean(body.closed);

      // Guard: never reduce capacity below what is already sold or held.
      if (kind === 'capacity' && capacity !== null) {
        const soldRes = await query(
          `SELECT COALESCE(MAX(sold + reserved), 0)::int AS committed
             FROM bc_ticket_inventory
            WHERE attraction_id = $1 AND visit_date = $2 AND ($3 = 0 OR ticket_type_id = $3)`,
          [attractionId, visitDate, ticketTypeId]
        );
        const committed = Number(soldRes.rows[0]?.committed || 0);
        if (capacity < committed) {
          return res.status(409).json({
            ok: false,
            error: `Capacity cannot be lower than ${committed} already sold or held tickets`,
          });
        }
      }

      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO bc_ticket_calendar (attraction_id, ticket_type_id, visit_date, kind, closed, price, capacity, note, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, ''),COALESCE($9, ''))
           ON CONFLICT (attraction_id, ticket_type_id, visit_date, kind)
           DO UPDATE SET closed = $5, price = $6, capacity = $7, note = COALESCE($8, ''), created_by = COALESCE($9, '')`,
          [
            attractionId, ticketTypeId, visitDate, kind, closed, price, capacity,
            T.text(body.note, 300), email,
          ]
        );

        if (kind === 'capacity' && capacity !== null) {
          // Apply to every future inventory row for the affected scope.
          if (ticketTypeId) {
            await client.query(
              `UPDATE bc_ticket_inventory SET capacity = $3, updated_at = NOW()
                WHERE attraction_id = $1 AND visit_date = $2 AND ticket_type_id = $4 AND slot_id = 0`,
              [attractionId, visitDate, capacity, ticketTypeId]
            );
          } else {
            await client.query(
              `UPDATE bc_ticket_inventory SET capacity = $3, updated_at = NOW()
                WHERE attraction_id = $1 AND visit_date = $2 AND slot_id = 0`,
              [attractionId, visitDate, capacity]
            );
          }
        }
      });

      await T.writeTicketAudit({
        attractionId, actor: email, action: `inventory.${kind}`,
        entityType: 'calendar', entityId: `${visitDate}:${ticketTypeId}`,
        details: { capacity, price, closed },
      });
      return res.json({ ok: true });
    }

    if (action === 'clear-inventory-rule') {
      const access = await requireAccess(email, attractionId, 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      await query(
        `DELETE FROM bc_ticket_calendar WHERE id = $1 AND attraction_id = $2`,
        [T.toInt(body.id), attractionId]
      );
      await T.writeTicketAudit({
        attractionId, actor: email, action: 'inventory.rule-cleared', entityType: 'calendar', entityId: body.id,
      });
      return res.json({ ok: true });
    }

    if (action === 'pause-sales') {
      const access = await requireAccess(email, attractionId, 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const settings = await T.saveSettings(attractionId, {
        ...(await T.getSettings(attractionId)),
        sales_paused: Boolean(body.paused),
      });
      await T.writeTicketAudit({
        attractionId, actor: email, action: body.paused ? 'sales.paused' : 'sales.resumed', entityType: 'settings',
      });
      return res.json({ ok: true, salesPaused: Boolean(settings.sales_paused) });
    }

    // ── Reports ──
    if (action === 'reports') {
      const access = await requireAccess(email, attractionId, 'scanner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const range = clampRange(body.from, body.to);
      const reports = await loadReports(attractionId, range);
      return res.json({ ok: true, ...reports });
    }

    if (action === 'export') {
      const access = await requireAccess(email, attractionId, 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const range = clampRange(body.from, body.to);
      const reports = await loadReports(attractionId, range);
      const report = String(body.report || 'daily');

      let rows = [];
      let columns = [];
      if (report === 'ticket-type') {
        rows = reports.byTicketType;
        columns = [
          { key: 'label', label: 'Ticket type' },
          { key: 'tickets', label: 'Tickets sold' },
          { key: 'admissions', label: 'Admissions' },
          { key: 'gross', label: 'Gross sales' },
        ];
      } else if (report === 'slot') {
        rows = reports.bySlot;
        columns = [
          { key: 'label', label: 'Entry time' },
          { key: 'tickets', label: 'Tickets sold' },
          { key: 'gross', label: 'Gross sales' },
        ];
      } else if (report === 'promo') {
        rows = reports.promos;
        columns = [
          { key: 'label', label: 'Promo code' },
          { key: 'orders', label: 'Orders' },
          { key: 'discount', label: 'Discount' },
          { key: 'revenue', label: 'Net revenue' },
        ];
      } else if (report === 'admissions') {
        rows = reports.admissionsByVisitDate;
        columns = [
          { key: 'label', label: 'Visit date' },
          { key: 'admissions', label: 'Admissions' },
          { key: 'checkedIn', label: 'Checked in' },
        ];
      } else {
        rows = reports.byDay;
        columns = [
          { key: 'label', label: 'Sale date' },
          { key: 'tickets', label: 'Tickets' },
          { key: 'gross', label: 'Gross sales' },
          { key: 'refunds', label: 'Refunds' },
          { key: 'fees', label: 'Fees' },
          { key: 'taxes', label: 'Taxes' },
        ];
      }

      const csv = toCsv(rows, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ticket-${report}-${range.from}-to-${range.to}.csv"`);
      return res.status(200).send(csv);
    }

    // ── Settings ──
    if (action === 'settings') {
      const access = await requireAccess(email, attractionId, 'scanner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const settings = await T.getSettings(attractionId);
      return res.json({ ok: true, settings, role: access.role });
    }

    if (action === 'save-settings') {
      const access = await requireAccess(email, attractionId, 'owner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const settings = await T.saveSettings(attractionId, body.settings || body.data || {});
      await T.writeTicketAudit({
        attractionId, actor: email, action: 'settings.updated', entityType: 'settings',
        details: { tax: settings.tax_percent, fee: settings.service_fee_percent },
      });
      return res.json({ ok: true, settings });
    }

    // ── Staff ──
    if (action === 'staff') {
      const access = await requireAccess(email, attractionId, 'scanner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const result = await query(
        `SELECT id, email, name, role, status, created_at FROM bc_ticket_staff
          WHERE attraction_id = $1 ORDER BY created_at ASC`,
        [attractionId]
      );
      return res.json({ ok: true, staff: result.rows, role: access.role });
    }

    if (action === 'save-staff') {
      const access = await requireAccess(email, attractionId, 'owner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const staffEmail = String(body.email || '').trim().toLowerCase();
      if (!T.validEmail(staffEmail)) return res.status(400).json({ ok: false, error: 'A valid staff email is required' });
      if (staffEmail === String(access.attraction.owner_email || '').toLowerCase()) {
        return res.status(400).json({ ok: false, error: 'The owner already has full access' });
      }
      const role = T.STAFF_ROLES.includes(body.role) ? body.role : 'scanner';
      const result = await query(
        `INSERT INTO bc_ticket_staff (attraction_id, email, name, role, status, invited_by)
         VALUES ($1,$2,COALESCE($3, ''),$4,'active',COALESCE($5, ''))
         ON CONFLICT (attraction_id, email)
         DO UPDATE SET name = COALESCE($3, ''), role = $4, status = 'active'
         RETURNING id, email, name, role, status, created_at`,
        [attractionId, staffEmail, T.text(body.name, 120), role, email]
      );
      await T.writeTicketAudit({
        attractionId, actor: email, action: 'staff.granted', entityType: 'staff',
        entityId: staffEmail, details: { role },
      });
      return res.json({ ok: true, staff: result.rows[0] });
    }

    if (action === 'remove-staff') {
      const access = await requireAccess(email, attractionId, 'owner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      await query(`DELETE FROM bc_ticket_staff WHERE attraction_id = $1 AND id = $2`, [
        attractionId, T.toInt(body.id),
      ]);
      await T.writeTicketAudit({
        attractionId, actor: email, action: 'staff.revoked', entityType: 'staff', entityId: body.id,
      });
      return res.json({ ok: true });
    }

    // ── Promo codes ──
    if (action === 'promos') {
      const access = await requireAccess(email, attractionId, 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const result = await query(
        `SELECT * FROM bc_ticket_promos WHERE attraction_id = $1 ORDER BY created_at DESC`,
        [attractionId]
      );
      return res.json({ ok: true, promos: result.rows });
    }

    if (action === 'save-promo') {
      const access = await requireAccess(email, attractionId, 'owner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const code = String(body.code || '').trim().toUpperCase().slice(0, 40);
      if (code.length < 3) return res.status(400).json({ ok: false, error: 'Promo code must be at least 3 characters' });
      const percent = Math.min(100, Math.max(0, T.toMoney(body.percentOff, 0)));
      const amount = Math.max(0, T.toMoney(body.amountOff, 0));
      if (!percent && !amount) return res.status(400).json({ ok: false, error: 'Set a percentage or a fixed discount' });

      const result = await query(
        `INSERT INTO bc_ticket_promos (attraction_id, code, description, percent_off, amount_off, max_redemptions, starts_at, ends_at, status)
         VALUES ($1,$2,COALESCE($3, ''),$4,$5,$6,$7,$8,$9)
         ON CONFLICT (attraction_id, code)
         DO UPDATE SET description = COALESCE($3, ''), percent_off = $4, amount_off = $5, max_redemptions = $6,
                       starts_at = $7, ends_at = $8, status = $9
         RETURNING *`,
        [
          attractionId, code, T.text(body.description, 200), percent, amount,
          Math.max(0, T.toInt(body.maxRedemptions, 0)),
          T.isDateISO(body.startsAt) ? body.startsAt : null,
          T.isDateISO(body.endsAt) ? body.endsAt : null,
          body.status === 'inactive' ? 'inactive' : 'active',
        ]
      );
      await T.writeTicketAudit({
        attractionId, actor: email, action: 'promo.saved', entityType: 'promo', entityId: code,
      });
      return res.json({ ok: true, promo: result.rows[0] });
    }

    if (action === 'delete-promo') {
      const access = await requireAccess(email, attractionId, 'owner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      await query(`DELETE FROM bc_ticket_promos WHERE attraction_id = $1 AND id = $2`, [
        attractionId, T.toInt(body.id),
      ]);
      await T.writeTicketAudit({
        attractionId, actor: email, action: 'promo.deleted', entityType: 'promo', entityId: body.id,
      });
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Unknown ticketing action' });
  } catch (error) {
    console.error('[attraction-ticketing]', error);
    const status = error.status || 500;
    return res.status(status).json({ ok: false, error: error.message || 'Ticketing request failed' });
  }
};
