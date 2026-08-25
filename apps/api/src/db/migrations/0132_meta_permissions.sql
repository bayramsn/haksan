-- Meta Merkezi için izin kataloğu ve sistem rolü atamaları.
-- Resource/action matrisi idempotenttir; mevcut tenant rollerini silmez.
WITH resources(resource, label) AS (
  VALUES
    ('meta', 'Meta Merkezi'),
    ('meta_campaigns', 'Meta Kampanyaları'),
    ('meta_messages', 'Meta Mesajları'),
    ('meta_audiences', 'Meta Hedef Kitleleri'),
    ('meta_catalogs', 'Meta Katalogları')
), actions(action, label) AS (
  VALUES
    ('read', 'görüntüle'),
    ('create', 'oluştur'),
    ('update', 'güncelle'),
    ('delete', 'sil'),
    ('approve', 'onayla'),
    ('reject', 'reddet'),
    ('export', 'dışa aktar')
)
INSERT INTO "permissions" ("code", "name", "resource", "action")
SELECT resources.resource || '.' || actions.action,
       resources.label || ' — ' || actions.label,
       resources.resource,
       actions.action
FROM resources CROSS JOIN actions
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "updated_at" = now();
--> statement-breakpoint

-- Yönetici rollerine tüm Meta izinleri; readonly rolüne yalnız okuma.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON permission."resource" IN (
  'meta', 'meta_campaigns', 'meta_messages', 'meta_audiences', 'meta_catalogs'
)
WHERE role."code" IN ('admin', 'super_admin')
   OR (role."code" = 'readonly' AND permission."action" = 'read')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
--> statement-breakpoint

-- Satış ekibi performans/lead verisini ve konuşmaları kullanabilir; harcama,
-- hedef kitle ve katalog yazma izinleri yönetici rollerinde kalır.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON permission."code" IN (
  'meta.read',
  'meta_campaigns.read',
  'meta_messages.read',
  'meta_messages.create',
  'meta_messages.update',
  'meta_audiences.read',
  'meta_catalogs.read'
)
WHERE role."code" = 'sales'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
