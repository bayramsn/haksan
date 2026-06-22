ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "payment_type" varchar(32) DEFAULT 'cash' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "payment_term_days" integer;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "previous_payment_term_days" integer;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "term_change_reason" text;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "approval_reason" text;
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "list_price" numeric(18,4);
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "approved_price" numeric(18,4);
