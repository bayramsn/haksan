-- Teknik alanların satılabilir alternatif değerleri: "Fener Mili" varsayılan
-- BT-40 iken ['BT-50'] tanımlanabilir; teklifte seçilince alan yalnız o teklif
-- için ezilir, katalog şablonu değişmez.
ALTER TABLE "product_spec_templates" ADD COLUMN IF NOT EXISTS "spec_options" jsonb;
