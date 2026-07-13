import { sql } from 'drizzle-orm';
import type { DbClient } from '../client';

const CNC_PRODUCT_TYPE_CODES = [
  'DIK_ISLEME_MERKEZI',
  'KOPRU_TIPI_ISLEME_MERKEZI',
  'CNC_TORNA',
  'CNC_DIK_ISLEME_MERKEZ',
  'CNC_YATAY_ISLEME_MERKEZI',
  'CNC_KOPRU_TIPI_ISLEME_MERKEZI',
  'CNC_5_EKSEN_ISLEME_MERKEZI',
  'CNC_TAPPING_CENTER',
  'CNC_YATAY_TORNA_TEZGAHI',
  'CNC_DIK_TORNA_TEZGAHI',
];

export async function up(db: DbClient): Promise<void> {
  await db.execute(sql`
    with target_divisions as (
      select distinct on (code) code, id
      from divisions
      where code in ('cnc', 'universal', 'sac_isleme')
      order by code, is_active desc, sort_order asc, id asc
    )
    update product_groups pg
    set division_id = d.id
    from target_divisions d
    where d.code = lower(pg.code)
      and pg.code in ('CNC', 'UNIVERSAL', 'SAC_ISLEME')
      and (pg.division_id is null or pg.division_id <> d.id)
  `);

  await db.execute(sql`
    with target_division as (
      select id
      from divisions
      where code = 'cnc'
      order by is_active desc, sort_order asc, id asc
      limit 1
    )
    update product_types pt
    set division_id = d.id
    from target_division d
    where pt.code in (${sql.join(CNC_PRODUCT_TYPE_CODES.map((code) => sql`${code}`), sql`, `)})
      and (pt.division_id is null or pt.division_id <> d.id)
  `);

  console.log('[data-migrate] 013_scope_product_lookup_defaults: scoped default product groups and CNC product types.');
}
