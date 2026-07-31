UPDATE "brands" AS b
SET "company_id" = NULL
FROM "companies" AS c
JOIN "company_relation_types" AS rt ON rt."id" = c."relation_type_id"
WHERE b."company_id" = c."id"
  AND b."is_owned" = false
  AND rt."code" = 'customer';
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
  AND rt."code" IN ('supplier', 'supplier_customer')
  AND regexp_replace(lower(trim(b."name")), '[^[:alnum:]]', '', 'g')
      = regexp_replace(lower(trim(coalesce(c."short_name", c."legal_title"))), '[^[:alnum:]]', '', 'g');
