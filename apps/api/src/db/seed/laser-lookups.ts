import { sql } from 'drizzle-orm';
import type { DbClient } from '../client';

/** Divisions are created after migrations on a fresh installation. Keep TG scoped there as well. */
export async function seedLaserLookups(db: DbClient): Promise<void> {
  await db.execute(sql`
    INSERT INTO product_subcategories (code, name, division_id, category_id, sort_order)
    SELECT 'BORU_PROFIL_LAZER_KESIM', 'Boru/Profil Lazer Kesim', d.id,
      (SELECT c.id FROM product_categories c WHERE c.code = 'TEZGAH' AND (c.division_id = d.id OR c.division_id IS NULL)
       ORDER BY (c.division_id IS NOT NULL) DESC LIMIT 1), 65
    FROM divisions d WHERE lower(d.code) = 'sac_isleme' AND d.deleted_at IS NULL
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO product_types (code, name, division_id, subcategory_id, sort_order)
    SELECT 'BORU_LAZER_KESIM', 'Boru/Profil Lazer Kesim', s.division_id, s.id, 65
    FROM product_subcategories s WHERE s.code = 'BORU_PROFIL_LAZER_KESIM'
    ON CONFLICT DO NOTHING
  `);
}
