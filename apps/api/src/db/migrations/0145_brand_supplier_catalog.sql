-- Brand ownership stays in company_id/is_owned; procurement uses its own supplier.
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "supplier_company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "technical_catalog_code" varchar(64) CHECK ("technical_catalog_code" IS NULL OR "technical_catalog_code" = 'AORE_LASER');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brands_supplier_idx" ON "brands" ("supplier_company_id");
