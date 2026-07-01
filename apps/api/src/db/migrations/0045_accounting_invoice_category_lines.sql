ALTER TABLE "accounting_invoices" ADD COLUMN IF NOT EXISTS "invoice_category" varchar(32) DEFAULT 'commercial' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_invoice_lines" ADD COLUMN IF NOT EXISTS "list_price" numeric(18,4);--> statement-breakpoint
ALTER TABLE "accounting_invoice_lines" ADD COLUMN IF NOT EXISTS "unit_price" numeric(18,4);--> statement-breakpoint
ALTER TABLE "accounting_invoice_lines" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(18,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_invoice_lines" ADD COLUMN IF NOT EXISTS "vat_rate" numeric(18,4) DEFAULT '20' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_invoice_lines" ADD COLUMN IF NOT EXISTS "line_total" numeric(18,4);--> statement-breakpoint
ALTER TABLE "accounting_invoice_lines" ADD COLUMN IF NOT EXISTS "expected_date" timestamp with time zone;
