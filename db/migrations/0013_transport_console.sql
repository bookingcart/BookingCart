-- Migration 0013: Transport operator console
-- Adds the pieces the operator/admin dashboards and the counter need on top of
-- 0011: staff roles, an audit trail, counter sale records, refund bookkeeping and
-- per-operator settings. Every statement is idempotent so it is safe to re-run.

-- ── Operator settings (booking rules, fees, refund window) ───────────────────
ALTER TABLE "bc_transport_operators" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_transport_operators" ADD COLUMN IF NOT EXISTS "website" text DEFAULT '' NOT NULL;
--> statement-breakpoint

-- ── Staff and permissions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_transport_staff" (
  "id" serial PRIMARY KEY NOT NULL,
  "operator_id" integer NOT NULL,
  "email" text NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "role" text DEFAULT 'agent' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_transport_staff_email" ON "bc_transport_staff" ("operator_id", "email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_staff_lookup" ON "bc_transport_staff" ("email", "status");
--> statement-breakpoint

-- ── Audit trail for administrative changes, refunds and counter sales ────────
CREATE TABLE IF NOT EXISTS "bc_transport_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "operator_id" integer DEFAULT 0 NOT NULL,
  "actor_email" text DEFAULT '' NOT NULL,
  "actor_role" text DEFAULT '' NOT NULL,
  "action" text NOT NULL,
  "entity" text DEFAULT '' NOT NULL,
  "entity_id" text DEFAULT '' NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_audit_operator" ON "bc_transport_audit" ("operator_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_audit_entity" ON "bc_transport_audit" ("entity", "entity_id");
--> statement-breakpoint

-- ── Counter (POS) sale records ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_transport_pos_sales" (
  "id" serial PRIMARY KEY NOT NULL,
  "operator_id" integer NOT NULL,
  "departure_id" integer NOT NULL,
  "booking_id" integer,
  "staff_email" text DEFAULT '' NOT NULL,
  "staff_name" text DEFAULT '' NOT NULL,
  "payment_method" text DEFAULT 'cash' NOT NULL,
  "payment_ref" text DEFAULT '' NOT NULL,
  "amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'UGX' NOT NULL,
  "ticket_refs" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_pos_operator" ON "bc_transport_pos_sales" ("operator_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_pos_departure" ON "bc_transport_pos_sales" ("departure_id");
--> statement-breakpoint

-- ── Refund / cancellation bookkeeping on the booking ─────────────────────────
ALTER TABLE "bc_transport_bookings" ADD COLUMN IF NOT EXISTS "refund_amount" numeric(12, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_transport_bookings" ADD COLUMN IF NOT EXISTS "refund_status" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_transport_bookings" ADD COLUMN IF NOT EXISTS "cancel_reason" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_transport_bookings" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "bc_transport_bookings" ADD COLUMN IF NOT EXISTS "sold_by_email" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_bookings_customer" ON "bc_transport_bookings" ("customer_email", "travel_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_bookings_operator" ON "bc_transport_bookings" ("operator_id", "created_at");
--> statement-breakpoint

-- ── Who admitted a passenger, next to the existing admitted_at stamp ─────────
ALTER TABLE "bc_transport_passengers" ADD COLUMN IF NOT EXISTS "admitted_by" text DEFAULT '' NOT NULL;
--> statement-breakpoint

-- ── Departure sale window and internal notes ─────────────────────────────────
ALTER TABLE "bc_transport_departures" ADD COLUMN IF NOT EXISTS "sales_close_minutes" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_transport_departures" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
--> statement-breakpoint
