/**
 * Teklif ekranlarının saf mantığı (React'siz, node:test ile sınanır).
 * Kurallar web `OffersPage` / `chartAggregates.buildOfferTrend` /
 * `quoteItemEditing.persistQuoteItems` ile birebir tutulur.
 */

export const TR_MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'] as const;
export const TR_MONTH_LONG = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

export type MonthBucket = { key: string; short: string; long: string; year: number };

/** Son `count` ayın kovaları (en eski önce). Anahtar `YYYY-AA`, sunucu özetiyle aynı biçim. */
export function lastMonths(now: Date, count: number): MonthBucket[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    const month = date.getMonth();
    return {
      key: `${date.getFullYear()}-${String(month + 1).padStart(2, '0')}`,
      short: TR_MONTH_SHORT[month] ?? '',
      long: TR_MONTH_LONG[month] ?? '',
      year: date.getFullYear(),
    };
  });
}

/** Grafik altındaki üç etiket: ilk, orta ve son ay (ör. "May", "Ağu", "Eki"). */
export function chartAxisLabels(buckets: MonthBucket[]): string[] {
  if (buckets.length <= 2) return buckets.map((bucket) => bucket.short);
  const middle = buckets[Math.floor((buckets.length - 1) / 2)];
  return [buckets[0]?.short ?? '', middle?.short ?? '', buckets[buckets.length - 1]?.short ?? ''];
}

export type QuoteSummaryLike = {
  byCurrency: { currencyCode: string; months: { month: string; count: number; total: string }[] }[];
};

/** Bir özet yanıtındaki ay → teklif adedi (para birimleri toplanır). */
export function countsByMonth(summary: QuoteSummaryLike | null | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const group of summary?.byCurrency ?? []) {
    for (const month of group.months) counts.set(month.month, (counts.get(month.month) ?? 0) + Number(month.count || 0));
  }
  return counts;
}

export type OfferTrendPoint = { key: string; label: string; sent: number; approved: number };

/**
 * Web `buildOfferTrend`: "Gönderilen" = gönderilmiş + onaylı + reddedilmiş,
 * "Onaylanan" = onaylı teklif sayısı; aylar teklif tarihine göre kovalanır.
 */
export function buildOfferTrend(
  buckets: MonthBucket[],
  summaries: { sent?: QuoteSummaryLike | null; approved?: QuoteSummaryLike | null; rejected?: QuoteSummaryLike | null }
): OfferTrendPoint[] {
  const sent = countsByMonth(summaries.sent);
  const approved = countsByMonth(summaries.approved);
  const rejected = countsByMonth(summaries.rejected);
  return buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.short,
    sent: (sent.get(bucket.key) ?? 0) + (approved.get(bucket.key) ?? 0) + (rejected.get(bucket.key) ?? 0),
    approved: approved.get(bucket.key) ?? 0,
  }));
}

/** Web KPI: `Math.round(onaylı / toplam * 100)`; toplam 0 ise 0. */
export function winRate(approved: number, total: number): number {
  return total > 0 ? Math.round((approved / total) * 100) : 0;
}

/** Durum dağılımı yüzdesi (0–100, tek ondalık). */
export function sharePercent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

/**
 * Web "En sık ret nedeni": kayıp satış kartlarının neden adı sayılır, boş neden
 * "Neden belirtilmemiş" olarak gruplanır. En sık olan [ad, adet] döner.
 */
export function topRejectionReason(
  lostCases: { lostReason?: { name?: string | null } | null }[]
): { reason: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const item of lostCases) {
    const reason = item.lostReason?.name?.trim() || 'Neden belirtilmemiş';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  let best: { reason: string; count: number } | null = null;
  for (const [reason, count] of counts) {
    if (!best || count > best.count) best = { reason, count };
  }
  return best;
}

export type BusinessLine = 'CNC' | 'UNI' | 'SACISLE';

/** Bölüm kodu → teklif listesi `businessLine` filtresi (quotes.service quoteListFilters). */
export function businessLineForDivision(code: string | null | undefined): BusinessLine | undefined {
  switch ((code ?? '').toLowerCase()) {
    case 'cnc':
      return 'CNC';
    case 'universal':
      return 'UNI';
    case 'sac_isleme':
      return 'SACISLE';
    default:
      return undefined;
  }
}

/** Web teklif sekmeleri. Grup sekmeleri birden çok durum kodunu birleştirir. */
export type QuoteTabKey = 'all' | 'draft' | 'sent' | 'follow-up' | 'approved' | 'closed';

