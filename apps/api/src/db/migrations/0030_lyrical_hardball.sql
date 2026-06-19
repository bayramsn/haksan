CREATE TABLE "company_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"requesting_user_id" uuid NOT NULL,
	"requesting_division_id" uuid NOT NULL,
	"owner_division_id" uuid,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"note" text,
	"decision_note" text,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "company_divisions" (
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"added_by_user_id" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_divisions_company_id_division_id_pk" PRIMARY KEY("company_id","division_id")
);
--> statement-breakpoint
CREATE TABLE "contact_companies" (
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" varchar(128),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_companies_contact_id_company_id_pk" PRIMARY KEY("contact_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"division_id" uuid,
	"type" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"entity_type" varchar(64),
	"entity_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "is_blacklisted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "blacklist_reason" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_devices" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "commercial_invoices" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "installation_jobs" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "division_id" uuid;--> statement-breakpoint
ALTER TABLE "company_access_requests" ADD CONSTRAINT "company_access_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_access_requests" ADD CONSTRAINT "company_access_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_access_requests" ADD CONSTRAINT "company_access_requests_requesting_user_id_users_id_fk" FOREIGN KEY ("requesting_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_access_requests" ADD CONSTRAINT "company_access_requests_requesting_division_id_divisions_id_fk" FOREIGN KEY ("requesting_division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_access_requests" ADD CONSTRAINT "company_access_requests_owner_division_id_divisions_id_fk" FOREIGN KEY ("owner_division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_access_requests" ADD CONSTRAINT "company_access_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_divisions" ADD CONSTRAINT "company_divisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_divisions" ADD CONSTRAINT "company_divisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_divisions" ADD CONSTRAINT "company_divisions_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_divisions" ADD CONSTRAINT "company_divisions_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_companies" ADD CONSTRAINT "contact_companies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_companies" ADD CONSTRAINT "contact_companies_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_companies" ADD CONSTRAINT "contact_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_access_requests_tenant_idx" ON "company_access_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_access_requests_company_idx" ON "company_access_requests" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_access_requests_requesting_division_idx" ON "company_access_requests" USING btree ("requesting_division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_access_requests_owner_division_idx" ON "company_access_requests" USING btree ("owner_division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_access_requests_status_idx" ON "company_access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_divisions_tenant_idx" ON "company_divisions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_divisions_division_idx" ON "company_divisions" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_companies_tenant_idx" ON "contact_companies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_companies_company_idx" ON "contact_companies" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_tenant_idx" ON "notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_division_idx" ON "notifications" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_read_idx" ON "notifications" USING btree ("read_at");--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_devices" ADD CONSTRAINT "customer_devices_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_invoices" ADD CONSTRAINT "commercial_invoices_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD CONSTRAINT "accounting_invoices_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_jobs" ADD CONSTRAINT "installation_jobs_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calls_tenant_division_idx" ON "calls" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_tenant_division_idx" ON "leads" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_tenant_division_idx" ON "opportunities" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_activities_tenant_division_idx" ON "sales_activities" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visits_tenant_division_idx" ON "visits" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_devices_tenant_division_idx" ON "customer_devices" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_tenant_division_idx" ON "inventory_items" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_tenant_division_idx" ON "inventory_movements" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commercial_invoices_tenant_division_idx" ON "commercial_invoices" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_tenant_division_idx" ON "contracts" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proformas_tenant_division_idx" ON "proformas" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotes_tenant_division_idx" ON "quotes" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_tenant_division_idx" ON "purchase_orders" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_tenant_division_idx" ON "sales_orders" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounting_invoices_tenant_division_idx" ON "accounting_invoices" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payables_tenant_division_idx" ON "payables" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_tenant_division_idx" ON "payments" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivables_tenant_division_idx" ON "receivables" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_tenant_division_idx" ON "deliveries" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "installation_jobs_tenant_division_idx" ON "installation_jobs" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_tickets_tenant_division_idx" ON "service_tickets" USING btree ("tenant_id","division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_tenant_division_idx" ON "shipments" USING btree ("tenant_id","division_id");