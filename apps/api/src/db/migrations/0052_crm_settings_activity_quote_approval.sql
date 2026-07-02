CREATE TABLE IF NOT EXISTS "company_sectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "company_sectors_code_unique"
  ON "company_sectors" USING btree ("code");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tax_offices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "province" varchar(64) DEFAULT '' NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "tax_offices_code_unique"
  ON "tax_offices" USING btree ("code");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tax_offices_province_idx"
  ON "tax_offices" USING btree ("province");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "product_spec_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_type_code" varchar(64) NOT NULL,
  "spec_key" varchar(255) NOT NULL,
  "default_value" text,
  "spec_unit" varchar(64),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "product_spec_templates_product_type_idx"
  ON "product_spec_templates" USING btree ("product_type_code");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "product_spec_templates_product_type_key_unique"
  ON "product_spec_templates" USING btree ("product_type_code", "spec_key");--> statement-breakpoint

ALTER TABLE "quote_items"
  ADD COLUMN IF NOT EXISTS "stock_code" varchar(64);--> statement-breakpoint

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "price_approval_status" varchar(32) DEFAULT 'not_required' NOT NULL,
  ADD COLUMN IF NOT EXISTS "price_approval_requested_by" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "price_approval_requested_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "price_approved_by" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "price_approved_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "price_rejected_by" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "price_rejected_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "price_approval_note" text;--> statement-breakpoint

INSERT INTO "quote_statuses" ("code", "name", "sort_order")
VALUES ('pending_super_admin_approval', 'Süper Admin Onayı Bekliyor', 60)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "sort_order" = EXCLUDED."sort_order";--> statement-breakpoint

INSERT INTO "file_document_types" ("code", "name", "sort_order")
VALUES
  ('activity_document', 'Aktivite Dosyası', 80),
  ('service_complaint_evidence', 'Servis Şikayet Kanıtı', 85)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "sort_order" = EXCLUDED."sort_order";--> statement-breakpoint

INSERT INTO "company_sectors" ("code", "name", "sort_order")
VALUES
  ('kalip', 'Kalıp', 10),
  ('otomotiv', 'Otomotiv', 20),
  ('makine_imalat', 'Makine İmalat', 30),
  ('plastik', 'Plastik', 40),
  ('metal_isleme', 'Metal İşleme', 50),
  ('savunma', 'Savunma', 60),
  ('havacilik', 'Havacılık', 70),
  ('egitim', 'Eğitim', 80),
  ('diger', 'Diğer', 90)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "sort_order" = EXCLUDED."sort_order";--> statement-breakpoint

INSERT INTO "tax_offices" ("code", "name", "province", "sort_order")
VALUES
  ('bursa_nilufer', 'Nilüfer Vergi Dairesi', 'Bursa', 10),
  ('bursa_osmangazi', 'Osmangazi Vergi Dairesi', 'Bursa', 20),
  ('bursa_yildirim', 'Yıldırım Vergi Dairesi', 'Bursa', 30),
  ('istanbul_avcilar', 'Avcılar Vergi Dairesi', 'İstanbul', 40),
  ('istanbul_beylikduzu', 'Beylikdüzü Vergi Dairesi', 'İstanbul', 50),
  ('istanbul_kadikoy', 'Kadıköy Vergi Dairesi', 'İstanbul', 60),
  ('istanbul_pendik', 'Pendik Vergi Dairesi', 'İstanbul', 70),
  ('kocaeli_izmit', 'İzmit Vergi Dairesi', 'Kocaeli', 80),
  ('ankara_baskent', 'Başkent Vergi Dairesi', 'Ankara', 90),
  ('izmir_konak', 'Konak Vergi Dairesi', 'İzmir', 100)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "province" = EXCLUDED."province", "sort_order" = EXCLUDED."sort_order";--> statement-breakpoint

INSERT INTO "product_spec_templates" ("product_type_code", "spec_key", "default_value", "spec_unit", "sort_order")
VALUES
  ('DIK_ISLEME_MERKEZI', 'X Ekseni Hareketi', '', 'mm', 10),
  ('DIK_ISLEME_MERKEZI', 'Y Ekseni Hareketi', '', 'mm', 20),
  ('DIK_ISLEME_MERKEZI', 'Z Ekseni Hareketi', '', 'mm', 30),
  ('DIK_ISLEME_MERKEZI', 'Kontrol Ünitesi', '', NULL, 40),
  ('DIK_ISLEME_MERKEZI', 'Spindle Devri', '', 'rpm', 50),
  ('CNC_TORNA', 'Ayna Çapı', '', 'inch', 10),
  ('CNC_TORNA', 'Torna Çapı', '', 'mm', 20),
  ('CNC_TORNA', 'Torna Boyu', '', 'mm', 30),
  ('CNC_TORNA', 'Kontrol Ünitesi', '', NULL, 40),
  ('CNC_TORNA', 'Spindle Devri', '', 'rpm', 50),
  ('YATAY_ISLEME_MERKEZI', 'Palet Ölçüsü', '', 'mm', 10),
  ('YATAY_ISLEME_MERKEZI', 'Kontrol Ünitesi', '', NULL, 20),
  ('YATAY_ISLEME_MERKEZI', 'Spindle Devri', '', 'rpm', 30),
  ('KOPRU_TIPI_ISLEME_MERKEZI', 'Tabla Ölçüsü', '', 'mm', 10),
  ('KOPRU_TIPI_ISLEME_MERKEZI', 'X Ekseni Hareketi', '', 'mm', 20),
  ('KOPRU_TIPI_ISLEME_MERKEZI', 'Y Ekseni Hareketi', '', 'mm', 30),
  ('KOPRU_TIPI_ISLEME_MERKEZI', 'Z Ekseni Hareketi', '', 'mm', 40),
  ('KOPRU_TIPI_ISLEME_MERKEZI', 'Kontrol Ünitesi', '', NULL, 50)
ON CONFLICT ("product_type_code", "spec_key") DO UPDATE
SET
  "default_value" = EXCLUDED."default_value",
  "spec_unit" = EXCLUDED."spec_unit",
  "sort_order" = EXCLUDED."sort_order";--> statement-breakpoint
