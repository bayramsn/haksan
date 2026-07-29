export const PRODUCT_CATEGORY_FILTERS = [
  'Tümü',
  'CNC Torna',
  'CNC Freze',
  'Yatay Tezgah',
  'Dik Tezgah',
  'Aksesuar',
] as const;

export type ProductCategoryFilter = (typeof PRODUCT_CATEGORY_FILTERS)[number];

export function productTitle(row: Record<string, unknown>): string {
  return String(row.fullName ?? row.modelName ?? row.modelCode ?? '—');
}

export function productModelCode(row: Record<string, unknown>): string {
  return String(row.modelCode ?? '—');
}

export function productCategoryLabel(row: Record<string, unknown>): string {
  const cat = row.category as Record<string, unknown> | undefined;
  return String(cat?.name ?? cat?.code ?? '');
}

export function productImageUrl(row: Record<string, unknown>): string | undefined {
  const url = row.imageUrl ?? row.image;
  return url ? String(url) : undefined;
}

export function productListPrice(row: Record<string, unknown>): number | null {
  const raw = row.listPrice;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function productListPriceText(row: Record<string, unknown>): string | null {
  const price = productListPrice(row);
  if (price == null) return null;
  return `₺${price.toLocaleString('tr-TR')}`;
}

export function productIsActive(row: Record<string, unknown>): boolean {
  if (row.isActive === false) return false;
  return true;
}

export function matchesProductCategory(row: Record<string, unknown>, filter: ProductCategoryFilter): boolean {
  if (filter === 'Tümü') return true;
  const hay = `${productTitle(row)} ${productModelCode(row)} ${productCategoryLabel(row)}`.toLowerCase();
  switch (filter) {
    case 'CNC Torna':
      return hay.includes('torna');
    case 'CNC Freze':
      return hay.includes('freze');
    case 'Yatay Tezgah':
      return hay.includes('yatay');
    case 'Dik Tezgah':
      return hay.includes('dik');
    case 'Aksesuar':
      return hay.includes('aksesuar') || hay.includes('yedek') || hay.includes('parça') || hay.includes('parca');
    default:
      return true;
  }
}

export function productBrandName(row: Record<string, unknown>): string {
  const brand = row.brand as Record<string, unknown> | undefined;
  return String(brand?.name ?? row.brandName ?? '');
}

export function productIconName(row: Record<string, unknown>): 'construct' | 'cube' | 'hardware-chip' | 'layers' {
  const hay = `${productTitle(row)} ${productCategoryLabel(row)}`.toLowerCase();
  if (hay.includes('torna')) return 'construct';
  if (hay.includes('freze') || hay.includes('işleme')) return 'hardware-chip';
  if (hay.includes('yatay') || hay.includes('dik')) return 'layers';
  return 'cube';
}

export function productBadgeLabel(row: Record<string, unknown>): string {
  if (!productIsActive(row)) return 'Pasif';
  const category = productCategoryLabel(row);
  if (category) return category;
  return 'Katalogda';
}

export function countByProductCategory(
  rows: Record<string, unknown>[],
  filter: ProductCategoryFilter,
): number {
  return rows.filter((row) => matchesProductCategory(row, filter)).length;
}

export function matchesProductSearch(row: Record<string, unknown>, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = `${productTitle(row)} ${productModelCode(row)} ${productBrandName(row)}`.toLowerCase();
  return hay.includes(needle);
}

export function formatProductMoney(value: unknown, currency?: unknown): string {
  if (value == null || value === '') return '—';
  const cur = currency ? ` ${String(currency)}` : '';
  return `₺${Number(value).toLocaleString('tr-TR')}${cur}`;
}
