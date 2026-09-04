-- Haftalık kullanıcı raporunun e-posta alıcıları.
-- Boş liste bugünkü davranışı korur: rapor tenant'ın süper adminlerine gider.
-- Liste doluysa mail onların yerine bu adreslere çıkar; uygulama içi bildirim
-- yine süper adminlere yazılır, böylece rapor BT sorumlusuna yönlendirilirken
-- kimse görünürlük kaybetmez.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "user_report_recipients" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint

ALTER TABLE "tenants"
  DROP CONSTRAINT IF EXISTS "tenants_user_report_recipients_array_check";--> statement-breakpoint

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_user_report_recipients_array_check"
  CHECK (jsonb_typeof("user_report_recipients") = 'array');
