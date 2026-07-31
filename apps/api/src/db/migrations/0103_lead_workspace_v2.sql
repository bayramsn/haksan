ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "lead_need_summary" text;
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "lead_authority_status" varchar(32) NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "lead_budget_status" varchar(32) NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "lead_purchase_timeframe" varchar(32) NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "lead_technical_fit" varchar(32) NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "lead_technical_note" text;
--> statement-breakpoint
ALTER TABLE "opportunity_qualification_history" ADD COLUMN IF NOT EXISTS "conversion_override" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "opportunity_qualification_history" ADD COLUMN IF NOT EXISTS "fit_score" integer;
--> statement-breakpoint
ALTER TABLE "opportunity_qualification_history" ADD COLUMN IF NOT EXISTS "engagement_score" integer;
--> statement-breakpoint
ALTER TABLE "opportunity_qualification_history" ADD COLUMN IF NOT EXISTS "priority_score" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_assignment_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "division_id" uuid REFERENCES "divisions"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "priority" integer NOT NULL DEFAULT 100,
  "active" boolean NOT NULL DEFAULT true,
  "criteria" jsonb NOT NULL DEFAULT '{"cities":[],"productTerms":[],"sourceCodes":[]}'::jsonb,
  "assignee_user_ids" uuid[] NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_assignment_rules_tenant_idx" ON "lead_assignment_rules" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_assignment_rules_tenant_priority_idx" ON "lead_assignment_rules" ("tenant_id", "priority");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_assignment_cursors" (
  "rule_id" uuid PRIMARY KEY REFERENCES "lead_assignment_rules"("id") ON DELETE CASCADE,
  "next_index" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_contact_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "opportunity_id" uuid NOT NULL REFERENCES "opportunities"("id") ON DELETE CASCADE,
  "activity_id" uuid NOT NULL REFERENCES "sales_activities"("id") ON DELETE CASCADE,
  "idempotency_key" uuid NOT NULL,
  "channel" varchar(16) NOT NULL,
  "outcome" varchar(32) NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_contact_events_opportunity_idx" ON "lead_contact_events" ("opportunity_id", "occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_contact_events_idempotency_unique" ON "lead_contact_events" ("tenant_id", "opportunity_id", "idempotency_key");
--> statement-breakpoint
INSERT INTO "activity_types" ("code", "name", "sort_order", "is_active")
VALUES ('whatsapp', 'WhatsApp', 35, true)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "sort_order" = EXCLUDED."sort_order", "is_active" = true;
--> statement-breakpoint
INSERT INTO "permissions" ("code", "name", "resource", "action")
VALUES ('lead_assignment_rules.manage', 'Lead atama kurallarını yönet', 'lead_assignment_rules', 'manage')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'lead_assignment_rules.manage'
WHERE r."code" IN ('super_admin', 'admin')
ON CONFLICT DO NOTHING;
