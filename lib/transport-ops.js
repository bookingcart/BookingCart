// Transport operator console — everything the company dashboard, the counter and
// the platform administrator need on top of the public booking flow in
// lib/transport.js.
//
// Two rules shape this module:
//   1. Every query is scoped by operator_id, so a company can only ever touch its
//      own routes, departures, passengers and money.
//   2. Confirmed bookings are never deleted. Cancelling a departure or a route
//      archives it and keeps the historical revenue intact.

const { query, withTransaction } = require('./db');
const notificationHub = require('./notification-hub');
const T = require('./ticketing');
const Tr = require('./transport');

const OPERATOR_ROLES = ['owner', 'manager', 'ticketing', 'boarding', 'agent'];
const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  ticketing: 'Ticketing staff',
  boarding: 'Boarding staff',
  agent: 'Ticket agent',
};

// Capabilities, not a hierarchy: boarding staff scan tickets but never sell one,
// and a ticket agent sells but cannot change the schedule.
const ROLE_CAPS = {
  owner: ['read', 'manage', 'sell', 'board', 'refund', 'staff', 'settings'],
  manager: ['read', 'manage', 'sell', 'board', 'refund', 'staff'],
  ticketing: ['read', 'sell', 'refund'],
  boarding: ['read', 'board'],
  agent: ['read', 'sell'],
};

const OPERATOR_STATUSES = ['pending', 'approved', 'suspended', 'rejected'];
const ROUTE_STATUSES = ['draft', 'published', 'archived'];
const DEPARTURE_STATUSES = ['scheduled', 'cancelled', 'completed'];
const BOOKING_STATUSES = ['confirmed', 'pending_payment', 'cancelled', 'expired'];
const PAYMENT_METHODS = ['cash', 'card', 'mobile_money', 'bank_transfer', 'agent_credit'];
const MAX_LAYOUT_SEATS = 600;

const DEFAULT_SETTINGS = {
  serviceFeePercent: 0,
  taxPercent: 0,
  refundWindowHours: 24,
  cancellationFeePercent: 0,
  boardingCutoffMinutes: 15,
  salesCloseMinutes: 0,
  autoApproveBookings: true,
  allowOnline: true,
  allowPayAtCounter: true,
};

function roleAllows(role, need = 'read') {
  const caps = ROLE_CAPS[String(role || '').toLowerCase()] || [];
  return caps.includes(need);
}

function settingsOf(row = {}) {
  const stored = row.settings && typeof row.settings === 'object' ? row.settings : {};
  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (stored[key] === undefined || stored[key] === null) continue;
    merged[key] = typeof DEFAULT_SETTINGS[key] === 'boolean' ? stored[key] === true : Number(stored[key]);
  }
  merged.allowOnline = row.allow_online === undefined ? merged.allowOnline : row.allow_online !== false;
  merged.allowPayAtCounter = row.allow_pay_at_counter === undefined
    ? merged.allowPayAtCounter
    : row.allow_pay_at_counter !== false;
  return merged;
}

function mapOperator(row = {}) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerEmail: row.owner_email || '',
    transportTypes: Array.isArray(row.transport_types) ? row.transport_types : [],
    description: row.description || '',
    logoUrl: row.logo_url || '',
    website: row.website || '',
    contact: row.contact && typeof row.contact === 'object' ? row.contact : {},
    policies: row.policies && typeof row.policies === 'object' ? row.policies : {},
    commissionPercent: Number(row.commission_percent || 0),
    holdMinutes: Number(row.hold_minutes || Tr.DEFAULT_HOLD_MINUTES),
    allowOnline: row.allow_online !== false,
    allowPayAtCounter: row.allow_pay_at_counter !== false,
    status: row.status || 'pending',
    settings: settingsOf(row),
    role: row.role || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRoute(row = {}) {
  return {
    id: row.id,
    operatorId: row.operator_id,
    operatorName: row.operator_name || '',
    transportType: row.transport_type,
    name: row.name,
    code: row.code || '',
    originId: row.origin_id,
    destinationId: row.destination_id,
    originName: row.origin_name || '',
    destinationName: row.destination_name || '',
    durationMinutes: Number(row.duration_minutes || 0),
    distanceKm: row.distance_km === null || row.distance_km === undefined ? null : Number(row.distance_km),
    basePrice: Number(row.base_price || 0),
    currency: row.currency || 'UGX',
    classes: Tr.classList(row.classes),
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    luggageAllowance: row.luggage_allowance || '',
    cancellationPolicy: row.cancellation_policy || '',
    status: row.status || 'draft',
    stops: Number(row.stop_count || 0),
    departures: Number(row.departure_count || 0),
    ticketsSold: Number(row.tickets_sold || 0),
    createdAt: row.created_at,
  };
}

function mapVehicle(row = {}) {
  return {
    id: row.id,
    operatorId: row.operator_id,
    transportType: row.transport_type,
    name: row.name,
    registration: row.registration || '',
    capacity: Number(row.capacity || 0),
    seating: row.seating === 'capacity' ? 'capacity' : 'assigned',
    seatClass: row.seat_class || 'standard',
    layout: row.layout && typeof row.layout === 'object' ? row.layout : {},
    features: row.features && typeof row.features === 'object' ? row.features : {},
    status: row.status || 'active',
    seatCount: Number(row.seat_count || 0),
    departures: Number(row.departure_count || 0),
  };
}

function mapSeat(row = {}) {
  return {
    id: row.id,
    carriage: row.carriage || '',
    rowLabel: row.row_label,
    seatNo: row.seat_no,
    seatKey: row.seat_key,
    category: row.category || 'standard',
    kind: row.kind || 'seat',
    x: Number(row.x || 0),
    y: Number(row.y || 0),
    priceOverride: row.price_override === null || row.price_override === undefined ? null : Number(row.price_override),
    status: row.status || 'available',
  };
}

function mapDeparture(row = {}) {
  return {
    id: row.id,
    operatorId: row.operator_id,
    routeId: row.route_id,
    routeName: row.route_name || '',
    transportType: row.transport_type || 'bus',
    vehicleId: row.vehicle_id,
    vehicleName: row.vehicle_name || '',
    seating: row.seating === 'capacity' ? 'capacity' : 'assigned',
    travelDate: T.isoDate(row.travel_date),
    departTime: row.depart_time,
    arriveTime: row.arrive_time,
    seatsTotal: Number(row.seats_total || 0),
    sold: Number(row.sold || 0),
    seatsAvailable: Math.max(0, Number(row.seats_total || 0) - Number(row.sold || 0)),
    revenue: Number(row.revenue || 0),
    basePrice: Number(row.base_price || 0),
    currency: row.currency || 'UGX',
    classes: Tr.classList(row.classes && row.classes.length ? row.classes : row.route_classes),
    status: row.status || 'scheduled',
    boardingCutoffMinutes: Number(row.boarding_cutoff_minutes || 15),
    salesCloseMinutes: Number(row.sales_close_minutes || 0),
    notes: row.notes || '',
  };
}

async function writeAudit({ operatorId = 0, actorEmail = '', actorRole = '', action, entity = '', entityId = '', details = {} }) {
  try {
    await query(
      `INSERT INTO bc_transport_audit (operator_id, actor_email, actor_role, action, entity, entity_id, details)
       VALUES ($1,COALESCE($2,''),COALESCE($3,''),$4,COALESCE($5,''),COALESCE($6,''),$7)`,
      [T.toInt(operatorId, 0), String(actorEmail || '').toLowerCase(), String(actorRole || ''), String(action || 'unknown'),
        String(entity || ''), String(entityId || ''), JSON.stringify(details || {})]
    );
  } catch (error) {
    // An audit outage must never roll back the business action it describes.
    console.warn('[transport] audit write failed:', error.message);
  }
}

async function notifyCustomer({ email, phone = '', type, title, message, actionUrl, metadata = {} }) {
  const recipient = String(email || '').trim().toLowerCase();
  if (!recipient) return;
  try {
    await notificationHub.dispatch({
      recipientId: recipient,
      recipientEmail: recipient,
      recipientPhone: phone || '',
      type,
      title,
      message,
      actionUrl: actionUrl || '/transport/bookings',
      metadata,
    });
  } catch (error) {
    console.warn('[transport] notification failed:', error.message);
  }
}

/** Hours from now until a departure's boarding time; negative when it has left. */
function hoursUntil(travelDate, departTime) {
  const date = T.isDateISO(travelDate) ? T.isoDate(travelDate) : '';
  if (!date || !Tr.isHHMM(departTime)) return 0;
  const stamp = new Date(`${date}T${departTime}:00Z`).getTime();
  if (Number.isNaN(stamp)) return 0;
  return (stamp - Date.now()) / 3600000;
}

// ─── Access ──────────────────────────────────────────────────────────────────

async function listOperatorsFor(email) {
  const who = String(email || '').trim().toLowerCase();
  if (!who) return [];
  const result = await query(
    `SELECT o.*, CASE WHEN LOWER(BTRIM(COALESCE(o.owner_email, ''))) = $1 THEN 'owner' ELSE s.role END AS role
       FROM bc_transport_operators o
       LEFT JOIN bc_transport_staff s
              ON s.operator_id = o.id AND LOWER(BTRIM(s.email)) = $1 AND s.status = 'active'
      WHERE LOWER(BTRIM(COALESCE(o.owner_email, ''))) = $1 OR s.id IS NOT NULL
      ORDER BY o.name ASC`,
    [who]
  );
  return result.rows.map(mapOperator);
}

/**
 * Resolve one operator for a signed-in email. Owners get every capability; staff
 * get whatever their role allows. A pending operator can still set up its routes,
 * it just cannot sell until the platform approves it.
 */
async function requireOperator(email, operatorId, need = 'read') {
  const who = String(email || '').trim().toLowerCase();
  const id = T.toInt(operatorId, 0);
  if (!who) return { ok: false, status: 401, error: 'Sign in to manage a transport operator' };
  if (!id) return { ok: false, status: 400, error: 'operatorId is required' };

  const result = await query(
    `SELECT o.*, CASE WHEN LOWER(BTRIM(COALESCE(o.owner_email, ''))) = $1 THEN 'owner' ELSE s.role END AS role,
            s.status AS staff_status
       FROM bc_transport_operators o
       LEFT JOIN bc_transport_staff s
              ON s.operator_id = o.id AND LOWER(BTRIM(s.email)) = $1 AND s.status = 'active'
      WHERE o.id = $2
      LIMIT 1`,
    [who, id]
  );
  const row = result.rows[0];
  if (!row) return { ok: false, status: 404, error: 'Transport operator not found' };
  const isOwner = String(row.owner_email || '').trim().toLowerCase() === who;
  if (!isOwner && !row.staff_status) {
    return { ok: false, status: 403, error: 'You do not have access to this operator' };
  }
  const role = isOwner ? 'owner' : row.role;
  if (!roleAllows(role, need)) {
    return { ok: false, status: 403, error: `This action requires the ${need} permission` };
  }
  if (row.status === 'suspended') {
    return { ok: false, status: 403, error: 'This operator is suspended. Contact the platform administrator.' };
  }
  return { ok: true, role, operator: mapOperator({ ...row, role }) };
}

