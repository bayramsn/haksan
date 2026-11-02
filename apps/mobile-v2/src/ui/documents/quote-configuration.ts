import type { EditableQuoteItem, QuoteConfigurationPriceDraft, QuoteSelectedOptionDraft } from './quote-logic';
export type { QuoteConfigurationPriceDraft } from './quote-logic';

type CatalogValue = { id: string; value: string; priceDelta: string | number | null; currencyCode: string | null; sourceModelCode?: string | null; powerKw?: string | number | null };
export type QuoteConfigurationSet = { id: string; name: string; configurationKind?: string | null; values: CatalogValue[] };
export function quoteOptionSnapshot(set: QuoteConfigurationSet, valueId: string, currency: string): QuoteSelectedOptionDraft {
  const value = set.values.find(row => row.id === valueId);
  if (!value) throw new Error('Donanım seçeneği artık bulunamıyor; yeniden seçin.');
  if (value.priceDelta == null || !Number.isFinite(Number(value.priceDelta)) || Number(value.priceDelta) < 0) throw new Error('Seçeneğin ek fiyatını önce ürün kartından girin.');
  if (!value.currencyCode || value.currencyCode !== currency) throw new Error('Donanım fiyatının para birimi teklif ile aynı olmalı.');
  return { optionSetId: set.id, optionValueId: value.id, name: set.name, value: value.value, priceDelta: Number(value.priceDelta), currencyCode: value.currencyCode };
}
/** Validate before creating any records; untouched saved snapshots remain historical. */
export async function validateQuoteConfigurations(items: EditableQuoteItem[], currency: string, load: (id: string) => Promise<{ sets: QuoteConfigurationSet[]; baseModelConfiguration?: { configurations: unknown[] } | null }>): Promise<void> {
  for (const item of items) {
    if (!item.productModelId || (item.itemId && !item.configurationChanged)) continue;
    const { sets, baseModelConfiguration } = await load(item.productModelId);
    for (const set of sets) {
      const required = set.configurationKind || (baseModelConfiguration && baseModelConfiguration.configurations.length > 1 && set.values.some(value => value.sourceModelCode));
      if (required && !item.selectedProductOptions.some(option => option.optionSetId === set.id)) throw new Error('Makinenin zorunlu konfigürasyon seçeneklerini tamamlayın.');
    }
    for (const selected of item.selectedProductOptions) {
      const set = sets.find(row => row.id === selected.optionSetId);
      if (!set) throw new Error('Donanım fiyatı veya güncel seçenek değişti; yeniden seçin.');
      const current = quoteOptionSnapshot(set, selected.optionValueId, currency);
      if (current.priceDelta !== selected.priceDelta || current.currencyCode !== selected.currencyCode || current.name !== selected.name || current.value !== selected.value) throw new Error('Donanım fiyatı veya güncel seçenek değişti; yeniden seçin.');
    }
  }
}

export function removeQuoteOption(item: EditableQuoteItem, key: string): Partial<EditableQuoteItem> {
  const removed = item.optionChildren.find(row => row.key === key);
  return {
    optionChildren: item.optionChildren.filter(row => row.key !== key),
    ...(removed?.optionSetId ? { selectedProductOptions: item.selectedProductOptions.filter(row => row.optionSetId !== removed.optionSetId), configurationChanged: true, technicalConfiguration: null, configurationPrice: null } : {}),
  };
}

export function updateQuotedTechnicalSpecs(item: EditableQuoteItem, specs: EditableQuoteItem['technicalSpecs']): Partial<EditableQuoteItem> {
  const snapshot = item.technicalConfiguration;
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray((snapshot as { specs?: unknown }).specs)) return { technicalSpecs: specs };
  const original = new Map(((snapshot as { specs: { key: string; value: string; unit?: string; isManual?: boolean }[] }).specs).map(spec => [spec.key, spec]));
  return { technicalSpecs: specs, technicalConfiguration: { ...snapshot, specs: specs.filter(spec => spec.key.trim() && spec.value.trim()).map(spec => {
    const source = original.get(spec.key);
    return { ...source, ...spec, isManual: source?.isManual || !source || source.value !== spec.value || source.unit !== spec.unit };
  }) } };
}

