const OPEN_CODES = new Set(['draft', 'sent', 'approved', 'in_transit']);
const PENDING_CODES = new Set(['pending_manager_approval']);
const CLOSED_CODES = new Set(['received', 'cancelled']);

export type PurchaseListFilter = 'Tümü' | 'Açık' | 'Onay Bekliyor' | 'Tamamlanan';

export const PURCHASE_LIST_FILTERS: PurchaseListFilter[] = [
  'Tümü',
  'Açık',
  'Onay Bekliyor',
  'Tamamlanan',
];

export function orderNoFromRow(row: Record<string, unknown>): string {
  return String(row.orderNo ?? row.documentNo ?? '—');
}

export function supplierNameFromRow(row: Record<string, unknown>): string {
  const supplier = row.supplier as Record<string, unknown> | undefined;
  const company = row.supplierCompany as Record<string, unknown> | undefined;
  return String(
    supplier?.shortName ??
      supplier?.legalTitle ??
      company?.shortName ??
      company?.legalTitle ??
      row.supplierName ??
      'Tedarikçi belirtilmedi',
  );
}

export function statusCodeFromRow(row: Record<string, unknown>): string {
  const status = row.status as Record<string, unknown> | undefined;
  return String(status?.code ?? row.statusCode ?? '').toLowerCase();
}

export function statusNameFromRow(row: Record<string, unknown>): string {
  const status = row.status as Record<string, unknown> | undefined;
  return String(status?.name ?? row.statusName ?? statusCodeFromRow(row) ?? '—');
}

export function currencyCodeFromRow(row: Record<string, unknown>): string {
  const currency = row.currency as Record<string, unknown> | undefined;
  return String(currency?.code ?? row.currencyCode ?? 'TRY');
}

export function grandTotalFromRow(row: Record<string, unknown>): number {
  const n = Number(row.grandTotal ?? row.totalAmount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function itemCountFromRow(row: Record<string, unknown>): number {
  const items = row.items as unknown[] | undefined;
  if (Array.isArray(items)) return items.length;
  const n = Number(row.itemCount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function formatPurchaseMoney(row: Record<string, unknown>, amount?: number): string {
  const value = amount ?? grandTotalFromRow(row);
  const code = currencyCodeFromRow(row);
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: code === 'TL' ? 'TRY' : code,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString('tr-TR')} ${code}`;
  }
}

export function formatExpectedDate(row: Record<string, unknown>): string {
  const raw = row.expectedDate ?? row.orderDate;
  if (!raw) return '—';
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export type PurchaseStatusVisual = { label: string; bg: string; fg: string };

export function purchaseStatusVisual(row: Record<string, unknown>): PurchaseStatusVisual {
  const code = statusCodeFromRow(row);
  const name = statusNameFromRow(row);

  if (code === 'in_transit') {
    return { label: name || 'Yüklemede', bg: colorsSecondaryContainer(), fg: '#54647a' };
  }
  if (code === 'pending_manager_approval') {
    return { label: name || 'Onay Bekliyor', bg: '#e2e2e3', fg: '#1a1c1d' };
  }
  if (code === 'received') {
    return { label: name || 'Tamamlandı', bg: '#dcfce7', fg: '#166534' };
  }
  if (code === 'cancelled') {
    return { label: name || 'İptal', bg: '#ffdad6', fg: '#93000a' };
  }
  if (OPEN_CODES.has(code)) {
    return { label: name || 'Açık', bg: '#bcc2ff', fg: '#333e92' };
  }
  return { label: name || code || '—', bg: '#f3f3f4', fg: '#454651' };
}

function colorsSecondaryContainer() {
  return '#d0e1fb';
}

export function supplierIconName(name: string): 'business' | 'construct' | 'hardware-chip' | 'water' | 'build' {
  const n = name.toLowerCase();
  if (n.includes('elektrik') || n.includes('servo') || n.includes('motor')) return 'hardware-chip';
  if (n.includes('hidrolik') || n.includes('pompa')) return 'water';
  if (n.includes('cnc') || n.includes('parça')) return 'build';
  if (n.includes('metal') || n.includes('fabrika')) return 'construct';
  return 'business';
}

export function countOpenOrders(rows: Record<string, unknown>[]): number {
  return rows.filter((r) => OPEN_CODES.has(statusCodeFromRow(r))).length;
}

export function countPendingApproval(rows: Record<string, unknown>[]): number {
  return rows.filter((r) => PENDING_CODES.has(statusCodeFromRow(r))).length;
}

export function countClosedOrders(rows: Record<string, unknown>[]): number {
  return rows.filter((r) => CLOSED_CODES.has(statusCodeFromRow(r))).length;
}

export function matchesPurchaseFilter(row: Record<string, unknown>, filter: PurchaseListFilter): boolean {
  const code = statusCodeFromRow(row);
  if (filter === 'Tümü') return true;
  if (filter === 'Açık') return OPEN_CODES.has(code);
  if (filter === 'Onay Bekliyor') return PENDING_CODES.has(code);
  if (filter === 'Tamamlanan') return code === 'received';
  return true;
}

export function matchesPurchaseSearch(row: Record<string, unknown>, q: string): boolean {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return (
    orderNoFromRow(row).toLowerCase().includes(term) ||
    supplierNameFromRow(row).toLowerCase().includes(term)
  );
}

export function linesFromPurchase(row: Record<string, unknown>): Record<string, unknown>[] {
  const items = row.items;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}
