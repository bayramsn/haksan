ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "purchase_type" varchar(32) DEFAULT 'commercial' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "invoice_no" varchar(128);
