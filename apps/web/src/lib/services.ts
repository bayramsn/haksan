/**
 * Thin domain service wrappers around the API client. These are the only
 * place in the frontend that talks to backend endpoints.
 */
import type {
  ActivityCreateInput,
  ActivityUpdateInput,
  AccountingInvoiceCreateInput,
  AccountingInvoiceUpdateInput,
  BrandCreateInput,
  CallCreateInput,
  ChatMemberRole,
  CreateGroupInput,
  SendMessageInput,
  UpdateGroupInput,
  CommercialInvoiceCreateInput,
  CommercialInvoiceUpdateInput,
  CompanyCreateInput,
  CompanyContactImportCommitInput,
  CompanyContactImportPreview,
  CompanyContactImportPreviewInput,
  CompanyContactImportCommitResult,
  CompanyOsmSearchResult,
  NearbyStaleVisitCompany,
  CompanyWebsiteLookupInput,
  CompanyWebsiteLookupResult,
  CompanyUpdateInput,
  CompetitorCreateInput,
  CompetitorProductCreateInput,
  CompetitorUpdateInput,
  ContactCreateInput,
  ContactUpdateInput,
  ContractCreateInput,
  ContractUpdateInput,
  CustomerDeviceCreateInput,
  CustomerDeviceUpdateInput,
  DeliveryCreateInput,
  DeliveryUpdateInput,
  DepartmentCreateInput,
  DepartmentUpdateInput,
  FileLinkInput,
  InventoryItemCreateInput,
  InventoryItemUpdateInput,
  InventoryReserveInput,
  InventorySellInput,
  MachineTemplateCreateInput,
  NoteTemplateCreateInput,
  NoteTemplateUpdateInput,
  OpportunityCreateInput,
  OpportunityApprovalDecisionInput,
  OpportunityApprovalType,
  OpportunityCompanyLinkInput,
  OpportunityConvertInput,
  LeadAssignmentRuleCreateInput,
  LeadAssignmentRuleUpdateInput,
  LeadContactEventInput,
  OpportunityQualificationChangeInput,
  OpportunityProcessCheckUpsertInput,
  OpportunityStageChangeInput,
  OpportunityUpdateInput,
  TrelloImportCommitRequest,
  TrelloImportPreviewRequest,
  TrelloImportRowInput,
  TrelloCompanyCandidate,
  OrderStatusUpdateInput,
  PaymentCreateInput,
  PaymentUpdateInput,
  PriceListCreateInput,
  PriceListItemCreateInput,
  PriceListItemUpdateInput,
  PriceListUpdateInput,
  ProductCreateInput,
  ProductDetailsReplaceInput,
  ProductEquipmentCreateInput,
  ProductSpecCreateInput,
  ProductSpecTemplateCreateInput,
  ProductSpecTemplateUpdateInput,
  ProductSpecTemplateBulkCreateInput,
  ProductSpecTemplateBatchInput,
  TechnicalImportCommitRequest,
  TechnicalImportPreviewRequest,
  TechnicalImportRowInput,
  ProductUpdateInput,
  ProformaCreateInput,
  ProformaUpdateInput,
  StandaloneContractCreateInput,
  StandaloneContractUpdateInput,
  StandaloneProformaCreateInput,
  StandaloneProformaUpdateInput,
  StandaloneQuoteCreateInput,
  PublicServiceComplaintInput,
  PurchaseOrderCreateInput,
  PurchaseOrderItemCreateInput,
  PurchaseOrderUpdateInput,
  QuoteCreateInput,
  QuoteItemCreateInput,
  QuoteItemUpdateInput,
  QuoteStatusChangeInput,
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
  ShipmentStartInput,
  ShipmentStatusUpdateInput,
  SignatureCreateInput,
  SignatureUpdateInput,
  SignatureView,
  SignedUploadUrlInput,
  TargetUpsertInput,
  TenantUpdateInput,
  UserCreateInput,
  UserUpdateInput,
  VisitCreateInput,
  WarehouseCreateInput,
  MailRecipients,
  MailSendInput,
  MailSendResult,
  UserMailAccountStatus,
  UserMailAccountUpsertInput,
} from '@haksan/shared';
import { API_BASE_URL, ApiError, api, getAccessToken, getActiveDepartment, getActiveDivision } from './apiClient';
import { exportService } from './downloadExport';

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export type TrelloImportStatus = 'create' | 'skip' | 'error';

export interface TrelloImportPreviewRow extends TrelloImportRowInput {
  candidate: TrelloCompanyCandidate;
  matches: Array<{
    id: string;
    legalTitle: string;
    shortName?: string | null;
    taxNumber?: string | null;
    website?: string | null;
    primaryPhone?: string | null;
    secondaryPhone?: string | null;
    primaryEmail?: string | null;
    secondaryEmail?: string | null;
    province?: string | null;
    district?: string | null;
    score: number;
    confidence: 'strong' | 'possible';
    reasons: string[];
    contactMatch?: { id: string; fullName: string; reason: string };
  }>;
  status: TrelloImportStatus;
  errors: string[];
  warnings: string[];
}

export interface TrelloImportPreview {
  fileName: string;
  headerRowNumber: number;
  rows: TrelloImportPreviewRow[];
  summary: { total: number; create: number; skip: number; error: number };
  capabilities: {
    canCreateCompany: boolean;
    canUpdateCompany: boolean;
    canCreateContact: boolean;
  };
}

export interface TrelloImportCommitResult {
  rows: Array<{
    rowNumber: number;
    trelloCardId?: string;
    title: string;
    status: TrelloImportStatus;
    opportunityId?: string;
    errors: string[];
  }>;
  summary: { total: number; create: number; skip: number; error: number };
}

type SignedUploadResponse = { fileId: string; bucket: string; objectKey: string; uploadUrl: string; expiresInSeconds: number };
type PriceListItemCreateRequest = Omit<PriceListItemCreateInput, 'campaignIsActive'> & {
  campaignIsActive?: boolean;
};

export type ProductImportStatus = 'create' | 'update' | 'error' | 'skip';

export interface ProductImportRow {
  rowNumber: number;
  brandName: string;
  series?: string;
  modelCode: string;
  modelName?: string;
  fullName: string;
  productGroupCode?: string;
  categoryCode?: string;
  subcategoryCode?: string;
  productTypeCode?: string;
  currencyCode: string;
  listPrice?: number;
  cashPrice?: number;
  vatRate: number;
  originCountry?: string;
  hsCode?: string;
  stockCode?: string;
  description?: string;
  specs: Array<{ specGroupCode?: string; specKey: string; specValue: string; specUnit?: string; sortOrder: number }>;
  equipment: Array<{ equipmentTypeCode: string; title: string; description?: string; isPromotion: boolean; sortOrder: number }>;
  status: ProductImportStatus;
  errors: string[];
  warnings: string[];
}