/** A new operator signs itself up as pending; the platform approves it later. */
async function applyAsOperator({ email, name, transportTypes = [], description = '', contact = {}, website = '' } = {}) {
  const who = String(email || '').trim().toLowerCase();
  if (!T.validEmail(who)) return { ok: false, status: 400, error: 'Sign in with a valid email first' };
  const company = T.text(name, 160);
  if (!company) return { ok: false, status: 400, error: 'Enter your company name' };
  const types = (Array.isArray(transportTypes) ? transportTypes : []).filter((entry) => Tr.isType(entry));
  if (!types.length) return { ok: false, status: 400, error: 'Choose at least one transport type' };

  const existing = await query(
    `SELECT id FROM bc_transport_operators WHERE LOWER(BTRIM(owner_email)) = $1 LIMIT 1`,
    [who]
  );
  if (existing.rows.length) {
    return { ok: false, status: 409, error: 'You already have a transport operator account' };
  }

  const base = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'operator';
  let slug = base;
  for (let attempt = 1; attempt < 40; attempt += 1) {
    const taken = await query(`SELECT id FROM bc_transport_operators WHERE slug = $1 LIMIT 1`, [slug]);
    if (!taken.rows.length) break;
    slug = `${base}-${attempt + 1}`;
  }

  const inserted = await query(
    `INSERT INTO bc_transport_operators
       (owner_email, name, slug, transport_types, description, contact, website, status)
     VALUES ($1,$2,$3,$4,COALESCE($5,''),$6,COALESCE($7,''),'pending') RETURNING *`,
    [who, company, slug, JSON.stringify(types), T.text(description, 600), JSON.stringify(contact || {}), T.text(website, 200)]
  );
  await writeAudit({
    operatorId: inserted.rows[0].id, actorEmail: who, actorRole: 'owner',
    action: 'operator_apply', entity: 'operator', entityId: inserted.rows[0].id, details: { name: company, types },
  });
  return { ok: true, operator: mapOperator({ ...inserted.rows[0], role: 'owner' }) };
}

// ─── Settings ────────────────────────────────────────────────────────────────

async function saveOperatorSettings(operatorId, actorEmail, role, input = {}) {
  const current = await query(`SELECT * FROM bc_transport_operators WHERE id = $1 LIMIT 1`, [T.toInt(operatorId, 0)]);
  if (!current.rows.length) return { ok: false, status: 404, error: 'Transport operator not found' };
  const row = current.rows[0];
  const merged = { ...settingsOf(row) };
  const clampNum = (value, fallback, min, max) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  };

  merged.serviceFeePercent = clampNum(input.serviceFeePercent, merged.serviceFeePercent, 0, 50);
  merged.taxPercent = clampNum(input.taxPercent, merged.taxPercent, 0, 50);
  merged.refundWindowHours = clampNum(input.refundWindowHours, merged.refundWindowHours, 0, 720);
  merged.cancellationFeePercent = clampNum(input.cancellationFeePercent, merged.cancellationFeePercent, 0, 100);
  merged.boardingCutoffMinutes = clampNum(input.boardingCutoffMinutes, merged.boardingCutoffMinutes, 0, 240);
  merged.salesCloseMinutes = clampNum(input.salesCloseMinutes, merged.salesCloseMinutes, 0, 1440);
  if (typeof input.allowOnline === 'boolean') merged.allowOnline = input.allowOnline;
  if (typeof input.allowPayAtCounter === 'boolean') merged.allowPayAtCounter = input.allowPayAtCounter;

  const holdMinutes = clampNum(input.holdMinutes, Number(row.hold_minutes) || Tr.DEFAULT_HOLD_MINUTES, 3, Tr.MAX_HOLD_MINUTES);

  await query(
    `UPDATE bc_transport_operators
        SET settings = $2, hold_minutes = $3, allow_online = $4, allow_pay_at_counter = $5,
            description = COALESCE($6, description), logo_url = COALESCE($7, logo_url),
            website = COALESCE($8, website), contact = COALESCE($9, contact),
            policies = COALESCE($10, policies), updated_at = NOW()
      WHERE id = $1`,
    [
      row.id, JSON.stringify(merged), holdMinutes, merged.allowOnline, merged.allowPayAtCounter,
      input.description === undefined ? null : T.text(input.description, 600),
      input.logoUrl === undefined ? null : T.text(input.logoUrl, 300),
      input.website === undefined ? null : T.text(input.website, 200),
      input.contact === undefined ? null : JSON.stringify(input.contact || {}),
      input.policies === undefined ? null : JSON.stringify(input.policies || {}),
    ]
  );
  await writeAudit({
    operatorId: row.id, actorEmail, actorRole: role, action: 'settings_save',
    entity: 'operator', entityId: row.id, details: { settings: merged, holdMinutes },
  });
  const fresh = await query(`SELECT * FROM bc_transport_operators WHERE id = $1`, [row.id]);
  return { ok: true, operator: mapOperator({ ...fresh.rows[0], role }) };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

async function listRoutes(operatorId, { includeArchived = false } = {}) {
  const result = await query(
    `SELECT r.*, lo.name AS origin_name, ld.name AS destination_name,
            (SELECT COUNT(*) FROM bc_transport_route_stops s WHERE s.route_id = r.id)::int AS stop_count,
            (SELECT COUNT(*) FROM bc_transport_departures d WHERE d.route_id = r.id)::int AS departure_count,
            (SELECT COALESCE(SUM(b.passenger_count), 0) FROM bc_transport_bookings b
              WHERE b.route_id = r.id AND b.status = 'confirmed')::int AS tickets_sold
       FROM bc_transport_routes r
       LEFT JOIN bc_transport_locations lo ON lo.id = r.origin_id
       LEFT JOIN bc_transport_locations ld ON ld.id = r.destination_id
      WHERE r.operator_id = $1 ${includeArchived ? '' : `AND r.status <> 'archived'`}
      ORDER BY r.name ASC`,
    [T.toInt(operatorId, 0)]
  );
  return result.rows.map(mapRoute);
}

async function routeStopsFor(operatorId, routeId) {
  const owned = await query(
    `SELECT id FROM bc_transport_routes WHERE id = $1 AND operator_id = $2 LIMIT 1`,
    [T.toInt(routeId, 0), T.toInt(operatorId, 0)]
  );
  if (!owned.rows.length) return { ok: false, status: 404, error: 'Route not found' };
  return { ok: true, stops: await Tr.routeStops(routeId) };
}

/**
 * Create or update a route with its ordered stops. Replacing the stops rewrites
 * only the timetable — departures already sold keep their own from_stop/to_stop
 * indices, so confirmed passengers stay on the journey they paid for.
 */
async function saveRoute(operatorId, actorEmail, role, input = {}) {
  const opId = T.toInt(operatorId, 0);
  const type = Tr.typeOf(input.transportType);
  const name = T.text(input.name, 160);
  const code = T.text(input.code, 40);
  const originId = T.toInt(input.originId, 0);
  const destinationId = T.toInt(input.destinationId, 0);
  const status = ROUTE_STATUSES.includes(String(input.status)) ? String(input.status) : 'draft';

  if (!name) return { ok: false, status: 400, error: 'Enter a route name' };
  if (!originId || !destinationId) return { ok: false, status: 400, error: 'Choose the origin and destination' };
  if (originId === destinationId) return { ok: false, status: 400, error: 'Origin and destination must differ' };

  const rawStops = Array.isArray(input.stops) ? input.stops : [];
  const stops = rawStops
    .map((stop, index) => ({
      locationId: T.toInt(stop.locationId || stop.id, 0),
      minutesFromOrigin: Math.max(0, T.toInt(stop.minutesFromOrigin ?? stop.minutes, 0)),
      kind: T.text(stop.kind || (index === 0 ? 'endpoint' : 'stop'), 20) || 'stop',
      sort: index,
    }))
    .filter((stop) => stop.locationId);
  if (stops.length < 2) return { ok: false, status: 400, error: 'A route needs at least a boarding point and a destination' };
  if (stops[0].locationId !== originId || stops[stops.length - 1].locationId !== destinationId) {
    return { ok: false, status: 400, error: 'The first stop must be the origin and the last stop the destination' };
  }
  for (let index = 1; index < stops.length; index += 1) {
    if (stops[index].minutesFromOrigin < stops[index - 1].minutesFromOrigin) {
      return { ok: false, status: 400, error: 'Stop times must increase along the route' };
    }
  }
  const uniqueLocations = new Set(stops.map((stop) => stop.locationId));
  if (uniqueLocations.size !== stops.length) return { ok: false, status: 400, error: 'A stop can only appear once on a route' };

  const durationMinutes = Math.max(1, T.toInt(input.durationMinutes, stops[stops.length - 1].minutesFromOrigin) || stops[stops.length - 1].minutesFromOrigin);
  const basePrice = Math.max(0, T.toNumberOrNull(input.basePrice) ?? 0);
  const classes = Tr.classList(input.classes);
  const amenities = (Array.isArray(input.amenities) ? input.amenities : []).map((entry) => T.text(entry, 60)).filter(Boolean).slice(0, 20);
  let routeId = T.toInt(input.routeId || input.id, 0);
  const creating = !routeId;

  const outcome = await withTransaction(async (client) => {
    if (routeId) {
      const owned = await client.query(
        `SELECT id FROM bc_transport_routes WHERE id = $1 AND operator_id = $2 FOR UPDATE`,
        [routeId, opId]
      );
      if (!owned.rows.length) return { ok: false, status: 404, error: 'Route not found' };
      await client.query(
        `UPDATE bc_transport_routes
            SET transport_type = $2, name = $3, code = COALESCE($4,''), origin_id = $5, destination_id = $6,
                duration_minutes = $7, distance_km = $8, base_price = $9, currency = $10,
                classes = $11, amenities = $12, luggage_allowance = COALESCE($13,''), cancellation_policy = COALESCE($14,''),
                status = $15, updated_at = NOW()
          WHERE id = $1`,
        [
          routeId, type, name, code, originId, destinationId, durationMinutes,
          input.distanceKm === undefined || input.distanceKm === null || input.distanceKm === '' ? null : Number(input.distanceKm),
          basePrice, T.validCurrency(input.currency) ? input.currency : 'UGX', JSON.stringify(classes),
          JSON.stringify(amenities), T.text(input.luggageAllowance, 200), T.text(input.cancellationPolicy, 300), status,
        ]
      );
      await client.query(`DELETE FROM bc_transport_route_stops WHERE route_id = $1`, [routeId]);
    } else {
      const inserted = await client.query(
        `INSERT INTO bc_transport_routes
           (operator_id, transport_type, name, code, origin_id, destination_id, duration_minutes,
            distance_km, base_price, currency, classes, amenities, luggage_allowance, cancellation_policy, status)
         VALUES ($1,$2,$3,COALESCE($4,''),$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13,''),COALESCE($14,''),$15) RETURNING id`,
        [
          opId, type, name, code, originId, destinationId, durationMinutes,
          input.distanceKm === undefined || input.distanceKm === null || input.distanceKm === '' ? null : Number(input.distanceKm),
          basePrice, T.validCurrency(input.currency) ? input.currency : 'UGX', JSON.stringify(classes),
          JSON.stringify(amenities), T.text(input.luggageAllowance, 200), T.text(input.cancellationPolicy, 300), status,
        ]
      );
      routeId = inserted.rows[0].id;
    }

    for (let index = 0; index < stops.length; index += 1) {
      const stop = stops[index];
      const isEndpoint = index === 0 || index === stops.length - 1;
      await client.query(
        `INSERT INTO bc_transport_route_stops (route_id, location_id, stop_order, minutes_from_origin, kind)
         VALUES ($1,$2,$3,$4,$5)`,
        [routeId, stop.locationId, index + 1, stop.minutesFromOrigin, isEndpoint ? 'endpoint' : stop.kind]
      );
    }

    return { ok: true, routeId };
  });

  if (!outcome.ok) return outcome;
  await writeAudit({
    operatorId: opId, actorEmail, actorRole: role, action: creating ? 'route_create' : 'route_update',
    entity: 'route', entityId: outcome.routeId, details: { name, type, status, stops: stops.length },
  });
  const fresh = await query(
    `SELECT r.*, lo.name AS origin_name, ld.name AS destination_name,
            (SELECT COUNT(*) FROM bc_transport_route_stops s WHERE s.route_id = r.id)::int AS stop_count
       FROM bc_transport_routes r
       LEFT JOIN bc_transport_locations lo ON lo.id = r.origin_id
       LEFT JOIN bc_transport_locations ld ON ld.id = r.destination_id
      WHERE r.id = $1`,
    [outcome.routeId]
  );
  return { ok: true, route: mapRoute({ ...fresh.rows[0], departure_count: 0, tickets_sold: 0 }) };
}

