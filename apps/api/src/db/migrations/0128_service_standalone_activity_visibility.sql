-- Servis rolü firma kartındaki fırsata bağlı olmayan aktiviteleri okuyabilsin.
-- Satış/admin/süperadmin bu izne mevcut rol matrislerinden zaten sahiptir.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'activities.read'
WHERE r."code" = 'service'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
