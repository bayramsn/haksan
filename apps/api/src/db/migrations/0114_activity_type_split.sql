INSERT INTO "activity_types" ("code", "name", "sort_order", "is_active")
VALUES
  ('incoming_call', 'Gelen Arama', 10, true),
  ('outgoing_call', 'Giden Arama', 20, true),
  ('customer_visit', 'Müşteri Ziyareti', 30, true),
  ('online_meeting', 'Çevrimiçi Toplantı', 40, true),
  ('showroom_meeting', 'Showroom Toplantısı', 50, true),
  ('email', 'E-posta', 60, true),
  ('whatsapp', 'WhatsApp', 70, true),
  ('note', 'Yorum', 80, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true;
--> statement-breakpoint
UPDATE "sales_activities" AS activity
SET "activity_type_id" = replacement."id"
FROM "activity_types" AS legacy, "activity_types" AS replacement
WHERE activity."activity_type_id" = legacy."id"
  AND replacement."code" = CASE
    WHEN legacy."code" IN ('visit', 'demo') THEN 'customer_visit'
    WHEN legacy."code" = 'call' THEN 'outgoing_call'
  END
  AND legacy."code" IN ('visit', 'demo', 'call');
--> statement-breakpoint
UPDATE "activity_types"
SET "is_active" = false
WHERE "code" IN ('visit', 'demo', 'call', 'meeting');
--> statement-breakpoint
UPDATE "tenants"
SET "hidden_navigation_keys" = "hidden_navigation_keys" - 'call-assistant'
WHERE "hidden_navigation_keys" ? 'call-assistant';
