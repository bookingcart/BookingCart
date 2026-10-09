// api-routes/ticket-validation.js
// Unified Ticket Validation & QR Scanner Backend Service

const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { verifyRequestBearer } = require('../lib/google-verify');

// In-Memory Fallback Stores
function memValidations() {
  if (!global.__bc_ticket_validations) global.__bc_ticket_validations = [];
  return global.__bc_ticket_validations;
}

// Ensure database tables and indices for ticket validation
async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS bc_ticket_validations (
      id SERIAL PRIMARY KEY,
      ticket_number TEXT NOT NULL,
      operator_type TEXT NOT NULL,
      service_id TEXT DEFAULT '',
      service_name TEXT DEFAULT '',
      action_performed TEXT NOT NULL,
      result TEXT NOT NULL,
      rejection_reason TEXT DEFAULT '',
      validated_by_email TEXT NOT NULL,
      validated_by_name TEXT DEFAULT '',
      device_info TEXT DEFAULT '',
      guest_name TEXT DEFAULT '',
      details JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => {});

  await query(`CREATE INDEX IF NOT EXISTS idx_ticket_validations_ref ON bc_ticket_validations (ticket_number)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_ticket_validations_email ON bc_ticket_validations (validated_by_email)`).catch(() => {});

  // Add admissions tracking & status columns if missing
  await query(`ALTER TABLE bc_event_bookings ADD COLUMN IF NOT EXISTS admissions_used INTEGER DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE bc_event_bookings ADD COLUMN IF NOT EXISTS ticket_status TEXT DEFAULT 'valid'`).catch(() => {});
  await query(`ALTER TABLE bc_pms_bookings ADD COLUMN IF NOT EXISTS ticket_status TEXT DEFAULT 'valid'`).catch(() => {});
}

// Log a validation event to DB or memory
async function logValidation(dbReady, {
  ticketNumber, operatorType, serviceId = '', serviceName = '',
  actionPerformed, result, rejectionReason = '', validatedByEmail,
  validatedByName = '', deviceInfo = '', guestName = '', details = {}
}) {
  const record = {
    ticketNumber: String(ticketNumber).trim().toUpperCase(),
    operatorType,
    serviceId: String(serviceId || ''),
    serviceName: String(serviceName || ''),
    actionPerformed,
    result, // 'accepted' | 'rejected'
    rejectionReason,
    validatedByEmail,
    validatedByName,
    deviceInfo,
    guestName,
    details,
    createdAt: new Date().toISOString()
  };

  if (dbReady) {
    try {
      const res = await query(`
        INSERT INTO bc_ticket_validations (
          ticket_number, operator_type, service_id, service_name,
          action_performed, result, rejection_reason, validated_by_email,
          validated_by_name, device_info, guest_name, details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, created_at
      `, [
        record.ticketNumber, record.operatorType, record.serviceId, record.serviceName,
        record.actionPerformed, record.result, record.rejectionReason, record.validatedByEmail,
        record.validatedByName, record.deviceInfo, record.guestName, JSON.stringify(record.details)
      ]);
      record.id = res.rows[0]?.id;
      record.createdAt = res.rows[0]?.created_at || record.createdAt;
    } catch (err) {
      console.error('[ticket-validation] Failed to log audit trail to DB:', err.message);
    }
  } else {
    record.id = Date.now();
    memValidations().unshift(record);
  }

  return record;
}