export const QUOTE_TABS: { value: QuoteTabKey; label: string; statusCodes: string[] }[] = [
  { value: 'all', label: 'Tümü', statusCodes: [] },
  { value: 'draft', label: 'Taslak', statusCodes: ['draft'] },
  { value: 'sent', label: 'Gönderilen', statusCodes: ['sent'] },
  { value: 'follow-up', label: 'Takip', statusCodes: ['price_waiting', 'budget_waiting', 'on_hold', 'postponed'] },
  { value: 'approved', label: 'Onaylı', statusCodes: ['approved'] },
  { value: 'closed', label: 'Red / İptal', statusCodes: ['rejected', 'cancelled'] },
];

export function statusCodesForTab(tab: QuoteTabKey): string[] {
  return QUOTE_TABS.find((entry) => entry.value === tab)?.statusCodes ?? [];
}

/** Web Excel dışa aktarımı: yalnız tekil durum sekmesinde `statusCode` gider. */
export function exportQueryForTab(tab: QuoteTabKey, search: string): Record<string, string> {
  const codes = statusCodesForTab(tab);
  return {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(codes.length === 1 ? { statusCode: codes[0] } : {}),
  };
}

type Sortable = { id: string; documentNo: string; revisionNo: number };

/**
 * Grup sekmesi sayfalarını birleştirir: çift kayıtlar atılır, web listesi gibi
 * teklif no azalan + aynı no için revizyon azalan sıralanır.
 */
export function mergeQuotePages<T extends Sortable>(pages: T[][]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const page of pages) {
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged.sort((a, b) => {
    const cmp = b.documentNo.localeCompare(a.documentNo, 'tr', { numeric: true, sensitivity: 'base' });
    return cmp !== 0 ? cmp : (b.revisionNo ?? 0) - (a.revisionNo ?? 0);
  });
}

/* -------------------------------------------------------- kalem düzenleme ---- */

/** tr-TR ("1.234,56") veya düz ("1234.56") girdiyi sayıya çevirir; geçersizse NaN. */
export function parseDecimal(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return Number.NaN;
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) normalized = cleaned.replace(/\./g, '').replace(',', '.');
  else if (cleaned.includes(',')) normalized = cleaned.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export type QuoteDiscountType = 'percent' | 'amount';

export type QuoteSelectedOptionDraft = {
  optionSetId: string;
  optionValueId: string;
  name: string;
  value: string;
  priceDelta: number;
  currencyCode: string;
};

export type QuoteOptionChildDraft = {
  key: string;
  itemId?: string;
  optionSetId?: string;
  productModelId?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  discountType: QuoteDiscountType;
  vatRate: string;
};

export type QuoteTechnicalSpecDraft = { key: string; value: string; unit?: string };

export type EditableQuoteItem = {
  key: string;
  /** Kayıtlı kalem kimliği; yeni satırlarda yok. */
  itemId?: string;
  productModelId?: string;
  stockCode?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  /** Web gibi % veya tutar; API’ye her zaman tutar (`discountAmount`) gider. */
  discount: string;
  discountType: QuoteDiscountType;
  vatRate: string;
  productTypeCode?: string;
  categoryCode?: string;
  /** Lazer resolve için ürün markası. */
  brandId?: string;
  nationalized: boolean;
  /** Web `lineGroupKey` — ana ürün + opsiyon satırlarını bağlar. */
  lineGroupKey: string;
  selectedProductOptions: QuoteSelectedOptionDraft[];
  technicalSpecs: QuoteTechnicalSpecDraft[];
  technicalConfiguration: unknown | null;
  /** CNC uyumluluk çoklu seçimleri. */
  compatibilityFilters: {
    machineIds: string[];
    brands: string[];
    controlUnits: string[];
    supplierIds: string[];
  };
  /** TEZGAH altındaki manuel opsiyon satırları (↳ Opsiyon: …). */
  optionChildren: QuoteOptionChildDraft[];
  /** Düzenlemede seçenek değiştiyse zorunlu doğrulama tetiklenir. */
  configurationChanged: boolean;
};

export type ParsedQuoteItem = {
  itemId?: string;
  productModelId?: string;
  stockCode?: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  discountAmount: number;
  vatRate: number;
  sortOrder: number;
  nationalized?: boolean;
  compatibility?: {
    lineGroupKey?: string;
    configurationOptionSetId?: string;
    machineIds?: string[];
    brands?: string[];
    controlUnits?: string[];
    supplierIds?: string[];
    technicalSpecs?: QuoteTechnicalSpecDraft[];
    technicalConfiguration?: unknown | null;
    selectedProductOptions?: QuoteSelectedOptionDraft[];
  } | null;
};

let lineGroupCounter = 0;
export function newLineGroupKey(): string {
  lineGroupCounter += 1;
  return `lg-${Date.now()}-${lineGroupCounter}`;
}

export function emptyCompatibilityFilters() {
  return { machineIds: [] as string[], brands: [] as string[], controlUnits: [] as string[], supplierIds: [] as string[] };
}

