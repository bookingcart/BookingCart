-- Migration 0010: Cinema Ticketing, Seat Selection & Cinema Management
-- Cinemas are ordinary attraction listings (bc_attraction_profiles.category = 'Cinema'),
-- so ownership, staff roles, currency and the dashboard keep working unchanged.
-- Screens own the permanent seat identities; a showtime owns only the *state* of
-- those seats, which is what lets seat B5 sell for 14:00 and again for 19:00.
-- Every statement is idempotent so it is safe to re-run.

-- ── Per-cinema settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_cinema_settings" (
  "attraction_id" integer PRIMARY KEY NOT NULL,
  "hold_minutes" integer DEFAULT 10 NOT NULL,
  "service_fee_percent" numeric(5, 2) DEFAULT '3' NOT NULL,
  "tax_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
  "refund_window_hours" integer DEFAULT 24 NOT NULL,
  "cancellation_fee_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
  "allow_online" boolean DEFAULT true NOT NULL,
  "allow_pay_at_venue" boolean DEFAULT true NOT NULL,
  "cleaning_minutes" integer DEFAULT 15 NOT NULL,
  "category_prices" jsonb DEFAULT '{}' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint

-- ── Screens / halls ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_cinema_screens" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "owner_email" text DEFAULT '' NOT NULL,
  "name" text NOT NULL,
  "screen_type" text DEFAULT 'standard' NOT NULL,
  "row_count" integer DEFAULT 8 NOT NULL,
  "seats_per_row" integer DEFAULT 12 NOT NULL,
  "features" jsonb DEFAULT '{}' NOT NULL,
  "accessible_seats" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_screens_attraction" ON "bc_cinema_screens" ("attraction_id");
--> statement-breakpoint

-- ── Permanent seat identity (one row per physical seat) ──────────────────────
CREATE TABLE IF NOT EXISTS "bc_cinema_seats" (
  "id" serial PRIMARY KEY NOT NULL,
  "screen_id" integer NOT NULL,
  "attraction_id" integer NOT NULL,
  "row_label" text NOT NULL,
  "seat_no" integer NOT NULL,
  "seat_key" text NOT NULL,
  "category" text DEFAULT 'standard' NOT NULL,
  "x" integer DEFAULT 0 NOT NULL,
  "y" integer DEFAULT 0 NOT NULL,
  "price_override" numeric(12, 2),
  "status" text DEFAULT 'available' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_cinema_seat_position" ON "bc_cinema_seats" ("screen_id", "row_label", "seat_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_seats_screen" ON "bc_cinema_seats" ("screen_id", "status");
--> statement-breakpoint

-- ── Movies (owned by the cinema business, schedulable in any branch) ─────────
CREATE TABLE IF NOT EXISTS "bc_cinema_movies" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_email" text DEFAULT '' NOT NULL,
  "attraction_id" integer DEFAULT 0 NOT NULL,
  "title" text NOT NULL,
  "poster_url" text DEFAULT '' NOT NULL,
  "backdrop_url" text DEFAULT '' NOT NULL,
  "synopsis" text DEFAULT '' NOT NULL,
  "genre" text DEFAULT '' NOT NULL,
  "duration_min" integer DEFAULT 0 NOT NULL,
  "age_rating" text DEFAULT '' NOT NULL,
  "language" text DEFAULT '' NOT NULL,
  "subtitles" text DEFAULT '' NOT NULL,
  "release_date" date,
  "director" text DEFAULT '' NOT NULL,
  "cast_list" text DEFAULT '' NOT NULL,
  "format" text DEFAULT '2D' NOT NULL,
  "trailer_url" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_movies_owner" ON "bc_cinema_movies" ("owner_email", "status");
--> statement-breakpoint

-- ── Showtimes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_cinema_showtimes" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "screen_id" integer NOT NULL,
  "movie_id" integer NOT NULL,
  "owner_email" text DEFAULT '' NOT NULL,
  "show_date" date NOT NULL,
  "start_time" text DEFAULT '' NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "sales_open_at" timestamp with time zone,
  "sales_close_at" timestamp with time zone,
  "base_price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_cinema_showtime_slot" ON "bc_cinema_showtimes" ("screen_id", "starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_showtimes_attraction" ON "bc_cinema_showtimes" ("attraction_id", "starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_showtimes_movie" ON "bc_cinema_showtimes" ("movie_id", "starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_showtimes_date" ON "bc_cinema_showtimes" ("show_date", "start_time");
--> statement-breakpoint

-- ── Temporary seat holds ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_cinema_holds" (
  "id" serial PRIMARY KEY NOT NULL,
  "hold_ref" text NOT NULL UNIQUE,
  "showtime_id" integer NOT NULL,
  "attraction_id" integer NOT NULL,
  "customer_email" text DEFAULT '' NOT NULL,
  "seat_ids" jsonb DEFAULT '[]' NOT NULL,
  "subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_holds_showtime" ON "bc_cinema_holds" ("showtime_id", "status");
--> statement-breakpoint

-- ── Per-showtime seat state (sold / held / blocked) ──────────────────────────
-- The primary key is what makes double-booking impossible: a second claim for the
-- same (showtime, seat) pair conflicts and is rejected inside the transaction.
CREATE TABLE IF NOT EXISTS "bc_cinema_seat_states" (
  "showtime_id" integer NOT NULL,
  "seat_id" integer NOT NULL,
  "attraction_id" integer NOT NULL,
  "status" text DEFAULT 'held' NOT NULL,
  "hold_id" integer DEFAULT 0 NOT NULL,
  "order_id" integer DEFAULT 0 NOT NULL,
  "price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "expires_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  PRIMARY KEY ("showtime_id", "seat_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_seat_states_order" ON "bc_cinema_seat_states" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_seat_states_hold" ON "bc_cinema_seat_states" ("hold_id");
--> statement-breakpoint

-- ── Cinema columns on the shared order / ticket entities ─────────────────────
-- Orders stay in bc_ticket_orders and tickets stay in bc_attraction_tickets so the
-- existing confirmation emails, QR validation desk, printing and reports keep
-- working without a second implementation.
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "cinema_showtime_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "cinema_screen_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "cinema_movie_title" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "seat_labels" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_orders" ADD COLUMN IF NOT EXISTS "cinema_hold_ref" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "cinema_showtime_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "cinema_seat_id" integer;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "seat_label" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "seat_category" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "screen_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_attraction_tickets" ADD COLUMN IF NOT EXISTS "movie_title" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attraction_tickets_showtime" ON "bc_attraction_tickets" ("cinema_showtime_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_orders_showtime" ON "bc_ticket_orders" ("cinema_showtime_id");
