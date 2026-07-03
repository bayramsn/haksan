ALTER TABLE price_list_items
  ADD COLUMN IF NOT EXISTS campaign_price numeric(14, 2),
  ADD COLUMN IF NOT EXISTS campaign_valid_from timestamptz,
  ADD COLUMN IF NOT EXISTS campaign_valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS campaign_is_active boolean NOT NULL DEFAULT false;
