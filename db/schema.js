"use strict";

const {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} = require("drizzle-orm/pg-core");

// Raw binary column used for images served from the API (see api-routes/upload.js).
const bytea = customType({
  dataType() {
    return "bytea";
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

const nullableTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
};

const baTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

const bcUsers = pgTable(
  "bc_users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").default(""),
    passwordHash: text("password_hash"),
    authMethod: text("auth_method").default("google"),
    phone: text("phone").default(""),
    role: text("role").default("traveler"),
    profile: jsonb("profile").default({}).notNull(),
    state: jsonb("state").default({}).notNull(),
    ...nullableTimestamps,
  },
  (table) => [index("idx_users_email").on(table.email)]
);

const bcBookings = pgTable(
  "bc_bookings",
  {
    id: serial("id").primaryKey(),
    ref: text("ref").notNull().unique(),
    contactEmail: text("contact_email").default(""),
    status: text("status").default("new"),
    route: text("route").default(""),
    dates: text("dates").default(""),
    flight: jsonb("flight").default({}).notNull(),
    passengers: jsonb("passengers").default([]).notNull(),
    contact: jsonb("contact").default({}).notNull(),
    extras: jsonb("extras").default({}).notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).default("0"),
    payment: jsonb("payment"),
    paymentSplit: jsonb("payment_split"),
    duffelOrderId: text("duffel_order_id").default(""),
    duffelBookingReference: text("duffel_booking_reference").default(""),
    duffelOrderStatus: text("duffel_order_status").default(""),
    duffelOrderRequest: jsonb("duffel_order_request"),
    ticket: jsonb("ticket"),
    downloadCount: integer("download_count").default(0),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_bookings_ref").on(table.ref),
    index("idx_bookings_contact_email").on(table.contactEmail),
    index("idx_bookings_created").on(table.createdAt.desc()),
  ]
);

const bcSearchCache = pgTable(
  "bc_search_cache",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    payload: jsonb("payload").default({}).notNull(),
    meta: jsonb("meta").default({}).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_search_cache_key").on(table.key),
    index("idx_search_cache_expires").on(table.expiresAt),
  ]
);

const bcAdminAudit = pgTable(
  "bc_admin_audit",
  {
    id: serial("id").primaryKey(),
    event: jsonb("event").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_admin_audit_created").on(table.createdAt.desc())]
);

const bcSupport = pgTable(
  "bc_support",
  {
    id: serial("id").primaryKey(),
    threadId: text("thread_id").notNull().unique(),
    email: text("email").default(""),
    topic: text("topic").default(""),
    status: text("status").default("open"),
    adminRead: boolean("admin_read").default(false),
    messages: jsonb("messages").default([]).notNull(),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_support_thread_id").on(table.threadId),
    index("idx_support_updated").on(table.updatedAt.desc()),
  ]
);

const bcPriceAlerts = pgTable(
  "bc_price_alerts",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    origin: text("origin").default(""),
    destination: text("destination").default(""),
    departDate: text("depart_date").default(""),
    targetPrice: numeric("target_price", { precision: 12, scale: 2 }).default("0"),
    currency: text("currency").default("USD"),
    isNonstop: boolean("is_nonstop").default(false),
    status: text("status").default("active"),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_price_alerts_email").on(table.email),
    index("idx_price_alerts_status").on(table.status),
  ]
);

const bcAttractionEvents = pgTable(
  "bc_attraction_events",
  {
    id: serial("id").primaryKey(),
    sessionHash: text("session_hash").notNull(),
    userEmail: text("user_email"),
    eventType: text("event_type").notNull(),
    attractionId: text("attraction_id"),
    source: text("source"),
    destination: text("destination"),
    context: jsonb("context").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_attraction_events_created").on(table.createdAt.desc()),
    index("idx_attraction_events_type").on(table.eventType),
    index("idx_attraction_events_attraction").on(table.attractionId),
  ]
);

const baUser = pgTable("ba_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  ...baTimestamps,
});

const baSession = pgTable(
  "ba_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ...baTimestamps,
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => baUser.id, { onDelete: "cascade" }),
  },
  (table) => [index("idx_ba_session_user_id").on(table.userId)]
);

const baAccount = pgTable(
  "ba_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => baUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...baTimestamps,
  },
  (table) => [index("idx_ba_account_user_id").on(table.userId)]
);

const baVerification = pgTable(
  "ba_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...baTimestamps,
  },
  (table) => [index("idx_ba_verification_identifier").on(table.identifier)]
);

