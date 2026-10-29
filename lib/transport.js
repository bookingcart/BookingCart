// Transport booking — bus, boat/ferry and train.
//
// The inventory model mirrors the cinema module: a vehicle owns the permanent seat
// identity, a departure owns only the *state* of those seats, and a state row is
// scoped to the booked segment (from_stop → to_stop). Two passengers may therefore
// hold the same berth on a long train run as long as their journeys do not overlap.
//
// Every price is recomputed here from the database, never accepted from the client.

const crypto = require('crypto');
const { query, isDbConfigured, initDb, withTransaction } = require('./db');
const T = require('./ticketing');

const MAX_PASSENGERS = 10;
const DEFAULT_HOLD_MINUTES = 15;
const MAX_HOLD_MINUTES = 45;

const TYPE_LABELS = { bus: 'Bus', boat: 'Boat & Ferry', train: 'Train' };
// Which kind of stop a transport type boards at.
const TYPE_STOP_KIND = { bus: 'terminal', boat: 'port', train: 'station' };
const DEFAULT_CLASSES = [{ code: 'standard', name: 'Standard', multiplier: 1 }];

function isType(value) {
  return Object.prototype.hasOwnProperty.call(TYPE_LABELS, String(value || '').toLowerCase());
}

function typeOf(value) {
  const key = String(value || '').toLowerCase();
  return isType(key) ? key : 'bus';
}

function classList(value) {
  const list = Array.isArray(value) ? value : [];
  const cleaned = list
    .map((entry) => ({
      code: T.text(entry?.code || entry?.name || '', 40).toLowerCase(),
      name: T.text(entry?.name || entry?.code || '', 80),
      multiplier: Number(entry?.multiplier) > 0 ? Number(entry.multiplier) : 1,
    }))
    .filter((entry) => entry.code);
  return cleaned.length ? cleaned : DEFAULT_CLASSES.slice();
}

function resolveClass(classes, code) {
  const list = classList(classes);
  const wanted = String(code || '').toLowerCase();
  return list.find((entry) => entry.code === wanted) || list[0];
}

