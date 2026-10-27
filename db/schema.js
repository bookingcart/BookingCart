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

module.exports = {
  baAccount,
  baSession,
  baUser,
  baVerification,
  bcAdminAudit,
  bcAttractionEvents,
  bcAttractionProfiles,
  bcAviationRecords,
  bcBookings,
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
  bcTicketValidations,
  bcUploadedImages,
  bcUsers,
};
