#!/usr/bin/env node
// Seed a demo transport operator so the search → seat → book flow can be
// exercised end to end without a real operator on the platform.
//
//   node scripts/seed-transport.cjs
//
// Re-running is safe: it updates the demo operator in place and only creates
// departures for dates that do not have one yet.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { query, isDbConfigured } = require('../lib/db');
const T = require('../lib/ticketing');

const OPERATOR_SLUG = 'nile-coach';

const LOCATIONS = [
  { name: 'Kampala Bus Terminal', kind: 'terminal', city: 'Kampala', country: 'Uganda', code: 'KLA' },
  { name: 'Mukono Stage', kind: 'terminal', city: 'Mukono', country: 'Uganda', code: 'MKN' },
  { name: 'Jinja Main Stage', kind: 'terminal', city: 'Jinja', country: 'Uganda', code: 'JIN' },
  { name: 'Luweero Stop', kind: 'terminal', city: 'Luweero', country: 'Uganda', code: 'LWE' },
  { name: 'Gulu Bus Park', kind: 'terminal', city: 'Gulu', country: 'Uganda', code: 'GUL' },
  { name: 'Port Bell Pier', kind: 'port', city: 'Kampala', country: 'Uganda', code: 'PBL' },
  { name: 'Bukakata Landing Site', kind: 'port', city: 'Masaka', country: 'Uganda', code: 'BKT' },
  { name: 'Kalangala Ferry Terminal', kind: 'port', city: 'Kalangala', country: 'Uganda', code: 'KLG' },
  { name: 'Kampala Railway Station', kind: 'station', city: 'Kampala', country: 'Uganda', code: 'KRS' },
  { name: 'Namanve Rail Halt', kind: 'station', city: 'Namanve', country: 'Uganda', code: 'NMV' },
];

// Each route lists its ordered stops as [code, minutesFromOrigin].
const ROUTES = [
  {
    transport_type: 'bus',
    name: 'Kampala — Jinja Express',
    code: 'NC-101',
    stops: [['KLA', 0], ['MKN', 45], ['JIN', 90]],
    duration_minutes: 90,
    base_price: 25000,
    classes: [
      { code: 'standard', name: 'Standard', multiplier: 1 },
      { code: 'vip', name: 'VIP recliner', multiplier: 1.6 },
    ],
    amenities: ['Air conditioning', 'Wi-Fi', 'USB charging', 'Reclining seats'],
    luggage_allowance: '2 bags up to 20 kg each',
    cancellation_policy: 'Free cancellation up to 2 hours before departure',
    vehicle: { name: 'Scania Irizar — UAX 101A', seating: 'assigned', capacity: 44, rows: 11, cols: ['A', 'B', 'C', 'D'] },
    departures: ['07:00', '10:30', '14:00', '17:30'],
  },
  {
    transport_type: 'bus',
    name: 'Kampala — Gulu Night Coach',
    code: 'NC-220',
    stops: [['KLA', 0], ['LWE', 60], ['GUL', 300]],
    duration_minutes: 300,
    base_price: 60000,
    classes: [
      { code: 'standard', name: 'Standard', multiplier: 1 },
      { code: 'sleeper', name: 'Sleeper', multiplier: 1.45 },
    ],
    amenities: ['Sleeper berths', 'Onboard washroom', 'Blankets', 'Security escort'],
    luggage_allowance: '2 bags up to 25 kg each',
    cancellation_policy: '50% refund up to 6 hours before departure',
    vehicle: { name: 'Mercedes Tourismo — UAX 220G', seating: 'assigned', capacity: 40, rows: 10, cols: ['A', 'B', 'C', 'D'] },
    departures: ['19:00', '21:30'],
  },
  {
    transport_type: 'boat',
    name: 'Port Bell — Kalangala Ferry',
    code: 'NC-F12',
    stops: [['PBL', 0], ['BKT', 180], ['KLG', 240]],
    duration_minutes: 240,
    base_price: 40000,
    classes: [
      { code: 'deck', name: 'Open deck', multiplier: 1 },
      { code: 'cabin', name: 'Private cabin', multiplier: 2.2 },
    ],
    amenities: ['Life jackets', 'Snack bar', 'Vehicle deck', 'Covered seating'],
    luggage_allowance: '2 bags plus one bicycle',
    cancellation_policy: 'Non-refundable within 24 hours of sailing',
    vehicle: { name: 'MV Kalangala Express', seating: 'capacity', capacity: 160 },
    departures: ['08:00', '15:00'],
  },
  {
    transport_type: 'train',
    name: 'Kampala — Namanve Rail Shuttle',
    code: 'NC-R07',
    stops: [['KRS', 0], ['NMV', 30]],
    duration_minutes: 30,
    base_price: 8000,
    classes: [
      { code: 'standard', name: 'Standard', multiplier: 1 },
      { code: 'first', name: 'First class', multiplier: 1.8 },
    ],
    amenities: ['Assigned berths', 'Luggage rack', 'Onboard conductor'],
    luggage_allowance: '1 bag up to 20 kg',
    cancellation_policy: 'Free cancellation up to 1 hour before departure',
    vehicle: {
      name: 'UDL Rail Car 3',
      seating: 'assigned',
      capacity: 24,
      carriages: [
        { name: 'Coach A', rows: 6, cols: ['A', 'B', 'C', 'D'], klass: 'first' },
      ],
    },
    departures: ['06:30', '12:00', '18:00'],
  },
];

