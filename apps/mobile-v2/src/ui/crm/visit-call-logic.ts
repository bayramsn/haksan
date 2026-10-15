/**
 * Müşteri Ziyareti / Giden Arama kaydı. `POST /visits` · `POST /calls` yapısal
 * kaydı tutar; raporlar ve firma zaman çizelgesi ise yalnız aktiviteyi
 * (customer_visit / outgoing_call) okur. Web LogActivityDialog'un aktivite
 * açıklama biçimi birebir korunur.
 */

export type VisitCallKind = 'visit' | 'call';

export type VisitCallForm = {
  companyId: string;
  contactId?: string | null;
  opportunityId?: string | null;
  date: Date;
  subject: string;
  location: string;
  purpose: string;
  result: string;
  nextAction: string;
};

export const VISIT_CALL_LABELS: Record<VisitCallKind, string> = {
  visit: 'Müşteri Ziyareti',
  call: 'Giden Arama',
};

export const VISIT_CALL_ACTIVITY_CODES: Record<VisitCallKind, 'customer_visit' | 'outgoing_call'> = {
  visit: 'customer_visit',
  call: 'outgoing_call',
};

export const VISIT_CALL_LIMITS = { subject: 255, location: 255, purpose: 1000, result: 2000, nextAction: 1000 } as const;

function optional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function validateVisitCall(kind: VisitCallKind, form: VisitCallForm): string | null {
  if (!form.companyId) return 'Firma seçin.';
  if (!(form.date instanceof Date) || Number.isNaN(form.date.getTime())) return 'Tarih seçin.';
  if (form.subject.trim().length > VISIT_CALL_LIMITS.subject) return 'Konu en fazla 255 karakter olabilir.';
  if (kind === 'visit' && form.location.trim().length > VISIT_CALL_LIMITS.location) return 'Konum en fazla 255 karakter olabilir.';
  if (kind === 'visit' && form.purpose.trim().length > VISIT_CALL_LIMITS.purpose) return 'Amaç en fazla 1000 karakter olabilir.';
  if (form.result.trim().length > VISIT_CALL_LIMITS.result) return 'Sonuç en fazla 2000 karakter olabilir.';
  if (form.nextAction.trim().length > VISIT_CALL_LIMITS.nextAction) return 'Sonraki adım en fazla 1000 karakter olabilir.';
  return null;
}

export function activityDescription(kind: VisitCallKind, form: Pick<VisitCallForm, 'purpose' | 'result' | 'nextAction'>): string {
  return [
    kind === 'visit' && form.purpose.trim() ? `Amaç: ${form.purpose.trim()}` : '',
    form.result.trim(),
    form.nextAction.trim() ? `Sonraki adım: ${form.nextAction.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildVisitCallPayloads(kind: VisitCallKind, form: VisitCallForm) {
  const base = {
    companyId: form.companyId,
    contactId: optional(form.contactId),
    opportunityId: optional(form.opportunityId),
  };
  const iso = form.date.toISOString();
  const record =
    kind === 'visit'
      ? {
          kind: 'visit' as const,
          body: {
            ...base,
            visitDate: iso,
            visitLocation: optional(form.location),
            visitPurpose: optional(form.purpose),
            visitResult: optional(form.result),
            nextAction: optional(form.nextAction),
          },
        }
      : {
          kind: 'call' as const,
          body: { ...base, callDate: iso, callResult: optional(form.result), nextAction: optional(form.nextAction) },
        };
  const description = activityDescription(kind, form);
  const activity = {
    ...base,
    activityTypeCode: VISIT_CALL_ACTIVITY_CODES[kind],
    subject: form.subject.trim() || VISIT_CALL_LABELS[kind],
    description: description || undefined,
    activityDate: form.date,
  };
  return { record, activity };
}
