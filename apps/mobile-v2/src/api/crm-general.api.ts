import { request, type Paginated } from '@/src/api/client';
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventPatch,
  CompanyDetail,
  CompanyListItem,
  CompanyListQuery,
  CompanySummary,
  ContactListItem,
  ContactListQuery,
  ContactSummary,
  Task,
  TaskDetail,
  TaskInput,
  TaskPriority,
  TaskStatus,
  TaskView,
} from '@/src/api/endpoints';

/* ------------------------------------------------------------ firmalar ---- */

export type SupplierCategoryCode = 'transportation' | 'logistics' | 'manufacturer';

/** `GET /companies` sunucuda bunları da kabul eder (companyListQuerySchema). */
export type CompanyListQueryExt = CompanyListQuery & {
  divisionId?: string;
  supplierCategoryCode?: SupplierCategoryCode;
};

export type CompanyAddressRow = {
  id: string;
  addressType: string;
  province: string | null;
  district: string | null;
  fullAddress: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  locationSource?: string | null;
  isDefault: boolean;
};

/** Liste satırı; sunucu `companies.service.ts list()` ek alanları. */
export type CompanyListRow = Omit<CompanyListItem, 'primaryAddress'> & {
  companyType?: string | null;
  taxNumber?: string | null;
  taxOffice?: string | null;
  supplierCategoryCode?: SupplierCategoryCode | null;
  externalCompanyNo?: string | null;
  createdByUser?: { id: string; fullName: string; email: string } | null;
  secondaryPhone?: string | null;
  fax?: string | null;
  secondaryEmail?: string | null;
  divisions?: { id: string; code: string; name: string }[];
  companyGroups?: { id?: string; code: string; name: string }[];
  contactSource?: { code: string | null; name: string | null } | null;
  primaryAddress: CompanyAddressRow | null;
  addresses?: CompanyAddressRow[];
};

export type CompanyOsmQuery = {
  q: string;
  address?: string;
  city?: string;
  district?: string;
  country?: string;
};

export type CompanyOsmSearchResult = {
  id: string;
  displayName: string;
  latitude: number;
  longitude: number;
  type: string | null;
  category: string | null;
  importance: number | null;
  matchQuality: 'exact' | 'street' | 'area';
  matchScore: number;
  matchReason: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
};

export type CompanyWebsiteLookupResult = {
  officialWebsite: string;
  siteName?: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  matchReason: string;
  sourceUrls: string[];
  suggestion: {
    website: string;
    address?: string;
    city?: string;
    district?: string;
    country?: string;
    zipCode?: string;
    phone?: string;
    email?: string;
    latitude?: number;
    longitude?: number;
  };
  warnings: string[];
};

export type CompanyLocationSource = 'manual' | 'verified' | 'osm_exact' | 'osm_street' | 'osm_area';

export type NearbyStaleVisitCompany = {
  id: string;
  name: string;
  city: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  lastVisitAt: string | null;
  daysSinceVisit: number | null;
};

export type ImportExcelFile = { fileName: string; mimeType?: string; fileBase64: string };

export type CompanyContactImportBody = {
  companiesFile: ImportExcelFile;
  contactsFile: ImportExcelFile;
  divisionId?: string;
};

export type CompanyContactImportPreview = {
  files: { companies: unknown; contacts: unknown };
  summary: {
    companyRows: number;
    companyCreates: number;
    companyUpdates: number;
    companySkipped: number;
    contactRows: number;
    contactCreates: number;
    contactUpdates: number;
    contactSkipped: number;
    warnings: number;
    errors: number;
  };
  issues: {
    kind: string;
    rowNumber: number;
    sourceNo?: string;
    companyNo?: string;
    severity: 'warning' | 'error' | string;
    message: string;
  }[];
};

export type CompanyContactImportCommitResult = {
  ok: boolean;
  companies: { created: number; updated: number; skipped: number };
  contacts: { created: number; updated: number; skipped: number };
  warnings: number;
  errors: number;
};

export type TaxOffice = { id: string; code: string; name: string; province: string | null; sortOrder?: number };