function addMinutes(time, minutes) {
  const [h, m] = String(time).split(':').map(Number);
  const total = (h * 60 + m + Number(minutes || 0)) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function upsertLocation(location) {
  const existing = await query(`SELECT id FROM bc_transport_locations WHERE name = $1 LIMIT 1`, [location.name]);
  if (existing.rows.length) return existing.rows[0].id;
  const inserted = await query(
    `INSERT INTO bc_transport_locations (name, kind, city, country, code)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [location.name, location.kind, location.city, location.country, location.code]
  );
  return inserted.rows[0].id;
}

async function ensureVehicle(operatorId, route, transportType) {
  const spec = route.vehicle;
  const existing = await query(
    `SELECT id FROM bc_transport_vehicles WHERE operator_id = $1 AND name = $2 LIMIT 1`,
    [operatorId, spec.name]
  );
  const vehicleId = existing.rows[0]?.id || (await query(
    `INSERT INTO bc_transport_vehicles
       (operator_id, transport_type, name, registration, capacity, seating, seat_class, layout)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      operatorId, transportType, spec.name, spec.name.split('—').pop().trim(),
      spec.capacity, spec.seating, 'standard', JSON.stringify({ cols: spec.cols || [] }),
    ]
  )).rows[0].id;

  if (spec.seating === 'assigned') await syncSeats(vehicleId, spec);
  return vehicleId;
}

/**
 * Bring the vehicle's permanent seat identities in line with its layout. Seats
 * already sold or held are never touched, so this is safe to re-run.
 */
async function syncSeats(vehicleId, spec) {
  const carriages = spec.carriages || [{ name: '', rows: spec.rows, cols: spec.cols, klass: 'standard' }];
  const batch = { carriage: [], rowLabel: [], seatNo: [], seatKey: [], category: [], x: [], y: [] };

  for (const carriage of carriages) {
    for (let row = 1; row <= carriage.rows; row += 1) {
      const rowLabel = String(row);
      for (let index = 0; index < carriage.cols.length; index += 1) {
        batch.carriage.push(carriage.name || '');
        batch.rowLabel.push(rowLabel);
        batch.seatNo.push(row);
        batch.seatKey.push(`${rowLabel}${carriage.cols[index]}`);
        batch.category.push(carriage.klass || 'standard');
        batch.x.push(index + 1);
        batch.y.push(row);
      }
    }
  }

  const current = await query(
    `SELECT count(*)::int AS total FROM bc_transport_seats WHERE vehicle_id = $1`,
    [vehicleId]
  );
  if (current.rows[0].total === batch.seatKey.length) return;

  // The layout is incomplete, so start the grid from scratch rather than trying
  // to merge it. Only demo vehicles without a finished layout reach this path.
  await query(`DELETE FROM bc_transport_seats WHERE vehicle_id = $1`, [vehicleId]);

  // Permanent seat identities live on the vehicle; departures only track state.
  // One bulk insert keeps the seed fast on a remote database.
  await query(
    `INSERT INTO bc_transport_seats
       (vehicle_id, carriage, row_label, seat_no, seat_key, category, kind, x, y)
     SELECT $1, COALESCE(t.carriage, ''), t.row_label, t.seat_no, t.seat_key, t.category, 'seat', t.x, t.y
       FROM unnest($2::text[], $3::text[], $4::int[], $5::text[], $6::text[], $7::int[], $8::int[])
         AS t(carriage, row_label, seat_no, seat_key, category, x, y)`,
    [
      vehicleId, batch.carriage, batch.rowLabel, batch.seatNo,
      batch.seatKey, batch.category, batch.x, batch.y,
    ]
  );
}

