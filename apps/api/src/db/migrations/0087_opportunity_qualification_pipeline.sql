ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "qualification_stage" varchar(16) NOT NULL DEFAULT 'lead';--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "qualification_note" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "qualification_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "requested_machine" varchar(255);--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "contract_terms" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "payment_terms" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_qualification_stage_check'
  ) THEN
    ALTER TABLE "opportunities"
      ADD CONSTRAINT "opportunities_qualification_stage_check"
      CHECK ("qualification_stage" IN ('lead', 'c', 'b', 'a', 'a_plus', 'win', 'lost'));
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_qualification_stage_idx"
  ON "opportunities" USING btree ("tenant_id", "qualification_stage");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "opportunity_qualification_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "opportunity_id" uuid NOT NULL,
  "from_stage" varchar(16),
  "to_stage" varchar(16) NOT NULL,
  "changed_by" uuid,
  "change_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "opportunity_qualification_history_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade,
  CONSTRAINT "opportunity_qualification_history_opportunity_id_opportunities_id_fk"
    FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade,
  CONSTRAINT "opportunity_qualification_history_changed_by_users_id_fk"
    FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null,
  CONSTRAINT "opportunity_qualification_history_from_stage_check"
    CHECK ("from_stage" IS NULL OR "from_stage" IN ('lead', 'c', 'b', 'a', 'a_plus', 'win', 'lost')),
  CONSTRAINT "opportunity_qualification_history_to_stage_check"
    CHECK ("to_stage" IN ('lead', 'c', 'b', 'a', 'a_plus', 'win', 'lost'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_qualification_history_opportunity_idx"
  ON "opportunity_qualification_history" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_qualification_history_tenant_idx"
  ON "opportunity_qualification_history" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "opportunity_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "opportunity_id" uuid NOT NULL,
  "approval_type" varchar(32) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "opportunity_approvals_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade,
  CONSTRAINT "opportunity_approvals_opportunity_id_opportunities_id_fk"
    FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade,
  CONSTRAINT "opportunity_approvals_decided_by_users_id_fk"
    FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null,
  CONSTRAINT "opportunity_approvals_type_check"
    CHECK ("approval_type" IN ('payment', 'customs', 'invoice', 'installation', 'win')),
  CONSTRAINT "opportunity_approvals_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_approvals_tenant_idx"
  ON "opportunity_approvals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_approvals_opportunity_idx"
  ON "opportunity_approvals" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opportunity_approvals_opportunity_type_unique"
  ON "opportunity_approvals" USING btree ("opportunity_id", "approval_type");--> statement-breakpoint

UPDATE "opportunities" AS o
SET "qualification_stage" = CASE
  WHEN ps."code" = 'cancelled' THEN 'lost'
  WHEN ps."code" = 'delivered' THEN 'win'
  WHEN ps."code" IN ('commercial_invoice', 'customs_approved', 'stock_picking', 'shipping', 'installation') THEN 'a_plus'
  WHEN ps."code" IN ('quote', 'proforma', 'contract', 'payment_plan') THEN 'a'
  WHEN ps."code" IN ('call', 'visit') THEN 'b'
  WHEN ps."code" = 'sales' THEN 'c'
  WHEN ps."code" = 'lead' AND o."company_id" IS NOT NULL THEN 'c'
  ELSE 'lead'
END,
"qualification_updated_at" = COALESCE(o."updated_at", o."created_at", now())
FROM "pipeline_stages" AS ps
WHERE o."current_stage_id" = ps."id";