export interface ProductImportSummary {
  total: number;
  create: number;
  update: number;
  skip: number;
  error: number;
}

export interface ProductImportPreview {
  fileName: string;
  sheetName: string;
  headerRowNumber: number;
  totalRows: number;
  rows: ProductImportRow[];
  summary: ProductImportSummary;
}

export interface TechnicalImportPreview {
  file: { name: string; sheetNames: string[]; rowCount: number };
  rows: TechnicalImportRowInput[];
  summary: {
    total: number;
    exact: number;
    normalized: number;
    review: number;
    unmatched: number;
    ready: number;
  };
  suggestedProducts: Array<{
    id: string;
    modelCode: string;
    fullName: string;
    brandName?: string | null;
    productTypeCode?: string | null;
    label: string;
    score: number;
  }>;
}

// ───── Companies ─────
export interface AuditUserDTO {
  id: string;
  fullName?: string | null;
  email?: string | null;
}

export interface CompanyLookupDTO {
  id?: string;
  code: string;
  name: string;
}

export interface CompanyAddressDTO {
  id?: string;
  addressType?: string | null;
  country?: string | null;
  province?: string | null;
  district?: string | null;
  fullAddress?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  locationSource?: string | null;
  isDefault?: boolean | null;
  isShipping?: boolean | null;
  isBilling?: boolean | null;
}

export interface CompanyPhoneDTO {
  phone: string;
  phoneType?: string | null;
  isDefault?: boolean | null;
}

export interface CompanyEmailDTO {
  email: string;
  emailType?: string | null;
  isDefault?: boolean | null;
}

export interface CompanyDTO {
  id: string;
  logoFileId?: string | null;
  logoUrl?: string | null;
  externalCompanyNo?: string | null;
  legalTitle: string;
  shortName?: string | null;
  companyType?: 'person' | 'company' | string | null;
  sector?: string | null;
  supplierCategoryCode?: 'transportation' | 'logistics' | null;
  taxNumber?: string | null;
  taxOffice?: string | null;
  website?: string | null;
  notes?: string | null;
  contactSourceText?: string | null;
  relationTypeId?: string | null;
  relationType?: Omit<CompanyLookupDTO, 'id'> | null;
  customerStatusId?: string | null;
  customerStatus?: Omit<CompanyLookupDTO, 'id'> | null;
  companyGroup?: Omit<CompanyLookupDTO, 'id'> | null;
  companyGroups?: CompanyLookupDTO[] | null;
  contactSource?: Omit<CompanyLookupDTO, 'id'> | null;
  divisions?: CompanyLookupDTO[] | null;
  primaryAddress?: CompanyAddressDTO | null;
  addresses?: CompanyAddressDTO[] | null;
  primaryPhone?: string | null;
  secondaryPhone?: string | null;
  fax?: string | null;
  phones?: CompanyPhoneDTO[] | null;
  primaryEmail?: string | null;
  secondaryEmail?: string | null;
  emails?: CompanyEmailDTO[] | null;
  createdBy?: string | null;
  createdByUser?: AuditUserDTO | null;
  createdAt: string;
}

export interface CompanySummaryDTO {
  total: number;
  byRelation: Record<string, number>;
  byStatus: Record<string, number>;
  cities: string[];
  sectors: string[];
}

type QueryRequestOptions = { signal?: AbortSignal };

export const companyService = {
  list: (params?: Record<string, string | number | undefined>, opts?: QueryRequestOptions) =>
    api.get<Paginated<CompanyDTO>>(`/companies${qs(params)}`, opts),
  summary: (params?: Record<string, string | number | undefined>, opts?: QueryRequestOptions) =>
    api.get<CompanySummaryDTO>(`/companies/summary${qs(params)}`, opts),
  get: (id: string, opts?: QueryRequestOptions) => api.get<CompanyDTO>(`/companies/${id}`, opts),
  create: (body: CompanyCreateInput) => api.post<CompanyDTO>('/companies', body),
  update: (id: string, body: CompanyUpdateInput) => api.patch<CompanyDTO>(`/companies/${id}`, body),
  previewCompanyContactImport: (body: CompanyContactImportPreviewInput) =>
    api.post<CompanyContactImportPreview>('/companies/imports/company-contacts/preview', body),
  commitCompanyContactImport: (body: CompanyContactImportCommitInput) =>
    api.post<CompanyContactImportCommitResult>('/companies/imports/company-contacts/commit', body),
  osmSearch: (params: { q: string; address?: string; city?: string; district?: string; country?: string }) =>
    api.get<CompanyOsmSearchResult[]>(`/companies/osm-search${qs(params)}`),
  websiteLookup: (body: CompanyWebsiteLookupInput) =>
    api.post<CompanyWebsiteLookupResult>('/companies/website-lookup', body),
  /** Doğruluk kaynağıyla birlikte firma konumunu kalıcı kaydeder; null'lar konumu temizler. */
  setLocation: (id: string, body: {
    latitude: number | null;
    longitude: number | null;
    source?: 'manual' | 'verified' | 'osm_exact' | 'osm_street' | 'osm_area';
  }) =>
    api.patch<CompanyDTO>(`/companies/${id}/location`, body),
  /**
   * Konuma yakın olup uzun süredir uğranmamış firmalar. Sunucu aynı firma için
   * günde bir kez bildirim + push üretir; `notify: false` yalnız listeler.
   */
  nearbyStaleVisits: (body: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    staleDays?: number;
    notify?: boolean;
  }) =>
    api.post<{ staleDays: number; radiusKm: number; companies: NearbyStaleVisitCompany[] }>(
      '/companies/nearby-stale-visits',
      body
    ),
  remove: (id: string) => api.delete(`/companies/${id}`),
  /** Başka bölümlerdeki açık alacak (borç) uyarısı. Tutar yalnızca süper yönetici/view_all için döner. */
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

/** Mükerrer firma erişim talepleri (onay inbox). */
export const accessRequestService = {
  list: (params?: { status?: string; page?: number; pageSize?: number }) =>
    api.get<Paginated<AccessRequestRow>>(`/access-requests${qs(params as Record<string, string | number | undefined>)}`),
  approve: (id: string, decisionNote?: string) => api.post(`/access-requests/${id}/approve`, { decisionNote }),
  reject: (id: string, decisionNote?: string) => api.post(`/access-requests/${id}/reject`, { decisionNote }),
};

