CREATE TABLE IF NOT EXISTS "ba_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ba_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ba_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ba_account_user_id_ba_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ba_user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ba_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "ba_session_token_unique" UNIQUE("token"),
	CONSTRAINT "ba_session_user_id_ba_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ba_user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ba_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bc_admin_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bc_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"contact_email" text DEFAULT '',
	"status" text DEFAULT 'new',
	"route" text DEFAULT '',
	"dates" text DEFAULT '',
	"flight" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"passengers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total" numeric(12, 2) DEFAULT '0',
	"payment" jsonb,
	"payment_split" jsonb,
	"duffel_order_id" text DEFAULT '',
	"duffel_booking_reference" text DEFAULT '',
	"duffel_order_status" text DEFAULT '',
	"duffel_order_request" jsonb,
	"ticket" jsonb,
	"download_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "bc_bookings_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bc_price_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"origin" text DEFAULT '',
	"destination" text DEFAULT '',
	"depart_date" text DEFAULT '',
	"target_price" numeric(12, 2) DEFAULT '0',
	"currency" text DEFAULT 'USD',
	"is_nonstop" boolean DEFAULT false,
	"status" text DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bc_search_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "bc_search_cache_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bc_support" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"email" text DEFAULT '',
	"topic" text DEFAULT '',
	"status" text DEFAULT 'open',
	"admin_read" boolean DEFAULT false,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "bc_support_thread_id_unique" UNIQUE("thread_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bc_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '',
	"password_hash" text,
	"auth_method" text DEFAULT 'google',
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "bc_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bc_bookings"
	ADD COLUMN IF NOT EXISTS "payment_split" jsonb,
	ADD COLUMN IF NOT EXISTS "duffel_order_id" text DEFAULT '',
	ADD COLUMN IF NOT EXISTS "duffel_booking_reference" text DEFAULT '',
	ADD COLUMN IF NOT EXISTS "duffel_order_status" text DEFAULT '',
	ADD COLUMN IF NOT EXISTS "duffel_order_request" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_account_user_id" ON "ba_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_session_user_id" ON "ba_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_verification_identifier" ON "ba_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_created" ON "bc_admin_audit" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_ref" ON "bc_bookings" USING btree ("ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_contact_email" ON "bc_bookings" USING btree ("contact_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_created" ON "bc_bookings" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_price_alerts_email" ON "bc_price_alerts" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_price_alerts_status" ON "bc_price_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_search_cache_key" ON "bc_search_cache" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_search_cache_expires" ON "bc_search_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_support_thread_id" ON "bc_support" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_support_updated" ON "bc_support" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "bc_users" USING btree ("email");
