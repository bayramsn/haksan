import { formatOfferMoney } from '@/src/ui/offer/OfferFormWidgets';

export type OfferStatusCode = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | string;

export function statusFromRow(row: Record<string, unknown>): { code: string; name: string } {
  const status = row.status as Record<string, unknown> | undefined;
  return {
    code: String(status?.code ?? row.statusCode ?? '').toLowerCase(),
    name: String(status?.name ?? row.statusName ?? '—'),
  };
}

export function currencyCodeFromRow(row: Record<string, unknown>): string {
  const currency = row.currency as Record<string, unknown> | undefined;
  return String(currency?.code ?? row.currencyCode ?? 'TRY');
}

export function companyNameFromRow(row: Record<string, unknown>): string {
  const company = row.company as Record<string, unknown> | undefined;
  return String(company?.legalTitle ?? company?.shortName ?? row.companyName ?? '—');
}

export function documentNoFromRow(row: Record<string, unknown>): string {
  return String(row.documentNo ?? row.quoteNo ?? '—');
}

export function revisionFromRow(row: Record<string, unknown>): number {
  return Number(row.revisionNo ?? row.revision ?? 1);
}

export function grandTotalFromRow(row: Record<string, unknown>): number {
  return Number(row.grandTotal ?? row.totalAmount ?? row.amount ?? 0);
}

export function formatQuoteMoney(row: Record<string, unknown>, amount?: number): string {
  const value = amount ?? grandTotalFromRow(row);
  return formatOfferMoney(value, currencyCodeFromRow(row));
}

export function quoteSubtitleFromRow(row: Record<string, unknown>): string {
  const notes = String(row.notes ?? '').trim();
  if (notes) return notes.split('\n')[0].slice(0, 60);
  const items = row.items as Record<string, unknown>[] | undefined;
  if (Array.isArray(items) && items[0]) {
    return String(items[0].description ?? '').slice(0, 60);
  }
  return '—';
}

export function quoteExpiryDate(row: Record<string, unknown>): Date | null {
  const raw = row.quoteDate ?? row.date;
  if (!raw) return null;
  const start = new Date(String(raw));
  if (Number.isNaN(start.getTime())) return null;
  const days = Number(row.validityDays ?? 30);
  return new Date(start.getTime() + days * 86400000);
}

export function isQuoteExpired(row: Record<string, unknown>): boolean {
  const { code } = statusFromRow(row);
  if (code === 'expired') return true;
  if (code !== 'sent') return false;
  const expiry = quoteExpiryDate(row);
  return expiry ? Date.now() > expiry.getTime() : false;
}

export function validityLabelFromRow(row: Record<string, unknown>): string {
  if (isQuoteExpired(row)) return 'Süresi doldu';
  const expiry = quoteExpiryDate(row);
  if (!expiry) return '—';
  const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
  if (daysLeft <= 0) return 'Süresi doldu';
  if (daysLeft === 1) return 'Geçerlilik: 1 gün';
  return `Geçerlilik: ${daysLeft} gün`;
}

export function relativeQuoteDate(row: Record<string, unknown>): string {
  const raw = row.quoteDate ?? row.updatedAt ?? row.createdAt;
  if (!raw) return '—';
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Bugün';
  if (days === 1) return 'Dün';
  return `${days} gün önce`;
}

export type OfferStatusVisual = {
  label: string;
  bg: string;
  fg: string;
};

export function offerStatusVisual(row: Record<string, unknown>): OfferStatusVisual {
  const { code, name } = statusFromRow(row);
  if (isQuoteExpired(row)) {
    return { label: 'Süresi Doldu', bg: colorsGray.bg, fg: colorsGray.fg };
  }
  switch (code) {
    case 'draft':
      return { label: name || 'Taslak', bg: '#f3f4f6', fg: '#4b5563' };
    case 'sent':
      return { label: name || 'Gönderildi', bg: '#e3f2fd', fg: '#1565c0' };
    case 'approved':
      return { label: 'Kabul', bg: '#e8f5e9', fg: '#2e7d32' };
    case 'rejected':
      return { label: name || 'Red', bg: '#ffebee', fg: '#c62828' };
    case 'expired':
      return { label: 'Süresi Doldu', bg: colorsGray.bg, fg: colorsGray.fg };
    default:
      return { label: name || '—', bg: '#f3f4f6', fg: '#4b5563' };
  }
}

const colorsGray = { bg: '#f3f4f6', fg: '#6b7280' };

export function unitLabelFromItem(item: Record<string, unknown>): string {
  const unit = item.unit as Record<string, unknown> | undefined;
  return String(unit?.code ?? item.unitCode ?? 'adet');
}

export function lineItemTotal(item: Record<string, unknown>): number {
  return Number(item.lineTotal ?? item.total ?? 0);
}

export function lineItemUnitPrice(item: Record<string, unknown>): number {
  return Number(item.unitPrice ?? item.price ?? 0);
}

export function lineItemQuantity(item: Record<string, unknown>): number {
  return Number(item.quantity ?? 1);
}

/** Stitch KPI — taslak + süresi dolmamış gönderilmiş */
export function isOpenOffer(row: Record<string, unknown>): boolean {
  const { code } = statusFromRow(row);
  if (code === 'draft') return true;
  if (code === 'sent' && !isQuoteExpired(row)) return true;
  return false;
}

/** Stitch KPI — cevap bekleyen gönderilmiş teklifler */
export function isPendingApprovalOffer(row: Record<string, unknown>): boolean {
  const { code } = statusFromRow(row);
  return code === 'sent' && !isQuoteExpired(row);
}

export function countOpenOffers(items: Record<string, unknown>[]): number {
  return items.filter(isOpenOffer).length;
}

export function countPendingApprovalOffers(items: Record<string, unknown>[]): number {
  return items.filter(isPendingApprovalOffer).length;
}
