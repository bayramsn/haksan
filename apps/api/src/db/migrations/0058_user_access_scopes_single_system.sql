-- Tek sistem + sayfa/modül/departman/bölüm bazlı yetki alanları.

-- 1) Bölüm kodlarını standart hale getir.
UPDATE "divisions"
SET "code" = 'cnc'
WHERE lower("code") IN ('cnc', 'haksan_cnc');--> statement-breakpoint
UPDATE "divisions"
SET "code" = 'universal'
WHERE lower("code") IN ('universal', 'universel', 'üniversal');--> statement-breakpoint
UPDATE "divisions"
SET "code" = 'sac_isleme'
WHERE lower("code") IN ('sac_isleme', 'sac', 'sac_islem', 'sac işleme', 'sac_isleme_hatti');--> statement-breakpoint

-- 2) Resource kapsam matrisi.
CREATE TABLE IF NOT EXISTS "user_access_scopes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "resource" varchar(64) NOT NULL,
  "department_id" uuid,
  "division_id" uuid,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_access_scopes_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "user_access_scopes" ADD CONSTRAINT "user_access_scopes_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_access_scopes_user_id_users_id_fk') THEN
    ALTER TABLE "user_access_scopes" ADD CONSTRAINT "user_access_scopes_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_access_scopes_department_id_departments_id_fk') THEN
    ALTER TABLE "user_access_scopes" ADD CONSTRAINT "user_access_scopes_department_id_departments_id_fk"
      FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_access_scopes_division_id_divisions_id_fk') THEN
    ALTER TABLE "user_access_scopes" ADD CONSTRAINT "user_access_scopes_division_id_divisions_id_fk"
      FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_access_scopes_user_resource_idx"
  ON "user_access_scopes" ("user_id", "resource");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_access_scopes_tenant_resource_idx"
  ON "user_access_scopes" ("tenant_id", "resource");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_access_scopes_unique"
  ON "user_access_scopes" (
    "user_id",
    "resource",
    coalesce("department_id", '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce("division_id", '00000000-0000-0000-0000-000000000000'::uuid)
  );--> statement-breakpoint

-- 3) Fiyat listeleri de bölüm kapsamına alınır. Eski kayıtlar NULL kalır ve
-- resource helper'larında legacy/paylaşılan kayıt olarak görünür.
ALTER TABLE "price_lists" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_lists_division_id_divisions_id_fk') THEN
    ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_division_id_divisions_id_fk"
      FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_lists_division_idx" ON "price_lists" ("division_id");--> statement-breakpoint

-- 4) Migration raporu: tenant birleştirme öncesi çakışmaları görünür kılar.
CREATE TABLE IF NOT EXISTS "tenant_migration_conflicts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "primary_tenant_id" uuid,
  "source_tenant_id" uuid,
  "conflict_type" varchar(64) NOT NULL,
  "conflict_key" varchar(255) NOT NULL,
  "source_id" uuid,
  "existing_id" uuid,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

WITH primary_tenant AS (
  SELECT id FROM tenants ORDER BY CASE WHEN slug = 'haksan' THEN 0 ELSE 1 END, created_at NULLS LAST, id LIMIT 1
)
INSERT INTO tenant_migration_conflicts (primary_tenant_id, source_tenant_id, conflict_type, conflict_key, source_id, existing_id, details)
SELECT p.id, u.tenant_id, 'user_email', lower(u.email), u.id, existing.id, jsonb_build_object('email', u.email)
FROM users u
CROSS JOIN primary_tenant p
JOIN users existing ON existing.tenant_id = p.id AND lower(existing.email) = lower(u.email) AND existing.id <> u.id
WHERE u.tenant_id <> p.id
ON CONFLICT DO NOTHING;--> statement-breakpoint

WITH primary_tenant AS (
  SELECT id FROM tenants ORDER BY CASE WHEN slug = 'haksan' THEN 0 ELSE 1 END, created_at NULLS LAST, id LIMIT 1
)
INSERT INTO tenant_migration_conflicts (primary_tenant_id, source_tenant_id, conflict_type, conflict_key, source_id, existing_id, details)
SELECT p.id, c.tenant_id, 'company_tax_number', c.tax_number, c.id, existing.id, jsonb_build_object('taxNumber', c.tax_number)
FROM companies c
CROSS JOIN primary_tenant p
JOIN companies existing ON existing.tenant_id = p.id AND existing.tax_number = c.tax_number AND existing.id <> c.id
WHERE c.tenant_id <> p.id AND c.tax_number IS NOT NULL AND c.tax_number <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint

