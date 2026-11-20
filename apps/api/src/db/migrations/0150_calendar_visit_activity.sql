-- Takvimdeki müşteri ziyareti CRM'de "Müşteri Ziyareti" aktivitesi olarak yaşar.
-- Haftalık aktivite raporu, firma "son ziyaret" alanı ve fırsat kontrol listesi
-- sales_activities okur; eski `visits` tablosuna yazılan ziyaret yalnız hedef ve
-- ekip sayaçlarında görünüyordu. Aktivite ziyareti yapacak kişiye (owner) yazılır.

ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "activity_id" uuid;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_activity_id_sales_activities_id_fk'
  ) THEN
    ALTER TABLE "calendar_events"
      ADD CONSTRAINT "calendar_events_activity_id_sales_activities_id_fk"
      FOREIGN KEY ("activity_id") REFERENCES "public"."sales_activities"("id") ON DELETE set null;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "calendar_events_activity_idx" ON "calendar_events" USING btree ("activity_id");--> statement-breakpoint

-- Geri doldurma: takvime bağlı eski ziyaretler aktiviteye taşınır, visits satırı
-- kapatılır. Sayaçlar visits ∪ aktivite topladığından toplam değişmez. Aktivite
-- kimliği etkinlikten türetilir (md5) ki eşleme ikinci geçişte de aynı kalsın.
-- Bölüm: fırsatın bölümü, yoksa sahibin birincil bölümü (serviste aynı kural).
INSERT INTO "sales_activities" (
  "id", "tenant_id", "division_id", "opportunity_id", "company_id", "contact_id", "activity_type_id",
  "subject", "description", "origin", "activity_date", "created_by", "created_at", "updated_at", "deleted_at"
)
SELECT
  md5('calendar-visit:' || e."id"::text)::uuid,
  e."tenant_id",
  coalesce(
    (SELECT o."division_id" FROM "opportunities" o WHERE o."id" = e."opportunity_id"),
    (SELECT ud."division_id" FROM "user_divisions" ud WHERE ud."user_id" = e."owner_user_id" ORDER BY ud."is_primary" DESC LIMIT 1)
  ),
  e."opportunity_id", e."company_id", e."contact_id", t."id",
  e."title", e."description", 'system', e."starts_at", e."owner_user_id", e."created_at", now(), e."deleted_at"
FROM "calendar_events" e
JOIN "activity_types" t ON t."code" = 'customer_visit'
WHERE e."visit_id" IS NOT NULL AND e."activity_id" IS NULL AND e."company_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

UPDATE "calendar_events" e
SET "activity_id" = md5('calendar-visit:' || e."id"::text)::uuid
WHERE e."visit_id" IS NOT NULL AND e."activity_id" IS NULL
  AND EXISTS (SELECT 1 FROM "sales_activities" a WHERE a."id" = md5('calendar-visit:' || e."id"::text)::uuid);--> statement-breakpoint

UPDATE "visits" v
SET "deleted_at" = now(), "updated_at" = now()
FROM "calendar_events" e
WHERE e."visit_id" = v."id" AND e."activity_id" IS NOT NULL AND v."deleted_at" IS NULL;
