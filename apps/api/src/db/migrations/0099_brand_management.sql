ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "is_owned" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "company_id" uuid;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "logo_file_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brands_company_id_companies_id_fk'
  ) THEN
    ALTER TABLE "brands"
      ADD CONSTRAINT "brands_company_id_companies_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brands_logo_file_id_files_id_fk'
  ) THEN
    ALTER TABLE "brands"
      ADD CONSTRAINT "brands_logo_file_id_files_id_fk"
      FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brands_company_idx" ON "brands" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brands_logo_file_idx" ON "brands" USING btree ("logo_file_id");
--> statement-breakpoint
INSERT INTO "file_document_types" ("code", "name", "sort_order", "is_active")
VALUES ('brand_logo', 'Marka Logosu', 16, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true;
--> statement-breakpoint
UPDATE "brands"
SET "is_owned" = true, "company_id" = NULL
WHERE upper(trim("name")) IN ('HAXAN', 'HAKSAN');
--> statement-breakpoint
UPDATE "brands" AS b
SET "company_id" = c."id", "is_owned" = false
FROM "companies" AS c
JOIN "company_relation_types" AS rt ON rt."id" = c."relation_type_id"
WHERE b."tenant_id" = c."tenant_id"
  AND b."company_id" IS NULL
  AND b."is_owned" = false
  AND b."deleted_at" IS NULL
  AND c."deleted_at" IS NULL
  AND rt."code" IN ('customer', 'supplier_customer')
  AND regexp_replace(lower(trim(b."name")), '[^[:alnum:]]', '', 'g')
      = regexp_replace(lower(trim(coalesce(c."short_name", c."legal_title"))), '[^[:alnum:]]', '', 'g');