async function setRouteStatus(operatorId, actorEmail, role, routeId, status) {
  const next = ROUTE_STATUSES.includes(String(status)) ? String(status) : '';
  if (!next) return { ok: false, status: 400, error: 'Unknown route status' };
  const updated = await query(
    `UPDATE bc_transport_routes SET status = $3, updated_at = NOW()
      WHERE id = $1 AND operator_id = $2 RETURNING id, name`,
    [T.toInt(routeId, 0), T.toInt(operatorId, 0), next]
  );
  if (!updated.rows.length) return { ok: false, status: 404, error: 'Route not found' };
  // Archiving a route takes its future departures off sale, but past ones stay
  // exactly where the passenger bought them.
  if (next === 'archived') {
    await query(
      `UPDATE bc_transport_departures SET status = 'cancelled', updated_at = NOW()
        WHERE route_id = $1 AND status = 'scheduled' AND travel_date >= CURRENT_DATE
          AND id NOT IN (SELECT DISTINCT departure_id FROM bc_transport_bookings WHERE status = 'confirmed')`,
      [updated.rows[0].id]
    );
  }
  await writeAudit({
    operatorId, actorEmail, actorRole: role, action: 'route_status', entity: 'route',
    entityId: updated.rows[0].id, details: { status: next },
  });
  return { ok: true, routeId: updated.rows[0].id, status: next };
}

// ─── Vehicles and seat layouts ───────────────────────────────────────────────

async function listVehicles(operatorId) {
  const result = await query(
    `SELECT v.*,
            (SELECT COUNT(*) FROM bc_transport_seats s WHERE s.vehicle_id = v.id)::int AS seat_count,
            (SELECT COUNT(*) FROM bc_transport_departures d WHERE d.vehicle_id = v.id)::int AS departure_count
       FROM bc_transport_vehicles v
      WHERE v.operator_id = $1
      ORDER BY v.name ASC`,
    [T.toInt(operatorId, 0)]
  );
  return result.rows.map(mapVehicle);
}

async function saveVehicle(operatorId, actorEmail, role, input = {}) {
  const opId = T.toInt(operatorId, 0);
  const name = T.text(input.name, 160);
  if (!name) return { ok: false, status: 400, error: 'Enter the vehicle name' };
  const type = Tr.typeOf(input.transportType);
  const seating = String(input.seating) === 'capacity' ? 'capacity' : 'assigned';
  const capacity = Math.min(600, Math.max(1, T.toInt(input.capacity, 0) || 1));
  const vehicleId = T.toInt(input.vehicleId || input.id, 0);

  if (vehicleId) {
    const updated = await query(
      `UPDATE bc_transport_vehicles
          SET transport_type = $3, name = $4, registration = COALESCE($5,''), capacity = $6, seating = $7,
              seat_class = $8, features = $9, status = $10
        WHERE id = $1 AND operator_id = $2 RETURNING *`,
      [
        vehicleId, opId, type, name, T.text(input.registration, 60), capacity, seating,
        T.text(input.seatClass, 40) || 'standard', JSON.stringify(input.features || {}),
        input.status === 'inactive' ? 'inactive' : 'active',
      ]
    );
    if (!updated.rows.length) return { ok: false, status: 404, error: 'Vehicle not found' };
    await writeAudit({ operatorId: opId, actorEmail, actorRole: role, action: 'vehicle_update', entity: 'vehicle', entityId: vehicleId, details: { name, capacity } });
    return { ok: true, vehicle: mapVehicle({ ...updated.rows[0], seat_count: 0, departure_count: 0 }) };
  }

  const inserted = await query(
    `INSERT INTO bc_transport_vehicles
       (operator_id, transport_type, name, registration, capacity, seating, seat_class, features)
     VALUES ($1,$2,$3,COALESCE($4,''),$5,$6,$7,$8) RETURNING *`,
    [opId, type, name, T.text(input.registration, 60), capacity, seating, T.text(input.seatClass, 40) || 'standard', JSON.stringify(input.features || {})]
  );
  await writeAudit({ operatorId: opId, actorEmail, actorRole: role, action: 'vehicle_create', entity: 'vehicle', entityId: inserted.rows[0].id, details: { name, capacity } });
  return { ok: true, vehicle: mapVehicle({ ...inserted.rows[0], seat_count: 0, departure_count: 0 }) };
}

async function getVehicleSeats(operatorId, vehicleId) {
  const owned = await query(
    `SELECT id, seating, capacity FROM bc_transport_vehicles WHERE id = $1 AND operator_id = $2 LIMIT 1`,
    [T.toInt(vehicleId, 0), T.toInt(operatorId, 0)]
  );
  if (!owned.rows.length) return { ok: false, status: 404, error: 'Vehicle not found' };
  const seats = await query(
    `SELECT * FROM bc_transport_seats WHERE vehicle_id = $1 ORDER BY carriage ASC, y ASC, x ASC, seat_key ASC`,
    [owned.rows[0].id]
  );
  return { ok: true, seating: owned.rows[0].seating, seats: seats.rows.map(mapSeat) };
}

/**
 * Replace a vehicle's permanent seat layout. Refused while any seat still has a
 * live claim, because rewriting the grid would orphan a sold or held ticket.
 */
async function saveSeatLayout(operatorId, actorEmail, role, { vehicleId, seats = [] } = {}) {
  const opId = T.toInt(operatorId, 0);
  const owned = await query(
    `SELECT id, name FROM bc_transport_vehicles WHERE id = $1 AND operator_id = $2 LIMIT 1`,
    [T.toInt(vehicleId, 0), opId]
  );
  if (!owned.rows.length) return { ok: false, status: 404, error: 'Vehicle not found' };
  const vid = owned.rows[0].id;

  const list = Array.isArray(seats) ? seats : [];
  if (!list.length) return { ok: false, status: 400, error: 'Add at least one seat' };
  if (list.length > MAX_LAYOUT_SEATS) return { ok: false, status: 400, error: `A layout can hold at most ${MAX_LAYOUT_SEATS} seats` };

  const seen = new Set();
  const cleaned = [];
  for (const seat of list) {
    const carriages = T.text(seat.carriage, 40);
    const rowLabel = T.text(seat.rowLabel || seat.row, 10);
    const seatNo = T.toInt(seat.seatNo, 0);
    if (!rowLabel || !seatNo) return { ok: false, status: 400, error: 'Every seat needs a row and a seat number' };
    const key = Tr.seatKey(rowLabel, seat.seatKey || seat.label || seatNo).replace(/[^A-Z0-9-]/g, '');
    const unique = `${carriages}|${key}`;
    if (seen.has(unique)) return { ok: false, status: 400, error: `Seat ${key} appears twice in ${carriages || 'the coach'}` };
    seen.add(unique);
    cleaned.push({
      carriage: carriages,
      rowLabel,
      seatNo,
      seatKey: T.text(seat.seatKey || seat.label || key, 20) || key,
      category: T.text(seat.category, 40) || 'standard',
      kind: seat.kind === 'berth' ? 'berth' : 'seat',
      x: Math.max(0, T.toInt(seat.x, 0)),
      y: Math.max(0, T.toInt(seat.y, 0)),
      priceOverride: T.toNumberOrNull(seat.priceOverride),
      status: seat.status === 'blocked' ? 'blocked' : 'available',
    });
  }

  const live = await query(
    `SELECT COUNT(*)::int AS total
       FROM bc_transport_seat_states st
       JOIN bc_transport_seats s ON s.id = st.seat_id
      WHERE s.vehicle_id = $1 AND st.status IN ('sold', 'held')
        AND (st.status <> 'held' OR st.expires_at IS NULL OR st.expires_at > NOW())`,
    [vid]
  );
  if (live.rows[0].total > 0) {
    return { ok: false, status: 409, error: 'This vehicle has live tickets or holds. Change the layout once the departures have run.' };
  }

  const outcome = await withTransaction(async (client) => {
    await client.query(`DELETE FROM bc_transport_seats WHERE vehicle_id = $1`, [vid]);
    const batch = {
      carriage: [], rowLabel: [], seatNo: [], seatKey: [], category: [], kind: [],
      x: [], y: [], price: [], status: [],
    };
    for (const seat of cleaned) {
      batch.carriage.push(seat.carriage);
      batch.rowLabel.push(seat.rowLabel);
      batch.seatNo.push(seat.seatNo);
      batch.seatKey.push(seat.seatKey);
      batch.category.push(seat.category);
      batch.kind.push(seat.kind);
      batch.x.push(seat.x);
      batch.y.push(seat.y);
      batch.price.push(seat.priceOverride);
      batch.status.push(seat.status);
    }
    await client.query(
      `INSERT INTO bc_transport_seats
         (vehicle_id, carriage, row_label, seat_no, seat_key, category, kind, x, y, price_override, status)
       SELECT $1, COALESCE(t.carriage,''), t.row_label, t.seat_no, t.seat_key, t.category, t.kind, t.x, t.y, t.price, t.status
         FROM unnest($2::text[], $3::text[], $4::int[], $5::text[], $6::text[], $7::text[],
                     $8::int[], $9::int[], $10::numeric[], $11::text[])
           AS t(carriage, row_label, seat_no, seat_key, category, kind, x, y, price, status)`,
      [
        vid, batch.carriage, batch.rowLabel, batch.seatNo, batch.seatKey, batch.category,
        batch.kind, batch.x, batch.y, batch.price, batch.status,
      ]
    );
    await client.query(`UPDATE bc_transport_vehicles SET capacity = $2 WHERE id = $1`, [vid, cleaned.length]);
    return { ok: true, seats: cleaned.length };
  });

  await writeAudit({
    operatorId: opId, actorEmail, actorRole: role, action: 'seat_layout_save',
    entity: 'vehicle', entityId: vid, details: { seats: outcome.seats, vehicle: owned.rows[0].name },
  });
  const fresh = await query(
    `SELECT * FROM bc_transport_seats WHERE vehicle_id = $1 ORDER BY carriage ASC, y ASC, x ASC, seat_key ASC`,
    [vid]
  );
  return { ok: true, seats: fresh.rows.map(mapSeat) };
}

