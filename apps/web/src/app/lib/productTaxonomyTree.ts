import type { Product } from './mock';

export type TaxonomyRow = { id: string; code: string; name: string; isActive?: boolean; productGroupId?: string | null; categoryId?: string | null; subcategoryId?: string | null };
export type TaxonomyNode = { key: string; name: string; inactive: boolean; shared: boolean; count: number; children: TaxonomyNode[] };
type ProductCodes = Pick<Product, 'productGroupCode' | 'categoryCode' | 'subcategoryCode' | 'productTypeCode'>;

/**
 * Grup → kategori → alt kategori → tip ağacı. Üst bağı boş ("ortak") kayıt her üstte geçerlidir:
 * o üstün ürünlerinden en az biri bu kayıttaysa altında `shared` olarak görünür. Sayım ürünün kod zinciriyle yapılır.
 */
export function buildProductTaxonomyTree(
  levels: { groups: TaxonomyRow[]; categories: TaxonomyRow[]; subcategories: TaxonomyRow[]; types: TaxonomyRow[] },
  products: ProductCodes[],
): TaxonomyNode[] {
  const chain = [
    { rows: levels.groups, parent: (_r: TaxonomyRow) => null, code: (p: ProductCodes) => p.productGroupCode },
    { rows: levels.categories, parent: (r: TaxonomyRow) => r.productGroupId ?? null, code: (p: ProductCodes) => p.categoryCode },
    { rows: levels.subcategories, parent: (r: TaxonomyRow) => r.categoryId ?? null, code: (p: ProductCodes) => p.subcategoryCode },
    { rows: levels.types, parent: (r: TaxonomyRow) => r.subcategoryId ?? null, code: (p: ProductCodes) => p.productTypeCode },
  ];
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'tr', { numeric: true });

  const build = (depth: number, parentId: string | null, scope: ProductCodes[], path: string): TaxonomyNode[] => {
    const level = chain[depth];
    if (!level) return [];
    const node = (row: TaxonomyRow, shared: boolean): TaxonomyNode => {
      const matched = scope.filter((p) => (level.code(p) ?? '').toUpperCase() === row.code.toUpperCase());
      const key = `${path}/${row.id}`;
      return { key, name: row.name, inactive: row.isActive === false, shared, count: matched.length, children: build(depth + 1, row.id, matched, key) };
    };
    const own = level.rows.filter((row) => level.parent(row) === parentId).map((row) => node(row, false));
    const shared = depth > 0 ? level.rows.filter((row) => level.parent(row) === null).map((row) => node(row, true)).filter((n) => n.count > 0) : [];
    return [...own, ...shared].sort(byName);
  };
  const roots = build(0, null, products, '');
  // Grubu tanımlı gruplardan hiçbirine uymayan ürünler: taksonomi boşluğunu görünür kılar.
  const groupCodes = new Set(levels.groups.map((g) => g.code.toUpperCase()));
  const orphans = products.filter((p) => !groupCodes.has((p.productGroupCode ?? '').toUpperCase()));
  if (orphans.length) roots.push({ key: '/orphans', name: 'Grup atanmamış', inactive: false, shared: false, count: orphans.length, children: build(1, '__none__', orphans, '/orphans') });
  return roots;
}