// lib/ticketing keeps isTimeHHMM private, so transport carries its own clock helper.
function isHHMM(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function addMinutesHHMM(time, minutes) {
  if (!isHHMM(time)) return time || '';
  const [hours, mins] = time.split(':').map(Number);
  const total = (((hours * 60 + mins + Math.round(Number(minutes) || 0)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function newRef(prefix) {
  return `${prefix}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function seatKey(rowLabel, seatNo) {
  return `${String(rowLabel || '').toUpperCase()}${seatNo}`;
}

/** Prorate the full-route fare to the segment actually travelled. */
function segmentFare(fullFare, routeMinutes, fromMinutes, toMinutes, multiplier) {
  const span = Math.max(1, Math.round(Number(routeMinutes) || 0));
  const travelled = Math.max(0, Number(toMinutes || 0) - Number(fromMinutes || 0));
  const ratio = Math.min(1, travelled / span);
  const amount = Math.max(0, Number(fullFare) || 0) * ratio * (Number(multiplier) || 1);
  return T.round2(amount);
}

function overlaps(fromA, toA, fromB, toB) {
  return Number(fromA) < Number(toB) && Number(fromB) < Number(toA);
}

/** "Seat 1A" or "Seats 1A, 1B" — one entry per seat, however many claims point at it. */
function seatLabelList(labels) {
  const unique = Array.from(new Set(labels));
  return unique.length > 1 ? `Seats ${unique.join(', ')}` : `Seat ${unique[0]}`;
}

// ─── Locations ───────────────────────────────────────────────────────────────

async function listLocations({ type = '', term = '', limit = 20 } = {}) {
  const params = [];
  const where = [`status = 'active'`];
  if (isType(type)) {
    params.push(TYPE_STOP_KIND[typeOf(type)]);
    where.push(`kind = $${params.length}`);
  }
  const search = String(term || '').trim();
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(city) LIKE $${params.length} OR LOWER(code) LIKE $${params.length})`);
  }
  params.push(Math.min(50, Math.max(1, T.toInt(limit, 20))));
  const result = await query(
    `SELECT id, name, kind, city, country, code
       FROM bc_transport_locations
      WHERE ${where.join(' AND ')}
      ORDER BY name ASC
      LIMIT $${params.length}`,
    params
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    city: row.city,
    country: row.country,
    code: row.code,
    label: [row.name, row.city, row.country].filter(Boolean).join(', '),
  }));
}

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Journeys between two stops. A route qualifies when both locations appear on it
 * and the origin is boarded before the destination.
 */
async function searchJourneys({ type = 'bus', fromId = 0, toId = 0, date = '', passengers = 1 } = {}) {
  const transportType = typeOf(type);
  const origin = T.toInt(fromId, 0);
  const destination = T.toInt(toId, 0);
  const travelDate = T.isDateISO(date) ? T.isoDate(date) : T.isoToday();
  const people = Math.min(MAX_PASSENGERS, Math.max(1, T.toInt(passengers, 1)));

  if (!origin || !destination) return { ok: false, status: 400, error: 'Choose where you are travelling from and to' };
  if (origin === destination) return { ok: false, status: 400, error: 'Origin and destination must differ' };

  await releaseExpiredHolds();

  const result = await query(
    `SELECT d.id, d.operator_id, d.route_id, d.vehicle_id, d.travel_date::text AS travel_date,
            d.depart_time, d.seats_total, d.base_price, d.currency, d.classes AS departure_classes,
            d.status AS departure_status,
            r.name AS route_name, r.transport_type, r.duration_minutes, r.base_price AS route_price,
            r.classes AS route_classes, r.amenities, r.luggage_allowance, r.cancellation_policy,
            o.name AS operator_name, o.slug AS operator_slug, o.logo_url, o.status AS operator_status,
            v.name AS vehicle_name, v.registration, v.capacity, v.seating, v.seat_class,
            fy.stop_order AS from_stop, fy.minutes_from_origin AS from_minutes,
            ty.stop_order AS to_stop, ty.minutes_from_origin AS to_minutes,
            lf.name AS from_name, lf.city AS from_city,
            lt.name AS to_name, lt.city AS to_city
       FROM bc_transport_departures d
       JOIN bc_transport_routes r ON r.id = d.route_id
       JOIN bc_transport_operators o ON o.id = d.operator_id
       JOIN bc_transport_route_stops fy ON fy.route_id = r.id AND fy.location_id = $1
       JOIN bc_transport_route_stops ty ON ty.route_id = r.id AND ty.location_id = $2
       JOIN bc_transport_locations lf ON lf.id = fy.location_id
       JOIN bc_transport_locations lt ON lt.id = ty.location_id
       LEFT JOIN bc_transport_vehicles v ON v.id = d.vehicle_id
      WHERE d.travel_date = $3
        AND d.status = 'scheduled'
        AND r.status = 'published'
        AND o.status = 'approved'
        AND o.allow_online IS NOT FALSE
        AND r.transport_type = $4
        AND fy.stop_order < ty.stop_order
      ORDER BY d.depart_time ASC
      LIMIT 40`,
    [origin, destination, travelDate, transportType]
  );

  const rows = result.rows;
  if (!rows.length) return { ok: true, transportType, date: travelDate, journeys: [] };

  // One round trip for every claim in play, then evaluate the overlap in JS so the
  // segment rule lives in exactly one place.
  const claimsRes = await query(
    `SELECT departure_id, from_stop, to_stop, status, expires_at
       FROM bc_transport_seat_states
      WHERE departure_id = ANY($1::int[]) AND status IN ('sold', 'held', 'blocked')`,
    [rows.map((row) => row.id)]
  );
  const now = Date.now();
  const claimsByDeparture = new Map();
  for (const claim of claimsRes.rows) {
    if (claim.status === 'held' && claim.expires_at && new Date(claim.expires_at).getTime() < now) continue;
    if (!claimsByDeparture.has(claim.departure_id)) claimsByDeparture.set(claim.departure_id, []);
    claimsByDeparture.get(claim.departure_id).push(claim);
  }

  const journeys = rows.map((row) => {
    const routeMinutes = Number(row.duration_minutes || row.to_minutes - row.from_minutes || 0);
    const boardingTime = addMinutesHHMM(row.depart_time, row.from_minutes);
    const alightTime = addMinutesHHMM(row.depart_time, row.to_minutes);
    const classes = classList(row.departure_classes && row.departure_classes.length ? row.departure_classes : row.route_classes);
    const fullFare = Number(row.base_price || row.route_price || 0);
    const priceFrom = segmentFare(fullFare, routeMinutes, row.from_minutes, row.to_minutes, classes[0]?.multiplier || 1);
    const capacity = Number(row.seats_total || row.capacity || 0);
    // Only claims that overlap the segment being searched actually occupy it.
    const taken = (claimsByDeparture.get(row.id) || [])
      .filter((claim) => overlaps(row.from_stop, row.to_stop, claim.from_stop, claim.to_stop))
      .length;
    const seating = row.seating === 'capacity' ? 'capacity' : 'assigned';

    return {
      id: row.id,
      operatorId: row.operator_id,
      operatorName: row.operator_name,
      operatorSlug: row.operator_slug,
      logoUrl: row.logo_url,
      transportType: row.transport_type,
      transportLabel: TYPE_LABELS[row.transport_type] || 'Transport',
      routeName: row.route_name,
      vehicleName: row.vehicle_name || '',
      registration: row.registration || '',
      seating,
      fromStop: { order: row.from_stop, name: row.from_name, city: row.from_city },
      toStop: { order: row.to_stop, name: row.to_name, city: row.to_city },
      departTime: boardingTime,
      arriveTime: alightTime,
      durationMinutes: Math.max(0, row.to_minutes - row.from_minutes),
      // The clock the operator publishes is the one printed on the ticket.
      routeDepartTime: row.depart_time,
      classes,
      priceFrom,
      currency: row.currency || 'UGX',
      capacity,
      seatsAvailable: Math.max(0, capacity - taken),
      travelDate: row.travel_date,
      luggage: row.luggage_allowance || '',
      cancellation: row.cancellation_policy || '',
      amenities: Array.isArray(row.amenities) ? row.amenities : [],
      passesCapacity: capacity - taken >= people,
    };
  }).filter((journey) => journey.capacity === 0 || journey.passesCapacity);

  return { ok: true, transportType, date: travelDate, passengers: people, journeys };
}

// ─── Departure detail + seat map ─────────────────────────────────────────────

async function loadDeparture(departureId, { fromStop = 0, toStop = 0 } = {}) {
  const result = await query(
    `SELECT d.*, r.name AS route_name, r.transport_type, r.duration_minutes, r.base_price AS route_price,
            r.classes AS route_classes, r.amenities, r.luggage_allowance, r.cancellation_policy,
            r.status AS route_status,
            o.name AS operator_name, o.slug AS operator_slug, o.logo_url, o.status AS operator_status,
            o.hold_minutes, o.allow_online,
            v.name AS vehicle_name, v.registration, v.capacity, v.seating, v.seat_class
       FROM bc_transport_departures d
       JOIN bc_transport_routes r ON r.id = d.route_id
       JOIN bc_transport_operators o ON o.id = d.operator_id
       LEFT JOIN bc_transport_vehicles v ON v.id = d.vehicle_id
      WHERE d.id = $1
      LIMIT 1`,
    [T.toInt(departureId, 0)]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.status !== 'scheduled' || row.route_status !== 'published' || row.operator_status !== 'approved') {
    return { closed: true, departure: row };
  }
  return { closed: false, departure: row, fromStop: T.toInt(fromStop, 0), toStop: T.toInt(toStop, 0) };
}

async function routeStops(routeId) {
  const result = await query(
    `SELECT s.stop_order, s.minutes_from_origin, s.kind, l.id AS location_id, l.name, l.city, l.country
       FROM bc_transport_route_stops s
       JOIN bc_transport_locations l ON l.id = s.location_id
      WHERE s.route_id = $1
      ORDER BY s.stop_order ASC`,
    [T.toInt(routeId, 0)]
  );
  return result.rows.map((row) => ({
    order: row.stop_order,
    minutesFromOrigin: row.minutes_from_origin,
    kind: row.kind,
    locationId: row.location_id,
    name: row.name,
    city: row.city,
    country: row.country,
  }));
}

async function activeClaims(departureId) {
  const result = await query(
    `SELECT seat_id, from_stop, to_stop, status, expires_at
       FROM bc_transport_seat_states
      WHERE departure_id = $1 AND status IN ('sold', 'held', 'blocked')`,
    [T.toInt(departureId, 0)]
  );
  const now = Date.now();
  return result.rows.filter((row) => row.status !== 'held' || !row.expires_at || new Date(row.expires_at).getTime() > now);
}

/**
 * Seat map for one departure. `fromStop`/`toStop` narrow the claims to the booked
 * segment, which is what makes a berth reusable further down the line.
 */
async function getSeatMap(departureId, { fromStop = 1, toStop = 9999 } = {}) {
  await releaseExpiredHolds();
  const found = await loadDeparture(departureId);
  if (!found) return { ok: false, status: 404, error: 'Departure not found' };
  if (found.closed) return { ok: false, status: 409, error: 'This departure is no longer on sale' };

  const departure = found.departure;
  const stops = await routeStops(departure.route_id);
  const from = Math.max(1, T.toInt(fromStop, 0) || stops[0]?.order || 1);
  const to = T.toInt(toStop, 0) || stops[stops.length - 1]?.order || 9999;
  const routeMinutes = Number(departure.duration_minutes || 0);
  const classes = classList(departure.departure_classes && departure.departure_classes.length
    ? departure.departure_classes : departure.route_classes);
  const fullFare = Number(departure.base_price || departure.route_price || 0);
  const fromMinutes = stops.find((stop) => stop.order === from)?.minutesFromOrigin ?? 0;
  const toMinutes = stops.find((stop) => stop.order === to)?.minutesFromOrigin ?? routeMinutes;

  // Only claims that overlap the booked segment occupy the seat for this journey.
  const claimRows = await activeClaims(departure.id);
  const liveClaims = claimRows.filter((claim) => overlaps(from, to, claim.from_stop, claim.to_stop));
  const claimBySeat = new Map();
  for (const claim of liveClaims) {
    claimBySeat.set(claim.seat_id, claim.status);
  }

  const seating = departure.seating === 'capacity' ? 'capacity' : 'assigned';
  const seatResult = seating === 'assigned'
    ? await query(
      `SELECT id, carriage, row_label, seat_no, seat_key, category, kind, x, y, price_override, status
         FROM bc_transport_seats
        WHERE vehicle_id = $1
        ORDER BY carriage ASC, y ASC, x ASC, seat_no ASC`,
      [T.toInt(departure.vehicle_id, 0)]
    )
    : { rows: [] };

  const seats = seatResult.rows.map((seat) => {
    const claim = claimBySeat.get(seat.id);
    const status = seat.status === 'blocked' ? 'blocked' : claim === 'sold' ? 'sold' : claim === 'held' ? 'held' : claim === 'blocked' ? 'blocked' : 'available';
    const price = seat.price_override === null || seat.price_override === undefined
      ? segmentFare(fullFare, routeMinutes, fromMinutes, toMinutes, 1)
      : T.toMoney(seat.price_override);
    return {
      id: seat.id,
      carriage: seat.carriage,
      rowLabel: seat.row_label,
      seatNo: seat.seat_no,
      label: seat.seat_key,
      category: seat.category,
      kind: seat.kind,
      x: seat.x,
      y: seat.y,
      status,
    };
  });

  const seatsTotal = Number(departure.seats_total || departure.capacity || 0);
  const claimedCount = seats.filter((seat) => seat.status === 'sold' || seat.status === 'held' || seat.status === 'blocked').length;
  const capacitySold = seating === 'capacity' ? liveClaims.length : claimedCount;

  return {
    ok: true,
    departure: {
      id: departure.id,
      operatorId: departure.operator_id,
      operatorName: departure.operator_name,
      operatorSlug: departure.operator_slug,
      logoUrl: departure.logo_url,
      transportType: departure.transport_type,
      transportLabel: TYPE_LABELS[departure.transport_type] || 'Transport',
      routeName: departure.route_name,
      vehicleName: departure.vehicle_name || '',
      registration: departure.registration || '',
      travelDate: T.isoDate(departure.travel_date),
      routeDepartTime: departure.depart_time,
      arriveTime: departure.arrive_time,
      seating,
      seatsTotal,
      seatsAvailable: Math.max(0, seatsTotal - capacitySold),
      currency: departure.currency || 'UGX',
      classes,
      fullFare,
      fromStop: from,
      toStop: to,
      boardTime: addMinutesHHMM(departure.depart_time, fromMinutes),
      alightTime: addMinutesHHMM(departure.depart_time, toMinutes),
      boardAt: stops.find((stop) => stop.order === from) || null,
      alightAt: stops.find((stop) => stop.order === to) || null,
      luggage: departure.luggage_allowance || '',
      cancellation: departure.cancellation_policy || '',
      amenities: Array.isArray(departure.amenities) ? departure.amenities : [],
      holdMinutes: Math.min(MAX_HOLD_MINUTES, Math.max(3, T.toInt(departure.hold_minutes, DEFAULT_HOLD_MINUTES))),
      allowOnline: departure.allow_online !== false,
      segmentPrice: segmentFare(fullFare, routeMinutes, fromMinutes, toMinutes, classes[0]?.multiplier || 1),
    },
    stops,
    seats,
    classes: classes.map((entry) => ({
      ...entry,
      price: segmentFare(fullFare, routeMinutes, fromMinutes, toMinutes, entry.multiplier),
    })),
  };
}

// ─── Holds ───────────────────────────────────────────────────────────────────

async function releaseExpiredHolds() {
  await query(
    `DELETE FROM bc_transport_seat_states st
      USING bc_transport_holds h
      WHERE st.hold_id = h.id AND h.status = 'active' AND h.expires_at < NOW()`
  );
  await query(
    `DELETE FROM bc_transport_seat_states
      WHERE status = 'held' AND expires_at IS NOT NULL AND expires_at < NOW()`
  );
  await query(
    `UPDATE bc_transport_holds SET status = 'expired' WHERE status = 'active' AND expires_at < NOW()`
  );
  await query(
    `UPDATE bc_transport_bookings SET status = 'expired', updated_at = NOW()
      WHERE status = 'pending_payment' AND expires_at IS NOT NULL AND expires_at < NOW()`
  );
}

/**
 * Claim seats (or capacity) for the checkout window. The departure row is locked
 * for the transaction, so two customers racing for 5A are serialised and the
 * second is told exactly which seats went.
 */
async function createHold({ departureId, seatIds = [], fromStop = 0, toStop = 0, passengers = 1, fareClass = 'standard', customerEmail = '', online = true }) {
  await releaseExpiredHolds();
  const map = await getSeatMap(departureId, { fromStop, toStop });
  if (!map.ok) return map;

  const departure = map.departure;
  // Pausing website sales must not close the counter, so in-person sales pass online: false.
  if (online !== false && departure.allowOnline === false) {
    return { ok: false, status: 403, error: 'Online sales are paused for this operator' };
  }

  const seats = Array.isArray(seatIds) ? seatIds.map((id) => T.toInt(id, 0)).filter(Boolean) : [];
  const klass = resolveClass(departure.classes, fareClass);
  const people = Math.min(MAX_PASSENGERS, Math.max(1, T.toInt(passengers, 1)));

  if (departure.seating === 'assigned') {
    if (!seats.length) return { ok: false, status: 400, error: 'Select at least one seat' };
    if (seats.length > MAX_PASSENGERS) {
      return { ok: false, status: 400, error: `You can book up to ${MAX_PASSENGERS} seats at a time` };
    }
    if (seats.length !== people) {
      return { ok: false, status: 400, error: `Select ${people} ${people === 1 ? 'seat' : 'seats'} for ${people} ${people === 1 ? 'passenger' : 'passengers'}` };
    }
  } else if (people > departure.seatsAvailable) {
    return { ok: false, status: 409, error: `Only ${departure.seatsAvailable} places left on this departure` };
  }

  const lines = (departure.seating === 'assigned' ? seats : []).map((id) => {
    const seat = map.seats.find((entry) => entry.id === id);
    return seat ? { seatId: seat.id, label: seat.label, price: T.round2(departure.segmentPrice * klass.multiplier) } : null;
  }).filter(Boolean);
  if (departure.seating === 'assigned' && lines.length !== seats.length) {
    return { ok: false, status: 400, error: 'That seat does not belong to this vehicle' };
  }

  const unit = T.round2(departure.segmentPrice * klass.multiplier);
  const subtotal = T.round2(unit * (departure.seating === 'assigned' ? lines.length : people));
  const operatorId = T.toInt(departure.operatorId, 0);

  const outcome = await withTransaction(async (client) => {
    await client.query(`SELECT id FROM bc_transport_departures WHERE id = $1 FOR UPDATE`, [departure.id]);

    if (departure.seating === 'assigned') {
      const conflicting = await client.query(
        `SELECT s.seat_key
           FROM bc_transport_seat_states st
           JOIN bc_transport_seats s ON s.id = st.seat_id
          WHERE st.departure_id = $1
            AND st.seat_id = ANY($2::int[])
            AND st.status IN ('sold', 'held', 'blocked')
            AND (st.status <> 'held' OR st.expires_at IS NULL OR st.expires_at > NOW())
            AND st.from_stop < $4 AND $3 < st.to_stop`,
        [departure.id, seats, departure.fromStop, departure.toStop]
      );
      if (conflicting.rows.length) {
        const taken = conflicting.rows.map((row) => row.seat_key);
        return {
          ok: false,
          status: 409,
          error: `${seatLabelList(taken)} was just taken. Please pick another.`,
          taken,
        };
      }
    } else {
      const claimed = await client.query(
        `SELECT COUNT(*)::int AS taken FROM bc_transport_seat_states
          WHERE departure_id = $1 AND status IN ('sold', 'held', 'blocked')
            AND (status <> 'held' OR expires_at IS NULL OR expires_at > NOW())
            AND from_stop < $3 AND $2 < to_stop`,
        [departure.id, departure.fromStop, departure.toStop]
      );
      if ((claimed.rows[0]?.taken || 0) + people > departure.seatsTotal) {
        return { ok: false, status: 409, error: 'That departure just sold out. Please pick another.' };
      }
    }

    const holdRes = await client.query(
      `INSERT INTO bc_transport_holds
         (hold_ref, departure_id, operator_id, customer_email, seat_ids, from_stop, to_stop, subtotal, currency, status, expires_at, fare_class)
       VALUES ($1,$2,$3,COALESCE($4,''),$5,$6,$7,$8,$9,'active',$10,$11)
       RETURNING *`,
      [
        newRef('TH'), departure.id, operatorId, String(customerEmail || '').toLowerCase(),
        JSON.stringify(departure.seating === 'assigned' ? seats : []),
        departure.fromStop, departure.toStop, subtotal, departure.currency,
        new Date(Date.now() + departure.holdMinutes * 60 * 1000).toISOString(),
        klass.code,
      ]
    );
    const hold = holdRes.rows[0];

    if (departure.seating === 'assigned') {
      for (const line of lines) {
        const inserted = await client.query(
          `INSERT INTO bc_transport_seat_states
             (departure_id, seat_id, operator_id, status, hold_id, from_stop, to_stop, price, currency, expires_at)
           VALUES ($1,$2,$3,'held',$4,$5,$6,$7,$8,$9)
           RETURNING id`,
          [
            departure.id, line.seatId, operatorId, hold.id, departure.fromStop, departure.toStop,
            line.price, departure.currency, hold.expires_at,
          ]
        );
        if (!inserted.rows.length) {
          throw Object.assign(new Error('seat_conflict'), { seatConflict: true, label: line.label });
        }
      }
    } else {
      // Boats and general-admission vessels have no seat identity to hold, so each
      // place carries its own capacity claim row instead.
      for (let index = 0; index < people; index += 1) {
        await client.query(
          `INSERT INTO bc_transport_seat_states
             (departure_id, seat_id, operator_id, status, hold_id, from_stop, to_stop, price, currency, expires_at)
           VALUES ($1,0,$2,'held',$3,$4,$5,$6,$7,$8)`,
          [departure.id, operatorId, hold.id, departure.fromStop, departure.toStop, unit, departure.currency, hold.expires_at]
        );
      }
    }

    return {
      ok: true,
      hold: {
        holdRef: hold.hold_ref,
        departureId: departure.id,
        expiresAt: hold.expires_at,
        expiresInSeconds: Math.max(0, Math.round((new Date(hold.expires_at).getTime() - Date.now()) / 1000)),
        seats: lines.map((line) => ({ seatId: line.seatId, label: line.label, price: line.price })),
        passengers: people,
        fareClass: klass.code,
        fareClassName: klass.name,
        unitPrice: unit,
        subtotal,
        currency: departure.currency,
      },
    };
  }).catch((error) => {
    if (error && error.seatConflict) {
      return { ok: false, status: 409, error: `${seatLabelList([error.label])} was just taken. Please pick another.` };
    }
    throw error;
  });

  return outcome;
}

async function releaseHold(holdRef) {
  const ref = String(holdRef || '').trim().toUpperCase();
  if (!ref) return { ok: true };
  await withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM bc_transport_holds WHERE hold_ref = $1 FOR UPDATE`, [ref]);
    const hold = found.rows[0];
    if (!hold) return;
    await client.query(`DELETE FROM bc_transport_seat_states WHERE hold_id = $1`, [hold.id]);
    await client.query(`UPDATE bc_transport_holds SET status = 'released' WHERE id = $1 AND status = 'active'`, [hold.id]);
  });
  return { ok: true, released: ref };
}

// ─── Booking ─────────────────────────────────────────────────────────────────

function mapTicket(row) {
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    qrToken: row.qr_token,
    passengerName: row.passenger_name,
    seatLabel: row.seat_label,
    fareClass: row.fare_class,
    fare: Number(row.fare || 0),
    status: row.status,
    admittedAt: row.admitted_at,
  };
}

/**
 * Arrival clock for the booked segment: the boarding time plus the running
 * time to the alighting stop. The departure's own arrival is the terminus, so
 * it is only a fallback when the stop list is missing.
 */
function segmentArrival(departTime, minutes, fallback = '') {
  const run = Number(minutes);
  // No usable stop list: the departure's own arrival is the only answer.
  if (!isHHMM(departTime) || !Number.isFinite(run) || run <= 0) {
    return { time: fallback || addMinutesHHMM(departTime, 0), dayOffset: 0 };
  }
  const [hours, mins] = String(departTime).split(':').map(Number);
  return {
    time: addMinutesHHMM(departTime, run),
    dayOffset: Math.floor((hours * 60 + mins + Math.round(run)) / 1440),
  };
}

function mapBooking(row, tickets = []) {
  const arrival = segmentArrival(row.depart_time, row.trip_minutes, row.arrive_time);
  return {
    id: row.id,
    bookingRef: row.booking_ref,
    operatorId: row.operator_id,
    departureId: row.departure_id,
    operatorName: row.operator_name || '',
    operatorLogo: row.logo_url || '',
    transportType: row.transport_type || 'bus',
    transportLabel: TYPE_LABELS[row.transport_type] || 'Transport',
    routeName: row.route_name || '',
    vehicleName: row.vehicle_name || '',
    vehicleRegistration: row.vehicle_registration || '',
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    passengerCount: Number(row.passenger_count || 1),
    seatLabels: String(row.seat_labels || '').split(',').map((value) => value.trim()).filter(Boolean),
    seating: row.seating || 'assigned',
    fareClass: row.fare_class,
    fareClassName: row.fare_class
      ? resolveClass(row.departure_classes?.length ? row.departure_classes : row.route_classes, row.fare_class).name
      : '',
    boardingPoint: row.boarding_point,
    dropoffPoint: row.dropoff_point,
    boardingCity: row.boarding_city || '',
    dropoffCity: row.dropoff_city || '',
    travelDate: T.isoDate(row.travel_date),
    departTime: row.depart_time,
    arrivalTime: arrival.time,
    arrivalDayOffset: arrival.dayOffset,
    tripMinutes: Number(row.trip_minutes || 0),
    subtotal: Number(row.subtotal || 0),
    serviceFee: Number(row.service_fee || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total || 0),
    currency: row.currency || 'UGX',
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    status: row.status,
    channel: row.channel,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    tickets: tickets.map(mapTicket),
  };
}

async function loadBookingByRef(ref) {
  const code = String(ref || '').trim().toUpperCase();
  if (!code) return null;
  const result = await query(
    `SELECT b.*, o.name AS operator_name, o.logo_url, r.name AS route_name, r.transport_type,
            r.classes AS route_classes, v.name AS vehicle_name, v.registration AS vehicle_registration,
            d.classes AS departure_classes, d.arrive_time,
            (SELECT l.city FROM bc_transport_route_stops s
               JOIN bc_transport_locations l ON l.id = s.location_id
              WHERE s.route_id = b.route_id AND s.stop_order = b.from_stop LIMIT 1) AS boarding_city,
            (SELECT l.city FROM bc_transport_route_stops s
               JOIN bc_transport_locations l ON l.id = s.location_id
              WHERE s.route_id = b.route_id AND s.stop_order = b.to_stop LIMIT 1) AS dropoff_city,
            (SELECT s.minutes_from_origin FROM bc_transport_route_stops s
              WHERE s.route_id = b.route_id AND s.stop_order = b.to_stop LIMIT 1) AS trip_minutes
       FROM bc_transport_bookings b
       LEFT JOIN bc_transport_operators o ON o.id = b.operator_id
       LEFT JOIN bc_transport_routes r ON r.id = b.route_id
       LEFT JOIN bc_transport_departures d ON d.id = b.departure_id
       LEFT JOIN bc_transport_vehicles v ON v.id = d.vehicle_id
      WHERE b.booking_ref = $1
      LIMIT 1`,
    [code]
  );
  return result.rows[0] || null;
}

async function loadBookingTickets(bookingId) {
  const result = await query(
    `SELECT * FROM bc_transport_passengers WHERE booking_id = $1 ORDER BY id ASC`,
    [T.toInt(bookingId, 0)]
  );
  return result.rows;
}

/**
 * Turn a live hold into a booking. Tickets are issued immediately because the
 * operator collects payment at the boarding point; an online card flow would
 * confirm the same rows through `confirmBooking` instead.
 */
async function createBooking({ holdRef, passengers = [], customer = {}, paymentMethod = 'counter', fareClass = '' } = {}) {
  await releaseExpiredHolds();
  const ref = String(holdRef || '').trim().toUpperCase();
  if (!ref) return { ok: false, status: 400, error: 'Your seat hold expired — pick your seats again' };

  const holdRes = await query(`SELECT * FROM bc_transport_holds WHERE hold_ref = $1 LIMIT 1`, [ref]);
  const hold = holdRes.rows[0];
  if (!hold) return { ok: false, status: 404, error: 'Your seat hold expired — pick your seats again' };
  if (hold.status !== 'active' || new Date(hold.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 409, error: 'Your seat hold expired — pick your seats again' };
  }

  const found = await loadDeparture(hold.departure_id);
  if (!found || found.closed) return { ok: false, status: 409, error: 'This departure is no longer on sale' };
  const departure = found.departure;

  const email = T.text(customer?.email || hold.customer_email || '', 160).toLowerCase();
  const name = T.text(customer?.name || '', 160);
  const phone = T.text(customer?.phone || '', 40);
  if (!name) return { ok: false, status: 400, error: 'Enter the lead passenger name' };
  if (!T.validEmail(email)) return { ok: false, status: 400, error: 'Enter a valid email for the tickets' };

  const seatIdList = Array.isArray(hold.seat_ids) ? hold.seat_ids : [];
  const heldSeatCount = seatIdList.length;
  const passengerCount = heldSeatCount || Math.max(1, T.toInt(passengers.length, 1));

  const fares = await query(
    `SELECT seat_id, price, status FROM bc_transport_seat_states WHERE hold_id = $1`,
    [hold.id]
  );
  if (fares.rows.some((row) => row.status !== 'held')) {
    return { ok: false, status: 409, error: 'Your seat hold expired — pick your seats again' };
  }
  const unit = T.round2(fares.rows.reduce((sum, row) => sum + Number(row.price || 0), 0) / Math.max(1, fares.rows.length));
  const subtotal = T.round2(fares.rows.reduce((sum, row) => sum + Number(row.price || 0), 0));

  const klass = resolveClass(departure.departure_classes && departure.departure_classes.length
    ? departure.departure_classes : departure.route_classes, fareClass || hold.fare_class || 'standard');

  const seatLabelsRes = await query(
    `SELECT s.seat_key FROM bc_transport_seat_states st
       JOIN bc_transport_seats s ON s.id = st.seat_id
      WHERE st.hold_id = $1 ORDER BY s.seat_key`,
    [hold.id]
  );
  const seatLabels = seatLabelsRes.rows.map((row) => row.seat_key);

  const stops = await routeStops(departure.route_id);
  const boarding = stops.find((stop) => stop.order === hold.from_stop);
  const dropoff = stops.find((stop) => stop.order === hold.to_stop);

  const outcome = await withTransaction(async (client) => {
    await client.query(`SELECT id FROM bc_transport_departures WHERE id = $1 FOR UPDATE`, [departure.id]);
    await client.query(`SELECT id FROM bc_transport_holds WHERE id = $1 FOR UPDATE`, [hold.id]);

    const bookingRes = await client.query(
      `INSERT INTO bc_transport_bookings
         (booking_ref, operator_id, departure_id, route_id, customer_email, customer_name, customer_phone,
          passenger_count, from_stop, to_stop, boarding_point, dropoff_point, travel_date, depart_time,
          seat_labels, fare_class, seating, subtotal, service_fee, tax_amount, total, currency,
          payment_method, payment_status, status, channel, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,''),$8,$9,$10,COALESCE($11,''),COALESCE($12,''),$13,$14,
               COALESCE($15,''),$16,$17,$18,$19,$20,$21,$22,$23,'unpaid','confirmed','online',$24)
       RETURNING *`,
      [
        newRef('TR'), departure.operator_id, departure.id, departure.route_id, email, name, phone,
        passengerCount, hold.from_stop, hold.to_stop,
        boarding ? [boarding.name, boarding.city].filter(Boolean).join(' · ') : '',
        dropoff ? [dropoff.name, dropoff.city].filter(Boolean).join(' · ') : '',
        T.isoDate(departure.travel_date),
        addMinutesHHMM(departure.depart_time, boarding?.minutesFromOrigin ?? 0),
        seatLabels.join(','), klass.code, departure.seating === 'capacity' ? 'capacity' : 'assigned',
        subtotal, 0, 0, subtotal, departure.currency,
        paymentMethod === 'card' ? 'card' : 'counter',
        hold.expires_at,
      ]
    );
    const booking = bookingRes.rows[0];

    await client.query(
      `UPDATE bc_transport_seat_states SET status = 'sold', booking_id = $1, expires_at = NULL WHERE hold_id = $2`,
      [booking.id, hold.id]
    );
    await client.query(`UPDATE bc_transport_holds SET status = 'converted' WHERE id = $1`, [hold.id]);

    const ticketsToIssue = departure.seating === 'capacity'
      ? Array.from({ length: passengerCount }, (_, index) => ({ seatLabel: '', name: T.text(passengers[index]?.name || (index === 0 ? name : ''), 120) }))
      : seatLabels.map((label, index) => ({ seatLabel: label, name: T.text(passengers[index]?.name || (index === 0 ? name : ''), 120) }));

    for (const ticket of ticketsToIssue) {
      await client.query(
        `INSERT INTO bc_transport_passengers
           (booking_id, departure_id, passenger_name, seat_label, fare_class, fare, ticket_no, qr_token, status)
         VALUES ($1,$2,COALESCE($3,''),COALESCE($4,''),$5,$6,$7,$8,'valid')`,
        [
          booking.id, departure.id, ticket.name || name, ticket.seatLabel, klass.code, unit,
          newRef('TK'), crypto.randomBytes(16).toString('hex'),
        ]
      );
    }

    return { ok: true, booking };
  });

  // Re-read through the joined loader so the order carries the operator, route
  // and fare-class names rather than bare ids.
  const tickets = await loadBookingTickets(outcome.booking.id);
  const shaped = await loadBookingByRef(outcome.booking.booking_ref);
  return { ok: true, order: mapBooking(shaped || outcome.booking, tickets) };
}

async function publicOrder(ref) {
  const booking = await loadBookingByRef(ref);
  if (!booking) return { ok: false, status: 404, error: 'Booking not found' };
  const tickets = await loadBookingTickets(booking.id);
  return { ok: true, order: mapBooking(booking, tickets) };
}

async function cancelBooking({ ref, email = '', reason = '' } = {}) {
  const booking = await loadBookingByRef(ref);
  if (!booking) return { ok: false, status: 404, error: 'Booking not found' };
  const holder = String(booking.customer_email || '').toLowerCase();
  if (email && holder && String(email).toLowerCase() !== holder) {
    return { ok: false, status: 403, error: 'This booking belongs to another customer' };
  }
  if (booking.status === 'cancelled') return { ok: true, order: mapBooking(booking, await loadBookingTickets(booking.id)) };

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE bc_transport_bookings SET status = 'cancelled', payment_status = 'refunded', updated_at = NOW() WHERE id = $1`,
      [booking.id]
    );
    // Cancelling frees the seats: the state rows are deleted so the inventory is
    // genuinely sellable again rather than occupied by a dead booking.
    await client.query(`DELETE FROM bc_transport_seat_states WHERE booking_id = $1`, [booking.id]);
    await client.query(`UPDATE bc_transport_passengers SET status = 'cancelled' WHERE booking_id = $1`, [booking.id]);
  });

  return { ok: true, reason, order: mapBooking({ ...booking, status: 'cancelled', payment_status: 'refunded' }, await loadBookingTickets(booking.id)) };
}

