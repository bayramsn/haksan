/**
 * Domain servis sarmalları — web'deki `apps/web/src/lib/services.ts` port'u.
 * Backend ile konuşan tek yer burası; ekranlar yalnız bu servisleri çağırır.
 * Web'e göre fark: DOM/`import.meta.env` parçaları çıkarıldı (PDF/dosya indirme
 * RN tarafında Phase 2'de `Share`/`Linking` ile eklenecek).
 */
import type {
  ActivityCreateInput,
  AccountingInvoiceCreateInput,
  BrandCreateInput,
  CallCreateInput,
  ChatMemberRole,
  CreateGroupInput,
  SendMessageInput,
  UpdateGroupInput,
  CommercialInvoiceCreateInput,
  CommercialInvoiceUpdateInput,
  CompanyCreateInput,
  CompanyUpdateInput,
  CompetitorCreateInput,
  CompetitorProductCreateInput,
  CompetitorUpdateInput,
  ContactCreateInput,
  ContactUpdateInput,
  ContractCreateInput,
  ContractUpdateInput,
  CustomerDeviceCreateInput,
  DeliveryCreateInput,
  DeliveryUpdateInput,
  DepartmentCreateInput,
  DepartmentUpdateInput,
  FileLinkInput,
  InventoryItemCreateInput,
  InventoryItemUpdateInput,
  InventoryReserveInput,
  InventorySellInput,
  NoteTemplateCreateInput,
  OpportunityCreateInput,
  OpportunityStageChangeInput,
  OpportunityUpdateInput,
  OrderStatusUpdateInput,
  PaymentCreateInput,
  PriceListCreateInput,
  PriceListItemCreateInput,
  PriceListItemUpdateInput,
  PriceListUpdateInput,
  ProductCreateInput,
  ProductDetailsReplaceInput,
  ProductEquipmentCreateInput,
  ProductSpecCreateInput,
  ProductUpdateInput,
  ProformaCreateInput,
  ProformaUpdateInput,
  PublicServiceComplaintInput,
  PurchaseOrderCreateInput,
  PurchaseOrderItemCreateInput,
  PurchaseOrderUpdateInput,
  QuoteCreateInput,
  QuoteItemCreateInput,
  QuoteItemUpdateInput,
  QuoteTermsUpsertInput,
  QuoteUpdateInput,
  ReceivableCreateInput,
  RoleCreateInput,
  RoleUpdateInput,
  SalesOrderCreateInput,
  SalesOrderFromQuoteInput,
  SalesOrderItemCreateInput,
  SalesOrderUpdateInput,
  ServiceComplaintConvertInput,
  ServiceComplaintCreateInput,
  ServiceComplaintLinkCreateInput,
  ServiceComplaintRejectInput,
  ServiceComplaintUpdateInput,
  ShipmentCreateInput,
  SignedUploadUrlInput,
  TargetUpsertInput,
  TenantUpdateInput,
  UserCreateInput,
  UserUpdateInput,
  VisitCreateInput,
  WarehouseCreateInput,
  CallAssistantAction,
  CallSuggestionActionInput,
  ManualCallEventInput,
  MobileCallEventInput,
} from '@haksan/shared';
import { api, getAccessToken, getActiveDivision } from '../lib/apiClient';

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

// ───── Companies ─────
export interface CompanyDTO {
  id: string;
  legalTitle: string;
  shortName?: string | null;
  sector?: string | null;
  taxNumber?: string | null;
  taxOffice?: string | null;
  website?: string | null;
  notes?: string | null;
  relationTypeId?: string | null;
  customerStatusId?: string | null;
  createdAt: string;
}

