-- Fırsat takibi firma bazlıdır: bir firmanın tek fırsatında birden çok makine
-- konuşulabilir. `opportunities.requested_machine` tek metin alanı olarak
-- kalıyor (rapor/PDF/hazırlık kontrolleri onu okuyor) ve listenin ilk satırıyla
-- eşitleniyor; liste burada tutulur.
CREATE TABLE IF NOT EXISTS "opportunity_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "opportunity_id" uuid NOT NULL REFERENCES "opportunities"("id") ON DELETE cascade,
  -- Katalogdan seçilmeyen (henüz kaydı olmayan) makineler için serbest ad.
  "product_model_id" uuid REFERENCES "product_models"("id") ON DELETE set null,
  "machine_name" varchar(255) NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "note" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_products_opportunity_idx" ON "opportunity_products" ("opportunity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_products_tenant_idx" ON "opportunity_products" ("tenant_id");
--> statement-breakpoint
-- Mevcut tek makine kayıtları listenin ilk satırına taşınır; veri kaybolmaz.
INSERT INTO "opportunity_products" ("tenant_id", "opportunity_id", "machine_name", "sort_order")
SELECT o."tenant_id", o."id", btrim(o."requested_machine"), 0
FROM "opportunities" o
WHERE o."requested_machine" IS NOT NULL
  AND btrim(o."requested_machine") <> ''
  AND o."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "opportunity_products" p WHERE p."opportunity_id" = o."id"
  );
