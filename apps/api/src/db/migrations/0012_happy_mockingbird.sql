CREATE TABLE "purchase_order_statuses" (
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
CREATE TABLE "sales_order_statuses" (
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
CREATE TABLE "note_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"scope" varchar(32) DEFAULT 'quote' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_model_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_id" uuid,
	"unit_price" numeric(18, 4) NOT NULL,
	"discount_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '20' NOT NULL,
	"vat_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"expected_date" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"supplier_company_id" uuid,
	"purchase_type" varchar(32) DEFAULT 'commercial' NOT NULL,
	"invoice_no" varchar(128),
	"order_no" varchar(64) NOT NULL,
	"order_date" timestamp with time zone NOT NULL,
	"expected_date" timestamp with time zone,
	"status_id" uuid,
	"currency_id" uuid,
	"subtotal" numeric(18, 4) DEFAULT '0' NOT NULL,
	"discount_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"grand_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"incoterm" varchar(64),
	"shipment_reference" varchar(128),
	"notes" text,
	"sent_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"quote_item_id" uuid,
	"product_model_id" uuid,
	"inventory_item_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_id" uuid,
	"unit_price" numeric(18, 4) NOT NULL,
	"discount_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '20' NOT NULL,
	"vat_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_id" uuid,
	"opportunity_id" uuid,
	"company_id" uuid NOT NULL,
	"contact_id" uuid,
	"order_no" varchar(64) NOT NULL,
	"order_date" timestamp with time zone NOT NULL,
	"status_id" uuid,
	"currency_id" uuid,
	"subtotal" numeric(18, 4) DEFAULT '0' NOT NULL,
	"discount_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"grand_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"notes" text,
	"confirmed_at" timestamp with time zone,
	"reserved_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "purchase_approval_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "manager_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "other_phone" varchar(32);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "other_email" varchar(255);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "gender" varchar(32);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "known_illness" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "political_view" varchar(128);--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "won_reason" varchar(255);--> statement-breakpoint
ALTER TABLE "product_equipment_items" ADD COLUMN "unit_price" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "product_equipment_items" ADD COLUMN "currency_id" uuid;--> statement-breakpoint
ALTER TABLE "product_models" ADD COLUMN "image_url" varchar(512);--> statement-breakpoint
ALTER TABLE "product_models" ADD COLUMN "muadil_product_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "compatibility" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "note_templates" ADD CONSTRAINT "note_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_company_id_companies_id_fk" FOREIGN KEY ("supplier_company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_status_id_purchase_order_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."purchase_order_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_quote_item_id_quote_items_id_fk" FOREIGN KEY ("quote_item_id") REFERENCES "public"."quote_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_status_id_sales_order_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."sales_order_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_statuses_code_unique" ON "purchase_order_statuses" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_order_statuses_code_unique" ON "sales_order_statuses" USING btree ("code");--> statement-breakpoint
CREATE INDEX "note_templates_tenant_idx" ON "note_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "note_templates_scope_idx" ON "note_templates" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "purchase_order_items_order_idx" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_items_product_idx" ON "purchase_order_items" USING btree ("product_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_tenant_order_no_unique" ON "purchase_orders" USING btree ("tenant_id","order_no");--> statement-breakpoint
CREATE INDEX "purchase_orders_tenant_idx" ON "purchase_orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_company_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_expected_date_idx" ON "purchase_orders" USING btree ("expected_date");--> statement-breakpoint
CREATE INDEX "sales_order_items_order_idx" ON "sales_order_items" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "sales_order_items_inventory_idx" ON "sales_order_items" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_tenant_order_no_unique" ON "sales_orders" USING btree ("tenant_id","order_no");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_tenant_quote_unique" ON "sales_orders" USING btree ("tenant_id","quote_id");--> statement-breakpoint
CREATE INDEX "sales_orders_tenant_idx" ON "sales_orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sales_orders_company_idx" ON "sales_orders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sales_orders_quote_idx" ON "sales_orders" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "sales_orders_status_idx" ON "sales_orders" USING btree ("status_id");--> statement-breakpoint
ALTER TABLE "product_equipment_items" ADD CONSTRAINT "product_equipment_items_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;