export const companyService = {
  list: (params?: Record<string, string | number | undefined>) =>
    api.get<Paginated<CompanyDTO>>(`/companies${qs(params)}`),
  get: (id: string) => api.get<CompanyDTO & { addresses: any[]; phones: any[]; emails: any[] }>(`/companies/${id}`),
  create: (body: CompanyCreateInput) => api.post<CompanyDTO>('/companies', body),
  update: (id: string, body: CompanyUpdateInput) => api.patch<CompanyDTO>(`/companies/${id}`, body),
  remove: (id: string) => api.delete(`/companies/${id}`),
  /** Başka bölümlerdeki açık alacak (borç) uyarısı. */
  crossDivisionDebt: (id: string) =>
    api.get<{ hasDebt: boolean; departments: { id: string; name: string; amount?: number }[]; amount?: number }>(
      `/companies/${id}/cross-department-debt`
    ),
  /** Mükerrer firma için başka bölümden erişim talebi oluşturur (onay akışı). */
  requestAccess: (id: string, note?: string) => {
    const activeDivision = getActiveDivision();
    return api.post(`/companies/${id}/access-requests`, {
      note,
      divisionId: activeDivision && activeDivision !== 'all' ? activeDivision : undefined,
    });
  },
};

export interface AccessRequestRow {
  id: string;
  companyId: string;
  status: string;
  note: string | null;
  createdAt: string;
  ownerDivisionId: string | null;
  requestingDivisionId: string;
  company: { id: string; legalTitle: string; taxNumber: string | null } | null;
  requestingDivision: { id: string; name: string; code: string } | null;
}

export const accessRequestService = {
  list: (params?: { status?: string; page?: number; pageSize?: number }) =>
    api.get<Paginated<AccessRequestRow>>(`/access-requests${qs(params as Record<string, string | number | undefined>)}`),
  approve: (id: string, decisionNote?: string) => api.post(`/access-requests/${id}/approve`, { decisionNote }),
  reject: (id: string, decisionNote?: string) => api.post(`/access-requests/${id}/reject`, { decisionNote }),
};

export interface CallSuggestionDTO {
  id: string;
  title: string;
  body: string | null;
  status: 'pending' | 'acted' | 'dismissed';
  companyId: string;
  contactId: string | null;
  createdAt: string;
  event: {
    id: string;
    eventType: 'completed' | 'missed';
    direction: 'inbound' | 'outbound';
    normalizedPhone: string | null;
    endedAt: string | null;
    startedAt: string | null;
  };
  company: { id: string; legalTitle: string; shortName?: string | null };
  contact: { id: string; fullName: string } | null;
  availableActions: { createQuote: boolean; createServiceTicket: boolean; logCall: boolean };
}

export interface CallEventIngestResponse {
  event: {
    id: string;
    matchStatus: 'matched' | 'unmatched' | 'ambiguous';
    companyId: string | null;
    contactId: string | null;
    normalizedPhone: string | null;
  };
  suggestions: CallSuggestionDTO[];
  idempotent?: boolean;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export const notificationService = {
  list: (params?: { unread?: boolean; pageSize?: number }) =>
    api.get<Paginated<NotificationDTO>>(
      `/notifications${qs({
        unread: params?.unread === undefined ? undefined : String(params.unread),
        pageSize: params?.pageSize,
      })}`
    ),
  markRead: (id: string) => api.patch<NotificationDTO>(`/notifications/${id}/read`, {}),
};

export const callAssistantService = {
  suggestions: (params?: { status?: 'pending' | 'acted' | 'dismissed' }) =>
    api.get<Paginated<CallSuggestionDTO>>(`/call-assistant/suggestions${qs(params)}`),
  manualEvent: (body: ManualCallEventInput) =>
    api.post<CallEventIngestResponse>('/call-assistant/manual-events', body),
  mobileEvent: (body: MobileCallEventInput) => api.post<CallEventIngestResponse>('/mobile/calls/events', body),
  action: (id: string, action: CallAssistantAction, body: Omit<CallSuggestionActionInput, 'action'> = {}) =>
    api.post<any>(`/call-assistant/suggestions/${id}/actions`, { action, ...body }),
};

// ───── Contacts ─────
export const contactService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/contacts${qs(params)}`),
  get: (id: string) => api.get<any>(`/contacts/${id}`),
  companies: (id: string) =>
    api.get<{ id: string; legalTitle: string; shortName: string | null; isPrimary: boolean }[]>(`/contacts/${id}/companies`),
  create: (body: ContactCreateInput) => api.post<any>('/contacts', body),
  update: (id: string, body: ContactUpdateInput) => api.patch<any>(`/contacts/${id}`, body),
  remove: (id: string) => api.delete(`/contacts/${id}`),
};

// ───── Opportunities ─────
export const opportunityService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/opportunities${qs(params)}`),
  get: (id: string) => api.get<any>(`/opportunities/${id}`),
  create: (body: OpportunityCreateInput) => api.post<any>('/opportunities', body),
  update: (id: string, body: OpportunityUpdateInput) => api.patch<any>(`/opportunities/${id}`, body),
  remove: (id: string) => api.delete(`/opportunities/${id}`),
  changeStage: (id: string, body: OpportunityStageChangeInput) => api.patch<any>(`/opportunities/${id}/stage`, body),
};

