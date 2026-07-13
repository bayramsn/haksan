import type { Activity, Customer, Offer, ServiceRequest } from './mock';

export type TargetAchievementItem = {
  targetType: 'sales' | 'service';
  category: string;
  activity: string;
  description?: string;
  unit: 'count' | 'amount';
  target: string;
};

export function computeTargetAchievement(
  item: TargetAchievementItem,
  ctx: {
    period: string;
    offers: Offer[];
    customers: Customer[];
    activities: Activity[];
    service: ServiceRequest[];
    convert: (amount: number, currency: string, to: 'USD') => number;
  },
): { pct: number; hint: string; tone?: 'warn' | 'ok' } {
  const target = Number(String(item.target).replace(',', '.')) || 0;
  const inPeriod = (date: string) => String(date).startsWith(ctx.period);

  let actual = 0;
  const act = item.activity.toLowerCase();

  if (item.unit === 'amount' || act.includes('tutar') || act.includes('bütçe') || act.includes('ciro')) {
    actual = ctx.offers
      .filter((o) => o.status === 'Approved' && inPeriod(o.date))
      .reduce((sum, o) => sum + ctx.convert(o.amount, o.currency, 'USD'), 0);
  } else if (act.includes('müşteri')) {
    actual = ctx.customers.filter((c) => inPeriod(c.createdAt)).length;
  } else if (act.includes('ziyaret')) {
    actual = ctx.activities.filter((a) => inPeriod(a.date) && /ziyaret|visit/i.test(a.type + a.title)).length;
  } else if (act.includes('arama') || act.includes('call')) {
    actual = ctx.activities.filter((a) => inPeriod(a.date) && /arama|call|telefon/i.test(a.type + a.title)).length;
  } else if (act.includes('teklif')) {
    actual = ctx.offers.filter((o) => inPeriod(o.date)).length;
  } else if (act.includes('servis') || act.includes('tamamlanan')) {
    actual = ctx.service.filter(
      (s) => inPeriod(s.createdAt) && (s.stage === 'Closed' || s.stage === 'Service Completed'),
    ).length;
  } else if (act.includes('lead')) {
    actual = ctx.activities.filter((a) => inPeriod(a.date)).length;
  } else {
    actual = ctx.activities.filter((a) => inPeriod(a.date)).length;
  }

  if (target <= 0) {
    return { pct: 0, hint: 'Hedef tanımlı değil', tone: 'warn' };
  }

  const pct = item.unit === 'amount'
    ? Math.min(100, Math.round((actual / target) * 100))
    : Math.min(100, Math.round((actual / target) * 100));

  const hint =
    item.unit === 'amount'
      ? `$${Math.round(actual / 1000)}k / $${Math.round(target / 1000)}k`
      : `${actual} / ${target}`;

  return {
    pct,
    hint,
    tone: pct >= 80 ? 'ok' : pct < 50 ? 'warn' : undefined,
  };
}