WITH primary_tenant AS (
  SELECT id FROM tenants ORDER BY CASE WHEN slug = 'haksan' THEN 0 ELSE 1 END, created_at NULLS LAST, id LIMIT 1
)
INSERT INTO tenant_migration_conflicts (primary_tenant_id, source_tenant_id, conflict_type, conflict_key, source_id, existing_id, details)
SELECT p.id, pm.tenant_id, 'product_model_code', pm.model_code, pm.id, existing.id, jsonb_build_object('modelCode', pm.model_code)
FROM product_models pm
CROSS JOIN primary_tenant p
JOIN product_models existing ON existing.tenant_id = p.id AND existing.model_code = pm.model_code AND existing.id <> pm.id
WHERE pm.tenant_id <> p.id
ON CONFLICT DO NOTHING;--> statement-breakpoint

WITH primary_tenant AS (
  SELECT id FROM tenants ORDER BY CASE WHEN slug = 'haksan' THEN 0 ELSE 1 END, created_at NULLS LAST, id LIMIT 1
)
INSERT INTO tenant_migration_conflicts (primary_tenant_id, source_tenant_id, conflict_type, conflict_key, source_id, existing_id, details)
SELECT p.id, pl.tenant_id, 'price_list_code', pl.code, pl.id, existing.id, jsonb_build_object('code', pl.code)
FROM price_lists pl
CROSS JOIN primary_tenant p
JOIN price_lists existing ON existing.tenant_id = p.id AND existing.code = pl.code AND existing.id <> pl.id
WHERE pl.tenant_id <> p.id
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 5) Mevcut kullanıcı kapsamlarını otomatik üret.
WITH scope_resources(resource) AS (
  VALUES
    ('companies'),
    ('contacts'),
    ('leads'),
    ('opportunities'),
    ('activities'),
    ('products'),
    ('price_lists'),
    ('inventory'),
    ('customer_devices'),
    ('quotes'),
    ('sales_orders'),
    ('proformas'),
    ('contracts'),
    ('commercial_invoices'),
    ('accounting_invoices'),
    ('purchase_orders'),
    ('shipments'),
    ('installations'),
    ('service_tickets'),
    ('receivables'),
    ('payments'),
    ('reports')
),
view_all_users AS (
  SELECT DISTINCT u.id AS user_id, u.tenant_id, u.department_id
  FROM users u
  JOIN user_roles ur ON ur.user_id = u.id
  JOIN role_permissions rp ON rp.role_id = ur.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE p.code = 'divisions.view_all'
)
INSERT INTO user_access_scopes (tenant_id, user_id, resource, department_id, division_id, is_primary)
SELECT vau.tenant_id, vau.user_id, sr.resource, vau.department_id, NULL, true
FROM view_all_users vau
CROSS JOIN scope_resources sr
ON CONFLICT DO NOTHING;--> statement-breakpoint

WITH scope_resources(resource) AS (
  VALUES
    ('companies'),
    ('contacts'),
    ('leads'),
    ('opportunities'),
    ('activities'),
    ('products'),
    ('price_lists'),
    ('inventory'),
    ('customer_devices'),
    ('quotes'),
    ('sales_orders'),
    ('proformas'),
    ('contracts'),
    ('commercial_invoices'),
    ('accounting_invoices'),
    ('purchase_orders'),
    ('shipments'),
    ('installations'),
    ('service_tickets'),
    ('receivables'),
    ('payments'),
    ('reports')
)
INSERT INTO user_access_scopes (tenant_id, user_id, resource, department_id, division_id, is_primary)
SELECT u.tenant_id, u.id, sr.resource, u.department_id, ud.division_id, ud.is_primary
FROM users u
JOIN user_divisions ud ON ud.user_id = u.id
CROSS JOIN scope_resources sr
ON CONFLICT DO NOTHING;
