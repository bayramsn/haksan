export type ProformaPriceRow = {
  quoteItemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
};

type QuoteItemLike = {
  id?: unknown;
  description?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  discountAmount?: unknown;
  lineTotal?: unknown;
  vatRate?: unknown;
};

type QuoteLike = {
  discountTotal?: unknown;
  items?: QuoteItemLike[];
};

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number) => Number(value.toFixed(4));

/** Teklifin brüt birim fiyatlarını proforma düzenleme satırlarına taşır. */
export function quoteToProformaPriceRows(quote: QuoteLike): ProformaPriceRow[] {
  const items = quote.items ?? [];
  return items.map((item) => {
    const quantity = numberValue(item.quantity);
    return {
      quoteItemId: String(item.id ?? ""),
      description: String(item.description ?? "").trim(),
      quantity,
      unitPrice: money(numberValue(item.unitPrice)),
      vatRate: numberValue(item.vatRate),
    };
  });
}

export function snapshotToProformaPriceRows(snapshot: Record<string, any> | undefined): ProformaPriceRow[] {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  return items.map((item: any) => ({
    quoteItemId: String(item.id ?? item.quoteItemId ?? ""),
    description: String(item.description ?? "").trim(),
    quantity: numberValue(item.quantity),
    unitPrice: money(numberValue(item.unitPrice)),
    vatRate: numberValue(item.vatRate),
  }));
}
