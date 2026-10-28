// api-routes/attraction-pos.js
// Physical ticket office: batches, printing, point of sale, cashier shifts,
// receipts and reconciliation.
//
// This route is the only door into physical ticketing. Every action resolves the
// caller's attraction access first, then checks the POS permission it needs, so
// a cashier can sell without also being able to refund, void or read reports.
//
// Physical tickets themselves live in bc_attraction_tickets and POS sales in
// bc_ticket_orders (channel='pos'), which is what keeps on-site and online
// sales on the same inventory counters.

const { query, isDbConfigured, initDb, writeAudit } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { verifyRequestBearer } = require('../lib/google-verify');
const { requireAdminEmail } = require('../lib/admin');
const T = require('../lib/ticketing');
const P = require('../lib/physical-ticketing');
const B = require('../lib/ticket-branding');

const CASHIER_ROLES = ['scanner', 'manager'];

async function requireAccess(email, attractionId, need = 'scanner') {
  const access = await T.resolveAccess(email, attractionId);
  if (!access.ok) return access;
  if (!T.roleAllows(access.role, need)) {
    return { ok: false, status: 403, error: `This action requires the ${need} role` };
  }
  return access;
}

/**
 * Resolve access and assert a POS permission on top of it. Owners always pass;
 * staff need the permission flag stored on their account.
 */
