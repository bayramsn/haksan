ALTER TABLE "product_models" ADD COLUMN IF NOT EXISTS "compatible_machine_type_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_models_compatible_machine_type_id_product_types_id_fk'
  ) THEN
    ALTER TABLE "product_models" ADD CONSTRAINT "product_models_compatible_machine_type_id_product_types_id_fk" FOREIGN KEY ("compatible_machine_type_id") REFERENCES "public"."product_types"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_models_compatible_machine_type_idx" ON "product_models" USING btree ("tenant_id","category_id","compatible_machine_type_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_alternatives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "product_model_id" uuid NOT NULL,
  "alternative_product_model_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "product_alternatives_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "product_alternatives_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "product_alternatives_alternative_product_model_id_product_models_id_fk" FOREIGN KEY ("alternative_product_model_id") REFERENCES "public"."product_models"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_alternatives_tenant_idx" ON "product_alternatives" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_alternatives_product_idx" ON "product_alternatives" USING btree ("product_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_alternatives_alternative_idx" ON "product_alternatives" USING btree ("alternative_product_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_alternatives_product_alternative_unique" ON "product_alternatives" USING btree ("product_model_id","alternative_product_model_id");--> statement-breakpoint
INSERT INTO "product_alternatives" ("tenant_id", "product_model_id", "alternative_product_model_id")
SELECT p."tenant_id", p."id", p."muadil_product_id"
FROM "product_models" p
JOIN "product_models" alt ON alt."id" = p."muadil_product_id" AND alt."tenant_id" = p."tenant_id"
WHERE p."muadil_product_id" IS NOT NULL
  AND p."deleted_at" IS NULL
  AND alt."deleted_at" IS NULL
  AND p."id" <> p."muadil_product_id"
ON CONFLICT DO NOTHING;
