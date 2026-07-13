ALTER TABLE "customer_devices"
  ADD COLUMN IF NOT EXISTS "initial_company_id" uuid;--> statement-breakpoint

UPDATE "customer_devices"
SET "initial_company_id" = "company_id"
WHERE "initial_company_id" IS NULL;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_devices_initial_company_id_companies_id_fk'
  ) THEN
    ALTER TABLE "customer_devices"
      ADD CONSTRAINT "customer_devices_initial_company_id_companies_id_fk"
      FOREIGN KEY ("initial_company_id") REFERENCES "companies"("id") ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "customer_devices_initial_company_idx"
  ON "customer_devices" ("initial_company_id");
