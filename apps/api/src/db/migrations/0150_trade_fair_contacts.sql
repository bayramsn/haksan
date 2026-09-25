-- Fuar görüşmeleri: fuarda standa gelen firma/kişi kayıtları.
-- Bölüm/departman kapsamı yok; kiracıdaki her rol aynı listeyi görür.
CREATE TABLE IF NOT EXISTS "trade_fair_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "fair_name" varchar(200) NOT NULL,
  "company_name" varchar(255) NOT NULL,
  "contact_name" varchar(200) NOT NULL,
  "contact_title" varchar(120),
  "mobile_phone" varchar(32),
  "email" varchar(254),
  "country" varchar(64) DEFAULT 'Türkiye' NOT NULL,
  "province" varchar(128),
  "district" varchar(128),
  "product_category" varchar(128),
  "product_type" varchar(255),
  "notes" text,
  "met_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "visitor_count" integer DEFAULT 1 NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "trade_fair_contacts_visitor_count_check" CHECK ("visitor_count" BETWEEN 1 AND 999)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_fair_contacts_tenant_fair_idx" ON "trade_fair_contacts" ("tenant_id", "fair_name", "created_at");
CREATE INDEX IF NOT EXISTS "trade_fair_contacts_met_by_idx" ON "trade_fair_contacts" ("met_by_user_id");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "name", "resource", "action") VALUES
  ('trade_fairs.read', 'trade_fairs — read', 'trade_fairs', 'read'),
  ('trade_fairs.create', 'trade_fairs — create', 'trade_fairs', 'create'),
  ('trade_fairs.update', 'trade_fairs — update', 'trade_fairs', 'update'),
  ('trade_fairs.delete', 'trade_fairs — delete', 'trade_fairs', 'delete')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
-- Fuar alanı bütün departmanlara açık: özel (sonradan açılmış) roller de dahil
-- her rol okur/ekler/düzenler; readonly yalnız okur. Silme kuralı serviste.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role.id, permission.id
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE permission.resource = 'trade_fairs'
  AND (
    role.code <> 'readonly'
    OR permission.action = 'read'
  )
ON CONFLICT DO NOTHING;
