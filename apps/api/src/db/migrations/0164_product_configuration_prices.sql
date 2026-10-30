CREATE TABLE IF NOT EXISTS "product_configuration_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "product_model_id" uuid NOT NULL,
  "source_model_code" varchar(64) NOT NULL,
  "price_model_code" varchar(64),
  "power_kw" numeric(5, 1) NOT NULL,
  "cost_price" numeric(18, 4),
  "cost_currency_id" uuid,
  "sale_price" numeric(18, 4),
  "sale_currency_id" uuid,
  "container" varchar(64),
  "lead_time_days" integer,
  "source_revision" varchar(128),
  "source_cell" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_configuration_prices_tenant_fk') THEN
    ALTER TABLE "product_configuration_prices" ADD CONSTRAINT "product_configuration_prices_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_configuration_prices_product_fk') THEN
    ALTER TABLE "product_configuration_prices" ADD CONSTRAINT "product_configuration_prices_product_fk" FOREIGN KEY ("product_model_id") REFERENCES "product_models"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_configuration_prices_cost_currency_fk') THEN
    ALTER TABLE "product_configuration_prices" ADD CONSTRAINT "product_configuration_prices_cost_currency_fk" FOREIGN KEY ("cost_currency_id") REFERENCES "currencies"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_configuration_prices_sale_currency_fk') THEN
    ALTER TABLE "product_configuration_prices" ADD CONSTRAINT "product_configuration_prices_sale_currency_fk" FOREIGN KEY ("sale_currency_id") REFERENCES "currencies"("id");
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_configuration_prices_unique" ON "product_configuration_prices" ("product_model_id", "source_model_code", "power_kw");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_configuration_prices_tenant_idx" ON "product_configuration_prices" ("tenant_id");