// ───── Activities ─────
export const activityService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/activities${qs(params)}`),
  create: (body: ActivityCreateInput) => api.post<any>('/activities', body),
  createVisit: (body: VisitCreateInput) => api.post<any>('/visits', body),
  createCall: (body: CallCreateInput) => api.post<any>('/calls', body),
};

export type CalendarEventType = 'customer_visit' | 'meeting' | 'call' | 'task' | 'other';
export interface CalendarEventDTO {
  id: string;
  ownerUserId: string;
  eventType: CalendarEventType;
  source: 'manual' | 'device' | 'import';
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  recurrenceRule: string | null;
  companyId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  visitId: string | null;
  deletedAt: string | null;
  owner: { id: string; fullName: string; email: string };
  company: { id: string; legalTitle: string; shortName: string | null } | null;
}

export interface CalendarEventInput {
  eventType: CalendarEventType;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  companyId?: string | null;
}

export const calendarService = {
  events: (params: { from: string; to: string; ownerUserId?: string; includeArchived?: boolean }) =>
    api.get<CalendarEventDTO[]>(`/calendar/events${qs(params)}`),
  create: (body: CalendarEventInput) => api.post<CalendarEventDTO>('/calendar/events', body),
  update: (id: string, body: Partial<CalendarEventInput>) => api.patch<CalendarEventDTO>(`/calendar/events/${id}`, body),
  remove: (id: string) => api.delete<{ deleted: boolean; restoreUntil: string }>(`/calendar/events/${id}`),
  restore: (id: string) => api.post<CalendarEventDTO>(`/calendar/events/${id}/restore`, {}),
  owners: () => api.get<Array<{ id: string; fullName: string; email: string }>>('/calendar/owners'),
  syncSettings: () => api.get<MobileCalendarSettings | null>('/calendar/sync-settings'),
  saveSyncSettings: (body: MobileCalendarSettingsInput) => api.put<MobileCalendarSettings>('/calendar/sync-settings', body),
  /** Telefon ↔ CRM iki yönlü takvim senkronu (native cihaz olayları). */
  sync: (input: { deviceId: string; platform: 'android' | 'ios'; observedAt: string; events: unknown[] }) =>
    api.post<{ upserts: unknown[]; deletions: unknown[]; syncedAt: string; window: { from: string; to: string } }>(
      '/mobile/calendar/sync',
      input
    ),
};

export interface MobileCalendarSettings {
  primaryDeviceId: string;
  platform: 'android' | 'ios';
  autoSync: boolean;
  selectedCalendars: Array<{ id: string; title: string; color?: string | null; writable: boolean }>;
  destinationCalendarId: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export interface MobileCalendarSettingsInput {
  deviceId: string;
  platform: 'android' | 'ios';
  autoSync: boolean;
  selectedCalendars: MobileCalendarSettings['selectedCalendars'];
  destinationCalendarId?: string | null;
}

// ───── Products / Brands ─────
export const productService = {
  listBrands: () => api.get<any[]>('/brands'),
  createBrand: (body: BrandCreateInput) => api.post<any>('/brands', body),
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/products${qs(params)}`),
  get: (id: string) => api.get<any>(`/products/${id}`),
  create: (body: ProductCreateInput) => api.post<any>('/products', body),
  update: (id: string, body: ProductUpdateInput) => api.patch<any>(`/products/${id}`, body),
  remove: (id: string) => api.delete(`/products/${id}`),
  specs: (id: string) => api.get<any[]>(`/products/${id}/specs`),
  options: (id: string) => api.get<any[]>(`/products/${id}/options`),
  addSpec: (id: string, body: ProductSpecCreateInput) => api.post<any>(`/products/${id}/specs`, body),
  equipment: (id: string) => api.get<any[]>(`/products/${id}/equipment`),
  media: (id: string) =>
    api.get<Array<{ fileId: string; mediaType: 'image' | 'document'; title: string | null; mimeType: string; sizeBytes: number; url: string }>>(
      `/products/${id}/media`
    ),
  addEquipment: (id: string, body: ProductEquipmentCreateInput) => api.post<any>(`/products/${id}/equipment`, body),
  replaceDetails: (id: string, body: ProductDetailsReplaceInput) => api.put<any>(`/products/${id}/details`, body),
  listPriceLists: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/price-lists${qs(params)}`),
  createPriceList: (body: PriceListCreateInput) => api.post<any>('/price-lists', body),
  updatePriceList: (id: string, body: PriceListUpdateInput) => api.patch<any>(`/price-lists/${id}`, body),
  listPriceListItems: (id: string) => api.get<any[]>(`/price-lists/${id}/items`),
  createPriceListItem: (id: string, body: PriceListItemCreateInput) => api.post<any>(`/price-lists/${id}/items`, body),
  updatePriceListItem: (id: string, itemId: string, body: PriceListItemUpdateInput) =>
    api.patch<any>(`/price-lists/${id}/items/${itemId}`, body),
};

// ───── Competitors ─────
export const competitorService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/competitors${qs(params)}`),
  create: (body: CompetitorCreateInput) => api.post<any>('/competitors', body),
  update: (id: string, body: CompetitorUpdateInput) => api.patch<any>(`/competitors/${id}`, body),
  products: (id: string) => api.get<any[]>(`/competitors/${id}/products`),
  createProduct: (id: string, body: CompetitorProductCreateInput) => api.post<any>(`/competitors/${id}/products`, body),
};

