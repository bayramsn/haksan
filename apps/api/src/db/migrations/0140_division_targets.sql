CREATE TABLE IF NOT EXISTS "division_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "division_id" uuid NOT NULL REFERENCES "divisions"("id") ON DELETE cascade,
  "period" varchar(7) NOT NULL,
  "currency" varchar(3) DEFAULT 'USD' NOT NULL,
  "sales_amount" numeric(18, 4),
  "sales_new_customers" integer,
  "service_amount" numeric(18, 4),
  "service_completed" integer,
  "digital_lead_target" integer,
  "digital_conversion_target" integer,
  "digital_budget" numeric(18, 4),
  "visit_target" integer,
  "call_target" integer,
  "quote_target" integer,
  "target_items" jsonb,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "division_targets_tenant_idx" ON "division_targets" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "division_targets_division_idx" ON "division_targets" ("division_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "division_targets_tenant_division_period_unique"
  ON "division_targets" ("tenant_id", "division_id", "period");
