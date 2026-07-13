-- Production migration geçmişinde 0059 atlanıp 0060 uygulanmış kurulumları da
-- güvenle ileri taşır. Tüm işlemler idempotent ve ekleyicidir; eski kişi
-- alanları korunur, veri anonimleştirme/silme yapılmaz.

ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "upload_status" varchar(16) NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "uploaded_at" timestamp with time zone;--> statement-breakpoint
UPDATE "files"
SET "upload_status" = CASE
      WHEN EXISTS (SELECT 1 FROM "file_links" fl WHERE fl."file_id" = "files"."id") THEN 'linked'
      ELSE 'uploaded'
    END,
    "uploaded_at" = COALESCE("uploaded_at", "created_at")
WHERE "deleted_at" IS NULL
  AND (
    "visibility" = 'public'
    OR EXISTS (SELECT 1 FROM "file_links" fl WHERE fl."file_id" = "files"."id")
  );--> statement-breakpoint

ALTER TABLE "service_complaint_links" ADD COLUMN IF NOT EXISTS "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
-- Eski deterministik bearer URL'leri süresiz bırakılmaz; yetkili kullanıcı
-- rotasyon endpoint'i ile yeni, rastgele token üretir.
UPDATE "service_complaint_links"
SET "is_active" = false, "revoked_at" = COALESCE("revoked_at", now())
WHERE "is_active" = true AND "access_token_expires_at" IS NULL;--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_version" integer NOT NULL DEFAULT 0;
