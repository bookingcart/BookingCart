-- Migration 0011: Transport booking (bus, boat/ferry, train)
-- An operator owns routes; a route owns ordered stops; a vehicle owns the permanent
-- seat identity. A departure owns only the *state* of those seats, scoped to the
-- booked segment, so seat 5A can sell twice on a long train run when the journeys
-- do not overlap. Every statement is idempotent so it is safe to re-run.

-- ── Operators ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_transport_operators" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_email" text DEFAULT '' NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "transport_types" jsonb DEFAULT '[]' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "logo_url" text DEFAULT '' NOT NULL,
  "contact" jsonb DEFAULT '{}' NOT NULL,
  "policies" jsonb DEFAULT '{}' NOT NULL,
  "commission_percent" numeric(5, 2) DEFAULT '10' NOT NULL,
  "hold_minutes" integer DEFAULT 15 NOT NULL,
  "allow_online" boolean DEFAULT true NOT NULL,
  "allow_pay_at_counter" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_transport_operator_slug" ON "bc_transport_operators" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_operators_status" ON "bc_transport_operators" ("status");
--> statement-breakpoint

-- ── Locations: terminals, ports, railway stations ────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_transport_locations" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "kind" text DEFAULT 'terminal' NOT NULL,
  "city" text DEFAULT '' NOT NULL,
  "country" text DEFAULT '' NOT NULL,
  "code" text DEFAULT '' NOT NULL,
  "latitude" numeric(10, 6),
  "longitude" numeric(10, 6),
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_locations_kind" ON "bc_transport_locations" ("kind", "city");
--> statement-breakpoint