export type NotificationTarget =
  | { kind: 'company'; companyId: string }
  | { kind: 'opportunity'; opportunityId: string; activityId?: string }
  | { kind: 'navigate'; nav: string; query?: string };

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actionType?: 'visit_intent' | string | null;
  actionStatus?: 'pending' | 'accepted' | 'declined' | null;
  responseReason?: string | null;
  respondedAt?: string | null;
  /** Tıklanınca açılacak kayıt/ekran — API tarafında çözülür. */
  target?: NotificationTarget | null;
  readAt?: string | null;
  createdAt: string;
}

export const notificationService = {
  list: (params?: { unread?: boolean; pageSize?: number }) =>
    api.get<Paginated<NotificationDTO>>(`/notifications${qs({
      unread: params?.unread === undefined ? undefined : String(params.unread),
      pageSize: params?.pageSize,
    })}`),
  markRead: (id: string) => api.patch<NotificationDTO>(`/notifications/${id}/read`, {}),
  respond: (id: string, body: { decision: 'yes' | 'no'; reason?: string }) =>
    api.post<NotificationDTO>(`/notifications/${id}/respond`, body),
};

export const mailService = {
  account: () => api.get<UserMailAccountStatus>('/mail/account'),
  connect: (body: UserMailAccountUpsertInput) => api.put<UserMailAccountStatus>('/mail/account', body),
  disconnect: () => api.delete<{ ok: true }>('/mail/account'),
  send: (body: MailSendInput) => api.post<MailSendResult>('/mail/send', body),
  /** Alıcı seçicisi: firmanın kontakları + kendi kullanıcılarımız. */
  recipients: (companyId?: string) =>
    api.get<MailRecipients>(`/mail/recipients${qs(companyId ? { companyId } : undefined)}`),
};

// ───── Contacts ─────
export interface ContactSummaryDTO {
  total: number;
  primary: number;
  blacklisted: number;
  firmCount: number;
  departments: string[];
}

export const contactService = {
  list: (params?: Record<string, string | number | undefined>, opts?: QueryRequestOptions) =>
    api.get<Paginated<any>>(`/contacts${qs(params)}`, opts),
  summary: (params?: Record<string, string | number | undefined>, opts?: QueryRequestOptions) =>
    api.get<ContactSummaryDTO>(`/contacts/summary${qs(params)}`, opts),
  get: (id: string, opts?: QueryRequestOptions) => api.get<any>(`/contacts/${id}`, opts),
  /** Kontağın bağlı olduğu firmalar (çoklu firma — aynı kişi birden çok firmada). */
  companies: (id: string) =>
    api.get<{ id: string; legalTitle: string; shortName: string | null; externalCompanyNo: string | null; isPrimary: boolean }[]>(`/contacts/${id}/companies`),
  /** Kontağı bir firmadan ayırır (en az bir firma kalmalı). Güncel firma listesini döner. */
  unlinkCompany: (id: string, companyId: string) =>
    api.delete<{ id: string; legalTitle: string; shortName: string | null; externalCompanyNo: string | null; isPrimary: boolean }[]>(`/contacts/${id}/companies/${companyId}`),
  /** Bir firmayı kontağın birincil firması yapar. Güncel firma listesini döner. */
  setPrimaryCompany: (id: string, companyId: string) =>
    api.post<{ id: string; legalTitle: string; shortName: string | null; externalCompanyNo: string | null; isPrimary: boolean }[]>(`/contacts/${id}/companies/${companyId}/primary`),
  create: (body: ContactCreateInput) => api.post<any>('/contacts', body),
  update: (id: string, body: ContactUpdateInput) => api.patch<any>(`/contacts/${id}`, body),
  remove: (id: string) => api.delete(`/contacts/${id}`),
};

// ───── Opportunities ─────
export const opportunityService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/opportunities${qs(params)}`),
  get: (id: string) => api.get<any>(`/opportunities/${id}`),
  assignees: () => api.get<Array<{ id: string; name: string; divisionIds: string[] }>>('/opportunities/assignees'),
  create: (body: OpportunityCreateInput) => api.post<any>('/opportunities', body),
  createFromActivity: (activityId: string, body: OpportunityCreateInput) =>
    api.post<any>(`/opportunities/from-activity/${activityId}`, { ...body, sourceActivityId: activityId }),
  previewTrelloImport: (body: TrelloImportPreviewRequest) =>
    api.post<TrelloImportPreview>('/opportunities/imports/trello/preview', body),
  commitTrelloImport: (body: TrelloImportCommitRequest) =>
    api.post<TrelloImportCommitResult>('/opportunities/imports/trello/commit', body),
  update: (id: string, body: OpportunityUpdateInput) => api.patch<any>(`/opportunities/${id}`, body),
  linkCompany: (id: string, body: OpportunityCompanyLinkInput) =>
    api.post<any>(`/opportunities/${id}/company`, body),
  convert: (id: string, body: OpportunityConvertInput = {}) =>
    api.post<any>(`/opportunities/${id}/convert`, body),
  recordContact: (id: string, body: LeadContactEventInput) =>
    api.post<any>(`/opportunities/${id}/contact-events`, body),
  leadSummary: () => api.get<any>('/opportunities/lead-summary'),
  changeQualificationStage: (id: string, body: OpportunityQualificationChangeInput) =>
    api.patch<any>(`/opportunities/${id}/qualification-stage`, body),
  /** A+ süreç adımını elle "yapıldı / yapılmadı" işaretler; `status: null` işareti kaldırır. */
  setProcessCheck: (id: string, key: string, body: OpportunityProcessCheckUpsertInput) =>
    api.patch<any>(`/opportunities/${id}/process-checks/${encodeURIComponent(key)}`, body),
  decideApproval: (id: string, type: OpportunityApprovalType, body: OpportunityApprovalDecisionInput) =>
    api.post<any>(`/opportunities/${id}/approvals/${type}`, body),
  remove: (id: string) => api.delete(`/opportunities/${id}`),
  changeStage: (id: string, body: OpportunityStageChangeInput) => api.patch<any>(`/opportunities/${id}/stage`, body),
  // Mantıksal kapanış (Bitir/Arşiv) — silmez; closedAt set eder. Yalnız terminal (delivered/cancelled).
  close: (id: string, body?: { reason?: string }) => api.post<any>(`/opportunities/${id}/close`, body ?? {}),
  // Geri Aç — kapanışı geri alır, fırsatı aktif panoya döndürür.
  reopen: (id: string) => api.post<any>(`/opportunities/${id}/reopen`, {}),
};

export const leadAssignmentRuleService = {
  list: () => api.get<any[]>('/lead-assignment-rules'),
  create: (body: LeadAssignmentRuleCreateInput) => api.post<any>('/lead-assignment-rules', body),
  update: (id: string, body: LeadAssignmentRuleUpdateInput) =>
    api.patch<any>(`/lead-assignment-rules/${id}`, body),
  remove: (id: string) => api.delete<{ ok: true }>(`/lead-assignment-rules/${id}`),
};

// ───── Activities ─────
export const activityService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/activities${qs(params)}`),
  create: (body: ActivityCreateInput) => api.post<any>('/activities', body),
  update: (id: string, body: ActivityUpdateInput) => api.patch<any>(`/activities/${id}`, body),
  remove: (id: string) => api.delete(`/activities/${id}`),
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