// ───── Inventory ─────
export const inventoryService = {
  listWarehouses: () => api.get<any[]>('/warehouses'),
  createWarehouse: (body: WarehouseCreateInput) => api.post<any>('/warehouses', body),
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/inventory${qs(params)}`),
  get: (id: string) => api.get<any>(`/inventory/${id}`),
  create: (body: InventoryItemCreateInput) => api.post<any>('/inventory', body),
  update: (id: string, body: InventoryItemUpdateInput) => api.patch<any>(`/inventory/${id}`, body),
  bySerial: (s: string) => api.get<any>(`/inventory/serial/${encodeURIComponent(s)}`),
  reserve: (id: string, body: InventoryReserveInput) => api.patch<any>(`/inventory/${id}/reserve`, body),
  sell: (id: string, body: InventorySellInput) => api.patch<any>(`/inventory/${id}/sell`, body),
  customerDevices: (params?: Record<string, string | number | undefined>) =>
    api.get<Paginated<any>>(`/customer-devices${qs(params)}`),
  createCustomerDevice: (body: CustomerDeviceCreateInput) => api.post<any>('/customer-devices', body),
  consumeServiceParts: (body: {
    serviceTicketId: string;
    companyId?: string;
    usedAt?: string;
    lines: Array<{ productModelId: string; quantity: number; notes?: string }>;
  }) => api.post<any>('/inventory/consume-service-parts', body),
};

// ───── Quotes ─────
export const quoteService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/quotes${qs(params)}`),
  get: (id: string) => api.get<any>(`/quotes/${id}`),
  create: (body: QuoteCreateInput) => api.post<any>('/quotes', body),
  update: (id: string, body: QuoteUpdateInput) => api.patch<any>(`/quotes/${id}`, body),
  remove: (id: string) => api.delete(`/quotes/${id}`),
  addItem: (id: string, body: QuoteItemCreateInput) => api.post<any>(`/quotes/${id}/items`, body),
  updateItem: (id: string, itemId: string, body: QuoteItemUpdateInput) => api.patch<any>(`/quotes/${id}/items/${itemId}`, body),
  deleteItem: (id: string, itemId: string) => api.delete(`/quotes/${id}/items/${itemId}`),
  terms: (id: string, body: QuoteTermsUpsertInput) => api.put<any>(`/quotes/${id}/terms`, body),
  approve: (id: string) => api.post(`/quotes/${id}/approve`),
  reject: (id: string) => api.post(`/quotes/${id}/reject`),
  send: (id: string) => api.post(`/quotes/${id}/send`),
  /** Teklif PDF endpoint URL'i — RN tarafında Phase 2'de Share/Linking ile açılır. */
  pdfUrl: (id: string) => `/quotes/${id}/generate-pdf`,
};

