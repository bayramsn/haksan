import type { Offer, Payment, QualificationStage, SalesCase } from './mock';

const TR_MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export const DASHBOARD_QUALIFICATION_STAGES = ['c', 'b', 'a', 'a_plus', 'win'] as const satisfies readonly QualificationStage[];
export type DashboardQualificationStage = (typeof DASHBOARD_QUALIFICATION_STAGES)[number];

/** Dashboard satış dereceleri — sıcaklık yerine gerçek C → WIN akışını sayar. */
export function buildQualificationStageSummary(
  cases: readonly Pick<SalesCase, 'qualificationStage'>[],
): Array<{ stage: DashboardQualificationStage; count: number }> {
  return DASHBOARD_QUALIFICATION_STAGES.map((stage) => ({
    stage,
    count: cases.filter((salesCase) => salesCase.qualificationStage === stage).length,
  }));
}

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
    const inMonth = payments.filter((p) => String(p.paidDate ?? p.dueDate).startsWith(key));
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

/**
 * API pipeline-summary satırlarından huni grafiği. `stage` kodu drill-down için
 * taşınır: grafik elemanına tıklanınca aşamanın karşılığı olan satış derecesine
 * filtrelenmiş fırsat listesine gidilir.
 */
export function buildPipelineFunnel(
  rows: Array<{ stageCode?: string | null; stageName?: string | null; count?: number; sortOrder?: number }>,
) {
  return [...rows]
    .filter((r) => (r.count ?? 0) > 0)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((r, i) => {
      const palette = ['#93c5fd', '#3b82f6', '#000c69', '#0a192f', '#cf060c'];
      return {
        name: r.stageName ?? '—',
        stage: r.stageCode ?? null,
        value: r.count ?? 0,
        fill: palette[i % palette.length],
      };
    });
}

/** API pipeline-summary → pasta grafik verisi. */
export function buildPipelineStagePie(
  rows: Array<{ stageCode?: string | null; stageName?: string | null; count?: number }>,
) {
  return rows
    .filter((r) => (r.count ?? 0) > 0)
    .map((r) => ({ name: r.stageName ?? '—', stage: r.stageCode ?? null, count: r.count ?? 0 }));
}

/** Satış hunisi — aşama sayıları (store fallback). */
export function buildFunnelFromCases(cases: SalesCase[], stageLabels: Record<string, string>) {
  const palette = ['#93c5fd', '#3b82f6', '#000c69', '#0a192f', '#cf060c'];
  const stages = [...new Set(cases.map((c) => c.stage))];
  return stages
    .map((stage, i) => ({
      name: stageLabels[stage] ?? stage,
      stage: stage as string | null,
      value: cases.filter((c) => c.stage === stage && !c.isLost).length,
      fill: palette[i % palette.length],
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}

/**
 * Satış performans metrikleri — kazanma oranı, ortalama satış döngüsü ve
 * pipeline hızı. Hepsi mevcut satış kartı alanlarından türetilir; tutarlar
 * karışık para biriminde tutulduğu için `convertToUsd` ile tek birime çekilir.
 *
 * Kazanma oranı yalnızca karara bağlanmış (kazanılan + kaybedilen) kartlar
 * üzerinden hesaplanır; açık kartlar oranı yapay olarak düşürmesin diye
 * paydaya girmez. Karar verilmiş kart yoksa metrik `null` döner — 0 göstermek
 * "hiç kazanamadık" yalanı olur.
 */
export function buildSalesPerformance(
  cases: SalesCase[],
  convertToUsd: (amount: number, currency: string) => number,
) {
  const isWon = (c: SalesCase) => !c.isLost && ['Completed', 'delivered'].includes(String(c.stage));
  const isLost = (c: SalesCase) => c.isLost || String(c.stage) === 'Lost';
  const isOpen = (c: SalesCase) => !isWon(c) && !isLost(c) && (c.qualificationStage ?? 'c') !== 'lead';

  const won = cases.filter(isWon);
  const lost = cases.filter(isLost);
  const open = cases.filter(isOpen);
  const decided = won.length + lost.length;
  const winRate = decided > 0 ? Math.round((won.length / decided) * 100) : null;

  const cycleDays = won
    .map((c) => {
      const start = Date.parse(String(c.createdAt ?? ''));
      const end = Date.parse(String(c.closedAt ?? ''));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
      return (end - start) / 86_400_000;
    })
    .filter((days): days is number => days != null);
  const avgCycleDays = cycleDays.length
    ? Math.round(cycleDays.reduce((sum, days) => sum + days, 0) / cycleDays.length)
    : null;

  const openValue = open.reduce((sum, c) => sum + convertToUsd(c.estimatedAmount ?? 0, c.currency), 0);
  const avgDealValue = open.length ? openValue / open.length : 0;

  // Pipeline hızı: günde kaç dolarlık fırsatın kazanca dönmesi beklenir.
  // Döngü süresi bilinmiyorsa hesaplanamaz.
  const velocityPerDay =
    winRate != null && avgCycleDays != null && avgCycleDays > 0
      ? (open.length * avgDealValue * (winRate / 100)) / avgCycleDays
      : null;

  return {
    wonCount: won.length,
    lostCount: lost.length,
    openCount: open.length,
    winRate,
    avgCycleDays,
    avgDealValue,
    openValue,
    velocityPerDay,
  };
}
