ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "other_phone" varchar(32);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "other_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "gender" varchar(32);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "birth_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "known_illness" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "political_view" varchar(128);
