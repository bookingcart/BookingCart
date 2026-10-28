-- Migration 0008: Physical ticketing, point of sale, printing and cash shifts
--
-- Physical tickets live in bc_attraction_tickets so online and on-site sales
-- share one ticket-number space and one validation engine. A physical ticket is
-- created in status 'available' (printed but not sold), moves to 'valid' when a
-- POS sale claims it, and never touches bc_ticket_inventory until it is sold.
-- Every statement is idempotent so it is safe to re-run.

-- ── Orders become the sales ledger for both channels ─────────────────────────
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "batch_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "cashier_email" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "shift_id" integer;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "amount_received" numeric(12, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "change_given" numeric(12, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "receipt_no" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "idempotency_key" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "payment_verified" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "void_reason" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ticket_orders_idempotency"
  ON "bc_ticket_orders" ("attraction_id", "idempotency_key") WHERE "idempotency_key" <> '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_orders_channel" ON "bc_ticket_orders" ("attraction_id", "channel", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_orders_shift" ON "bc_ticket_orders" ("shift_id");
--> statement-breakpoint

-- ── Tickets can exist before a sale (printed batch stock) ────────────────────
ALTER TABLE "bc_attraction_tickets" ALTER COLUMN "order_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ALTER COLUMN "order_item_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "batch_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'online' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "unit_price" numeric(12, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'USD' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "printed_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "last_printed_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attraction_tickets_batch" ON "bc_attraction_tickets" ("batch_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attraction_tickets_status" ON "bc_attraction_tickets" ("attraction_id", "status");
--> statement-breakpoint

-- ── Ticket batches ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_ticket_batches" (
  "id" serial PRIMARY KEY NOT NULL,
  "batch_ref" text NOT NULL UNIQUE,
  "attraction_id" integer NOT NULL,
  "owner_email" text DEFAULT '' NOT NULL,
  "name" text NOT NULL,
  "ticket_type_id" integer NOT NULL,
  "ticket_type_name" text DEFAULT '' NOT NULL,
  "slot_id" integer DEFAULT 0 NOT NULL,
  "slot_label" text DEFAULT '' NOT NULL,
  "visit_date" date NOT NULL,
  "valid_to" date,
  "quantity" integer DEFAULT 0 NOT NULL,
  "printed_count" integer DEFAULT 0 NOT NULL,
  "unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "admissions" integer DEFAULT 1 NOT NULL,
  "template" text DEFAULT 'standard' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "created_by" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_batches_attraction" ON "bc_ticket_batches" ("attraction_id", "visit_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_batches_status" ON "bc_ticket_batches" ("attraction_id", "status");
--> statement-breakpoint

-- ── Print / reprint history (never creates admissions) ───────────────────────
CREATE TABLE IF NOT EXISTS "bc_ticket_prints" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "batch_id" integer DEFAULT 0 NOT NULL,
  "ticket_id" integer,
  "ticket_no" text DEFAULT '' NOT NULL,
  "kind" text DEFAULT 'print' NOT NULL,
  "layout" text DEFAULT 'a4_4' NOT NULL,
  "copies" integer DEFAULT 1 NOT NULL,
  "actor_email" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_prints_batch" ON "bc_ticket_prints" ("batch_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_prints_ticket" ON "bc_ticket_prints" ("ticket_no");
--> statement-breakpoint

-- ── Cashier shifts and cash movements ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_cash_shifts" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "cashier_email" text NOT NULL,
  "cashier_name" text DEFAULT '' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "opening_cash" numeric(12, 2) DEFAULT '0' NOT NULL,
  "counted_cash" numeric(12, 2) DEFAULT '0' NOT NULL,
  "expected_cash" numeric(12, 2) DEFAULT '0' NOT NULL,
  "cash_sales" numeric(12, 2) DEFAULT '0' NOT NULL,
  "mobile_sales" numeric(12, 2) DEFAULT '0' NOT NULL,
  "card_sales" numeric(12, 2) DEFAULT '0' NOT NULL,
  "other_sales" numeric(12, 2) DEFAULT '0' NOT NULL,
  "refunds" numeric(12, 2) DEFAULT '0' NOT NULL,
  "payouts" numeric(12, 2) DEFAULT '0' NOT NULL,
  "difference" numeric(12, 2) DEFAULT '0' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "open_note" text DEFAULT '' NOT NULL,
  "close_note" text DEFAULT '' NOT NULL,
  "closed_by" text DEFAULT '' NOT NULL,
  "reviewed_by" text DEFAULT '' NOT NULL,
  "review_note" text DEFAULT '' NOT NULL,
  "opened_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_cash_shifts_open"
  ON "bc_cash_shifts" ("attraction_id", "cashier_email") WHERE "status" = 'open';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_shifts_attraction" ON "bc_cash_shifts" ("attraction_id", "opened_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bc_cash_movements" (
  "id" serial PRIMARY KEY NOT NULL,
  "shift_id" integer NOT NULL,
  "attraction_id" integer NOT NULL,
  "kind" text DEFAULT 'payout' NOT NULL,
  "amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "actor_email" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_movements_shift" ON "bc_cash_movements" ("shift_id", "created_at");
--> statement-breakpoint

-- ── Staff permissions + ticket-office settings ───────────────────────────────
ALTER TABLE "bc_ticket_staff" ADD COLUMN IF NOT EXISTS "permissions" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_settings" ADD COLUMN IF NOT EXISTS "pos_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_settings" ADD COLUMN IF NOT EXISTS "ticket_logo_url" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_settings" ADD COLUMN IF NOT EXISTS "ticket_contact" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_settings" ADD COLUMN IF NOT EXISTS "ticket_terms" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_settings" ADD COLUMN IF NOT EXISTS "print_layout" text DEFAULT 'a4_4' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_settings" ADD COLUMN IF NOT EXISTS "paper_size" text DEFAULT 'A4' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_settings" ADD COLUMN IF NOT EXISTS "receipt_header" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_settings" ADD COLUMN IF NOT EXISTS "receipt_footer" text DEFAULT '' NOT NULL;
