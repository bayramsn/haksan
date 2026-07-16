import { sql } from 'drizzle-orm';
import type { DbClient } from '../client';

/**
 * Ürün taksonomi bağlantılarını bilinen seed/kurulum kodlarına göre geriye dönük
 * doldurur: alt kategori → kategori (TEZGAH), ürün tipi → alt kategori,
 * bölüm-kapsamlı kategori → aynı bölümdeki tek ürün grubu.
 *
 * Yalnızca bağlantısı NULL olan satırlara dokunur; bilinmeyen kodlar atlanır.
 * Üst kayıt tercihi: önce aynı bölümdeki kayıt, yoksa paylaşılan ("Tümü") kayıt.
 */

// Tezgah alt kategorileri → TEZGAH kategorisi.
const MACHINE_SUBCATEGORY_CODES = [
  'ISLEME_MERKEZI',
  'TORNA',
  'FREZE',
  'MATKAP',
  'TASLAMA',
  'KAYIK',
  'SAC_BUKME',
  'SAC_KESME',
];

// Ürün tipi → alt kategori eşlemesi (CNC seed + Üniversal/Sac kurulum katalogları).
const TYPE_SUBCATEGORY_MAP: Record<string, string[]> = {
  ISLEME_MERKEZI: [
    'DIK_ISLEME_MERKEZI',
    'KOPRU_TIPI_ISLEME_MERKEZI',
    'CNC_DIK_ISLEME_MERKEZ',
    'CNC_YATAY_ISLEME_MERKEZI',
    'CNC_KOPRU_TIPI_ISLEME_MERKEZI',
    'CNC_5_EKSEN_ISLEME_MERKEZI',
    'CNC_TAPPING_CENTER',
  ],
  TORNA: ['CNC_TORNA', 'CNC_YATAY_TORNA_TEZGAHI', 'CNC_DIK_TORNA_TEZGAHI', 'UNIVERSAL_TORNA'],
  FREZE: ['UNIVERSAL_FREZE'],
  MATKAP: ['RADYAL_MATKAP'],
  TASLAMA: ['SATIH_TASLAMA'],
  SAC_BUKME: ['ABKANT_PRES', 'SILINDIR_MAKINESI'],
  SAC_KESME: ['GIYOTIN_MAKAS', 'FIBER_LAZER_KESIM', 'PLAZMA_KESIM'],
};

export async function up(db: DbClient): Promise<void> {
  // 1) Tezgah alt kategorilerini TEZGAH kategorisine bağla.
  await db.execute(sql`
    update product_subcategories s
    set category_id = (
      select c.id
      from product_categories c
      where upper(c.code) = 'TEZGAH'
        and (c.division_id = s.division_id or c.division_id is null)
      order by (c.division_id = s.division_id) desc nulls last, c.sort_order asc, c.id asc
      limit 1
    )
    where s.category_id is null
      and upper(s.code) in (${sql.join(MACHINE_SUBCATEGORY_CODES.map((code) => sql`${code}`), sql`, `)})
  `);

  // 2) Bilinen ürün tiplerini alt kategorilerine bağla.
  for (const [subcategoryCode, typeCodes] of Object.entries(TYPE_SUBCATEGORY_MAP)) {
    await db.execute(sql`
      update product_types t
      set subcategory_id = (
        select s.id
        from product_subcategories s
        where upper(s.code) = ${subcategoryCode}
          and (s.division_id = t.division_id or s.division_id is null)
        order by (s.division_id = t.division_id) desc nulls last, s.sort_order asc, s.id asc
        limit 1
      )
      where t.subcategory_id is null
        and upper(t.code) in (${sql.join(typeCodes.map((code) => sql`${code}`), sql`, `)})
    `);
  }

  // 3) Bölüme atanmış kategorileri, bölümde tek ürün grubu varsa o gruba bağla
  //    (Üniversal/Sac kurulumlarında bölüm başına tek grup açılır).
  await db.execute(sql`
    update product_categories c
    set product_group_id = (
      select g.id from product_groups g
      where g.division_id = c.division_id
      order by g.sort_order asc, g.id asc
      limit 1
    )
    where c.product_group_id is null
      and c.division_id is not null
      and (select count(*) from product_groups g2 where g2.division_id = c.division_id) = 1
  `);

  console.log('[data-migrate] 018_link_product_taxonomy: linked product taxonomy parents for known codes.');
}