/** Ticket validation shared by the scanner, keyed on the QR token or ticket number. */
async function validateTicket({ ticketNo = '', qrToken = '' } = {}) {
  const value = String(ticketNo || '').trim().toUpperCase();
  const token = String(qrToken || '').trim();
  if (!value && !token) return { ok: false, status: 400, error: 'Provide a ticket number or QR token' };
  const result = await query(
    `SELECT p.*, b.booking_ref, b.travel_date::text AS travel_date, b.depart_time, b.status AS booking_status,
            b.payment_status, b.boarding_point, b.dropoff_point,
            o.name AS operator_name, r.name AS route_name, r.transport_type
       FROM bc_transport_passengers p
       JOIN bc_transport_bookings b ON b.id = p.booking_id
       LEFT JOIN bc_transport_operators o ON o.id = b.operator_id
       LEFT JOIN bc_transport_routes r ON r.id = b.route_id
      WHERE ($1 <> '' AND p.ticket_no = $1) OR ($2 <> '' AND p.qr_token = $2)
      LIMIT 1`,
    [value, token]
  );
  const row = result.rows[0];
  if (!row) return { ok: false, status: 404, error: 'Ticket not found' };
  const state = row.status === 'cancelled' || row.booking_status === 'cancelled' ? 'cancelled'
    : row.status === 'used' ? 'already_used'
      : 'valid';
  return {
    ok: true,
    valid: state === 'valid',
    state,
    ticket: {
      ticketNo: row.ticket_no,
      operatorName: row.operator_name || '',
      transportType: row.transport_type || 'bus',
      transportLabel: TYPE_LABELS[row.transport_type] || 'Transport',
      routeName: row.route_name || '',
      passengerName: row.passenger_name,
      seatLabel: row.seat_label,
      fareClass: row.fare_class,
      travelDate: T.isoDate(row.travel_date),
      departTime: row.depart_time,
      boardingPoint: row.boarding_point,
      dropoffPoint: row.dropoff_point,
      bookedRef: row.booking_ref,
      admittedAt: row.admitted_at,
    },
  };
}

