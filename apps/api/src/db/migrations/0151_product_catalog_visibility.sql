ALTER TABLE product_models ADD COLUMN IF NOT EXISTS catalog_hidden boolean NOT NULL DEFAULT false;
