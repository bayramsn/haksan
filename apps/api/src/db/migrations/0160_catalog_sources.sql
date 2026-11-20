ALTER TABLE product_models ADD COLUMN IF NOT EXISTS catalog_sources jsonb NOT NULL DEFAULT '[]'::jsonb;
