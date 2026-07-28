ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "external_source" varchar(32);

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "external_key" varchar(320);

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "external_url" varchar(512);

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "external_metadata" jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS "opportunities_tenant_external_alive_unique"
  ON "opportunities" ("tenant_id", "external_source", "external_key")
  WHERE "deleted_at" IS NULL
    AND "external_source" IS NOT NULL
    AND "external_key" IS NOT NULL;
