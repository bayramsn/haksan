/**
 * Ürün kataloğu süzme/sıralama — web `ProductsPage` (Operations.tsx) ile aynı kurallar.
 * Çalışma zamanı importu yok.
 */

type Ref = { code: string; name: string } | null | undefined;

export type CatalogProductLike = {
  id: string;
  modelCode: string;
  modelName: string | null;
  fullName: string;
  series: string | null;
  stockCode: string | null;
  brand: { name: string } | null;
  productGroup: Ref;
  category: Ref;
  subcategory: Ref;
  productType: Ref;
};

const SERIES_ORDER = ['VM', 'MV', 'VC', 'SL', 'MT', 'SJ', 'TC', 'HT', 'LH', 'D', 'C', 'DL'];
const SERIES_PREFIX_RE = /^(DL|VM|MV|VC|SL|MT|SJ|TC|HT|LH|D|C)(?=[-\d\s/]|$)/i;
const up = (value: string | null | undefined) => (value ?? '').toLocaleUpperCase('tr-TR');

export function productSeriesCode(product: Pick<CatalogProductLike, 'series' | 'modelCode' | 'modelName'>): string {
  const persisted = (product.series ?? '').trim().replace(/\s+serisi$/i, '');
  if (persisted) return up(persisted);
  const model = up((product.modelCode || product.modelName || '').trim());
  return up(model.match(SERIES_PREFIX_RE)?.[1]);
}

export function productSeriesLabel(product: Pick<CatalogProductLike, 'series' | 'modelCode' | 'modelName'>): string {
  const code = productSeriesCode(product);
  return code ? `${code} Serisi` : 'Serisiz';
}

/** Aile sekmesi: tezgah dışı kalemler kendi kategorisinde, CNC tezgahları alt ailelere ayrılır. */
export function productFamilyLabel(product: CatalogProductLike): string {
  const typeCode = up(product.productType?.code);
  const series = productSeriesCode(product);
  const categoryCode = up(product.category?.code);
  if (categoryCode && categoryCode !== 'TEZGAH') {
    return product.category?.name || product.productGroup?.name || 'Genel';
  }
  const groupCode = up(product.productGroup?.code);
  if (groupCode && groupCode !== 'CNC') {
    return product.productType?.name || product.category?.name || product.productGroup?.name || 'Genel';
  }
  if (typeCode.includes('TORNA') || ['SL', 'MT', 'SJ'].includes(series)) return 'CNC Torna Tezgahları';
  if (typeCode === 'CNC_TAPPING_CENTER' || series === 'TC') return 'CNC Tapping Center';
  if (typeCode.includes('5_EKSEN') || ['D', 'C'].includes(series)) return 'CNC 5 Eksen İşleme Merkezleri';
  if (typeCode.includes('KOPRU') || series === 'DL') return 'CNC Köprü Tipi İşleme Merkezleri';
  if (typeCode.includes('DIK_ISLEME') || ['VM', 'MV', 'VC'].includes(series)) return 'CNC Dik İşleme Merkezleri';
  return product.category?.name || product.productGroup?.name || 'Genel';
}

export function seriesSort(a: string, b: string): number {
  const ai = SERIES_ORDER.indexOf(a.replace(' Serisi', ''));
  const bi = SERIES_ORDER.indexOf(b.replace(' Serisi', ''));
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  return a.localeCompare(b, 'tr');
}

/** Servis rolü (admin değilse) yalnız yedek parça ve işçilik görür. */
export function isServiceScoped(roles: readonly string[]): boolean {
  return roles.includes('service') && !roles.includes('admin') && !roles.includes('super_admin');
}

export function isServiceItem(product: Pick<CatalogProductLike, 'category'>): boolean {
  const code = (product.category?.code ?? '').toUpperCase();
  const name = (product.category?.name ?? '').toLocaleLowerCase('tr-TR');
  return code === 'YEDEK_PARCA' || code === 'ISCILIK' || name.includes('yedek') || name.includes('işçilik') || name.includes('iscilik');
}

/** Aktif bölüm seçiliyse ürün grubu kodu bölüm koduyla birebir eşleşmeli. */
export function visibleCatalog<T extends CatalogProductLike>(
  products: readonly T[],
  options: { roles: readonly string[]; divisionCode: string | null },
): T[] {
  let list = isServiceScoped(options.roles) ? products.filter(isServiceItem) : [...products];
  if (options.divisionCode) {
    const code = options.divisionCode.toLocaleUpperCase('en-US');
    list = list.filter((product) => (product.productGroup?.code ?? '').toLocaleUpperCase('en-US') === code);
  }
  return list;
}

export type Taxonomy = { group: string; category: string; subcategory: string; type: string };
export const EMPTY_TAXONOMY: Taxonomy = { group: 'all', category: 'all', subcategory: 'all', type: 'all' };

