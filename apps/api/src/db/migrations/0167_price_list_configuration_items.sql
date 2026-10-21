-- Fiyat listesinin baz kart model × güç satırları (ör. lazer CIF / millileştirilmiş listeler).
-- cost_formula: listeyi tedarikçi maliyetinden üreten parametreler (laserCostFormulaSchema).
ALTER TABLE "price_lists" ADD COLUMN IF NOT EXISTS "cost_formula" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_list_configuration_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "price_list_id" uuid NOT NULL,
  "configuration_price_id" uuid NOT NULL,
  "list_price" numeric(18, 4) NOT NULL,
  "cash_price" numeric(18, 4) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_list_configuration_items_tenant_fk') THEN
    ALTER TABLE "price_list_configuration_items" ADD CONSTRAINT "price_list_configuration_items_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_list_configuration_items_list_fk') THEN
    ALTER TABLE "price_list_configuration_items" ADD CONSTRAINT "price_list_configuration_items_list_fk" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_list_configuration_items_configuration_fk') THEN
    ALTER TABLE "price_list_configuration_items" ADD CONSTRAINT "price_list_configuration_items_configuration_fk" FOREIGN KEY ("configuration_price_id") REFERENCES "product_configuration_prices"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_list_configuration_items_unique" ON "price_list_configuration_items" ("price_list_id", "configuration_price_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_list_configuration_items_configuration_idx" ON "price_list_configuration_items" ("configuration_price_id");
