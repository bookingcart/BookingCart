-- Migration 0014: Cinema auditorium layout editor
-- Adds the pieces the visual seating editor needs on top of 0010:
--   • configurable seat types per cinema
--   • versioned auditorium layouts (draft → published → archived)
--   • seats owned by a layout version, so publishing a new layout never touches
--     the seats a scheduled screening or a sold ticket already points at
--   • screening price snapshots and pricing rules
--   • reusable layout templates and an audit trail
-- Everything is idempotent so the file can be re-run safely.

-- ── Seat types ───────────────────────────────────────────────────────────────
-- A seat type is what the owner paints with: Standard, VIP, Recliner, Sofa,
-- Wheelchair, Companion, or any custom type. `slug` is stored on the seat.
CREATE TABLE IF NOT EXISTS "bc_cinema_seat_types" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT '#94a3b8' NOT NULL,
  "icon" text DEFAULT 'ph-armchair' NOT NULL,
  "base_category" text DEFAULT 'standard' NOT NULL,
  "default_price" numeric(12, 2),
  "multiplier" numeric(6, 3) DEFAULT '1' NOT NULL,
  "admissions" integer DEFAULT 1 NOT NULL,
  "booking_mode" text DEFAULT 'single' NOT NULL,
  "group_size" integer DEFAULT 1 NOT NULL,
  "split_allowed" boolean DEFAULT false NOT NULL,
  "accessible" boolean DEFAULT false NOT NULL,
  "companion_required" boolean DEFAULT false NOT NULL,
  "instructions" text DEFAULT '' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_cinema_seat_type_slug" ON "bc_cinema_seat_types" ("attraction_id", "slug");
--> statement-breakpoint

-- ── Layout versions ──────────────────────────────────────────────────────────
-- A version is the editor document plus the published seat rows it produced.
-- Old versions stay readable so historical screenings keep their exact seats.
CREATE TABLE IF NOT EXISTS "bc_cinema_layout_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "screen_id" integer NOT NULL,
  "version" integer NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "document" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "capacity" integer DEFAULT 0 NOT NULL,
  "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "restored_from" integer DEFAULT 0 NOT NULL,
  "created_by" text DEFAULT '' NOT NULL,
  "published_by" text DEFAULT '' NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_cinema_layout_version" ON "bc_cinema_layout_versions" ("screen_id", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_layout_versions_screen" ON "bc_cinema_layout_versions" ("screen_id", "status");
--> statement-breakpoint

-- ── Auditorium columns ───────────────────────────────────────────────────────
ALTER TABLE "bc_cinema_screens" ADD COLUMN IF NOT EXISTS "capacity" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_cinema_screens" ADD COLUMN IF NOT EXISTS "active_layout_version_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_cinema_screens" ADD COLUMN IF NOT EXISTS "hall_kind" text DEFAULT 'standard' NOT NULL;
--> statement-breakpoint

-- ── Seats belong to a version ────────────────────────────────────────────────
ALTER TABLE "bc_cinema_seats" ADD COLUMN IF NOT EXISTS "layout_version_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_cinema_seats" ADD COLUMN IF NOT EXISTS "custom_label" text DEFAULT '' NOT NULL;
--> statement-breakpoint

-- The old unique index assumed one layout per screen. Replace it with a
-- per-version key so v1 A5 and v2 A5 can coexist.
DROP INDEX IF EXISTS "uniq_cinema_seat_position";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_cinema_seat_version_position"
  ON "bc_cinema_seats" ("layout_version_id", "row_label", "seat_no")
  WHERE "layout_version_id" > 0;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_cinema_seat_legacy_position"
  ON "bc_cinema_seats" ("screen_id", "row_label", "seat_no")
  WHERE "layout_version_id" = 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_seats_version" ON "bc_cinema_seats" ("layout_version_id");
--> statement-breakpoint

-- ── Screenings pin a layout version and a price snapshot ─────────────────────
ALTER TABLE "bc_cinema_showtimes" ADD COLUMN IF NOT EXISTS "layout_version_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_cinema_showtimes" ADD COLUMN IF NOT EXISTS "pricing_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_cinema_showtimes" ADD COLUMN IF NOT EXISTS "price_rule_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_showtimes_layout" ON "bc_cinema_showtimes" ("layout_version_id");
--> statement-breakpoint

-- ── Pricing rules (weekday / weekend / holiday / screening) ──────────────────
CREATE TABLE IF NOT EXISTS "bc_cinema_pricing_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "name" text NOT NULL,
  "scope" text DEFAULT 'all' NOT NULL,
  "weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "date_from" date,
  "date_to" date,
  "showtime_id" integer DEFAULT 0 NOT NULL,
  "adjustment" text DEFAULT 'multiplier' NOT NULL,
  "value" numeric(12, 2) DEFAULT '1' NOT NULL,
  "category_prices" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_pricing_rules_cinema" ON "bc_cinema_pricing_rules" ("attraction_id", "status");
