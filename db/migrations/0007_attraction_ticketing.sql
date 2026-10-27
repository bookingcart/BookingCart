-- Migration 0007: Attraction Ticketing Management System
-- Ticket types, time slots, date calendar, atomic inventory counters, orders,
-- individual admission entitlements (QR), staff permissions and audit trail.
-- Every statement is idempotent so it is safe to re-run.

-- ── Ticket types ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_ticket_types" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "owner_email" text NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "category" text DEFAULT 'adult' NOT NULL,
  "visitor_category" text DEFAULT '' NOT NULL,
  "price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "min_age" integer,
  "max_age" integer,
  "admissions" integer DEFAULT 1 NOT NULL,
  "capacity_total" integer DEFAULT 0 NOT NULL,
  "daily_capacity" integer DEFAULT 0 NOT NULL,
  "min_per_order" integer DEFAULT 1 NOT NULL,
  "max_per_order" integer DEFAULT 10 NOT NULL,
  "sales_start" date,
  "sales_end" date,
  "valid_from" date,
  "valid_to" date,
  "requires_date" boolean DEFAULT true NOT NULL,
  "slot_required" boolean DEFAULT false NOT NULL,
  "refund_policy" text DEFAULT 'moderate' NOT NULL,
  "refund_window_hours" integer DEFAULT 24 NOT NULL,
  "cancellation_fee_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
  "image_url" text DEFAULT '' NOT NULL,
  "terms" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_types_attraction" ON "bc_ticket_types" ("attraction_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_types_owner" ON "bc_ticket_types" ("owner_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_types_status" ON "bc_ticket_types" ("status");
--> statement-breakpoint

-- ── Entry time slots (per ticket type) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_ticket_slots" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_type_id" integer NOT NULL,
  "attraction_id" integer NOT NULL,
  "label" text NOT NULL,
  "start_time" text DEFAULT '' NOT NULL,
  "end_time" text DEFAULT '' NOT NULL,
  "capacity" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_slots_type" ON "bc_ticket_slots" ("ticket_type_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_slots_attraction" ON "bc_ticket_slots" ("attraction_id");
--> statement-breakpoint

-- ── Calendar overrides: blackout days, special prices, capacity overrides ────
CREATE TABLE IF NOT EXISTS "bc_ticket_calendar" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "ticket_type_id" integer DEFAULT 0 NOT NULL,
  "visit_date" date NOT NULL,
  "kind" text DEFAULT 'blackout' NOT NULL,
  "closed" boolean DEFAULT false NOT NULL,
  "price" numeric(12, 2),
  "capacity" integer,
  "note" text DEFAULT '' NOT NULL,
  "created_by" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ticket_calendar_unique"
  ON "bc_ticket_calendar" ("attraction_id", "ticket_type_id", "visit_date", "kind");
--> statement-breakpoint

