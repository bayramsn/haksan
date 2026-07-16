export type DeliveryStatusFilter = 'Tümü' | 'Bekliyor' | 'Tamamlandı';

export const DELIVERY_STATUS_FILTERS: DeliveryStatusFilter[] = ['Tümü', 'Bekliyor', 'Tamamlandı'];

export type DeliveryFormData = {
  formNo?: string;
  kurulumTarihi?: string;
  machineId?: string;
  tezgah?: { marka?: string; model?: string; tip?: string; seriNo?: string };
  cnc?: { marka?: string; model?: string; seriNo?: string; mainSw?: string };
  ilgili?: string;
  kurulumuYapan?: string;
  technicalSpecs?: Array<{ key: string; value: string }>;
};

export function deliveryFormData(row: Record<string, unknown>): DeliveryFormData {
  return (row.formData as DeliveryFormData | undefined) ?? {};
}

export function deliveryStatusCode(row: Record<string, unknown>): string {
  return String(row.status ?? '').toLowerCase();
}

export function deliveryStatusLabel(row: Record<string, unknown>): string {
  const code = deliveryStatusCode(row);
  if (code === 'completed') return 'Tamamlandı';
  if (code === 'pending') return 'Bekliyor';
  return code || 'Bekliyor';
}

export function deliveryFormNo(row: Record<string, unknown>): string {
  const fd = deliveryFormData(row);
  if (fd.formNo) return fd.formNo;
  const id = String(row.id ?? '');
  if (!id) return 'TSL-—';
  return `TSL-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function deliveryMachineMeta(row: Record<string, unknown>): string {
  const tezgah = deliveryFormData(row).tezgah;
  if (!tezgah) return '';
  const parts = [tezgah.model, tezgah.tip].filter(Boolean);
  return parts.join(' ') || tezgah.marka || '';
}

export function deliveryCompanyName(row: Record<string, unknown>): string {
  const company = row.company as Record<string, unknown> | undefined;
  return String(
    company?.shortName ?? company?.legalTitle ?? row.companyName ?? 'Müşteri belirtilmedi',
  );
}

export function deliverySignedBy(row: Record<string, unknown>): string {
  const name = String(row.signedBy ?? '').trim();
  return name || '—';
}

export function formatDeliveryDate(row: Record<string, unknown>): string {
  const raw = row.deliveryDate ?? row.date;
  if (!raw) return '—';
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function deliveryCardMeta(row: Record<string, unknown>): string {
  const form = deliveryFormNo(row);
  const machine = deliveryMachineMeta(row);
  return machine ? `${form} · ${machine}` : form;
}

export function matchesDeliveryFilter(
  row: Record<string, unknown>,
  filter: DeliveryStatusFilter,
): boolean {
  const code = deliveryStatusCode(row);
  if (filter === 'Bekliyor') return code === 'pending';
  if (filter === 'Tamamlandı') return code === 'completed';
  return true;
}

export function matchesDeliverySearch(row: Record<string, unknown>, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    deliveryCompanyName(row),
    deliveryFormNo(row),
    deliveryMachineMeta(row),
    deliverySignedBy(row),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

export function countDeliveriesByStatus(
  rows: Record<string, unknown>[],
  status: 'pending' | 'completed',
): number {
  return rows.filter((row) => deliveryStatusCode(row) === status).length;
}

export function deliveryStatusBadgeStyle(row: Record<string, unknown>): {
  bg: string;
  fg: string;
  accent: string;
} {
  const code = deliveryStatusCode(row);
  if (code === 'completed') {
    return { bg: '#dcfce7', fg: '#166534', accent: '#22c55e' };
  }
  return { bg: '#fef3c7', fg: '#b45309', accent: '#f59e0b' };
}
