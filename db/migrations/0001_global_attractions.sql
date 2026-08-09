CREATE TABLE IF NOT EXISTS "bc_attraction_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_hash" text NOT NULL,
	"user_email" text,
	"event_type" text NOT NULL,
	"attraction_id" text,
	"source" text,
	"destination" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attraction_events_created" ON "bc_attraction_events" USING btree ("created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attraction_events_type" ON "bc_attraction_events" USING btree ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attraction_events_attraction" ON "bc_attraction_events" USING btree ("attraction_id");
