ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "sales_order_id" uuid;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "company_id" uuid;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "origin" varchar(255);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "destination" varchar(255);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "eta" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "incoterm" varchar(64);--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "shipment_id" uuid;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "sales_order_id" uuid;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"inventory_item_id" uuid,
	"sales_order_item_id" uuid,
	"product_model_id" uuid,
	"description" text NOT NULL,
	"serial_number" varchar(128),
	"quantity" numeric(18, 4) DEFAULT '1' NOT NULL,
	"unit_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_sales_order_item_id_sales_order_items_id_fk" FOREIGN KEY ("sales_order_item_id") REFERENCES "public"."sales_order_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_sales_order_idx" ON "shipments" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_company_idx" ON "shipments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_shipment_idx" ON "deliveries" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_items_shipment_idx" ON "shipment_items" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_items_inventory_idx" ON "shipment_items" USING btree ("inventory_item_id");
