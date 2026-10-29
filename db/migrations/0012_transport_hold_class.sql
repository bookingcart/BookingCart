-- Migration 0012: remember the fare class on a transport hold
-- The hold is what fixes the price at checkout, so it must also carry the class
-- that price was taken from — otherwise the ticket would fall back to Standard
-- even when the passenger paid for a cabin or a VIP recliner.

ALTER TABLE "bc_transport_holds" ADD COLUMN IF NOT EXISTS "fare_class" text DEFAULT 'standard' NOT NULL;
--> statement-breakpoint
