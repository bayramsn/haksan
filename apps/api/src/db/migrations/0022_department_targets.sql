CREATE TABLE IF NOT EXISTS "department_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "department_id" uuid NOT NULL REFERENCES "departments"("id") ON DELETE cascade,
  "period" varchar(7) NOT NULL,
  "currency" varchar(3) DEFAULT 'USD' NOT NULL,
  "sales_amount" numeric(18, 2),
  "sales_new_customers" integer,
  "service_amount" numeric(18, 2),
  "service_completed" integer,
  "digital_lead_target" integer,
  "digital_conversion_target" integer,
  "digital_budget" numeric(18, 2),
  "visit_target" integer,
  "call_target" integer,
  "quote_target" integer,
  "target_items" jsonb,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "department_targets_tenant_idx" ON "department_targets" ("tenant_id");
CREATE INDEX IF NOT EXISTS "department_targets_department_idx" ON "department_targets" ("department_id");
CREATE UNIQUE INDEX IF NOT EXISTS "department_targets_tenant_dept_period_unique" ON "department_targets" ("tenant_id", "department_id", "period");
