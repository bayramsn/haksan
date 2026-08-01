-- Kullanıcı ünvanları (Satış Müdürü, Bölge Sorumlusu, Teknik Danışman…).
-- Diğer lookup tabloları ile aynı şekle sahiptir; CRM Alan Ayarları'ndan
-- yönetilir ve kullanıcılara atanır. Teklif/proforma/sözleşme çıktılarında
-- belgeyi hazırlayan kişinin ünvanı bu bağdan okunur.

CREATE TABLE IF NOT EXISTS "user_titles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "user_titles_code_unique" ON "user_titles" USING btree ("code");--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "title_id" uuid;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_title_id_user_titles_id_fk'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_title_id_user_titles_id_fk"
      FOREIGN KEY ("title_id") REFERENCES "public"."user_titles"("id") ON DELETE set null;
  END IF;
END $$;--> statement-breakpoint

-- Başlangıç listesi; ekip CRM Alan Ayarları'ndan düzenleyip genişletebilir.
INSERT INTO "user_titles" ("code", "name", "sort_order") VALUES
  ('sales_manager', 'Satış Müdürü', 10),
  ('sales_representative', 'Satış Temsilcisi', 20),
  ('regional_manager', 'Bölge Sorumlusu', 30),
  ('technical_consultant', 'Teknik Danışman', 40),
  ('service_manager', 'Servis Müdürü', 50),
  ('finance_manager', 'Finans Müdürü', 60),
  ('general_manager', 'Genel Müdür', 70)
ON CONFLICT ("code") DO NOTHING;