export function taxonomyMatches(product: CatalogProductLike, taxonomy: Taxonomy, upTo: 0 | 1 | 2 | 3 | 4): boolean {
  return (
    (upTo < 1 || taxonomy.group === 'all' || (product.productGroup?.name ?? '') === taxonomy.group) &&
    (upTo < 2 || taxonomy.category === 'all' || (product.category?.name ?? '') === taxonomy.category) &&
    (upTo < 3 || taxonomy.subcategory === 'all' || (product.subcategory?.name ?? '') === taxonomy.subcategory) &&
    (upTo < 4 || taxonomy.type === 'all' || (product.productType?.name ?? '') === taxonomy.type)
  );
}

const distinct = (items: readonly CatalogProductLike[], pick: (product: CatalogProductLike) => string | undefined) =>
  Array.from(new Set(items.map((product) => (pick(product) ?? '').trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'tr'),
  );

/** Her seviye, üstündeki seçimlerden geçen ürünlerden türetilir. */
export function taxonomyOptions(products: readonly CatalogProductLike[], taxonomy: Taxonomy) {
  return {
    group: distinct(products, (product) => product.productGroup?.name),
    category: distinct(products.filter((product) => taxonomyMatches(product, taxonomy, 1)), (product) => product.category?.name),
    subcategory: distinct(products.filter((product) => taxonomyMatches(product, taxonomy, 2)), (product) => product.subcategory?.name),
    type: distinct(products.filter((product) => taxonomyMatches(product, taxonomy, 3)), (product) => product.productType?.name),
  };
}

/** Üst seviye değişince alttakiler sıfırlanır. */
export function changeTaxonomy(taxonomy: Taxonomy, field: keyof Taxonomy, value: string): Taxonomy {
  if (field === 'group') return { group: value, category: 'all', subcategory: 'all', type: 'all' };
  if (field === 'category') return { ...taxonomy, category: value, subcategory: 'all', type: 'all' };
  if (field === 'subcategory') return { ...taxonomy, subcategory: value, type: 'all' };
  return { ...taxonomy, type: value };
}

const compareText = (a: string, b: string) => a.trim().localeCompare(b.trim(), 'tr', { numeric: true, sensitivity: 'base' });

export function catalogView<T extends CatalogProductLike>(
  products: readonly T[],
  filter: { taxonomy: Taxonomy; family: string; series: string; query: string },
) {
  const taxonomyFiltered = products.filter((product) => taxonomyMatches(product, filter.taxonomy, 4));
  const families = Array.from(new Set(taxonomyFiltered.map(productFamilyLabel))).filter(Boolean);
  const family = filter.family !== 'all' && !families.includes(filter.family) ? 'all' : filter.family;
  const familyFiltered = taxonomyFiltered.filter((product) => family === 'all' || productFamilyLabel(product) === family);
  const seriesOptions = Array.from(new Set(familyFiltered.map(productSeriesLabel))).filter(Boolean).sort(seriesSort);
  const term = filter.query.toLocaleLowerCase('tr-TR');
  const rows = familyFiltered
    .filter((product) => {
      if (filter.series !== 'all' && productSeriesLabel(product) !== filter.series) return false;
      if (!term) return true;
      return [
        product.modelCode,
        product.brand?.name,
        product.series,
        product.productType?.name,
        product.fullName,
        product.stockCode,
        product.category?.name,
        productSeriesLabel(product),
        productFamilyLabel(product),
      ].some((value) => (value ?? '').toLocaleLowerCase('tr-TR').includes(term));
    })
    .sort(
      (a, b) =>
        compareText(a.brand?.name ?? '', b.brand?.name ?? '') ||
        compareText(a.fullName || a.modelName || a.modelCode, b.fullName || b.modelName || b.modelCode) ||
        compareText(a.modelCode ?? '', b.modelCode ?? ''),
    );
  return {
    family,
    rows,
    families: families.map((label) => ({
      label,
      count: taxonomyFiltered.filter((product) => productFamilyLabel(product) === label).length,
    })),
    seriesOptions: seriesOptions.map((label) => ({
      label,
      count: familyFiltered.filter((product) => productSeriesLabel(product) === label).length,
    })),
    kpis: {
      total: taxonomyFiltered.length,
      families: families.length,
      series: new Set(taxonomyFiltered.map(productSeriesLabel)).size,
    },
  };
}

/** Uyumlu opsiyonel donanım seçimi: para birimi bazında toplam (kur yok). */
export function optionalEquipmentTotals(
  items: readonly { id: string; listPrice: string | null; currencyCode: string | null }[],
  selected: ReadonlySet<string>,
): { currencyCode: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!selected.has(item.id)) continue;
    const amount = Number(item.listPrice ?? 0);
    if (!Number.isFinite(amount)) continue;
    const code = item.currencyCode ?? 'USD';
    totals.set(code, (totals.get(code) ?? 0) + amount);
  }
  return [...totals].map(([currencyCode, amount]) => ({ currencyCode, amount }));
}
