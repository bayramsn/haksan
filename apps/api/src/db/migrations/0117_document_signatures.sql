-- Belge imzaları: proforma/teklif/sözleşme çıktısına basılan ad + ünvan + imza görseli.
--
-- Bugüne kadar imza görseli yazdırma şablonuna gömülüydü (proje ilgilisi adı
-- "raif şentürk" ise sabit bir jpg basılıyordu). Bu tablo o gömülü kuralı
-- kiracı başına tanımlanabilir kayıtlara çevirir.
--
-- GÜVENLİK NOTU: imza görseli yazdırma penceresinden auth çerezi olmadan
-- çekilir, bu yüzden dosya `erp-signatures` bucket'ında `visibility='public'`
-- olarak durur ve yalnızca canlı bir imza kaydına bağlıysa sunulur
-- (bkz. signature-media.service.ts). Bucket'ın kendisi anonim erişime kapalıdır.
CREATE TABLE IF NOT EXISTS "signatures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  -- NULL = "Tümü": bölüm ayrımı olmayan, her bölümün kullanabileceği imza.
  -- Dolu ise imza yalnızca o bölümün belgelerinde seçilebilir.
  "division_id" uuid,
  "name" varchar(255) NOT NULL,
  "title" varchar(255) NOT NULL,
  -- İmza görseli. Görsel zorunlu değildir; yalnız ad + ünvan basan imza da geçerlidir.
  "file_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- Yumuşak silme: geçmiş belgeler snapshot'larında kendi imzalarını taşıdığı
  -- için silinen imza eski çıktıları bozmaz.
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
-- ADD CONSTRAINT idempotent değildir; tekrar çalıştırmada patlamasın diye
-- pg_constraint kontrolüyle sarılır (0099'daki desen).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signatures_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "signatures"
      ADD CONSTRAINT "signatures_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signatures_division_id_divisions_id_fk') THEN
    ALTER TABLE "signatures"
      ADD CONSTRAINT "signatures_division_id_divisions_id_fk"
      FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  -- Dosya kaydı silinirse imza metinsel olarak (ad + ünvan) yaşamaya devam eder.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signatures_file_id_files_id_fk') THEN
    ALTER TABLE "signatures"
      ADD CONSTRAINT "signatures_file_id_files_id_fk"
      FOREIGN KEY ("file_id") REFERENCES "public"."files"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signatures_created_by_users_id_fk') THEN
    ALTER TABLE "signatures"
      ADD CONSTRAINT "signatures_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
-- Tablo yeni ve boş; indeksler kilit maliyeti olmadan kurulur.
CREATE INDEX IF NOT EXISTS "signatures_tenant_idx" ON "signatures" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signatures_tenant_division_idx" ON "signatures" USING btree ("tenant_id", "division_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signatures_file_idx" ON "signatures" USING btree ("file_id");
--> statement-breakpoint
-- Belge → imza bağı. Hepsi nullable ve varsayılansız: mevcut satırlar NULL alır,
-- tablo yeniden yazılmaz (PG11+ metadata-only ADD COLUMN), NOT NULL/CHECK ihlali doğmaz.
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signature_id" uuid;
--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN IF NOT EXISTS "signature_id" uuid;
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "signature_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  -- ON DELETE SET NULL: basılan imza zaten document_snapshot içinde saklandığı
  -- için canlı işaretçinin kaybı geçmiş belgeyi bozmaz; buna karşılık silme
  -- işlemi RESTRICT ile kilitlenmez.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_signature_id_signatures_id_fk') THEN
    ALTER TABLE "quotes"
      ADD CONSTRAINT "quotes_signature_id_signatures_id_fk"
      FOREIGN KEY ("signature_id") REFERENCES "public"."signatures"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proformas_signature_id_signatures_id_fk') THEN
    ALTER TABLE "proformas"
      ADD CONSTRAINT "proformas_signature_id_signatures_id_fk"
      FOREIGN KEY ("signature_id") REFERENCES "public"."signatures"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_signature_id_signatures_id_fk') THEN
    ALTER TABLE "contracts"
      ADD CONSTRAINT "contracts_signature_id_signatures_id_fk"
      FOREIGN KEY ("signature_id") REFERENCES "public"."signatures"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
-- ON DELETE SET NULL, imza silindiğinde referans veren satırların bulunmasını
-- gerektirir. Kısmi indeks kullanılır: mevcut belgelerin neredeyse tamamında
-- signature_id NULL olduğu için indeks küçük kalır, "imzalı belgeler" sorgusu
-- da aynı indeksten karşılanır.
CREATE INDEX IF NOT EXISTS "quotes_signature_idx" ON "quotes" USING btree ("signature_id") WHERE "signature_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proformas_signature_idx" ON "proformas" USING btree ("signature_id") WHERE "signature_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_signature_idx" ON "contracts" USING btree ("signature_id") WHERE "signature_id" IS NOT NULL;
--> statement-breakpoint
-- İmza görselinin file_links kaydında kullandığı doküman türü (0099'daki
-- brand_logo deseni). Kod sabiti: packages/shared FILE_DOCUMENT_TYPES.
INSERT INTO "file_document_types" ("code", "name", "sort_order", "is_active")
VALUES ('signature', 'İmza Görseli', 18, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true;
