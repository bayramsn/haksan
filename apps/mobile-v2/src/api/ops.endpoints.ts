import type { AccountingInvoiceCreateInput, AccountingInvoiceUpdateInput, InventoryItemCreateInput, PaymentUpdateInput, ShipmentCreateInput } from '@haksan/shared';
import { request } from './client';

/** C fazı (Operasyon & Finans) için web'de olup mobilde eksik kalan uçlar. */
export const ops = {
  updatePayment: (id: string, body: PaymentUpdateInput) => request<{ id: string }>(`/payments/${id}`, { method: 'PATCH', body }),
  deletePayment: (id: string) => request<unknown>(`/payments/${id}`, { method: 'DELETE' }),
  createReceivable: (body: import('@haksan/shared').ReceivableCreateInput) => request<{ id: string }>('/receivables', { method: 'POST', body }),
  invoiceTermSuggestion: (query: { companyId: string; quoteId?: string }) =>
    request<{ paymentTermDays: number | null; contractNo: string | null; source: 'contract' | 'none' }>('/accounting-invoices/payment-term-suggestion', { query }),
  createInvoice: (body: AccountingInvoiceCreateInput) => request<{ id: string }>('/accounting-invoices', { method: 'POST', body }),
  createShipment: (body: ShipmentCreateInput) => request<{ id: string }>('/shipments', { method: 'POST', body }),
  deleteShipment: (id: string) => request<unknown>(`/shipments/${id}`, { method: 'DELETE' }),
  createInventoryItem: (body: InventoryItemCreateInput) => request<{ id: string }>('/inventory', { method: 'POST', body }),
  updateInvoice: (id: string, body: AccountingInvoiceUpdateInput) => request<{ id: string }>(`/accounting-invoices/${id}`, { method: 'PATCH', body }),
};
