ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "external_company_no" varchar(32);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "source_metadata" jsonb;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "external_contact_no" varchar(32);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "source_metadata" jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS "companies_tenant_external_no_alive_unique"
  ON "companies" ("tenant_id", "external_company_no")
  WHERE "deleted_at" IS NULL AND "external_company_no" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_tenant_external_no_alive_unique"
  ON "contacts" ("tenant_id", "external_contact_no")
  WHERE "deleted_at" IS NULL AND "external_contact_no" IS NOT NULL;
