import { request, type Paginated } from './client';
import type { CommercialInvoiceDetail, ContractDetail, ProformaDetail } from './endpoints';

/**
 * Proforma / sözleşme / ticari fatura yazma uçları ve belge merkezinin dosya
 * bağlantıları. Gövdeler `packages/shared/src/schemas/quote.ts`
 * (proformaCreateSchema, standaloneProformaCreateSchema, contractCreateSchema,
 * standaloneContractCreateSchema, commercialInvoiceCreateSchema) ile birebir.
 */

export type DocumentPriceItem = { quoteItemId: string; unitPrice: number; discountAmount?: number };

export type DocumentTermsInput = {
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

export type ProformaInput = {
  quoteId: string;
  documentNo?: string;
  issueDate: string;
  statusCode: string;
  fileId?: string;
  items?: DocumentPriceItem[];
  headerDiscountAmount?: number;
  headerDiscountPercent?: number;
  terms?: DocumentTermsInput;
};

export type ContractInput = {
  quoteId: string;
  contractNo?: string;
  signedDate?: string;
  paymentTermDays?: number;
  statusCode: string;
  fileId?: string;
  items?: DocumentPriceItem[];
  headerDiscountAmount?: number;
  headerDiscountPercent?: number;
  terms?: DocumentTermsInput;
};

export type FreeItemInput = {
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  discountAmount: number;
  vatRate: number;
  brand?: string;
  model?: string;
  originCountry?: string;
  hsCode?: string;
};

export type StandalonePartyInput = {
  companyId?: string;
  companyName?: string;
  companyAddress?: string;
  companyTaxOffice?: string;
  companyTaxNumber?: string;
  contactName?: string;
  contactPhone?: string;
};

export type StandaloneProformaInput = StandalonePartyInput & {
  divisionId?: string;
  documentNo?: string;
  issueDate: string;
  statusCode: string;
  currencyCode: string;
  items: FreeItemInput[];
  headerDiscountAmount?: number;
  headerDiscountPercent?: number;
  paymentTerms?: string;
  deliveryTerms?: string;
  warrantyTerms?: string;
  notes?: string;
};

/** Web QuickContractDialog vade satırı — shared `standaloneContractInstallmentSchema`. */
export type ContractInstallmentInput = {
  label?: string;
  amount: number;
  dueDate?: string;
  promissoryNote?: boolean;
  paymentMethod?:
    | 'undecided'
    | 'cash'
    | 'wire_transfer'
    | 'promissory_note'
    | 'term'
    | 'installment'
    | 'leasing'
    | 'letter_of_credit'
    | 'cheque';
};

export type StandaloneContractInput = StandalonePartyInput & {
  divisionId?: string;
  contractNo?: string;
  signedDate: string;
  paymentTermDays?: number;
  statusCode: string;
  currencyCode: string;
  items: FreeItemInput[];
  headerDiscountAmount?: number;
  headerDiscountPercent?: number;
  paymentTerms?: string;
  deliveryTerms?: string;
  warrantyTerms?: string;
  deliveryLocation?: string;
  estimatedDeliveryDaysMin?: number;
  estimatedDeliveryDaysMax?: number;
  importCostsExcluded?: boolean;
  vatIncluded?: boolean;
  freightPaidBySeller?: boolean;
  installments?: ContractInstallmentInput[];
};

export type CommercialInvoiceInput = {
  quoteId: string;
  invoiceNo?: string;
  invoiceDate: string;
  statusCode: string;
  fileId?: string;
};

export type AccountingInvoiceInput = {
  companyId: string;
  type: 'sales';
  invoiceNo: string;
  invoiceDate: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  currencyCode: string;
  paymentType: 'cash' | 'leasing' | 'term';
  paymentTermDays?: number;
  quoteId?: string;
  salesOrderId?: string;
  orderNo?: string;
  notes?: string;
};

/** `GET /files/links` satırı: bağlantı alanları + dosya + belge türü (files.service.ts listLinks). */
export type FileLinkRow = {
  id: string;
  fileId: string;
  entityType: string;
  entityId: string;
  description: string | null;
  createdAt: string;
  file: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    uploadedBy: string | null;
    uploaderName: string | null;
  };
  documentType: { code: string; name: string } | null;
};

export const proformaApi = {
  create: (body: ProformaInput) => request<ProformaDetail>('/proformas', { method: 'POST', body }),
  createStandalone: (body: StandaloneProformaInput) =>
    request<ProformaDetail>('/proformas/standalone', { method: 'POST', body }),
  update: (id: string, body: Partial<ProformaInput>) =>
    request<ProformaDetail>(`/proformas/${id}`, { method: 'PATCH', body }),
  updateStandalone: (id: string, body: StandaloneProformaInput) =>
    request<ProformaDetail>(`/proformas/standalone/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ ok: true }>(`/proformas/${id}`, { method: 'DELETE' }),
};

export const contractApi = {
  create: (body: ContractInput) => request<ContractDetail>('/contracts', { method: 'POST', body }),
  createStandalone: (body: StandaloneContractInput) =>
    request<ContractDetail>('/contracts/standalone', { method: 'POST', body }),
  update: (id: string, body: Partial<ContractInput>) =>
    request<ContractDetail>(`/contracts/${id}`, { method: 'PATCH', body }),
  updateStandalone: (id: string, body: StandaloneContractInput) =>
    request<ContractDetail>(`/contracts/standalone/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ ok: true }>(`/contracts/${id}`, { method: 'DELETE' }),
};

export const commercialInvoiceApi = {
  create: (body: CommercialInvoiceInput) =>
    request<CommercialInvoiceDetail>('/commercial-invoices', { method: 'POST', body }),
  update: (id: string, body: Partial<CommercialInvoiceInput>) =>
    request<CommercialInvoiceDetail>(`/commercial-invoices/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ ok: true }>(`/commercial-invoices/${id}`, { method: 'DELETE' }),
};

export const accountingInvoiceCreateApi = {
  create: (body: AccountingInvoiceInput) =>
    request<{ id: string; invoiceNo: string }>('/accounting-invoices', { method: 'POST', body }),
};

export const fileLinksApi = {
  list: (query: { page: number; pageSize: number; entityType?: string; entityId?: string }) =>
    request<Paginated<FileLinkRow>>('/files/links', { query }),
  remove: (fileId: string) => request<{ ok: true }>(`/files/${fileId}`, { method: 'DELETE' }),
};
