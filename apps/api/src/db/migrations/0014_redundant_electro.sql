ALTER TABLE "payments" ADD COLUMN "direction" varchar(8) DEFAULT 'in' NOT NULL;--> statement-breakpoint
ALTER TABLE "installation_jobs" ADD COLUMN "location_type" varchar(32);--> statement-breakpoint
ALTER TABLE "installation_jobs" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "installation_jobs" ADD COLUMN "fee_amount" numeric(18, 4);