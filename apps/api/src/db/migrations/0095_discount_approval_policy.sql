INSERT INTO "sales_order_statuses" ("code", "name", "sort_order")
VALUES ('pending_super_admin_approval', 'Süper Admin Onayı Bekliyor', 15)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "sort_order" = EXCLUDED."sort_order";
