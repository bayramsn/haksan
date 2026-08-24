-- Fırsat dışı aktiviteyi fırsata taşıma işlemi için dar, denetlenebilir yetki.
-- Genel activities.update / opportunities.create izinlerini servis rolüne açmaz.
INSERT INTO "permissions" ("code", "name", "resource", "action")
VALUES ('activities.convert', 'Aktiviteler — fırsata dönüştür', 'activities', 'convert')
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "updated_at" = now();
--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON permission."code" = 'activities.convert'
WHERE role."code" IN ('sales', 'service', 'admin', 'super_admin')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
