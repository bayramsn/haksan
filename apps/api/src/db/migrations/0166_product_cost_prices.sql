CREATE TABLE IF NOT EXISTS "product_cost_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "product_model_id" uuid,
  "option_value_id" uuid,
  "cost_price" numeric(18, 4) NOT NULL,
  "cost_currency_id" uuid NOT NULL,
  "source_revision" varchar(128),
  "source_cell" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "product_cost_prices_one_target" CHECK (("product_model_id" IS NULL) <> ("option_value_id" IS NULL))
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_cost_prices_tenant_fk') THEN
    ALTER TABLE "product_cost_prices" ADD CONSTRAINT "product_cost_prices_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_cost_prices_product_fk') THEN
    ALTER TABLE "product_cost_prices" ADD CONSTRAINT "product_cost_prices_product_fk" FOREIGN KEY ("product_model_id") REFERENCES "product_models"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_cost_prices_option_value_fk') THEN
    ALTER TABLE "product_cost_prices" ADD CONSTRAINT "product_cost_prices_option_value_fk" FOREIGN KEY ("option_value_id") REFERENCES "product_option_values"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_cost_prices_currency_fk') THEN
    ALTER TABLE "product_cost_prices" ADD CONSTRAINT "product_cost_prices_currency_fk" FOREIGN KEY ("cost_currency_id") REFERENCES "currencies"("id");
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_cost_prices_product_unique" ON "product_cost_prices" ("product_model_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_cost_prices_option_value_unique" ON "product_cost_prices" ("option_value_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_cost_prices_tenant_idx" ON "product_cost_prices" ("tenant_id");
