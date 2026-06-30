ALTER TABLE "product_models" ADD COLUMN IF NOT EXISTS "sub_brand" varchar(128);--> statement-breakpoint
ALTER TABLE "product_models" ADD COLUMN IF NOT EXISTS "supplier_company_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_models_supplier_company_id_companies_id_fk'
  ) THEN
    ALTER TABLE "product_models" ADD CONSTRAINT "product_models_supplier_company_id_companies_id_fk" FOREIGN KEY ("supplier_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_models_supplier_idx" ON "product_models" USING btree ("supplier_company_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "product_optional_equipment_compatibilities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "product_model_id" uuid NOT NULL,
  "product_group_id" uuid,
  "category_id" uuid,
  "subcategory_id" uuid,
  "product_type_id" uuid,
  "brand_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "product_optional_equipment_compat_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "product_optional_equipment_compat_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "product_optional_equipment_compat_product_group_id_product_groups_id_fk" FOREIGN KEY ("product_group_id") REFERENCES "public"."product_groups"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "product_optional_equipment_compat_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "product_optional_equipment_compat_subcategory_id_product_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."product_subcategories"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "product_optional_equipment_compat_product_type_id_product_types_id_fk" FOREIGN KEY ("product_type_id") REFERENCES "public"."product_types"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "product_optional_equipment_compat_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_optional_equipment_compat_tenant_idx" ON "product_optional_equipment_compatibilities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_optional_equipment_compat_product_idx" ON "product_optional_equipment_compatibilities" USING btree ("product_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_optional_equipment_compat_group_idx" ON "product_optional_equipment_compatibilities" USING btree ("product_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_optional_equipment_compat_category_idx" ON "product_optional_equipment_compatibilities" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_optional_equipment_compat_subcategory_idx" ON "product_optional_equipment_compatibilities" USING btree ("subcategory_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_optional_equipment_compat_type_idx" ON "product_optional_equipment_compatibilities" USING btree ("product_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_optional_equipment_compat_brand_idx" ON "product_optional_equipment_compatibilities" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_optional_equipment_compat_product_group_unique" ON "product_optional_equipment_compatibilities" ("product_model_id","product_group_id") WHERE "product_group_id" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_optional_equipment_compat_category_unique" ON "product_optional_equipment_compatibilities" ("product_model_id","category_id") WHERE "category_id" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_optional_equipment_compat_subcategory_unique" ON "product_optional_equipment_compatibilities" ("product_model_id","subcategory_id") WHERE "subcategory_id" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_optional_equipment_compat_type_unique" ON "product_optional_equipment_compatibilities" ("product_model_id","product_type_id") WHERE "product_type_id" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_optional_equipment_compat_brand_unique" ON "product_optional_equipment_compatibilities" ("product_model_id","brand_id") WHERE "brand_id" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "header_discount_amount" numeric(18,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "header_discount_percent" numeric(6,2) DEFAULT '0' NOT NULL;
