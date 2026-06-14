"use strict";

const {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} = require("drizzle-orm/pg-core");

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

module.exports = {
  baAccount,
  baSession,
  baUser,
  baVerification,
  bcAdminAudit,
  bcBookings,
  bcPriceAlerts,
  bcSearchCache,
  bcSupport,
  bcUsers,
};