// ─── Departures ──────────────────────────────────────────────────────────────

const DEPARTURE_SELECT = `
  SELECT d.*, d.travel_date::text AS travel_date,
         r.name AS route_name, r.transport_type, r.duration_minutes, r.classes AS route_classes,
         v.name AS vehicle_name, v.seating,
         COALESCE(sold.pax, 0)::int AS sold, COALESCE(sold.amount, 0) AS revenue
    FROM bc_transport_departures d
    JOIN bc_transport_routes r ON r.id = d.route_id
    LEFT JOIN bc_transport_vehicles v ON v.id = d.vehicle_id
    LEFT JOIN LATERAL (
      SELECT SUM(b.passenger_count) AS pax, SUM(b.total) AS amount
        FROM bc_transport_bookings b
       WHERE b.departure_id = d.id AND b.status = 'confirmed'
    ) sold ON TRUE
`;

async function listDepartures(operatorId, { from = '', to = '', routeId = 0, status = '', limit = 200 } = {}) {
  const params = [T.toInt(operatorId, 0)];
  const where = ['d.operator_id = $1'];
  const start = T.isDateISO(from) ? T.isoDate(from) : T.isoToday();
  const end = T.isDateISO(to) ? T.isoDate(to) : T.addDaysISO(start, 30);
  params.push(start);
  where.push(`d.travel_date >= $${params.length}`);
  params.push(end);
  where.push(`d.travel_date <= $${params.length}`);
  if (T.toInt(routeId, 0)) {
    params.push(T.toInt(routeId, 0));
    where.push(`d.route_id = $${params.length}`);
  }
  if (DEPARTURE_STATUSES.includes(String(status))) {
    params.push(String(status));
    where.push(`d.status = $${params.length}`);
  }
  params.push(Math.min(500, Math.max(1, T.toInt(limit, 200))));

  const result = await query(
    `${DEPARTURE_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY d.travel_date ASC, d.depart_time ASC
      LIMIT $${params.length}`,
    params
  );
  return result.rows.map(mapDeparture);
}

async function loadDepartureForOperator(operatorId, departureId) {
  const result = await query(
    `${DEPARTURE_SELECT} WHERE d.id = $1 AND d.operator_id = $2 LIMIT 1`,
    [T.toInt(departureId, 0), T.toInt(operatorId, 0)]
  );
  return result.rows[0] || null;
}

/**
 * Free every seat and cancel every confirmed booking on a departure. The rows
 * stay in the database so the operator still has the revenue history.
 */
async function cancelDepartureBookings(departureId, reason) {
  const bookings = await query(
    `SELECT booking_ref, customer_email, customer_phone, passenger_count
       FROM bc_transport_bookings WHERE departure_id = $1 AND status = 'confirmed'`,
    [T.toInt(departureId, 0)]
  );
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE bc_transport_bookings
          SET status = 'cancelled', payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END,
              refund_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE 'none' END,
              refund_amount = CASE WHEN payment_status = 'paid' THEN total ELSE 0 END,
              cancel_reason = $2, cancelled_at = NOW(), updated_at = NOW()
        WHERE departure_id = $1 AND status = 'confirmed'`,
      [T.toInt(departureId, 0), T.text(reason, 300) || 'Departure cancelled by the operator']
    );
    await client.query(`DELETE FROM bc_transport_seat_states WHERE departure_id = $1`, [T.toInt(departureId, 0)]);
    await client.query(
      `UPDATE bc_transport_passengers SET status = 'cancelled' WHERE departure_id = $1`,
      [T.toInt(departureId, 0)]
    );
  });
  return bookings.rows;
}

async function saveDeparture(operatorId, actorEmail, role, input = {}) {
  const opId = T.toInt(operatorId, 0);
  const routeId = T.toInt(input.routeId, 0);
  const vehicleId = T.toInt(input.vehicleId, 0);
  if (!routeId) return { ok: false, status: 400, error: 'Choose a route' };
  if (!vehicleId) return { ok: false, status: 400, error: 'Choose a vehicle' };

  const routeRes = await query(
    `SELECT * FROM bc_transport_routes WHERE id = $1 AND operator_id = $2 LIMIT 1`,
    [routeId, opId]
  );
  if (!routeRes.rows.length) return { ok: false, status: 404, error: 'Route not found' };
  const route = routeRes.rows[0];

  const vehicleRes = await query(
    `SELECT * FROM bc_transport_vehicles WHERE id = $1 AND operator_id = $2 LIMIT 1`,
    [vehicleId, opId]
  );
  if (!vehicleRes.rows.length) return { ok: false, status: 404, error: 'Vehicle not found' };
  const vehicle = vehicleRes.rows[0];
  if (vehicle.transport_type !== route.transport_type) {
    return { ok: false, status: 400, error: `This vehicle is a ${vehicle.transport_type}, which cannot run a ${route.transport_type} route` };
  }

  const travelDate = T.isDateISO(input.travelDate) ? T.isoDate(input.travelDate) : '';
  if (!travelDate) return { ok: false, status: 400, error: 'Choose a travel date' };
  const departTime = String(input.departTime || '');
  if (!Tr.isHHMM(departTime)) return { ok: false, status: 400, error: 'Departure time must be HH:MM' };
  const arriveTime = Tr.isHHMM(input.arriveTime)
    ? input.arriveTime
    : Tr.addMinutesHHMM(departTime, route.duration_minutes);
  const seatsTotal = Math.min(600, Math.max(1, T.toInt(input.seatsTotal, 0) || Number(vehicle.capacity || 0) || 1));
  const basePrice = Math.max(0, T.toNumberOrNull(input.basePrice) ?? Number(route.base_price || 0));
  const classes = Tr.classList(input.classes && input.classes.length ? input.classes : route.classes);
  const status = DEPARTURE_STATUSES.includes(String(input.status)) ? String(input.status) : 'scheduled';
  const departureId = T.toInt(input.departureId || input.id, 0);

  const existing = departureId ? await loadDepartureForOperator(opId, departureId) : null;
  if (departureId && !existing) return { ok: false, status: 404, error: 'Departure not found' };

  const shared = [
    routeId, vehicleId, travelDate, departTime, arriveTime,
    Math.max(0, T.toInt(input.boardingCutoffMinutes, 15)), seatsTotal, basePrice,
    T.validCurrency(input.currency) ? input.currency : (route.currency || 'UGX'),
    JSON.stringify(classes), status, Math.max(0, T.toInt(input.salesCloseMinutes, 0)), T.text(input.notes, 300),
  ];

  let saved;
  if (departureId) {
    saved = await query(
      `UPDATE bc_transport_departures
          SET route_id = $3, vehicle_id = $4, travel_date = $5, depart_time = $6, arrive_time = $7,
              boarding_cutoff_minutes = $8, seats_total = $9, base_price = $10, currency = $11,
              classes = $12, status = $13, sales_close_minutes = $14, notes = COALESCE($15,''), updated_at = NOW()
        WHERE id = $1 AND operator_id = $2 RETURNING id`,
      [departureId, opId, ...shared]
    );
    if (!saved.rows.length) return { ok: false, status: 404, error: 'Departure not found' };
  } else {
    saved = await query(
      `INSERT INTO bc_transport_departures
         (operator_id, route_id, vehicle_id, travel_date, depart_time, arrive_time,
          boarding_cutoff_minutes, seats_total, base_price, currency, classes, status, sales_close_minutes, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14,'')) RETURNING id`,
      [opId, ...shared]
    );
  }
  const id = saved.rows[0].id;

  const scheduleChanged = Boolean(existing)
    && (existing.travelDate !== travelDate || existing.departTime !== departTime);

  if (status === 'cancelled' && existing && existing.status !== 'cancelled') {
    const affected = await cancelDepartureBookings(id, T.text(input.notes, 300) || 'Departure cancelled');
    for (const booking of affected) {
      await notifyCustomer({
        email: booking.customer_email,
        phone: booking.customer_phone,
        type: 'BOOKING_CANCELLED',
        title: 'Your transport booking was cancelled',
        message: `The operator cancelled ${route.name} on ${travelDate} at ${departTime}. `
          + `Booking ${booking.booking_ref} has been cancelled and any payment refunded.`,
        actionUrl: '/transport/bookings',
        metadata: { bookingRef: booking.booking_ref, route: route.name, date: travelDate },
      });
    }
  } else if (scheduleChanged) {
    // A rescheduled departure keeps every booking: the passengers are told about
    // the new time instead of losing their seats.
    const affected = await query(
      `SELECT booking_ref, customer_email, customer_phone
         FROM bc_transport_bookings WHERE departure_id = $1 AND status = 'confirmed'`,
      [id]
    );
    for (const booking of affected.rows) {
      await notifyCustomer({
        email: booking.customer_email,
        phone: booking.customer_phone,
        type: 'BOOKING_UPDATED',
        title: 'Your transport departure changed',
        message: `${route.name} now leaves on ${travelDate} at ${departTime}. `
          + `Booking ${booking.booking_ref} is still valid — check your ticket for the new time.`,
        actionUrl: '/transport/bookings',
        metadata: { bookingRef: booking.booking_ref, route: route.name, date: travelDate, time: departTime },
      });
    }
  }

  await writeAudit({
    operatorId: opId, actorEmail, actorRole: role,
    action: departureId ? 'departure_update' : 'departure_create',
    entity: 'departure', entityId: id,
    details: { route: route.name, travelDate, departTime, seatsTotal, basePrice, status, scheduleChanged },
  });

  return { ok: true, departure: mapDeparture(await loadDepartureForOperator(opId, id)) };
}

async function cancelDeparture(operatorId, actorEmail, role, { departureId, reason = '' } = {}) {
  const found = await loadDepartureForOperator(operatorId, departureId);
  if (!found) return { ok: false, status: 404, error: 'Departure not found' };
  if (found.status === 'cancelled') return { ok: true, departure: found };

  await query(
    `UPDATE bc_transport_departures SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND operator_id = $2`,
    [found.id, T.toInt(operatorId, 0)]
  );
  const affected = await cancelDepartureBookings(found.id, T.text(reason, 300) || 'Departure cancelled');
  for (const booking of affected) {
    await notifyCustomer({
      email: booking.customer_email,
      phone: booking.customer_phone,
      type: 'BOOKING_CANCELLED',
      title: 'Your transport booking was cancelled',
      message: `${found.routeName} on ${found.travelDate} at ${found.departTime} was cancelled. `
        + `Booking ${booking.booking_ref} has been cancelled and any payment refunded.`,
      metadata: { bookingRef: booking.booking_ref, route: found.routeName, date: found.travelDate },
    });
  }
  await writeAudit({
    operatorId, actorEmail, actorRole: role, action: 'departure_cancel', entity: 'departure',
    entityId: found.id, details: { reason, bookings: affected.length },
  });
  return { ok: true, departure: mapDeparture(await loadDepartureForOperator(operatorId, found.id)), cancelledBookings: affected.length };
}

// ─── Bookings, manifests and refunds ─────────────────────────────────────────

const BOOKING_SELECT = `
  SELECT b.*, b.travel_date::text AS travel_date,
         o.name AS operator_name, r.name AS route_name, r.transport_type,
         r.classes AS route_classes, d.classes AS departure_classes, v.name AS vehicle_name
    FROM bc_transport_bookings b
    LEFT JOIN bc_transport_operators o ON o.id = b.operator_id
    LEFT JOIN bc_transport_routes r ON r.id = b.route_id
    LEFT JOIN bc_transport_departures d ON d.id = b.departure_id
    LEFT JOIN bc_transport_vehicles v ON v.id = d.vehicle_id
