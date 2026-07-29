-- Lead/fırsat süreç yönetimi: takip SLA sayaçları ve eleme nedeni.
-- Aşama yaşı için yeni kolon açılmaz; mevcut "qualification_updated_at" yalnız
-- satış derecesi değiştiğinde yazıldığı için zaten "aşamaya giriş zamanı"dır.

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "lead_status_updated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "contact_attempt_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "first_contact_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "disqualify_reason_id" uuid;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_disqualify_reason_id_cancellation_reasons_id_fk'
  ) THEN
    ALTER TABLE "opportunities"
      ADD CONSTRAINT "opportunities_disqualify_reason_id_cancellation_reasons_id_fk"
      FOREIGN KEY ("disqualify_reason_id") REFERENCES "public"."cancellation_reasons"("id") ON DELETE set null;
  END IF;
END $$;--> statement-breakpoint

-- Mevcut kayıtlar için SLA saatini geriye dönük başlat. Aksi halde tüm eski
-- lead'ler "0 gündür bu durumda" görünür ve ilk cron çalışmasında sessiz kalır.
UPDATE "opportunities"
SET "lead_status_updated_at" = COALESCE("qualification_updated_at", "updated_at", "created_at")
WHERE "lead_status_updated_at" IS NULL;--> statement-breakpoint

-- Temas kurulmuş durumdaki eski lead'lerde ilk temas anı bilinmiyor; en yakın
-- güvenli tahmin son güncelleme zamanıdır. Yalnız gerçekten temas edilmiş
-- durumlar doldurulur ki "speed-to-lead" ortalaması şişmesin.
UPDATE "opportunities"
SET "first_contact_at" = COALESCE("updated_at", "created_at")
WHERE "first_contact_at" IS NULL
  AND "lead_follow_up_status" IN ('contacted', 'waiting');--> statement-breakpoint

UPDATE "opportunities"
SET "contact_attempt_count" = 1
WHERE "contact_attempt_count" = 0
  AND "lead_follow_up_status" IN ('attempting', 'contacted', 'waiting');--> statement-breakpoint

-- Çürüyen kart taraması: tenant içinde aşama + aşamaya giriş zamanına göre.
CREATE INDEX IF NOT EXISTS "opportunities_qualification_age_idx"
  ON "opportunities" USING btree ("tenant_id", "qualification_stage", "qualification_updated_at");--> statement-breakpoint

-- Lead SLA taraması: tenant içinde takip durumu + duruma giriş zamanına göre.
CREATE INDEX IF NOT EXISTS "opportunities_lead_status_age_idx"
  ON "opportunities" USING btree ("tenant_id", "lead_follow_up_status", "lead_status_updated_at");