export type CalendarImportEventType = 'other' | 'meeting' | 'call' | 'task';

export interface CalendarImportEvent {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  recurrenceRule: string | null;
  duplicate: boolean;
  inWindow: boolean;
}

export interface CalendarImportPreview {
  window: { from: string; to: string };
  summary: { total: number; duplicates: number; inWindow: number };
  events: CalendarImportEvent[];
}

export const calendarService = {
  events: (params: { from: string; to: string; ownerUserId?: string; includeArchived?: boolean }) =>
    api.get<CalendarEventDTO[]>(`/calendar/events${qs(params)}`),
  create: (body: CalendarEventInput) => api.post<CalendarEventDTO>('/calendar/events', body),
  update: (id: string, body: Partial<CalendarEventInput>) => api.patch<CalendarEventDTO>(`/calendar/events/${id}`, body),
  remove: (id: string) => api.delete<{ deleted: boolean; restoreUntil: string }>(`/calendar/events/${id}`),
  restore: (id: string) => api.post<CalendarEventDTO>(`/calendar/events/${id}/restore`, {}),
  owners: () => api.get<Array<{ id: string; fullName: string; email: string }>>('/calendar/owners'),
  importPreview: (body: { fileName: string; fileBase64: string }) =>
    api.post<CalendarImportPreview>('/calendar/import/preview', body),
  importCommit: (body: { defaultEventType: CalendarImportEventType; events: CalendarImportEvent[] }) =>
    api.post<{ created: number; updated: number }>('/calendar/import/commit', body),
};