/* ---------------------------------------------- model × güç fiyat matrisi ---- */
/* Web ProductConfigurationOptions `configurationPriceFor` / `matrixPriceRow` + QuoteDialog `changeBaseOptions`. */

export type LaserListCode = 'LAZER-CIF-IST' | 'LAZER-MILLI-IST';
/** GET /products/:id/configuration-prices satırı. */
export type ConfigurationMatrixRow = {
  id: string;
  sourceModelCode: string;
  powerKw: number;
  salePrice: number | null;
  saleCurrencyCode: string | null;
  container?: string | null;
  leadTimeDays?: number | null;
  costPrice?: number | null;
  costCurrencyCode?: string | null;
  listPrices?: Array<{ code: LaserListCode; name: string; listPrice: number; cashPrice: number }>;
};
/** Lazer baz kartlarında teslim şekli fiyat listesini belirler (web `laserPriceListCode`). */
export function laserPriceListForDelivery(deliveryCode: string): LaserListCode | null {
  return deliveryCode === 'cif_istanbul' ? 'LAZER-CIF-IST' : deliveryCode === 'nationalized' ? 'LAZER-MILLI-IST' : null;
}

/** Teslim şekli kaydedilmiyor; lazer liste fiyatlı kalem varsa o listeden geri çıkarılır. */
export function deliveryForSavedPriceList(prices: Array<QuoteConfigurationPriceDraft | null | undefined>): string | null {
  const code = prices.map(price => price?.priceListCode).find(Boolean);
  return code === 'LAZER-CIF-IST' ? 'cif_istanbul' : code === 'LAZER-MILLI-IST' ? 'nationalized' : null;
}

/** Teslim şekli bir lazer listesine karşılık geliyorsa o listenin liste fiyatı, yoksa kartın satış fiyatı. */
export function configurationPriceFor(row: ConfigurationMatrixRow | undefined, priceListCode: LaserListCode | null): { salePrice: number; currencyCode: string; cashPrice?: number; priceListCode?: LaserListCode } | null {
  if (!row) return null;
  const listed = priceListCode ? row.listPrices?.find(price => price.code === priceListCode) : undefined;
  if (listed) return { salePrice: listed.listPrice, currencyCode: 'USD', cashPrice: listed.cashPrice, priceListCode: listed.code };
  return row.salePrice == null || !row.saleCurrencyCode ? null : { salePrice: row.salePrice, currencyCode: row.saleCurrencyCode };
}

/** Seçili tabla (model) ve güç için matris satırı. */
export function matrixPriceRow(sets: QuoteConfigurationSet[], selected: QuoteSelectedOptionDraft[], matrix: ConfigurationMatrixRow[]): { sourceModelCode?: string; powerKw?: number; row?: ConfigurationMatrixRow } {
  const valueOf = (kind: 'table' | 'power') => {
    const set = sets.find(entry => entry.configurationKind === kind);
    const choice = set && selected.find(option => option.optionSetId === set.id);
    return choice ? set.values.find(value => value.id === choice.optionValueId) : undefined;
  };
  const sourceModelCode = valueOf('table')?.sourceModelCode ?? undefined;
  const power = valueOf('power')?.powerKw;
  const powerKw = power == null ? undefined : Number(power);
  const row = sourceModelCode && powerKw != null ? matrix.find(entry => entry.sourceModelCode === sourceModelCode && entry.powerKw === powerKw) : undefined;
  return { sourceModelCode, powerKw, row };
}

export type MatrixNotice = { tone: 'info' | 'error'; message: string };

/**
 * Seçimden kalem fiyatı: matris satırı + (varsa) lazer listesi; para birimi teklifle
 * aynı değilse fiyat yazılmaz. `unitPrice` yalnız fiyat bulunduysa döner.
 */
