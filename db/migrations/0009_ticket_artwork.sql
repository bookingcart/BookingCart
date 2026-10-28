-- Ticket artwork.
--
-- Every printed ticket is a three-panel landscape strip: the admission stub,
-- the platform's own artwork panel, and the client's artwork space. The company
-- panel is uploaded once by an administrator and stamped onto every ticket, so
-- it lives in a single-row platform table. The client panel is per attraction
-- and hangs off bc_ticket_settings next to the rest of the ticket design.

ALTER TABLE "bc_ticket_settings" ADD COLUMN IF NOT EXISTS "ticket_artwork_url" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bc_ticket_settings" ADD COLUMN IF NOT EXISTS "ticket_artwork_fit" text DEFAULT 'cover' NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bc_ticket_branding" (
  "id" integer PRIMARY KEY NOT NULL,
  "company_name" text DEFAULT 'BookingCart' NOT NULL,
  "company_tagline" text DEFAULT 'Compare. Book. Instant.' NOT NULL,
  "company_website" text DEFAULT 'www.bookingcart.online' NOT NULL,
  "artwork_url" text DEFAULT '' NOT NULL,
  "artwork_fit" text DEFAULT 'cover' NOT NULL,
  "updated_by" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  CONSTRAINT "bc_ticket_branding_single_row" CHECK ("id" = 1)
);
--> statement-breakpoint
INSERT INTO "bc_ticket_branding" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