`;

function mapOperatorBooking(row) {
  if (!row) return null;
  return {
    ...Tr.mapBooking(row),
    refundAmount: Number(row.refund_amount || 0),
    refundStatus: row.refund_status || 'none',
    cancelReason: row.cancel_reason || '',
    cancelledAt: row.cancelled_at,
    soldByEmail: row.sold_by_email || '',
  };
}

async function ticketsForBookings(bookingIds = []) {
  if (!bookingIds.length) return new Map();
  const result = await query(
    `SELECT * FROM bc_transport_passengers WHERE booking_id = ANY($1::int[]) ORDER BY id ASC`,
    [bookingIds]
  );
  const byBooking = new Map();
  for (const row of result.rows) {
    if (!byBooking.has(row.booking_id)) byBooking.set(row.booking_id, []);
    byBooking.get(row.booking_id).push({
      id: row.id,
      ticketNo: row.ticket_no,
      qrToken: row.qr_token,
      passengerName: row.passenger_name,
      seatLabel: row.seat_label,
      fareClass: row.fare_class,
      fare: Number(row.fare || 0),
      status: row.status,
      admittedAt: row.admitted_at,
      admittedBy: row.admitted_by || '',
    });
  }
  return byBooking;
}

async function listBookings(operatorId, {
  from = '', to = '', status = '', channel = '', departureId = 0, search = '', limit = 100,
} = {}) {
  const params = [T.toInt(operatorId, 0)];
  const where = ['b.operator_id = $1'];
  const start = T.isDateISO(from) ? T.isoDate(from) : T.addDaysISO(T.isoToday(), -90);
  const end = T.isDateISO(to) ? T.isoDate(to) : T.addDaysISO(T.isoToday(), 180);
  params.push(start);
  where.push(`b.travel_date >= $${params.length}`);
  params.push(end);
  where.push(`b.travel_date <= $${params.length}`);
  if (BOOKING_STATUSES.includes(String(status))) {
    params.push(String(status));
    where.push(`b.status = $${params.length}`);
  }
  if (channel === 'pos' || channel === 'online') {
    params.push(channel);
    where.push(`b.channel = $${params.length}`);
  }
  if (T.toInt(departureId, 0)) {
    params.push(T.toInt(departureId, 0));
    where.push(`b.departure_id = $${params.length}`);
  }
  const term = String(search || '').trim();
  if (term) {
    params.push(`%${term.toLowerCase()}%`);
    where.push(`(LOWER(b.booking_ref) LIKE $${params.length} OR LOWER(b.customer_name) LIKE $${params.length}
      OR LOWER(b.customer_email) LIKE $${params.length} OR LOWER(b.customer_phone) LIKE $${params.length})`);
  }
  params.push(Math.min(500, Math.max(1, T.toInt(limit, 100))));

  const result = await query(
    `${BOOKING_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY b.created_at DESC LIMIT $${params.length}`,
    params
  );
  const tickets = await ticketsForBookings(result.rows.map((row) => row.id));
  return result.rows.map((row) => mapOperatorBooking({ ...row, tickets: tickets.get(row.id) || [] }));
}

async function bookingDetail(operatorId, ref) {
  const code = String(ref || '').trim().toUpperCase();
  if (!code) return { ok: false, status: 400, error: 'bookingRef is required' };
  const result = await query(
    `${BOOKING_SELECT} WHERE b.booking_ref = $1 AND b.operator_id = $2 LIMIT 1`,
    [code, T.toInt(operatorId, 0)]
  );
  const row = result.rows[0];
  if (!row) return { ok: false, status: 404, error: 'Booking not found' };
  const tickets = await ticketsForBookings([row.id]);
  return { ok: true, order: mapOperatorBooking({ ...row, tickets: tickets.get(row.id) || [] }) };
}

async function settleBooking(operatorId, actorEmail, role, { ref, paymentMethod = 'cash', paymentRef = '' } = {}) {
  const code = String(ref || '').trim().toUpperCase();
  const method = PAYMENT_METHODS.includes(String(paymentMethod)) ? String(paymentMethod) : 'cash';
  const updated = await query(
    `UPDATE bc_transport_bookings
        SET payment_status = 'paid', payment_method = $3, sold_by_email = COALESCE($4,''), updated_at = NOW()
      WHERE booking_ref = $1 AND operator_id = $2 AND status <> 'cancelled'
      RETURNING id, booking_ref, total, currency, departure_id, channel`,
    [code, T.toInt(operatorId, 0), method === 'card' ? 'card' : 'counter', String(actorEmail || '').toLowerCase()]
  );
  if (!updated.rows.length) return { ok: false, status: 404, error: 'Booking not found or already cancelled' };
  const row = updated.rows[0];
  if (row.channel === 'pos') {
    await query(
      `INSERT INTO bc_transport_pos_sales
         (operator_id, departure_id, booking_id, staff_email, staff_name, payment_method, payment_ref, amount, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [T.toInt(operatorId, 0), row.departure_id, row.id, String(actorEmail || '').toLowerCase(), '', method, T.text(paymentRef, 80), Number(row.total || 0), row.currency || 'UGX']
    );
  }
  await writeAudit({
    operatorId, actorEmail, actorRole: role, action: 'booking_settle', entity: 'booking', entityId: row.booking_ref,
    details: { method, paymentRef: T.text(paymentRef, 80), total: Number(row.total || 0) },
  });
  return bookingDetail(operatorId, row.booking_ref);
}

/** What a refund would pay for this booking right now, without changing anything. */
function refundQuote(booking, settings) {
  const hours = hoursUntil(booking?.travelDate || booking?.travel_date, booking?.departTime || booking?.depart_time);
  const window = Number(settings?.refundWindowHours ?? DEFAULT_SETTINGS.refundWindowHours);
  const feePercent = hours >= window ? Number(settings?.cancellationFeePercent ?? 0) : 100;
  const total = Number(booking?.total || 0);
  const amount = T.round2(total * (1 - Math.min(100, Math.max(0, feePercent)) / 100));
  return {
    eligible: hours >= window && total > 0,
    hoursAhead: Math.round(hours * 10) / 10,
    refundWindowHours: window,
    feePercent,
    refundAmount: Math.max(0, amount),
  };
}

