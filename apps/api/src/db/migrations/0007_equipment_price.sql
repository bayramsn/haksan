ALTER TABLE "product_equipment_items" ADD COLUMN IF NOT EXISTS "unit_price" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "product_equipment_items" ADD COLUMN IF NOT EXISTS "currency_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_equipment_items" ADD CONSTRAINT "product_equipment_items_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
