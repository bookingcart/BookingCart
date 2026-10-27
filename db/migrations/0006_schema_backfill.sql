-- Migration 0006: Backfill tables and columns that were previously created by
-- runtime API handlers (CREATE TABLE / ALTER TABLE inside api-routes/*.js).
-- Every statement is idempotent so it is safe to apply to databases where the
-- old runtime DDL already ran.

-- ── bc_users: profile columns used by guide/hotel/event onboarding ───────────
ALTER TABLE "bc_users" ADD COLUMN IF NOT EXISTS "phone" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "bc_users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'traveler';
--> statement-breakpoint

-- ── bc_guides: email + onboarding/availability columns ───────────────────────
ALTER TABLE "bc_guides" ADD COLUMN IF NOT EXISTS "email" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "bc_guides" ADD COLUMN IF NOT EXISTS "bio" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "bc_guides" ADD COLUMN IF NOT EXISTS "badges" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "bc_guides" ADD COLUMN IF NOT EXISTS "instant_booking" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "bc_guides" ADD COLUMN IF NOT EXISTS "working_days" text DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "bc_guides" ADD COLUMN IF NOT EXISTS "working_hours" text DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE "bc_guides" ADD COLUMN IF NOT EXISTS "max_tours_per_day" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "bc_guides" ADD COLUMN IF NOT EXISTS "registration_fee_paid" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "bc_guides" ADD COLUMN IF NOT EXISTS "registration_fee_type" text DEFAULT 'free_early_bird';
--> statement-breakpoint
ALTER TABLE "bc_guides" ADD COLUMN IF NOT EXISTS "verification_fee_paid" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "bc_guides" ADD COLUMN IF NOT EXISTS "verification_status" text DEFAULT 'approved';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guides_email" ON "bc_guides" ("email");
--> statement-breakpoint

-- ── bc_guide_profiles: guide onboarding applications ─────────────────────────
CREATE TABLE IF NOT EXISTS "bc_guide_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "email" text NOT NULL,
  "step_personal" jsonb DEFAULT '{}'::jsonb,
  "step_categories" jsonb DEFAULT '{}'::jsonb,
  "step_areas" jsonb DEFAULT '{}'::jsonb,
  "step_languages" jsonb DEFAULT '{}'::jsonb,
  "step_skills" jsonb DEFAULT '{}'::jsonb,
  "step_certifications" jsonb DEFAULT '[]'::jsonb,
  "step_experience" jsonb DEFAULT '{}'::jsonb,
  "step_pricing" jsonb DEFAULT '{}'::jsonb,
  "step_gallery" jsonb DEFAULT '[]'::jsonb,
  "step_availability" jsonb DEFAULT '{}'::jsonb,
  "step_booking_settings" jsonb DEFAULT '{}'::jsonb,
  "status" text DEFAULT 'draft',
  "admin_note" text DEFAULT '',
  "completeness" integer DEFAULT 0,
  "current_step" integer DEFAULT 1,
  "registration_fee_paid" boolean DEFAULT false,
  "registration_fee_type" text DEFAULT 'free_early_bird',
  "verification_fee_paid" boolean DEFAULT false,
  "verification_status" text DEFAULT 'unrequested',
  "stripe_account_id" text,
  "stripe_onboarding_complete" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "bc_guide_profiles" ADD COLUMN IF NOT EXISTS "registration_fee_paid" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "bc_guide_profiles" ADD COLUMN IF NOT EXISTS "registration_fee_type" text DEFAULT 'free_early_bird';
--> statement-breakpoint
ALTER TABLE "bc_guide_profiles" ADD COLUMN IF NOT EXISTS "verification_fee_paid" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "bc_guide_profiles" ADD COLUMN IF NOT EXISTS "verification_status" text DEFAULT 'unrequested';
--> statement-breakpoint
ALTER TABLE "bc_guide_profiles" ADD COLUMN IF NOT EXISTS "stripe_account_id" text;
--> statement-breakpoint
ALTER TABLE "bc_guide_profiles" ADD COLUMN IF NOT EXISTS "stripe_onboarding_complete" boolean DEFAULT false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guide_profiles_email" ON "bc_guide_profiles" ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guide_profiles_status" ON "bc_guide_profiles" ("status");
--> statement-breakpoint

-- Backfill guide emails from onboarding applications (previously done at runtime)
UPDATE "bc_guides" g
SET "email" = gp."email"
FROM "bc_guide_profiles" gp
WHERE (g."email" IS NULL OR g."email" = '')
  AND (
    LOWER(TRIM(g."name")) = LOWER(TRIM((gp."step_personal"->>'fullName')))
    OR LOWER(TRIM(g."name")) = LOWER(TRIM((gp."step_personal"->>'name')))
  );
--> statement-breakpoint

-- ── bc_guide_reviews: traveler reviews for guides ───────────────────────────
CREATE TABLE IF NOT EXISTS "bc_guide_reviews" (
  "id" serial PRIMARY KEY NOT NULL,
  "guide_id" text NOT NULL,
  "booking_ref" text NOT NULL UNIQUE,
  "author_name" text,
  "author_email" text,
  "rating" numeric(3, 2) NOT NULL,
  "detailed_ratings" jsonb DEFAULT '{}'::jsonb,
  "text" text,
  "photos" jsonb DEFAULT '[]'::jsonb,
  "recommendation" text,
  "traveler_type" text,
  "tags" jsonb DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'approved',
  "guide_response" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guide_reviews_guide" ON "bc_guide_reviews" ("guide_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guide_reviews_status" ON "bc_guide_reviews" ("status");
--> statement-breakpoint

-- ── bc_guide_withdrawals: guide wallet payouts ──────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_guide_withdrawals" (
  "id" serial PRIMARY KEY NOT NULL,
  "guide_id" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "method" text NOT NULL,
  "status" text DEFAULT 'pending',
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guide_withdrawals_guide" ON "bc_guide_withdrawals" ("guide_id");
--> statement-breakpoint

-- ── bc_hotel_profiles: hotel owner listings ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_hotel_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "email" text NOT NULL,
  "step_property_info" jsonb DEFAULT '{}'::jsonb,
  "step_location" jsonb DEFAULT '{}'::jsonb,
  "step_amenities" jsonb DEFAULT '{}'::jsonb,
  "step_rooms" jsonb DEFAULT '{}'::jsonb,
  "step_gallery" jsonb DEFAULT '[]'::jsonb,
  "step_policies" jsonb DEFAULT '{}'::jsonb,
  "step_contact" jsonb DEFAULT '{}'::jsonb,
  "status" text DEFAULT 'draft',
  "admin_note" text DEFAULT '',
  "completeness" integer DEFAULT 0,
  "current_step" integer DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hotel_profiles_email" ON "bc_hotel_profiles" ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hotel_profiles_status" ON "bc_hotel_profiles" ("status");
--> statement-breakpoint

-- ── bc_attraction_profiles: attraction owner listings ───────────────────────
CREATE TABLE IF NOT EXISTS "bc_attraction_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_email" text NOT NULL,
  "owner_id" integer,
  "name" text DEFAULT '',
  "category" text DEFAULT '',
  "location" text DEFAULT '',
  "country" text DEFAULT '',
  "city" text DEFAULT '',
  "description" text DEFAULT '',
  "featured_image" text DEFAULT '',
  "gallery" jsonb DEFAULT '[]'::jsonb,
  "tags" jsonb DEFAULT '[]'::jsonb,
  "price" numeric(12, 2) DEFAULT 0,
  "currency" text DEFAULT 'USD',
  "duration" text DEFAULT '',
  "highlights" jsonb DEFAULT '[]'::jsonb,
  "contact" jsonb DEFAULT '{}'::jsonb,
  "opening_hours" jsonb DEFAULT '{}'::jsonb,
  "amenities" jsonb DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'draft',
  "admin_note" text DEFAULT '',
  "views" integer DEFAULT 0,
  "bookings" integer DEFAULT 0,
  "completeness" integer DEFAULT 0,
  "deleted" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "bc_attraction_profiles" ADD COLUMN IF NOT EXISTS "views" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "bc_attraction_profiles" ADD COLUMN IF NOT EXISTS "bookings" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "bc_attraction_profiles" ADD COLUMN IF NOT EXISTS "deleted" boolean DEFAULT false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attr_profiles_owner" ON "bc_attraction_profiles" ("owner_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attr_profiles_status" ON "bc_attraction_profiles" ("status");
--> statement-breakpoint

-- ── bc_event_organizer_profiles: Stripe Connect records for organizers ──────
CREATE TABLE IF NOT EXISTS "bc_event_organizer_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_organizer_profiles_email" ON "bc_event_organizer_profiles" ("email");
--> statement-breakpoint

-- ── bc_event_profiles / bc_event_bookings: upgrade columns ──────────────────
ALTER TABLE "bc_event_profiles" ADD COLUMN IF NOT EXISTS "ticket_banner_image" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "bc_event_bookings" ADD COLUMN IF NOT EXISTS "banner_image" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "bc_event_bookings" ADD COLUMN IF NOT EXISTS "ticket_no" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "bc_event_bookings" ADD COLUMN IF NOT EXISTS "payment_method" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "bc_event_bookings" ADD COLUMN IF NOT EXISTS "service_fee" numeric(12, 2) DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "bc_event_bookings" ADD COLUMN IF NOT EXISTS "organizer_amount" numeric(12, 2) DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "bc_event_bookings" ADD COLUMN IF NOT EXISTS "admissions_used" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "bc_event_bookings" ADD COLUMN IF NOT EXISTS "ticket_status" text DEFAULT 'valid';
--> statement-breakpoint

-- ── Hotel PMS: floors, rooms, bookings, blocks, holds ───────────────────────
CREATE TABLE IF NOT EXISTS "bc_pms_floors" (
  "id" serial PRIMARY KEY NOT NULL,
  "hotel_profile_id" integer NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bc_pms_rooms" (
  "id" serial PRIMARY KEY NOT NULL,
  "hotel_profile_id" integer NOT NULL,
  "floor_id" integer,
  "room_number" text NOT NULL,
  "room_type" text DEFAULT 'Standard',
  "bed_type" text DEFAULT 'Queen',
  "capacity" integer DEFAULT 2,
  "base_price" numeric(10, 2) DEFAULT 0,
  "seasonal_price" numeric(10, 2),
  "currency" text DEFAULT 'USD',
  "amenities" jsonb DEFAULT '[]'::jsonb,
  "images" jsonb DEFAULT '[]'::jsonb,
  "description" text DEFAULT '',
  "status" text DEFAULT 'available',
  "size_sqm" integer,
  "pos_x" integer DEFAULT 0,
  "pos_y" integer DEFAULT 0,
  "grid_w" integer DEFAULT 1,
  "grid_h" integer DEFAULT 1,
  "wing_section" text DEFAULT 'Main Wing',
  "view_type" text DEFAULT 'City View',
  "has_balcony" boolean DEFAULT false,
  "is_accessible" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "bc_pms_rooms" ADD COLUMN IF NOT EXISTS "pos_x" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "bc_pms_rooms" ADD COLUMN IF NOT EXISTS "pos_y" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "bc_pms_rooms" ADD COLUMN IF NOT EXISTS "grid_w" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "bc_pms_rooms" ADD COLUMN IF NOT EXISTS "grid_h" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "bc_pms_rooms" ADD COLUMN IF NOT EXISTS "wing_section" text DEFAULT 'Main Wing';
--> statement-breakpoint
ALTER TABLE "bc_pms_rooms" ADD COLUMN IF NOT EXISTS "view_type" text DEFAULT 'City View';
--> statement-breakpoint
ALTER TABLE "bc_pms_rooms" ADD COLUMN IF NOT EXISTS "has_balcony" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "bc_pms_rooms" ADD COLUMN IF NOT EXISTS "is_accessible" boolean DEFAULT false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bc_pms_bookings" (
  "id" serial PRIMARY KEY NOT NULL,
  "ref" text NOT NULL UNIQUE,
  "hotel_profile_id" integer NOT NULL,
  "room_id" integer NOT NULL,
  "floor_id" integer,
  "guest_name" text NOT NULL,
  "guest_email" text NOT NULL,
  "guest_phone" text DEFAULT '',
  "check_in" date NOT NULL,
  "check_out" date NOT NULL,
  "num_guests" integer DEFAULT 1,
  "booking_status" text DEFAULT 'pending',
  "payment_status" text DEFAULT 'pending',
  "amount_paid" numeric(10, 2) DEFAULT 0,
  "total_amount" numeric(10, 2) DEFAULT 0,
  "service_fee" numeric(10, 2) DEFAULT 0,
  "hotel_amount" numeric(10, 2) DEFAULT 0,
  "remaining_balance" numeric(10, 2) DEFAULT 0,
  "special_requests" text DEFAULT '',
  "confirmation_sent" boolean DEFAULT false,
  "notes" text DEFAULT '',
  "source" text DEFAULT 'direct',
  "accommodation_name" text DEFAULT '',
  "accommodation_image" text DEFAULT '',
  "currency" text DEFAULT 'USD',
  "ticket_status" text DEFAULT 'valid',
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "bc_pms_bookings" ADD COLUMN IF NOT EXISTS "service_fee" numeric(10, 2) DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "bc_pms_bookings" ADD COLUMN IF NOT EXISTS "hotel_amount" numeric(10, 2) DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "bc_pms_bookings" ADD COLUMN IF NOT EXISTS "accommodation_name" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "bc_pms_bookings" ADD COLUMN IF NOT EXISTS "accommodation_image" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "bc_pms_bookings" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'USD';
--> statement-breakpoint
ALTER TABLE "bc_pms_bookings" ADD COLUMN IF NOT EXISTS "ticket_status" text DEFAULT 'valid';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bc_pms_blocks" (
  "id" serial PRIMARY KEY NOT NULL,
  "hotel_profile_id" integer NOT NULL,
  "room_id" integer NOT NULL,
  "from_date" date NOT NULL,
  "to_date" date NOT NULL,
  "reason" text DEFAULT 'blocked',
  "notes" text DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bc_pms_holds" (
  "id" serial PRIMARY KEY NOT NULL,
  "hotel_profile_id" integer NOT NULL,
  "room_id" integer NOT NULL,
  "session_id" text NOT NULL,
  "check_in" date NOT NULL,
  "check_out" date NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pms_floors_hotel" ON "bc_pms_floors" ("hotel_profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pms_rooms_hotel" ON "bc_pms_rooms" ("hotel_profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pms_bookings_hotel" ON "bc_pms_bookings" ("hotel_profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pms_bookings_email" ON "bc_pms_bookings" ("guest_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pms_blocks_room" ON "bc_pms_blocks" ("room_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pms_holds_session" ON "bc_pms_holds" ("session_id");
--> statement-breakpoint

-- ── bc_ticket_validations: QR scan audit trail ─────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_ticket_validations" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_number" text NOT NULL,
  "operator_type" text NOT NULL,
  "service_id" text DEFAULT '',
  "service_name" text DEFAULT '',
  "action_performed" text NOT NULL,
  "result" text NOT NULL,
  "rejection_reason" text DEFAULT '',
  "validated_by_email" text NOT NULL,
  "validated_by_name" text DEFAULT '',
  "device_info" text DEFAULT '',
  "guest_name" text DEFAULT '',
  "details" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_validations_ref" ON "bc_ticket_validations" ("ticket_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_validations_email" ON "bc_ticket_validations" ("validated_by_email");
--> statement-breakpoint

-- ── bc_uploaded_images: image bytes served from the API ────────────────────
CREATE TABLE IF NOT EXISTS "bc_uploaded_images" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_email" text NOT NULL,
  "mime_type" text NOT NULL,
  "image_data" bytea NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_uploaded_images_owner" ON "bc_uploaded_images" ("owner_email");
--> statement-breakpoint

-- ── bc_rate_limits: shared brute-force counters for serverless deployments ─
CREATE TABLE IF NOT EXISTS "bc_rate_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rate_limits_reset" ON "bc_rate_limits" ("reset_at");