async function refundBooking(operatorId, actorEmail, role, { ref, reason = '' } = {}) {
  const opId = T.toInt(operatorId, 0);
  const found = await query(
    `SELECT b.*, b.travel_date::text AS travel_date, o.settings
       FROM bc_transport_bookings b
       JOIN bc_transport_operators o ON o.id = b.operator_id
      WHERE b.booking_ref = $1 AND b.operator_id = $2 LIMIT 1`,
    [String(ref || '').trim().toUpperCase(), opId]
  );
  const row = found.rows[0];
  if (!row) return { ok: false, status: 404, error: 'Booking not found' };
  if (row.status === 'cancelled') {
    const order = await bookingDetail(opId, row.booking_ref);
    return { ok: true, order: order.order, refundAmount: Number(row.refund_amount || 0), alreadyCancelled: true };
  }

  const quote = refundQuote({ ...row, travelDate: row.travel_date }, settingsOf({ settings: row.settings }));
  const refundAmount = row.payment_status === 'paid' ? quote.refundAmount : 0;

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE bc_transport_bookings
          SET status = 'cancelled',
              payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END,
              refund_status = CASE WHEN $3::numeric > 0 THEN 'refunded' ELSE refund_status END,
              refund_amount = $3, cancel_reason = $2, cancelled_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [row.id, T.text(reason, 300) || 'Cancelled by the operator', refundAmount]
    );
    await client.query(`DELETE FROM bc_transport_seat_states WHERE booking_id = $1`, [row.id]);
    await client.query(`UPDATE bc_transport_passengers SET status = 'cancelled' WHERE booking_id = $1`, [row.id]);
  });

  await notifyCustomer({
    email: row.customer_email,
    phone: row.customer_phone,
    type: 'PAYMENT_REFUNDED',
    title: 'Your transport booking was cancelled',
    message: `Booking ${row.booking_ref} was cancelled. `
      + (refundAmount > 0
        ? `${T.round2(refundAmount).toFixed(2)} ${row.currency || 'UGX'} is being refunded to your payment method.`
        : 'No refund applies under the operator\'s cancellation policy.'),
    metadata: { bookingRef: row.booking_ref, refundAmount, feePercent: quote.feePercent },
  });
  await writeAudit({
    operatorId: opId, actorEmail, actorRole: role, action: 'booking_refund', entity: 'booking',
    entityId: row.booking_ref, details: { reason, refundAmount, feePercent: quote.feePercent, total: Number(row.total || 0) },
  });

  const order = await bookingDetail(opId, row.booking_ref);
  return { ok: true, order: order.order, refundAmount, quote };
}

// ─── Counter sales ───────────────────────────────────────────────────────────

/**
 * Sell at the counter. The counter and the website share one inventory: the sale
 * goes through the same hold + booking transaction as an online purchase, then
 * records the staff member and the payment against it.
 */
async function posSell(operatorId, staff, input = {}) {
  const opId = T.toInt(operatorId, 0);
  const departureId = T.toInt(input.departureId, 0);
  if (!departureId) return { ok: false, status: 400, error: 'Choose a departure' };

  const found = await loadDepartureForOperator(opId, departureId);
  if (!found) return { ok: false, status: 404, error: 'Departure not found' };
  if (found.status !== 'scheduled') return { ok: false, status: 409, error: 'This departure is no longer on sale' };

  const passengers = (Array.isArray(input.passengers) ? input.passengers : [])
    .map((entry, index) => ({ name: T.text(entry?.name || '', 120) }))
    .slice(0, Tr.MAX_PASSENGERS);
  if (!passengers.length) return { ok: false, status: 400, error: 'Enter at least one passenger' };

  const customer = {
    name: T.text(input.customer?.name || passengers[0].name, 160),
    email: T.text(input.customer?.email || '', 160).toLowerCase(),
    phone: T.text(input.customer?.phone || '', 40),
  };
  if (!customer.name) return { ok: false, status: 400, error: 'Enter the lead passenger name' };
  if (!T.validEmail(customer.email)) return { ok: false, status: 400, error: 'Enter a valid email for the ticket receipt' };

  const seatIds = Array.isArray(input.seatIds) ? input.seatIds.map((id) => T.toInt(id, 0)).filter(Boolean) : [];
  const paymentMethod = PAYMENT_METHODS.includes(String(input.paymentMethod)) ? String(input.paymentMethod) : 'cash';

  const hold = await Tr.createHold({
    departureId,
    seatIds,
    fromStop: T.toInt(input.fromStop, 0) || 1,
    toStop: T.toInt(input.toStop, 0) || 99,
    passengers: passengers.length,
    fareClass: input.fareClass || 'standard',
    customerEmail: customer.email,
    // Counter sales ignore the operator's online pause.
    online: false,
  });
  if (!hold.ok) return hold;

  const booked = await Tr.createBooking({
    holdRef: hold.hold.holdRef,
    passengers,
    customer,
    paymentMethod: 'counter',
  });
  if (!booked.ok) {
    await Tr.releaseHold(hold.hold.holdRef);
    return booked;
  }

  const order = booked.order;
  const ticketRefs = order.tickets.map((ticket) => ticket.ticketNo).join(',');
  await query(
    `UPDATE bc_transport_bookings
        SET channel = 'pos', payment_status = 'paid', payment_method = $3, sold_by_email = COALESCE($4,''), updated_at = NOW()
      WHERE id = $1 AND operator_id = $2`,
    [order.id, opId, paymentMethod === 'card' ? 'card' : 'counter', String(staff?.email || '').toLowerCase()]
  );
  await query(
    `INSERT INTO bc_transport_pos_sales
       (operator_id, departure_id, booking_id, staff_email, staff_name, payment_method, payment_ref, amount, currency, ticket_refs)
     VALUES ($1,$2,$3,COALESCE($4,''),COALESCE($5,''),$6,COALESCE($7,''),$8,$9,COALESCE($10,''))`,
    [
      opId, departureId, order.id, String(staff?.email || '').toLowerCase(), T.text(staff?.name || '', 120),
      paymentMethod, T.text(input.paymentRef, 80), Number(order.total || 0), order.currency || 'UGX', ticketRefs,
    ]
  );
  await writeAudit({
    operatorId: opId, actorEmail: staff?.email, actorRole: staff?.role, action: 'pos_sale', entity: 'booking',
    entityId: order.bookingRef, details: { departureId, seats: order.seatLabels, total: order.total, paymentMethod },
  });

  const detail = await bookingDetail(opId, order.bookingRef);
  return { ok: true, order: detail.order || { ...order, paymentStatus: 'paid', channel: 'pos' } };
}

// ─── Staff ───────────────────────────────────────────────────────────────────

async function listStaff(operatorId) {
  const [staff, operator] = await Promise.all([
    query(`SELECT * FROM bc_transport_staff WHERE operator_id = $1 ORDER BY created_at ASC`, [T.toInt(operatorId, 0)]),
    query(`SELECT owner_email FROM bc_transport_operators WHERE id = $1`, [T.toInt(operatorId, 0)]),
  ]);
  const owner = operator.rows[0]?.owner_email || '';
  return [
    {
      id: 0, email: owner, name: 'Owner', role: 'owner', roleLabel: ROLE_LABELS.owner,
      status: 'active', owner: true,
    },
    ...staff.rows.map((row) => ({
      id: row.id, email: row.email, name: row.name, role: row.role,
      roleLabel: ROLE_LABELS[row.role] || row.role, status: row.status, owner: false,
      createdAt: row.created_at,
    })),
  ];
}

async function saveStaff(operatorId, actorEmail, role, { email, name = '', role: staffRole = 'agent', status = 'active' } = {}) {
  const opId = T.toInt(operatorId, 0);
  const who = String(email || '').trim().toLowerCase();
  if (!T.validEmail(who)) return { ok: false, status: 400, error: 'Enter a valid staff email' };
  const wanted = OPERATOR_ROLES.includes(String(staffRole)) ? String(staffRole) : 'agent';
  if (wanted === 'owner') return { ok: false, status: 400, error: 'The owner role belongs to the account holder' };
  const operator = await query(`SELECT owner_email FROM bc_transport_operators WHERE id = $1`, [opId]);
  if (!operator.rows.length) return { ok: false, status: 404, error: 'Transport operator not found' };
  if (String(operator.rows[0].owner_email || '').toLowerCase() === who) {
    return { ok: false, status: 400, error: 'That email already owns this operator' };
  }
  const state = status === 'disabled' ? 'disabled' : 'active';
  const saved = await query(
    `INSERT INTO bc_transport_staff (operator_id, email, name, role, status)
     VALUES ($1,$2,COALESCE($3,''),$4,$5)
     ON CONFLICT (operator_id, email) DO UPDATE
       SET name = EXCLUDED.name, role = EXCLUDED.role, status = EXCLUDED.status, updated_at = NOW()
     RETURNING *`,
    [opId, who, T.text(name, 120), wanted, state]
  );
  await writeAudit({
    operatorId: opId, actorEmail, actorRole: role, action: 'staff_save', entity: 'staff',
    entityId: saved.rows[0].id, details: { email: who, role: wanted, status: state },
  });
  return { ok: true, staff: await listStaff(opId) };
}

async function removeStaff(operatorId, actorEmail, role, staffId) {
  const deleted = await query(
    `DELETE FROM bc_transport_staff WHERE id = $1 AND operator_id = $2 RETURNING email`,
    [T.toInt(staffId, 0), T.toInt(operatorId, 0)]
  );
  if (!deleted.rows.length) return { ok: false, status: 404, error: 'Staff member not found' };
  await writeAudit({
    operatorId, actorEmail, actorRole: role, action: 'staff_remove', entity: 'staff',
    entityId: staffId, details: { email: deleted.rows[0].email },
  });
  return { ok: true, staff: await listStaff(operatorId) };
}

// ─── Reporting ───────────────────────────────────────────────────────────────

async function operatorOverview(operatorId) {
  const opId = T.toInt(operatorId, 0);
  const stats = await query(
    `SELECT
       (SELECT COUNT(*) FROM bc_transport_routes WHERE operator_id = $1 AND status = 'published')::int AS published_routes,
       (SELECT COUNT(*) FROM bc_transport_vehicles WHERE operator_id = $1 AND status = 'active')::int AS vehicles,
       (SELECT COUNT(*) FROM bc_transport_departures WHERE operator_id = $1 AND travel_date = CURRENT_DATE AND status = 'scheduled')::int AS today_departures,
       (SELECT COUNT(*) FROM bc_transport_departures WHERE operator_id = $1 AND travel_date > CURRENT_DATE AND status = 'scheduled')::int AS upcoming_departures,
       (SELECT COALESCE(SUM(passenger_count), 0) FROM bc_transport_bookings WHERE operator_id = $1 AND status = 'confirmed')::int AS tickets_sold,
       (SELECT COALESCE(SUM(total), 0) FROM bc_transport_bookings WHERE operator_id = $1 AND status = 'confirmed') AS gross_revenue,
       (SELECT COALESCE(SUM(total), 0) FROM bc_transport_bookings WHERE operator_id = $1 AND status = 'confirmed' AND payment_status <> 'paid') AS pending_payments,
       (SELECT COUNT(*) FROM bc_transport_bookings WHERE operator_id = $1 AND status = 'confirmed' AND payment_status <> 'paid')::int AS pending_count,
       (SELECT COUNT(*) FROM bc_transport_bookings WHERE operator_id = $1 AND status = 'cancelled')::int AS cancellations,
       (SELECT COALESCE(SUM(refund_amount), 0) FROM bc_transport_bookings WHERE operator_id = $1 AND refund_status = 'refunded') AS refunds,
       (SELECT COUNT(*) FROM bc_transport_bookings WHERE operator_id = $1 AND channel = 'pos' AND status = 'confirmed')::int AS counter_sales,
       -- The currency most of this operator's routes are priced in, for the UI.
       COALESCE((SELECT r.currency FROM bc_transport_routes r WHERE r.operator_id = $1
                  GROUP BY r.currency ORDER BY COUNT(*) DESC LIMIT 1), 'UGX') AS currency`,
    [opId]
  );
  const departures = await listDepartures(opId, {
    from: T.isoToday(),
    to: T.addDaysISO(T.isoToday(), 7),
    limit: 25,
  });
  const recent = await listBookings(opId, { limit: 10, from: T.addDaysISO(T.isoToday(), -30), to: T.addDaysISO(T.isoToday(), 180) });
  return { stats: stats.rows[0], departures, recentBookings: recent };
}

