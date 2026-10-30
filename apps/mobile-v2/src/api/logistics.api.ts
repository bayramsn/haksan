import { request, type Paginated } from '@/src/api/client';
import type { Shipment } from '@/src/api/endpoints';

/** GET /shipments/company-options satırı (en çok 100). */
export type ShipmentCompanyOption = {
  id: string;
  legalTitle: string;
  shortName: string | null;
  sector: string | null;
  supplierCategoryCode: string | null;
};

/** service.controller listDeliveries: teslimat satırı + firma özeti. */
export type Delivery = {
  id: string;
  companyId: string;
  opportunityId: string | null;
  shipmentId: string | null;
  salesOrderId: string | null;
  deliveryDate: string | null;
  signedBy: string | null;
  status: 'pending' | 'completed' | string;
  notes: string | null;
  formData: Record<string, unknown> | null;
  createdAt: string;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
};

/** Sunucu enrichShipment alanları; ortak tipte bulunmayanlar burada genişletilir. */
export type ShipmentDetail = Omit<Shipment, 'items'> & {
  senderName?: string | null;
  deliveryAddressSnapshot?: string | null;
  incoterm?: string | null;
  items: {
    id: string;
    description: string | null;
    quantity: string | null;
    serialNumber?: string | null;
    unit?: { code: string; name: string } | null;
  }[];
};

export const logisticsApi = {
  shipmentCompanyOptions: (query: { purpose: 'sender' | 'carrier'; transportMode?: string; search?: string }) =>
    request<ShipmentCompanyOption[]>('/shipments/company-options', { query }),
  /** Gövde shared shipmentCreateSchema'ya göre `buildShipmentPayload` ile kurulur. */
  createShipment: (body: Record<string, unknown>) => request<ShipmentDetail>('/shipments', { method: 'POST', body }),
  deleteShipment: (id: string) => request<{ ok: true }>(`/shipments/${id}`, { method: 'DELETE' }),

  deliveries: (query: { page: number; pageSize: number }) => request<Paginated<Delivery>>('/deliveries', { query }),
  /** Gövde shared deliveryCreateSchema'ya göre `buildDeliveryPayload` ile kurulur. */
  createDelivery: (body: Record<string, unknown>) => request<Delivery>('/deliveries', { method: 'POST', body }),
  updateDelivery: (id: string, body: Record<string, unknown>) =>
    request<Delivery>(`/deliveries/${id}`, { method: 'PATCH', body }),
  updateDeliveryStatus: (id: string, status: 'pending' | 'completed') =>
    request<{ ok: true }>(`/deliveries/${id}/status`, { method: 'PATCH', body: { status } }),
  deleteDelivery: (id: string) => request<{ ok: true }>(`/deliveries/${id}`, { method: 'DELETE' }),
};