async function admitTicket({ ticketNo = '', qrToken = '', admittedBy = '' } = {}) {
  const checked = await validateTicket({ ticketNo, qrToken });
  if (!checked.ok) return checked;
  if (!checked.valid) return { ok: false, status: 409, error: `This ticket is ${checked.state.replace('_', ' ')}`, ticket: checked.ticket };
  await query(
    `UPDATE bc_transport_passengers
        SET status = 'used', admitted_at = NOW(), admitted_by = COALESCE($2,'')
      WHERE ticket_no = $1`,
    [checked.ticket.ticketNo, String(admittedBy || '').toLowerCase()]
  );
  return { ok: true, state: 'admitted', ticket: checked.ticket };
}

module.exports = {
  DEFAULT_HOLD_MINUTES,
  MAX_HOLD_MINUTES,
  MAX_PASSENGERS,
  TYPE_LABELS,
  TYPE_STOP_KIND,
  addMinutesHHMM,
  admitTicket,
  cancelBooking,
  classList,
  createBooking,
  createHold,
  getSeatMap,
  isHHMM,
  isType,
  listLocations,
  loadDeparture,
  mapBooking,
  newRef,
  overlaps,
  publicOrder,
  releaseExpiredHolds,
  releaseHold,
  resolveClass,
  routeStops,
  searchJourneys,
  seatKey,
  segmentArrival,
  segmentFare,
  typeOf,
  validateTicket,
};
