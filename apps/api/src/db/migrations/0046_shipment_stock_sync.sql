ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "parent_inventory_item_id" uuid;
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "sender_company_id" uuid;
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "carrier_company_id" uuid;
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "transport_mode" varchar(32);
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "product_category_code" varchar(64);
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "destination_warehouse_id" uuid;
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "loading_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN IF NOT EXISTS "package_count" integer;
--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN IF NOT EXISTS "pallet_count" integer;
--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN IF NOT EXISTS "package_length_cm" numeric(18,4);
--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN IF NOT EXISTS "package_width_cm" numeric(18,4);
--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN IF NOT EXISTS "package_height_cm" numeric(18,4);
--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN IF NOT EXISTS "gross_weight_kg" numeric(18,4);
--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN IF NOT EXISTS "package_notes" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_parent_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("parent_inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_sender_company_id_companies_id_fk" FOREIGN KEY ("sender_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrier_company_id_companies_id_fk" FOREIGN KEY ("carrier_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_destination_warehouse_id_warehouses_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_parent_idx" ON "inventory_items" USING btree ("parent_inventory_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_sender_company_idx" ON "shipments" USING btree ("sender_company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_carrier_company_idx" ON "shipments" USING btree ("carrier_company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_destination_warehouse_idx" ON "shipments" USING btree ("destination_warehouse_id");
--> statement-breakpoint
INSERT INTO "product_categories" ("code", "name", "sort_order") VALUES
  ('TEZGAH', 'Tezgah', 10),
  ('OPSIYONEL_DONANIM', 'Opsiyonel Donanım', 20),
  ('YEDEK_PARCA', 'Yedek Parça', 30),
  ('AKSESUAR', 'Aksesuar', 40),
  ('EVRAK', 'Evrak', 50),
  ('IDARI_MALZEME', 'İdari Malzeme', 60)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "warehouses" ("tenant_id", "name", "type", "country", "created_at", "updated_at")
SELECT t."id", w."name", w."type", 'Türkiye', now(), now()
FROM "tenants" t
CROSS JOIN (
  VALUES
    ('Antrepo', 'antrepo'),
    ('Küçükköy Depo', 'depo'),
    ('Akel Depo', 'depo'),
    ('İkitelli Depo', 'depo'),
    ('Servis Stok', 'servis_stok'),
    ('Mağaza', 'magaza')
) AS w("name", "type")
ON CONFLICT ("tenant_id", "name") DO NOTHING;
