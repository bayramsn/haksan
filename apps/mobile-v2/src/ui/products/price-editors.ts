import {
  laserCostFormulaSchema,
  laserPriceListRecalculateSchema,
  productConfigurationPriceUpdateSchema,
  type LaserCostFormula,
  type LaserPriceListCode,
} from '@haksan/shared';

/**
 * Fiyat Listeleri alt bölümleri — web `LaserPriceLists.tsx` ve
 * `ConfigurationPriceEditor.tsx` (PriceRowsEditor) kurallarının taşıması.
 * Gövdeler sunucunun kullandığı paylaşılan zod şemalarıyla doğrulanır.
 */

export const SALE_CURRENCIES = ['USD', 'EUR', 'TRY'] as const;
export type SaleCurrency = (typeof SALE_CURRENCIES)[number];
export type PriceDraft = { salePrice: string; currency: SaleCurrency };
/** Fiyatı düzenlenen satırın ortak alanları; maliyet yalnız yetkiliye gelir. */
export type PricedRow = {
  id: string;
  salePrice: number | null;
  saleCurrencyCode: string | null;
  costPrice?: number | null;
  costCurrencyCode?: string | null;
};
export type SaleUpdateRow = { id: string; salePrice: number | null; saleCurrencyCode: SaleCurrency };

export const asCurrency = (code: string | null | undefined): SaleCurrency =>
  SALE_CURRENCIES.includes(code as SaleCurrency) ? (code as SaleCurrency) : 'USD';

/** "30.000,50" (TR), "30.000" (binlik) ve "30000.5" yazımlarını ayırt eder; boş = null, geçersiz = undefined. */
export function parsePrice(value: string): number | null | undefined {
  const raw = value.trim().replace(/\s/g, '');
  if (!raw) return null;
  const text = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, '')
      : raw;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

/**
 * Kayıtlı sayıyı taslak metnine çevirir: ondalık virgül, binlik ayırıcı yok.
 * `String(1.125)` = "1.125" `parsePrice`'ta binlik sayılıp 1125 olurdu; "1,125" geri 1.125 okunur.
 */
export const draftNumber = (value: number) => String(value).replace('.', ',');

/** Web ile aynı yetki: süper admin ya da `price_lists.update`. */
export function canEditPrices(user: { roles?: readonly string[]; permissions?: readonly string[] } | null): boolean {
  return Boolean(user?.roles?.includes('super_admin') || user?.permissions?.includes('price_lists.update'));
}

/** Satırın düzenleme taslağı; dokunulmamışsa kayıtlı değerden üretilir. */
export function draftFor(row: PricedRow, drafts: Record<string, PriceDraft>): PriceDraft {
  return (
    drafts[row.id] ?? {
      salePrice: row.salePrice == null ? '' : draftNumber(row.salePrice),
      currency: asCurrency(row.saleCurrencyCode ?? row.costCurrencyCode),
    }
  );
}

/**
 * Alış maliyetine kâr oranı uygular: satış = maliyet × (1 + oran/100), tam birime yuvarlanır.
 * Maliyeti olmayan satır atlanır; `onlyEmpty` ile fiyatı girilmiş satırlara dokunulmaz.
 */
export function applyMarkup(
  rows: PricedRow[],
  drafts: Record<string, PriceDraft>,
  percent: number,
  onlyEmpty: boolean,
): Record<string, PriceDraft> {
  const next = { ...drafts };
  for (const row of rows) {
    if (row.costPrice == null) continue;
    const current = next[row.id]?.salePrice ?? (row.salePrice == null ? '' : draftNumber(row.salePrice));
    if (onlyEmpty && current.trim()) continue;
    next[row.id] = { salePrice: String(Math.round(row.costPrice * (1 + percent / 100))), currency: asCurrency(row.costCurrencyCode) };
  }
  return next;
}

/** Kâr oranı metni: 0–1000 arası sayı, değilse null. */
export function parseMarkupPercent(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(value) && value >= 0 && value <= 1000 ? value : null;
}

/** Kayıtlı değerden farklı olan taslaklar (web `dirty`). */
export function dirtyDrafts(rows: PricedRow[], drafts: Record<string, PriceDraft>): Array<[string, PriceDraft]> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return Object.entries(drafts).filter(([id, draft]) => {
    const row = byId.get(id);
    return Boolean(
      row && (parsePrice(draft.salePrice) !== row.salePrice || (draft.salePrice.trim() && draft.currency !== asCurrency(row.saleCurrencyCode))),
    );
  });
}

export type SaleUpdateResult = { ok: true; rows: SaleUpdateRow[] } | { ok: false; error: string };

/** PATCH gövdesi: `productConfigurationPriceUpdateSchema` (1–500 satır, negatif olmayan fiyat). */
export function buildSaleUpdate(rows: PricedRow[], drafts: Record<string, PriceDraft>): SaleUpdateResult {
  const dirty = dirtyDrafts(rows, drafts);
  if (!dirty.length) return { ok: false, error: 'Kaydedilecek değişiklik yok.' };
  if (dirty.some(([, draft]) => parsePrice(draft.salePrice) === undefined)) return { ok: false, error: 'Satış fiyatları sayı olmalı.' };
  if (dirty.length > 500) return { ok: false, error: 'Tek seferde en fazla 500 satır kaydedilebilir.' };
  const body = {
    rows: dirty.map(([id, draft]) => ({ id, salePrice: parsePrice(draft.salePrice) ?? null, saleCurrencyCode: draft.currency })),
  };
  const parsed = productConfigurationPriceUpdateSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'Satış fiyatları geçersiz (en fazla 4 ondalık, negatif olamaz).' };
  return { ok: true, rows: body.rows };
}

