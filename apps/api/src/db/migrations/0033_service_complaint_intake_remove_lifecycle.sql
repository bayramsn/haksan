CREATE TABLE IF NOT EXISTS "service_complaint_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "division_id" uuid REFERENCES "divisions"("id") ON DELETE SET NULL,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL,
  "customer_device_id" uuid REFERENCES "customer_devices"("id") ON DELETE SET NULL,
  "slug" varchar(160) NOT NULL,
  "access_token_hash" varchar(128) NOT NULL,
  "title" varchar(255),
  "notes" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_complaint_intakes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "complaint_no" varchar(64) NOT NULL,
  "division_id" uuid REFERENCES "divisions"("id") ON DELETE SET NULL,
  "complaint_link_id" uuid REFERENCES "service_complaint_links"("id") ON DELETE SET NULL,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL,
  "customer_device_id" uuid REFERENCES "customer_devices"("id") ON DELETE SET NULL,
  "service_ticket_id" uuid REFERENCES "service_tickets"("id") ON DELETE SET NULL,
  "source" varchar(32) DEFAULT 'manual' NOT NULL,
  "status" varchar(32) DEFAULT 'new' NOT NULL,
  "subject" varchar(255) NOT NULL,
  "description" text,
  "severity" varchar(32) DEFAULT 'normal' NOT NULL,
  "ticket_type" varchar(32) DEFAULT 'complaint' NOT NULL,
  "contact_name" varchar(255),
  "contact_phone" varchar(64),
  "contact_email" varchar(255),
  "rejection_note" text,
  "metadata" jsonb,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_links_tenant_idx" ON "service_complaint_links" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_links_tenant_division_idx" ON "service_complaint_links" ("tenant_id", "division_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_complaint_links_tenant_slug_unique" ON "service_complaint_links" ("tenant_id", "slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_complaint_links_tenant_token_unique" ON "service_complaint_links" ("tenant_id", "access_token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_links_company_idx" ON "service_complaint_links" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_links_device_idx" ON "service_complaint_links" ("customer_device_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_complaint_intakes_tenant_complaint_no_unique" ON "service_complaint_intakes" ("tenant_id", "complaint_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_intakes_tenant_idx" ON "service_complaint_intakes" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_intakes_tenant_division_idx" ON "service_complaint_intakes" ("tenant_id", "division_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_intakes_status_idx" ON "service_complaint_intakes" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_intakes_source_idx" ON "service_complaint_intakes" ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_intakes_company_idx" ON "service_complaint_intakes" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_intakes_device_idx" ON "service_complaint_intakes" ("customer_device_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_intakes_ticket_idx" ON "service_complaint_intakes" ("service_ticket_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_complaint_intakes_link_idx" ON "service_complaint_intakes" ("complaint_link_id");
--> statement-breakpoint
DROP TABLE IF EXISTS "quote_configuration_snapshots";
--> statement-breakpoint
DROP TABLE IF EXISTS "product_configuration_rules";
--> statement-breakpoint
DROP TABLE IF EXISTS "machine_passport_documents";
--> statement-breakpoint
DROP TABLE IF EXISTS "machine_maintenance_events";
--> statement-breakpoint
DROP TABLE IF EXISTS "machine_passports";
