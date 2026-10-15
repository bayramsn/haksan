import { request, type Paginated } from '@/src/api/client';
import type { AccountingInvoice, AccountingInvoiceDetail, Payment } from '@/src/api/endpoints';

/** finance.service.ts `getCompanyStatement` satırı. */
export type StatementLine = {
  id: string;
  date: string;
  type: string;
  description: string;
  invoiceNo: string | null;
  debit: number;
  credit: number;
  balance: number;
  currencyCode: string | null;
};

/** finance.service.ts `paymentTermSuggestion`. */
export type PaymentTermSuggestion = {
  paymentTermDays: number | null;
  contractNo: string | null;
  source: 'contract' | 'none';
};

/** files.service.ts `listLinks` satırı (kayda bağlı dosyalar). */
export type FileLinkRow = {
  id: string;
  fileId: string;
  description: string | null;
  createdAt: string;
  file: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    uploaderName: string | null;
  } | null;
  documentType: { code: string; name: string } | null;
};

/** packages/shared `paymentUpdateSchema`. */
export type PaymentUpdateBody = {
  direction?: 'in' | 'out';
  companyId?: string;
  amount?: number;
  currencyCode?: string;
  paymentDate?: string;
  paymentMethod?: string;
  invoiceNo?: string;
  notes?: string;
  status?: string;
};

/** packages/shared `accountingInvoiceCreateSchema` (tarihler ISO). */
export type AccountingInvoiceBody = {
  companyId: string;
  type: 'sales' | 'purchase';
  invoiceCategory: 'commercial' | 'administrative';
  invoiceNo: string;
  invoiceDate: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  currencyCode: string;
  paymentType: 'cash' | 'leasing' | 'term';
  paymentTermDays?: number;
  previousPaymentTermDays?: number;
  termChangeReason?: string;
  incoterm?: string;
  shipmentReference?: string;
  orderNo?: string;
  expectedDate?: string;
  quoteId?: string;
  salesOrderId?: string;
  firstDueDate?: string;
  lastDueDate?: string;
  installmentCount: number;
  notes?: string;
  installments?: { installmentNo: number; dueDate: string; amount: number }[];
  lineItems?: {
    saleType?: 'tezgah' | 'product';
    inventoryItemId?: string;
    productModelId?: string;
    categoryCode?: string;
    description: string;
    quantity: number;
    listPrice?: number;
    unitPrice: number;
    discountAmount: number;
    vatRate: number;
    lineTotal: number;
    expectedDate?: string;
  }[];
};

export const financeApi = {
  updatePayment: (id: string, body: PaymentUpdateBody) =>
    request<Payment>(`/payments/${id}`, { method: 'PATCH', body }),
  deletePayment: (id: string) => request<{ ok: true }>(`/payments/${id}`, { method: 'DELETE' }),
  companyStatement: (companyId: string, query: { from?: string; to?: string } = {}) =>
    request<StatementLine[]>(`/companies/${companyId}/statement`, { query }),
  paymentTermSuggestion: (query: { companyId: string; quoteId?: string }) =>
    request<PaymentTermSuggestion>('/accounting-invoices/payment-term-suggestion', { query }),
  invoicesPage: (query: {
    page: number;
    pageSize: number;
    type?: 'sales' | 'purchase';
    invoiceCategory?: 'commercial' | 'administrative';
  }) =>
    request<{ data: AccountingInvoice[]; page: number; pageSize: number; total: number }>('/accounting-invoices', {
      query,
    }),
  createAccountingInvoice: (body: AccountingInvoiceBody) =>
    request<AccountingInvoiceDetail>('/accounting-invoices', { method: 'POST', body }),
  updateAccountingInvoice: (id: string, body: Partial<AccountingInvoiceBody>) =>
    request<AccountingInvoiceDetail>(`/accounting-invoices/${id}`, { method: 'PATCH', body }),
  deleteAccountingInvoice: (id: string) => request<{ ok: true }>(`/accounting-invoices/${id}`, { method: 'DELETE' }),
  companyFiles: (companyId: string, query: { page: number; pageSize: number }) =>
    request<Paginated<FileLinkRow>>('/files/links', {
      query: { entityType: 'company', entityId: companyId, ...query },
    }),
};