/** Web QuoteDialog DELIVERY_TERMS — seçince metin + ithalat bayrağı dolar. */
export const QUOTE_DELIVERY_PRESETS = [
  { code: 'cif_istanbul', label: 'Tezgah CİF İstanbul', importCostsExcluded: true },
  { code: 'export_address', label: 'İhracat Adrese Teslim', importCostsExcluded: true },
  { code: 'nationalized', label: 'Millileştirilmiş Teklif', importCostsExcluded: false },
  { code: 'customs', label: 'Gümrük Teklif', importCostsExcluded: true },
  { code: 'ex_works', label: 'İşletme Teslim', importCostsExcluded: false },
  { code: 'fob', label: 'F.O.B Teslim', importCostsExcluded: true },
] as const;

function parseLineMoney(
  label: string,
  quantityRaw: string,
  unitPriceRaw: string,
  discountRawStr: string,
  discountType: QuoteDiscountType,
  vatRateRaw: string,
): { quantity: number; unitPrice: number; discountAmount: number; vatRate: number; error: string | null } {
  const quantity = parseDecimal(quantityRaw);
  if (!(quantity > 0)) return { quantity: 0, unitPrice: 0, discountAmount: 0, vatRate: 0, error: `${label}: adet sıfırdan büyük olmalı.` };
  if (Math.abs(Math.round(quantity * 1000) - quantity * 1000) > 1e-6) {
    return { quantity: 0, unitPrice: 0, discountAmount: 0, vatRate: 0, error: `${label}: adet en fazla 3 ondalık olabilir.` };
  }
  const unitPrice = parseDecimal(unitPriceRaw);
  if (!(unitPrice >= 0)) return { quantity: 0, unitPrice: 0, discountAmount: 0, vatRate: 0, error: `${label}: geçerli bir birim fiyat girin.` };
  const discountRaw = discountRawStr.trim() ? parseDecimal(discountRawStr) : 0;
  if (!(discountRaw >= 0)) return { quantity: 0, unitPrice: 0, discountAmount: 0, vatRate: 0, error: `${label}: geçerli bir iskonto girin.` };
  if (discountType === 'percent' && discountRaw > 100) {
    return { quantity: 0, unitPrice: 0, discountAmount: 0, vatRate: 0, error: `${label}: iskonto oranı 0–100 arasında olmalı.` };
  }
  const gross = quantity * unitPrice;
  const discountAmount = discountType === 'percent' ? Number(((gross * discountRaw) / 100).toFixed(4)) : discountRaw;
  if (discountAmount > gross + 0.0001) {
    return { quantity: 0, unitPrice: 0, discountAmount: 0, vatRate: 0, error: `${label}: satır iskontosu brüt tutarı aşamaz.` };
  }
  const vatRate = vatRateRaw.trim() ? parseDecimal(vatRateRaw) : 20;
  if (!(vatRate >= 0 && vatRate <= 100)) {
    return { quantity: 0, unitPrice: 0, discountAmount: 0, vatRate: 0, error: `${label}: KDV 0–100 arasında olmalı.` };
  }
  return { quantity, unitPrice, discountAmount, vatRate, error: null };
}

/**
 * Kalemleri doğrular ve API gövdesine çevirir. Kurallar
 * `quoteItemCreateSchema` ile aynı. Ana ürün + opsiyon çocuk satırları düzleştirilir;
 * `compatibility` web QuoteDialog ile aynı yapıda gider.
 */
