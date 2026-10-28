export type TemplateTerms = { payment: string; delivery: string; warranty: string };
/** Web DocumentTermsTemplateEditor ile aynı kalıcı alan isimleri. */
export function encodeTermsTemplate(value: TemplateTerms): string {
  return JSON.stringify({ paymentTermsText: value.payment, deliveryTermsText: value.delivery, warrantyTermsText: value.warranty });
}
export function decodeTermsTemplate(body: string): TemplateTerms | null {
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return { payment: String(parsed.paymentTermsText ?? parsed.paymentTerms ?? ''), delivery: String(parsed.deliveryTermsText ?? parsed.deliveryTerms ?? ''), warranty: String(parsed.warrantyTermsText ?? parsed.warrantyTerms ?? '') };
  } catch { return null; }
}