// ───── Note templates (reusable quote notes) ─────
export const noteTemplateService = {
  list: (scope = 'quote') => api.get<any[]>(`/note-templates${qs({ scope })}`),
  create: (body: NoteTemplateCreateInput) => api.post<any>('/note-templates', body),
  remove: (id: string) => api.delete(`/note-templates/${id}`),
};

// ───── Sales / Purchase Orders ─────
export const salesOrderService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/sales-orders${qs(params)}`),
  get: (id: string) => api.get<any>(`/sales-orders/${id}`),
  create: (body: SalesOrderCreateInput) => api.post<any>('/sales-orders', body),
  createFromQuote: (quoteId: string, body: SalesOrderFromQuoteInput) => api.post<any>(`/sales-orders/from-quote/${quoteId}`, body),
  update: (id: string, body: SalesOrderUpdateInput) => api.patch<any>(`/sales-orders/${id}`, body),
  remove: (id: string) => api.delete(`/sales-orders/${id}`),
  addItem: (id: string, body: SalesOrderItemCreateInput) => api.post<any>(`/sales-orders/${id}/items`, body),
  approve: (id: string) => api.post(`/sales-orders/${id}/approve`),
  reserve: (id: string) => api.post(`/sales-orders/${id}/reserve`),
  setStatus: (id: string, body: OrderStatusUpdateInput) => api.patch(`/sales-orders/${id}/status`, body),
};

export const purchaseOrderService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/purchase-orders${qs(params)}`),
  get: (id: string) => api.get<any>(`/purchase-orders/${id}`),
  create: (body: PurchaseOrderCreateInput) => api.post<any>('/purchase-orders', body),
  update: (id: string, body: PurchaseOrderUpdateInput) => api.patch<any>(`/purchase-orders/${id}`, body),
  remove: (id: string) => api.delete(`/purchase-orders/${id}`),
  addItem: (id: string, body: PurchaseOrderItemCreateInput) => api.post<any>(`/purchase-orders/${id}/items`, body),
  send: (id: string) => api.post(`/purchase-orders/${id}/send`),
  approve: (id: string) => api.post(`/purchase-orders/${id}/approve`),
  setStatus: (id: string, body: OrderStatusUpdateInput) => api.patch(`/purchase-orders/${id}/status`, body),
};

export const authService = {
  forgotPassword: (email: string) => api.post<{ ok: boolean; token?: string }>('/auth/forgot-password', { email }),
};

// ───── Commercial documents ─────
export const documentService = {
  proformas: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/proformas${qs(params)}`),
  createProforma: (body: ProformaCreateInput) => api.post<any>('/proformas', body),
  updateProforma: (id: string, body: ProformaUpdateInput) => api.patch<any>(`/proformas/${id}`, body),
  contracts: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/contracts${qs(params)}`),
  createContract: (body: ContractCreateInput) => api.post<any>('/contracts', body),
  updateContract: (id: string, body: ContractUpdateInput) => api.patch<any>(`/contracts/${id}`, body),
  commercialInvoices: (params?: Record<string, string | number | undefined>) =>
    api.get<Paginated<any>>(`/commercial-invoices${qs(params)}`),
  createCommercialInvoice: (body: CommercialInvoiceCreateInput) => api.post<any>('/commercial-invoices', body),
  updateCommercialInvoice: (id: string, body: CommercialInvoiceUpdateInput) => api.patch<any>(`/commercial-invoices/${id}`, body),
};