const bcGuides = pgTable(
  "bc_guides",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    email: text("email").default(""),
    photo: text("photo").default(""),
    bio: text("bio").default(""),
    country: text("country").default(""),
    city: text("city").default(""),
    yearsExp: integer("years_exp").default(0),
    verified: boolean("verified").default(false),
    rating: numeric("rating", { precision: 3, scale: 2 }).default("0"),
    reviewCount: integer("review_count").default(0),
    categories: jsonb("categories").default([]).notNull(),
    skills: jsonb("skills").default([]).notNull(),
    languages: jsonb("languages").default([]).notNull(),
    areas: jsonb("areas").default({}).notNull(),
    certifications: jsonb("certifications").default([]).notNull(),
    gallery: jsonb("gallery").default([]).notNull(),
    reviews: jsonb("reviews").default([]).notNull(),
    pricing: jsonb("pricing").default({}).notNull(),
    badges: jsonb("badges").default([]),
    trustIndicators: jsonb("trust_indicators").default({}).notNull(),
    demandLevel: text("demand_level").default("moderate"),
    status: text("status").default("active"),
    instantBooking: boolean("instant_booking").default(false),
    workingDays: text("working_days").default("[]"),
    workingHours: text("working_hours").default("{}"),
    maxToursPerDay: integer("max_tours_per_day").default(1),
    registrationFeePaid: boolean("registration_fee_paid").default(true),
    registrationFeeType: text("registration_fee_type").default("free_early_bird"),
    verificationFeePaid: boolean("verification_fee_paid").default(true),
    verificationStatus: text("verification_status").default("approved"),
    availability: jsonb("availability").default({}).notNull(),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_guides_slug").on(table.slug),
    index("idx_guides_status").on(table.status),
    index("idx_guides_country").on(table.country),
    index("idx_guides_email").on(table.email),
  ]
);

const bcGuideBookings = pgTable(
  "bc_guide_bookings",
  {
    id: serial("id").primaryKey(),
    ref: text("ref").notNull().unique(),
    guideId: text("guide_id").notNull(),
    contactEmail: text("contact_email").default(""),
    status: text("status").default("pending"),
    startDate: text("start_date").default(""),
    endDate: text("end_date").default(""),
    guests: integer("guests").default(1),
    total: numeric("total", { precision: 12, scale: 2 }).default("0"),
    contact: jsonb("contact").default({}).notNull(),
    payment: jsonb("payment"),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_guide_bookings_ref").on(table.ref),
    index("idx_guide_bookings_guide_id").on(table.guideId),
    index("idx_guide_bookings_email").on(table.contactEmail),
    index("idx_guide_bookings_created").on(table.createdAt.desc()),
  ]
);

const bcGuideProfiles = pgTable(
  "bc_guide_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    email: text("email").notNull(),
    stepPersonal: jsonb("step_personal").default({}),
    stepCategories: jsonb("step_categories").default({}),
    stepAreas: jsonb("step_areas").default({}),
    stepLanguages: jsonb("step_languages").default({}),
    stepSkills: jsonb("step_skills").default({}),
    stepCertifications: jsonb("step_certifications").default([]),
    stepExperience: jsonb("step_experience").default({}),
    stepPricing: jsonb("step_pricing").default({}),
    stepGallery: jsonb("step_gallery").default([]),
    stepAvailability: jsonb("step_availability").default({}),
    stepBookingSettings: jsonb("step_booking_settings").default({}),
    status: text("status").default("draft"),
    adminNote: text("admin_note").default(""),
    completeness: integer("completeness").default(0),
    currentStep: integer("current_step").default(1),
    registrationFeePaid: boolean("registration_fee_paid").default(false),
    registrationFeeType: text("registration_fee_type").default("free_early_bird"),
    verificationFeePaid: boolean("verification_fee_paid").default(false),
    verificationStatus: text("verification_status").default("unrequested"),
    stripeAccountId: text("stripe_account_id"),
    stripeOnboardingComplete: boolean("stripe_onboarding_complete").default(false),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_guide_profiles_email").on(table.email),
    index("idx_guide_profiles_status").on(table.status),
  ]
);

const bcGuideReviews = pgTable(
  "bc_guide_reviews",
  {
    id: serial("id").primaryKey(),
    guideId: text("guide_id").notNull(),
    bookingRef: text("booking_ref").notNull().unique(),
    authorName: text("author_name"),
    authorEmail: text("author_email"),
    rating: numeric("rating", { precision: 3, scale: 2 }).notNull(),
    detailedRatings: jsonb("detailed_ratings").default({}),
    text: text("text"),
    photos: jsonb("photos").default([]),
    recommendation: text("recommendation"),
    travelerType: text("traveler_type"),
    tags: jsonb("tags").default([]),
    status: text("status").default("approved"),
    guideResponse: text("guide_response"),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_guide_reviews_guide").on(table.guideId),
    index("idx_guide_reviews_status").on(table.status),
  ]
);

const bcGuideWithdrawals = pgTable(
  "bc_guide_withdrawals",
  {
    id: serial("id").primaryKey(),
    guideId: text("guide_id").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    method: text("method").notNull(),
    status: text("status").default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_guide_withdrawals_guide").on(table.guideId)]
);

const bcHotelProfiles = pgTable(
  "bc_hotel_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    email: text("email").notNull(),
    stepPropertyInfo: jsonb("step_property_info").default({}),
    stepLocation: jsonb("step_location").default({}),
    stepAmenities: jsonb("step_amenities").default({}),
    stepRooms: jsonb("step_rooms").default({}),
    stepGallery: jsonb("step_gallery").default([]),
    stepPolicies: jsonb("step_policies").default({}),
    stepContact: jsonb("step_contact").default({}),
    status: text("status").default("draft"),
    adminNote: text("admin_note").default(""),
    completeness: integer("completeness").default(0),
    currentStep: integer("current_step").default(1),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_hotel_profiles_email").on(table.email),
    index("idx_hotel_profiles_status").on(table.status),
  ]
);