/** Kâr yüzdesi; maliyet yoksa ya da para birimleri farklıysa null. */
export function marginPercent(row: PricedRow, draft: PriceDraft): number | null {
  const sale = parsePrice(draft.salePrice);
  return row.costPrice && sale != null && draft.currency === row.costCurrencyCode ? ((sale - row.costPrice) / row.costPrice) * 100 : null;
}

export function filterPricedRows<T>(
  rows: T[],
  filterOf: (row: T) => string,
  filter: string,
  searchText: (row: T) => string,
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase('tr-TR');
  return rows.filter(
    (row) => (!filter || filterOf(row) === filter) && (!needle || searchText(row).toLocaleLowerCase('tr-TR').includes(needle)),
  );
}

export const uniqueSorted = (values: string[]) =>
  [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr'));

/* ------------------------------------------------------- lazer listeleri ---- */

type FormulaKey = keyof LaserCostFormula;
export type FormulaDraft = Record<FormulaKey, string>;

/** Oranlar formülde ondalık (0,25), ekranda yüzde (25) tutulur. */
export const FORMULA_FIELDS: Array<{ key: FormulaKey; label: string; percent?: boolean }> = [
  { key: 'appearanceUsd', label: 'HEX görünüm (USD)' },
  { key: 'freight20Usd', label: "20' konteyner (USD)" },
  { key: 'freight40Usd', label: "40' konteyner (USD)" },
  { key: 'dutyRate', label: 'Gümrük vergisi (%)', percent: true },
  { key: 'fixedUsd', label: 'Sabit giderler (USD)' },
  { key: 'listMarkup', label: 'Liste kârı (%)', percent: true },
  { key: 'cashMarkup', label: 'Son fiyat kârı (%)', percent: true },
];

export const LASER_LIST_LABELS: Record<LaserPriceListCode, string> = {
  'LAZER-CIF-IST': 'CIF İstanbul Gümrük Teslim',
  'LAZER-MILLI-IST': 'Millileştirilmiş Antrepo Teslim',
};

export const formulaToDraft = (formula: LaserCostFormula): FormulaDraft =>
  Object.fromEntries(
    FORMULA_FIELDS.map(({ key, percent }) => [key, draftNumber(percent ? Math.round(formula[key] * 10000) / 100 : formula[key])]),
  ) as FormulaDraft;

/** Taslağı formüle çevirir; boş/geçersiz alan ya da sunucu sınırı dışı değer varsa null. */
export function draftToFormula(draft: FormulaDraft): LaserCostFormula | null {
  const entries = FORMULA_FIELDS.map(({ key, percent }) => {
    const value = parsePrice(draft[key] ?? '');
    return [key, value == null ? null : percent ? value / 100 : value] as const;
  });
  if (entries.some(([, value]) => value == null)) return null;
  const parsed = laserCostFormulaSchema.safeParse(Object.fromEntries(entries));
  return parsed.success ? parsed.data : null;
}

/** POST /laser-price-lists/recalculate gövdesi (sunucu şemasıyla doğrulanmış). */
export function buildRecalculateBody(code: string, draft: FormulaDraft | null, apply: boolean) {
  const formula = draft ? draftToFormula(draft) : null;
  if (!formula) return null;
  const parsed = laserPriceListRecalculateSchema.safeParse({ code, formula, apply });
  return parsed.success ? parsed.data : null;
}

export type LaserRow = {
  configurationPriceId: string;
  listPrice: number | null;
  cashPrice: number | null;
  cost?: number | null;
};
export type LaserPreviewRow = { configurationPriceId: string; listPrice: number; cashPrice: number; cost: number };

/** Önizleme satırını kayıtlı satırın üzerine bindirir; fiyatı değişenleri işaretler. */
export function mergeLaserPreview<T extends LaserRow>(rows: T[], preview: LaserPreviewRow[] | null | undefined) {
  const byId = new Map((preview ?? []).map((row) => [row.configurationPriceId, row]));
  return rows.map((row) => {
    const next = byId.get(row.configurationPriceId);
    const changed = Boolean(next && (next.listPrice !== row.listPrice || next.cashPrice !== row.cashPrice));
    return {
      row,
      changed,
      cost: next ? next.cost : (row.cost ?? null),
      listPrice: next ? next.listPrice : row.listPrice,
      cashPrice: next ? next.cashPrice : row.cashPrice,
    };
  });
}

export const formatUsd = (value: number | null | undefined) => (value == null ? '—' : `${value.toLocaleString('tr-TR')} USD`);
export const formatAmount = (value: number | null | undefined, currency: string | null | undefined) =>
  value == null ? '—' : `${value.toLocaleString('tr-TR')} ${currency ?? ''}`.trim();
