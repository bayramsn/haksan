ALTER TABLE product_spec_templates
  ADD COLUMN IF NOT EXISTS spec_group_code varchar(64);