async function operatorReport(operatorId, { from = '', to = '' } = {}) {
  const opId = T.toInt(operatorId, 0);
  const start = T.isDateISO(from) ? T.isoDate(from) : T.addDaysISO(T.isoToday(), -30);
  const end = T.isDateISO(to) ? T.isoDate(to) : T.isoToday();
  const [summary, byRoute, byType, byChannel, byDay, occupancy, recent] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS bookings,
              COALESCE(SUM(passenger_count), 0)::int AS tickets,
              COALESCE(SUM(total), 0) AS gross,
              COALESCE(SUM(refund_amount), 0) AS refunds,
              COUNT(*) FILTER (WHERE payment_status <> 'paid' AND status = 'confirmed')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
              COUNT(*) FILTER (WHERE payment_status = 'failed')::int AS failed,
              COALESCE((SELECT r.currency FROM bc_transport_routes r WHERE r.operator_id = $1
                         GROUP BY r.currency ORDER BY COUNT(*) DESC LIMIT 1), 'UGX') AS currency
         FROM bc_transport_bookings
        WHERE operator_id = $1 AND travel_date BETWEEN $2 AND $3`,
      [opId, start, end]
    ),
    query(
      `SELECT r.id, r.name, r.transport_type, COUNT(b.id)::int AS bookings,
              COALESCE(SUM(b.passenger_count), 0)::int AS tickets, COALESCE(SUM(b.total), 0) AS revenue
         FROM bc_transport_bookings b JOIN bc_transport_routes r ON r.id = b.route_id
        WHERE b.operator_id = $1 AND b.status = 'confirmed' AND b.travel_date BETWEEN $2 AND $3
        GROUP BY r.id, r.name, r.transport_type ORDER BY revenue DESC`,
      [opId, start, end]
    ),
    query(
      `SELECT r.transport_type, COUNT(b.id)::int AS bookings, COALESCE(SUM(b.total), 0) AS revenue
         FROM bc_transport_bookings b JOIN bc_transport_routes r ON r.id = b.route_id
        WHERE b.operator_id = $1 AND b.status = 'confirmed' AND b.travel_date BETWEEN $2 AND $3
        GROUP BY r.transport_type`,
      [opId, start, end]
    ),
    query(
      `SELECT channel, COUNT(*)::int AS bookings, COALESCE(SUM(total), 0) AS revenue
         FROM bc_transport_bookings
        WHERE operator_id = $1 AND status = 'confirmed' AND travel_date BETWEEN $2 AND $3
        GROUP BY channel`,
      [opId, start, end]
    ),
    query(
      `SELECT travel_date::text AS date, COUNT(*)::int AS bookings, COALESCE(SUM(passenger_count), 0)::int AS tickets,
              COALESCE(SUM(total), 0) AS revenue
         FROM bc_transport_bookings
        WHERE operator_id = $1 AND status = 'confirmed' AND travel_date BETWEEN $2 AND $3
        GROUP BY travel_date ORDER BY travel_date ASC`,
      [opId, start, end]
    ),
    query(
      `SELECT d.id, d.travel_date::text AS date, d.depart_time, d.seats_total, r.name AS route_name,
              COALESCE(SUM(b.passenger_count), 0)::int AS sold
         FROM bc_transport_departures d
         JOIN bc_transport_routes r ON r.id = d.route_id
         LEFT JOIN bc_transport_bookings b ON b.departure_id = d.id AND b.status = 'confirmed'
        WHERE d.operator_id = $1 AND d.travel_date BETWEEN $2 AND $3 AND d.status = 'scheduled'
        GROUP BY d.id, d.travel_date, d.depart_time, d.seats_total, r.name
        ORDER BY d.travel_date ASC, d.depart_time ASC LIMIT 100`,
      [opId, start, end]
    ),
    query(
      `SELECT * FROM bc_transport_audit WHERE operator_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [opId]
    ),
  ]);

  const totals = summary.rows[0] || {};
  const gross = Number(totals.gross || 0);
  return {
    from: start,
    to: end,
    currency: totals.currency || 'UGX',
    summary: {
      bookings: Number(totals.bookings || 0),
      tickets: Number(totals.tickets || 0),
      gross,
      refunds: Number(totals.refunds || 0),
      net: T.round2(gross - Number(totals.refunds || 0)),
      pending: Number(totals.pending || 0),
      cancelled: Number(totals.cancelled || 0),
      failedPayments: Number(totals.failed || 0),
    },
    byRoute: byRoute.rows.map((row) => ({ ...row, revenue: Number(row.revenue || 0) })),
    byType: byType.rows.map((row) => ({ ...row, revenue: Number(row.revenue || 0) })),
    byChannel: byChannel.rows.map((row) => ({ ...row, revenue: Number(row.revenue || 0) })),
    byDay: byDay.rows.map((row) => ({ ...row, revenue: Number(row.revenue || 0) })),
    occupancy: occupancy.rows.map((row) => ({
      ...row,
      seatsTotal: Number(row.seats_total || 0),
      sold: Number(row.sold || 0),
      occupancy: Number(row.seats_total || 0) > 0 ? Math.round((Number(row.sold || 0) / Number(row.seats_total)) * 100) : 0,
    })),
    recentAudit: recent.rows,
  };
}

