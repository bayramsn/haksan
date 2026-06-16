-- Teklif revizyon numarası: aynı fırsata bağlı tekliflerde 1, 2, 3 …
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "revision_no" integer DEFAULT 1 NOT NULL;

-- Mevcut kayıtlar için backfill: aynı opportunity_id altındaki teklifleri
-- oluşturulma/teklif tarihine göre sırala ve revizyon numarası ata.
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "tenant_id", "opportunity_id"
      ORDER BY "quote_date" ASC, "created_at" ASC
    ) AS rn
  FROM "quotes"
  WHERE "opportunity_id" IS NOT NULL
)
UPDATE "quotes" q
SET "revision_no" = ranked.rn
FROM ranked
WHERE q."id" = ranked."id";
