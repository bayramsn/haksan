-- Firma vergi numarası tekliği yalnızca silinmemiş (deleted_at IS NULL) kayıtlar için geçerli olsun.
-- Soft-delete edilen firma, aynı vergi numarasıyla yeni firma oluşturmayı engelliyordu (500).
DROP INDEX IF EXISTS "companies_tenant_tax_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "companies_tenant_tax_alive_unique"
  ON "companies" ("tenant_id", "tax_number") WHERE "deleted_at" IS NULL;