// ───── Finance ─────
export const financeService = {
  receivables: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/receivables${qs(params)}`),
  createReceivable: (body: ReceivableCreateInput) => api.post<any>('/receivables', body),
  payments: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/payments${qs(params)}`),
  createPayment: (body: PaymentCreateInput) => api.post<any>('/payments', body),
  updatePaymentStatus: (id: string, status: string) => api.patch<any>(`/payments/${id}/status`, { status }),
  updateReceivableStatus: (id: string, status: string) => api.patch<any>(`/receivables/${id}/status`, { status }),
  companySummary: (companyId: string) => api.get<any>(`/companies/${companyId}/finance-summary`),
  companyStatement: (companyId: string, params?: Record<string, string>) =>
    api.get<any[]>(`/companies/${companyId}/statement${qs(params)}`),
  customerBalances: () => api.get<any[]>('/reports/customer-balances'),
  dueDates: (params?: Record<string, string>) => api.get<any[]>(`/reports/due-dates${qs(params)}`),
  accountingInvoices: (params?: Record<string, string | number | undefined>) =>
    api.get<any>(`/accounting-invoices${qs(params)}`),
  accountingInvoice: (id: string) => api.get<any>(`/accounting-invoices/${id}`),
  createAccountingInvoice: (body: AccountingInvoiceCreateInput) => api.post<any>('/accounting-invoices', body),
};

// ───── Service / Installation / Shipment ─────
export const serviceService = {
  tickets: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/service-tickets${qs(params)}`),
  createTicket: (body: any) => api.post<any>('/service-tickets', body),
  update: (id: string, body: any) => api.patch<any>(`/service-tickets/${id}`, body),
  updateTicketStatus: (id: string, statusCode: string) => api.patch<any>(`/service-tickets/${id}/status`, { statusCode }),
  complaints: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/service-complaints${qs(params)}`),
  createComplaint: (body: ServiceComplaintCreateInput) => api.post<any>('/service-complaints', body),
  updateComplaint: (id: string, body: ServiceComplaintUpdateInput) => api.patch<any>(`/service-complaints/${id}`, body),
  convertComplaint: (id: string, body: ServiceComplaintConvertInput = {}) => api.post<any>(`/service-complaints/${id}/convert`, body),
  rejectComplaint: (id: string, body: ServiceComplaintRejectInput = {}) => api.post<any>(`/service-complaints/${id}/reject`, body),
  complaintLinks: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/service-complaint-links${qs(params)}`),
  createComplaintLink: (body: ServiceComplaintLinkCreateInput) => api.post<any>('/service-complaint-links', body),
  revokeComplaintLink: (id: string) => api.patch<any>(`/service-complaint-links/${id}/revoke`, {}),
  warranty: (id: string) => api.get<any | null>(`/service-tickets/${id}/warranty`),
  updateWarranty: (id: string, body: any) => api.put<any>(`/service-tickets/${id}/warranty`, body),
  updateWarrantyParts: (id: string, parts: any[]) => api.put<any>(`/service-tickets/${id}/warranty/parts`, { parts }),
  submitWarranty: (id: string, note?: string) => api.post<any>(`/service-tickets/${id}/warranty/submit`, { note }),
  approveWarranty: (id: string, decisionNote?: string) => api.post<any>(`/service-tickets/${id}/warranty/approve`, { decisionNote }),
  rejectWarranty: (id: string, decisionNote?: string) => api.post<any>(`/service-tickets/${id}/warranty/reject`, { decisionNote }),
  installations: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/installations${qs(params)}`),
  createInstallation: (body: any) => api.post<any>('/installations', body),
  updateInstallationStatus: (id: string, body: { statusCode: string; installationDate?: string }) =>
    api.patch<any>(`/installations/${id}/status`, body),
  shipments: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/shipments${qs(params)}`),
  shipment: (id: string) => api.get<any>(`/shipments/${id}`),
  createShipment: (body: ShipmentCreateInput) => api.post<any>('/shipments', body),
  updateShipmentStatus: (id: string, statusCode: string) => api.patch<any>(`/shipments/${id}/status`, { statusCode }),
  deliveries: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/deliveries${qs(params)}`),
  createDelivery: (body: DeliveryCreateInput) => api.post<any>('/deliveries', body),
  updateDelivery: (id: string, body: DeliveryUpdateInput) => api.patch<any>(`/deliveries/${id}`, body),
  updateDeliveryStatus: (id: string, status: 'pending' | 'completed') => api.patch<any>(`/deliveries/${id}/status`, { status }),
};