-- ── Inventory counters (day total when slot_id = 0, plus per slot rows) ──────
CREATE TABLE IF NOT EXISTS "bc_ticket_inventory" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_type_id" integer NOT NULL,
  "attraction_id" integer NOT NULL,
  "visit_date" date NOT NULL,
  "slot_id" integer DEFAULT 0 NOT NULL,
  "capacity" integer DEFAULT 0 NOT NULL,
  "sold" integer DEFAULT 0 NOT NULL,
  "reserved" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ticket_inventory_unique"
  ON "bc_ticket_inventory" ("ticket_type_id", "visit_date", "slot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_inventory_attraction" ON "bc_ticket_inventory" ("attraction_id", "visit_date");
--> statement-breakpoint

-- ── Promotional codes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_ticket_promos" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "code" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "percent_off" numeric(5, 2) DEFAULT '0' NOT NULL,
  "amount_off" numeric(12, 2) DEFAULT '0' NOT NULL,
  "max_redemptions" integer DEFAULT 0 NOT NULL,
  "redeemed" integer DEFAULT 0 NOT NULL,
  "starts_at" date,
  "ends_at" date,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ticket_promos_unique" ON "bc_ticket_promos" ("attraction_id", "code");
--> statement-breakpoint

-- ── Orders (booking header) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_ticket_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_ref" text NOT NULL UNIQUE,
  "attraction_id" integer NOT NULL,
  "attraction_name" text DEFAULT '' NOT NULL,
  "owner_email" text DEFAULT '' NOT NULL,
  "customer_name" text NOT NULL,
  "customer_email" text NOT NULL,
  "customer_phone" text DEFAULT '' NOT NULL,
  "visit_date" date NOT NULL,
  "slot_id" integer DEFAULT 0 NOT NULL,
  "slot_label" text DEFAULT '' NOT NULL,
  "subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
  "discount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "promo_code" text DEFAULT '' NOT NULL,
  "tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "service_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
  "total" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "status" text DEFAULT 'pending_payment' NOT NULL,
  "payment_status" text DEFAULT 'unpaid' NOT NULL,
  "payment_method" text DEFAULT '' NOT NULL,
  "payment_ref" text DEFAULT '' NOT NULL,
  "refund_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "refunded_at" timestamp with time zone,
  "refund_requested_at" timestamp with time zone,
  "admissions_total" integer DEFAULT 0 NOT NULL,
  "quantity_total" integer DEFAULT 0 NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "channel" text DEFAULT 'online' NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_orders_attraction" ON "bc_ticket_orders" ("attraction_id", "visit_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_orders_email" ON "bc_ticket_orders" ("customer_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_orders_status" ON "bc_ticket_orders" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_orders_pending" ON "bc_ticket_orders" ("status", "expires_at");
--> statement-breakpoint

-- ── Order line items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_ticket_order_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL,
  "ticket_type_id" integer NOT NULL,
  "ticket_type_name" text NOT NULL,
  "slot_id" integer DEFAULT 0 NOT NULL,
  "visit_date" date NOT NULL,
  "unit_price" numeric(12, 2) NOT NULL,
  "quantity" integer NOT NULL,
  "admissions_per_unit" integer DEFAULT 1 NOT NULL,
  "line_total" numeric(12, 2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_order_items_order" ON "bc_ticket_order_items" ("order_id");
--> statement-breakpoint

-- ── Individual admission entitlements / digital tickets ──────────────────────
CREATE TABLE IF NOT EXISTS "bc_attraction_tickets" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL,
  "order_item_id" integer NOT NULL,
  "ticket_type_id" integer NOT NULL,
  "attraction_id" integer NOT NULL,
  "booking_ref" text NOT NULL,
  "ticket_no" text NOT NULL UNIQUE,
  "qr_token" text NOT NULL,
  "holder_name" text DEFAULT '' NOT NULL,
  "holder_email" text DEFAULT '' NOT NULL,
  "ticket_type_name" text DEFAULT '' NOT NULL,
  "visit_date" date NOT NULL,
  "slot_label" text DEFAULT '' NOT NULL,
  "admissions_total" integer DEFAULT 1 NOT NULL,
  "admissions_used" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'valid' NOT NULL,
  "issued_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attraction_tickets_order" ON "bc_attraction_tickets" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attraction_tickets_attraction" ON "bc_attraction_tickets" ("attraction_id", "visit_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attraction_tickets_email" ON "bc_attraction_tickets" ("holder_email");
--> statement-breakpoint

-- ── Staff permissions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_ticket_staff" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "email" text NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "role" text DEFAULT 'scanner' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "invited_by" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ticket_staff_unique" ON "bc_ticket_staff" ("attraction_id", "email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_staff_email" ON "bc_ticket_staff" ("email");
--> statement-breakpoint

-- ── Per-attraction ticketing settings ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_ticket_settings" (
  "attraction_id" integer PRIMARY KEY NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "tax_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
  "service_fee_percent" numeric(5, 2) DEFAULT '5' NOT NULL,
  "advance_booking_days" integer DEFAULT 180 NOT NULL,
  "min_lead_hours" integer DEFAULT 0 NOT NULL,
  "cancellation_window_hours" integer DEFAULT 24 NOT NULL,
  "auto_confirm" boolean DEFAULT true NOT NULL,
  "sales_paused" boolean DEFAULT false NOT NULL,
  "terms" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint

-- ── Ticketing audit trail ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_ticket_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "actor_email" text NOT NULL,
  "action" text NOT NULL,
  "entity_type" text DEFAULT '' NOT NULL,
  "entity_id" text DEFAULT '' NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_audit_attraction" ON "bc_ticket_audit" ("attraction_id", "created_at");
