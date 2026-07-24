ALTER TABLE "quote_items"
  ADD COLUMN IF NOT EXISTS "nationalized" boolean NOT NULL DEFAULT false;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "customs_total" numeric(18, 4) NOT NULL DEFAULT '0';