-- ── Routes and their ordered stops ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_transport_routes" (
  "id" serial PRIMARY KEY NOT NULL,
  "operator_id" integer NOT NULL,
  "transport_type" text NOT NULL,
  "name" text NOT NULL,
  "code" text DEFAULT '' NOT NULL,
  "origin_id" integer NOT NULL,
  "destination_id" integer NOT NULL,
  "duration_minutes" integer DEFAULT 0 NOT NULL,
  "distance_km" numeric(10, 2),
  "base_price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'UGX' NOT NULL,
  "classes" jsonb DEFAULT '[]' NOT NULL,
  "amenities" jsonb DEFAULT '[]' NOT NULL,
  "luggage_allowance" text DEFAULT '' NOT NULL,
  "cancellation_policy" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_routes_public" ON "bc_transport_routes" ("transport_type", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bc_transport_route_stops" (
  "id" serial PRIMARY KEY NOT NULL,
  "route_id" integer NOT NULL,
  "location_id" integer NOT NULL,
  "stop_order" integer NOT NULL,
  "minutes_from_origin" integer DEFAULT 0 NOT NULL,
  "kind" text DEFAULT 'stop' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_transport_route_stop" ON "bc_transport_route_stops" ("route_id", "stop_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_route_stop_location" ON "bc_transport_route_stops" ("route_id", "location_id");
--> statement-breakpoint

-- ── Vehicles, vessels and trains (with their permanent seat layout) ──────────
CREATE TABLE IF NOT EXISTS "bc_transport_vehicles" (
  "id" serial PRIMARY KEY NOT NULL,
  "operator_id" integer NOT NULL,
  "transport_type" text NOT NULL,
  "name" text NOT NULL,
  "registration" text DEFAULT '' NOT NULL,
  "capacity" integer DEFAULT 0 NOT NULL,
  "seating" text DEFAULT 'assigned' NOT NULL,
  "seat_class" text DEFAULT 'standard' NOT NULL,
  "layout" jsonb DEFAULT '{}' NOT NULL,
  "features" jsonb DEFAULT '{}' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_vehicles_operator" ON "bc_transport_vehicles" ("operator_id", "transport_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bc_transport_seats" (
  "id" serial PRIMARY KEY NOT NULL,
  "vehicle_id" integer NOT NULL,
  "carriage" text DEFAULT '' NOT NULL,
  "row_label" text DEFAULT '' NOT NULL,
  "seat_no" integer NOT NULL,
  "seat_key" text NOT NULL,
  "category" text DEFAULT 'standard' NOT NULL,
  "kind" text DEFAULT 'seat' NOT NULL,
  "x" integer DEFAULT 0 NOT NULL,
  "y" integer DEFAULT 0 NOT NULL,
  "price_override" numeric(12, 2),
  "status" text DEFAULT 'available' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_transport_seat_position" ON "bc_transport_seats" ("vehicle_id", "carriage", "seat_key");
--> statement-breakpoint

-- ── Departures (one per vehicle per date per route) ──────────────────────────
CREATE TABLE IF NOT EXISTS "bc_transport_departures" (
  "id" serial PRIMARY KEY NOT NULL,
  "operator_id" integer NOT NULL,
  "route_id" integer NOT NULL,
  "vehicle_id" integer NOT NULL,
  "travel_date" date NOT NULL,
  "depart_time" text NOT NULL,
  "arrive_time" text NOT NULL,
  "boarding_cutoff_minutes" integer DEFAULT 15 NOT NULL,
  "seats_total" integer DEFAULT 0 NOT NULL,
  "base_price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'UGX' NOT NULL,
  "classes" jsonb DEFAULT '[]' NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_departures_lookup" ON "bc_transport_departures" ("route_id", "travel_date", "status");
--> statement-breakpoint

-- ── Holds (the checkout window) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_transport_holds" (
  "id" serial PRIMARY KEY NOT NULL,
  "hold_ref" text NOT NULL,
  "departure_id" integer NOT NULL,
  "operator_id" integer NOT NULL,
  "customer_email" text DEFAULT '' NOT NULL,
  "seat_ids" jsonb DEFAULT '[]' NOT NULL,
  "from_stop" integer DEFAULT 1 NOT NULL,
  "to_stop" integer DEFAULT 99 NOT NULL,
  "subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'UGX' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_transport_hold_ref" ON "bc_transport_holds" ("hold_ref");
--> statement-breakpoint

-- ── Bookings, passengers and tickets ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_transport_bookings" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_ref" text NOT NULL,
  "operator_id" integer NOT NULL,
  "departure_id" integer NOT NULL,
  "route_id" integer NOT NULL,
  "customer_email" text DEFAULT '' NOT NULL,
  "customer_name" text DEFAULT '' NOT NULL,
  "customer_phone" text DEFAULT '' NOT NULL,
  "passenger_count" integer DEFAULT 1 NOT NULL,
  "from_stop" integer DEFAULT 1 NOT NULL,
  "to_stop" integer DEFAULT 99 NOT NULL,
  "boarding_point" text DEFAULT '' NOT NULL,
  "dropoff_point" text DEFAULT '' NOT NULL,
  "travel_date" date NOT NULL,
  "depart_time" text DEFAULT '' NOT NULL,
  "seat_labels" text DEFAULT '' NOT NULL,
  "fare_class" text DEFAULT 'standard' NOT NULL,
  "seating" text DEFAULT 'assigned' NOT NULL,
  "subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
  "service_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
  "tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "total" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'UGX' NOT NULL,
  "payment_method" text DEFAULT 'counter' NOT NULL,
  "payment_status" text DEFAULT 'unpaid' NOT NULL,
  "status" text DEFAULT 'pending_payment' NOT NULL,
  "channel" text DEFAULT 'online' NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_transport_booking_ref" ON "bc_transport_bookings" ("booking_ref");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_bookings_departure" ON "bc_transport_bookings" ("departure_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bc_transport_passengers" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_id" integer NOT NULL,
  "departure_id" integer NOT NULL,
  "passenger_name" text DEFAULT '' NOT NULL,
  "seat_label" text DEFAULT '' NOT NULL,
  "fare_class" text DEFAULT 'standard' NOT NULL,
  "fare" numeric(12, 2) DEFAULT '0' NOT NULL,
  "ticket_no" text NOT NULL,
  "qr_token" text NOT NULL,
  "status" text DEFAULT 'valid' NOT NULL,
  "admitted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_transport_ticket_no" ON "bc_transport_passengers" ("ticket_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_passengers_booking" ON "bc_transport_passengers" ("booking_id");
--> statement-breakpoint

-- ── Departure-scoped seat state (segment aware) ──────────────────────────────
-- No unique key on (departure_id, seat_id): a long train run legitimately sells the
-- same berth twice for non-overlapping segments. Conflicts are rejected inside the
-- booking transaction by an interval-overlap test instead.
CREATE TABLE IF NOT EXISTS "bc_transport_seat_states" (
  "id" serial PRIMARY KEY NOT NULL,
  "departure_id" integer NOT NULL,
  "seat_id" integer NOT NULL,
  "operator_id" integer NOT NULL,
  "status" text DEFAULT 'held' NOT NULL,
  "booking_id" integer,
  "hold_id" integer,
  "from_stop" integer DEFAULT 1 NOT NULL,
  "to_stop" integer DEFAULT 99 NOT NULL,
  "price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'UGX' NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_seat_states_lookup" ON "bc_transport_seat_states" ("departure_id", "seat_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_seat_states_hold" ON "bc_transport_seat_states" ("hold_id");
--> statement-breakpoint