const bcAttractionProfiles = pgTable(
  "bc_attraction_profiles",
  {
    id: serial("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    ownerId: integer("owner_id"),
    name: text("name").default(""),
    category: text("category").default(""),
    location: text("location").default(""),
    country: text("country").default(""),
    city: text("city").default(""),
    description: text("description").default(""),
    featuredImage: text("featured_image").default(""),
    gallery: jsonb("gallery").default([]),
    tags: jsonb("tags").default([]),
    price: numeric("price", { precision: 12, scale: 2 }).default("0"),
    currency: text("currency").default("USD"),
    duration: text("duration").default(""),
    highlights: jsonb("highlights").default([]),
    contact: jsonb("contact").default({}),
    openingHours: jsonb("opening_hours").default({}),
    amenities: jsonb("amenities").default([]),
    status: text("status").default("draft"),
    adminNote: text("admin_note").default(""),
    views: integer("views").default(0),
    bookings: integer("bookings").default(0),
    completeness: integer("completeness").default(0),
    deleted: boolean("deleted").default(false),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_attr_profiles_owner").on(table.ownerEmail),
    index("idx_attr_profiles_status").on(table.status),
  ]
);

const bcEventOrganizerProfiles = pgTable(
  "bc_event_organizer_profiles",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    payload: jsonb("payload").default({}),
    ...nullableTimestamps,
  },
  (table) => [index("idx_event_organizer_profiles_email").on(table.email)]
);

const bcEventProfiles = pgTable(
  "bc_event_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    email: text("email").notNull(),
    stepEventInfo: jsonb("step_event_info").default({}).notNull(),
    stepLocation: jsonb("step_location").default({}).notNull(),
    stepFeatures: jsonb("step_features").default({}).notNull(),
    stepTickets: jsonb("step_tickets").default({}).notNull(),
    stepGallery: jsonb("step_gallery").default([]).notNull(),
    stepPolicies: jsonb("step_policies").default({}).notNull(),
    stepContact: jsonb("step_contact").default({}).notNull(),
    ticketBannerImage: text("ticket_banner_image").default(""),
    status: text("status").default("draft").notNull(),
    adminNote: text("admin_note").default(""),
    completeness: integer("completeness").default(0).notNull(),
    currentStep: integer("current_step").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    index("idx_event_profiles_status").on(table.status),
    index("idx_event_profiles_email").on(table.email),
  ]
);

const bcEventBookings = pgTable(
  "bc_event_bookings",
  {
    id: serial("id").primaryKey(),
    bookingRef: text("booking_ref").notNull().unique(),
    eventProfileId: text("event_profile_id").notNull(),
    eventName: text("event_name").notNull(),
    venueName: text("venue_name").notNull(),
    location: text("location").default(""),
    bannerImage: text("banner_image").default(""),
    ticketId: text("ticket_id").notNull(),
    ticketName: text("ticket_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitAmount: numeric("unit_amount", { precision: 12, scale: 2 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    serviceFee: numeric("service_fee", { precision: 12, scale: 2 }).default("0"),
    organizerAmount: numeric("organizer_amount", { precision: 12, scale: 2 }).default("0"),
    currency: text("currency").notNull(),
    guestName: text("guest_name").notNull(),
    guestEmail: text("guest_email").notNull(),
    guestPhone: text("guest_phone").default(""),
    status: text("status").default("pending_payment").notNull(),
    ticketNo: text("ticket_no").default(""),
    paymentMethod: text("payment_method").default(""),
    admissionsUsed: integer("admissions_used").default(0),
    ticketStatus: text("ticket_status").default("valid"),
    ...timestamps,
  },
  (table) => [
    index("idx_event_bookings_event").on(table.eventProfileId),
    index("idx_event_bookings_email").on(table.guestEmail),
  ]
);

const bcPmsFloors = pgTable(
  "bc_pms_floors",
  {
    id: serial("id").primaryKey(),
    hotelProfileId: integer("hotel_profile_id").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").default(0),
    ...nullableTimestamps,
  },
  (table) => [index("idx_pms_floors_hotel").on(table.hotelProfileId)]
);

const bcPmsRooms = pgTable(
  "bc_pms_rooms",
  {
    id: serial("id").primaryKey(),
    hotelProfileId: integer("hotel_profile_id").notNull(),
    floorId: integer("floor_id"),
    roomNumber: text("room_number").notNull(),
    roomType: text("room_type").default("Standard"),
    bedType: text("bed_type").default("Queen"),
    capacity: integer("capacity").default(2),
    basePrice: numeric("base_price", { precision: 10, scale: 2 }).default("0"),
    seasonalPrice: numeric("seasonal_price", { precision: 10, scale: 2 }),
    currency: text("currency").default("USD"),
    amenities: jsonb("amenities").default([]),
    images: jsonb("images").default([]),
    description: text("description").default(""),
    status: text("status").default("available"),
    sizeSqm: integer("size_sqm"),
    posX: integer("pos_x").default(0),
    posY: integer("pos_y").default(0),
    gridW: integer("grid_w").default(1),
    gridH: integer("grid_h").default(1),
    wingSection: text("wing_section").default("Main Wing"),
    viewType: text("view_type").default("City View"),
    hasBalcony: boolean("has_balcony").default(false),
    isAccessible: boolean("is_accessible").default(false),
    ...nullableTimestamps,
  },
  (table) => [index("idx_pms_rooms_hotel").on(table.hotelProfileId)]
);

const bcPmsBookings = pgTable(
  "bc_pms_bookings",
  {
    id: serial("id").primaryKey(),
    ref: text("ref").notNull().unique(),
    hotelProfileId: integer("hotel_profile_id").notNull(),
    roomId: integer("room_id").notNull(),
    floorId: integer("floor_id"),
    guestName: text("guest_name").notNull(),
    guestEmail: text("guest_email").notNull(),
    guestPhone: text("guest_phone").default(""),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    numGuests: integer("num_guests").default(1),
    bookingStatus: text("booking_status").default("pending"),
    paymentStatus: text("payment_status").default("pending"),
    amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }).default("0"),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).default("0"),
    serviceFee: numeric("service_fee", { precision: 10, scale: 2 }).default("0"),
    hotelAmount: numeric("hotel_amount", { precision: 10, scale: 2 }).default("0"),
    remainingBalance: numeric("remaining_balance", { precision: 10, scale: 2 }).default("0"),
    specialRequests: text("special_requests").default(""),
    confirmationSent: boolean("confirmation_sent").default(false),
    notes: text("notes").default(""),
    source: text("source").default("direct"),
    accommodationName: text("accommodation_name").default(""),
    accommodationImage: text("accommodation_image").default(""),
    currency: text("currency").default("USD"),
    ticketStatus: text("ticket_status").default("valid"),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_pms_bookings_hotel").on(table.hotelProfileId),
    index("idx_pms_bookings_email").on(table.guestEmail),
  ]
);