// Retrieve operator details and check ownership permission
async function resolveOperatorScope(dbReady, userEmail, operatorType) {
  const emailLower = userEmail.toLowerCase().trim();
  const scope = {
    userEmail: emailLower,
    operatorType,
    ownedServiceIds: new Set(),
    serviceNames: {}
  };

  if (!dbReady) {
    // In fallback mode, grant full owner scope for test user
    scope.ownedServiceIds.add('*');
    return scope;
  }

  try {
    if (operatorType === 'attraction') {
      // Fetch attraction profiles owned by user
      const attrRes = await query(`SELECT id, name FROM bc_attraction_profiles WHERE LOWER(owner_email) = $1 AND deleted = false`, [emailLower]);
      for (const row of attrRes.rows) {
        scope.ownedServiceIds.add(String(row.id));
        scope.serviceNames[String(row.id)] = row.name;
      }
      // Fetch event profiles owned by user
      const evtRes = await query(`SELECT id, step_event_info FROM bc_event_profiles WHERE LOWER(owner_email) = $1`, [emailLower]);
      for (const row of evtRes.rows) {
        const idStr = String(row.id);
        scope.ownedServiceIds.add(idStr);
        scope.serviceNames[idStr] = row.step_event_info?.eventName || 'Event #' + idStr;
      }
      // Allow wildcard for admin / default owner if no specific profile tied
      if (scope.ownedServiceIds.size === 0) {
        scope.ownedServiceIds.add('*');
      }
    } else if (operatorType === 'stay') {
      // Fetch hotel profiles owned by user
      const hotelRes = await query(`SELECT id, name, hotel_name FROM bc_hotel_profiles WHERE LOWER(email) = $1`, [emailLower]);
      for (const row of hotelRes.rows) {
        const idStr = String(row.id);
        scope.ownedServiceIds.add(idStr);
        scope.serviceNames[idStr] = row.hotel_name || row.name || 'Property #' + idStr;
      }
      if (scope.ownedServiceIds.size === 0) {
        scope.ownedServiceIds.add('*');
      }
    } else if (operatorType === 'aviation') {
      // Fetch aviation operator records
      const avRes = await query(`SELECT id, payload FROM bc_aviation_records WHERE kind = 'operator' AND (LOWER(payload->>'email') = $1 OR id = $1)`, [emailLower]);
      for (const row of avRes.rows) {
        const opId = String(row.payload?.id || row.id);
        scope.ownedServiceIds.add(opId);
        scope.serviceNames[opId] = row.payload?.companyName || 'Aviation Operator';
      }
      if (scope.ownedServiceIds.size === 0) {
        scope.ownedServiceIds.add('*');
      }
    }
  } catch (err) {
    console.warn('[ticket-validation] Scope resolution error:', err.message);
    scope.ownedServiceIds.add('*');
  }

  return scope;
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTRACTION TICKET VALIDATION LOGIC
// ─────────────────────────────────────────────────────────────────────────────
async function validateAttractionTicket(dbReady, cleanRef, scope, staffEmail, staffName, deviceInfo) {
  let booking = null;

  if (dbReady) {
    // 1. Search in bc_event_bookings
    const res = await query(`SELECT * FROM bc_event_bookings WHERE UPPER(booking_ref) = $1 OR UPPER(ticket_id) = $1 LIMIT 1`, [cleanRef]);
    if (res.rows.length > 0) {
      const row = res.rows[0];
      booking = {
        ref: row.booking_ref,
        ticketId: row.ticket_id,
        eventId: String(row.event_profile_id),
        eventName: row.event_name,
        ticketName: row.ticket_name,
        quantity: Number(row.quantity || 1),
        admissionsUsed: Number(row.admissions_used || 0),
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        paymentStatus: row.status === 'pending_payment' ? 'pending' : (row.status === 'paid' || row.status === 'confirmed' || row.status === 'completed' ? 'paid' : row.status),
        bookingStatus: row.status,
        ticketStatus: row.ticket_status || 'valid',
        createdAt: row.created_at,
        sourceTable: 'bc_event_bookings',
        id: row.id
      };
    } else {
      // 2. Search in bc_bookings fallback
      const bRes = await query(`SELECT * FROM bc_bookings WHERE UPPER(ref) = $1 LIMIT 1`, [cleanRef]);
      if (bRes.rows.length > 0) {
        const row = bRes.rows[0];
        const pax = (row.passengers && row.passengers[0]) ? `${row.passengers[0].firstName || ''} ${row.passengers[0].lastName || ''}`.trim() : (row.contact?.email || 'Guest');
        booking = {
          ref: row.ref,
          ticketId: row.ref,
          eventId: 'general',
          eventName: row.route || 'Attraction Entry',
          ticketName: 'Standard Admission',
          quantity: Array.isArray(row.passengers) && row.passengers.length > 0 ? row.passengers.length : 1,
          admissionsUsed: row.status === 'used' ? 1 : 0,
          guestName: pax,
          guestEmail: row.contact_email || row.contact?.email || '',
          paymentStatus: row.payment ? 'paid' : 'paid',
          bookingStatus: row.status,
          ticketStatus: row.status === 'cancelled' ? 'cancelled' : (row.status === 'refunded' ? 'refunded' : (row.status === 'used' ? 'used' : 'valid')),
          createdAt: row.created_at,
          sourceTable: 'bc_bookings',
          id: row.ref
        };
      }
    }
  } else {
    // Memory fallback search
    if (global.__bc_event_bookings) {
      const b = global.__bc_event_bookings.get(cleanRef);
      if (b) {
        booking = {
          ref: b.bookingRef,
          ticketId: b.ticketId || b.bookingRef,
          eventId: String(b.eventId),
          eventName: b.eventName,
          ticketName: b.ticketName,
          quantity: Number(b.quantity || 1),
          admissionsUsed: Number(b.admissionsUsed || 0),
          guestName: b.clientName,
          guestEmail: b.email,
          paymentStatus: b.status === 'pending_payment' ? 'pending' : 'paid',
          bookingStatus: b.status,
          ticketStatus: b.ticketStatus || 'valid',
          createdAt: b.createdAt,
          sourceTable: 'memory',
          id: b.bookingRef
        };
      }
    }
  }

  if (!booking) {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'attraction',
      actionPerformed: 'verify', result: 'rejected', rejectionReason: 'Ticket not found',
      validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo
    });
    return {
      valid: false,
      result: 'rejected',
      reason: 'Ticket not found. Please verify the ticket number or QR code.',
      ticketNumber: cleanRef
    };
  }

  // Permission / Ownership check
  if (!scope.ownedServiceIds.has('*') && !scope.ownedServiceIds.has(booking.eventId)) {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'attraction', serviceId: booking.eventId,
      serviceName: booking.eventName, actionPerformed: 'verify', result: 'rejected',
      rejectionReason: 'Ticket not valid for this operator', validatedByEmail: staffEmail,
      validatedByName: staffName, deviceInfo, guestName: booking.guestName
    });
    return {
      valid: false,
      result: 'rejected',
      reason: 'Ticket is not valid for your attraction or service scope.',
      ticketNumber: cleanRef,
      details: booking
    };
  }

  // Validate status
  if (booking.ticketStatus === 'cancelled' || booking.bookingStatus === 'cancelled') {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'attraction', serviceId: booking.eventId,
      serviceName: booking.eventName, actionPerformed: 'verify', result: 'rejected',
      rejectionReason: 'Booking cancelled', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo, guestName: booking.guestName
    });
    return { valid: false, result: 'rejected', reason: 'This booking has been cancelled.', ticketNumber: cleanRef, details: booking };
  }

  if (booking.ticketStatus === 'refunded') {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'attraction', serviceId: booking.eventId,
      serviceName: booking.eventName, actionPerformed: 'verify', result: 'rejected',
      rejectionReason: 'Ticket refunded', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo, guestName: booking.guestName
    });
    return { valid: false, result: 'rejected', reason: 'This ticket has been refunded.', ticketNumber: cleanRef, details: booking };
  }

  if (booking.paymentStatus === 'pending' || booking.paymentStatus === 'pending_payment') {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'attraction', serviceId: booking.eventId,
      serviceName: booking.eventName, actionPerformed: 'verify', result: 'rejected',
      rejectionReason: 'Payment not completed', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo, guestName: booking.guestName
    });
    return { valid: false, result: 'rejected', reason: 'Payment for this ticket has not been completed.', ticketNumber: cleanRef, details: booking };
  }

  const admissionsRemaining = Math.max(0, booking.quantity - booking.admissionsUsed);

  if (admissionsRemaining <= 0 || booking.ticketStatus === 'used') {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'attraction', serviceId: booking.eventId,
      serviceName: booking.eventName, actionPerformed: 'verify', result: 'rejected',
      rejectionReason: 'Ticket already used (0 admissions remaining)', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo, guestName: booking.guestName
    });
    return {
      valid: false,
      result: 'rejected',
      reason: `Ticket has already been fully used (${booking.admissionsUsed}/${booking.quantity} admissions used).`,
      ticketNumber: cleanRef,
      details: { ...booking, admissionsRemaining: 0 }
    };
  }

  // Successfully verified!
  await logValidation(dbReady, {
    ticketNumber: cleanRef, operatorType: 'attraction', serviceId: booking.eventId,
    serviceName: booking.eventName, actionPerformed: 'verified', result: 'accepted',
    rejectionReason: '', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo,
    guestName: booking.guestName, details: { admissionsRemaining, quantity: booking.quantity }
  });

  return {
    valid: true,
    result: 'accepted',
    ticketNumber: cleanRef,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    serviceName: booking.eventName,
    bookingRef: booking.ref,
    ticketType: booking.ticketName,
    quantity: booking.quantity,
    admissionsUsed: booking.admissionsUsed,
    admissionsRemaining,
    validityDate: booking.createdAt,
    paymentStatus: booking.paymentStatus,
    currentStatus: booking.ticketStatus,
    canAdmit: true,
    details: booking
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAYS / ACCOMMODATION VALIDATION LOGIC
// ─────────────────────────────────────────────────────────────────────────────
async function validateStayTicket(dbReady, cleanRef, scope, staffEmail, staffName, deviceInfo) {
  let booking = null;

  if (dbReady) {
    const res = await query(`
      SELECT b.*, r.room_number, r.room_type, r.wing_section, f.name as floor_name, h.name as hotel_profile_name, h.hotel_name
      FROM bc_pms_bookings b
      LEFT JOIN bc_pms_rooms r ON r.id = b.room_id
      LEFT JOIN bc_pms_floors f ON f.id = b.floor_id
      LEFT JOIN bc_hotel_profiles h ON h.id = b.hotel_profile_id
      WHERE UPPER(b.ref) = $1 LIMIT 1
    `, [cleanRef]);

    if (res.rows.length > 0) {
      const row = res.rows[0];
      booking = {
        ref: row.ref,
        hotelProfileId: String(row.hotel_profile_id),
        propertyName: row.hotel_name || row.hotel_profile_name || 'Property Residence',
        roomNumber: row.room_number || 'TBD',
        roomType: row.room_type || 'Standard Room',
        floorName: row.floor_name || 'Main',
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        guestPhone: row.guest_phone || '',
        checkInDate: row.check_in,
        checkOutDate: row.check_out,
        numGuests: row.num_guests || 1,
        bookingStatus: row.booking_status, // 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled'
        paymentStatus: row.payment_status || 'paid',
        ticketStatus: row.ticket_status || 'valid',
        totalAmount: row.total_amount,
        createdAt: row.created_at,
        id: row.id
      };
    }
  } else {
    if (global.__bc_pms && global.__bc_pms.bookings) {
      for (const [, b] of global.__bc_pms.bookings) {
        if (b.ref.toUpperCase() === cleanRef) {
          booking = {
            ref: b.ref,
            hotelProfileId: String(b.hotel_profile_id),
            propertyName: 'Stay Property',
            roomNumber: 'G01',
            roomType: 'Deluxe Room',
            floorName: 'Ground Floor',
            guestName: b.guest_name,
            guestEmail: b.guest_email,
            guestPhone: b.guest_phone || '',
            checkInDate: b.check_in,
            checkOutDate: b.check_out,
            numGuests: b.num_guests || 1,
            bookingStatus: b.booking_status,
            paymentStatus: b.payment_status || 'paid',
            ticketStatus: 'valid',
            totalAmount: b.total_amount,
            createdAt: b.created_at,
            id: b.id
          };
          break;
        }
      }
    }
  }

  if (!booking) {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'stay',
      actionPerformed: 'verify', result: 'rejected', rejectionReason: 'Stay reservation not found',
      validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo
    });
    return {
      valid: false,
      result: 'rejected',
      reason: 'Stay reservation ref not found. Please check reservation number.',
      ticketNumber: cleanRef
    };
  }

  // Ownership check
  if (!scope.ownedServiceIds.has('*') && !scope.ownedServiceIds.has(booking.hotelProfileId)) {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'stay', serviceId: booking.hotelProfileId,
      serviceName: booking.propertyName, actionPerformed: 'verify', result: 'rejected',
      rejectionReason: 'Reservation not valid for this property owner', validatedByEmail: staffEmail,
      validatedByName: staffName, deviceInfo, guestName: booking.guestName
    });
    return { valid: false, result: 'rejected', reason: 'Reservation belongs to a different property.', ticketNumber: cleanRef, details: booking };
  }

  // Status checks
  if (booking.bookingStatus === 'cancelled') {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'stay', serviceId: booking.hotelProfileId,
      serviceName: booking.propertyName, actionPerformed: 'verify', result: 'rejected',
      rejectionReason: 'Reservation cancelled', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo, guestName: booking.guestName
    });
    return { valid: false, result: 'rejected', reason: 'This stay reservation has been cancelled.', ticketNumber: cleanRef, details: booking };
  }

  // Successful stay reservation verification
  await logValidation(dbReady, {
    ticketNumber: cleanRef, operatorType: 'stay', serviceId: booking.hotelProfileId,
    serviceName: booking.propertyName, actionPerformed: 'verified', result: 'accepted',
    rejectionReason: '', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo,
    guestName: booking.guestName, details: booking
  });

  return {
    valid: true,
    result: 'accepted',
    ticketNumber: cleanRef,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    propertyName: booking.propertyName,
    bookingRef: booking.ref,
    roomNumber: booking.roomNumber,
    floorName: booking.floorName,
    roomType: booking.roomType,
    checkInDate: booking.checkInDate,
    checkOutDate: booking.checkOutDate,
    numGuests: booking.numGuests,
    paymentStatus: booking.paymentStatus,
    bookingStatus: booking.bookingStatus,
    currentStatus: booking.bookingStatus === 'checked_in' ? 'Checked In' : (booking.bookingStatus === 'checked_out' ? 'Checked Out' : 'Confirmed'),
    details: booking
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AVIATION TICKET & BOARDING PASS LOGIC
// ─────────────────────────────────────────────────────────────────────────────
async function validateAviationTicket(dbReady, cleanRef, scope, staffEmail, staffName, deviceInfo) {
  let booking = null;

  if (dbReady) {
    // 1. Search in bc_aviation_records (kind = 'booking')
    const avRes = await query(`
      SELECT payload FROM bc_aviation_records
      WHERE kind = 'booking' AND (UPPER(id) = $1 OR UPPER(payload->>'ref') = $1 OR UPPER(payload->>'ticketNumber') = $1)
      LIMIT 1
    `, [cleanRef]);

    if (avRes.rows.length > 0) {
      const p = avRes.rows[0].payload;
      booking = {
        ref: p.ref || cleanRef,
        ticketNumber: p.ticketNumber || p.ref || cleanRef,
        passengerName: p.passengerName || p.email?.split('@')[0] || 'Passenger',
        guestEmail: p.email || '',
        flightNumber: p.flightNumber || 'FL-' + (p.ref || '').slice(-4),
        airline: p.airline || 'Aviation Operator',
        origin: p.origin?.code || p.origin?.city || p.origin || 'JFK',
        destination: p.destination?.code || p.destination?.city || p.destination || 'LAX',
        departDate: p.departDate || p.travelDate || new Date().toISOString().split('T')[0],
        cabinClass: p.cabin || p.cabinClass || 'Business',
        seatNumber: p.seatNumber || p.seat || '1A',
        checkInStatus: p.checkInStatus || 'pending', // 'pending' | 'checked_in'
        boardingStatus: p.boardingStatus || 'pending', // 'pending' | 'boarded'
        bookingStatus: p.status || 'confirmed',
        paymentStatus: p.payment?.status || 'paid',
        operatorEmail: p.operatorEmail || '',
        id: p.ref
      };
    } else {
      // 2. Search in bc_bookings
      const bRes = await query(`SELECT * FROM bc_bookings WHERE UPPER(ref) = $1 LIMIT 1`, [cleanRef]);
      if (bRes.rows.length > 0) {
        const row = bRes.rows[0];
        const flight = row.flight || {};
        const pax = (row.passengers && row.passengers[0]) ? `${row.passengers[0].firstName || ''} ${row.passengers[0].lastName || ''}`.trim() : 'Passenger';
        const parts = (row.route || 'ORIG → DEST').split(' → ');
        booking = {
          ref: row.ref,
          ticketNumber: row.ticket?.ticketNumber || row.ref,
          passengerName: pax,
          guestEmail: row.contact_email || row.contact?.email || '',
          flightNumber: flight.number || 'FL-100',
          airline: flight.airline || 'Aviation Flight',
          origin: parts[0] || 'DEP',
          destination: parts[1] || 'ARR',
          departDate: row.dates?.split(' → ')[0] || new Date().toISOString().split('T')[0],
          cabinClass: flight.cabin || 'Economy',
          seatNumber: flight.seat || 'Check-in Required',
          checkInStatus: row.status === 'checked_in' || row.status === 'boarded' ? 'checked_in' : 'pending',
          boardingStatus: row.status === 'boarded' ? 'boarded' : 'pending',
          bookingStatus: row.status,
          paymentStatus: row.payment ? 'paid' : 'paid',
          operatorEmail: '',
          id: row.ref
        };
      }
    }
  }

  if (!booking) {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'aviation',
      actionPerformed: 'verify', result: 'rejected', rejectionReason: 'Flight ticket not found',
      validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo
    });
    return {
      valid: false,
      result: 'rejected',
      reason: 'Aviation ticket or boarding pass reference not found.',
      ticketNumber: cleanRef
    };
  }

  // Ownership check if specific operator email attached
  if (booking.operatorEmail && !scope.ownedServiceIds.has('*') && !scope.ownedServiceIds.has(booking.operatorEmail) && scope.userEmail !== booking.operatorEmail.toLowerCase()) {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'aviation', serviceId: booking.flightNumber,
      serviceName: booking.airline, actionPerformed: 'verify', result: 'rejected',
      rejectionReason: 'Ticket not valid for this aviation operator', validatedByEmail: staffEmail,
      validatedByName: staffName, deviceInfo, guestName: booking.passengerName
    });
    return { valid: false, result: 'rejected', reason: 'Ticket is assigned to another aviation operator.', ticketNumber: cleanRef, details: booking };
  }

  if (booking.bookingStatus === 'cancelled') {
    await logValidation(dbReady, {
      ticketNumber: cleanRef, operatorType: 'aviation', serviceId: booking.flightNumber,
      serviceName: booking.airline, actionPerformed: 'verify', result: 'rejected',
      rejectionReason: 'Flight ticket cancelled', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo, guestName: booking.passengerName
    });
    return { valid: false, result: 'rejected', reason: 'Flight booking or ticket has been cancelled.', ticketNumber: cleanRef, details: booking };
  }

  // Log successful validation
  await logValidation(dbReady, {
    ticketNumber: cleanRef, operatorType: 'aviation', serviceId: booking.flightNumber,
    serviceName: `${booking.airline} (${booking.flightNumber})`, actionPerformed: 'verified', result: 'accepted',
    rejectionReason: '', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo,
    guestName: booking.passengerName, details: booking
  });

  return {
    valid: true,
    result: 'accepted',
    ticketNumber: booking.ticketNumber,
    passengerName: booking.passengerName,
    guestEmail: booking.guestEmail,
    flightNumber: booking.flightNumber,
    airline: booking.airline,
    bookingRef: booking.ref,
    origin: booking.origin,
    destination: booking.destination,
    departDate: booking.departDate,
    cabinClass: booking.cabinClass,
    seatNumber: booking.seatNumber,
    checkInStatus: booking.checkInStatus,
    boardingStatus: booking.boardingStatus,
    paymentStatus: booking.paymentStatus,
    bookingStatus: booking.bookingStatus,
    currentStatus: booking.boardingStatus === 'boarded' ? 'Boarded' : (booking.checkInStatus === 'checked_in' ? 'Checked In' : 'Confirmed Ticket'),
    details: booking
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────────────────
module.exports = async function ticketValidationHandler(req, res) {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let dbReady = false;
  try {
    if (isDbConfigured()) {
      await initDb();
      await ensureTables();
      dbReady = true;
    }
  } catch (err) {
    console.warn('[ticket-validation] DB unavailable, using memory fallback:', err.message);
  }

  // Require bearer token for all validation operations
  const auth = await verifyRequestBearer(req);
  if (!auth.ok) {
    return res.status(401).json({ ok: false, error: 'Authentication required for ticket validation' });
  }

  const staffEmail = auth.email.toLowerCase();
  const staffName = auth.name || staffEmail.split('@')[0];
  const deviceInfo = req.headers['user-agent'] || 'Web Dashboard';

  const body = req.method === 'GET' ? req.query : (req.body || {});
  const { action, operatorType = 'attraction', ticketNumber, ref } = body;
  const targetRef = String(ticketNumber || ref || '').trim().toUpperCase();

  // 1. MAIN TICKET VALIDATION LOOKUP
  if (action === 'validate' || action === 'lookup' || req.method === 'GET') {
    if (!targetRef) {
      return res.status(400).json({ ok: false, error: 'Ticket number or QR reference is required' });
    }

    const scope = await resolveOperatorScope(dbReady, staffEmail, operatorType);

    let outcome;
    if (operatorType === 'attraction') {
      outcome = await validateAttractionTicket(dbReady, targetRef, scope, staffEmail, staffName, deviceInfo);
    } else if (operatorType === 'stay') {
      outcome = await validateStayTicket(dbReady, targetRef, scope, staffEmail, staffName, deviceInfo);
    } else if (operatorType === 'aviation') {
      outcome = await validateAviationTicket(dbReady, targetRef, scope, staffEmail, staffName, deviceInfo);
    } else {
      return res.status(400).json({ ok: false, error: 'Invalid operator type' });
    }

    return res.json({ ok: outcome.valid, ...outcome });
  }

  // 2. PROCESS TICKET ACTION (CONCURRENCY SAFE / ATOMIC UPDATE)
  if (action === 'process-action') {
    const { targetAction, overrideReason, countToAdmit = 1 } = body;
    if (!targetRef || !targetAction) {
      return res.status(400).json({ ok: false, error: 'ticketNumber and targetAction are required' });
    }

    const scope = await resolveOperatorScope(dbReady, staffEmail, operatorType);

    // ── ATTRACTION: CONSUME ADMISSION ──
    if (operatorType === 'attraction' && (targetAction === 'consume_admission' || targetAction === 'admit')) {
      if (dbReady) {
        // Atomic update with concurrency guard
        const updateRes = await query(`
          UPDATE bc_event_bookings
          SET admissions_used = admissions_used + $1,
              ticket_status = CASE WHEN (admissions_used + $1) >= quantity THEN 'used' ELSE ticket_status END,
              updated_at = NOW()
          WHERE (UPPER(booking_ref) = $2 OR UPPER(ticket_id) = $2)
            AND status NOT IN ('cancelled', 'pending_payment')
            AND admissions_used + $1 <= quantity
          RETURNING *
        `, [Math.max(1, Number(countToAdmit)), targetRef]);

        if (updateRes.rows.length === 0) {
          // Double scan or limit exceeded!
          const curr = await query(`SELECT * FROM bc_event_bookings WHERE UPPER(booking_ref) = $1 OR UPPER(ticket_id) = $1`, [targetRef]);
          const existingRow = curr.rows[0];
          const reason = existingRow ? `Admission limit reached (${existingRow.admissions_used}/${existingRow.quantity} used). Concurrent attempt blocked.` : 'Ticket not found or ineligible for admission.';

          await logValidation(dbReady, {
            ticketNumber: targetRef, operatorType: 'attraction', actionPerformed: 'admit',
            result: 'rejected', rejectionReason: reason, validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo
          });

          return res.status(409).json({ ok: false, result: 'rejected', error: reason });
        }

        const row = updateRes.rows[0];
        const rem = Math.max(0, row.quantity - row.admissions_used);

        await logValidation(dbReady, {
          ticketNumber: targetRef, operatorType: 'attraction', serviceId: String(row.event_profile_id),
          serviceName: row.event_name, actionPerformed: 'admit', result: 'accepted',
          validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo, guestName: row.guest_name,
          details: { admittedNow: countToAdmit, totalUsed: row.admissions_used, remaining: rem }
        });

        return res.json({
          ok: true,
          result: 'accepted',
          message: `Admitted ${countToAdmit} guest(s). ${rem} admission(s) remaining.`,
          admissionsUsed: row.admissions_used,
          admissionsRemaining: rem,
          currentStatus: row.ticket_status
        });
      } else {
        const b = global.__bc_event_bookings ? global.__bc_event_bookings.get(targetRef) : null;
        if (!b) return res.status(404).json({ ok: false, error: 'Ticket not found' });
        b.admissionsUsed = (b.admissionsUsed || 0) + Number(countToAdmit);
        if (b.admissionsUsed >= b.quantity) b.ticketStatus = 'used';

        await logValidation(dbReady, {
          ticketNumber: targetRef, operatorType: 'attraction', actionPerformed: 'admit',
          result: 'accepted', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo
        });

        return res.json({
          ok: true,
          result: 'accepted',
          message: `Admitted guest(s). ${Math.max(0, b.quantity - b.admissionsUsed)} remaining.`,
          admissionsUsed: b.admissionsUsed,
          admissionsRemaining: Math.max(0, b.quantity - b.admissionsUsed)
        });
      }
    }

    // ── STAYS: CHECK IN / CHECK OUT / CONFIRM ──
    if (operatorType === 'stay') {
      if (!['check_in', 'check_out', 'confirm_reservation'].includes(targetAction)) {
        return res.status(400).json({ ok: false, error: 'Invalid stay action' });
      }

      const nextStatus = targetAction === 'check_in' ? 'checked_in' : (targetAction === 'check_out' ? 'checked_out' : 'confirmed');

      if (dbReady) {
        const upd = await query(`
          UPDATE bc_pms_bookings
          SET booking_status = $1, updated_at = NOW()
          WHERE UPPER(ref) = $2 AND booking_status != 'cancelled'
          RETURNING *
        `, [nextStatus, targetRef]);

        if (upd.rows.length === 0) {
          return res.status(400).json({ ok: false, error: 'Reservation not found or cancelled.' });
        }

        const row = upd.rows[0];

        // If checking out, free room in pms_rooms if needed
        if (nextStatus === 'checked_out' && row.room_id) {
          await query(`UPDATE bc_pms_rooms SET status = 'available', updated_at = NOW() WHERE id = $1`, [row.room_id]).catch(() => {});
        } else if (nextStatus === 'checked_in' && row.room_id) {
          await query(`UPDATE bc_pms_rooms SET status = 'occupied', updated_at = NOW() WHERE id = $1`, [row.room_id]).catch(() => {});
        }

        await logValidation(dbReady, {
          ticketNumber: targetRef, operatorType: 'stay', serviceId: String(row.hotel_profile_id),
          serviceName: 'Stay Reservation', actionPerformed: targetAction, result: 'accepted',
          validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo, guestName: row.guest_name,
          details: { nextStatus, overrideReason: overrideReason || '' }
        });

        return res.json({
          ok: true,
          result: 'accepted',
          message: `Guest ${row.guest_name} successfully ${targetAction === 'check_in' ? 'checked in' : (targetAction === 'check_out' ? 'checked out' : 'confirmed')}.`,
          bookingStatus: row.booking_status
        });
      } else {
        await logValidation(dbReady, {
          ticketNumber: targetRef, operatorType: 'stay', actionPerformed: targetAction,
          result: 'accepted', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo
        });
        return res.json({ ok: true, result: 'accepted', message: `Stay status updated to ${nextStatus}` });
      }
    }

    // ── AVIATION: CHECK IN / MARK BOARDED ──
    if (operatorType === 'aviation') {
      if (!['check_in_passenger', 'mark_boarded', 'verify_ticket'].includes(targetAction)) {
        return res.status(400).json({ ok: false, error: 'Invalid aviation action' });
      }

      if (dbReady) {
        // Try update in bc_aviation_records
        const avRes = await query(`SELECT payload FROM bc_aviation_records WHERE kind = 'booking' AND (UPPER(id) = $1 OR UPPER(payload->>'ref') = $1 OR UPPER(payload->>'ticketNumber') = $1)`, [targetRef]);
        if (avRes.rows.length > 0) {
          const payload = avRes.rows[0].payload;
          if (targetAction === 'check_in_passenger') payload.checkInStatus = 'checked_in';
          if (targetAction === 'mark_boarded') payload.boardingStatus = 'boarded';

          await query(`UPDATE bc_aviation_records SET payload = $1::jsonb, updated_at = NOW() WHERE kind = 'booking' AND (UPPER(id) = $2 OR UPPER(payload->>'ref') = $2)`, [JSON.stringify(payload), targetRef]);

          await logValidation(dbReady, {
            ticketNumber: targetRef, operatorType: 'aviation', serviceId: payload.flightNumber || 'Flight',
            serviceName: payload.airline || 'Aviation Operator', actionPerformed: targetAction, result: 'accepted',
            validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo, guestName: payload.passengerName || ''
          });

          return res.json({
            ok: true,
            result: 'accepted',
            message: targetAction === 'check_in_passenger' ? 'Passenger checked in successfully.' : 'Passenger marked as boarded.',
            checkInStatus: payload.checkInStatus,
            boardingStatus: payload.boardingStatus
          });
        }
      }

      await logValidation(dbReady, {
        ticketNumber: targetRef, operatorType: 'aviation', actionPerformed: targetAction,
        result: 'accepted', validatedByEmail: staffEmail, validatedByName: staffName, deviceInfo
      });

      return res.json({ ok: true, result: 'accepted', message: 'Aviation passenger status updated successfully.' });
    }

    return res.status(400).json({ ok: false, error: 'Unhandled process action' });
  }

  // 3. VALIDATION AUDIT HISTORY
  if (action === 'history') {
    const { dateFrom, dateTo, search, statusFilter, actionPerformed, limit = 50 } = body;

    let records = [];
    if (dbReady) {
      let q = `SELECT * FROM bc_ticket_validations WHERE operator_type = $1`;
      const params = [operatorType];

      if (!staffEmail.includes('admin')) {
        params.push(staffEmail);
        q += ` AND validated_by_email = $${params.length}`;
      }

      if (search) {
        params.push(`%${search.trim().toUpperCase()}%`);
        q += ` AND (UPPER(ticket_number) LIKE $${params.length} OR UPPER(guest_name) LIKE $${params.length})`;
      }

      if (statusFilter && statusFilter !== 'all') {
        params.push(statusFilter);
        q += ` AND result = $${params.length}`;
      }

      if (actionPerformed && actionPerformed !== 'all') {
        params.push(actionPerformed);
        q += ` AND action_performed = $${params.length}`;
      }

      q += ` ORDER BY created_at DESC LIMIT ${Math.min(200, Number(limit))}`;

      const res = await query(q, params);
      records = res.rows.map(r => ({
        id: r.id,
        ticketNumber: r.ticket_number,
        operatorType: r.operator_type,
        serviceId: r.service_id,
        serviceName: r.service_name,
        actionPerformed: r.action_performed,
        result: r.result,
        rejectionReason: r.rejection_reason,
        validatedByEmail: r.validated_by_email,
        validatedByName: r.validated_by_name,
        deviceInfo: r.device_info,
        guestName: r.guest_name,
        details: r.details || {},
        createdAt: r.created_at
      }));
    } else {
      records = memValidations().filter(r => r.operatorType === operatorType);
    }

    return res.json({ ok: true, history: records });
  }

  // 4. SUMMARY STATS
  if (action === 'stats') {
    let stats = { totalChecked: 0, accepted: 0, rejected: 0, todayValid: 0, todayUsed: 0 };
    if (dbReady) {
      const res = await query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN result = 'accepted' THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN result = 'rejected' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN result = 'accepted' AND created_at >= CURRENT_DATE THEN 1 ELSE 0 END) as today_valid
        FROM bc_ticket_validations
        WHERE operator_type = $1
      `, [operatorType]);

      if (res.rows.length > 0) {
        const row = res.rows[0];
        stats = {
          totalChecked: Number(row.total || 0),
          accepted: Number(row.accepted || 0),
          rejected: Number(row.rejected || 0),
          todayValid: Number(row.today_valid || 0)
        };
      }
    } else {
      const list = memValidations().filter(r => r.operatorType === operatorType);
      stats.totalChecked = list.length;
      stats.accepted = list.filter(r => r.result === 'accepted').length;
      stats.rejected = list.filter(r => r.result === 'rejected').length;
    }

    return res.json({ ok: true, stats });
  }

  return res.status(400).json({ ok: false, error: 'Unknown ticket validation action' });
};
