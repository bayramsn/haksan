-- Additive migration: existing products and quote snapshots remain unchanged.
ALTER TABLE "product_models" ADD COLUMN IF NOT EXISTS "technical_configuration" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "laser_technical_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "division_id" uuid NOT NULL REFERENCES "divisions"("id") ON DELETE restrict,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE restrict,
  "product_type_code" varchar(64) NOT NULL,
  "series" varchar(8) NOT NULL,
  "source_model_code" varchar(64) NOT NULL,
  "cabin_type" varchar(16) NOT NULL CHECK ("cabin_type" IN ('open', 'closed')),
  "power_kw" integer NOT NULL CHECK ("power_kw" IN (3, 6, 12, 20, 30)),
  "configuration" jsonb NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "laser_profiles_combination_unique" ON "laser_technical_profiles"
  ("tenant_id", "division_id", "brand_id", "product_type_code", "source_model_code", "cabin_type", "power_kw");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "laser_profiles_scope_idx" ON "laser_technical_profiles" ("tenant_id", "division_id", "brand_id");
--> statement-breakpoint
INSERT INTO "product_subcategories" ("code", "name", "division_id", "category_id", "sort_order")
SELECT 'BORU_PROFIL_LAZER_KESIM', 'Boru/Profil Lazer Kesim', d.id,
  (SELECT c.id FROM product_categories c WHERE c.code = 'TEZGAH' AND (c.division_id = d.id OR c.division_id IS NULL)
   ORDER BY (c.division_id IS NOT NULL) DESC LIMIT 1), 65
FROM divisions d WHERE lower(d.code) = 'sac_isleme' AND d.deleted_at IS NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "product_types" ("code", "name", "division_id", "subcategory_id", "sort_order")
SELECT 'BORU_LAZER_KESIM', 'Boru/Profil Lazer Kesim', s.division_id, s.id, 65
FROM product_subcategories s WHERE s.code = 'BORU_PROFIL_LAZER_KESIM'
ON CONFLICT DO NOTHING;
