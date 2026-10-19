import { request, type Paginated } from './client';
import type { OpportunityListItem, QuoteDetail, QuoteItem, QuoteListItem, QuoteListQuery, QuoteTerms } from './endpoints';

/**
 * Teklif yazma uçları. Gövdeler `packages/shared/src/schemas/quote.ts`
 * (quoteCreateSchema / quoteItemCreateSchema / quoteTermsUpsertSchema) ile
 * birebir; tarih alanları ISO metni olarak gider, sunucu `z.coerce.date()` ile
 * okur.
 */

/** `packages/shared` quoteCreateSchema ile birebir — web QuoteDialog gövdesi. */
export type QuoteCreateInput = {
  opportunityId?: string;
  companyId: string;
  /** PDF’de kullanılacak firma adresi (web `companyAddressId`). */
  companyAddressId?: string;
  divisionId?: string;
  contactId?: string;
  documentNo?: string;
  quoteDate: string;
  validityDays: number;
  /** Teklifi gönderen / proje sahibi (web `projectOwnerUserId`). */
  projectOwnerUserId?: string;
  currencyCode: string;
  headerDiscountAmount: number;
  headerDiscountPercent: number;
  paymentTerms?: string;
  deliveryTerms?: string;
  warrantyTerms?: string;
  notes?: string;
  /** Ayarlar → İmzalar; `null` = imzasız. */
  signatureId?: string | null;
};

export type QuoteUpdateInput = Partial<QuoteCreateInput>;

/** Web `quoteItemCompatibilitySchema` — satır grubu, opsiyon, lazer profili. */
export type QuoteSelectedProductOption = {
  optionSetId: string;
  optionValueId: string;
  name: string;
  value: string;
  priceDelta: number;
  currencyCode: string;
};

export type QuoteItemTechnicalSpec = {
  key: string;
  value: string;
  unit?: string;
  specUnit?: string;
  groupCode?: string;
  groupName?: string;
  group?: string;
};

export type QuoteItemCompatibility = {
  lineGroupKey?: string;
  configurationOptionSetId?: string;
  machineIds?: string[];
  brands?: string[];
  controlUnits?: string[];
  supplierIds?: string[];
  technicalSpecs?: QuoteItemTechnicalSpec[];
  technicalConfiguration?: unknown | null;
  selectedProductOptions?: QuoteSelectedProductOption[];
};

export type QuoteItemInput = {
  productModelId?: string;
  stockCode?: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  discountAmount: number;
  vatRate: number;
  sortOrder: number;
  /** Millileştirilmiş ithal işleme merkezi (web QuoteDialog). */
  nationalized?: boolean;
  compatibility?: QuoteItemCompatibility | null;
};

export type QuoteTermsInput = {
  paymentTermsText?: string;
  deliveryTermsText?: string;
  warrantyTermsText?: string;
  importCostsExcluded: boolean;
  vatIncluded?: boolean;
  freightPaidBySeller?: boolean;
  deliveryLocation?: string;
  estimatedDeliveryDaysMin?: number;
  estimatedDeliveryDaysMax?: number;
};

/** `GET /quotes/:id` ham satırı `statusNote` alanını da taşır (quotes tablosu `status_note`). */
export type QuoteDetailWithNote = QuoteDetail & { statusNote?: string | null; divisionId?: string | null };

export type OpportunityForQuoteInput = {
  companyId: string;
  title: string;
  estimatedValue: number;
  currencyCode: string;
  probability: number;
  divisionId?: string;
};

export const quotesApi = {
  create: (body: QuoteCreateInput) => request<QuoteDetail>('/quotes', { method: 'POST', body }),
  update: (id: string, body: QuoteUpdateInput) => request<QuoteDetail>(`/quotes/${id}`, { method: 'PATCH', body }),
  addItem: (id: string, body: QuoteItemInput) => request<QuoteItem>(`/quotes/${id}/items`, { method: 'POST', body }),
  updateItem: (id: string, itemId: string, body: Partial<QuoteItemInput>) =>
    request<QuoteItem>(`/quotes/${id}/items/${itemId}`, { method: 'PATCH', body }),
  deleteItem: (id: string, itemId: string) =>
    request<{ ok: true }>(`/quotes/${id}/items/${itemId}`, { method: 'DELETE' }),
  terms: (id: string, body: QuoteTermsInput) => request<QuoteTerms>(`/quotes/${id}/terms`, { method: 'PUT', body }),
  approvePrice: (id: string, note?: string) =>
    request<QuoteDetail>(`/quotes/${id}/price-approval/approve`, { method: 'POST', body: note ? { note } : {} }),
  rejectPrice: (id: string, note?: string) =>
    request<QuoteDetail>(`/quotes/${id}/price-approval/reject`, { method: 'POST', body: note ? { note } : {} }),
  /** KPI sayaçları: yalnız `meta.total` okunur, satır taşınmasın diye pageSize 1. */
  count: (query: QuoteListQuery) =>
    request<Paginated<QuoteListItem>>('/quotes', { query: { ...query, page: 1, pageSize: 1 } }),
  page: (query: QuoteListQuery & { page: number; pageSize: number }) =>
    request<Paginated<QuoteListItem>>('/quotes', { query }),
};

/**
 * Teklif akışının dokunduğu fırsat uçları. Web `store.createQuoteFull`: fırsat
 * seçilmeden kaydedilen teklif için kart açılır, sonra "quote" aşamasına alınır;
 * kayıp karttaki "Satışa Al" da aynı aşama ucunu `sales` ile çağırır.
 */
export const quoteOpportunityApi = {
  create: (body: OpportunityForQuoteInput) =>
    request<OpportunityListItem>('/opportunities', { method: 'POST', body }),
  changeStage: (id: string, body: { toStage: 'quote' | 'sales'; changeReason?: string }) =>
    request<OpportunityListItem>(`/opportunities/${id}/stage`, { method: 'PATCH', body }),
  lost: (query: { page: number; pageSize: number }) =>
    request<Paginated<OpportunityListItem>>('/opportunities', {
      query: { ...query, qualificationStage: 'lost', view: 'all' },
    }),
};