// ───── Public complaint intake ─────
export const publicComplaintService = {
  form: (slug: string, token: string) =>
    api.get<any>(`/public/service-complaints/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`),
  submit: (slug: string, token: string, body: PublicServiceComplaintInput) =>
    api.post<any>(`/public/service-complaints/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, body),
};

// ───── Files ─────
export const fileService = {
  signedUpload: (body: SignedUploadUrlInput) =>
    api.post<{ fileId: string; bucket: string; objectKey: string; uploadUrl: string; expiresInSeconds: number }>(
      '/files/signed-upload-url',
      body
    ),
  signedDownload: (fileId: string) =>
    api.post<{ downloadUrl: string; filename: string; mimeType: string }>('/files/signed-download-url', { fileId }),
  link: (body: FileLinkInput) => api.post('/files/link', body),
  links: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/files/links${qs(params)}`),
  remove: (id: string) => api.delete(`/files/${id}`),
};

// ───── Reports ─────
export const reportService = {
  weeklyVisits: (params?: Record<string, string>) => api.get<any[]>(`/reports/weekly-visits${qs(params)}`),
  monthlyVisits: (params?: Record<string, string>) => api.get<any[]>(`/reports/monthly-visits${qs(params)}`),
  yearlyVisits: (params?: Record<string, string>) => api.get<any[]>(`/reports/yearly-visits${qs(params)}`),
  weeklyQuotes: (params?: Record<string, string>) => api.get<any[]>(`/reports/weekly-quotes-by-product${qs(params)}`),
  monthlyQuotes: (params?: Record<string, string>) => api.get<any[]>(`/reports/monthly-quotes-by-product${qs(params)}`),
  stockSummary: () => api.get<any[]>('/reports/stock-summary'),
  pipelineSummary: () => api.get<any[]>('/reports/pipeline-summary'),
  departmentPerformance: (params: Record<string, string>) => api.get<any>(`/reports/department-performance${qs(params)}`),
  expectedReceivables: () => api.get<any[]>('/reports/expected-receivables'),
  completedPayments: (params?: Record<string, string>) => api.get<any[]>(`/reports/completed-payments${qs(params)}`),
  warrantyExpiring: (params?: Record<string, string | number>) =>
    api.get<any[]>(`/reports/warranty-expiring${qs(params as Record<string, string | number | undefined>)}`),
  serviceComplaintsSummary: () => api.get<any>('/reports/service-complaints-summary'),
  yearEnd: (year: number) => api.get<any>(`/reports/year-end?year=${year}`),
};

