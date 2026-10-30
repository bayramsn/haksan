import type { EditableQuoteItem } from './quote-logic';

/** Web QuoteDialog effVatRate: hesaplama kapalıysa ana ve opsiyon satırları vergisiz gider. */
export function effectiveQuoteVat(items: EditableQuoteItem[], enabled: boolean): EditableQuoteItem[] {
  if (enabled) return items;
  return items.map((item) => ({
    ...item,
    vatRate: '0',
    optionChildren: item.optionChildren.map((child) => ({ ...child, vatRate: '0' })),
  }));
}
