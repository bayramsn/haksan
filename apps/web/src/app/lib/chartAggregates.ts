import type { Offer, Payment, SalesCase } from './mock';

const TR_MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** Son N ay için teklif trendi (gönderilen / onaylanan). */
export function buildOfferTrend(offers: Offer[], months = 6) {
  const now = new Date();
  const buckets: { ay: string; gonderilen: number; onaylanan: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = offers.filter((o) => String(o.date).startsWith(key));
    buckets.push({
      ay: TR_MONTH_SHORT[d.getMonth()],
      gonderilen: inMonth.filter((o) => o.status === 'Sent' || o.status === 'Approved' || o.status === 'Rejected').length,
      onaylanan: inMonth.filter((o) => o.status === 'Approved').length,
    });
  }
  return buckets;
}

/** Dashboard satış performansı: teklif, kazanan, kayıp, ciro (bin USD). */
export function buildSalesMonthly(
  offers: Offer[],
  cases: SalesCase[],
  months = 12,
  convertToUsd: (amount: number, currency: string) => number,
) {
  const now = new Date();
  const buckets: { ay: string; teklif: number; kazanan: number; kayip: number; ciro: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthOffers = offers.filter((o) => String(o.date).startsWith(key));
    const monthCases = cases.filter((c) => String(c.createdAt ?? '').startsWith(key));
    const approved = monthOffers.filter((o) => o.status === 'Approved');
    const lost = monthCases.filter((c) => c.isLost);
    buckets.push({
      ay: TR_MONTH_SHORT[d.getMonth()],
      teklif: monthOffers.length,
      kazanan: approved.length,
      kayip: lost.length,
      ciro: Math.round(approved.reduce((a, o) => a + convertToUsd(o.amount, o.currency), 0) / 1000),
    });
  }
  return buckets;
}

/** Ödeme kasa grafiği — aylık tahsilat / beklenen / gecikmiş (bin USD). */
export function buildPaymentMonthly(
  payments: Payment[],
  months = 6,
  convertToUsd: (amount: number, currency: string) => number,
) {
  const now = new Date();
  const buckets: { ay: string; tahsilat: number; beklenen: number; gecikmis: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = payments.filter((p) => String(p.paymentDate ?? p.dueDate).startsWith(key));
    const paid = inMonth.filter((p) => p.status === 'Paid' && p.direction !== 'out');
    const pending = inMonth.filter((p) => p.status === 'Pending');
    const overdue = inMonth.filter((p) => p.status === 'Overdue');
    const sum = (rows: Payment[]) =>
      Math.round(rows.reduce((a, p) => a + convertToUsd(p.amount, p.currency), 0) / 1000);
    buckets.push({
      ay: TR_MONTH_SHORT[d.getMonth()],
      tahsilat: sum(paid),
      beklenen: sum(pending),
      gecikmis: sum(overdue),
    });
  }
  return buckets;
}

/** Para birimi dağılımı (ödenen tahsilatlar). */
export function buildCurrencyPie(payments: Payment[]) {
  const paidIn = payments.filter((p) => p.status === 'Paid' && p.direction !== 'out');
  const totals = new Map<string, number>();
  for (const p of paidIn) {
    totals.set(p.currency, (totals.get(p.currency) ?? 0) + p.amount);
  }
  const palette = ['#000c69', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
  return [...totals.entries()].map(([name, value], i) => ({
    name,
    value: Math.round(value),
    fill: palette[i % palette.length],
  }));
}

/** API pipeline-summary satırlarından huni grafiği. */
export function buildPipelineFunnel(
  rows: Array<{ stageName?: string | null; count?: number; sortOrder?: number }>,
) {
  return [...rows]
    .filter((r) => (r.count ?? 0) > 0)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((r, i) => {
      const palette = ['#93c5fd', '#3b82f6', '#000c69', '#0a192f', '#cf060c'];
      return {
        name: r.stageName ?? '—',
        value: r.count ?? 0,
        fill: palette[i % palette.length],
      };
    });
}

/** API pipeline-summary → pasta grafik verisi. */
export function buildPipelineStagePie(
  rows: Array<{ stageName?: string | null; count?: number }>,
) {
  return rows
    .filter((r) => (r.count ?? 0) > 0)
    .map((r) => ({ name: r.stageName ?? '—', count: r.count ?? 0 }));
}

/** Satış hunisi — aşama sayıları (store fallback). */
export function buildFunnelFromCases(cases: SalesCase[], stageLabels: Record<string, string>) {
  const palette = ['#93c5fd', '#3b82f6', '#000c69', '#0a192f', '#cf060c'];
  const stages = [...new Set(cases.map((c) => c.stage))];
  return stages
    .map((stage, i) => ({
      name: stageLabels[stage] ?? stage,
      value: cases.filter((c) => c.stage === stage && !c.isLost).length,
      fill: palette[i % palette.length],
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}
