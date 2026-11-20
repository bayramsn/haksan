export type PaymentTrendRow = {
  direction: string;
  amount: string | number;
  paymentDate: string;
  currency: { code: string } | null;
};

export type MonthlyTotal = { key: string; label: string; total: number };
export type CurrencyMonthlyTotals = { currencyCode: string; months: MonthlyTotal[]; total: number };

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/**
 * Son `months` ayı (bugün dahil, en eskiden en yeniye) ay bazında toplar; kaydı
 * olmayan ay 0 ile listede kalır ki grafik boşluk bırakmasın. `direction` verilirse
 * yalnız o yöndeki kasa hareketleri toplanır (tahsilat = 'in', ödeme = 'out').
 */
export function monthlyTotals(
  rows: PaymentTrendRow[],
  months: number,
  direction?: 'in' | 'out',
  currencyCode?: string,
): MonthlyTotal[] {
  const now = new Date();
  const buckets: MonthlyTotal[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_SHORT[d.getMonth()]!, total: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const row of rows) {
    if (direction && row.direction !== direction) continue;
    const rowCurrency = row.currency?.code?.trim().toUpperCase() || 'TRY';
    if (currencyCode && rowCurrency !== currencyCode.trim().toUpperCase()) continue;
    const d = new Date(row.paymentDate);
    if (Number.isNaN(d.getTime())) continue;
    const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (bucket) bucket.total += Number(row.amount || 0);
  }
  return buckets;
}

/**
 * Parasal toplamları hiçbir zaman farklı para birimleri arasında birleştirmez.
 * Eksik para birimi lookup'ı, finans API'sindeki mevcut varsayımla uyumlu olarak
 * TRY kovasına alınır; sonuç TRY önce, diğerleri alfabetik sıralanır.
 */
export function monthlyTotalsByCurrency(
  rows: PaymentTrendRow[],
  months: number,
  direction?: 'in' | 'out',
): CurrencyMonthlyTotals[] {
  const codes = new Set<string>();
  for (const row of rows) {
    if (direction && row.direction !== direction) continue;
    codes.add(row.currency?.code?.trim().toUpperCase() || 'TRY');
  }
  return [...codes]
    .sort((a, b) => (a === 'TRY' ? -1 : b === 'TRY' ? 1 : a.localeCompare(b)))
    .map((currencyCode) => {
      const currencyMonths = monthlyTotals(rows, months, direction, currencyCode);
      return {
        currencyCode,
        months: currencyMonths,
        total: currencyMonths.reduce((sum, month) => sum + month.total, 0),
      };
    });
}
