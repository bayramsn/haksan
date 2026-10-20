import { request } from './client';
import type { OrderItem, SalesOrder, SalesOrderDetail } from './endpoints';

/** Liste satırı kalemlerden türetilen ürün adını da taşır (orders.service.ts `productName`). */
export type SalesOrderListRow = SalesOrder & { productName?: string | null };

/**
 * Satış siparişi yazma uçları. Gövdeler `packages/shared/src/schemas/order.ts`
 * (salesOrderCreateSchema / salesOrderItemCreateSchema) ile birebir.
 */

export type SalesOrderInput = {
  quoteId?: string;
  opportunityId?: string;
  companyId: string;
  divisionId?: string;
  /** Edit’te temizleme için `null` (API `?? null` yazar). */
  contactId?: string | null;
  orderNo?: string | null;
  orderDate: string;
  currencyCode: string;
  notes?: string | null;
};

export type SalesOrderItemInput = {
  productModelId?: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  discountAmount: number;
  vatRate: number;
  sortOrder: number;
};

export const salesOrdersApi = {
  create: (body: SalesOrderInput) => request<SalesOrderDetail>('/sales-orders', { method: 'POST', body }),
  update: (id: string, body: Partial<SalesOrderInput>) =>
    request<SalesOrderDetail>(`/sales-orders/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ ok: true }>(`/sales-orders/${id}`, { method: 'DELETE' }),
  addItem: (id: string, body: SalesOrderItemInput) =>
    request<OrderItem>(`/sales-orders/${id}/items`, { method: 'POST', body }),
};
