ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_source_check";
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_source_check" CHECK ("source" IN ('manual','device','import'));
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "import_uid" varchar(512);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_events_import_uid_unique" ON "calendar_events" ("tenant_id","owner_user_id","import_uid");
