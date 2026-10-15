/**
 * Web LeadCaptureDialog (Hızlı Fırsat) kuralları ve gövdesi. Firma/kontak/ürün
 * kayıtlı listeden seçildiyse kimlikleri gönderilir; elle yazıldıysa lead alanlarında kalır.
 */
export type QuickOpportunityForm = {
  companyId: string;
  companyTitle: string;
  contactId: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  contactMethod: string;
  productModelId: string;
  product: string;
  quantity: string;
  title: string;
  estimatedValue: string;
  currencyCode: 'TRY' | 'USD' | 'EUR';
  probability: string;
  expectedCloseDate: Date | null;
  nextAction: string;
  nextActionAt: Date | null;
  description: string;
  divisionId: string;
  ownerUserId: string;
};

export type QuickOpportunityErrors = Partial<Record<keyof QuickOpportunityForm, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function quantityOf(value: string): number {
  const n = Number(value);
  return n > 0 ? Math.min(999, Math.floor(n)) : 0;
}

export function quickOpportunityTitle(form: Pick<QuickOpportunityForm, 'title' | 'product' | 'quantity'>): string {
  if (form.title.trim()) return form.title.trim();
  const qty = quantityOf(form.quantity);
  return qty > 0 ? `${form.product.trim()} (${qty} adet)` : form.product.trim();
}

function parseAmount(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function validateQuickOpportunity(form: QuickOpportunityForm, requireDivision: boolean): QuickOpportunityErrors {
  const errors: QuickOpportunityErrors = {};
  if (!form.companyId && !form.contactName.trim()) errors.contactName = 'Kayıtlı bir firma seçin ya da kontak ismini yazın.';
  if (!form.product.trim()) errors.product = 'İstenen ürün zorunludur.';
  if (!form.city.trim()) errors.city = 'İl zorunludur.';
  const phone = form.phone.trim();
  const email = form.email.trim();
  if (!phone && !email) errors.phone = 'Telefon veya e-postadan en az biri zorunludur.';
  if (phone && phone.replace(/\D/g, '').length < 7) errors.phone = 'Telefon en az 7 rakam içermelidir.';
  if (email && !EMAIL.test(email)) errors.email = 'Geçerli bir e-posta adresi girin.';
  if (form.nextActionAt && !form.nextAction.trim()) errors.nextAction = 'Takip zamanı seçtiyseniz ilk takip aksiyonunu da yazın.';
  if (Number.isNaN(parseAmount(form.estimatedValue))) errors.estimatedValue = 'Sayısal bir tutar girin.';
  const probability = Number(form.probability || '50');
  if (!Number.isInteger(probability) || probability < 0 || probability > 100) errors.probability = '0-100 arası bir oran girin.';
  if (requireDivision && !form.divisionId) errors.divisionId = 'Bölüm seçin.';
  return errors;
}

export function buildQuickOpportunityBody(form: QuickOpportunityForm) {
  const phone = form.phone.trim();
  const email = form.email.trim();
  const product = form.product.trim();
  const qty = quantityOf(form.quantity);
  const amount = parseAmount(form.estimatedValue);
  const place = [form.city.trim(), form.district.trim()].filter(Boolean).join(' / ');
  const description = [
    form.description.trim() || null,
    `İstenen ürün: ${product}`,
    qty > 0 ? `Adet: ${qty}` : null,
    `Şehir: ${place}`,
    'Kaynak: Hızlı fırsat (mobil)',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    title: quickOpportunityTitle(form),
    ...(form.companyId ? { companyId: form.companyId } : {}),
    ...(form.companyId && form.contactId ? { primaryContactId: form.contactId } : {}),
    ...(form.contactName.trim() ? { leadContactName: form.contactName.trim() } : {}),
    ...(form.companyTitle.trim() ? { leadCompanyTitle: form.companyTitle.trim() } : {}),
    ...(phone || email ? { leadContactValue: phone || email } : {}),
    ...(phone ? { leadPhone: phone } : {}),
    ...(email ? { leadEmail: email } : {}),
    leadCity: form.city.trim(),
    ...(form.district.trim() ? { leadDistrict: form.district.trim() } : {}),
    leadFollowUpStatus: 'new' as const,
    requestedMachine: product,
    products: [
      {
        ...(form.productModelId ? { productModelId: form.productModelId } : {}),
        machineName: product,
        quantity: qty || 1,
      },
    ],
    ...(form.nextAction.trim() ? { nextAction: form.nextAction.trim() } : {}),
    ...(form.nextActionAt ? { nextActionAt: form.nextActionAt.toISOString() } : {}),
    ...(form.contactMethod ? { sourceCode: form.contactMethod } : {}),
    description,
    ...(form.divisionId ? { divisionId: form.divisionId } : {}),
    ...(form.ownerUserId ? { ownerUserId: form.ownerUserId } : {}),
    ...(amount !== null && !Number.isNaN(amount) ? { estimatedValue: amount } : {}),
    currencyCode: form.currencyCode,
    probability: Number(form.probability || '50'),
    ...(form.expectedCloseDate ? { expectedCloseDate: form.expectedCloseDate.toISOString() } : {}),
  };
}
