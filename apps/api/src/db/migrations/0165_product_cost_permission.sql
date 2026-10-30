-- Baz kart fiyat matrisindeki tedarikçi alış maliyetini görme izni. Eylem bilerek
-- "view": salt-okunur rolün tüm "read" izinlerini alması maliyeti açmasın.
INSERT INTO "permissions" ("code", "name", "resource", "action") VALUES
  ('product_costs.view', 'product_costs — view', 'product_costs', 'view')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role.id, permission.id
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE permission.code = 'product_costs.view'
  AND role.code IN ('super_admin', 'admin', 'finance')
ON CONFLICT DO NOTHING;
