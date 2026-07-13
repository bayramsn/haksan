/**
 * Makine ürün gruplarının her birini tek satıra indirir. Doğru bölümdeki kayıt
 * esas alınır; global veya yanlış bölüme bağlı kopyalara işaret eden FK'lar bu
 * kayda taşınır ve kopyalar silinir. AKSESUAR / YEDEK_PARCA gibi makine grubu
 * olmayan kayıtlar kapsam dışındadır.
 */
import { sql } from 'drizzle-orm';
import type { DbClient } from '../client';

export async function up(db: DbClient): Promise<void> {
  // Her kod için hedef: karşılık gelen doğru bölümdeki en eski kayıt. Böyle bir
  // kayıt yoksa mevcut en eski satır korunur ve işlem sonunda doğru bölüme alınır.
  const dupMap = sql`
    WITH target_divisions AS (
      SELECT DISTINCT ON (code)
        CASE code
          WHEN 'cnc' THEN 'CNC'
          WHEN 'universal' THEN 'UNIVERSAL'
          WHEN 'sac_isleme' THEN 'SAC_ISLEME'
        END AS group_code,
        id AS division_id
      FROM divisions
      WHERE code IN ('cnc', 'universal', 'sac_isleme')
      ORDER BY code, is_active DESC, sort_order ASC, id ASC
    )
    SELECT duplicate.id AS dup_id, canonical.keep_id
    FROM product_groups duplicate
    JOIN target_divisions target ON target.group_code = duplicate.code
    JOIN LATERAL (
      SELECT candidate.id AS keep_id
      FROM product_groups candidate
      WHERE candidate.code = duplicate.code
      ORDER BY
        (candidate.division_id = target.division_id) DESC NULLS LAST,
        candidate.created_at ASC,
        candidate.id ASC
      LIMIT 1
    ) canonical ON TRUE
    WHERE duplicate.code IN ('CNC', 'UNIVERSAL', 'SAC_ISLEME')
      AND duplicate.id <> canonical.keep_id
  `;

  // Ürün modelleri kopyadan kanonik satıra taşınır.
  await db.execute(sql`
    UPDATE product_models pm SET product_group_id = m.keep_id
    FROM (${dupMap}) m
    WHERE pm.product_group_id = m.dup_id
  `);

  // Uyumluluk kayıtları: hedefte aynı (ürün, grup) çifti zaten canlıysa
  // kopya kayıt yinelenen olduğundan silinir; kalanlar kanonik gruba taşınır.
  await db.execute(sql`
    DELETE FROM product_optional_equipment_compatibilities c
    USING (${dupMap}) m
    WHERE c.product_group_id = m.dup_id
      AND c.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM product_optional_equipment_compatibilities x
        WHERE x.product_model_id = c.product_model_id
          AND x.product_group_id = m.keep_id
          AND x.deleted_at IS NULL
      )
  `);
  await db.execute(sql`
    UPDATE product_optional_equipment_compatibilities c SET product_group_id = m.keep_id
    FROM (${dupMap}) m
    WHERE c.product_group_id = m.dup_id
  `);

  // Artık referanssız kalan kopyaları sil.
  await db.execute(sql`
    DELETE FROM product_groups g
    USING (${dupMap}) m
    WHERE g.id = m.dup_id
  `);

  // Korunan üç satırın bölüm bağını da kesin olarak doğru bölüme getir.
  await db.execute(sql`
    WITH target_divisions AS (
      SELECT DISTINCT ON (code)
        CASE code
          WHEN 'cnc' THEN 'CNC'
          WHEN 'universal' THEN 'UNIVERSAL'
          WHEN 'sac_isleme' THEN 'SAC_ISLEME'
        END AS group_code,
        id AS division_id
      FROM divisions
      WHERE code IN ('cnc', 'universal', 'sac_isleme')
      ORDER BY code, is_active DESC, sort_order ASC, id ASC
    )
    UPDATE product_groups pg
    SET division_id = target.division_id
    FROM target_divisions target
    WHERE pg.code = target.group_code
      AND pg.division_id IS DISTINCT FROM target.division_id
  `);
}