const bcPmsBlocks = pgTable(
  "bc_pms_blocks",
  {
    id: serial("id").primaryKey(),
    hotelProfileId: integer("hotel_profile_id").notNull(),
    roomId: integer("room_id").notNull(),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    reason: text("reason").default("blocked"),
    notes: text("notes").default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_pms_blocks_room").on(table.roomId)]
);

const bcPmsHolds = pgTable(
  "bc_pms_holds",
  {
    id: serial("id").primaryKey(),
    hotelProfileId: integer("hotel_profile_id").notNull(),
    roomId: integer("room_id").notNull(),
    sessionId: text("session_id").notNull(),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_pms_holds_session").on(table.sessionId)]
);

const bcTicketValidations = pgTable(
  "bc_ticket_validations",
  {
    id: serial("id").primaryKey(),
    ticketNumber: text("ticket_number").notNull(),
    operatorType: text("operator_type").notNull(),
    serviceId: text("service_id").default(""),
    serviceName: text("service_name").default(""),
    actionPerformed: text("action_performed").notNull(),
    result: text("result").notNull(),
    rejectionReason: text("rejection_reason").default(""),
    validatedByEmail: text("validated_by_email").notNull(),
    validatedByName: text("validated_by_name").default(""),
    deviceInfo: text("device_info").default(""),
    guestName: text("guest_name").default(""),
    details: jsonb("details").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_ticket_validations_ref").on(table.ticketNumber),
    index("idx_ticket_validations_email").on(table.validatedByEmail),
  ]
);

const bcUploadedImages = pgTable(
  "bc_uploaded_images",
  {
    id: uuid("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    mimeType: text("mime_type").notNull(),
    imageData: bytea("image_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_uploaded_images_owner").on(table.ownerEmail)]
);

const bcRateLimits = pgTable(
  "bc_rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").default(0).notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idx_rate_limits_reset").on(table.resetAt)]
);

const bcAviationRecords = pgTable(
  "bc_aviation_records",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").default({}).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_aviation_records_kind").on(table.kind)]
);

// ── Attraction ticketing ─────────────────────────────────────────────────────
const bcTicketTypes = pgTable(
  "bc_ticket_types",
  {
    id: serial("id").primaryKey(),
    attractionId: integer("attraction_id").notNull(),
    ownerEmail: text("owner_email").notNull(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    category: text("category").default("adult").notNull(),
    visitorCategory: text("visitor_category").default("").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).default("0").notNull(),
    currency: text("currency").default("USD").notNull(),
    minAge: integer("min_age"),
    maxAge: integer("max_age"),
    admissions: integer("admissions").default(1).notNull(),
    capacityTotal: integer("capacity_total").default(0).notNull(),
    dailyCapacity: integer("daily_capacity").default(0).notNull(),
    minPerOrder: integer("min_per_order").default(1).notNull(),
    maxPerOrder: integer("max_per_order").default(10).notNull(),
    salesStart: date("sales_start"),
    salesEnd: date("sales_end"),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    requiresDate: boolean("requires_date").default(true).notNull(),
    slotRequired: boolean("slot_required").default(false).notNull(),
    refundPolicy: text("refund_policy").default("moderate").notNull(),
    refundWindowHours: integer("refund_window_hours").default(24).notNull(),
    cancellationFeePercent: numeric("cancellation_fee_percent", { precision: 5, scale: 2 }).default("0").notNull(),
    imageUrl: text("image_url").default("").notNull(),
    terms: text("terms").default("").notNull(),
    status: text("status").default("active").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_ticket_types_attraction").on(table.attractionId),
    index("idx_ticket_types_owner").on(table.ownerEmail),
  ]
);

