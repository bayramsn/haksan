ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "lead_temperature" varchar(16),
  ADD COLUMN IF NOT EXISTS "lead_city" varchar(120),
  ADD COLUMN IF NOT EXISTS "lead_phone" varchar(64),
  ADD COLUMN IF NOT EXISTS "lead_email" varchar(254);

UPDATE "opportunities"
SET "lead_temperature" = 'unknown'
WHERE "lead_temperature" IS NULL;

-- Eski hızlı lead kayıtlarında irtibat bilgisi tek alanda tutuluyordu; e-posta
-- benzeri değerler mail kolonuna, kalanlar telefon kolonuna taşınır.
UPDATE "opportunities"
SET "lead_email" = "lead_contact_value"
WHERE "lead_email" IS NULL
  AND "lead_contact_value" IS NOT NULL
  AND "lead_contact_value" LIKE '%@%'
  AND "lead_contact_value" NOT LIKE 'trello:%'
  AND "lead_contact_value" NOT LIKE 'http%';

UPDATE "opportunities"
SET "lead_phone" = "lead_contact_value"
WHERE "lead_phone" IS NULL
  AND "lead_contact_value" IS NOT NULL
  AND "lead_contact_value" NOT LIKE '%@%'
  AND "lead_contact_value" NOT LIKE 'trello:%'
  AND "lead_contact_value" NOT LIKE 'http%'
  AND length(regexp_replace("lead_contact_value", '\D', '', 'g')) >= 7;
