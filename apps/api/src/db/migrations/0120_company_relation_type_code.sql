DO $$
DECLARE
  canonical_id uuid;
  legacy_id uuid;
BEGIN
  SELECT "id"
  INTO canonical_id
  FROM "company_relation_types"
  WHERE "code" = 'competitor'
  LIMIT 1;

  SELECT "id"
  INTO legacy_id
  FROM "company_relation_types"
  WHERE "code" = 'rakip'
  LIMIT 1;

  IF canonical_id IS NULL AND legacy_id IS NOT NULL THEN
    UPDATE "company_relation_types"
    SET
      "code" = 'competitor',
      "name" = 'Rakip',
      "sort_order" = 40,
      "is_active" = true,
      "updated_at" = now()
    WHERE "id" = legacy_id
    RETURNING "id" INTO canonical_id;
    legacy_id := NULL;
  ELSIF canonical_id IS NULL THEN
    INSERT INTO "company_relation_types" (
      "code",
      "name",
      "sort_order",
      "is_active"
    )
    VALUES ('competitor', 'Rakip', 40, true)
    RETURNING "id" INTO canonical_id;
  END IF;

  IF legacy_id IS NOT NULL AND legacy_id <> canonical_id THEN
    UPDATE "companies"
    SET "relation_type_id" = canonical_id, "updated_at" = now()
    WHERE "relation_type_id" = legacy_id;

    DELETE FROM "company_relation_types"
    WHERE "id" = legacy_id;
  END IF;

  UPDATE "company_relation_types"
  SET
    "name" = 'Rakip',
    "sort_order" = 40,
    "is_active" = true,
    "updated_at" = now()
  WHERE "id" = canonical_id;

  -- Kod sürüklenmesi sırasında PATCH başarılı görünmesine rağmen ilişki tipi
  -- null kalan, fakat rakip kataloğuna bağlanmış firmaları da onar.
  UPDATE "companies" company
  SET "relation_type_id" = canonical_id, "updated_at" = now()
  WHERE company."relation_type_id" IS NULL
    AND company."deleted_at" IS NULL
    AND EXISTS (
      SELECT 1
      FROM "competitors" competitor
      WHERE competitor."company_id" = company."id"
        AND competitor."deleted_at" IS NULL
    );
END
$$;
