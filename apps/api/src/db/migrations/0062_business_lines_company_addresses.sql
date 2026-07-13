-- Additive/expand migration: mevcut kayıt ve belge numaraları korunur.
-- Yeni alanlar önce nullable eklenir, ardından mevcut division_id üzerinden backfill edilir.

CREATE TABLE IF NOT EXISTS "document_sequences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "business_line" varchar(16) NOT NULL,
  "document_type" varchar(32) NOT NULL,
  "year" integer NOT NULL,
  "last_number" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_sequences_tenant_series_unique"
  ON "document_sequences" ("tenant_id", "business_line", "document_type", "year");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_sequences_tenant_year_idx"
  ON "document_sequences" ("tenant_id", "year");
--> statement-breakpoint

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "business_line" varchar(16);
--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN IF NOT EXISTS "business_line" varchar(16);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "business_line" varchar(16);
--> statement-breakpoint
ALTER TABLE "commercial_invoices" ADD COLUMN IF NOT EXISTS "business_line" varchar(16);
--> statement-breakpoint
ALTER TABLE "service_tickets" ADD COLUMN IF NOT EXISTS "business_line" varchar(16);
--> statement-breakpoint

UPDATE "quotes" q
SET "business_line" = CASE d."code"
  WHEN 'cnc' THEN 'CNC'
  WHEN 'universal' THEN 'UNI'
  WHEN 'sac_isleme' THEN 'SACISLE'
  ELSE NULL
END
FROM "divisions" d
WHERE q."division_id" = d."id" AND q."business_line" IS NULL;
--> statement-breakpoint
UPDATE "proformas" p
SET "business_line" = q."business_line"
FROM "quotes" q
WHERE p."quote_id" = q."id" AND p."business_line" IS NULL;
--> statement-breakpoint
UPDATE "contracts" c
SET "business_line" = q."business_line"
FROM "quotes" q
WHERE c."quote_id" = q."id" AND c."business_line" IS NULL;
--> statement-breakpoint
UPDATE "commercial_invoices" i
SET "business_line" = q."business_line"
FROM "quotes" q
WHERE i."quote_id" = q."id" AND i."business_line" IS NULL;
--> statement-breakpoint
UPDATE "service_tickets" s
SET "business_line" = CASE d."code"
  WHEN 'cnc' THEN 'CNC'
  WHEN 'universal' THEN 'UNI'
  WHEN 'sac_isleme' THEN 'SACISLE'
  ELSE NULL
END
FROM "divisions" d
WHERE s."division_id" = d."id" AND s."business_line" IS NULL;
--> statement-breakpoint

-- Division bağı bulunmayan eski kayıtlarda, yalnız yeni seri formatıyla açıkça
-- belirtilmiş iş alanını numaradan geri doldur. Serbest biçimli eski numaralar
-- ve mevcut numaralar değiştirilmez.
UPDATE "quotes"
SET "business_line" = upper(substring("document_no" FROM '^(CNC|UNI|SACISLE)'))
WHERE "business_line" IS NULL AND "document_no" ~* '^(CNC|UNI|SACISLE)(-|/)';
--> statement-breakpoint
UPDATE "proformas"
SET "business_line" = upper(substring("document_no" FROM '^(CNC|UNI|SACISLE)'))
WHERE "business_line" IS NULL AND "document_no" ~* '^(CNC|UNI|SACISLE)(-|/)';
--> statement-breakpoint
UPDATE "contracts"
SET "business_line" = upper(substring("contract_no" FROM '^(CNC|UNI|SACISLE)'))
WHERE "business_line" IS NULL AND "contract_no" ~* '^(CNC|UNI|SACISLE)(-|/)';
--> statement-breakpoint
UPDATE "commercial_invoices"
SET "business_line" = upper(substring("invoice_no" FROM '^(CNC|UNI|SACISLE)'))
WHERE "business_line" IS NULL AND "invoice_no" ~* '^(CNC|UNI|SACISLE)(-|/)';
--> statement-breakpoint
UPDATE "service_tickets"
SET "business_line" = upper(substring("ticket_no" FROM '^(CNC|UNI|SACISLE)'))
WHERE "business_line" IS NULL AND "ticket_no" ~* '^(CNC|UNI|SACISLE)(-|/)';
--> statement-breakpoint

