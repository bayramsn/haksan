/** Web ServicePriceListPage (PriceLists.tsx) kategori, sıralama ve fiyat kuralları. */

export type ServicePriceTab = 'parts' | 'accessory' | 'optional' | 'labor';

export const SERVICE_PRICE_CATEGORIES: { value: ServicePriceTab; label: string; code: string }[] = [
  { value: 'parts', label: 'Yedek Parça', code: 'YEDEK_PARCA' },
  { value: 'accessory', label: 'Aksesuar', code: 'AKSESUAR' },
  { value: 'optional', label: 'Opsiyonel Donanım', code: 'OPSIYONEL_DONANIM' },
  { value: 'labor', label: 'İşçilik', code: 'ISCILIK' },
];

export type ServicePriceProduct = {
  id: string;
  modelCode: string;
  modelName: string | null;
  fullName: string;
  stockCode: string | null;
  listPrice: string | null;
  cashPrice: string | null;
  vatRate: string | null;
  originCountry: string | null;
  brand: { name: string } | null;
  currency: { code: string } | null;
  category: { code?: string; name: string } | null;
  subcategory: { name: string } | null;
  productType: { code?: string; name: string } | null;
  compatibleMachineType?: { code?: string | null; name?: string | null } | null;
};

export type PriceOverride = { itemId?: string; listPrice?: number; cashPrice?: number };

export function productSortKey(product: ServicePriceProduct): string {
  return `${product.brand?.name ?? ''} ${product.modelName?.trim() || product.modelCode}`.trim();
}

export function sortProducts<T extends ServicePriceProduct>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    productSortKey(a).localeCompare(productSortKey(b), 'tr', { numeric: true, sensitivity: 'base' }),
  );
}

export function sortPriceLists<T extends { name: string; code: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'tr', { sensitivity: 'base' }));
}

/** Web varsayılanı: aktif liste, yoksa ilki (ad sırasına göre değil, sunucu sırasına göre). */
export function defaultPriceListId(items: { id: string; isActive: boolean }[]): string {
  return (items.find((item) => item.isActive) ?? items[0])?.id ?? '';
}

export function matchesProduct(product: ServicePriceProduct, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('tr-TR');
  if (!needle) return true;
  return [
    product.modelCode,
    product.brand?.name,
    product.productType?.name,
    product.fullName,
    product.stockCode,
    product.category?.name,
  ].some((value) => (value ?? '').toLocaleLowerCase('tr-TR').includes(needle));
}

export function compatibilityLabel(product: ServicePriceProduct): string {
  return product.compatibleMachineType?.code || product.compatibleMachineType?.name || product.productType?.name || 'Genel uyum';
}

export function overridesFromItems(
  rows: { item: { id: string; listPrice: string | null; cashPrice: string | null }; product: { id: string } | null }[],
): Record<string, PriceOverride> {
  const map: Record<string, PriceOverride> = {};
  for (const row of rows) {
    const id = row.product?.id;
    if (!id) continue;
    map[id] = {
      itemId: row.item.id,
      listPrice: row.item.listPrice != null ? Number(row.item.listPrice) : undefined,
      cashPrice: row.item.cashPrice != null ? Number(row.item.cashPrice) : undefined,
    };
  }
  return map;
}

const toNumber = (value: string | null | undefined): number | null => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Seçili listedeki kalem fiyatı, yoksa ürün kartındaki fiyat. */
export function effectivePrices(product: ServicePriceProduct, override: PriceOverride | undefined) {
  return {
    cash: override?.cashPrice ?? toNumber(product.cashPrice),
    list: override?.listPrice ?? toNumber(product.listPrice),
  };
}

/** "1.250,50" veya "1250.5" → 1250.5; negatif ve geçersiz değer reddedilir. */
export function parsePriceInput(value: string): number | null {
  let text = value.trim().replace(/\s/g, '');
  if (!text) return null;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function servicePriceCounts(products: ServicePriceProduct[]): Record<ServicePriceTab, number> {
  const counts = { parts: 0, accessory: 0, optional: 0, labor: 0 } as Record<ServicePriceTab, number>;
  for (const category of SERVICE_PRICE_CATEGORIES) {
    counts[category.value] = products.filter((product) => product.category?.code === category.code).length;
  }
  return counts;
}

export function serviceCategoryProducts<T extends ServicePriceProduct>(products: T[], tab: ServicePriceTab): T[] {
  const code = SERVICE_PRICE_CATEGORIES.find((category) => category.value === tab)?.code;
  return sortProducts(products.filter((product) => product.category?.code === code));
}

/** Liste para birimi seçiliyse o, yoksa ürünün para birimi (web `listCurrency ?? p.currency`). */
export function priceCurrency(product: ServicePriceProduct, listCurrency: string | undefined): string {
  return listCurrency || product.currency?.code || 'TRY';
}

export type PriceDraft = { cash: string; list: string };

/** Değişen alanları doğrular; boş alan gönderilmez, geçersiz tutar hata döner. */
export function priceChanges(
  draft: PriceDraft,
  current: { cash: number | null; list: number | null },
  labor: boolean,
): { ok: true; prices: { cashPrice?: number; listPrice?: number } } | { ok: false; error: string } {
  const prices: { cashPrice?: number; listPrice?: number } = {};
  const fields: [keyof PriceDraft, 'cashPrice' | 'listPrice', number | null][] = labor
    ? [['list', 'listPrice', current.list]]
    : [
        ['cash', 'cashPrice', current.cash],
        ['list', 'listPrice', current.list],
      ];
  for (const [key, field, before] of fields) {
    if (!draft[key].trim()) continue;
    const next = parsePriceInput(draft[key]);
    if (next === null) return { ok: false, error: 'Geçerli bir tutar girin' };
    if (next !== before) prices[field] = next;
  }
  if (!Object.keys(prices).length) return { ok: false, error: 'Değişiklik yok' };
  return { ok: true, prices };
}
