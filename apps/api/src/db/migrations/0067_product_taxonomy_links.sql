-- Ürün taksonomisini birbirine bağla: kategori → ürün grubu, alt kategori → kategori,
-- ürün tipi → alt kategori. Markaları bölüme (departmana) bağla ve teknik bilgi
-- gruplarını ürün tiplerine atanabilir yap.
-- NULL bağlantı → kayıt tüm üstlerde ("Tümü") geçerlidir; mevcut kayıtlar NULL kalır.

-- 1) Üst bağlantı kolonları
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "product_group_id" uuid;--> statement-breakpoint
ALTER TABLE "product_subcategories" ADD COLUMN IF NOT EXISTS "category_id" uuid;--> statement-breakpoint
ALTER TABLE "product_types" ADD COLUMN IF NOT EXISTS "subcategory_id" uuid;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint

-- 2) FK kısıtları (üst kayıt silinirse bağ "Tümü"ye düşsün: ON DELETE SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_categories_product_group_id_product_groups_id_fk') THEN
    ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_group_id_product_groups_id_fk"
      FOREIGN KEY ("product_group_id") REFERENCES "product_groups"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_subcategories_category_id_product_categories_id_fk') THEN
    ALTER TABLE "product_subcategories" ADD CONSTRAINT "product_subcategories_category_id_product_categories_id_fk"
      FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_types_subcategory_id_product_subcategories_id_fk') THEN
    ALTER TABLE "product_types" ADD CONSTRAINT "product_types_subcategory_id_product_subcategories_id_fk"
      FOREIGN KEY ("subcategory_id") REFERENCES "product_subcategories"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brands_division_id_divisions_id_fk') THEN
    ALTER TABLE "brands" ADD CONSTRAINT "brands_division_id_divisions_id_fk"
      FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint

-- 3) İndeksler
CREATE INDEX IF NOT EXISTS "product_categories_product_group_idx" ON "product_categories" ("product_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_subcategories_category_idx" ON "product_subcategories" ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_types_subcategory_idx" ON "product_types" ("subcategory_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brands_division_idx" ON "brands" ("division_id");--> statement-breakpoint

-- 4) Teknik bilgi grubu ↔ ürün tipi ataması (çoktan çoğa).
-- Hiç ataması olmayan grup tüm tiplerde ("Tümü") geçerli sayılır.
CREATE TABLE IF NOT EXISTS "product_spec_group_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "spec_group_id" uuid NOT NULL,
  "product_type_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_spec_group_types_spec_group_id_product_spec_groups_id_fk') THEN
    ALTER TABLE "product_spec_group_types" ADD CONSTRAINT "product_spec_group_types_spec_group_id_product_spec_groups_id_fk"
      FOREIGN KEY ("spec_group_id") REFERENCES "product_spec_groups"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_spec_group_types_product_type_id_product_types_id_fk') THEN
    ALTER TABLE "product_spec_group_types" ADD CONSTRAINT "product_spec_group_types_product_type_id_product_types_id_fk"
      FOREIGN KEY ("product_type_id") REFERENCES "product_types"("id") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_spec_group_types_pair_unique" ON "product_spec_group_types" ("spec_group_id", "product_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_spec_group_types_type_idx" ON "product_spec_group_types" ("product_type_id");
