-- Teklif kaleminde (opsiyonel donanım / yedek parça) uyumluluk seçimleri:
-- { machineIds, brands, controlUnits, supplierIds } — JSONB olarak tutulur.
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "compatibility" jsonb;
