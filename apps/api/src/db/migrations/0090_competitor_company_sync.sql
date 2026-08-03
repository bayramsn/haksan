ALTER TABLE "competitors"
  ADD COLUMN IF NOT EXISTS "company_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "pg_constraint"
    WHERE "conname" = 'competitors_company_id_companies_id_fk'
      AND "conrelid" = 'competitors'::regclass
  ) THEN
    ALTER TABLE "competitors"
      ADD CONSTRAINT "competitors_company_id_companies_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL;
  END IF;
END
$$;
--> statement-breakpoint
WITH "candidate_matches" AS (
  SELECT
    competitor."id" AS "competitor_id",
    company."id" AS "company_id",
    row_number() OVER (
      PARTITION BY company."id"
      ORDER BY competitor."created_at", competitor."id"
    ) AS "company_rank",
    row_number() OVER (
      PARTITION BY competitor."id"
      ORDER BY company."created_at", company."id"
    ) AS "competitor_rank"
  FROM "companies" company
  INNER JOIN "company_relation_types" relation_type
    ON relation_type."id" = company."relation_type_id"
   AND relation_type."code" = 'competitor'
  INNER JOIN "competitors" competitor
    ON competitor."tenant_id" = company."tenant_id"
   AND lower(trim(competitor."name")) = lower(trim(coalesce(nullif(trim(company."short_name"), ''), company."legal_title")))
   AND competitor."deleted_at" IS NULL
   AND competitor."company_id" IS NULL
  WHERE company."deleted_at" IS NULL
)
UPDATE "competitors" competitor
SET "company_id" = candidate."company_id", "updated_at" = now()
FROM "candidate_matches" candidate
WHERE competitor."id" = candidate."competitor_id"
  AND candidate."company_rank" = 1
  AND candidate."competitor_rank" = 1;
--> statement-breakpoint
INSERT INTO "competitors" ("tenant_id", "company_id", "name", "website", "notes")
SELECT
  company."tenant_id",
  company."id",
  coalesce(nullif(trim(company."short_name"), ''), company."legal_title"),
  company."website",
  company."notes"
FROM "companies" company
INNER JOIN "company_relation_types" relation_type
  ON relation_type."id" = company."relation_type_id"
 AND relation_type."code" = 'competitor'
WHERE company."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "competitors" competitor
    WHERE competitor."tenant_id" = company."tenant_id"
      AND competitor."company_id" = company."id"
      AND competitor."deleted_at" IS NULL
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "competitors_company_alive_unique"
  ON "competitors" ("tenant_id", "company_id")
  WHERE "deleted_at" IS NULL AND "company_id" IS NOT NULL;
