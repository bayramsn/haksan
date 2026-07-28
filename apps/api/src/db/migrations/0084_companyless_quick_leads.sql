ALTER TABLE "opportunities"
  ALTER COLUMN "company_id" DROP NOT NULL;

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "lead_contact_name" varchar(255);

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "lead_company_title" varchar(255);

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "lead_contact_value" varchar(320);