export function parseQuoteItems(items: EditableQuoteItem[]): { items: ParsedQuoteItem[]; error: string | null } {
  const filled = items.filter((item) => item.description.trim() || item.unitPrice.trim());
  if (filled.length === 0) return { items: [], error: 'En az bir kalem girin.' };
  const parsed: ParsedQuoteItem[] = [];
  let sortOrder = 0;
  for (const [index, item] of filled.entries()) {
    const label = `${index + 1}. kalem`;
    const description = item.description.trim();
    if (!description) return { items: [], error: `${label}: açıklama zorunludur.` };
    if (description.length > 2000) return { items: [], error: `${label}: açıklama 2000 karakteri aşamaz.` };
    const money = parseLineMoney(label, item.quantity, item.unitPrice, item.discount, item.discountType, item.vatRate);
    if (money.error) return { items: [], error: money.error };

    const filters = item.compatibilityFilters;
    const hasFilters =
      filters.machineIds.length + filters.brands.length + filters.controlUnits.length + filters.supplierIds.length > 0;
    const technicalSpecs = item.technicalSpecs.filter((spec) => spec.key.trim() && spec.value.trim());
    const selectedProductOptions = item.selectedProductOptions.map((option) => ({
      ...option,
      priceDelta: Number(option.priceDelta) || 0,
      currencyCode: option.currencyCode || '',
    }));
    const lineGroupKey = item.lineGroupKey || newLineGroupKey();
    const compatibility = {
      lineGroupKey,
      selectedProductOptions,
      ...(hasFilters
        ? {
            machineIds: filters.machineIds,
            brands: filters.brands,
            controlUnits: filters.controlUnits,
            supplierIds: filters.supplierIds,
          }
        : { machineIds: [], brands: [], controlUnits: [], supplierIds: [] }),
      ...(technicalSpecs.length || item.technicalConfiguration ? { technicalSpecs } : {}),
      technicalConfiguration: item.technicalConfiguration ?? null,
    };

    parsed.push({
      ...(item.itemId ? { itemId: item.itemId } : {}),
      ...(item.productModelId ? { productModelId: item.productModelId } : {}),
      ...(item.stockCode?.trim() ? { stockCode: item.stockCode.trim() } : {}),
      description,
      quantity: money.quantity,
      unitCode: 'adet',
      unitPrice: money.unitPrice,
      discountAmount: money.discountAmount,
      vatRate: money.vatRate,
      sortOrder: sortOrder++,
      ...(item.nationalized ? { nationalized: true } : {}),
      compatibility,
    });

    for (const [optIndex, child] of item.optionChildren.entries()) {
      if (!child.description.trim() && !child.unitPrice.trim()) continue;
      const optLabel = `${label} opsiyon ${optIndex + 1}`;
      const optDescription = child.description.trim().startsWith('↳')
        ? child.description.trim()
        : `↳ Opsiyon: ${child.description.trim() || 'Opsiyonel donanım'}`;
      if (optDescription.length > 2000) return { items: [], error: `${optLabel}: açıklama 2000 karakteri aşamaz.` };
      const optMoney = parseLineMoney(
        optLabel,
        child.quantity || '1',
        child.unitPrice || '0',
        child.discount,
        child.discountType,
        child.vatRate || item.vatRate,
      );
      if (optMoney.error) return { items: [], error: optMoney.error };
      parsed.push({
        ...(child.itemId ? { itemId: child.itemId } : {}),
        ...(child.productModelId ? { productModelId: child.productModelId } : {}),
        description: optDescription,
        quantity: optMoney.quantity,
        unitCode: 'adet',
        unitPrice: optMoney.unitPrice,
        discountAmount: optMoney.discountAmount,
        vatRate: optMoney.vatRate,
        sortOrder: sortOrder++,
        compatibility: {
          lineGroupKey,
          ...(child.optionSetId ? { configurationOptionSetId: child.optionSetId } : {}),
          machineIds: [],
          brands: [],
          controlUnits: [],
          supplierIds: [],
        },
      });
    }
  }
  return { items: parsed, error: null };
}

/** Teklif kalemlerinin net toplamı (adet × fiyat − iskonto); fırsat tahmini tutarı buradan. */
export function itemsNetTotal(items: Pick<ParsedQuoteItem, 'quantity' | 'unitPrice' | 'discountAmount'>[]): number {
  return Number(items.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discountAmount, 0).toFixed(4));
}

export type QuoteItemPlan = {
  update: { itemId: string; body: Omit<ParsedQuoteItem, 'itemId'> }[];
  add: Omit<ParsedQuoteItem, 'itemId'>[];
  remove: string[];
};

/**
 * Web `persistQuoteItems`: kimliği olan satır güncellenir, yeni satır eklenir,
 * formdan çıkarılan kayıtlı satır silinir. Sıra formdaki sıradır.
 */
export function planQuoteItemChanges(existingIds: string[], items: ParsedQuoteItem[]): QuoteItemPlan {
  const retained = new Set(items.map((item) => item.itemId).filter((id): id is string => Boolean(id)));
  const plan: QuoteItemPlan = { update: [], add: [], remove: [] };
  items.forEach((item, index) => {
    const { itemId, ...body } = item;
    const ordered = { ...body, sortOrder: index };
    if (itemId && existingIds.includes(itemId)) plan.update.push({ itemId, body: ordered });
    else plan.add.push(ordered);
  });
  plan.remove = existingIds.filter((id) => !retained.has(id));
  return plan;
}

/** Teklif tarihi + geçerlilik günü → son geçerlilik tarihi. */
export function validUntil(quoteDate: string | null | undefined, validityDays: number): Date | null {
  if (!quoteDate) return null;
  const start = new Date(quoteDate).getTime();
  if (!Number.isFinite(start)) return null;
  return new Date(start + validityDays * 86_400_000);
}

/** `YYYY-AA-GG` metnini yerel gün başına çevirir; geçersizse null. */
export function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) {
    return null;
  }
  return date;
}

/** Yerel tarihi `YYYY-AA-GG` olarak yazar (form varsayılanları için). */
export function formatDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
