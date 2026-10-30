import { receivableCreateSchema, type ReceivableCreateInput, type OpportunityPaymentMethodCode } from '@haksan/shared';

export const RECEIVABLE_METHOD_OPTIONS: { value: OpportunityPaymentMethodCode; label: string }[] = [
  { value: 'undecided', label: 'Belirlenmedi' }, { value: 'cash', label: 'Peşin' },
  { value: 'wire_transfer', label: 'Havale' }, { value: 'promissory_note', label: 'Senet' },
  { value: 'term', label: 'Vadeli' }, { value: 'installment', label: 'Taksit' },
  { value: 'leasing', label: 'Leasing' }, { value: 'letter_of_credit', label: 'Akreditif' },
  { value: 'cheque', label: 'Çek' },
];

export function buildReceivableDraft(form: {
  companyId: string; amount: string; currencyCode: string; dueDate: string;
  invoiceNo: string; paymentMethod: string; documentRef: string; notes: string;
}): { ok: true; body: ReceivableCreateInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const amount = Number(form.amount.trim().replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'Sıfırdan büyük, geçerli bir tutar girin.';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.dueDate.trim());
  const year = Number(match?.[1]), month = Number(match?.[2]), day = Number(match?.[3]);
  const due = new Date(year, month - 1, day);
  if (!match || due.getFullYear() !== year || due.getMonth() !== month - 1 || due.getDate() !== day) errors.dueDate = 'Geçerli bir vade tarihi seçin.';
  const result = receivableCreateSchema.safeParse({
    companyId: form.companyId, amount, currencyCode: form.currencyCode, dueDate: due,
    invoiceNo: form.invoiceNo.trim() || undefined, paymentMethod: form.paymentMethod || undefined,
    documentRef: form.documentRef.trim() || undefined, notes: form.notes.trim() || undefined,
  });
  if (!result.success) for (const issue of result.error.issues) errors[String(issue.path[0])] ??= issue.path[0] === 'companyId' ? 'Firma seçin.' : issue.message;
  return Object.keys(errors).length || !result.success ? { ok: false, errors } : { ok: true, body: result.data };
}

export type PaymentInstrumentDetails = { documentNo: string; issuer: string; bankName: string; branchName: string };
export type PlanInstallment = PaymentInstrumentDetails & { amount: string; dueDate: string };
export const EMPTY_INSTRUMENT: PaymentInstrumentDetails = { documentNo: '', issuer: '', bankName: '', branchName: '' };

/** Repricing/equalizing changes amounts and dates; entered instrument identity stays. */
export function recalculatePlanRows(previous: PlanInstallment[], next: { amount: string; dueDate: string }[]): PlanInstallment[] {
  return next.map((row, index) => ({ ...EMPTY_INSTRUMENT, ...previous[index], amount: row.amount, dueDate: row.dueDate }));
}

export function buildPlanReceivable(input: {
  row: PlanInstallment; method: OpportunityPaymentMethodCode; companyId: string;
  currencyCode: string; baseNote: string; quoteId?: string;
}): ReturnType<typeof buildReceivableDraft> {
  const { row, method } = input;
  const errors: Record<string, string> = {};
  const labels: Record<keyof PaymentInstrumentDetails, string> = { documentNo: method === 'cheque' ? 'Çek numarası' : 'Senet numarası', issuer: method === 'cheque' ? 'Hesap sahibi' : 'Borçlu', bankName: 'Banka', branchName: 'Şube' };
  if (method === 'cheque' || method === 'promissory_note') {
    const required: (keyof PaymentInstrumentDetails)[] = method === 'cheque' ? ['documentNo', 'bankName', 'issuer'] : ['documentNo', 'issuer'];
    for (const key of required) if (!row[key].trim()) errors[key] = `${labels[key]} zorunludur.`;
    for (const key of Object.keys(labels) as (keyof PaymentInstrumentDetails)[]) if (row[key].length > 128) errors[key] = `${labels[key]} en fazla 128 karakter olabilir.`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const instrumentNote = method === 'promissory_note'
    ? `Senet No: ${row.documentNo.trim()} · Borçlu: ${row.issuer.trim()}`
    : method === 'cheque' ? [`Çek No: ${row.documentNo.trim()}`, `Banka: ${row.bankName.trim()}`, row.branchName.trim() ? `Şube: ${row.branchName.trim()}` : '', `Hesap Sahibi: ${row.issuer.trim()}`].filter(Boolean).join(' · ') : '';
  const result = buildReceivableDraft({
    companyId: input.companyId, amount: row.amount, currencyCode: input.currencyCode, dueDate: row.dueDate,
    invoiceNo: '', paymentMethod: method, documentRef: method === 'cheque' || method === 'promissory_note' ? row.documentNo : '',
    notes: instrumentNote ? `${input.baseNote} · ${instrumentNote}` : input.baseNote,
  });
  if (!result.ok) return result;
  return { ok: true, body: { ...result.body, ...(input.quoteId ? { quoteId: input.quoteId } : {}) } };
}
