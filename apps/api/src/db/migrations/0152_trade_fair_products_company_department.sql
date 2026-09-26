-- Fuar görüşmesinde ilgilenilen CRM ürünleri (birden çok, isteğe bağlı),
-- kaydın Firmalar'a eklendiğinde bağlandığı firma/kontak ve görüşmenin
-- departmanı. Departman yeni kayıtta zorunlu (API şeması); kolon eski kayıtlar
-- için boş kalabilir.
CREATE TABLE IF NOT EXISTS "trade_fair_contact_products" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "trade_fair_contact_id" uuid NOT NULL REFERENCES "trade_fair_contacts"("id") ON DELETE CASCADE,
  "product_model_id" uuid NOT NULL REFERENCES "product_models"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trade_fair_contact_products_pk" PRIMARY KEY ("trade_fair_contact_id", "product_model_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_fair_contact_products_product_idx" ON "trade_fair_contact_products" ("product_model_id");
--> statement-breakpoint
ALTER TABLE "trade_fair_contacts" ADD COLUMN IF NOT EXISTS "company_id" uuid;
--> statement-breakpoint
ALTER TABLE "trade_fair_contacts" ADD COLUMN IF NOT EXISTS "contact_id" uuid;
--> statement-breakpoint
ALTER TABLE "trade_fair_contacts" ADD COLUMN IF NOT EXISTS "department_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trade_fair_contacts_company_id_fk') THEN
    ALTER TABLE "trade_fair_contacts"
      ADD CONSTRAINT "trade_fair_contacts_company_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trade_fair_contacts_contact_id_fk') THEN
    ALTER TABLE "trade_fair_contacts"
      ADD CONSTRAINT "trade_fair_contacts_contact_id_fk"
      FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trade_fair_contacts_department_id_fk') THEN
    ALTER TABLE "trade_fair_contacts"
      ADD CONSTRAINT "trade_fair_contacts_department_id_fk"
      FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_fair_contacts_company_idx" ON "trade_fair_contacts" ("company_id");
CREATE INDEX IF NOT EXISTS "trade_fair_contacts_department_idx" ON "trade_fair_contacts" ("department_id");
