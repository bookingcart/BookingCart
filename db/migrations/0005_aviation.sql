-- Private jet, charter, and helicopter marketplace records.
CREATE TABLE IF NOT EXISTS "bc_aviation_records" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_aviation_records_kind" ON "bc_aviation_records" ("kind");
