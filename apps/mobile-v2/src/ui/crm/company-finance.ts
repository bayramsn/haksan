type CurrencyAmount = { currencyCode: string; amount: number };
const closedQuotes = new Set(['approved', 'rejected', 'expired', 'cancelled']);

/** No conversion is implied: each currency retains its own amount. */
export function openQuoteTotals(quotes: readonly { grandTotal: string | number | null; status?: { code: string } | null; currency?: { code: string } | null }[]): CurrencyAmount[] {
  const totals = new Map<string, number>();
  for (const quote of quotes) {
    if (closedQuotes.has(quote.status?.code ?? '')) continue;
    const amount = Number(quote.grandTotal ?? 0);
    if (!Number.isFinite(amount)) continue;
    const code = quote.currency?.code?.trim().toUpperCase() || '—';
    totals.set(code, (totals.get(code) ?? 0) + amount);
  }
  return [...totals].map(([currencyCode, amount]) => ({ currencyCode, amount }));
}

export function formatCurrencyAmounts(rows: readonly CurrencyAmount[], format: (amount: number, code: string) => string): string {
  return rows.length ? rows.map(row => row.currencyCode === '—' ? `${row.amount.toLocaleString('tr-TR')} (para birimi belirtilmedi)` : format(row.amount, row.currencyCode)).join(' · ') : '—';
}
