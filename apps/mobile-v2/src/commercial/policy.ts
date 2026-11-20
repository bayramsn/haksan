export type CommercialKind = 'quote' | 'proforma' | 'contract' | 'invoice';
export function readPermission(kind: CommercialKind): string {
  return kind === 'invoice' ? 'commercial_invoices.read' : `${kind}s.read`;
}
export function isCommercialLocked(record: { approvedAt?: unknown; finalizedAt?: unknown } | undefined): boolean {
  return Boolean(record?.approvedAt || record?.finalizedAt);
}
export function canSharePreparedPdf(status: unknown): boolean {
  return status === 'ready';
}
export function pdfStatusLabel(status: unknown): string | null {
  if (status === 'ready') return 'PDF hazır';
  if (status === 'missing') return 'PDF webde hazırlanmalı';
  if (status === 'outdated') return 'PDF güncel değil';
  return null;
}
