ALTER TABLE "company_addresses" ADD COLUMN IF NOT EXISTS "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "company_addresses" ADD COLUMN IF NOT EXISTS "longitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "company_addresses" ADD COLUMN IF NOT EXISTS "location_source" varchar(16);
