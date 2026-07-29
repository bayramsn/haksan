ALTER TABLE "product_spec_templates"
  ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false NOT NULL;
