ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "contact_source_text" varchar(255);

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_contact_source_choice_check"
  CHECK ("contact_source_id" IS NULL OR "contact_source_text" IS NULL);
