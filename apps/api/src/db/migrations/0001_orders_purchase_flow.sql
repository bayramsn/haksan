CREATE TABLE IF NOT EXISTS "sales_order_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_order_statuses_code_unique" ON "sales_order_statuses" ("code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_order_statuses_code_unique" ON "purchase_order_statuses" ("code");
--> statement-breakpoint
INSERT INTO "sales_order_statuses" ("code", "name", "sort_order") VALUES
	('draft', 'Taslak', 10),
	('confirmed', 'Onaylandı', 20),
	('reserved', 'Stok Rezerve', 30),
	('fulfilled', 'Tamamlandı', 40),
	('cancelled', 'İptal', 50)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "purchase_order_statuses" ("code", "name", "sort_order") VALUES
	('draft', 'Taslak', 10),
	('sent', 'Tedarikçiye Gönderildi', 20),
	('approved', 'Onaylandı', 30),
	('in_transit', 'Yolda', 40),
	('received', 'Teslim Alındı', 50),
	('cancelled', 'İptal', 60)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"quote_id" uuid REFERENCES "quotes"("id") ON DELETE set null,
	"opportunity_id" uuid REFERENCES "opportunities"("id") ON DELETE set null,
	"company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE restrict,
	"contact_id" uuid REFERENCES "contacts"("id") ON DELETE set null,
	"order_no" varchar(64) NOT NULL,
	"order_date" timestamp with time zone NOT NULL,
	"status_id" uuid REFERENCES "sales_order_statuses"("id"),
	"currency_id" uuid REFERENCES "currencies"("id"),
	"subtotal" numeric(18,4) DEFAULT '0' NOT NULL,
	"discount_total" numeric(18,4) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(18,4) DEFAULT '0' NOT NULL,
	"grand_total" numeric(18,4) DEFAULT '0' NOT NULL,
	"notes" text,
	"confirmed_at" timestamp with time zone,
	"reserved_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid REFERENCES "users"("id"),
	"approved_by" uuid REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_orders_tenant_order_no_unique" ON "sales_orders" ("tenant_id", "order_no");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_orders_tenant_quote_unique" ON "sales_orders" ("tenant_id", "quote_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_tenant_idx" ON "sales_orders" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_company_idx" ON "sales_orders" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_quote_idx" ON "sales_orders" ("quote_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_status_idx" ON "sales_orders" ("status_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"sales_order_id" uuid NOT NULL REFERENCES "sales_orders"("id") ON DELETE cascade,
	"quote_item_id" uuid REFERENCES "quote_items"("id") ON DELETE set null,
	"product_model_id" uuid REFERENCES "product_models"("id"),
	"inventory_item_id" uuid REFERENCES "inventory_items"("id"),
	"description" text NOT NULL,
	"quantity" numeric(18,4) NOT NULL,
	"unit_id" uuid REFERENCES "units"("id"),
	"unit_price" numeric(18,4) NOT NULL,
	"discount_amount" numeric(18,4) DEFAULT '0' NOT NULL,
	"vat_rate" numeric(5,2) DEFAULT '20' NOT NULL,
	"vat_amount" numeric(18,4) DEFAULT '0' NOT NULL,
	"line_total" numeric(18,4) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_order_items_order_idx" ON "sales_order_items" ("sales_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_order_items_inventory_idx" ON "sales_order_items" ("inventory_item_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"supplier_company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE restrict,
	"order_no" varchar(64) NOT NULL,
	"order_date" timestamp with time zone NOT NULL,
	"expected_date" timestamp with time zone,
	"status_id" uuid REFERENCES "purchase_order_statuses"("id"),
	"currency_id" uuid REFERENCES "currencies"("id"),
	"subtotal" numeric(18,4) DEFAULT '0' NOT NULL,
	"discount_total" numeric(18,4) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(18,4) DEFAULT '0' NOT NULL,
	"grand_total" numeric(18,4) DEFAULT '0' NOT NULL,
	"incoterm" varchar(64),
	"shipment_reference" varchar(128),
	"notes" text,
	"sent_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid REFERENCES "users"("id"),
	"approved_by" uuid REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_tenant_order_no_unique" ON "purchase_orders" ("tenant_id", "order_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_tenant_idx" ON "purchase_orders" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_supplier_idx" ON "purchase_orders" ("supplier_company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_status_idx" ON "purchase_orders" ("status_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_expected_date_idx" ON "purchase_orders" ("expected_date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"purchase_order_id" uuid NOT NULL REFERENCES "purchase_orders"("id") ON DELETE cascade,
	"product_model_id" uuid REFERENCES "product_models"("id"),
	"description" text NOT NULL,
	"quantity" numeric(18,4) NOT NULL,
	"unit_id" uuid REFERENCES "units"("id"),
	"unit_price" numeric(18,4) NOT NULL,
	"discount_amount" numeric(18,4) DEFAULT '0' NOT NULL,
	"vat_rate" numeric(5,2) DEFAULT '20' NOT NULL,
	"vat_amount" numeric(18,4) DEFAULT '0' NOT NULL,
	"line_total" numeric(18,4) DEFAULT '0' NOT NULL,
	"expected_date" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_order_items_order_idx" ON "purchase_order_items" ("purchase_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_order_items_product_idx" ON "purchase_order_items" ("product_model_id");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "name", "resource", "action")
SELECT resource || '.' || action, resource || ' — ' || action, resource, action
FROM (VALUES ('sales_orders'), ('purchase_orders')) AS r(resource)
CROSS JOIN (VALUES ('read'), ('create'), ('update'), ('delete'), ('approve'), ('reject'), ('export')) AS a(action)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles.id, permissions.id
FROM "roles"
JOIN "permissions" ON permissions.resource IN ('sales_orders', 'purchase_orders')
WHERE roles.code IN ('super_admin', 'admin')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles.id, permissions.id
FROM "roles"
JOIN "permissions" ON permissions.resource = 'sales_orders' AND permissions.action IN ('read', 'create', 'update', 'delete')
WHERE roles.code = 'sales'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles.id, permissions.id
FROM "roles"
JOIN "permissions" ON (
	(permissions.resource = 'purchase_orders')
	OR (permissions.resource = 'sales_orders' AND permissions.action IN ('read', 'update'))
)
WHERE roles.code = 'stock'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles.id, permissions.id
FROM "roles"
JOIN "permissions" ON (
	(permissions.resource = 'sales_orders' AND permissions.action IN ('read', 'approve', 'reject'))
	OR (permissions.resource = 'purchase_orders' AND permissions.action = 'read')
)
WHERE roles.code = 'finance'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles.id, permissions.id
FROM "roles"
JOIN "permissions" ON permissions.resource IN ('sales_orders', 'purchase_orders') AND permissions.action = 'read'
WHERE roles.code = 'readonly'
ON CONFLICT DO NOTHING;