// ───── Products / Brands ─────
export const productService = {
  listBrands: (divisionId?: string) => api.get<any[]>(`/brands${qs({ divisionId })}`),
  createBrand: (body: BrandCreateInput) => api.post<any>('/brands', body),
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/products${qs(params)}`),
  get: (id: string) => api.get<any>(`/products/${id}`),
  create: (body: ProductCreateInput) => api.post<any>('/products', body),
  update: (id: string, body: ProductUpdateInput) => api.patch<any>(`/products/${id}`, body),
  remove: (id: string) => api.delete(`/products/${id}`),
  previewImport: (body: { fileName: string; fileBase64: string }) =>
    api.post<ProductImportPreview>('/products/import/preview', body),
  commitImport: (body: { rows: ProductImportRow[]; mode?: 'upsert' | 'create_only'; replaceDetails?: boolean }) =>
    api.post<{ rows: ProductImportRow[]; summary: ProductImportSummary }>('/products/import/commit', body),
  specs: (id: string) => api.get<any[]>(`/products/${id}/specs`),
  specTemplates: (productTypeCode?: string) => api.get<any[]>(`/product-spec-templates${qs({ productTypeCode })}`),
  options: (id: string) => api.get<any[]>(`/products/${id}/options`),
  addSpec: (id: string, body: ProductSpecCreateInput) => api.post<any>(`/products/${id}/specs`, body),
  equipment: (id: string) => api.get<any[]>(`/products/${id}/equipment`),
  compatibleOptionalEquipment: (id: string) => api.get<any[]>(`/products/${id}/compatible-optional-equipment`),
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
  createPriceListItem: (id: string, body: PriceListItemCreateRequest) => api.post<any>(`/price-lists/${id}/items`, body),
  updatePriceListItem: (id: string, itemId: string, body: PriceListItemUpdateInput) => api.patch<any>(`/price-lists/${id}/items/${itemId}`, body),
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
  updateCustomerDevice: (id: string, body: CustomerDeviceUpdateInput) => api.patch<any>(`/customer-devices/${id}`, body),
  deleteCustomerDevice: (id: string) => api.delete<any>(`/customer-devices/${id}`),
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
  /** Fırsat açmadan ("hızlı") teklif — başlık, kalemler ve şartlar tek istekte gider. */
  createStandalone: (body: StandaloneQuoteCreateInput) => api.post<any>('/quotes/standalone', body),
  update: (id: string, body: QuoteUpdateInput) => api.patch<any>(`/quotes/${id}`, body),
  remove: (id: string) => api.delete(`/quotes/${id}`),
  addItem: (id: string, body: QuoteItemCreateInput) => api.post<any>(`/quotes/${id}/items`, body),
  updateItem: (id: string, itemId: string, body: QuoteItemUpdateInput) => api.patch<any>(`/quotes/${id}/items/${itemId}`, body),
  deleteItem: (id: string, itemId: string) => api.delete(`/quotes/${id}/items/${itemId}`),
  terms: (id: string, body: QuoteTermsUpsertInput) => api.put<any>(`/quotes/${id}/terms`, body),
  approve: (id: string) => api.post(`/quotes/${id}/approve`),
  approvePrice: (id: string, note?: string) => api.post<any>(`/quotes/${id}/price-approval/approve`, { note }),
  rejectPrice: (id: string, note?: string) => api.post<any>(`/quotes/${id}/price-approval/reject`, { note }),
  reject: (id: string) => api.post(`/quotes/${id}/reject`),
  changeStatus: (id: string, body: QuoteStatusChangeInput) => api.post<any>(`/quotes/${id}/status`, body),
  send: (id: string) => api.post(`/quotes/${id}/send`),
  /**
   * Teklif PDF'ini backend'den (PDFKit) indirir. Endpoint binary döndürdüğü için
   * api client yerine token'lı ham fetch + blob indirmesi kullanılır.
   */
  downloadPdf: async (id: string, documentNo?: string): Promise<void> => {
    const base = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:3000/api/v1';
    const token = getAccessToken();
    const res = await fetch(`${base}/quotes/${id}/generate-pdf`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`PDF indirilemedi (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teklif-${documentNo ?? id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  /**
   * Teklif PDF'ini yeni sekmede açar (tarayıcı PDF görüntüleyicisi). Blob URL
   * hemen iptal edilmez; sekme açıldıktan sonra GC ile temizlenir.
   */
  openPdf: async (id: string): Promise<void> => {
    const base = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:3000/api/v1';
    const token = getAccessToken();
    const res = await fetch(`${base}/quotes/${id}/generate-pdf`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`PDF oluşturulamadı (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const win = window.open(url, '_blank', 'noopener');
    if (!win) {
      // Pop-up engellendi → indirmeye düş
      const a = document.createElement('a');
      a.href = url;
      a.download = `teklif-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

// ───── Note templates (reusable quote notes) ─────
export const noteTemplateService = {
  list: (scope?: string) => api.get<any[]>(`/note-templates${qs(scope ? { scope } : undefined)}`),
  create: (body: NoteTemplateCreateInput) => api.post<any>('/note-templates', body),
  update: (id: string, body: NoteTemplateUpdateInput) => api.patch<any>(`/note-templates/${id}`, body),
  remove: (id: string) => api.delete(`/note-templates/${id}`),
};

// ───── References (delivered machines) ─────
export type ReferenceDTO = {
  id: string;
  firm: string;
  contact: string | null;
  district: string | null;
  city: string | null;
  brand: string | null;
  model: string | null;
  deliveryDate: string | null;
  notes: string | null;
};

export type ReferenceInput = {
  firm: string;
  contact?: string;
  district?: string;
  city?: string;
  brand?: string;
  model?: string;
  deliveryDate?: string;
  notes?: string;
};

export const referenceService = {
  list: () => api.get<ReferenceDTO[]>('/references'),
  create: (body: ReferenceInput) => api.post<ReferenceDTO>('/references', body),
  update: (id: string, body: ReferenceInput) => api.patch<ReferenceDTO>(`/references/${id}`, body),
  remove: (id: string) => api.delete(`/references/${id}`),
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
  forgotPassword: (email: string) =>
    api.post<{ ok: boolean; devToken?: string }>('/auth/forgot-password', {
      email,
    }),
  resetPassword: (token: string, newPassword: string) => api.post<{ ok: boolean }>('/auth/reset-password', { token, newPassword }),
};

// ───── Commercial documents ─────
export const documentService = {
  proformas: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/proformas${qs(params)}`),
  createProforma: (body: ProformaCreateInput) => api.post<any>('/proformas', body),
  updateProforma: (id: string, body: ProformaUpdateInput) => api.patch<any>(`/proformas/${id}`, body),
  /** Tekliften bağımsız ("hızlı") proforma — kalemler doğrudan belgeye yazılır. */
  createStandaloneProforma: (body: StandaloneProformaCreateInput) => api.post<any>('/proformas/standalone', body),
  updateStandaloneProforma: (id: string, body: StandaloneProformaUpdateInput) =>
    api.patch<any>(`/proformas/standalone/${id}`, body),
  deleteProforma: (id: string) => api.delete<any>(`/proformas/${id}`),
  contracts: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/contracts${qs(params)}`),
  createContract: (body: ContractCreateInput) => api.post<any>('/contracts', body),
  updateContract: (id: string, body: ContractUpdateInput) => api.patch<any>(`/contracts/${id}`, body),
  /** Tekliften bağımsız ("hızlı") sözleşme — kalemler ve şartlar doğrudan belgeye yazılır. */
  createStandaloneContract: (body: StandaloneContractCreateInput) => api.post<any>('/contracts/standalone', body),
  updateStandaloneContract: (id: string, body: StandaloneContractUpdateInput) =>
    api.patch<any>(`/contracts/standalone/${id}`, body),
  deleteContract: (id: string) => api.delete<any>(`/contracts/${id}`),
  commercialInvoices: (params?: Record<string, string | number | undefined>) =>
    api.get<Paginated<any>>(`/commercial-invoices${qs(params)}`),
  createCommercialInvoice: (body: CommercialInvoiceCreateInput) => api.post<any>('/commercial-invoices', body),
  updateCommercialInvoice: (id: string, body: CommercialInvoiceUpdateInput) => api.patch<any>(`/commercial-invoices/${id}`, body),
  deleteCommercialInvoice: (id: string) => api.delete<any>(`/commercial-invoices/${id}`),
};

// ───── Finance ─────
export const financeService = {
  receivables: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/receivables${qs(params)}`),
  createReceivable: (body: ReceivableCreateInput) => api.post<any>('/receivables', body),
  payments: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/payments${qs(params)}`),
  createPayment: (body: PaymentCreateInput) => api.post<any>('/payments', body),
  updatePayment: (id: string, body: PaymentUpdateInput) => api.patch<any>(`/payments/${id}`, body),
  deletePayment: (id: string) => api.delete<any>(`/payments/${id}`),
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
  paymentTermSuggestion: (params: { companyId: string; quoteId?: string }) =>
    api.get<{ paymentTermDays: number | null; contractNo: string | null; source: 'contract' | 'none' }>(
      `/accounting-invoices/payment-term-suggestion${qs(params)}`
    ),
  createAccountingInvoice: (body: AccountingInvoiceCreateInput) => api.post<any>('/accounting-invoices', body),
  updateAccountingInvoice: (id: string, body: AccountingInvoiceUpdateInput) => api.patch<any>(`/accounting-invoices/${id}`, body),
  deleteAccountingInvoice: (id: string) => api.delete<any>(`/accounting-invoices/${id}`),
};

// ───── Service / Installation / Shipment ─────
export const serviceService = {
  tickets: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/service-tickets${qs(params)}`),
  createTicket: (body: any) => api.post<any>('/service-tickets', body),
  update: (id: string, body: any) => api.patch<any>(`/service-tickets/${id}`, body),
  deleteTicket: (id: string) => api.delete<any>(`/service-tickets/${id}`),
  updateTicketStatus: (id: string, statusCode: string, serviceStage?: string) =>
    api.patch<any>(`/service-tickets/${id}/status`, { statusCode, serviceStage }),
  openServiceFormPdf: async (id: string, documentNo?: string, existingPreviewWindow?: Window | null): Promise<void> => {
    const previewWindow = existingPreviewWindow === undefined ? window.open('', '_blank') : existingPreviewWindow;
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = 'Servis formu hazırlanıyor';
      previewWindow.document.body.textContent = 'Servis formu hazırlanıyor...';
    }
    const token = getAccessToken();
    try {
      const res = await fetch(`${API_BASE_URL}/service-tickets/${encodeURIComponent(id)}/service-form.pdf`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        const contentType = res.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(json?.error?.message ?? `Servis formu oluşturulamadı (HTTP ${res.status})`);
        }
        throw new Error(`Servis formu oluşturulamadı (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      if (previewWindow) {
        previewWindow.location.replace(url);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `servis-formu-${documentNo ?? id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      previewWindow?.close();
      throw error;
    }
  },
  complaints: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/service-complaints${qs(params)}`),
  createComplaint: (body: ServiceComplaintCreateInput) => api.post<any>('/service-complaints', body),
  updateComplaint: (id: string, body: ServiceComplaintUpdateInput) => api.patch<any>(`/service-complaints/${id}`, body),
  convertComplaint: (id: string, body: ServiceComplaintConvertInput = {}) => api.post<any>(`/service-complaints/${id}/convert`, body),
  rejectComplaint: (id: string, body: ServiceComplaintRejectInput = {}) => api.post<any>(`/service-complaints/${id}/reject`, body),
  maintenancePlans: (params?: Record<string, string | number | boolean | undefined>) => api.get<Paginated<any>>(`/maintenance-plans${qs(params)}`),
  createMaintenancePlan: (body: { customerDeviceId: string; title?: string; intervalDays?: number; nextDueDate?: string; reminderLeadDays?: number; autoCreateTicket?: boolean; notes?: string | null }) =>
    api.post<any>('/maintenance-plans', body),
  updateMaintenancePlan: (id: string, body: Record<string, unknown>) => api.patch<any>(`/maintenance-plans/${id}`, body),
  completeMaintenancePlan: (id: string, servicedAt?: string) => api.post<any>(`/maintenance-plans/${id}/complete`, servicedAt ? { servicedAt } : {}),
  deleteMaintenancePlan: (id: string) => api.delete<any>(`/maintenance-plans/${id}`),
  complaintLinks: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/service-complaint-links${qs(params)}`),
  createComplaintLink: (body: ServiceComplaintLinkCreateInput) => api.post<any>('/service-complaint-links', body),
  rotateComplaintLink: (id: string) => api.patch<any>(`/service-complaint-links/${id}/rotate`, {}),
  revokeComplaintLink: (id: string) => api.patch<any>(`/service-complaint-links/${id}/revoke`, {}),
  warranty: (id: string) => api.get<any | null>(`/service-tickets/${id}/warranty`),
  updateWarranty: (id: string, body: any) => api.put<any>(`/service-tickets/${id}/warranty`, body),
  updateWarrantyParts: (id: string, parts: any[]) => api.put<any>(`/service-tickets/${id}/warranty/parts`, { parts }),
  submitWarranty: (id: string, note?: string) => api.post<any>(`/service-tickets/${id}/warranty/submit`, { note }),
  approveWarranty: (id: string, decisionNote?: string) => api.post<any>(`/service-tickets/${id}/warranty/approve`, { decisionNote }),
  rejectWarranty: (id: string, decisionNote?: string) => api.post<any>(`/service-tickets/${id}/warranty/reject`, { decisionNote }),
  installations: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/installations${qs(params)}`),
  createInstallation: (body: any) => api.post<any>('/installations', body),
  updateInstallation: (id: string, body: any) => api.patch<any>(`/installations/${id}`, body),
  deleteInstallation: (id: string) => api.delete<any>(`/installations/${id}`),
  updateInstallationStatus: (id: string, body: { statusCode: string; installationDate?: string; formData?: any }) =>
    api.patch<any>(`/installations/${id}/status`, body),
  shipments: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/shipments${qs(params)}`),
  shipment: (id: string) => api.get<any>(`/shipments/${id}`),
  shipmentCompanyOptions: (params?: { purpose?: 'sender' | 'carrier'; transportMode?: 'road' | 'air' | 'sea' | 'local_cargo'; search?: string }) =>
    api.get<any[]>(`/shipments/company-options${qs(params as Record<string, string | number | undefined>)}`),
  createShipment: (body: ShipmentCreateInput) => api.post<any>('/shipments', body),
  startShipment: (id: string, body: ShipmentStartInput = {}) => api.post<any>(`/shipments/${id}/start`, body),
  updateShipmentStatus: (id: string, body: ShipmentStatusUpdateInput | string) =>
    api.patch<any>(`/shipments/${id}/status`, typeof body === 'string' ? { statusCode: body } : body),
  deleteShipment: (id: string) => api.delete<any>(`/shipments/${id}`),
  deliveries: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/deliveries${qs(params)}`),
  createDelivery: (body: DeliveryCreateInput) => api.post<any>('/deliveries', body),
  updateDelivery: (id: string, body: DeliveryUpdateInput) => api.patch<any>(`/deliveries/${id}`, body),
  updateDeliveryStatus: (id: string, status: 'pending' | 'completed') =>
    api.patch<any>(`/deliveries/${id}/status`, { status }),
  deleteDelivery: (id: string) => api.delete<any>(`/deliveries/${id}`),
};

// ───── Public complaint intake ─────
export const publicComplaintService = {
  form: (slug: string, token: string) =>
    api.get<any>(`/public/service-complaints/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`),
  signedUpload: (
    slug: string,
    token: string,
    body: Pick<SignedUploadUrlInput, 'bucket' | 'filename' | 'mimeType' | 'extension' | 'sizeBytes'>
  ) =>
    api.post<{ fileId: string; bucket: string; objectKey: string; uploadUrl: string; expiresInSeconds: number }>(
      `/public/service-complaints/${encodeURIComponent(slug)}/${encodeURIComponent(token)}/files/signed-upload-url`,
      body
    ),
  uploadBinary: async (slug: string, token: string, fileId: string, file: Blob, mimeType: string) => {
    const res = await fetch(
      `${API_BASE_URL}/public/service-complaints/${encodeURIComponent(slug)}/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}/content`,
      {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': mimeType || 'application/octet-stream',
        },
        body: file,
      }
    );
    if (res.ok) return;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: unknown } } | null;
      throw new ApiError(
        res.status,
        json?.error?.code ?? `HTTP_${res.status}`,
        json?.error?.message ?? `Hata ${res.status}`,
        json?.error?.details
      );
    }
    throw new ApiError(res.status, `HTTP_${res.status}`, res.statusText || `Hata ${res.status}`);
  },
  submit: (slug: string, token: string, body: PublicServiceComplaintInput) =>
    api.post<any>(`/public/service-complaints/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, body),
};

async function uploadViaApi(fileId: string, file: Blob, mimeType: string): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': mimeType || 'application/octet-stream',
  };
  const token = getAccessToken();
  const activeDivision = getActiveDivision();
  const activeDepartment = getActiveDepartment();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (activeDivision) {
    headers['X-Active-Division'] = activeDivision;
  }
  if (activeDepartment) {
    headers['X-Active-Department'] = activeDepartment;
  }

  const res = await fetch(`${API_BASE_URL}/files/${encodeURIComponent(fileId)}/content`, {
    method: 'PUT',
    headers,
    credentials: 'include',
    body: file,
  });
  if (res.ok) return;

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: unknown } } | null;
    throw new ApiError(
      res.status,
      json?.error?.code ?? `HTTP_${res.status}`,
      json?.error?.message ?? `Hata ${res.status}`,
      json?.error?.details
    );
  }
  throw new ApiError(res.status, `HTTP_${res.status}`, res.statusText || `Hata ${res.status}`);
}

// ───── Files ─────
export const fileService = {
  signedUpload: (body: SignedUploadUrlInput) =>
    api.post<SignedUploadResponse>('/files/signed-upload-url', body),
  uploadBinary: async (upload: SignedUploadResponse, file: Blob, mimeType: string) => {
    await uploadViaApi(upload.fileId, file, mimeType);
  },
  signedDownload: (fileId: string) => api.post<{ downloadUrl: string; filename: string; mimeType: string }>('/files/signed-download-url', { fileId }),
  link: (body: FileLinkInput) => api.post('/files/link', body),
  links: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/files/links${qs(params)}`),
  remove: (id: string) => api.delete(`/files/${id}`),
};