async function requirePermission(email, attractionId, permission, need = 'scanner') {
  const access = await requireAccess(email, attractionId, need);
  if (!access.ok) return access;
  if (!P.can(access, permission)) {
    return {
      ok: false,
      status: 403,
      error: `Your account is not allowed to ${permission === 'viewAllSales' ? 'view every cashier’s sales' : permission} tickets`,
    };
  }
  return access;
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header, rows) {
  return [header.join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\n');
}

async function openShiftFor(attractionId, email) {
  return P.getOpenShift(attractionId, email);
}

/** Compact batch list used by the POS and print screens. */
async function batchOptions(attractionId, visitDate) {
  const res = await query(
    `SELECT b.id, b.batch_ref, b.name, b.ticket_type_id, b.ticket_type_name, b.slot_id,
            b.slot_label, b.visit_date, b.unit_price, b.currency, b.admissions, b.status,
            (SELECT COUNT(*)::int FROM bc_attraction_tickets t
              WHERE t.batch_id = b.id AND t.status = 'available' AND t.visit_date = $2::date) AS available,
            (SELECT COUNT(*)::int FROM bc_attraction_tickets t
              WHERE t.batch_id = b.id AND t.status = 'available') AS stock
       FROM bc_ticket_batches b
      WHERE b.attraction_id = $1 AND b.status IN ('open', 'closed')
      ORDER BY b.created_at DESC
      LIMIT 60`,
    [T.toInt(attractionId, 0), visitDate]
  );
  return res.rows.map((row) => ({
    id: row.id,
    batchRef: row.batch_ref,
    name: row.name,
    ticketTypeId: row.ticket_type_id,
    ticketTypeName: row.ticket_type_name,
    slotId: Number(row.slot_id || 0),
    slotLabel: row.slot_label,
    visitDate: T.isoDate(row.visit_date),
    unitPrice: Number(row.unit_price || 0),
    currency: row.currency,
    admissions: Number(row.admissions || 1),
    status: row.status,
    availableForDate: Number(row.available || 0),
    stock: Number(row.stock || 0),
  }));
}

module.exports = async function attractionPosHandler(req, res) {
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
    console.warn('[attraction-pos] DB unavailable:', error.message);
  }
  if (!dbReady) {
    return res.status(503).json({ ok: false, error: 'Physical ticketing requires the database. Run the migrations first.' });
  }

  const auth = await verifyRequestBearer(req);
  if (!auth.ok) return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'Authentication required' });
  const email = String(auth.email || '').toLowerCase();

  const body = req.method === 'GET' ? req.query : (req.body || {});
  const action = String(body.action || req.query.action || '').toLowerCase();
  const attractionId = T.toInt(body.attractionId || req.query.attractionId, 0);

  try {
    // ── Platform ticket artwork (administrator only, no attraction scope) ─────
    // This is the company panel printed on every ticket, so it is edited once
    // for the whole platform rather than per attraction.
    if (action === 'branding' || action === 'save-branding') {
      const admin = await requireAdminEmail(req);
      if (!admin.ok) return res.status(admin.status || 403).json({ ok: false, error: admin.error });

      if (action === 'branding') {
        return res.json({ ok: true, branding: await B.getBranding() });
      }

      const branding = await B.saveBranding(body, admin.email);
      writeAudit({ type: 'ticket.branding-saved', actor: admin.email, branding: { ...branding, updatedAt: undefined } });
      return res.json({ ok: true, branding });
    }

    if (!attractionId) return res.status(400).json({ ok: false, error: 'attractionId is required' });

    // ── Everything a ticket-office screen needs to render ────────────────────
    if (action === 'context') {
      const access = await requirePermission(email, attractionId, 'sell');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

      const visitDate = T.isDateISO(body.visitDate) ? body.visitDate : T.isoToday();
      const [settings, types, availability, shift, batches, company] = await Promise.all([
        T.getSettings(attractionId),
        T.listTicketTypes(attractionId),
        T.getAvailability(attractionId, visitDate),
        openShiftFor(attractionId, email),
        batchOptions(attractionId, visitDate),
        B.getBranding(),
      ]);

      return res.json({
        ok: true,
        role: access.role,
        permissions: P.permissionsFor(access),
        attraction: {
          id: access.attraction.id,
          name: access.attraction.name,
          city: access.attraction.city,
          country: access.attraction.country,
          currency: settings.currency || access.attraction.currency || 'USD',
          logoUrl: settings.ticket_logo_url || '',
          contact: settings.ticket_contact || '',
          terms: settings.ticket_terms || settings.terms || '',
          artworkUrl: settings.ticket_artwork_url || '',
          artworkFit: settings.ticket_artwork_fit || 'cover',
        },
        // Platform artwork printed on every ticket, managed from the admin panel.
        company,
        settings: {
          posEnabled: settings.pos_enabled !== false,
          taxPercent: Number(settings.tax_percent || 0),
          serviceFeePercent: Number(settings.service_fee_percent || 0),
          salesPaused: Boolean(settings.sales_paused),
          printLayout: settings.print_layout || 'a4_4',
          paperSize: settings.paper_size || 'A4',
          receiptHeader: settings.receipt_header || '',
          receiptFooter: settings.receipt_footer || '',
          ticketLogoUrl: settings.ticket_logo_url || '',
          ticketContact: settings.ticket_contact || '',
          ticketTerms: settings.ticket_terms || '',
          ticketArtworkUrl: settings.ticket_artwork_url || '',
          ticketArtworkFit: settings.ticket_artwork_fit || 'cover',
        },
        types: types
          .filter((type) => type.status === 'active')
          .map((type) => ({
            id: type.id,
            name: type.name,
            category: type.category,
            price: Number(type.price || 0),
            currency: type.currency,
            admissions: Number(type.admissions || 1),
            minPerOrder: Number(type.minPerOrder || 1),
            maxPerOrder: Number(type.maxPerOrder || 10),
            slotRequired: Boolean(type.slotRequired),
            slots: (type.slots || []).filter((slot) => slot.status === 'active'),
          })),
        availability: availability.ok
          ? {
            visitDate,
            closed: availability.availability.closed,
            slots: availability.availability.slots,
            types: availability.availability.types.map((type) => ({
              id: type.id,
              name: type.name,
              remaining: type.remaining,
              capacity: type.capacity,
              soldOut: type.soldOut,
              closed: type.closed,
              price: type.price,
              slots: type.slots,
            })),
          }
          : { visitDate, types: [], slots: [], error: availability.error },
        visitDate,
        shift,
        batches,
        paymentMethods: P.PAYMENT_METHODS.map((method) => ({
          value: method,
          label: method === 'mobile_money' ? 'Mobile money' : method.charAt(0).toUpperCase() + method.slice(1),
          requiresVerification: method === 'card' || method === 'mobile_money',
        })),
        layouts: P.PRINT_LAYOUTS,
        maxBatchQuantity: P.MAX_BATCH_QUANTITY,
        maxSaleTickets: P.MAX_POS_TICKETS,
      });
    }

    // ── Batches ──────────────────────────────────────────────────────────────
    if (action === 'batches') {
      const access = await requirePermission(email, attractionId, 'print');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const data = await P.listBatches(attractionId, body);
      return res.json({ ok: true, ...data, role: access.role, permissions: P.permissionsFor(access) });
    }

    if (action === 'batch') {
      const access = await requirePermission(email, attractionId, 'print');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const data = await P.loadBatch(attractionId, T.toInt(body.id || body.batchId, 0));
      if (!data) return res.status(404).json({ ok: false, error: 'Batch not found' });
      return res.json({ ok: true, ...data });
    }

    if (action === 'create-batch') {
      const access = await requirePermission(email, attractionId, 'print', 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const outcome = await P.createBatch({ attraction: access.attraction, actor: email, input: body });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({ ok: true, batch: outcome.batch, warning: outcome.warning, permissions: P.permissionsFor(access) });
    }

    if (action === 'print' || action === 'reprint') {
      const access = await requirePermission(email, attractionId, action === 'reprint' ? 'reprint' : 'print');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const outcome = await P.recordPrint({
        attraction: access.attraction,
        actor: email,
        input: { ...body, kind: action === 'reprint' ? 'reprint' : (body.kind || 'print') },
      });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({ ok: true, ...outcome });
    }

    if (action === 'void-tickets') {
      const access = await requirePermission(email, attractionId, 'void');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const outcome = await P.voidTickets({ attraction: access.attraction, actor: email, input: body });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({ ok: true, ...outcome });
    }

    if (action === 'close-batch' || action === 'archive-batch' || action === 'reopen-batch') {
      const access = await requirePermission(email, attractionId, 'void', 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const status = action === 'close-batch' ? 'closed' : (action === 'archive-batch' ? 'archived' : 'open');
      const outcome = await P.setBatchStatus({
        attraction: access.attraction, actor: email, input: { ...body, status },
      });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({ ok: true, ...outcome });
    }

    if (action === 'delete-batch') {
      const access = await requirePermission(email, attractionId, 'void', 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const outcome = await P.deleteBatch({ attraction: access.attraction, actor: email, input: body });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({ ok: true });
    }

    // ── Point of sale ────────────────────────────────────────────────────────
    if (action === 'pos-sale') {
      const access = await requirePermission(email, attractionId, 'sell');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

      // Attach the cashier's open shift so the sale reconciles automatically.
      let shiftId = T.toInt(body.shiftId, 0);
      if (!shiftId) {
        const shift = await openShiftFor(attractionId, email);
        shiftId = shift ? shift.id : 0;
      }

      const outcome = await P.posSale({ access, actor: email, input: { ...body, shiftId } });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({ ok: true, ...outcome });
    }

    if (action === 'confirm-payment') {
      const access = await requirePermission(email, attractionId, 'sell');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const outcome = await P.confirmPosPayment({ attraction: access.attraction, actor: email, input: body });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({ ok: true, ...outcome });
    }

    if (action === 'receipt') {
      const access = await requirePermission(email, attractionId, 'sell');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const orderId = T.toInt(body.id || body.orderId, 0);
      const receipt = await P.loadReceipt(attractionId, orderId);
      if (!receipt) return res.status(404).json({ ok: false, error: 'Receipt not found' });
      return res.json({ ok: true, receipt });
    }

    if (action === 'refund-sale') {
      const access = await requirePermission(email, attractionId, 'refund');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const orderId = T.toInt(body.id || body.orderId, 0);
      const reason = T.text(body.reason, 300);
      if (reason.length < 3) {
        return res.status(400).json({ ok: false, error: 'Record a reason for this refund' });
      }
      const orderRes = await query(
        `SELECT * FROM bc_ticket_orders WHERE id = $1 AND attraction_id = $2`, [orderId, attractionId]
      );
      const order = orderRes.rows[0];
      if (!order) return res.status(404).json({ ok: false, error: 'Sale not found' });
      const outcome = await T.refundOrder({ order, amount: body.amount, reason, actor: email });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({ ok: true, ...outcome });
    }

    if (action === 'sales') {
      const access = await requirePermission(email, attractionId, 'sell');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const permissions = P.permissionsFor(access);
      const scoped = permissions.viewAllSales ? body : { ...body, cashier: email };
      const data = await P.listPosSales(attractionId, scoped);
      return res.json({ ok: true, ...data, role: access.role, permissions, scopedToSelf: !permissions.viewAllSales });
    }

    // ── Cashier shifts ───────────────────────────────────────────────────────
    if (action === 'open-shift') {
      const access = await requirePermission(email, attractionId, 'shift');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const outcome = await P.openShift({ access, actor: email, input: body });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({ ok: true, ...outcome });
    }

    if (action === 'shift') {
      const access = await requirePermission(email, attractionId, 'shift');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const shift = await openShiftFor(attractionId, email);
      return res.json({ ok: true, shift, permissions: P.permissionsFor(access) });
    }

    if (action === 'close-shift') {
      const access = await requirePermission(email, attractionId, 'shift');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      // A cashier closes their own drawer; only a supervisor may close
      // somebody else's shift on their behalf.
      const target = T.toInt(body.shiftId, 0);
      if (target && !T.roleAllows(access.role, 'manager')) {
        const owned = await query(
          `SELECT id FROM bc_cash_shifts
            WHERE id = $1 AND attraction_id = $2 AND LOWER(cashier_email) = LOWER($3)`,
          [target, access.attraction.id, email]
        );
        if (!owned.rows.length) {
          return res.status(403).json({ ok: false, error: 'Only a manager can close another cashier’s shift' });
        }
      }
      const outcome = await P.closeShift({ attraction: access.attraction, actor: email, input: body });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      return res.json({ ok: true, ...outcome });
    }

    if (action === 'payout') {
      const access = await requirePermission(email, attractionId, 'payout');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      let shiftId = T.toInt(body.shiftId, 0);
      if (!shiftId) {
        const shift = await openShiftFor(attractionId, email);
        shiftId = shift ? shift.id : 0;
      }
      if (!shiftId) return res.status(409).json({ ok: false, error: 'Open a shift before recording a cash movement' });
      const outcome = await P.recordCashMovement({
        attraction: access.attraction, actor: email, input: { ...body, shiftId },
      });
      if (!outcome.ok) return res.status(outcome.status || 400).json({ ok: false, error: outcome.error });
      const shift = await openShiftFor(attractionId, email);
      return res.json({ ok: true, ...outcome, shift });
    }

    if (action === 'shifts') {
      const access = await requirePermission(email, attractionId, 'reports');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const data = await P.listShifts(attractionId, body);
      return res.json({ ok: true, ...data });
    }

    // ── Cashiers ─────────────────────────────────────────────────────────────
    if (action === 'cashiers') {
      const access = await requireAccess(email, attractionId, 'manager');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const result = await query(
        `SELECT id, email, name, role, status, permissions, created_at
           FROM bc_ticket_staff WHERE attraction_id = $1 ORDER BY created_at ASC`,
        [attractionId]
      );
      return res.json({
        ok: true,
        owner: {
          email: access.attraction.owner_email,
          name: '',
          role: 'owner',
          permissions: P.permissionsFor({ role: 'owner' }),
        },
        staff: result.rows.map((row) => ({
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          status: row.status,
          permissions: P.permissionsFor({ role: row.role, staff: { permissions: row.permissions } }),
          customPermissions: row.permissions || {},
          createdAt: row.created_at,
        })),
        permissionKeys: P.POS_PERMISSIONS,
        defaultPermissions: P.DEFAULT_PERMISSIONS,
      });
    }

    if (action === 'save-cashier') {
      const access = await requireAccess(email, attractionId, 'owner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const staffEmail = String(body.email || '').trim().toLowerCase();
      if (!T.validEmail(staffEmail)) return res.status(400).json({ ok: false, error: 'A valid staff email is required' });
      if (staffEmail === String(access.attraction.owner_email || '').toLowerCase()) {
        return res.status(400).json({ ok: false, error: 'The owner already has full access' });
      }
      const role = CASHIER_ROLES.includes(body.role) ? body.role : 'scanner';
      const permissions = P.normalizePermissions(body.permissions || {});
      const result = await query(
        `INSERT INTO bc_ticket_staff (attraction_id, email, name, role, status, invited_by, permissions)
         VALUES ($1,$2,COALESCE($3, ''),$4,'active',COALESCE($5, ''),$6::jsonb)
         ON CONFLICT (attraction_id, email)
         DO UPDATE SET name = COALESCE($3, ''), role = $4, status = 'active', permissions = $6::jsonb
         RETURNING id, email, name, role, status, permissions, created_at`,
        [attractionId, staffEmail, T.text(body.name, 120), role, email, JSON.stringify(permissions)]
      );
      await T.writeTicketAudit({
        attractionId, actor: email, action: 'staff.cashier-saved', entityType: 'staff',
        entityId: staffEmail, details: { role, permissions },
      });
      return res.json({ ok: true, staff: result.rows[0] });
    }

    if (action === 'remove-cashier') {
      const access = await requireAccess(email, attractionId, 'owner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const staffId = T.toInt(body.id, 0);
      if (!staffId) return res.status(400).json({ ok: false, error: 'Choose the cashier to remove' });
      const removed = await query(
        `DELETE FROM bc_ticket_staff WHERE attraction_id = $1 AND id = $2 RETURNING email`,
        [attractionId, staffId]
      );
      if (!removed.rows.length) return res.status(404).json({ ok: false, error: 'Cashier not found' });
      await T.writeTicketAudit({
        attractionId, actor: email, action: 'staff.cashier-removed', entityType: 'staff',
        entityId: removed.rows[0].email,
      });
      return res.json({ ok: true });
    }

    // ── Settings ─────────────────────────────────────────────────────────────
    if (action === 'save-settings') {
      const access = await requireAccess(email, attractionId, 'owner');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const saved = await P.savePhysicalSettings(attractionId, body);
      await T.writeTicketAudit({
        attractionId, actor: email, action: 'settings.physical-saved', entityType: 'settings',
        entityId: attractionId,
        details: {
          posEnabled: saved.pos_enabled, printLayout: saved.print_layout, paperSize: saved.paper_size,
          ticketArtwork: Boolean(saved.ticket_artwork_url),
        },
      });
      return res.json({
        ok: true,
        settings: {
          posEnabled: saved.pos_enabled !== false,
          printLayout: saved.print_layout,
          paperSize: saved.paper_size,
          ticketLogoUrl: saved.ticket_logo_url,
          ticketContact: saved.ticket_contact,
          ticketTerms: saved.ticket_terms,
          receiptHeader: saved.receipt_header,
          receiptFooter: saved.receipt_footer,
          ticketArtworkUrl: saved.ticket_artwork_url,
          ticketArtworkFit: saved.ticket_artwork_fit,
        },
      });
    }

    // ── Reports ──────────────────────────────────────────────────────────────
    if (action === 'reports') {
      const access = await requirePermission(email, attractionId, 'reports');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const data = await P.loadReports(attractionId, body);
      return res.json({ ok: true, ...data, permissions: P.permissionsFor(access) });
    }

    if (action === 'export') {
      const access = await requirePermission(email, attractionId, 'reports');
      if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
      const data = await P.listPosSales(attractionId, { ...body, pageSize: 100 });
      const csv = toCsv(
        ['Sale reference', 'Receipt', 'Date', 'Visit date', 'Cashier', 'Customer', 'Tickets',
          'Ticket numbers', 'Payment method', 'Currency', 'Total', 'Refunded', 'Status'],
        data.sales.map((sale) => [
          sale.saleRef, sale.receiptNo, new Date(sale.createdAt).toISOString(), sale.visitDate,
          sale.cashier, sale.customerName, sale.quantity, sale.ticketNumbers,
          sale.paymentMethod, sale.currency, sale.total.toFixed(2), sale.refundAmount.toFixed(2), sale.status,
        ])
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="physical-sales-${data.range.from}-to-${data.range.to}.csv"`);
      return res.status(200).send(csv);
    }

    return res.status(400).json({ ok: false, error: 'Unknown physical ticketing action' });
  } catch (error) {
    console.error('[attraction-pos]', error);
    const status = error.status || 500;
    return res.status(status).json({ ok: false, error: error.message || 'Ticket office request failed' });
  }
};