export const companiesExt = {
  list: (query: CompanyListQueryExt & { page: number; pageSize: number }) =>
    request<Paginated<CompanyListRow>>('/companies', { query }),
  summary: (divisionId?: string) =>
    request<CompanySummary>('/companies/summary', { query: divisionId ? { divisionId } : undefined }),
  osmSearch: (query: CompanyOsmQuery) =>
    request<CompanyOsmSearchResult[]>('/companies/osm-search', { query }),
  websiteLookup: (body: CompanyOsmQuery & { website?: string }) =>
    request<CompanyWebsiteLookupResult>('/companies/website-lookup', { method: 'POST', body }),
  setLocation: (id: string, body: { latitude: number | null; longitude: number | null; source?: CompanyLocationSource }) =>
    request<CompanyDetail>(`/companies/${id}/location`, { method: 'PATCH', body }),
  nearbyStaleVisits: (body: { latitude: number; longitude: number; radiusKm?: number; staleDays?: number; notify?: boolean }) =>
    request<{ staleDays: number; radiusKm: number; companies: NearbyStaleVisitCompany[] }>(
      '/companies/nearby-stale-visits',
      { method: 'POST', body },
    ),
  previewCompanyContactImport: (body: CompanyContactImportBody) =>
    request<CompanyContactImportPreview>('/companies/imports/company-contacts/preview', { method: 'POST', body }),
  commitCompanyContactImport: (body: CompanyContactImportBody & { confirmed: true }) =>
    request<CompanyContactImportCommitResult>('/companies/imports/company-contacts/commit', { method: 'POST', body }),
};

/** `GET /lookups/:name` satırı (lookups.controller). */
export type CompanyLookupRow = { id: string; code: string; name: string; sortOrder?: number | null; isActive?: boolean };

export const lookupsExt = {
  taxOffices: (city?: string) => request<TaxOffice[]>('/lookups/tax-offices', { query: city ? { city } : undefined }),
  companyRelationTypes: () => request<CompanyLookupRow[]>('/lookups/company-relation-types'),
  companyStatuses: () => request<CompanyLookupRow[]>('/lookups/company-statuses'),
  companyGroups: () => request<CompanyLookupRow[]>('/lookups/company-groups'),
  companySectors: () => request<CompanyLookupRow[]>('/lookups/company-sectors'),
  contactSources: () => request<CompanyLookupRow[]>('/lookups/contact-sources'),
};

/* ------------------------------------------------------------ kontaklar ---- */

export type ContactListRow = ContactListItem & {
  createdByUser?: { id: string; fullName: string; email: string } | null;
};

export const contactsExt = {
  list: (query: ContactListQuery & { divisionId?: string; page: number; pageSize: number }) =>
    request<Paginated<ContactListRow>>('/contacts', { query }),
  summary: (divisionId?: string) =>
    request<ContactSummary>('/contacts/summary', { query: divisionId ? { divisionId } : undefined }),
  setPrimaryCompany: (id: string, companyId: string) =>
    request<ContactListItem['companyLinks']>(`/contacts/${id}/companies/${companyId}/primary`, { method: 'POST' }),
  unlinkCompany: (id: string, companyId: string) =>
    request<ContactListItem['companyLinks']>(`/contacts/${id}/companies/${companyId}`, { method: 'DELETE' }),
};

/* --------------------------------------------------------------- mail ---- */

/** packages/shared userMailAccountStatusSchema ile aynı alanlar. */
export type MailAccountStatus = {
  featureEnabled: boolean;
  configured: boolean;
  email: string | null;
  displayName: string | null;
  status: 'active' | 'error' | null;
  serverLabel: string | null;
  signature: string | null;
  defaultSignature: string;
};

export const mailExt = {
  account: () => request<MailAccountStatus>('/mail/account'),
};

/* --------------------------------------------------------------- sohbet ---- */

export type ChatConversationMember = {
  userId: string;
  role: 'admin' | 'member' | string;
  fullName: string;
  email: string;
  lastReadAt: string | null;
};

export type ChatConversationDetail = {
  id: string;
  type: 'dm' | 'group';
  title: string | null;
  description: string | null;
  avatarFileId: string | null;
  onlyAdminsCanPost: boolean;
  refType: string | null;
  refId: string | null;
  createdBy: string | null;
  members: ChatConversationMember[];
  myRole: 'admin' | 'member' | string;
};

export type ChatGroupPatch = {
  title?: string;
  description?: string | null;
  onlyAdminsCanPost?: boolean;
  avatarFileId?: string | null;
};

export type ChatRefType = 'quote' | 'company' | 'service_ticket' | 'opportunity';

export type WebRtcConfig = {
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
  expiresAt: string;
};

