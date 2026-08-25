-- Referanslar sayfası artık statik dizi yerine bu tablodan besleniyor; kayıtlar
-- CRM'de firma/stok karşılığı olmayan eski teslimatları da tutabilsin diye serbest metin.
CREATE TABLE IF NOT EXISTS "company_references" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "firm" varchar(255) NOT NULL,
  "contact" varchar(255),
  "district" varchar(128),
  "city" varchar(128),
  "brand" varchar(128),
  "model" varchar(128),
  "delivery_date" timestamp with time zone,
  "notes" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "company_references_tenant_idx" ON "company_references" ("tenant_id");
CREATE INDEX IF NOT EXISTS "company_references_delivery_date_idx" ON "company_references" ("delivery_date");
