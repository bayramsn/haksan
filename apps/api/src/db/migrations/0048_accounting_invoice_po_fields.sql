ALTER TABLE "accounting_invoices" ADD COLUMN IF NOT EXISTS "payment_type" varchar(32) DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD COLUMN IF NOT EXISTS "payment_term_days" integer;--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD COLUMN IF NOT EXISTS "previous_payment_term_days" integer;--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD COLUMN IF NOT EXISTS "term_change_reason" text;--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD COLUMN IF NOT EXISTS "incoterm" varchar(64);--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD COLUMN IF NOT EXISTS "shipment_reference" varchar(128);--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD COLUMN IF NOT EXISTS "order_no" varchar(64);--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD COLUMN IF NOT EXISTS "expected_date" timestamp with time zone;
