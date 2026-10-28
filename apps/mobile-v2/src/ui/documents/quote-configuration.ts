import type { EditableQuoteItem, QuoteSelectedOptionDraft } from './quote-logic';

type CatalogValue = { id: string; value: string; priceDelta: string | number | null; currencyCode: string | null; sourceModelCode?: string | null };
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
    ...(removed?.optionSetId ? { selectedProductOptions: item.selectedProductOptions.filter(row => row.optionSetId !== removed.optionSetId), configurationChanged: true, technicalConfiguration: null } : {}),
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