-- Daha önce yeni seri formatında üretilmiş numaralar varsa sayaçları onların
-- maksimumundan başlat. Böylece ilk deploy sonrası 001/0001'e dönüp mevcut
-- kayıtla çakışılmaz; soft-delete kayıtlar da benzersizliği etkilediği için
-- bilinçli olarak hesaba katılır.
WITH parsed_sequences AS (
  SELECT "tenant_id", upper((regexp_match("document_no", '^(CNC|UNI|SACISLE)-([0-9]{4})/([0-9]+)$', 'i'))[1]) AS "business_line",
         'quote'::varchar AS "document_type",
         ((regexp_match("document_no", '^(CNC|UNI|SACISLE)-([0-9]{4})/([0-9]+)$', 'i'))[2])::integer AS "year",
         ((regexp_match("document_no", '^(CNC|UNI|SACISLE)-([0-9]{4})/([0-9]+)$', 'i'))[3])::integer AS "sequence_value"
  FROM "quotes" WHERE "document_no" ~* '^(CNC|UNI|SACISLE)-[0-9]{4}/[0-9]+$'
  UNION ALL
  SELECT "tenant_id", upper((regexp_match("document_no", '^(CNC|UNI|SACISLE)-PRF-([0-9]{4})/([0-9]+)$', 'i'))[1]),
         'proforma'::varchar,
         ((regexp_match("document_no", '^(CNC|UNI|SACISLE)-PRF-([0-9]{4})/([0-9]+)$', 'i'))[2])::integer,
         ((regexp_match("document_no", '^(CNC|UNI|SACISLE)-PRF-([0-9]{4})/([0-9]+)$', 'i'))[3])::integer
  FROM "proformas" WHERE "document_no" ~* '^(CNC|UNI|SACISLE)-PRF-[0-9]{4}/[0-9]+$'
  UNION ALL
  SELECT "tenant_id", upper((regexp_match("contract_no", '^(CNC|UNI|SACISLE)-SOZ-([0-9]{4})/([0-9]+)$', 'i'))[1]),
         'contract'::varchar,
         ((regexp_match("contract_no", '^(CNC|UNI|SACISLE)-SOZ-([0-9]{4})/([0-9]+)$', 'i'))[2])::integer,
         ((regexp_match("contract_no", '^(CNC|UNI|SACISLE)-SOZ-([0-9]{4})/([0-9]+)$', 'i'))[3])::integer
  FROM "contracts" WHERE "contract_no" ~* '^(CNC|UNI|SACISLE)-SOZ-[0-9]{4}/[0-9]+$'
  UNION ALL
  SELECT "tenant_id", upper((regexp_match("invoice_no", '^(CNC|UNI|SACISLE)-FAT-([0-9]{4})/([0-9]+)$', 'i'))[1]),
         'commercial_invoice'::varchar,
         ((regexp_match("invoice_no", '^(CNC|UNI|SACISLE)-FAT-([0-9]{4})/([0-9]+)$', 'i'))[2])::integer,
         ((regexp_match("invoice_no", '^(CNC|UNI|SACISLE)-FAT-([0-9]{4})/([0-9]+)$', 'i'))[3])::integer
  FROM "commercial_invoices" WHERE "invoice_no" ~* '^(CNC|UNI|SACISLE)-FAT-[0-9]{4}/[0-9]+$'
  UNION ALL
  SELECT "tenant_id", upper((regexp_match("ticket_no", '^(CNC|UNI|SACISLE)-SRV-([0-9]{4})/([0-9]+)$', 'i'))[1]),
         'service'::varchar,
         ((regexp_match("ticket_no", '^(CNC|UNI|SACISLE)-SRV-([0-9]{4})/([0-9]+)$', 'i'))[2])::integer,
         ((regexp_match("ticket_no", '^(CNC|UNI|SACISLE)-SRV-([0-9]{4})/([0-9]+)$', 'i'))[3])::integer
  FROM "service_tickets" WHERE "ticket_no" ~* '^(CNC|UNI|SACISLE)-SRV-[0-9]{4}/[0-9]+$'
), sequence_maxima AS (
  SELECT "tenant_id", "business_line", "document_type", "year", max("sequence_value") AS "last_number"
  FROM parsed_sequences
  GROUP BY "tenant_id", "business_line", "document_type", "year"
)
INSERT INTO "document_sequences" ("tenant_id", "business_line", "document_type", "year", "last_number")
SELECT "tenant_id", "business_line", "document_type", "year", "last_number"
FROM sequence_maxima
ON CONFLICT ("tenant_id", "business_line", "document_type", "year") DO UPDATE
SET "last_number" = greatest("document_sequences"."last_number", EXCLUDED."last_number"),
    "updated_at" = now();
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "quotes_tenant_business_line_idx" ON "quotes" ("tenant_id", "business_line");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proformas_tenant_business_line_idx" ON "proformas" ("tenant_id", "business_line");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_tenant_business_line_idx" ON "contracts" ("tenant_id", "business_line");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commercial_invoices_tenant_business_line_idx" ON "commercial_invoices" ("tenant_id", "business_line");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_tickets_tenant_business_line_idx" ON "service_tickets" ("tenant_id", "business_line");
--> statement-breakpoint

-- Eski tekli company_group_id alanı korunur; yeni çoklu bağ tablosu ondan doldurulur.
CREATE TABLE IF NOT EXISTS "company_group_assignments" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "company_group_id" uuid NOT NULL REFERENCES "company_groups"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "company_group_assignments_company_group_pk" PRIMARY KEY ("company_id", "company_group_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_group_assignments_tenant_idx" ON "company_group_assignments" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_group_assignments_group_idx" ON "company_group_assignments" ("company_group_id");
--> statement-breakpoint
INSERT INTO "company_group_assignments" ("tenant_id", "company_id", "company_group_id")
SELECT "tenant_id", "id", "company_group_id"
FROM "companies"
WHERE "company_group_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Sevkiyat, seçilen firma adresini FK + değişmez metin snapshot olarak saklar.
ALTER TABLE "shipments"
  ADD COLUMN IF NOT EXISTS "delivery_address_id" uuid REFERENCES "company_addresses"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "delivery_address_snapshot" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_delivery_address_idx" ON "shipments" ("delivery_address_id");
