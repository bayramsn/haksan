export type StockLevel = 'critical' | 'low' | 'ok';

export type AggregatedStockSku = {
  key: string;
  productModelId: string;
  representativeId: string;
  title: string;
  sku: string;
  categoryCode?: string;
  categoryName?: string;
  location: string;
  qty: number;
  available: number;
  reserved: number;
  minQty: number;
  level: StockLevel;
  progress: number;
  brandName?: string;
};

const DEFAULT_MIN = 5;

export function stockLevel(available: number, minQty = DEFAULT_MIN): StockLevel {
  if (available <= 2) return 'critical';
  if (available <= minQty) return 'low';
  return 'ok';
}

export function stockLevelLabel(level: StockLevel): string {
  if (level === 'critical') return 'Kritik';
  if (level === 'low') return 'Azın';
  return 'Yeterli';
}

export function aggregateStockRows(items: Record<string, unknown>[]): AggregatedStockSku[] {
  const map = new Map<string, AggregatedStockSku & { warehouses: Set<string> }>();

  for (const row of items) {
    const product = row.product as Record<string, unknown> | undefined;
    const category = row.category as Record<string, unknown> | undefined;
    const brand = row.brand as Record<string, unknown> | undefined;
    const warehouse = row.warehouse as Record<string, unknown> | undefined;
    const status = row.status as Record<string, unknown> | undefined;
    const statusCode = String(status?.code ?? '').toLowerCase();

    const productModelId = String(row.productModelId ?? product?.id ?? row.id ?? '');
    const key = productModelId || String(row.id);
    const title = String(product?.fullName ?? product?.modelCode ?? row.serialNumber ?? 'Stok Kalemi');
    const sku = String(product?.modelCode ?? row.serialNumber ?? '—');
    const warehouseName = String(warehouse?.name ?? '');

    const existing = map.get(key);
    if (existing) {
      existing.qty += 1;
      if (statusCode === 'available') existing.available += 1;
      if (statusCode === 'reserved') existing.reserved += 1;
      if (warehouseName) existing.warehouses.add(warehouseName);
      existing.level = stockLevel(existing.available, existing.minQty);
      existing.progress = Math.min(100, Math.round((existing.available / Math.max(existing.minQty, 1)) * 100));
      existing.location = formatLocation(existing.warehouses);
      continue;
    }

    const available = statusCode === 'available' ? 1 : 0;
    const reserved = statusCode === 'reserved' ? 1 : 0;
    const warehouses = new Set<string>();
    if (warehouseName) warehouses.add(warehouseName);

    map.set(key, {
      key,
      productModelId,
      representativeId: String(row.id ?? ''),
      title,
      sku,
      categoryCode: category?.code ? String(category.code) : undefined,
      categoryName: category?.name ? String(category.name) : undefined,
      location: formatLocation(warehouses),
      qty: 1,
      available,
      reserved,
      minQty: DEFAULT_MIN,
      level: stockLevel(available, DEFAULT_MIN),
      progress: Math.min(100, Math.round((available / DEFAULT_MIN) * 100)),
      brandName: brand?.name ? String(brand.name) : undefined,
      warehouses,
    });
  }

  return Array.from(map.values())
    .map(({ warehouses: _w, ...rest }) => rest)
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'));
}

function formatLocation(warehouses: Set<string>): string {
  const names = Array.from(warehouses);
  if (!names.length) return 'Konum belirtilmedi';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

export type StockCategoryFilter = 'Tümü' | 'CNC Parça' | 'Sarf' | 'Yüksek Değer' | 'Demirbaş';

export const STOCK_CATEGORY_FILTERS: StockCategoryFilter[] = [
  'Tümü',
  'CNC Parça',
  'Sarf',
  'Yüksek Değer',
  'Demirbaş',
];

export function matchesStockCategory(row: AggregatedStockSku, filter: StockCategoryFilter): boolean {
  if (filter === 'Tümü') return true;
  const code = String(row.categoryCode ?? '').toLowerCase();
  const name = String(row.categoryName ?? '').toLowerCase();
  if (filter === 'CNC Parça') return code.includes('cnc') || name.includes('cnc') || name.includes('parça');
  if (filter === 'Sarf') return code.includes('consum') || name.includes('sarf');
  if (filter === 'Demirbaş') return code.includes('asset') || name.includes('demirbaş');
  if (filter === 'Yüksek Değer') return row.qty >= 10 || row.available >= 8;
  return true;
}

export function matchesStockSearch(row: AggregatedStockSku, q: string): boolean {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return (
    row.title.toLowerCase().includes(term) ||
    row.sku.toLowerCase().includes(term) ||
    row.location.toLowerCase().includes(term)
  );
}

export function countStockLevel(rows: AggregatedStockSku[], level: StockLevel): number {
  return rows.filter((r) => r.level === level).length;
}
