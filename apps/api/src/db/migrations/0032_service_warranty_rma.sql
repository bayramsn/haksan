CREATE TABLE IF NOT EXISTS "service_warranty_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "division_id" uuid REFERENCES "divisions"("id") ON DELETE SET NULL,
  "service_ticket_id" uuid NOT NULL REFERENCES "service_tickets"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "customer_device_id" uuid REFERENCES "customer_devices"("id") ON DELETE SET NULL,
  "warranty_start_snapshot" timestamp with time zone,
  "warranty_end_snapshot" timestamp with time zone,
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "coverage_suggestion" varchar(32) DEFAULT 'unknown' NOT NULL,
  "coverage_decision" varchar(32) DEFAULT 'pending' NOT NULL,
  "failure_category" varchar(128),
  "technician_assessment" text,
  "manager_decision_note" text,
  "decided_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "rma_no" varchar(128),
  "supplier_name" varchar(255),
  "supplier_rma_status" varchar(64),
  "cost_amount" numeric(18,4),
  "cost_currency" varchar(8) DEFAULT 'USD' NOT NULL,
  "customer_charge_amount" numeric(18,4),
  "customer_charge_currency" varchar(8) DEFAULT 'USD' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_warranty_parts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "warranty_claim_id" uuid NOT NULL REFERENCES "service_warranty_claims"("id") ON DELETE CASCADE,
  "product_model_id" uuid REFERENCES "product_models"("id") ON DELETE SET NULL,
  "inventory_item_id" uuid REFERENCES "inventory_items"("id") ON DELETE SET NULL,
  "description" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "action_type" varchar(32) DEFAULT 'replace' NOT NULL,
  "source" varchar(32) DEFAULT 'stock' NOT NULL,
  "supplier_rma_status" varchar(64),
  "charge_to_customer" boolean DEFAULT false NOT NULL,
  "unit_cost" numeric(18,4),
  "currency" varchar(8) DEFAULT 'USD' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_warranty_claims_service_ticket_unique" ON "service_warranty_claims" ("service_ticket_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_warranty_claims_tenant_idx" ON "service_warranty_claims" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_warranty_claims_tenant_division_idx" ON "service_warranty_claims" ("tenant_id", "division_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_warranty_claims_company_idx" ON "service_warranty_claims" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_warranty_claims_device_idx" ON "service_warranty_claims" ("customer_device_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_warranty_claims_status_idx" ON "service_warranty_claims" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_warranty_parts_tenant_idx" ON "service_warranty_parts" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_warranty_parts_claim_idx" ON "service_warranty_parts" ("warranty_claim_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_warranty_parts_product_idx" ON "service_warranty_parts" ("product_model_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_warranty_parts_inventory_idx" ON "service_warranty_parts" ("inventory_item_id");
--> statement-breakpoint
INSERT INTO "service_warranty_claims" (
  "tenant_id",
  "division_id",
  "service_ticket_id",
  "company_id",
  "customer_device_id",
  "warranty_start_snapshot",
  "warranty_end_snapshot",
  "coverage_suggestion",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  st."tenant_id",
  st."division_id",
  st."id",
  st."company_id",
  st."customer_device_id",
  cd."warranty_start_date",
  cd."warranty_end_date",
  CASE
    WHEN cd."id" IS NULL OR cd."warranty_end_date" IS NULL THEN 'unknown'
    WHEN cd."warranty_start_date" IS NOT NULL AND cd."warranty_start_date" > now() THEN 'unknown'
    WHEN cd."warranty_end_date" >= now() THEN 'in_warranty'
    ELSE 'out_of_warranty'
  END,
  'draft',
  now(),
  now()
FROM "service_tickets" st
LEFT JOIN "customer_devices" cd ON cd."id" = st."customer_device_id"
WHERE st."ticket_type" = 'warranty_claim'
  AND st."deleted_at" IS NULL
ON CONFLICT ("service_ticket_id") DO NOTHING;
