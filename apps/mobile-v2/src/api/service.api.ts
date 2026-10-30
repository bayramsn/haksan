import { request, type Paginated } from '@/src/api/client';
import { apiBaseUrl } from '@/src/api/config';
import type { CustomerDevice, Installation, ServiceComplaint, ServiceTicket } from '@/src/api/endpoints';
import { getPdfAndShare } from '@/src/native/files';
import { collectPaginated } from './pagination';

type Severity = 'low' | 'normal' | 'high' | 'critical';
type TicketType = 'complaint' | 'request' | 'warranty_claim' | 'question';
type ComplaintSource = 'qr' | 'web' | 'phone' | 'whatsapp' | 'email' | 'manual';

/** packages/shared serviceComplaintCreateSchema. */
export type ComplaintCreateBody = {
  companyId?: string | null;
  customerDeviceId?: string | null;
  source?: ComplaintSource;
  subject: string;
  description?: string | null;
  severity?: Severity;
  ticketType?: TicketType;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
};

/** service-complaints.controller `safeLink` + liste birleşimi. */
export type ComplaintLink = {
  id: string;
  slug: string;
  title: string | null;
  notes: string | null;
  isActive: boolean;
  revokedAt: string | null;
  accessTokenExpiresAt: string | null;
  companyId: string | null;
  customerDeviceId: string | null;
  createdAt: string;
  company?: { id: string; legalTitle: string; shortName: string | null } | null;
  machine?: { id: string; serialNumber: string | null; brand: string | null; model: string | null } | null;
};

/** Oluşturma/yenilemede bir kez dönen erişim bilgisi; token saklanmaz. */
export type ComplaintLinkCredential = ComplaintLink & { token: string; publicPath: string; qrPublicPath?: string };

/** service.controller `ticketCreate` + metadata. */
export type TicketCreateBody = {
  companyId: string;
  contactId?: string;
  customerDeviceId?: string;
  subject: string;
  description?: string;
  severity?: Severity;
  ticketType?: TicketType;
  source?: 'manual' | 'phone' | 'email' | 'whatsapp' | 'portal' | 'web' | 'qr';
  assignedToUserId?: string | null;
  metadata?: Record<string, unknown>;
};

export type TicketUpdateBody = {
  description?: string;
  resolutionNote?: string;
  severity?: Severity;
  ticketType?: TicketType;
  assignedToUserId?: string | null;
  metadata?: Record<string, unknown>;
};

/** shared customerDeviceCreateSchema. */
export type CustomerDeviceCreateBody = {
  companyId: string;
  contactId?: string | null;
  initialCompanyId?: string;
  inventoryItemId?: string;
  opportunityId?: string;
  installationDate?: string;
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  deliveryDate?: string;
  notes?: string;
};

export type CustomerDeviceUpdateBody = Partial<CustomerDeviceCreateBody> & {
  warrantyStartDate?: string | null;
  warrantyEndDate?: string | null;
  installationDate?: string | null;
  notes?: string | null;
};

/** service.controller `installCreate`. */
export type InstallationBody = {
  companyId?: string | null;
  contactId?: string | null;
  customerDeviceId?: string | null;
  opportunityId?: string | null;
  quoteId?: string | null;
  scheduledDate?: string | null;
  assignedToUserId?: string | null;
  location?: string | null;
  locationType?: 'istanbul_ici' | 'istanbul_disi' | null;
  durationMinutes?: number | null;
  notes?: string | null;
  formData?: Record<string, unknown> | null;
};

/** `GET /files/links` satırı (files.service listLinks). */
export type EntityFileLink = {
  id: string;
  entityType: string;
  entityId: string;
  file: { id: string; originalFilename: string; mimeType: string; sizeBytes: number; createdAt: string; uploaderName: string | null };
  documentType: { code: string | null; name: string | null } | null;
};

export const serviceApi = {
  attachments: (entityType: 'service_ticket' | 'service_complaint_intake', entityId: string) =>
    collectPaginated((page) => request<Paginated<EntityFileLink>>('/files/links', { query: { entityType, entityId, page, pageSize: 100 } })),

  createTicket: (body: TicketCreateBody) => request<ServiceTicket>('/service-tickets', { method: 'POST', body }),
  updateTicket: (id: string, body: TicketUpdateBody) =>
    request<ServiceTicket>(`/service-tickets/${id}`, { method: 'PATCH', body }),
  /** Kanban/aşama geçişi: durum kodu + metadata.serviceStage birlikte. */
  setTicketStage: (id: string, body: { statusCode: string; serviceStage: string }) =>
    request<{ ok: true }>(`/service-tickets/${id}/status`, { method: 'PATCH', body }),

  createComplaint: (body: ComplaintCreateBody) =>
    request<ServiceComplaint>('/service-complaints', { method: 'POST', body }),
  complaintLinks: (query: { page: number; pageSize: number; companyId?: string; customerDeviceId?: string }) =>
    request<Paginated<ComplaintLink>>('/service-complaint-links', { query }),
  createComplaintLink: (body: { companyId?: string | null; customerDeviceId?: string | null; title?: string | null; notes?: string | null }) =>
    request<ComplaintLinkCredential>('/service-complaint-links', { method: 'POST', body }),
  rotateComplaintLink: (id: string) =>
    request<ComplaintLinkCredential>(`/service-complaint-links/${id}/rotate`, { method: 'PATCH', body: {} }),
  revokeComplaintLink: (id: string) =>
    request<ComplaintLink>(`/service-complaint-links/${id}/revoke`, { method: 'PATCH', body: {} }),

  deleteMaintenancePlan: (id: string) => request<{ ok: true }>(`/maintenance-plans/${id}`, { method: 'DELETE' }),

  createInstallation: (body: InstallationBody) => request<Installation>('/installations', { method: 'POST', body }),
  updateInstallation: (id: string, body: InstallationBody) =>
    request<Installation>(`/installations/${id}`, { method: 'PATCH', body }),
  deleteInstallation: (id: string) => request<{ ok: true }>(`/installations/${id}`, { method: 'DELETE' }),

  consumeServiceParts: (body: {
    serviceTicketId: string;
    companyId?: string;
    lines: { productModelId: string; quantity: number; notes?: string }[];
  }) => request<unknown>('/inventory/consume-service-parts', { method: 'POST', body }),
  createCustomerDevice: (body: CustomerDeviceCreateBody) =>
    request<CustomerDevice>('/customer-devices', { method: 'POST', body }),
  updateCustomerDevice: (id: string, body: CustomerDeviceUpdateBody) =>
    request<CustomerDevice>(`/customer-devices/${id}`, { method: 'PATCH', body }),

  /** Seçili listede kalem yoksa web gibi yeni kalem açılır (priceListItemCreateSchema). */
  createPriceListItem: (listId: string, body: { productModelId: string; listPrice?: number; cashPrice?: number }) =>
    request<{ id: string }>(`/price-lists/${listId}/items`, { method: 'POST', body }),
};

/**
 * Servis formu PDF'i. Paylaşım yardımcısı yalnız API kökünü (origin) birleştirir;
 * `/api/v1` öneki çalışan taban adresten alınır ki farklı ortamlarda sabit kalmasın.
 */
export function openServiceFormPdf(ticketId: string, ticketNo?: string | null): Promise<void> {
  const prefix = new URL(apiBaseUrl()).pathname.replace(/\/+$/, '');
  return getPdfAndShare(`${prefix}/service-tickets/${ticketId}/service-form.pdf`, `servis-formu-${ticketNo || ticketId}.pdf`);
}