// ───── Belge imzaları ─────
export const signatureService = {
  /** Belge ekranları `activeOnly` ister; ayar ekranı pasifleri de görmek için boş bırakır. */
  list: (params?: { activeOnly?: boolean }) =>
    api.get<SignatureView[]>(`/signatures${qs({ activeOnly: params?.activeOnly ? 'true' : undefined })}`),
  create: (body: SignatureCreateInput) => api.post<SignatureView>('/signatures', body),
  update: (id: string, body: SignatureUpdateInput) => api.patch<SignatureView>(`/signatures/${id}`, body),
  remove: (id: string) => api.delete(`/signatures/${id}`),
  /**
   * Görseli yükler ve dosya kimliğini döndürür. Bağlama işini API üstlenir:
   * dönen `fileId` create/update gövdesine konur, ayrıca /files/link çağrılmaz.
   * Yeni (henüz kaydedilmemiş) imza için `signatureId` yerine 'new' geçilir.
   */
  uploadImage: async (
    signatureId: string,
    file: Blob,
    meta: { filename: string; mimeType: string; extension: string },
  ): Promise<string> => {
    const upload = await fileService.signedUpload({
      bucket: 'erp-signatures',
      entityType: 'signature',
      entityId: signatureId,
      filename: meta.filename,
      mimeType: meta.mimeType,
      extension: meta.extension,
      sizeBytes: file.size,
    } as SignedUploadUrlInput);
    await fileService.uploadBinary(upload, file, meta.mimeType);
    return upload.fileId;
  },
};