/** Booking ledger as CSV — the format accountants and operators actually open. */
async function reportCsv(operatorId, { from = '', to = '' } = {}) {
  const orders = await listBookings(operatorId, {
    from: T.isDateISO(from) ? from : T.addDaysISO(T.isoToday(), -30),
    to: T.isDateISO(to) ? to : T.isoToday(),
    limit: 500,
  });

  const header = [
    'Booking', 'Travel date', 'Departure', 'Route', 'Transport', 'Customer', 'Email', 'Phone',
    'Passengers', 'Seats', 'Class', 'Channel', 'Payment status', 'Payment method', 'Total',
    'Currency', 'Status', 'Refund', 'Sold by',
  ];
  const escape = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = orders.map((order) => [
    order.bookingRef, order.travelDate, order.departTime, order.routeName, order.transportLabel,
    order.customerName, order.customerEmail, order.customerPhone, order.passengerCount,
    order.seatLabels.join(' '), order.fareClassName || order.fareClass, order.channel,
    order.paymentStatus, order.paymentMethod, order.total, order.currency, order.status,
    order.refundAmount || 0, order.soldByEmail,
  ]);

  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

async function myBookings(email, { limit = 30 } = {}) {
  const who = String(email || '').trim().toLowerCase();
  if (!T.validEmail(who)) return { ok: false, status: 400, error: 'A valid email is required' };
  const result = await query(
    `${BOOKING_SELECT} WHERE LOWER(b.customer_email) = $1 ORDER BY b.travel_date DESC, b.depart_time DESC LIMIT $2`,
    [who, Math.min(100, Math.max(1, T.toInt(limit, 30)))]
  );
  const tickets = await ticketsForBookings(result.rows.map((row) => row.id));
  return { ok: true, orders: result.rows.map((row) => mapOperatorBooking({ ...row, tickets: tickets.get(row.id) || [] })) };
}

// ─── Platform administration ─────────────────────────────────────────────────

async function adminOverview() {
  const stats = await query(
    `SELECT
       (SELECT COUNT(*) FROM bc_transport_operators)::int AS operators,
       (SELECT COUNT(*) FROM bc_transport_operators WHERE status = 'pending')::int AS pending_operators,
       (SELECT COUNT(*) FROM bc_transport_operators WHERE status = 'approved')::int AS approved_operators,
       (SELECT COUNT(*) FROM bc_transport_departures WHERE travel_date = CURRENT_DATE AND status = 'scheduled')::int AS departures_today,
       (SELECT COUNT(*) FROM bc_transport_routes WHERE status = 'published')::int AS published_routes,
       (SELECT COALESCE(SUM(passenger_count), 0) FROM bc_transport_bookings WHERE status = 'confirmed')::int AS tickets_sold,
       (SELECT COALESCE(SUM(total), 0) FROM bc_transport_bookings WHERE status = 'confirmed') AS gross_revenue,
       (SELECT COALESCE(SUM(total), 0) FROM bc_transport_bookings WHERE status = 'confirmed' AND payment_status = 'paid') AS paid_revenue,
       (SELECT COALESCE(SUM(refund_amount), 0) FROM bc_transport_bookings WHERE refund_status = 'refunded') AS refunds,
       (SELECT COUNT(*) FROM bc_transport_bookings WHERE channel = 'pos' AND status = 'confirmed')::int AS counter_sales,
       -- Platform-wide reporting currency: whichever the network prices in most.
       COALESCE((SELECT currency FROM bc_transport_routes GROUP BY currency ORDER BY COUNT(*) DESC LIMIT 1), 'UGX') AS currency`
  );
  const pending = await query(
    `SELECT * FROM bc_transport_operators WHERE status = 'pending' ORDER BY created_at ASC LIMIT 20`
  );
  const operators = await query(
    `SELECT o.*,
            (SELECT COUNT(*) FROM bc_transport_routes r WHERE r.operator_id = o.id)::int AS route_count,
            (SELECT COUNT(*) FROM bc_transport_departures d WHERE d.operator_id = o.id AND d.travel_date >= CURRENT_DATE)::int AS upcoming_departures,
            (SELECT COALESCE(SUM(b.total), 0) FROM bc_transport_bookings b WHERE b.operator_id = o.id AND b.status = 'confirmed') AS revenue,
            -- Each operator may price in its own currency, so carry it with the revenue.
            COALESCE((SELECT r.currency FROM bc_transport_routes r WHERE r.operator_id = o.id
                       GROUP BY r.currency ORDER BY COUNT(*) DESC LIMIT 1), '') AS currency
       FROM bc_transport_operators o ORDER BY o.name ASC`
  );
  const row = stats.rows[0] || {};
  const gross = Number(row.gross_revenue || 0);
  return {
    stats: {
      operators: Number(row.operators || 0),
      pendingOperators: Number(row.pending_operators || 0),
      approvedOperators: Number(row.approved_operators || 0),
      departuresToday: Number(row.departures_today || 0),
      publishedRoutes: Number(row.published_routes || 0),
      ticketsSold: Number(row.tickets_sold || 0),
      grossRevenue: gross,
      paidRevenue: Number(row.paid_revenue || 0),
      refunds: Number(row.refunds || 0),
      counterSales: Number(row.counter_sales || 0),
      currency: row.currency || 'UGX',
    },
    pending: pending.rows.map(mapOperator),
    operators: operators.rows.map((entry) => ({
      ...mapOperator(entry),
      routeCount: Number(entry.route_count || 0),
      upcomingDepartures: Number(entry.upcoming_departures || 0),
      revenue: Number(entry.revenue || 0),
      currency: entry.currency || row.currency || 'UGX',
    })),
  };
}

async function setOperatorStatus({ operatorId, status, actorEmail, note = '' } = {}) {
  const next = OPERATOR_STATUSES.includes(String(status)) ? String(status) : '';
  if (!next) return { ok: false, status: 400, error: 'Unknown operator status' };
  const updated = await query(
    `UPDATE bc_transport_operators SET status = $2, updated_at = NOW() WHERE id = $1
     RETURNING id, name, owner_email, status`,
    [T.toInt(operatorId, 0), next]
  );
  if (!updated.rows.length) return { ok: false, status: 404, error: 'Transport operator not found' };
  const row = updated.rows[0];
  await writeAudit({
    operatorId: row.id, actorEmail, actorRole: 'admin', action: 'operator_status',
    entity: 'operator', entityId: row.id, details: { status: next, note: T.text(note, 300) },
  });
  await notifyCustomer({
    email: row.owner_email,
    type: next === 'approved' ? 'BOOKING_CONFIRMED' : 'BOOKING_UPDATED',
    title: next === 'approved' ? 'Your transport operator is approved' : `Your transport operator is ${next}`,
    message: next === 'approved'
      ? `${row.name} is now live on BookingCart. Publish your routes and departures to start selling.`
      : `The platform set ${row.name} to ${next}. ${note || ''}`.trim(),
    actionUrl: '/transport/dashboard',
  });
  return { ok: true, operator: mapOperator(row) };
}

async function setOperatorCommission({ operatorId, percent, actorEmail } = {}) {
  const value = Number(percent);
  if (!Number.isFinite(value) || value < 0 || value > 50) {
    return { ok: false, status: 400, error: 'Commission must be between 0 and 50 percent' };
  }
  const updated = await query(
    `UPDATE bc_transport_operators SET commission_percent = $2, updated_at = NOW() WHERE id = $1
     RETURNING id, name, commission_percent`,
    [T.toInt(operatorId, 0), T.round2(value)]
  );
  if (!updated.rows.length) return { ok: false, status: 404, error: 'Transport operator not found' };
  await writeAudit({
    operatorId: updated.rows[0].id, actorEmail, actorRole: 'admin', action: 'operator_commission',
    entity: 'operator', entityId: updated.rows[0].id, details: { percent: T.round2(value) },
  });
  return { ok: true, operator: updated.rows[0] };
}

async function adminLocations({ kind = '', term = '', limit = 200 } = {}) {
  const params = [];
  const where = [];
  if (['terminal', 'port', 'station'].includes(String(kind))) {
    params.push(String(kind));
    where.push(`kind = $${params.length}`);
  }
  const search = String(term || '').trim();
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(city) LIKE $${params.length} OR LOWER(code) LIKE $${params.length})`);
  }
  params.push(Math.min(500, Math.max(1, T.toInt(limit, 200))));
  const result = await query(
    `SELECT * FROM bc_transport_locations ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY kind ASC, name ASC LIMIT $${params.length}`,
    params
  );
  return result.rows.map((row) => ({
    id: row.id, name: row.name, kind: row.kind, city: row.city, country: row.country,
    code: row.code, latitude: row.latitude, longitude: row.longitude, status: row.status,
  }));
}

async function saveLocation(actorEmail, input = {}) {
  const name = T.text(input.name, 160);
  if (!name) return { ok: false, status: 400, error: 'Enter the location name' };
  const kind = ['terminal', 'port', 'station'].includes(String(input.kind)) ? String(input.kind) : 'terminal';
  const status = input.status === 'inactive' ? 'inactive' : 'active';
  const locationId = T.toInt(input.locationId || input.id, 0);
  if (locationId) {
    const updated = await query(
      `UPDATE bc_transport_locations
          SET name = $2, kind = $3, city = COALESCE($4,''), country = COALESCE($5,''), code = COALESCE($6,''), latitude = $7, longitude = $8, status = $9
        WHERE id = $1 RETURNING *`,
      [locationId, name, kind, T.text(input.city, 80), T.text(input.country, 80), T.text(input.code, 10),
        T.toNumberOrNull(input.latitude), T.toNumberOrNull(input.longitude), status]
    );
    if (!updated.rows.length) return { ok: false, status: 404, error: 'Location not found' };
    await writeAudit({ actorEmail, actorRole: 'admin', action: 'location_update', entity: 'location', entityId: locationId, details: { name, kind } });
    return { ok: true, location: updated.rows[0] };
  }
  const inserted = await query(
    `INSERT INTO bc_transport_locations (name, kind, city, country, code, latitude, longitude, status)
     VALUES ($1,$2,COALESCE($3,''),COALESCE($4,''),COALESCE($5,''),$6,$7,$8) RETURNING *`,
    [name, kind, T.text(input.city, 80), T.text(input.country, 80), T.text(input.code, 10),
      T.toNumberOrNull(input.latitude), T.toNumberOrNull(input.longitude), status]
  );
  await writeAudit({ actorEmail, actorRole: 'admin', action: 'location_create', entity: 'location', entityId: inserted.rows[0].id, details: { name, kind } });
  return { ok: true, location: inserted.rows[0] };
}

async function adminAudit({ operatorId = 0, limit = 100 } = {}) {
  const params = [];
  const where = [];
  if (T.toInt(operatorId, 0)) {
    params.push(T.toInt(operatorId, 0));
    where.push(`operator_id = $${params.length}`);
  }
  params.push(Math.min(500, Math.max(1, T.toInt(limit, 100))));
  const result = await query(
    `SELECT a.*, o.name AS operator_name
       FROM bc_transport_audit a
       LEFT JOIN bc_transport_operators o ON o.id = a.operator_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.created_at DESC LIMIT $${params.length}`,
    params
  );
  return result.rows.map((row) => ({
    id: row.id, operatorId: row.operator_id, operatorName: row.operator_name || '',
    actorEmail: row.actor_email, actorRole: row.actor_role, action: row.action,
    entity: row.entity, entityId: row.entity_id, details: row.details || {}, createdAt: row.created_at,
  }));
}

async function adminReport({ from = '', to = '' } = {}) {
  const start = T.isDateISO(from) ? T.isoDate(from) : T.addDaysISO(T.isoToday(), -30);
  const end = T.isDateISO(to) ? T.isoDate(to) : T.isoToday();
  const result = await query(
    `SELECT o.id, o.name, o.status, o.commission_percent,
            COUNT(b.id)::int AS bookings,
            COALESCE(SUM(b.passenger_count), 0)::int AS tickets,
            COALESCE(SUM(b.total), 0) AS gross,
            COALESCE(SUM(b.refund_amount), 0) AS refunds,
            COALESCE((SELECT currency FROM bc_transport_routes GROUP BY currency ORDER BY COUNT(*) DESC LIMIT 1), 'UGX') AS currency
       FROM bc_transport_operators o
       LEFT JOIN bc_transport_bookings b
              ON b.operator_id = o.id AND b.status = 'confirmed' AND b.travel_date BETWEEN $1 AND $2
      GROUP BY o.id, o.name, o.status, o.commission_percent
      ORDER BY gross DESC`,
    [start, end]
  );
  const operators = result.rows.map((row) => {
    const gross = Number(row.gross || 0);
    const commission = T.round2(gross * (Number(row.commission_percent || 0) / 100));
    return {
      id: row.id, name: row.name, status: row.status,
      commissionPercent: Number(row.commission_percent || 0),
      currency: row.currency || 'UGX',
      bookings: Number(row.bookings || 0), tickets: Number(row.tickets || 0),
      gross, refunds: Number(row.refunds || 0), commission,
      net: T.round2(gross - commission - Number(row.refunds || 0)),
    };
  });
  return {
    from: start,
    to: end,
    currency: operators[0]?.currency || 'UGX',
    operators,
    totals: operators.reduce((sum, entry) => ({
      bookings: sum.bookings + entry.bookings,
      tickets: sum.tickets + entry.tickets,
      gross: T.round2(sum.gross + entry.gross),
      refunds: T.round2(sum.refunds + entry.refunds),
      commission: T.round2(sum.commission + entry.commission),
      net: T.round2(sum.net + entry.net),
    }), { bookings: 0, tickets: 0, gross: 0, refunds: 0, commission: 0, net: 0 }),
  };
}

module.exports = {
  BOOKING_STATUSES,
  DEPARTURE_STATUSES,
  OPERATOR_ROLES,
  OPERATOR_STATUSES,
  PAYMENT_METHODS,
  ROLE_CAPS,
  ROLE_LABELS,
  ROUTE_STATUSES,
  adminAudit,
  adminLocations,
  adminOverview,
  adminReport,
  applyAsOperator,
  bookingDetail,
  cancelDeparture,
  getVehicleSeats,
  hoursUntil,
  listBookings,
  listDepartures,
  listOperatorsFor,
  listRoutes,
  listStaff,
  listVehicles,
  mapDeparture,
  mapOperator,
  mapOperatorBooking,
  mapRoute,
  mapSeat,
  mapVehicle,
  myBookings,
  operatorOverview,
  operatorReport,
  posSell,
  refundBooking,
  refundQuote,
  removeStaff,
  reportCsv,
  requireOperator,
  roleAllows,
  routeStopsFor,
  saveDeparture,
  saveLocation,
  saveOperatorSettings,
  saveRoute,
  saveSeatLayout,
  saveStaff,
  saveVehicle,
  setOperatorCommission,
  setOperatorStatus,
  setRouteStatus,
  settingsOf,
  settleBooking,
  writeAudit,
};
