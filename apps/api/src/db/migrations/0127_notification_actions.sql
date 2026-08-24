-- Yanıt bekleyen CRM bildirimleri. Sütunlar önce nullable eklenir; mevcut
-- bildirimler klasik okunur bildirim olarak (`action_type IS NULL`) kalır.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "action_type" varchar(64),
  ADD COLUMN IF NOT EXISTS "action_status" varchar(32),
  ADD COLUMN IF NOT EXISTS "response_reason" text,
  ADD COLUMN IF NOT EXISTS "responded_at" timestamptz;
--> statement-breakpoint

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_action_status_check"
    CHECK (
      ("action_type" IS NULL AND "action_status" IS NULL AND "response_reason" IS NULL AND "responded_at" IS NULL)
      OR ("action_type" IS NOT NULL AND "action_status" IN ('pending', 'accepted', 'declined'))
    ),
  ADD CONSTRAINT "notifications_pending_action_unread_check"
    CHECK (
      "action_status" <> 'pending'
      OR ("read_at" IS NULL AND "responded_at" IS NULL AND "response_reason" IS NULL)
    ),
  ADD CONSTRAINT "notifications_completed_action_check"
    CHECK (
      "action_status" IS NULL OR "action_status" = 'pending'
      OR ("read_at" IS NOT NULL AND "responded_at" IS NOT NULL)
    ),
  ADD CONSTRAINT "notifications_declined_reason_check"
    CHECK (
      "action_status" <> 'declined'
      OR length(trim("response_reason")) BETWEEN 3 AND 1000
    );
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notifications_action_idx"
  ON "notifications" ("action_type", "action_status");
--> statement-breakpoint

-- Aynı kullanıcı/firma için yalnızca tek açık soru olabilir. Mevcut satırlarda
-- action_status NULL olduğu için eski veriler bu indexle çakışmaz.
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_pending_action_unique"
  ON "notifications" ("tenant_id", "user_id", "type", "entity_id")
  WHERE "action_status" = 'pending' AND "user_id" IS NOT NULL AND "entity_id" IS NOT NULL;
