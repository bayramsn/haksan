ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "item_condition" varchar(16) NOT NULL DEFAULT 'new';
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "received_date" timestamptz;
--> statement-breakpoint
ALTER TABLE "inventory_items" DROP CONSTRAINT IF EXISTS "inventory_items_item_condition_check";
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_item_condition_check"
CHECK ("item_condition" IN ('new', 'used'));
