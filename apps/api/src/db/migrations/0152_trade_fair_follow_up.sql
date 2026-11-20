ALTER TABLE "trade_fair_contacts"
  ADD COLUMN IF NOT EXISTS "contacted" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "contact_method" varchar(32),
  ADD COLUMN IF NOT EXISTS "contact_date" date,
  ADD COLUMN IF NOT EXISTS "contact_notes" text,
  ADD COLUMN IF NOT EXISTS "offer_sent" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "customer_converted" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "trade_fair_contacts" ADD CONSTRAINT "trade_fair_follow_up_check" CHECK (
  (contact_method IS NULL OR contact_method IN ('phone', 'whatsapp', 'email', 'in_person', 'other'))
  AND (NOT contacted OR (contact_method IS NOT NULL AND contact_date IS NOT NULL AND length(trim(contact_notes)) > 0 AND contact_notes IS NOT NULL))
);
