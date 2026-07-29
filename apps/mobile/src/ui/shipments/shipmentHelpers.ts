import { colors } from '@/src/theme/tokens';

export type ShipmentListFilter =
  | 'Tümü'
  | 'Hazırlanıyor'
  | 'Yolda'
  | 'Gümrükte'
  | 'Teslim Edildi';

export const SHIPMENT_LIST_FILTERS: ShipmentListFilter[] = [
  'Tümü',
  'Hazırlanıyor',
  'Yolda',
  'Gümrükte',
  'Teslim Edildi',
];

const FILTER_CODE: Record<Exclude<ShipmentListFilter, 'Tümü'>, string> = {
  Hazırlanıyor: 'preparing',
  Yolda: 'in_transit',
  Gümrükte: 'at_customs',
  'Teslim Edildi': 'delivered',
};

export function statusCodeFromRow(row: Record<string, unknown>): string {
  const status = row.status as Record<string, unknown> | undefined;
  return String(status?.code ?? row.statusCode ?? '').toLowerCase();
}

export function statusNameFromRow(row: Record<string, unknown>): string {
  const status = row.status as Record<string, unknown> | undefined;
  return String(status?.name ?? row.statusName ?? '—');
}

export function trackingOrShipmentNoFromRow(row: Record<string, unknown>): string {
  return String(row.trackingNo ?? row.shipmentNo ?? row.documentNo ?? '—');
}

export function carrierFromRow(row: Record<string, unknown>): string {
  return String(row.carrier ?? '—');
}

export function companyNameFromRow(row: Record<string, unknown>): string {
  const company = row.company as Record<string, unknown> | undefined;
  return String(
    company?.shortName ?? company?.legalTitle ?? row.companyName ?? 'Müşteri belirtilmedi',
  );
}

export function routeLabelFromRow(row: Record<string, unknown>): string {
  const origin = String(row.origin ?? '').trim();
  const dest = String(row.destination ?? '').trim();
  if (origin && dest) return `${origin} → ${dest}`;
  if (dest) return dest;
  if (origin) return origin;
  return '—';
}

export function formatShipmentEta(row: Record<string, unknown>): string {
  const raw = row.eta;
  if (!raw) return '—';
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export type ShipmentStatusVisual = { label: string; bg: string; fg: string };

export function shipmentStatusVisual(row: Record<string, unknown>): ShipmentStatusVisual {
  const code = statusCodeFromRow(row);
  const name = statusNameFromRow(row);

  if (code === 'in_transit') {
    return { label: name || 'Yolda', bg: '#d0e1fb', fg: '#000c69' };
  }
  if (code === 'at_customs') {
    return { label: name || 'Gümrükte', bg: '#fef3c7', fg: '#b45309' };
  }
  if (code === 'delivered') {
    return { label: name || 'Teslim Edildi', bg: '#dcfce7', fg: '#166534' };
  }
  if (code === 'cleared') {
    return { label: name || 'Gümrük Onaylı', bg: '#ccfbf1', fg: '#0f766e' };
  }
  if (code === 'preparing') {
    return { label: name || 'Hazırlanıyor', bg: colors.surfaceContainerHighest, fg: colors.onSurfaceVariant };
  }
  return { label: name || code || '—', bg: '#f3f3f4', fg: '#454651' };
}

export function countTotal(rows: Record<string, unknown>[]): number {
  return rows.length;
}

export function countInTransit(rows: Record<string, unknown>[]): number {
  return rows.filter((r) => statusCodeFromRow(r) === 'in_transit').length;
}

export function countAtCustoms(rows: Record<string, unknown>[]): number {
  return rows.filter((r) => statusCodeFromRow(r) === 'at_customs').length;
}

export function countDelivered(rows: Record<string, unknown>[]): number {
  return rows.filter((r) => statusCodeFromRow(r) === 'delivered').length;
}

export function matchesShipmentFilter(row: Record<string, unknown>, filter: ShipmentListFilter): boolean {
  if (filter === 'Tümü') return true;
  return statusCodeFromRow(row) === FILTER_CODE[filter];
}

export function matchesShipmentSearch(row: Record<string, unknown>, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    trackingOrShipmentNoFromRow(row),
    carrierFromRow(row),
    companyNameFromRow(row),
    routeLabelFromRow(row),
    statusNameFromRow(row),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

export function shipmentNoFromRow(row: Record<string, unknown>): string {
  return String(row.shipmentNo ?? trackingOrShipmentNoFromRow(row));
}

export function companyIdFromRow(row: Record<string, unknown>): string | undefined {
  const company = row.company as Record<string, unknown> | undefined;
  const id = company?.id ?? row.companyId;
  return id ? String(id) : undefined;
}

export function linesFromShipment(data: Record<string, unknown>): Record<string, unknown>[] {
  const items = data.items;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

export function formatShipmentDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatShipmentDateTime(value: unknown): string {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const SHIPMENT_STATUS_OPTIONS: { code: string; label: string; icon: string }[] = [
  { code: 'preparing', label: 'Hazırlanıyor', icon: 'cube-outline' },
  { code: 'in_transit', label: 'Yolda', icon: 'airplane-outline' },
  { code: 'at_customs', label: 'Gümrükte', icon: 'shield-checkmark-outline' },
  { code: 'cleared', label: 'Gümrükten Çıktı', icon: 'checkmark-done-outline' },
  { code: 'delivered', label: 'Teslim Edildi', icon: 'checkmark-circle-outline' },
];

export const SHIPMENT_STEPPER_STEPS: { code: string; label: string }[] = [
  { code: 'preparing', label: 'Hazırlanıyor' },
  { code: 'in_transit', label: 'Yolda' },
  { code: 'at_customs', label: 'Gümrükte' },
  { code: 'delivered', label: 'Teslim' },
];

export type ShipmentHistoryEvent = {
  id: string;
  at: Date;
  statusCode: string;
  statusLabel: string;
  description: string;
};

export function buildShipmentHistory(data: Record<string, unknown>): ShipmentHistoryEvent[] {
  const events: ShipmentHistoryEvent[] = [];
  const add = (id: string, raw: unknown, code: string, label: string, description: string) => {
    if (!raw) return;
    const at = new Date(String(raw));
    if (Number.isNaN(at.getTime())) return;
    events.push({ id, at, statusCode: code, statusLabel: label, description });
  };

  add('createdAt', data.createdAt, 'preparing', 'Hazırlanıyor', 'Sevkiyat kaydı oluşturuldu');
  add('shippedAt', data.shippedAt, 'in_transit', 'Yolda', 'Kargo firmasına teslim edildi');
  if (statusCodeFromRow(data) === 'at_customs' && data.updatedAt) {
    add('customs', data.updatedAt, 'at_customs', 'Gümrükte', 'Gümrük evrakları sunuldu');
  }
  add('customsClearedAt', data.customsClearedAt, 'cleared', 'Gümrük Onaylı', 'Gümrük işlemleri tamamlandı');
  add('arrivedAt', data.arrivedAt, 'delivered', 'Teslim Edildi', 'Müşteriye teslim edildi');

  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function stepperIndexForStatus(code: string): number {
  const idx = SHIPMENT_STEPPER_STEPS.findIndex((s) => s.code === code);
  if (idx >= 0) return idx;
  if (code === 'cleared') return 2;
  return 0;
}
