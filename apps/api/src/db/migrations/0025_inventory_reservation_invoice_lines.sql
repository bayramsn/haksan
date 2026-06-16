-- Rezervasyon: hangi firmaya ayrıldığı
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "reserved_company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "reserved_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "inventory_items_reserved_company_idx" ON "inventory_items" ("reserved_company_id");

-- Satış faturası satır kalemleri (tezgah seri no + ürün)
CREATE TABLE IF NOT EXISTS "accounting_invoice_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "accounting_invoice_id" uuid NOT NULL REFERENCES "accounting_invoices"("id") ON DELETE CASCADE,
  "product_model_id" uuid REFERENCES "product_models"("id") ON DELETE SET NULL,
  "inventory_item_id" uuid REFERENCES "inventory_items"("id") ON DELETE SET NULL,
  "category_code" varchar(64),
  "description" text,
  "quantity" numeric DEFAULT '1' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "accounting_invoice_lines_invoice_idx" ON "accounting_invoice_lines" ("accounting_invoice_id");
CREATE INDEX IF NOT EXISTS "accounting_invoice_lines_inventory_idx" ON "accounting_invoice_lines" ("inventory_item_id");
