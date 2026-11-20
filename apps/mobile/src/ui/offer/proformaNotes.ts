/**
 * Proforma şart basmaz, tek "NOTLAR" listesi basar (web ile aynı kural).
 * Eski kayıt/şablonlardaki ödeme/teslimat/garanti metinleri tek metne katlanır;
 * yeni not her zaman `paymentTermsText`'e yazılır.
 */
export const PROFORMA_NOTE_TEMPLATE_SCOPE = 'proforma_terms';

type TermsLike = Record<string, unknown> | null | undefined;

export function foldTermsToNotes(terms: TermsLike): string {
  if (!terms) return '';
  return [
    terms.paymentTermsText ?? terms.paymentTerms,
    terms.deliveryTermsText ?? terms.deliveryTerms,
    terms.warrantyTermsText ?? terms.warrantyTerms,
  ]
    .map((text) => String(text ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

export function notesFromTemplateBody(body: string): string {
  try {
    return foldTermsToNotes(JSON.parse(body) as Record<string, unknown>);
  } catch {
    return '';
  }
}

export const notesToTerms = (notes: string) => ({
  paymentTermsText: notes,
  deliveryTermsText: '',
  warrantyTermsText: '',
  importCostsExcluded: true,
});

export const notesTemplateBody = (notes: string) => {
  const { importCostsExcluded: _ignored, ...texts } = notesToTerms(notes);
  return JSON.stringify(texts);
};