// ───── Reports ─────

/** Yıl sonu / karlılık raporu (GET /reports/year-end). Tüm parasal alanlar string döner. */
export interface YearEndReport {
  year: number;
  summary: {
    total: number;
    won: number;
    lost: number;
    open: number;
    wonValue: string;
    lostValue: string;
    openValue: string;
    winRate: number;
    lossRate: number;
    avgWonValue: string;
    avgLostValue: string;
    avgQuoteValue: string;
  };
  lostReasons: Array<{ code: string | null; name: string | null; count: number; value: string }>;
  competitors: Array<{ id: string; name: string; count: number; value: string }>;
  wonReasons: Array<{ reason: string | null; count: number; value: string }>;
  monthly: Array<{ month: string; won: number; lost: number; wonValue: string; lostValue: string }>;
  byUser: Array<{ userId: string | null; name: string | null; won: number; lost: number; total: number; wonValue: string }>;
  quotes: { count: number; value: string };
  quotesByStatus: Array<{ code: string | null; name: string | null; count: number; totalValue: string; avgValue: string }>;
}

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
  warrantyExpiring: (params?: Record<string, string | number>) => api.get<any[]>(`/reports/warranty-expiring${qs(params)}`),
  serviceComplaintsSummary: () => api.get<any>('/reports/service-complaints-summary'),
  yearEnd: (year: number) => api.get<YearEndReport>(`/reports/year-end?year=${year}`),
  targetProgress: (params: { period: string; scope?: 'user' | 'department' | 'role' | 'all-users'; id?: string }) =>
    api.get<any>(`/reports/target-progress${qs(params)}`),
  myTargetProgress: (params: { period: string }) => api.get<any>(`/reports/my-target-progress${qs(params)}`),
  /**
   * Ekip aktivitesi. `scope: 'team'` yalnız süper adminde geçerlidir; diğer
   * kullanıcılarda sunucu isteği sessizce 'self'e düşürür.
   */
  teamActivity: (params: { period: TeamActivityPeriod; date?: string; scope?: 'team' | 'self' }) =>
    api.get<TeamActivityReport>(`/reports/team-activity${qs(params)}`),
  downloadYearEnd: (year: number) => exportService.yearEnd(year),
};

export type TeamActivityPeriod = 'day' | 'week' | 'month' | 'year';
/** Mevcut dönem ve bir önceki eşdeğer dönem sayacı. */
export type ActivityDelta = { current: number; previous: number };
export interface TeamActivityReport {
  period: TeamActivityPeriod;
  scope: 'team' | 'self';
  canSeeTeam: boolean;
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  bucket: 'hour' | 'day' | 'month';
  totals: {
    quotes: number; visits: number; calls: number; activities: number;
    opportunitiesCreated: number; won: number; wonValue: number;
  };
  previousTotals: {
    quotes: number; visits: number; calls: number; activities: number;
    opportunitiesCreated: number; won: number;
  };
  timeline: Array<{ bucket: string; quotes: number; visits: number; calls: number; activities: number }>;
  users: Array<{
    userId: string; name: string;
    quotes: ActivityDelta; visits: ActivityDelta; calls: ActivityDelta; activities: ActivityDelta;
    opportunitiesCreated: ActivityDelta; won: ActivityDelta;
    wonValue: number; total: ActivityDelta;
  }>;
}

