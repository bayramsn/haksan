-- Mevcut markaları, kullanıldıkları ürün grubunun CNC / Üniversal / Sac İşleme
-- bölümüne bağla. Aynı marka birden fazla bölümde kullanılıyorsa veri kaybı veya
-- yanlış taşıma olmaması için ortak (NULL) kapsamda bırakılır.
WITH brand_scope AS (
  SELECT
    pm.brand_id,
    (array_agg(DISTINCT pg.division_id))[1] AS division_id
  FROM product_models pm
  INNER JOIN product_groups pg ON pg.id = pm.product_group_id
  WHERE pm.deleted_at IS NULL
    AND pg.division_id IS NOT NULL
  GROUP BY pm.brand_id
  HAVING count(DISTINCT pg.division_id) = 1
)
UPDATE brands b
SET division_id = brand_scope.division_id,
    updated_at = now()
FROM brand_scope
WHERE b.id = brand_scope.brand_id
  AND b.deleted_at IS NULL
  AND b.division_id IS NULL;
