import {
  cardNumberFromRow,
  companyNameFromRow,
  formatSalesAmount,
  stageVisualFromRow,
} from '@/src/ui/sales/SalesCasesListWidgets';

export type SalesCaseDetailTab = 'ozet' | 'aktivite' | 'dokumanlar' | 'urunler' | 'notlar';

export function productLineFromRow(row: Record<string, unknown>): string {
  return String(row.title ?? row.description ?? '—');
}

export function currencyCodeFromRow(row: Record<string, unknown>): string {
  const currency = row.currency as Record<string, unknown> | undefined;
  return String(currency?.code ?? 'TRY');
}

export function stageCodeFromRow(row: Record<string, unknown>): string {
  const stage = row.stage as Record<string, unknown> | undefined;
  return String(stage?.code ?? '').toLowerCase();
}

export function stageNameFromRow(row: Record<string, unknown>): string {
  const stage = row.stage as Record<string, unknown> | undefined;
  const visual = stageVisualFromRow(row);
  return String(stage?.name ?? visual.label);
}

export function probabilityFromRow(row: Record<string, unknown>): number {
  return Math.min(100, Math.max(0, Number(row.probability ?? 50)));
}

export const SALES_PIPELINE_STEPS = [
  { key: 'new', label: 'Yeni', stages: ['lead', 'call', 'visit'] },
  { key: 'quote', label: 'Teklif', stages: ['quote', 'proforma'] },
  {
    key: 'negotiation',
    label: 'Müzakere',
    stages: [
      'sales',
      'contract',
      'payment_plan',
      'commercial_invoice',
      'customs_approved',
      'stock_picking',
      'shipping',
      'installation',
    ],
  },
  { key: 'won', label: 'Kazanıldı', stages: ['delivered'] },
] as const;

export function pipelineStepIndex(stageCode: string): number {
  const code = stageCode.toLowerCase();
  if (code === 'cancelled') return -1;
  const idx = SALES_PIPELINE_STEPS.findIndex((step) => step.stages.includes(code as never));
  return idx >= 0 ? idx : 0;
}

export function formatCloseDate(row: Record<string, unknown>): { label: string; hint?: string } {
  const raw = row.expectedCloseDate;
  if (!raw) return { label: '—' };
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return { label: '—' };
  const label = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return { label, hint: `${Math.abs(days)} gün gecikti` };
  if (days === 0) return { label, hint: 'Bugün' };
  return { label, hint: `${days} gün kaldı` };
}

export function ownerInitials(name?: string): string {
  if (!name?.trim()) return '—';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

import type { Ionicons } from '@expo/vector-icons';

export function activityIcon(typeCode?: string): keyof typeof Ionicons.glyphMap {
  const code = String(typeCode ?? '').toLowerCase();
  if (code.includes('visit')) return 'checkmark-circle';
  if (code.includes('call')) return 'call';
  if (code.includes('quote') || code.includes('offer')) return 'send';
  if (code.includes('email')) return 'mail';
  if (code.includes('note')) return 'document-text';
  return 'ellipse';
}

export function formatActivityDate(raw: unknown): string {
  if (!raw) return '—';
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export { cardNumberFromRow, companyNameFromRow, formatSalesAmount, stageVisualFromRow };
