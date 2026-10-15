/**
 * Stok sayfası hesapları — web `StockPage` ile aynı kurallar.
 * Çalışma zamanı importu yok; node:test doğrudan içe aktarır.
 */

/** Hazır adedi bu eşik ve altındaki makine modelleri "kritik stok" sayılır. */
export const LOW_STOCK_THRESHOLD = 2;

/** Web durum etiketleri; `damaged` web'de "Pasif" olarak görünür. */
export const STOCK_STATUS_LABELS: Record<string, string> = {
  available: 'Bekliyor (satışa hazır)',
  reserved: 'Rezerve',
  in_transit: 'Yolda',
  sold: 'Satıldı',
  damaged: 'Pasif',
};

/** Web yalnız bu durumlara elle geçişe izin verir; "Satıldı" yalnız fatura ile. */
export const STOCK_STATUS_ACTIONS = ['available', 'reserved', 'in_transit', 'damaged'] as const;

export const STOCK_STATUS_TABS = [
  { value: 'available', label: 'Hazır' },
  { value: 'reserved', label: 'Rezerve' },
  { value: 'in_transit', label: 'Yolda' },
  { value: 'sold', label: 'Satılan' },
  { value: 'damaged', label: 'Pasif' },
] as const;

/** packages/shared `STOCK_CATEGORY_CODES` / `STOCK_CATEGORY_LABELS`. */
export const STOCK_CATEGORY_TABS = [
  { value: 'TEZGAH', label: 'Tezgahlar' },
  { value: 'OPSIYONEL_DONANIM', label: 'Opsiyonel Donanım' },
  { value: 'YEDEK_PARCA', label: 'Yedek Parça' },
  { value: 'AKSESUAR', label: 'Aksesuar' },
  { value: 'EVRAK', label: 'Evrak' },
  { value: 'IDARI_MALZEME', label: 'İdari Malzeme' },
] as const;

export const STOCK_CONDITION_OPTIONS = [
  { value: 'new', label: 'Yeni' },
  { value: 'used', label: 'Kullanılmış' },
  { value: 'demo', label: 'Demo' },
] as const;

export function stockConditionLabel(code: string | null | undefined): string {
  return STOCK_CONDITION_OPTIONS.find((option) => option.value === (code ?? 'new'))?.label ?? code ?? '—';
}

/** Web oluşturma formunda seçilebilen durumlar (Satıldı/Rezerve ayrı akış). */
export const STOCK_CREATE_STATUS_OPTIONS = [
  { value: 'available', label: 'Bekliyor (satışa hazır)' },
  { value: 'in_transit', label: 'Yolda' },
  { value: 'damaged', label: 'Pasif' },
] as const;

/**
 * Web toplu üretim: seçilen ürünün model kodundan çakışmasız `MODEL-001` seri
 * numaraları üretir.
 */
export function bulkSerials(modelCode: string, quantity: number, taken: ReadonlySet<string>): string[] {
  const prefix = modelCode.replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'URUN';
  const used = new Set(taken);
  const serials: string[] = [];
  let seq = 1;
  while (serials.length < quantity) {
    const serial = `${prefix}-${String(seq).padStart(3, '0')}`;
    seq += 1;
    if (used.has(serial)) continue;
    used.add(serial);
    serials.push(serial);
  }
  return serials;
}

