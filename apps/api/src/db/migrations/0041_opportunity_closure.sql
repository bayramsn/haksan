ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "closed_by" uuid;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_closed_at_idx" ON "opportunities" USING btree ("closed_at");
