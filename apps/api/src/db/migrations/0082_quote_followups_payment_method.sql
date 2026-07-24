ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "follow_up_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "status_note" text,
  ADD COLUMN IF NOT EXISTS "status_changed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "status_changed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "payment_method" varchar(32);

INSERT INTO "quote_statuses" ("code", "name", "sort_order")
VALUES
  ('cancelled', 'İptal', 70),
  ('price_waiting', 'Fiyat Bekleniyor', 80),
  ('budget_waiting', 'Bütçe Bekleniyor', 90),
  ('on_hold', 'Askıya Alındı', 100),
  ('postponed', 'Ertelendi', 110)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "sort_order" = EXCLUDED."sort_order",
    "is_active" = true,
    "updated_at" = now();

UPDATE "opportunities"
SET "payment_method" = 'undecided'
WHERE "payment_method" IS NULL;