--> statement-breakpoint

-- ── Reusable layout templates ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_cinema_layout_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer DEFAULT 0 NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "kind" text DEFAULT 'custom' NOT NULL,
  "document" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "capacity" integer DEFAULT 0 NOT NULL,
  "created_by" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_layout_templates_owner" ON "bc_cinema_layout_templates" ("attraction_id", "status");
--> statement-breakpoint

-- ── Layout audit trail ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bc_cinema_layout_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "attraction_id" integer NOT NULL,
  "screen_id" integer DEFAULT 0 NOT NULL,
  "version_id" integer DEFAULT 0 NOT NULL,
  "actor_email" text DEFAULT '' NOT NULL,
  "actor_role" text DEFAULT '' NOT NULL,
  "action" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cinema_layout_audit_cinema" ON "bc_cinema_layout_audit" ("attraction_id", "created_at");
--> statement-breakpoint

-- ── Backfill: every existing screen becomes published layout v1 ──────────────
INSERT INTO "bc_cinema_layout_versions"
  ("attraction_id", "screen_id", "version", "name", "status", "document", "capacity", "created_by", "published_by", "published_at")
SELECT s."attraction_id", s."id", 1, 'Initial layout', 'published', '{}'::jsonb,
       (SELECT COUNT(*)::int FROM "bc_cinema_seats" st WHERE st."screen_id" = s."id"),
       'migration', 'migration', NOW()
  FROM "bc_cinema_screens" s
 WHERE EXISTS (SELECT 1 FROM "bc_cinema_seats" st WHERE st."screen_id" = s."id")
   AND NOT EXISTS (SELECT 1 FROM "bc_cinema_layout_versions" v WHERE v."screen_id" = s."id");
--> statement-breakpoint
UPDATE "bc_cinema_seats" st
   SET "layout_version_id" = v."id"
  FROM "bc_cinema_layout_versions" v
 WHERE v."screen_id" = st."screen_id" AND v."version" = 1 AND st."layout_version_id" = 0;
--> statement-breakpoint
UPDATE "bc_cinema_screens" s
   SET "active_layout_version_id" = v."id",
       "capacity" = (SELECT COUNT(*)::int FROM "bc_cinema_seats" st WHERE st."layout_version_id" = v."id")
  FROM "bc_cinema_layout_versions" v
 WHERE v."screen_id" = s."id" AND v."version" = 1 AND s."active_layout_version_id" = 0;
--> statement-breakpoint
UPDATE "bc_cinema_showtimes" sh
   SET "layout_version_id" = s."active_layout_version_id"
  FROM "bc_cinema_screens" s
 WHERE s."id" = sh."screen_id" AND sh."layout_version_id" = 0 AND s."active_layout_version_id" > 0;
--> statement-breakpoint

-- ── Backfill: default seat types for cinemas that already have screens ───────
INSERT INTO "bc_cinema_seat_types"
  ("attraction_id", "slug", "name", "color", "icon", "base_category", "multiplier", "admissions", "sort_order")
SELECT DISTINCT s."attraction_id", t."slug", t."name", t."color", t."icon", t."base_category",
       t."multiplier", t."admissions", t."sort_order"
  FROM "bc_cinema_screens" s
 CROSS JOIN (VALUES
   ('standard',  'Standard',        '#94a3b8', 'ph-armchair',   'standard',   1.0, 1, 1),
   ('premium',   'Premium',         '#38bdf8', 'ph-armchair',   'premium',    1.3, 1, 2),
   ('vip',       'VIP',             '#a855f7', 'ph-crown',      'vip',        1.7, 1, 3),
   ('recliner',  'Recliner',        '#f59e0b', 'ph-bed',        'recliner',   1.75, 1, 4),
   ('couple',    'Couples',         '#f43f5e', 'ph-heart',      'couple',     2.0, 2, 5),
   ('sofa',      'Sofa',            '#8b5cf6', 'ph-couch',      'couple',     2.0, 2, 6),
   ('wheelchair','Wheelchair space','#3b82f6', 'ph-wheelchair', 'wheelchair', 1.0, 1, 7),
   ('companion', 'Companion',       '#14b8a6', 'ph-users',      'companion',  0.7, 1, 8)
 ) AS t("slug", "name", "color", "icon", "base_category", "multiplier", "admissions", "sort_order")
ON CONFLICT ("attraction_id", "slug") DO NOTHING;
--> statement-breakpoint
