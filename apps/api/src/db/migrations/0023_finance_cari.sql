-- Faz 1: cari hareket alanları
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "invoice_no" varchar(64);
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "movement_type" varchar(32) DEFAULT 'manual' NOT NULL;
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "document_ref" varchar(128);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "invoice_no" varchar(64);

-- Faz 2: muhasebe faturası ve borç tabloları
CREATE TABLE IF NOT EXISTS "accounting_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE restrict,
  "type" varchar(16) NOT NULL,
  "invoice_no" varchar(64) NOT NULL,
  "invoice_date" timestamp with time zone NOT NULL,
  "amount" numeric(18, 4) NOT NULL,
  "vat_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
  "grand_total" numeric(18, 4) NOT NULL,
  "currency_id" uuid REFERENCES "currencies"("id"),
  "quote_id" uuid REFERENCES "quotes"("id") ON DELETE set null,
  "sales_order_id" uuid REFERENCES "sales_orders"("id") ON DELETE set null,
  "first_due_date" timestamp with time zone,
  "last_due_date" timestamp with time zone,
  "installment_count" integer DEFAULT 1 NOT NULL,
  "status_id" uuid REFERENCES "invoice_statuses"("id"),
  "file_id" uuid REFERENCES "files"("id") ON DELETE set null,
  "notes" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "accounting_invoices_tenant_idx" ON "accounting_invoices" ("tenant_id");
CREATE INDEX IF NOT EXISTS "accounting_invoices_company_idx" ON "accounting_invoices" ("company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "accounting_invoices_tenant_invoice_no_unique" ON "accounting_invoices" ("tenant_id", "invoice_no");

CREATE TABLE IF NOT EXISTS "payables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE restrict,
  "accounting_invoice_id" uuid REFERENCES "accounting_invoices"("id") ON DELETE set null,
  "invoice_no" varchar(64),
  "movement_type" varchar(32) DEFAULT 'manual' NOT NULL,
  "document_ref" varchar(128),
  "amount" numeric(18, 4) NOT NULL,
  "currency_id" uuid REFERENCES "currencies"("id"),
  "due_date" timestamp with time zone NOT NULL,
  "status_id" uuid REFERENCES "payment_statuses"("id"),
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "payables_tenant_idx" ON "payables" ("tenant_id");
CREATE INDEX IF NOT EXISTS "payables_company_idx" ON "payables" ("company_id");
CREATE INDEX IF NOT EXISTS "payables_due_date_idx" ON "payables" ("due_date");

ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "accounting_invoice_id" uuid REFERENCES "accounting_invoices"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "invoice_installments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "accounting_invoice_id" uuid NOT NULL REFERENCES "accounting_invoices"("id") ON DELETE cascade,
  "installment_no" integer NOT NULL,
  "due_date" timestamp with time zone NOT NULL,
  "amount" numeric(18, 4) NOT NULL,
  "status_id" uuid REFERENCES "payment_statuses"("id"),
  "receivable_id" uuid,
  "payable_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "invoice_installments_invoice_idx" ON "invoice_installments" ("accounting_invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_installments_due_date_idx" ON "invoice_installments" ("due_date");

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payable_id" uuid REFERENCES "payables"("id") ON DELETE set null;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "accounting_invoice_id" uuid REFERENCES "accounting_invoices"("id") ON DELETE set null;