async function ensureRoute(operatorId, route, locationIds) {
  const existing = await query(
    `SELECT id FROM bc_transport_routes WHERE operator_id = $1 AND code = $2 LIMIT 1`,
    [operatorId, route.code]
  );

  const originId = locationIds[route.stops[0][0]];
  const destinationId = locationIds[route.stops[route.stops.length - 1][0]];

  let routeId = existing.rows[0]?.id;
  if (!routeId) {
    const inserted = await query(
      `INSERT INTO bc_transport_routes
         (operator_id, transport_type, name, code, origin_id, destination_id, duration_minutes,
          base_price, currency, classes, amenities, luggage_allowance, cancellation_policy, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'UGX',$9,$10,$11,$12,'published') RETURNING id`,
      [
        operatorId, route.transport_type, route.name, route.code, originId, destinationId,
        route.duration_minutes, route.base_price, JSON.stringify(route.classes),
        JSON.stringify(route.amenities), route.luggage_allowance, route.cancellation_policy,
      ]
    );
    routeId = inserted.rows[0].id;

    for (let index = 0; index < route.stops.length; index += 1) {
      const [code, minutes] = route.stops[index];
      const isEndpoint = index === 0 || index === route.stops.length - 1;
      await query(
        `INSERT INTO bc_transport_route_stops (route_id, location_id, stop_order, minutes_from_origin, kind)
         VALUES ($1,$2,$3,$4,$5)`,
        [routeId, locationIds[code], index + 1, minutes, isEndpoint ? 'endpoint' : 'stop']
      );
    }
  }

  return routeId;
}

async function main() {
  if (!isDbConfigured()) {
    console.error('DATABASE_URL is not configured — check .env');
    process.exit(1);
  }

  // ── Operator ──
  const operatorRes = await query(
    `INSERT INTO bc_transport_operators
       (owner_email, name, slug, transport_types, description, contact, policies,
        commission_percent, hold_minutes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,10,15,'approved')
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name, transport_types = EXCLUDED.transport_types,
           status = 'approved', updated_at = NOW()
     RETURNING id`,
    [
      'demo@nilecoach.example',
      'Nile Coach',
      OPERATOR_SLUG,
      JSON.stringify(['bus', 'boat', 'train']),
      'Buses, ferries and rail shuttles across Uganda since 1998.',
      JSON.stringify({ phone: '+256 700 000 000', email: 'hello@nilecoach.example' }),
      JSON.stringify({ payment: 'Pay online by card or at the counter' }),
    ]
  );
  const operatorId = operatorRes.rows[0].id;

  // ── Locations ──
  const locationIds = {};
  for (const location of LOCATIONS) {
    locationIds[location.code] = await upsertLocation(location);
  }

  // ── Routes, vehicles and departures for today + 2 days ──
  let departureCount = 0;
  for (const route of ROUTES) {
    const routeId = await ensureRoute(operatorId, route, locationIds);
    const vehicleId = await ensureVehicle(operatorId, route, route.transport_type);
    const seatsTotal = route.vehicle.capacity;

    for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
      const travelDate = addDays(T.isoToday(), dayOffset);
      for (const departTime of route.departures) {
        const exists = await query(
          `SELECT id FROM bc_transport_departures
            WHERE route_id = $1 AND travel_date = $2 AND depart_time = $3 LIMIT 1`,
          [routeId, travelDate, departTime]
        );
        if (exists.rows.length) continue;
        await query(
          `INSERT INTO bc_transport_departures
             (operator_id, route_id, vehicle_id, travel_date, depart_time, arrive_time,
              seats_total, base_price, currency, classes, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'UGX',$9,'scheduled')`,
          [
            operatorId, routeId, vehicleId, travelDate, departTime,
            addMinutes(departTime, route.duration_minutes), seatsTotal, route.base_price,
            JSON.stringify(route.classes),
          ]
        );
        departureCount += 1;
      }
    }
  }

  console.log(`Nile Coach ready (operator ${operatorId}) — ${ROUTES.length} routes, ${departureCount} new departures.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exit(1);
  });
