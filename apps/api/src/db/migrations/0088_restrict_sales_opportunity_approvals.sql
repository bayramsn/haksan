-- A+ approval is an explicit duty assigned from Admin > Roles & Permissions.
-- Existing standard sales roles must not inherit approve/reject implicitly.
DELETE FROM "role_permissions" AS rp
USING "roles" AS r, "permissions" AS p
WHERE rp."role_id" = r."id"
  AND rp."permission_id" = p."id"
  AND r."code" = 'sales'
  AND p."code" IN ('opportunities.approve', 'opportunities.reject');