export const chatExt = {
  conversation: (id: string) => request<ChatConversationDetail>(`/chat/conversations/${id}`),
  updateGroup: (id: string, body: ChatGroupPatch) =>
    request<ChatConversationDetail>(`/chat/conversations/${id}`, { method: 'PATCH', body }),
  addMembers: (id: string, userIds: string[]) =>
    request<ChatConversationDetail>(`/chat/conversations/${id}/members`, { method: 'POST', body: { userIds } }),
  removeMember: (id: string, userId: string) =>
    request<{ ok: true }>(`/chat/conversations/${id}/members/${userId}`, { method: 'DELETE' }),
  setMemberRole: (id: string, userId: string, role: 'admin' | 'member') =>
    request<{ ok: true }>(`/chat/conversations/${id}/members/${userId}/role`, { method: 'PATCH', body: { role } }),
  webrtcConfig: () => request<WebRtcConfig>('/chat/webrtc-config'),
};

/* -------------------------------------------------------------- takvim ---- */

export type CalendarEventFull = CalendarEvent & {
  ownerUserId?: string;
  createdBy?: string | null;
  contactId?: string | null;
  timezone?: string;
  deletedAt?: string | null;
};

export type CalendarImportEvent = {
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
};

export type CalendarImportPreview = {
  window: { from: string; to: string };
  summary: { total: number; duplicates: number; inWindow: number };
  events: CalendarImportEvent[];
};

export type CalendarImportEventType = 'other' | 'meeting' | 'call' | 'task';

export const calendarExt = {
  events: (query: { from: string; to: string; ownerUserId?: string; includeArchived?: 'true' | 'false' }) =>
    request<CalendarEventFull[]>('/calendar/events', { query }),
  create: (body: CalendarEventInput & { ownerUserId?: string }) =>
    request<CalendarEventFull>('/calendar/events', { method: 'POST', body }),
  update: (id: string, body: CalendarEventPatch) =>
    request<CalendarEventFull>(`/calendar/events/${id}`, { method: 'PATCH', body }),
  remove: (id: string) =>
    request<{ deleted: boolean; restoreUntil: string }>(`/calendar/events/${id}`, { method: 'DELETE' }),
  restore: (id: string) => request<CalendarEventFull>(`/calendar/events/${id}/restore`, { method: 'POST' }),
  importPreview: (body: { fileName: string; fileBase64: string }) =>
    request<CalendarImportPreview>('/calendar/import/preview', { method: 'POST', body }),
  importCommit: (body: {
    defaultEventType: CalendarImportEventType;
    events: Omit<CalendarImportEvent, 'duplicate' | 'inWindow'>[];
  }) => request<{ created: number; updated: number }>('/calendar/import/commit', { method: 'POST', body }),
};

/* -------------------------------------------------------------- görevler ---- */

export type TaskSortBy = 'dueAt' | 'priority' | 'createdAt' | 'status';

export type TaskListQueryExt = {
  view?: TaskView;
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedToUserId?: string;
  createdBy?: string;
  companyId?: string;
  contactId?: string;
  opportunityId?: string;
  sortBy?: TaskSortBy;
  sortDir?: 'asc' | 'desc';
  pageSize?: number;
};

export type TaskUserSummary = { userId: string; fullName: string; open: number; overdue: number; completed: number };

export type TaskRecordEvent = {
  id: string;
  taskId: string;
  taskTitle: string;
  eventType: string;
  summary: string;
  createdAt: string;
  actorName: string | null;
};

export type TaskRecordFilter = {
  companyId?: string;
  contactId?: string;
  opportunityId?: string;
  quoteId?: string;
  serviceTicketId?: string;
};

export type TaskPatch = Partial<TaskInput> & { completionNote?: string };

export const tasksExt = {
  list: (query: TaskListQueryExt) => request<{ data: Task[]; meta: { total: number } }>('/tasks', { query }),
  summary: () => request<TaskUserSummary[]>('/tasks/summary'),
  events: (query: TaskRecordFilter) => request<TaskRecordEvent[]>('/tasks/events', { query }),
  update: (id: string, body: TaskPatch) => request<TaskDetail>(`/tasks/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ deleted: true }>(`/tasks/${id}`, { method: 'DELETE' }),
};

/* ----------------------------------------------------- ziyaret / arama ---- */

export type VisitInput = {
  opportunityId?: string;
  companyId: string;
  contactId?: string;
  visitDate: string;
  visitLocation?: string;
  visitPurpose?: string;
  visitResult?: string;
  nextAction?: string;
};

export type CallInput = {
  opportunityId?: string;
  companyId: string;
  contactId?: string;
  callDate: string;
  callResult?: string;
  nextAction?: string;
};

export const activityExt = {
  createVisit: (body: VisitInput) => request<{ id: string }>('/visits', { method: 'POST', body }),
  createCall: (body: CallInput) => request<{ id: string }>('/calls', { method: 'POST', body }),
};
