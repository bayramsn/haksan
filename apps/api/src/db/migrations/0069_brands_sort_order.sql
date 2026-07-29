ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Mevcut marka kayıtlarına bölüm içinde kararlı bir başlangıç sırası ver.
-- Sonraki değişiklikler CRM Alan Ayarları'ndaki sürükle-bırak işlemiyle yapılır.
WITH ranked_brands AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, division_id
      ORDER BY name, id
    ) * 10 AS next_sort_order
  FROM brands
  WHERE deleted_at IS NULL
)
UPDATE brands b
SET sort_order = ranked_brands.next_sort_order,
    updated_at = now()
FROM ranked_brands
WHERE b.id = ranked_brands.id;
