CREATE TABLE IF NOT EXISTS "bc_event_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"email" text NOT NULL,
	"step_event_info" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"step_location" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"step_features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"step_tickets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"step_gallery" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"step_policies" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"step_contact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ticket_banner_image" text DEFAULT '',
	"status" text DEFAULT 'draft' NOT NULL,
	"admin_note" text DEFAULT '',
	"completeness" integer DEFAULT 0 NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_profiles_status" ON "bc_event_profiles" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_profiles_email" ON "bc_event_profiles" USING btree ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bc_event_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_ref" text NOT NULL UNIQUE,
	"event_profile_id" text NOT NULL,
	"event_name" text NOT NULL,
	"venue_name" text NOT NULL,
	"location" text DEFAULT '',
	"banner_image" text DEFAULT '',
	"ticket_id" text NOT NULL,
	"ticket_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_amount" numeric(12,2) NOT NULL,
	"total_amount" numeric(12,2) NOT NULL,
	"currency" text NOT NULL,
	"guest_name" text NOT NULL,
	"guest_email" text NOT NULL,
	"guest_phone" text DEFAULT '',
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_bookings_event" ON "bc_event_bookings" USING btree ("event_profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_bookings_email" ON "bc_event_bookings" USING btree ("guest_email");
