ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "lost_company_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "lost_product_name" varchar(512);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "lost_competitor_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "lost_unmet_conditions" text;
--> statement-breakpoint
UPDATE "cancellation_reasons"
SET "name" = CASE "code"
  WHEN 'price' THEN 'Fiyat / Bütçe Yetersiz'
  WHEN 'competitor' THEN 'Rakip Tercih Edildi'
  WHEN 'timing' THEN 'Zamanlama / Yatırım Ertelendi'
  WHEN 'spec' THEN 'Teknik Şartname Karşılanamadı'
  WHEN 'no_budget' THEN 'Bütçe Onayı Çıkmadı'
  WHEN 'other' THEN 'Diğer'
  ELSE "name"
END
WHERE "code" IN ('price', 'competitor', 'timing', 'spec', 'no_budget', 'other')
  AND (trim(coalesce("name", '')) = '' OR "name" = "code");
--> statement-breakpoint
UPDATE "opportunities" AS o
SET
  "lost_company_name" = coalesce(
    o."lost_company_name",
    (SELECT coalesce(c."short_name", c."legal_title") FROM "companies" c WHERE c."id" = o."company_id"),
    o."lead_company_title"
  ),
  "lost_product_name" = coalesce(o."lost_product_name", o."requested_machine", o."title", o."description"),
  "lost_competitor_name" = coalesce(
    o."lost_competitor_name",
    (SELECT c."name" FROM "competitors" c WHERE c."id" = o."lost_competitor_id")
  ),
  "lost_unmet_conditions" = coalesce(o."lost_unmet_conditions", o."qualification_note")
WHERE o."qualification_stage" = 'lost';
