-- Lead, fırsat akışının ilk adımıdır: yeni kartlar burada doğar.
ALTER TABLE "opportunities"
  ALTER COLUMN "qualification_stage" SET DEFAULT 'lead';
--> statement-breakpoint

-- A+ süreç adımlarının elle işaretlenmesi.
--
-- Adımların çoğu kanıttan türetilir (fatura kaydı, sevkiyat, kurulum...), ama
-- A+ alanındaki işlerin bir kısmı CRM dışında yürür (gümrükçü, nakliyeci,
-- saha ekibi). Satışçı bu adımları "yapıldı / yapılmadı" olarak işaretleyip
-- gerekçesini yorum olarak bırakabilsin diye adım başına tek kayıt tutulur.
CREATE TABLE IF NOT EXISTS "opportunity_process_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "opportunity_id" uuid NOT NULL REFERENCES "opportunities"("id") ON DELETE CASCADE,
  "check_key" varchar(64) NOT NULL,
  "status" varchar(16) NOT NULL,
  "note" text,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "opportunity_process_checks_status_check" CHECK ("status" IN ('done', 'not_done'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "opportunity_process_checks_unique"
  ON "opportunity_process_checks" ("opportunity_id", "check_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "opportunity_process_checks_tenant_idx"
  ON "opportunity_process_checks" ("tenant_id");
