import { request, type Paginated } from '@/src/api/client';
import type { OrderItem, PurchaseOrder, PurchaseOrderDetail } from '@/src/api/endpoints';

/** packages/shared `purchaseOrderCreateSchema` (tarihler ISO). */
export type PurchaseOrderBody = {
  supplierCompanyId?: string;
  divisionId?: string;
  purchaseType: 'commercial' | 'administrative';
  paymentType: 'cash' | 'leasing' | 'term';
  paymentTermDays?: number;
  previousPaymentTermDays?: number;
  termChangeReason?: string;
  invoiceNo?: string;
  orderNo?: string;
  orderDate: string;
  expectedDate?: string;
  currencyCode: string;
  incoterm?: string;
  shipmentReference?: string;
  notes?: string;
};

/** packages/shared `purchaseOrderItemCreateSchema`. */
export type PurchaseOrderItemBody = {
  productModelId?: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  listPrice?: number;
  approvedPrice?: number;
  discountAmount: number;
  vatRate: number;
  expectedDate?: string;
  sortOrder: number;
};

export const purchaseApi = {
  listPage: (query: { page: number; pageSize: number; search?: string; statusCode?: string }) =>
    request<Paginated<PurchaseOrder>>('/purchase-orders', { query }),
  create: (body: PurchaseOrderBody) => request<PurchaseOrderDetail>('/purchase-orders', { method: 'POST', body }),
  update: (id: string, body: Partial<PurchaseOrderBody>) =>
    request<PurchaseOrderDetail>(`/purchase-orders/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ ok: true }>(`/purchase-orders/${id}`, { method: 'DELETE' }),
  addItem: (id: string, body: PurchaseOrderItemBody) =>
    request<OrderItem>(`/purchase-orders/${id}/items`, { method: 'POST', body }),
};