export function quoteMatrixPrice(sets: QuoteConfigurationSet[], selected: QuoteSelectedOptionDraft[], matrix: ConfigurationMatrixRow[], priceListCode: LaserListCode | null, currency: string): { configurationPrice: QuoteConfigurationPriceDraft | null; unitPrice?: string; notice: MatrixNotice | null } {
  const row = matrix.length ? matrixPriceRow(sets, selected, matrix).row : undefined;
  const price = configurationPriceFor(row, priceListCode);
  const configurationPrice = row && price && price.currencyCode === currency
    ? { sourceModelCode: row.sourceModelCode, powerKw: row.powerKw, salePrice: price.salePrice, currencyCode: price.currencyCode, ...(price.priceListCode ? { priceListCode: price.priceListCode } : {}) }
    : null;
  const notice: MatrixNotice | null = row && !price
    ? { tone: 'info', message: 'Bu model ve güç için satış fiyatı girilmemiş; birim fiyatı elle girin.' }
    : row && price && price.currencyCode !== currency
      ? { tone: 'error', message: `Model fiyatı ${price.currencyCode} cinsinden; teklif para birimini ${price.currencyCode} yapın ya da fiyatı elle girin.` }
      : price?.cashPrice != null
        ? { tone: 'info', message: `Liste fiyatı ${price.salePrice.toLocaleString('tr-TR')} USD · son fiyat ${price.cashPrice.toLocaleString('tr-TR')} USD` }
        : null;
  return { configurationPrice, ...(configurationPrice ? { unitPrice: String(configurationPrice.salePrice) } : {}), notice };
}

/** Matrisli kartta model/güç/kabin makinenin kendisidir: ayrı donanım satırı açılmaz. */
export function matrixConfigurationSetIds(sets: QuoteConfigurationSet[], matrix: ConfigurationMatrixRow[]): Set<string> {
  return new Set(matrix.length ? sets.filter(set => set.configurationKind).map(set => set.id) : []);
}

/** Seçici satırları: güç listesi seçili modelin matristeki güçleriyle sınırlanır, fiyat matristen yazılır. */
export function quoteConfigurationChoices(set: QuoteConfigurationSet, sets: QuoteConfigurationSet[], selected: QuoteSelectedOptionDraft[], matrix: ConfigurationMatrixRow[], priceListCode: LaserListCode | null, currency: string): Array<{ value: string; label: string }> {
  const { sourceModelCode } = matrixPriceRow(sets, selected, matrix);
  const powerRow = (value: CatalogValue) => matrix.find(row => row.sourceModelCode === sourceModelCode && row.powerKw === Number(value.powerKw));
  const values = !matrix.length || set.configurationKind !== 'power' || !sourceModelCode ? set.values : set.values.filter(value => powerRow(value));
  return values.map(value => {
    if (matrix.length && set.configurationKind) {
      if (set.configurationKind !== 'power' || !sourceModelCode) return { value: value.id, label: value.value };
      const price = configurationPriceFor(powerRow(value), priceListCode);
      if (!price) return { value: value.id, label: `${value.value} · satış fiyatı girilmemiş` };
      return { value: value.id, label: `${value.value} · ${price.salePrice.toLocaleString('tr-TR')} ${price.currencyCode}${price.cashPrice != null ? ` (son ${price.cashPrice.toLocaleString('tr-TR')})` : ''}` };
    }
    return { value: value.id, label: `${value.value} · ${value.priceDelta == null ? 'Fiyat yok' : `+${value.priceDelta} ${value.currencyCode ?? currency}`}` };
  });
}

/** Ürün detayı: satırları baz kartın alt model sırasıyla gruplar; listede olmayan kodlar sona (web `groupPriceRows`). */
export function groupPriceRows<T extends { sourceModelCode: string; powerKw: number }>(rows: T[], modelOrder: readonly string[] = []): Array<{ model: string; rows: T[] }> {
  const order = (code: string) => {
    const index = modelOrder.indexOf(code);
    return index < 0 ? modelOrder.length : index;
  };
  const models = [...new Set(rows.map(row => row.sourceModelCode))].sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'tr'));
  return models.map(model => ({ model, rows: rows.filter(row => row.sourceModelCode === model).sort((a, b) => a.powerKw - b.powerKw) }));
}

/** Matristeki lazer listeleri (kod → ad, "Fiber Lazer Kesim – " öneki atılır). */
export function matrixPriceLists(rows: ConfigurationMatrixRow[]): Array<{ code: LaserListCode; name: string }> {
  return [...new Map(rows.flatMap(row => row.listPrices ?? []).map(price => [price.code, price.name.replace(/^Fiber Lazer Kesim – /, '')])).entries()].map(([code, name]) => ({ code, name }));
}
