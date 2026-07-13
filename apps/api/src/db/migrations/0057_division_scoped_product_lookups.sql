-- Ürünle ilgili lookup listelerini (grup/kategori/alt kategori/tip/teknik grup) ve
-- teknik bilgi şablonlarını bölüme (CNC / Üniversal / Sac İşleme) göre ayrılabilir yap.
-- division_id NULL → kayıt tüm bölümlerde ("Tümü") geçerlidir. Mevcut kayıtlar NULL kalır.

-- 1) Bölüm kolonları
ALTER TABLE "product_groups" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "product_subcategories" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "product_types" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "product_spec_groups" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "product_spec_templates" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint

-- 2) FK kısıtları (bölüm silinirse kayıt "Tümü"ye düşsün: ON DELETE SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_groups_division_id_divisions_id_fk') THEN
    ALTER TABLE "product_groups" ADD CONSTRAINT "product_groups_division_id_divisions_id_fk"
      FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_categories_division_id_divisions_id_fk') THEN
    ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_division_id_divisions_id_fk"
      FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_subcategories_division_id_divisions_id_fk') THEN
    ALTER TABLE "product_subcategories" ADD CONSTRAINT "product_subcategories_division_id_divisions_id_fk"
      FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_types_division_id_divisions_id_fk') THEN
    ALTER TABLE "product_types" ADD CONSTRAINT "product_types_division_id_divisions_id_fk"
      FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_spec_groups_division_id_divisions_id_fk') THEN
    ALTER TABLE "product_spec_groups" ADD CONSTRAINT "product_spec_groups_division_id_divisions_id_fk"
      FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_spec_templates_division_id_divisions_id_fk') THEN
    ALTER TABLE "product_spec_templates" ADD CONSTRAINT "product_spec_templates_division_id_divisions_id_fk"
      FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint

-- 3) Kod tekliğini (bölüm, code) bazına taşı. NULL bölümler coalesce sentinel'i ile de tekildir.
DROP INDEX IF EXISTS "product_groups_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_groups_division_code_unique"
  ON "product_groups" (coalesce("division_id", '00000000-0000-0000-0000-000000000000'::uuid), "code");--> statement-breakpoint
DROP INDEX IF EXISTS "product_categories_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_categories_division_code_unique"
  ON "product_categories" (coalesce("division_id", '00000000-0000-0000-0000-000000000000'::uuid), "code");--> statement-breakpoint
DROP INDEX IF EXISTS "product_subcategories_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_subcategories_division_code_unique"
  ON "product_subcategories" (coalesce("division_id", '00000000-0000-0000-0000-000000000000'::uuid), "code");--> statement-breakpoint
DROP INDEX IF EXISTS "product_types_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_types_division_code_unique"
  ON "product_types" (coalesce("division_id", '00000000-0000-0000-0000-000000000000'::uuid), "code");--> statement-breakpoint
DROP INDEX IF EXISTS "product_spec_groups_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_spec_groups_division_code_unique"
  ON "product_spec_groups" (coalesce("division_id", '00000000-0000-0000-0000-000000000000'::uuid), "code");--> statement-breakpoint

-- 4) Teknik bilgi şablonu tekliği: (bölüm, tip, alan)
DROP INDEX IF EXISTS "product_spec_templates_product_type_key_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_spec_templates_division_type_key_unique"
  ON "product_spec_templates" (coalesce("division_id", '00000000-0000-0000-0000-000000000000'::uuid), "product_type_code", "spec_key");
