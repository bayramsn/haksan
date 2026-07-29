-- Geçmiş CRM belgeleri bağlı firma soft-delete edildiğinde müşteri bilgisi
-- kaybolmasın. Fiziksel veri silmez; yalnız hâlâ aktif bir kayıtta kullanılan
-- firmaları güvenli biçimde geri görünür yapar.
UPDATE "companies" c
SET "deleted_at" = NULL,
    "updated_at" = now()
WHERE c."deleted_at" IS NOT NULL
  AND (
    EXISTS (SELECT 1 FROM "contacts" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "opportunities" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "sales_activities" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "quotes" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "sales_orders" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "accounting_invoices" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "receivables" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "payments" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "customer_devices" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "installation_jobs" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "service_tickets" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "shipments" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
    OR EXISTS (SELECT 1 FROM "deliveries" x WHERE x."company_id" = c."id" AND x."deleted_at" IS NULL)
  );