const bcTicketSlots = pgTable(
  "bc_ticket_slots",
  {
    id: serial("id").primaryKey(),
    ticketTypeId: integer("ticket_type_id").notNull(),
    attractionId: integer("attraction_id").notNull(),
    label: text("label").notNull(),
    startTime: text("start_time").default("").notNull(),
    endTime: text("end_time").default("").notNull(),
    capacity: integer("capacity").default(0).notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_ticket_slots_type").on(table.ticketTypeId)]
);

const bcTicketCalendar = pgTable(
  "bc_ticket_calendar",
  {
    id: serial("id").primaryKey(),
    attractionId: integer("attraction_id").notNull(),
    ticketTypeId: integer("ticket_type_id").default(0).notNull(),
    visitDate: date("visit_date").notNull(),
    kind: text("kind").default("blackout").notNull(),
    closed: boolean("closed").default(false).notNull(),
    price: numeric("price", { precision: 12, scale: 2 }),
    capacity: integer("capacity"),
    note: text("note").default("").notNull(),
    createdBy: text("created_by").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_ticket_calendar_attraction").on(table.attractionId, table.visitDate)]
);

const bcTicketInventory = pgTable(
  "bc_ticket_inventory",
  {
    id: serial("id").primaryKey(),
    ticketTypeId: integer("ticket_type_id").notNull(),
    attractionId: integer("attraction_id").notNull(),
    visitDate: date("visit_date").notNull(),
    slotId: integer("slot_id").default(0).notNull(),
    capacity: integer("capacity").default(0).notNull(),
    sold: integer("sold").default(0).notNull(),
    reserved: integer("reserved").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_ticket_inventory_attraction").on(table.attractionId, table.visitDate)]
);

const bcTicketPromos = pgTable(
  "bc_ticket_promos",
  {
    id: serial("id").primaryKey(),
    attractionId: integer("attraction_id").notNull(),
    code: text("code").notNull(),
    description: text("description").default("").notNull(),
    percentOff: numeric("percent_off", { precision: 5, scale: 2 }).default("0").notNull(),
    amountOff: numeric("amount_off", { precision: 12, scale: 2 }).default("0").notNull(),
    maxRedemptions: integer("max_redemptions").default(0).notNull(),
    redeemed: integer("redeemed").default(0).notNull(),
    startsAt: date("starts_at"),
    endsAt: date("ends_at"),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_ticket_promos_attraction").on(table.attractionId)]
);

const bcTicketOrders = pgTable(
  "bc_ticket_orders",
  {
    id: serial("id").primaryKey(),
    bookingRef: text("booking_ref").notNull().unique(),
    attractionId: integer("attraction_id").notNull(),
    attractionName: text("attraction_name").default("").notNull(),
    ownerEmail: text("owner_email").default("").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").default("").notNull(),
    visitDate: date("visit_date").notNull(),
    slotId: integer("slot_id").default(0).notNull(),
    slotLabel: text("slot_label").default("").notNull(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).default("0").notNull(),
    discount: numeric("discount", { precision: 12, scale: 2 }).default("0").notNull(),
    promoCode: text("promo_code").default("").notNull(),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    serviceFee: numeric("service_fee", { precision: 12, scale: 2 }).default("0").notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).default("0").notNull(),
    currency: text("currency").default("USD").notNull(),
    status: text("status").default("pending_payment").notNull(),
    paymentStatus: text("payment_status").default("unpaid").notNull(),
    paymentMethod: text("payment_method").default("").notNull(),
    paymentRef: text("payment_ref").default("").notNull(),
    refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundRequestedAt: timestamp("refund_requested_at", { withTimezone: true }),
    admissionsTotal: integer("admissions_total").default(0).notNull(),
    quantityTotal: integer("quantity_total").default(0).notNull(),
    notes: text("notes").default("").notNull(),
    channel: text("channel").default("online").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    batchId: integer("batch_id").default(0).notNull(),
    cashierEmail: text("cashier_email").default("").notNull(),
    shiftId: integer("shift_id"),
    amountReceived: numeric("amount_received", { precision: 12, scale: 2 }).default("0").notNull(),
    changeGiven: numeric("change_given", { precision: 12, scale: 2 }).default("0").notNull(),
    receiptNo: text("receipt_no").default("").notNull(),
    idempotencyKey: text("idempotency_key").default("").notNull(),
    paymentVerified: boolean("payment_verified").default(true).notNull(),
    voidReason: text("void_reason").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ticket_orders_attraction").on(table.attractionId, table.visitDate),
    index("idx_ticket_orders_email").on(table.customerEmail),
    index("idx_ticket_orders_channel").on(table.attractionId, table.channel, table.createdAt),
  ]
);

const bcTicketOrderItems = pgTable(
  "bc_ticket_order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").notNull(),
    ticketTypeId: integer("ticket_type_id").notNull(),
    ticketTypeName: text("ticket_type_name").notNull(),
    slotId: integer("slot_id").default(0).notNull(),
    visitDate: date("visit_date").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull(),
    admissionsPerUnit: integer("admissions_per_unit").default(1).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_ticket_order_items_order").on(table.orderId)]
);

const bcAttractionTickets = pgTable(
  "bc_attraction_tickets",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id"),
    orderItemId: integer("order_item_id"),
    ticketTypeId: integer("ticket_type_id").notNull(),
    attractionId: integer("attraction_id").notNull(),
    bookingRef: text("booking_ref").notNull(),
    ticketNo: text("ticket_no").notNull().unique(),
    qrToken: text("qr_token").notNull(),
    holderName: text("holder_name").default("").notNull(),
    holderEmail: text("holder_email").default("").notNull(),
    ticketTypeName: text("ticket_type_name").default("").notNull(),
    visitDate: date("visit_date").notNull(),
    slotLabel: text("slot_label").default("").notNull(),
    admissionsTotal: integer("admissions_total").default(1).notNull(),
    admissionsUsed: integer("admissions_used").default(0).notNull(),
    status: text("status").default("valid").notNull(),
    batchId: integer("batch_id").default(0).notNull(),
    source: text("source").default("online").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).default("0").notNull(),
    currency: text("currency").default("USD").notNull(),
    printedCount: integer("printed_count").default(0).notNull(),
    lastPrintedAt: timestamp("last_printed_at", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_attraction_tickets_order").on(table.orderId),
    index("idx_attraction_tickets_email").on(table.holderEmail),
    index("idx_attraction_tickets_batch").on(table.batchId, table.status),
  ]
);

const bcTicketStaff = pgTable(
  "bc_ticket_staff",
  {
    id: serial("id").primaryKey(),
    attractionId: integer("attraction_id").notNull(),
    email: text("email").notNull(),
    name: text("name").default("").notNull(),
    role: text("role").default("scanner").notNull(),
    status: text("status").default("active").notNull(),
    invitedBy: text("invited_by").default("").notNull(),
    permissions: jsonb("permissions").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_ticket_staff_email").on(table.email)]
);

const bcTicketSettings = pgTable("bc_ticket_settings", {
  attractionId: integer("attraction_id").primaryKey(),
  currency: text("currency").default("USD").notNull(),
  taxPercent: numeric("tax_percent", { precision: 5, scale: 2 }).default("0").notNull(),
  serviceFeePercent: numeric("service_fee_percent", { precision: 5, scale: 2 }).default("5").notNull(),
  advanceBookingDays: integer("advance_booking_days").default(180).notNull(),
  minLeadHours: integer("min_lead_hours").default(0).notNull(),
  cancellationWindowHours: integer("cancellation_window_hours").default(24).notNull(),
  autoConfirm: boolean("auto_confirm").default(true).notNull(),
  salesPaused: boolean("sales_paused").default(false).notNull(),
  terms: text("terms").default("").notNull(),
  posEnabled: boolean("pos_enabled").default(true).notNull(),
  ticketLogoUrl: text("ticket_logo_url").default("").notNull(),
  ticketContact: text("ticket_contact").default("").notNull(),
  ticketTerms: text("ticket_terms").default("").notNull(),
  printLayout: text("print_layout").default("a4_4").notNull(),
  paperSize: text("paper_size").default("A4").notNull(),
  receiptHeader: text("receipt_header").default("").notNull(),
  receiptFooter: text("receipt_footer").default("").notNull(),
  ticketArtworkUrl: text("ticket_artwork_url").default("").notNull(),
  ticketArtworkFit: text("ticket_artwork_fit").default("cover").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Single row (id = 1): the platform artwork an administrator uploads once and
// that is printed on every ticket, above each client's own artwork space.
const bcTicketBranding = pgTable("bc_ticket_branding", {
  id: integer("id").primaryKey(),
  companyName: text("company_name").default("BookingCart").notNull(),
  companyTagline: text("company_tagline").default("Compare. Book. Instant.").notNull(),
  companyWebsite: text("company_website").default("www.bookingcart.online").notNull(),
  artworkUrl: text("artwork_url").default("").notNull(),
  artworkFit: text("artwork_fit").default("cover").notNull(),
  updatedBy: text("updated_by").default("").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const bcTicketAudit = pgTable(
  "bc_ticket_audit",
  {
    id: serial("id").primaryKey(),
    attractionId: integer("attraction_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").default("").notNull(),
    entityId: text("entity_id").default("").notNull(),
    details: jsonb("details").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_ticket_audit_attraction").on(table.attractionId)]
);

// ── Physical ticketing / point of sale ───────────────────────────────────────
const bcTicketBatches = pgTable(
  "bc_ticket_batches",
  {
    id: serial("id").primaryKey(),
    batchRef: text("batch_ref").notNull().unique(),
    attractionId: integer("attraction_id").notNull(),
    ownerEmail: text("owner_email").default("").notNull(),
    name: text("name").notNull(),
    ticketTypeId: integer("ticket_type_id").notNull(),
    ticketTypeName: text("ticket_type_name").default("").notNull(),
    slotId: integer("slot_id").default(0).notNull(),
    slotLabel: text("slot_label").default("").notNull(),
    visitDate: date("visit_date").notNull(),
    validTo: date("valid_to"),
    quantity: integer("quantity").default(0).notNull(),
    printedCount: integer("printed_count").default(0).notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).default("0").notNull(),
    currency: text("currency").default("USD").notNull(),
    admissions: integer("admissions").default(1).notNull(),
    template: text("template").default("standard").notNull(),
    status: text("status").default("open").notNull(),
    notes: text("notes").default("").notNull(),
    createdBy: text("created_by").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_ticket_batches_attraction").on(table.attractionId, table.visitDate)]
);

const bcTicketPrints = pgTable(
  "bc_ticket_prints",
  {
    id: serial("id").primaryKey(),
    attractionId: integer("attraction_id").notNull(),
    batchId: integer("batch_id").default(0).notNull(),
    ticketId: integer("ticket_id"),
    ticketNo: text("ticket_no").default("").notNull(),
    kind: text("kind").default("print").notNull(),
    layout: text("layout").default("a4_4").notNull(),
    copies: integer("copies").default(1).notNull(),
    actorEmail: text("actor_email").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_ticket_prints_batch").on(table.batchId, table.createdAt)]
);

const bcCashShifts = pgTable(
  "bc_cash_shifts",
  {
    id: serial("id").primaryKey(),
    attractionId: integer("attraction_id").notNull(),
    cashierEmail: text("cashier_email").notNull(),
    cashierName: text("cashier_name").default("").notNull(),
    currency: text("currency").default("USD").notNull(),
    openingCash: numeric("opening_cash", { precision: 12, scale: 2 }).default("0").notNull(),
    countedCash: numeric("counted_cash", { precision: 12, scale: 2 }).default("0").notNull(),
    expectedCash: numeric("expected_cash", { precision: 12, scale: 2 }).default("0").notNull(),
    cashSales: numeric("cash_sales", { precision: 12, scale: 2 }).default("0").notNull(),
    mobileSales: numeric("mobile_sales", { precision: 12, scale: 2 }).default("0").notNull(),
    cardSales: numeric("card_sales", { precision: 12, scale: 2 }).default("0").notNull(),
    otherSales: numeric("other_sales", { precision: 12, scale: 2 }).default("0").notNull(),
    refunds: numeric("refunds", { precision: 12, scale: 2 }).default("0").notNull(),
    payouts: numeric("payouts", { precision: 12, scale: 2 }).default("0").notNull(),
    difference: numeric("difference", { precision: 12, scale: 2 }).default("0").notNull(),
    status: text("status").default("open").notNull(),
    openNote: text("open_note").default("").notNull(),
    closeNote: text("close_note").default("").notNull(),
    closedBy: text("closed_by").default("").notNull(),
    reviewedBy: text("reviewed_by").default("").notNull(),
    reviewNote: text("review_note").default("").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [index("idx_cash_shifts_attraction").on(table.attractionId, table.openedAt)]
);

const bcCashMovements = pgTable(
  "bc_cash_movements",
  {
    id: serial("id").primaryKey(),
    shiftId: integer("shift_id").notNull(),
    attractionId: integer("attraction_id").notNull(),
    kind: text("kind").default("payout").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).default("0").notNull(),
    reason: text("reason").default("").notNull(),
    actorEmail: text("actor_email").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_cash_movements_shift").on(table.shiftId, table.createdAt)]
);

// ── Cinema ticketing ─────────────────────────────────────────────────────────
// A cinema is a bc_attraction_profiles row with category = 'Cinema'. Screens own
// the permanent seat identities; a showtime only records the state of those seats,
// so seat B5 can be sold for the 14:00 screening and again for the 19:00 one.
const bcCinemaSettings = pgTable("bc_cinema_settings", {
  attractionId: integer("attraction_id").primaryKey(),
  holdMinutes: integer("hold_minutes").default(10).notNull(),
  serviceFeePercent: numeric("service_fee_percent", { precision: 5, scale: 2 }).default("3").notNull(),
  taxPercent: numeric("tax_percent", { precision: 5, scale: 2 }).default("0").notNull(),
  refundWindowHours: integer("refund_window_hours").default(24).notNull(),
  cancellationFeePercent: numeric("cancellation_fee_percent", { precision: 5, scale: 2 }).default("0").notNull(),
  allowOnline: boolean("allow_online").default(true).notNull(),
  allowPayAtVenue: boolean("allow_pay_at_venue").default(true).notNull(),
  cleaningMinutes: integer("cleaning_minutes").default(15).notNull(),
  categoryPrices: jsonb("category_prices").default({}).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const bcCinemaScreens = pgTable(
  "bc_cinema_screens",
  {
    id: serial("id").primaryKey(),
    attractionId: integer("attraction_id").notNull(),
    ownerEmail: text("owner_email").default("").notNull(),
    name: text("name").notNull(),
    screenType: text("screen_type").default("standard").notNull(),
    rowCount: integer("row_count").default(8).notNull(),
    seatsPerRow: integer("seats_per_row").default(12).notNull(),
    features: jsonb("features").default({}).notNull(),
    accessibleSeats: integer("accessible_seats").default(0).notNull(),
    status: text("status").default("active").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_cinema_screens_attraction").on(table.attractionId)]
);

const bcCinemaSeats = pgTable(
  "bc_cinema_seats",
  {
    id: serial("id").primaryKey(),
    screenId: integer("screen_id").notNull(),
    attractionId: integer("attraction_id").notNull(),
    rowLabel: text("row_label").notNull(),
    seatNo: integer("seat_no").notNull(),
    seatKey: text("seat_key").notNull(),
    category: text("category").default("standard").notNull(),
    x: integer("x").default(0).notNull(),
    y: integer("y").default(0).notNull(),
    priceOverride: numeric("price_override", { precision: 12, scale: 2 }),
    status: text("status").default("available").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_cinema_seats_screen").on(table.screenId, table.status)]
);

const bcCinemaMovies = pgTable(
  "bc_cinema_movies",
  {
    id: serial("id").primaryKey(),
    ownerEmail: text("owner_email").default("").notNull(),
    attractionId: integer("attraction_id").default(0).notNull(),
    title: text("title").notNull(),
    posterUrl: text("poster_url").default("").notNull(),
    backdropUrl: text("backdrop_url").default("").notNull(),
    synopsis: text("synopsis").default("").notNull(),
    genre: text("genre").default("").notNull(),
    durationMin: integer("duration_min").default(0).notNull(),
    ageRating: text("age_rating").default("").notNull(),
    language: text("language").default("").notNull(),
    subtitles: text("subtitles").default("").notNull(),
    releaseDate: date("release_date"),
    director: text("director").default("").notNull(),
    castList: text("cast_list").default("").notNull(),
    format: text("format").default("2D").notNull(),
    trailerUrl: text("trailer_url").default("").notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_cinema_movies_owner").on(table.ownerEmail, table.status)]
);

const bcCinemaShowtimes = pgTable(
  "bc_cinema_showtimes",
  {
    id: serial("id").primaryKey(),
    attractionId: integer("attraction_id").notNull(),
    screenId: integer("screen_id").notNull(),
    movieId: integer("movie_id").notNull(),
    ownerEmail: text("owner_email").default("").notNull(),
    showDate: date("show_date").notNull(),
    startTime: text("start_time").default("").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    salesOpenAt: timestamp("sales_open_at", { withTimezone: true }),
    salesCloseAt: timestamp("sales_close_at", { withTimezone: true }),
    basePrice: numeric("base_price", { precision: 12, scale: 2 }).default("0").notNull(),
    currency: text("currency").default("USD").notNull(),
    status: text("status").default("scheduled").notNull(),
    notes: text("notes").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_cinema_showtimes_attraction").on(table.attractionId, table.startsAt),
    index("idx_cinema_showtimes_movie").on(table.movieId, table.startsAt),
  ]
);

const bcCinemaHolds = pgTable(
  "bc_cinema_holds",
  {
    id: serial("id").primaryKey(),
    holdRef: text("hold_ref").notNull().unique(),
    showtimeId: integer("showtime_id").notNull(),
    attractionId: integer("attraction_id").notNull(),
    customerEmail: text("customer_email").default("").notNull(),
    seatIds: jsonb("seat_ids").default([]).notNull(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).default("0").notNull(),
    currency: text("currency").default("USD").notNull(),
    status: text("status").default("active").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_cinema_holds_showtime").on(table.showtimeId, table.status)]
);

const bcCinemaSeatStates = pgTable(
  "bc_cinema_seat_states",
  {
    showtimeId: integer("showtime_id").notNull(),
    seatId: integer("seat_id").notNull(),
    attractionId: integer("attraction_id").notNull(),
    status: text("status").default("held").notNull(),
    holdId: integer("hold_id").default(0).notNull(),
    orderId: integer("order_id").default(0).notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).default("0").notNull(),
    currency: text("currency").default("USD").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_cinema_seat_states_hold").on(table.holdId)]
);

module.exports = {
  baAccount,
  baSession,
  baUser,
  baVerification,
  bcAdminAudit,
  bcCinemaHolds,
  bcCinemaMovies,
  bcCinemaScreens,
  bcCinemaSeatStates,
  bcCinemaSeats,
  bcCinemaSettings,
  bcCinemaShowtimes,
  bcAttractionEvents,
  bcAttractionProfiles,
  bcAttractionTickets,
  bcAviationRecords,
  bcBookings,
  bcCashMovements,
  bcCashShifts,
  bcEventBookings,
  bcEventOrganizerProfiles,
  bcEventProfiles,
  bcGuideBookings,
  bcGuideProfiles,
  bcGuideReviews,
  bcGuideWithdrawals,
  bcGuides,
  bcHotelProfiles,
  bcPmsBlocks,
  bcPmsBookings,
  bcPmsFloors,
  bcPmsHolds,
  bcPmsRooms,
  bcPriceAlerts,
  bcRateLimits,
  bcSearchCache,
  bcSupport,
  bcTicketAudit,
  bcTicketBatches,
  bcTicketBranding,
  bcTicketCalendar,
  bcTicketInventory,
  bcTicketOrderItems,
  bcTicketOrders,
  bcTicketPrints,
  bcTicketPromos,
  bcTicketSettings,
  bcTicketSlots,
  bcTicketStaff,
  bcTicketTypes,
  bcTicketValidations,
  bcUploadedImages,
  bcUsers,
};
