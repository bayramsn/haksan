export type HomeSection = 'overview' | 'operations' | 'charts' | 'targets';
export type HomeMetricKey = 'customers' | 'collections' | 'sales' | 'overdue' | 'service' | 'machines';

const roleOrder: Record<string, HomeMetricKey[]> = {
  sales: ['sales', 'customers', 'collections', 'service', 'overdue', 'machines'],
  finance: ['overdue', 'collections', 'sales', 'customers', 'service', 'machines'],
  service: ['service', 'machines', 'customers', 'sales', 'overdue', 'collections'],
  stock: ['machines', 'service', 'sales', 'customers', 'collections', 'overdue'],
};

export function orderHomeMetrics<T extends { key: HomeMetricKey }>(metrics: T[], roles: readonly string[]): T[] {
  const order = roleOrder[roles.find((role) => role in roleOrder) ?? ''] ?? ['customers', 'collections', 'sales', 'overdue', 'service', 'machines'];
  return [...metrics].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

export function initialHomeSection(roles: readonly string[]): HomeSection {
  const role = roles.find((value) => value in roleOrder);
  return role === 'finance' || role === 'service' || role === 'stock' ? 'operations' : 'overview';
}

export function homePeriod(now: Date) {
  return {
    period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    to: now.toISOString(),
  };
}

/** Completed incoming payments only. Cents stay integral; currencies never mix. */
export function collectionTotals(rows: Array<{ amount: string; direction: string; currency: { code: string } | null }>) {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    if (row.direction !== 'in' || !row.currency?.code || !/^\d+(?:\.\d{1,2})?$/.test(row.amount)) continue;
    const [whole, fraction = ''] = row.amount.split('.');
    const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
    totals.set(row.currency.code, (totals.get(row.currency.code) ?? 0n) + cents);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currencyCode, cents]) => ({
    currencyCode, amount: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`,
  }));
}
