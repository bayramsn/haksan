ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "lead_follow_up_status" varchar(24) NOT NULL DEFAULT 'new';--> statement-breakpoint
ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "next_action" text;--> statement-breakpoint
ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "next_action_at" timestamp with time zone;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_lead_follow_up_status_check'
  ) THEN
    ALTER TABLE "opportunities"
      ADD CONSTRAINT "opportunities_lead_follow_up_status_check"
      CHECK ("lead_follow_up_status" IN ('new', 'attempting', 'contacted', 'waiting', 'disqualified'));
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "opportunities_lead_follow_up_status_idx"
  ON "opportunities" USING btree ("tenant_id", "lead_follow_up_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_next_action_at_idx"
  ON "opportunities" USING btree ("tenant_id", "next_action_at");