// ───── Admin (users, roles, departments) ─────
export const adminService = {
  users: () => api.get<any[]>('/users'),
  createUser: (body: UserCreateInput) => api.post<any>('/users', body),
  updateUser: (id: string, body: UserUpdateInput) => api.patch<any>(`/users/${id}`, body),
  unlockUser: (id: string) => api.post<{ ok: true; id: string; failedLoginAttempts: number; lockedUntil: null }>(`/users/${id}/unlock`, {}),
  deleteUser: (id: string) => api.delete(`/users/${id}`),
  userTargets: (params?: Record<string, string | number | undefined>) => api.get<any[]>(`/user-targets${qs(params)}`),
  myTargets: (params?: Record<string, string | number | undefined>) => api.get<any[]>(`/me/targets${qs(params)}`),
  saveUserTarget: (userId: string, body: TargetUpsertInput) => api.post<any>(`/users/${userId}/targets`, body),
  departmentTargets: (params?: Record<string, string | number | undefined>) => api.get<any[]>(`/department-targets${qs(params)}`),
  saveDepartmentTarget: (departmentId: string, body: TargetUpsertInput) => api.post<any>(`/departments/${departmentId}/targets`, body),
  saveRoleTarget: (roleId: string, body: TargetUpsertInput) => api.post<any>(`/roles/${roleId}/targets`, body),
  roleTargetMembers: (roleId: string) =>
    api.get<{ roleCode: string; roleName: string; memberCount: number; members: { userId: string; fullName: string }[] }>(
      `/roles/${roleId}/target-members`
    ),
  updateDept: (id: string, body: DepartmentUpdateInput) => api.patch<any>(`/departments/${id}`, body),
  roles: () => api.get<any[]>('/roles'),
  createRole: (body: RoleCreateInput) => api.post<any>('/roles', body),
  updateRole: (id: string, body: RoleUpdateInput) => api.patch<any>(`/roles/${id}`, body),
  permissions: () => api.get<any[]>('/permissions'),
  departments: () => api.get<any[]>('/departments'),
  divisions: () => api.get<any[]>('/divisions'),
  createDept: (body: DepartmentCreateInput) => api.post<any>('/departments', body),
  deleteDept: (id: string) => api.delete<{ ok: true; id: string }>(`/departments/${id}`),
  auditLogs: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/audit-logs${qs(params)}`),
  tenant: () => api.get<any>('/tenant'),
  updateTenant: (body: TenantUpdateInput) => api.patch<any>('/tenant', body),
  lookups: () => api.get<{ available: string[] }>('/admin/lookups'),
  lookupRows: (name: string, params?: Record<string, string | number | undefined>) =>
    api.get<any[]>(`/admin/lookups/${name}${qs(params)}`),
  createLookup: (name: string, body: { code?: string; name: string; description?: string; sortOrder?: number; isActive?: boolean; province?: string; divisionId?: string | null; parentId?: string | null; productTypeIds?: string[]; companyId?: string | null; isOwned?: boolean; logoFileId?: string | null }) =>
    api.post<any>(`/admin/lookups/${name}`, body),
  updateLookup: (
    name: string,
    id: string,
    body: { code?: string; name?: string; description?: string; sortOrder?: number; isActive?: boolean; province?: string; divisionId?: string | null; parentId?: string | null; productTypeIds?: string[]; companyId?: string | null; isOwned?: boolean; logoFileId?: string | null }
  ) => api.patch<any>(`/admin/lookups/${name}/${id}`, body),
  reorderLookup: (name: string, items: Array<{ id: string; sortOrder: number }>) =>
    api.patch<{ ok: true; items: Array<{ id: string; sortOrder: number }> }>(`/admin/lookups/${name}/reorder`, { items }),
  deleteLookup: (name: string, id: string) => api.delete<any>(`/admin/lookups/${name}/${id}`),
  productSpecTemplates: (productTypeCode?: string, divisionId?: string, scope?: string) =>
    api.get<any[]>(`/admin/product-spec-templates${qs({ productTypeCode, divisionId, scope })}`),
  createProductSpecTemplate: (body: ProductSpecTemplateCreateInput) => api.post<any>('/admin/product-spec-templates', body),
  bulkCreateProductSpecTemplates: (items: ProductSpecTemplateBulkCreateInput['items']) =>
    api.post<{ ok: boolean; created: number; skipped: number; rows: any[] }>('/admin/product-spec-templates/bulk', { items }),
  batchSaveProductSpecTemplates: (body: ProductSpecTemplateBatchInput) =>
    api.put<{ ok: boolean; rows: any[]; prunedIds: string[] }>('/admin/product-spec-templates/batch', body),
  createMachineTemplate: (body: MachineTemplateCreateInput) =>
    api.post<{ type: any; specs: any[] }>('/admin/machine-templates', body),
  updateProductSpecTemplate: (id: string, body: ProductSpecTemplateUpdateInput) =>
    api.patch<any>(`/admin/product-spec-templates/${id}`, body),
  deleteProductSpecTemplate: (id: string) => api.delete<any>(`/admin/product-spec-templates/${id}`),
  previewTechnicalImport: (body: TechnicalImportPreviewRequest) =>
    api.post<TechnicalImportPreview>('/admin/technical-import/preview', body),
  commitTechnicalImport: (body: TechnicalImportCommitRequest) =>
    api.post<{ ok: boolean; created: number; updated: number; imported: number; productId?: string }>(
      '/admin/technical-import/commit',
      body
    ),
};

// ───── Lookups ─────
export const lookupService = {
  available: () => api.get<{ available: string[] }>('/lookups'),
  byName: (name: string, params?: Record<string, string | number | undefined>) => api.get<any[]>(`/lookups/${name}${qs(params)}`),
  taxOffices: (city?: string) => api.get<any[]>(`/lookups/tax-offices${qs({ city })}`),
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
  location: { latitude: number; longitude: number; label: string | null } | null;
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
  webrtcConfig: () => api.get<{ iceServers: RTCIceServer[]; expiresAt: string | null }>('/chat/webrtc-config'),
  conversations: () => api.get<ChatConversationSummary[]>('/chat/conversations'),
  createDm: (userId: string) => api.post<ChatConversationDetail>('/chat/conversations/dm', { userId }),
  createGroup: (body: CreateGroupInput) => api.post<ChatConversationDetail>('/chat/conversations/group', body),
  conversation: (id: string) => api.get<ChatConversationDetail>(`/chat/conversations/${id}`),
  updateGroup: (id: string, body: UpdateGroupInput) => api.patch<ChatConversationDetail>(`/chat/conversations/${id}`, body),
  addMembers: (id: string, userIds: string[]) => api.post<ChatConversationDetail>(`/chat/conversations/${id}/members`, { userIds }),
  removeMember: (id: string, userId: string) => api.delete(`/chat/conversations/${id}/members/${userId}`),
  setMemberRole: (id: string, userId: string, role: ChatMemberRole) =>
    api.patch(`/chat/conversations/${id}/members/${userId}/role`, { role }),
  messages: (id: string, params?: { before?: string; limit?: number; search?: string }) =>
    api.get<{ messages: ChatMessageDTO[]; hasMore: boolean }>(`/chat/conversations/${id}/messages${qs(params)}`),
  sendMessage: (id: string, body: SendMessageInput) => api.post<ChatMessageDTO>(`/chat/conversations/${id}/messages`, body),
  markRead: (id: string) => api.post(`/chat/conversations/${id}/read`),
  editMessage: (messageId: string, body: string) => api.patch<ChatMessageDTO>(`/chat/messages/${messageId}`, { body }),
  toggleReaction: (messageId: string, emoji: string) =>
    api.post<{ messageId: string; reactions: ChatReaction[] }>(`/chat/messages/${messageId}/reactions`, { emoji }),
  deleteMessage: (id: string) => api.delete(`/chat/messages/${id}`),
};

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