/** Web ek alanları notlara yazar. */
export function stockExtraNotes(optionalHardware: string, spareParts: string): string {
  return [
    optionalHardware.trim() ? `Opsiyon Donanım: ${optionalHardware.trim()}` : '',
    spareParts.trim() ? `Yedek Parça: ${spareParts.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export const LOCATION_STATUS_LABELS: Record<string, string> = {
  at_warehouse: 'Depoda',
  in_transit: 'Yolda',
  at_customer: 'Müşteride',
  at_service: 'Serviste',
  customs: 'Gümrükte',
};

export function stockStatusLabel(code: string | null | undefined, fallback?: string | null): string {
  if (!code) return fallback ?? '—';
  return STOCK_STATUS_LABELS[code] ?? fallback ?? code;
}

export type StockRowLike = {
  id: string;
  serialNumber: string;
  productModelId?: string | null;
  parentInventoryItemId?: string | null;
  product: { id: string; modelCode: string; fullName: string; stockCode: string | null } | null;
  brand: { name: string } | null;
  category: { code: string } | null;
  status: { code: string } | null;
  warehouse: { name: string } | null;
  reservedCompany: { legalTitle: string; shortName: string | null } | null;
};

/** Web kategori yoksa "TEZGAH" varsayar. */
export const stockCategory = (row: Pick<StockRowLike, 'category'>) => row.category?.code ?? 'TEZGAH';

export function scopeByCategory<T extends StockRowLike>(rows: readonly T[], category: string | null): T[] {
  return rows.filter((row) => !category || stockCategory(row) === category);
}

export function stockCounts(rows: readonly StockRowLike[]) {
  const count = (code: string) => rows.filter((row) => row.status?.code === code).length;
  return {
    available: count('available'),
    reserved: count('reserved'),
    in_transit: count('in_transit'),
    sold: count('sold'),
    damaged: count('damaged'),
  };
}

const fold = (value: string) => value.toLocaleLowerCase('tr');

/**
 * Liste: alt kalem (bağlı opsiyonel donanım) yalnız Opsiyonel Donanım sekmesinde
 * ayrı satır olur; durum ve arama web ile aynı alanlarda.
 */
export function filterStock<T extends StockRowLike>(
  scoped: readonly T[],
  filter: { category: string | null; status: string | null; query: string },
): T[] {
  const term = fold(filter.query.trim());
  return scoped.filter((row) => {
    if (row.parentInventoryItemId && filter.category !== 'OPSIYONEL_DONANIM') return false;
    if (filter.status && row.status?.code !== filter.status) return false;
    if (!term) return true;
    return [
      row.serialNumber,
      row.product?.stockCode ?? '',
      row.product?.fullName ?? '',
      row.product?.modelCode ?? '',
      row.brand?.name ?? '',
      row.reservedCompany?.shortName ?? row.reservedCompany?.legalTitle ?? '',
    ].some((value) => fold(value).includes(term));
  });
}

export function optionsByParent<T extends StockRowLike>(rows: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.parentInventoryItemId) continue;
    const list = map.get(row.parentInventoryItemId) ?? [];
    list.push(row);
    map.set(row.parentInventoryItemId, list);
  }
  return map;
}

export function warehouseDistribution(rows: readonly StockRowLike[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = row.warehouse?.name ?? '';
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export function brandDistribution(rows: readonly StockRowLike[]): { name: string; count: number; share: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = row.brand?.name ?? 'Marka yok';
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map]
    .map(([name, count]) => ({ name, count, share: rows.length ? count / rows.length : 0 }))
    .sort((a, b) => b.count - a.count);
}

export type CriticalMachine = {
  productId: string;
  label: string;
  available: number;
  reserved: number;
  total: number;
  out: boolean;
};

/**
 * "Kritik Makine Stoku": stoklanan (toplam > 0) ve hazır adedi eşik ve altındaki
 * TEZGAH modelleri; en az hazır olan önce.
 */
export function criticalMachines(rows: readonly StockRowLike[]): CriticalMachine[] {
  const map = new Map<string, CriticalMachine>();
  for (const row of rows) {
    if (stockCategory(row) !== 'TEZGAH') continue;
    const productId = row.productModelId ?? row.product?.id;
    if (!productId) continue;
    const entry = map.get(productId) ?? {
      productId,
      label: [row.brand?.name, row.product?.modelCode].filter(Boolean).join(' ') || row.product?.fullName || 'Tezgah',
      available: 0,
      reserved: 0,
      total: 0,
      out: false,
    };
    entry.total += 1;
    if (row.status?.code === 'available') entry.available += 1;
    if (row.status?.code === 'reserved') entry.reserved += 1;
    map.set(productId, entry);
  }
  return [...map.values()]
    .filter((entry) => entry.total > 0 && entry.available <= LOW_STOCK_THRESHOLD)
    .map((entry) => ({ ...entry, out: entry.available === 0 }))
    .sort((a, b) => a.available - b.available);
}

const normalizeSpecKey = (value: string) =>
  value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const SPINDLE_SPEED_KEYS = ['fener mili devri', 'spindle speed'];
export const TOOL_COUNT_KEYS = [
  'takım adeti',
  'takim adeti',
  'takım kapasitesi',
  'takim kapasitesi',
  'takım yuvası sayısı',
  'takim yuvasi sayisi',
  'tool count',
  'tool capacity',
];
export const SPINDLE_POWER_KEYS = ['fener mili motor gücü', 'fener mili motor gucu', 'spindle motor power'];

/** Ürün teknik özelliğinden anahtar kelimeyle değer bulur (web `specValue`). */
export function specValue(specs: readonly { key: string; value: string }[] | undefined, keywords: readonly string[]): string {
  const normalized = keywords.map(normalizeSpecKey);
  const found = (specs ?? []).find((spec) => {
    const key = normalizeSpecKey(spec.key);
    return normalized.some((keyword) => key.includes(keyword));
  });
  return found?.value || '—';
}

/** Web Excel dışa aktarım parametreleri. */
export function stockExportParams(filter: { category: string | null; status: string | null; query: string }) {
  return {
    ...(filter.query ? { search: filter.query } : {}),
    ...(filter.status ? { statusCode: filter.status } : {}),
    ...(filter.category ? { categoryCode: filter.category } : {}),
  };
}

export type StockFormValues = {
  categoryCode: string;
  productModelId: string;
  serialNumber: string;
  controlUnit: string;
  warehouseId: string;
  loadingDate: string;
  receivedDate: string;
  arrivalDate: string;
};

/**
 * Web `CreateStockDialog` / `EditStockDialog` kuralları. Düzenlemede kontrol
 * ünitesi yalnız mevcut değer silinirse zorunlu; depo yalnız oluşturmada zorunlu.
 */
export function validateStockForm(
  form: StockFormValues,
  context: { mode: 'create' | 'edit'; existingControlUnit?: string | null; takenSerials: ReadonlySet<string> },
): { ok: true } | { ok: false; title: string } {
  if (!form.productModelId) return { ok: false, title: context.mode === 'create' ? 'Ürün adı seçiniz' : 'Ürün seçin' };
  const isMachine = form.categoryCode === 'TEZGAH';
  if (context.mode === 'create' && isMachine && !form.controlUnit.trim()) {
    return { ok: false, title: 'Tezgah için kontrol ünitesi zorunludur' };
  }
  if (context.mode === 'edit' && isMachine && context.existingControlUnit && !form.controlUnit.trim()) {
    return { ok: false, title: 'Tezgahın kontrol ünitesi boş bırakılamaz' };
  }
  if (context.mode === 'create' && !form.warehouseId) return { ok: false, title: 'Ürünün bulunduğu depoyu seçiniz' };
  const serial = form.serialNumber.trim();
  if (!serial) return { ok: false, title: 'Seri numarası giriniz' };
  if (context.takenSerials.has(serial)) {
    return {
      ok: false,
      title: context.mode === 'create' ? 'Bu seri numarası zaten kayıtlı' : 'Bu seri numarası başka bir kalemde kayıtlı',
    };
  }
  for (const [label, value] of [
    ['Yüklendiği Tarih', form.loadingDate],
    ['Geldiği Tarih', form.receivedDate],
    ['Geleceği Tarih', form.arrivalDate],
  ] as const) {
    if (value && Number.isNaN(new Date(value).getTime())) return { ok: false, title: `${label} geçersiz` };
  }
  return { ok: true };
}
