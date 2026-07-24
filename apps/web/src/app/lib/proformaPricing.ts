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

/** Teklif iskontolarını fiyata yedirerek iskontosuz proforma satırları üretir. */
export function quoteToProformaPriceRows(quote: QuoteLike): ProformaPriceRow[] {
  const items = quote.items ?? [];
  const lineDiscount = items.reduce((sum, item) => sum + numberValue(item.discountAmount), 0);
  const headerDiscount = Math.max(numberValue(quote.discountTotal) - lineDiscount, 0);
  const taxableBeforeHeader = items.reduce((sum, item) => {
    const quantity = numberValue(item.quantity);
    const fallback = quantity * numberValue(item.unitPrice) - numberValue(item.discountAmount);
    return sum + numberValue(item.lineTotal ?? fallback);
  }, 0);
  const headerRatio = taxableBeforeHeader > 0
    ? Math.max(0, taxableBeforeHeader - headerDiscount) / taxableBeforeHeader
    : 1;

  return items.map((item) => {
    const quantity = numberValue(item.quantity);
    const fallback = quantity * numberValue(item.unitPrice) - numberValue(item.discountAmount);
    const lineTotal = numberValue(item.lineTotal ?? fallback) * headerRatio;
    return {
      quoteItemId: String(item.id ?? ""),
      description: String(item.description ?? "").trim(),
      quantity,
      unitPrice: money(quantity > 0 ? lineTotal / quantity : 0),
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
