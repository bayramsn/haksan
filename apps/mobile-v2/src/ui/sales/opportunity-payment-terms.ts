export type PaymentTermsSnapshot = {
  id: string;
  paymentMethod: string | null;
  paymentTermDays: number | null;
  paymentTerms: string | null;
};

export type PaymentTermsPatch = {
  paymentMethod?: string | null;
  paymentTermDays?: number | null;
  paymentTerms?: string;
};

/** Partial PATCH: untouched values, including legacy payment methods, stay on the server. */
export function buildPaymentTermsPatch(input: {
  baseline: PaymentTermsSnapshot;
  opportunityId: string;
  method: string | null;
  days: string;
  terms: string;
}): { ok: true; patch: PaymentTermsPatch } | { ok: false; error: string } {
  const { baseline, opportunityId, method, days, terms } = input;
  if (baseline.id !== opportunityId) return { ok: false, error: 'Fırsat değişti. Düzenleme ekranını yeniden açın.' };
  const rawDays = days.trim();
  const termDays = rawDays === '' ? null : Number(rawDays);
  if (rawDays && (!/^\d+$/.test(rawDays) || !Number.isInteger(termDays) || Number(termDays) > 3650)) {
    return { ok: false, error: 'Vade 0 ile 3650 arasında tam sayı olmalı; boş bırakarak kaldırabilirsiniz.' };
  }
  if (terms.length > 4000) return { ok: false, error: 'Ödeme koşulları en fazla 4000 karakter olabilir.' };
  const patch: PaymentTermsPatch = {};
  if (method !== baseline.paymentMethod) patch.paymentMethod = method;
  if (termDays !== baseline.paymentTermDays) patch.paymentTermDays = termDays;
  if (terms !== (baseline.paymentTerms ?? '')) patch.paymentTerms = terms;
  return { ok: true, patch };
}