// ───── Admin (users, roles, departments) ─────
export const adminService = {
  users: () => api.get<any[]>('/users'),
  createUser: (body: UserCreateInput) => api.post<any>('/users', body),
  updateUser: (id: string, body: UserUpdateInput) => api.patch<any>(`/users/${id}`, body),
  userTargets: (params?: Record<string, string | number | undefined>) => api.get<any[]>(`/user-targets${qs(params)}`),
  myTargets: (params?: Record<string, string | number | undefined>) => api.get<any[]>(`/me/targets${qs(params)}`),
  saveUserTarget: (userId: string, body: TargetUpsertInput) => api.post<any>(`/users/${userId}/targets`, body),
  departmentTargets: (params?: Record<string, string | number | undefined>) => api.get<any[]>(`/department-targets${qs(params)}`),
  saveDepartmentTarget: (departmentId: string, body: TargetUpsertInput) => api.post<any>(`/departments/${departmentId}/targets`, body),
  updateDept: (id: string, body: DepartmentUpdateInput) => api.patch<any>(`/departments/${id}`, body),
  roles: () => api.get<any[]>('/roles'),
  createRole: (body: RoleCreateInput) => api.post<any>('/roles', body),
  updateRole: (id: string, body: RoleUpdateInput) => api.patch<any>(`/roles/${id}`, body),
  permissions: () => api.get<any[]>('/permissions'),
  departments: () => api.get<any[]>('/departments'),
  createDept: (body: DepartmentCreateInput) => api.post<any>('/departments', body),
  auditLogs: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/audit-logs${qs(params)}`),
  tenant: () => api.get<any>('/tenant'),
  updateTenant: (body: TenantUpdateInput) => api.patch<any>('/tenant', body),
};

// ───── Lookups ─────
export const lookupService = {
  byName: (name: string) => api.get<any[]>(`/lookups/${name}`),
};

// ───── Chat (kurum içi sohbet) ─────
export interface ChatDirectoryUser {
  id: string;
  fullName: string;
  email: string;
  departmentId: string | null;
  status: string;
}
export interface ChatAttachment {
  fileId: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
}
export interface ChatReaction {
  emoji: string;
  count: number;
  mine: boolean;
}
export interface ChatReplyPreview {
  id: string;
  senderName: string;
  preview: string;
}
export interface ChatRefCard {
  type: 'quote' | 'company' | 'service_ticket' | 'opportunity';
  id: string;
  title: string;
  subtitle: string | null;
  missing?: boolean;
}
export interface ChatMessageDTO {
  id: string;
  body: string | null;
  senderId: string;
  senderName: string;
  createdAt: string;
  editedAt: string | null;
  kind: 'text' | 'system' | 'voice' | string;
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
  replyTo: ChatReplyPreview | null;
  refCard: ChatRefCard | null;
}
export interface ChatMemberDTO {
  userId: string;
  role: ChatMemberRole;
  fullName: string;
  email: string;
  lastReadAt?: string | null;
}
export interface ChatConversationSummary {
  id: string;
  type: 'dm' | 'group';
  title: string | null;
  avatarFileId: string | null;
  onlyAdminsCanPost: boolean;
  myRole: ChatMemberRole;
  members: ChatMemberDTO[];
  unreadCount: number;
  lastMessage: { preview: string; senderId: string; createdAt: string } | null;
  lastActivityAt: string;
}
export interface ChatConversationDetail {
  id: string;
  type: 'dm' | 'group';
  title: string | null;
  description: string | null;
  avatarFileId: string | null;
  onlyAdminsCanPost: boolean;
  refType: string | null;
  refId: string | null;
  createdBy: string | null;
  members: ChatMemberDTO[];
  myRole: ChatMemberRole;
}

export const chatService = {
  directory: () => api.get<ChatDirectoryUser[]>('/chat/directory'),
  conversations: () => api.get<ChatConversationSummary[]>('/chat/conversations'),
  createDm: (userId: string) => api.post<ChatConversationDetail>('/chat/conversations/dm', { userId }),
  createGroup: (body: CreateGroupInput) => api.post<ChatConversationDetail>('/chat/conversations/group', body),
  conversation: (id: string) => api.get<ChatConversationDetail>(`/chat/conversations/${id}`),
  updateGroup: (id: string, body: UpdateGroupInput) => api.patch<ChatConversationDetail>(`/chat/conversations/${id}`, body),
  addMembers: (id: string, userIds: string[]) => api.post<ChatConversationDetail>(`/chat/conversations/${id}/members`, { userIds }),
  removeMember: (id: string, userId: string) => api.delete(`/chat/conversations/${id}/members/${userId}`),
  setMemberRole: (id: string, userId: string, role: ChatMemberRole) =>
    api.patch(`/chat/conversations/${id}/members/${userId}/role`, { role }),
  messages: (id: string, params?: { before?: string; limit?: number }) =>
    api.get<{ messages: ChatMessageDTO[]; hasMore: boolean }>(`/chat/conversations/${id}/messages${qs(params)}`),
  sendMessage: (id: string, body: SendMessageInput) => api.post<ChatMessageDTO>(`/chat/conversations/${id}/messages`, body),
  markRead: (id: string) => api.post(`/chat/conversations/${id}/read`),
  editMessage: (messageId: string, body: string) => api.patch<ChatMessageDTO>(`/chat/messages/${messageId}`, { body }),
  toggleReaction: (messageId: string, emoji: string) =>
    api.post<{ messageId: string; reactions: ChatReaction[] }>(`/chat/messages/${messageId}/reactions`, { emoji }),
  deleteMessage: (id: string) => api.delete(`/chat/messages/${id}`),
};

// keep getAccessToken referenced for downstream PDF/file helpers
export { getAccessToken };

// ───── helpers ─────
function qs(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}
