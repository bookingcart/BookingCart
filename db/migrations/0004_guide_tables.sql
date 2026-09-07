-- Migration 0004: Create bc_guides and bc_guide_bookings tables

CREATE TABLE IF NOT EXISTS "bc_guides" (
  "id" SERIAL PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "photo" TEXT DEFAULT '',
  "country" TEXT DEFAULT '',
  "city" TEXT DEFAULT '',
  "years_exp" INTEGER DEFAULT 0,
  "verified" BOOLEAN DEFAULT false,
  "rating" NUMERIC(3, 2) DEFAULT 0,
  "review_count" INTEGER DEFAULT 0,
  "categories" JSONB DEFAULT '[]'::jsonb NOT NULL,
  "skills" JSONB DEFAULT '[]'::jsonb NOT NULL,
  "languages" JSONB DEFAULT '[]'::jsonb NOT NULL,
  "areas" JSONB DEFAULT '{}'::jsonb NOT NULL,
  "certifications" JSONB DEFAULT '[]'::jsonb NOT NULL,
  "gallery" JSONB DEFAULT '[]'::jsonb NOT NULL,
  "reviews" JSONB DEFAULT '[]'::jsonb NOT NULL,
  "pricing" JSONB DEFAULT '{}'::jsonb NOT NULL,
  "trust_indicators" JSONB DEFAULT '{}'::jsonb NOT NULL,
  "demand_level" TEXT DEFAULT 'moderate',
  "status" TEXT DEFAULT 'active',
  "availability" JSONB DEFAULT '{}'::jsonb NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_guides_slug" ON "bc_guides" ("slug");
CREATE INDEX IF NOT EXISTS "idx_guides_status" ON "bc_guides" ("status");
CREATE INDEX IF NOT EXISTS "idx_guides_country" ON "bc_guides" ("country");

CREATE TABLE IF NOT EXISTS "bc_guide_bookings" (
  "id" SERIAL PRIMARY KEY,
  "ref" TEXT NOT NULL UNIQUE,
  "guide_id" TEXT NOT NULL,
  "contact_email" TEXT DEFAULT '',
  "status" TEXT DEFAULT 'pending',
  "start_date" TEXT DEFAULT '',
  "end_date" TEXT DEFAULT '',
  "guests" INTEGER DEFAULT 1,
  "total" NUMERIC(12, 2) DEFAULT 0,
  "contact" JSONB DEFAULT '{}'::jsonb NOT NULL,
  "payment" JSONB,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_guide_bookings_ref" ON "bc_guide_bookings" ("ref");
CREATE INDEX IF NOT EXISTS "idx_guide_bookings_guide_id" ON "bc_guide_bookings" ("guide_id");
