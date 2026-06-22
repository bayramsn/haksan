ALTER TABLE "service_tickets" ADD COLUMN IF NOT EXISTS "ticket_type" varchar(32) DEFAULT 'complaint' NOT NULL;
--> statement-breakpoint
ALTER TABLE "service_tickets" ADD COLUMN IF NOT EXISTS "source" varchar(32) DEFAULT 'manual' NOT NULL;
