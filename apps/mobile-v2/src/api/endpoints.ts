import type {
  CompanyCreateInput,
  CompanyStatusMutationInput,
  CompanyUpdateInput,
  ContactCreateInput,
  ContactUpdateInput,
  FileLinkInput,
  PaymentCreateInput,
  ActivityCreateInput,
  ActivityUpdateInput,
  CreateGroupInput,
  SendMessageInput,
  SignedUploadUrlInput,
  ServiceComplaintConvertInput,
  ServiceComplaintRejectInput,
  ServiceComplaintUpdateInput,
  ProductUpdateInput,
} from '@haksan/shared';
import { request, type Paginated } from './client';
import {
  authForgotPasswordResponseSchema,
  authLoginResponseSchema,
  authLogoutResponseSchema,
  authMeResponseSchema,
  authResetPasswordResponseSchema,
  type AuthLoginResponse,
  type AuthMeResponse,
  type AuthOkResponse,
} from './auth-schemas';

/* ---------------------------------------------------------------- auth ---- */

export type AuthUser = AuthMeResponse['user'];

/** DİKKAT: /auth/me kullanıcıyı `user` altında sarmalar, düz döndürmez. */
// Catalog nav anahtarları istemci tarafında string olarak tutuluyor; wire
// şeması yine shared enum ile dar ve exact doğrulanır, uygulama tipi ise bu
// read-only listeyi katalog karşılaştırmaları için güvenle genişletir.
export type AuthTenant = Omit<AuthMeResponse['tenant'], 'hiddenNavigationKeys'> & {
  hiddenNavigationKeys: string[];
};
export type MeResponse = { user: AuthUser; tenant: AuthTenant };

export const auth = {
  /** Yanıttaki `user` incedir (permissions yok) — giriş sonrası me() ile tamamlanır. */
  /**
   * `skipRefresh`: hatalı parolada dönen 401, istemcinin yenileme+oturum-düşürme
   * yoluna girmemeli — henüz oturum yok, düşürülecek bir şey de yok. Aksi halde
   * yanlış parola boşuna bir /auth/refresh isteği doğuruyordu.
  */
  login: (body: { identifier: string; password: string; tenantSlug?: string }) =>
    request<AuthLoginResponse>('/auth/login', {
      method: 'POST',
      body,
      skipRefresh: true,
      schema: authLoginResponseSchema,
    }),
  me: () => request<MeResponse>('/auth/me', { schema: authMeResponseSchema }),
  logout: () =>
    request<AuthOkResponse>('/auth/logout', {
      method: 'POST',
      schema: authLogoutResponseSchema,
    }),
  /**
   * Sunucu, e-posta kayıtlı olmasa bile `{ ok: true }` döner (kullanıcı sayımı
   * sızmasın diye). Arayüz de bu yüzden her durumda aynı mesajı gösterir.
  */
  forgotPassword: (body: { email: string; tenantSlug?: string }) =>
    request<AuthOkResponse>('/auth/forgot-password', {
      method: 'POST',
      body,
      schema: authForgotPasswordResponseSchema,
    }),
  resetPassword: (body: { token: string; newPassword: string }) =>
    request<AuthOkResponse>('/auth/reset-password', {
      method: 'POST',
      body,
      schema: authResetPasswordResponseSchema,
    }),
};

/* ----------------------------------------------------------- companies ---- */

/**
 * Liste satırının şekli sunucuda `companies.service.ts` içinde kuruluyor; tablo
 * kolonları + türetilmiş alanlar. Şemadan türetilemediği için burada tutuluyor.
 */
export type CompanyListItem = {
  id: string;
  legalTitle: string;
  shortName: string | null;
  sector: string | null;
  logoUrl: string | null;
  website: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  relationType: { code: string; name: string } | null;
  customerStatus: { code: string; name: string } | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  primaryAddress: { province: string | null; district: string | null; fullAddress: string | null } | null;
};

export type CompanyListQuery = {
  search?: string;
  relationTypeCode?: 'customer' | 'supplier' | 'supplier_customer' | 'competitor';
  customerStatusCode?: 'potential' | 'active' | 'passive' | 'blacklist';
  city?: string;
  sector?: string;
  sortBy?: 'name' | 'createdAt';
  sortDir?: 'asc' | 'desc';
};

export type CompanySummary = {
  total: number;
  byRelation: Record<string, number>;
  byStatus: Record<'potential' | 'active' | 'passive' | 'blacklist', number>;
  cities: string[];
  sectors: string[];
};

export type CompanyMapPoint = {
  id: string;
  legalTitle: string;
  shortName: string | null;
  relationTypeCode: string | null;
  statusCode: string | null;
  latitude: number;
  longitude: number;
  province: string | null;
  district: string | null;
  locationSource: string | null;
};

export type CompanyAddress = {
  id: string;
  addressType: string;
  country: string;
  province: string | null;
  district: string | null;
  locality: string | null;
  zipCode: string | null;
  street: string | null;
  buildingNumber: string | null;
  fullAddress: string | null;
  latitude: string | null;
  longitude: string | null;
  isDefault: boolean;
};

export type CompanyPhone = { id: string; phoneType: string; phone: string; extension: string | null; isDefault: boolean };
export type CompanyEmail = { id: string; emailType: string; email: string; isDefault: boolean };

/**
 * DİKKAT: `GET /companies/:id` listedeki gibi join'li DEĞİL — ham tablo satırı
 * (`relationTypeId`/`customerStatusId` çözülmemiş) + adres/telefon/e-posta
 * dizileri döner. İlişki/durum adı `lookups.get('company-relation-types' |
 * 'company-statuses')` ile ayrı çözülür (companies.service.ts `get()`).
 */
export type CompanyDetail = {
  id: string;
  companyType: string;
  relationTypeId: string | null;
  customerStatusId: string | null;
  companyGroupId: string | null;
  sector: string | null;
  externalCompanyNo: string | null;
  legalTitle: string;
  shortName: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  website: string | null;
  logoUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUser: { id: string; fullName: string; email: string } | null;
  addresses: CompanyAddress[];
  phones: CompanyPhone[];
  emails: CompanyEmail[];
};

export const companies = {
  list: (query: CompanyListQuery & { page: number; pageSize: number }) =>
    request<Paginated<CompanyListItem>>('/companies', { query }),
  get: (id: string) => request<CompanyDetail>(`/companies/${id}`),
  summary: () => request<CompanySummary>('/companies/summary'),
  mapPoints: () => request<{ data: CompanyMapPoint[]; truncated: boolean }>('/companies/map-points'),
  create: (body: CompanyCreateInput) => request<CompanyListItem>('/companies', { method: 'POST', body }),
  update: (id: string, body: CompanyUpdateInput) =>
    request<CompanyListItem>(`/companies/${id}`, { method: 'PATCH', body }),
  updateStatus: (
    id: string,
    body: CompanyStatusMutationInput,
    scope?: { divisionId: string | null; departmentId: string | null },
  ) => request<CompanyDetail>(`/companies/${id}/status`, {
    method: 'PATCH',
    body,
    headers: scope
      ? {
          'X-Active-Division': scope.divisionId ?? 'all',
          'X-Active-Department': scope.departmentId ?? 'all',
        }
      : undefined,
  }),
  remove: (id: string) => request<void>(`/companies/${id}`, { method: 'DELETE' }),
};

/* ------------------------------------------------------------- reports ---- */

export type PipelineStageSummary = {
  stageCode: string;
  stageName: string;
  sortOrder: number;
  count: number;
  /** Sunucu para alanlarını `::text` döndürür; float'a çevirmek kuruş kaybettirir. */
  totalValue: string;
};

export type Receivable = {
  receivable: { id: string; amount: string; currency: string; dueDate: string | null };
  company: { id: string; legalTitle: string } | null;
};

export type ServiceComplaintSummary = {
  total: number;
  new: number;
  reviewing: number;
  converted: number;
  rejected: number;
  warrantyClaim: number;
};

export type CompletedPayment = {
  id: string;
  companyId: string;
  direction: 'in' | 'out' | string;
  amount: string;
  paymentDate: string;
  company: { id: string; legalTitle: string; shortName: string | null };
  status: { id: string; code: string; name: string } | null;
  currency: { id: string; code: string } | null;
};

export const reports = {
  pipelineSummary: () => request<PipelineStageSummary[]>('/reports/pipeline-summary'),
  expectedReceivables: () => request<Receivable[]>('/reports/expected-receivables'),
  serviceSummary: () => request<ServiceComplaintSummary>('/reports/service-complaints-summary'),
  completedPayments: (query: { from?: string; to?: string } = {}) =>
    request<CompletedPayment[]>('/reports/completed-payments', { query }),
};

export const inventory = {
  /** Sadece toplam sayı gerekiyorsa `pageSize: 1` ile meta.total okunur. */
  customerDevices: (query: { page: number; pageSize: number }) =>
    request<Paginated<{ id: string; serialNo: string | null }>>('/customer-devices', { query }),
};

/* ------------------------------------------------------- notifications ---- */

/**
 * Sunucu `entityType`/`entityId` yerine çözülmüş bir `target` de döndürüyor;
 * arayüz tıklanınca nereye gideceğini bundan okur (notifications.controller.ts).
 */
export type NotificationTarget =
  | { kind: 'company'; companyId: string }
  | { kind: 'opportunity'; opportunityId: string; activityId?: string }
  | { kind: 'navigate'; nav: string; query?: string };

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  actionType: 'visit_intent' | string | null;
  actionStatus: 'pending' | 'accepted' | 'declined' | null;
  responseReason: string | null;
  respondedAt: string | null;
  readAt: string | null;
  createdAt: string;
  target: NotificationTarget | null;
};

export const notifications = {
  list: (query: { page: number; pageSize: number; unread?: boolean }) =>
    request<Paginated<NotificationItem>>('/notifications', { query }),
  markRead: (id: string) => request<NotificationItem>(`/notifications/${id}/read`, { method: 'PATCH' }),
  respond: (id: string, body: { decision: 'yes' | 'no'; reason?: string }) =>
    request<NotificationItem>(`/notifications/${id}/respond`, { method: 'POST', body }),
};

/* ------------------------------------------------------------- sohbet ---- */

export type ChatMember = { userId: string; role: string; fullName: string; email: string };

export type Conversation = {
  id: string;
  type: 'dm' | 'group';
  title: string | null;
  avatarFileId: string | null;
  onlyAdminsCanPost: boolean;
  myRole: string;
  members: ChatMember[];
  unreadCount: number;
  lastMessage: { preview: string; senderId: string; createdAt: string } | null;
  lastActivityAt: string;
};

export type ChatMessage = {
  id: string;
  body: string | null;
  senderId: string;
  senderName: string;
  createdAt: string;
  editedAt: string | null;
  kind: 'text' | 'system' | string;
  location: { latitude: string; longitude: string; label: string | null } | null;
  attachments: { id: string; fileName: string; sizeBytes: number | null; url?: string | null }[];
  reactions: { emoji: string; count: number; mine: boolean }[];
  replyTo: { id: string; senderName: string; preview: string } | null;
  refCard: unknown | null;
};

export const chat = {
  conversations: () => request<Conversation[]>('/chat/conversations'),
  /** Sunucu en eskiden en yeniye sıralı döndürür; `before` ile geçmişe gidilir. */
  messages: (id: string, query?: { before?: string; limit?: number; search?: string }) =>
    request<{ messages: ChatMessage[]; hasMore: boolean }>(`/chat/conversations/${id}/messages`, { query }),
  send: (id: string, body: SendMessageInput) =>
    request<ChatMessage>(`/chat/conversations/${id}/messages`, { method: 'POST', body }),
  markRead: (id: string) => request<{ ok: true }>(`/chat/conversations/${id}/read`, { method: 'POST' }),
  directory: () => request<{ id: string; fullName: string; email: string }[]>('/chat/directory'),
  startDm: (userId: string) => request<Conversation>('/chat/conversations/dm', { method: 'POST', body: { userId } }),
  createGroup: (body: CreateGroupInput) =>
    request<Conversation>('/chat/conversations/group', { method: 'POST', body }),
  editMessage: (messageId: string, body: string) =>
    request<ChatMessage>(`/chat/messages/${messageId}`, { method: 'PATCH', body: { body } }),
  toggleReaction: (messageId: string, emoji: string) =>
    request<{ messageId: string; reactions: ChatMessage['reactions'] }>(`/chat/messages/${messageId}/reactions`, {
      method: 'POST',
      body: { emoji },
    }),
  deleteMessage: (messageId: string) =>
    request<{ ok: true }>(`/chat/messages/${messageId}`, { method: 'DELETE' }),
};

/* ------------------------------------------------------------ dosyalar ---- */

export type SignedUploadResponse = {
  fileId: string;
  bucket: string;
  objectKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
};

export const files = {
  signedUpload: (body: SignedUploadUrlInput) =>
    request<SignedUploadResponse>('/files/signed-upload-url', { method: 'POST', body }),
  signedDownload: (fileId: string) =>
    request<{ downloadUrl: string; filename: string; mimeType: string }>('/files/signed-download-url', {
      method: 'POST',
      body: { fileId },
    }),
  link: (body: FileLinkInput) => request<{ id: string }>('/files/link', { method: 'POST', body }),
  remove: (fileId: string) => request<void>(`/files/${fileId}`, { method: 'DELETE' }),
};

/* ------------------------------------------------------------ kontaklar ---- */

export type ContactListItem = {
  id: string;
  externalContactNo: string | null;
  fullName: string;
  title: string | null;
  department: string | null;
  workPhone: string | null;
  mobilePhone: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  notes: string | null;
  isPrimary: boolean;
  isBlacklisted: boolean;
  createdAt: string;
  companyId: string | null;
  company: { id: string; legalTitle: string; shortName: string | null; city: string | null } | null;
  decisionRole: { code: string; name: string } | null;
  companyLinks: { id: string; legalTitle: string; city: string | null; isPrimary: boolean }[];
};

export type ContactListQuery = {
  search?: string;
  companyId?: string;
  department?: string;
  isPrimary?: boolean;
  isBlacklisted?: boolean;
  sortBy?: 'name' | 'createdAt';
  sortDir?: 'asc' | 'desc';
};

export type ContactSummary = {
  total: number;
  primary: number;
  blacklisted: number;
  firmCount: number;
  departments: string[];
};

/**
 * DİKKAT: `GET /contacts/:id` de firma gibi ham satır döner (`decisionRoleId`
 * çözülmemiş) — `contacts.service.ts` `get()` yalnızca `db.query.contacts.findFirst`
 * kullanıyor, `list()`'teki decisionRoles join'i yok. Ad `lookups.get('decision-roles')`
 * ile ayrıca çözülür. Kişisel alanlar (hometown/favoriteTeam/...) ham kolon, gerçek.
 */
export type ContactDetail = Omit<ContactListItem, 'decisionRole'> & {
  decisionRoleId: string | null;
  phoneExtension: string | null;
  otherPhone: string | null;
  otherEmail: string | null;
  gender: string | null;
  birthDate: string | null;
  hometown: string | null;
  favoriteTeam: string | null;
  favoriteColor: string | null;
  graduatedSchool: string | null;
  blacklistReason: string | null;
  createdByUser: { id: string; fullName: string; email: string } | null;
};

export const contacts = {
  list: (query: ContactListQuery & { page: number; pageSize: number }) =>
    request<Paginated<ContactListItem>>('/contacts', { query }),
  get: (id: string) => request<ContactDetail>(`/contacts/${id}`),
  summary: () => request<ContactSummary>('/contacts/summary'),
  create: (body: ContactCreateInput) => request<ContactDetail>('/contacts', { method: 'POST', body }),
  update: (id: string, body: ContactUpdateInput) =>
    request<ContactDetail>(`/contacts/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ ok: true }>(`/contacts/${id}`, { method: 'DELETE' }),
};

/* -------------------------------------------------------------- fırsat ---- */

/** packages/shared QUALIFICATION_STAGES ile aynı sıra: pano kolonları. */
export const QUALIFICATION_STAGES = ['lead', 'c', 'b', 'a', 'a_plus', 'win', 'lost'] as const;
export type QualificationStage = (typeof QUALIFICATION_STAGES)[number];

export const qualificationStageLabels: Record<QualificationStage, string> = {
  lead: 'Lead',
  c: 'C',
  b: 'B',
  a: 'A',
  a_plus: 'A+',
  win: 'WIN',
  lost: 'LOST',
};

export type OpportunityListItem = {
  id: string;
  title: string;
  description: string | null;
  companyId: string | null;
  qualificationStage: string | null;
  leadTemperature: string | null;
  leadFollowUpStatus: string | null;
  leadCity: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  leadCompanyTitle: string | null;
  leadContactName: string | null;
  /** Para alanı sunucuda `::text`; sayıya çevirmek gösterim anında yapılır. */
  estimatedValue: string | null;
  probability: number;
  expectedCloseDate: string | null;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
  primaryContact: { id: string; fullName: string } | null;
  stage: { id: string; code: string; name: string } | null;
  currency: { id: string; code: string } | null;
  source: { id: string; code: string; name: string } | null;
  /** "İstenen makine" — liste/pano kartındaki ürün adı (web SalesCaseDetail "Talep edilen makine"). */
  requestedMachine: string | null;
  /** Yalnızca LOST'ta dolu. Liste VE detay uçlarında var. */
  lostReason: { id: string; code: string; name: string } | null;
  lostCompetitor: { id: string; name: string } | null;
  lostCompetitorProductModel: string | null;
  lostProductName: string | null;
  lostUnmetConditions: string | null;
  /** Yalnızca WIN'de dolu. */
  wonReason: string | null;
  /** Liste VE detay uçlarında var (opportunities.service.ts `list()`/`get()`); risk rozeti + kontrol listesi bundan besleniyor. */
  qualificationReadiness: QualificationReadiness;
};

export type OpportunityListQuery = {
  search?: string;
  stageCode?: string;
  qualificationStage?: QualificationStage;
  lifecycle?: 'lead' | 'opportunity';
  companyId?: string;
  view?: 'active' | 'closed' | 'all';
};

/**
 * Satış derecesine göre değişen kontrol listesi maddesi
 * (opportunities.service.ts `qualificationReadiness()`). Liste VE detay
 * uçlarının ikisinde de var — pano/liste kartındaki risk rozeti ve detaydaki
 * "Fırsat Kontrol Listesi" aynı alandan beslenir.
 * `manualEditable`: yalnızca A+ alanındaki adımlarda true döner (sunucu kuralı);
 * bunlar `PATCH /opportunities/:id/process-checks/:key` ile elle işaretlenebilir.
 */
export type QualificationCheck = {
  key: string;
  label: string;
  complete: boolean;
  manualEditable?: boolean;
  note?: string | null;
};

export type QualificationHealth = {
  /** Aşamada izin verilen süreyi aşmış, kapanmamış kart ("çürüyen kart"). */
  rotting: boolean;
  leadSlaBreached: boolean;
  /** Takip tarihi geçmiş açık kart. */
  actionOverdue: boolean;
  /** Hiç takip tarihi planlanmamış açık kart. */
  actionMissing: boolean;
};

export type QualificationReadiness = {
  stage: QualificationStage;
  nextStage: QualificationStage | null;
  ready: boolean;
  blockers: string[];
  checks: QualificationCheck[];
  health: QualificationHealth;
};

/** opportunities.service.ts `processCheckDefinitions()` — sabit adım listesi, `key` ile aranır. */
export type ProcessReadinessCheck = { key: string; label: string; complete: boolean; actionKey: string };
export type ProcessReadiness = { checks: ProcessReadinessCheck[] };

/**
 * `GET /opportunities/:id` listedekinin üstüne şunları ekler: açıklama/ürün/ödeme
 * alanları ham kolon, `qualificationReadiness`/`processReadiness` server-hesaplı.
 * Kalan alanlar (history, approvals, auditHistory...) bu ekranlarda kullanılmıyor;
 * `Record<string, unknown>` ile erişilebilir kalıyor.
 */
export type OpportunityDetail = OpportunityListItem &
  Record<string, unknown> & {
    paymentMethod: string | null;
    nextAction: string | null;
    nextActionAt: string | null;
    closedAt: string | null;
    processReadiness: ProcessReadiness;
    /** opportunities.service.ts `list()`/`get()` onay haritası (tur başına durum). */
    approvals?: OpportunityApprovals;
  };

export type OpportunityAssignee = { id: string; fullName: string; email: string };

/**
 * Sunucudaki `opportunityQualificationChangeSchema` ile birebir (packages/shared).
 * DİKKAT: gövde anahtarı `toStage` — `qualificationStage` gönderen eski istemci
 * doğrulama hatasıyla düşüyordu.
 */
export type OpportunityQualificationChangeInput = {
  toStage: QualificationStage;
  note?: string;
  cancellationReasonCode?: string;
  lostCompetitorId?: string;
  /** Rakip kaydı yoksa serbest metin; sunucu ikisinden birini kabul eder. */
  lostCompetitorName?: string;
  lostCompetitorProductModel?: string;
  lostProductName?: string;
  lostUnmetConditions?: string;
};

/** opportunities.controller.ts `@Patch(':id/process-checks/:key')`. */
export type OpportunityProcessCheckInput = {
  status: 'done' | 'not_done' | null;
  note?: string | null;
};

export const OPPORTUNITY_APPROVAL_TYPES = ['payment', 'customs', 'invoice', 'installation', 'win'] as const;
export type OpportunityApprovalType = (typeof OPPORTUNITY_APPROVAL_TYPES)[number];

export const opportunityApprovalTypeLabels: Record<OpportunityApprovalType, string> = {
  payment: 'Ödeme Onayı',
  customs: 'Gümrük Onayı',
  invoice: 'Fatura Onayı',
  installation: 'Kurulum Onayı',
  win: 'Kazanım Onayı',
};

export type OpportunityApprovals = Partial<Record<OpportunityApprovalType, 'pending' | 'approved' | 'rejected'>>;

export const opportunities = {
  list: (query: OpportunityListQuery & { page: number; pageSize: number }) =>
    request<Paginated<OpportunityListItem>>('/opportunities', { query }),
  get: (id: string) => request<OpportunityDetail>(`/opportunities/${id}`),
  /** packages/shared opportunityCreateSchema alan kümesi (formda kullanılan alt küme). */
  create: (
    body: {
      title: string;
      companyId?: string | null;
      primaryContactId?: string | null;
      ownerUserId?: string | null;
      description?: string;
      leadContactName?: string;
      leadCompanyTitle?: string;
      leadPhone?: string;
      leadCity?: string;
      estimatedValue?: number | string;
      currencyCode?: string;
      probability?: number;
      expectedCloseDate?: string;
      requestedMachine?: string;
      nextAction?: string;
      nextActionAt?: string;
      sourceCode?: string;
    },
  ) => request<OpportunityDetail>('/opportunities', { method: 'POST', body }),
  update: (
    id: string,
    body: Partial<{
      title: string;
      description: string;
      estimatedValue: number | string;
      currencyCode: string;
      probability: number;
      expectedCloseDate: string;
      requestedMachine: string;
      nextAction: string;
      nextActionAt: string;
      wonReason: string;
      paymentTermDays: number;
      contractTerms: string;
      paymentTerms: string;
      ownerUserId: string | null;
      primaryContactId: string | null;
    }>,
  ) => request<OpportunityDetail>(`/opportunities/${id}`, { method: 'PATCH', body }),
  /** Lead kartını gerçek fırsata dönüştürür. */
  convert: (id: string, body: { note?: string } = {}) =>
    request<OpportunityDetail>(`/opportunities/${id}/convert`, { method: 'POST', body }),
  setQualificationStage: (id: string, body: OpportunityQualificationChangeInput) =>
    request<OpportunityListItem>(`/opportunities/${id}/qualification-stage`, {
      method: 'PATCH',
      body,
    }),
  setProcessCheck: (id: string, key: string, body: OpportunityProcessCheckInput) =>
    request<OpportunityDetail>(`/opportunities/${id}/process-checks/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body,
    }),
  decideApproval: (id: string, type: OpportunityApprovalType, body: { decision: 'approved' | 'rejected'; note?: string }) =>
    request<OpportunityDetail>(`/opportunities/${id}/approvals/${type}`, { method: 'POST', body }),
  close: (id: string, reason?: string) =>
    request<{ ok: true }>(`/opportunities/${id}/close`, { method: 'POST', body: reason ? { reason } : {} }),
  reopen: (id: string) => request<{ ok: true }>(`/opportunities/${id}/reopen`, { method: 'POST', body: {} }),
  /** "Sorumlu" adını göstermek için: liste/pano `ownerUserId` (UUID) döner, adı değil. */
  assignees: () => request<OpportunityAssignee[]>('/opportunities/assignees'),
};

/* ------------------------------------------------------------- teklif ---- */

export type QuoteListItem = {
  id: string;
  documentNo: string;
  revisionNo: number;
  quoteDate: string;
  validityDays: number;
  businessLine: string | null;
  opportunityId: string | null;
  subtotal: string;
  vatAmount: string;
  grandTotal: string;
  notes: string | null;
  priceApprovalStatus: string;
  sentAt: string | null;
  followUpAt: string | null;
  createdAt: string;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
  contact: { id: string; fullName: string } | null;
  status: { id: string; code: string; name: string } | null;
  currency: { id: string; code: string } | null;
  /** Kalemlerden türetilir; listede ürün adını göstermek için. */
  productName: string | null;
};

export type QuoteListQuery = {
  search?: string;
  statusCode?: string;
  companyId?: string;
  businessLine?: 'CNC' | 'UNI' | 'SACISLE';
  from?: string;
  to?: string;
};

export type QuoteSummary = {
  totalCount: number;
  byCurrency: {
    currencyCode: string;
    months: { month: string; count: number; total: string }[];
  }[];
};

export type QuoteItem = {
  id: string;
  stockCode: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  lineTotal: string;
  sortOrder: number;
};

/**
 * DİKKAT: `GET /quotes/:id` listedeki gibi join'li DEĞİL — ham tablo satırı +
 * kalemler döner. Firma adı ve durum adı ayrı çağrılardan (companies.get,
 * lookups) çözülür.
 */
export type QuoteDetail = Omit<QuoteListItem, 'company' | 'contact' | 'status' | 'currency' | 'productName'> & {
  companyId: string;
  contactId: string | null;
  statusId: string | null;
  currencyId: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  warrantyTerms: string | null;
  discountTotal: string;
  headerDiscountAmount: string;
  vatRate: string;
  items: QuoteItem[];
  projectOwner: { id: string; fullName: string } | null;
};

/**
 * Sunucudaki `quoteStatusChangeSchema` ile birebir. DİKKAT: sunucu
 * `cancelled` dışındaki tüm iş akışı durumlarında `followUpAt` zorunlu tutar
 * (hatırlatma takvimi/activity bu tarihten üretilir) — arayüz bunu dayatır.
 */
export const QUOTE_WORKFLOW_STATUSES = ['price_waiting', 'budget_waiting', 'on_hold', 'postponed', 'cancelled'] as const;
export type QuoteWorkflowStatus = (typeof QUOTE_WORKFLOW_STATUSES)[number];

export type QuoteWorkflowInput = {
  statusCode: QuoteWorkflowStatus;
  followUpAt?: string | null;
  note?: string | null;
};

export const quotes = {
  list: (query: QuoteListQuery & { page: number; pageSize: number }) =>
    request<Paginated<QuoteListItem>>('/quotes', { query }),
  summary: (query: QuoteListQuery = {}) => request<QuoteSummary>('/quotes/summary', { query }),
  get: (id: string) => request<QuoteDetail>(`/quotes/${id}`),
  /** "Gönderildi İşaretle" — taslağı sent durumuna alır, müşteriye e-posta gitmez. */
  send: (id: string) => request<QuoteDetail>(`/quotes/${id}/send`, { method: 'POST', body: {} }),
  approve: (id: string) => request<QuoteDetail>(`/quotes/${id}/approve`, { method: 'POST', body: {} }),
  reject: (id: string) => request<QuoteDetail>(`/quotes/${id}/reject`, { method: 'POST', body: {} }),
  changeWorkflowStatus: (id: string, body: QuoteWorkflowInput) =>
    request<QuoteDetail>(`/quotes/${id}/status`, { method: 'POST', body }),
  priceApproval: (id: string, decision: 'approved' | 'rejected', note?: string) =>
    request<QuoteDetail>(`/quotes/${id}/price-approval/${decision}`, {
      method: 'POST',
      body: note ? { note } : {},
    }),
};

/* ---------------------------------------------------------- aktiviteler ---- */

export type ActivityListItem = {
  id: string;
  subject: string;
  description: string | null;
  /** 'manual' | 'system' — sistemin ürettiği kayıtlar listede ayrı gösterilir. */
  origin: string;
  activityDate: string;
  nextFollowUpAt: string | null;
  result: string | null;
  companyId: string | null;
  opportunityId: string | null;
  contactId: string | null;
  type: { id: string; code: string; name: string } | null;
  createdByUser: { id: string; fullName: string; email: string } | null;
  files: ActivityFile[];
};

export type ActivityFile = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  documentType: { id: string; code: string; name: string } | null;
};

export const activities = {
  list: (query: { page: number; pageSize: number; companyId?: string; opportunityId?: string; contactId?: string }) =>
    request<Paginated<ActivityListItem>>('/activities', { query }),
  get: (id: string) => request<ActivityListItem>(`/activities/${id}`),
  create: (body: ActivityCreateInput) => request<{ id: string }>('/activities', { method: 'POST', body }),
  update: (id: string, body: ActivityUpdateInput) => request<{ id: string }>(`/activities/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ ok: true }>(`/activities/${id}`, { method: 'DELETE' }),
};

/* ------------------------------------------------------------- lookups ---- */

export type LookupItem = { id: string; code: string; name: string; sortOrder?: number };

export const lookups = {
  /** Örn. `quote-statuses`, `pipeline-stages`. Filtre listeleri buradan gelir. */
  get: (name: string) => request<LookupItem[]>(`/lookups/${name}`),
};

/* ---------------------------------------------------------- servis ---- */

export type WarrantyPartInput = {
  description: string;
  quantity: number;
  actionType?: string;
  source?: string;
  productModelId?: string;
  inventoryItemId?: string;
  supplierRmaStatus?: string | null;
  chargeToCustomer?: boolean;
  unitCost?: string | number | null;
  currency?: string;
  notes?: string | null;
};

/** GET /service-tickets/:id/warranty yanıtı (warrantyResponse). */
export type WarrantyClaim = {
  id: string;
  serviceTicketId: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'rma_in_progress' | 'closed';
  failureCategory: string | null;
  technicianAssessment: string | null;
  rmaNo: string | null;
  supplierName: string | null;
  supplierRmaStatus: string | null;
  costAmount: string | null;
  costCurrency: string | null;
  customerChargeAmount: string | null;
  customerChargeCurrency: string | null;
  parts: {
    id: string;
    description: string;
    quantity: number | string;
    actionType: string | null;
    supplierRmaStatus: string | null;
    chargeToCustomer: boolean | null;
    unitCost: string | null;
    currency: string | null;
  }[];
};

export type ServiceTicket = {
  id: string;
  ticketNo: string;
  businessLine: string | null;
  companyId: string;
  contactId: string | null;
  customerDeviceId: string | null;
  subject: string;
  description: string | null;
  severity: 'low' | 'normal' | 'high' | 'critical' | string;
  ticketType: string;
  source: string;
  assignedToUserId: string | null;
  reportedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  /** Serbest JSON (operations/noteHistory/completionForm...); şema garantisi yok, ekranda savunmacı okunur. */
  metadata: Record<string, unknown> | null;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
  contact: { id: string; fullName: string } | null;
  status: { id: string; code: string; name: string } | null;
  warrantyClaim: { id: string; status: string; rmaNo: string | null } | null;
  sourceComplaint: {
    id: string;
    complaintNo: string;
    source: string;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
  } | null;
};

export type ServiceTicketListQuery = {
  search?: string;
  phase?: 'open' | 'ongoing' | 'done';
  severity?: 'low' | 'normal' | 'high' | 'critical';
  sortDir?: 'asc' | 'desc';
};

export type ServiceTicketSummary = {
  total: number;
  open: number;
  urgent: number;
  openPhase: number;
  inProgressPhase: number;
  waitingCustomerPhase: number;
  donePhase: number;
};

export type ServiceComplaint = {
  id: string;
  complaintNo: string;
  companyId: string | null;
  customerDeviceId: string | null;
  serviceTicketId: string | null;
  source: string;
  status: 'new' | 'reviewing' | 'converted' | 'rejected' | string;
  subject: string;
  description: string | null;
  severity: string;
  ticketType: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  rejectionNote: string | null;
  createdAt: string;
  updatedAt: string;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
  machine: {
    id: string;
    serialNumber: string | null;
    brand: string | null;
    model: string | null;
    warrantyStartDate: string | null;
    warrantyEndDate: string | null;
  } | null;
  warrantyStatusSuggestion: 'in_warranty' | 'out_of_warranty' | 'unknown' | string;
  attachments: {
    id: string;
    fileId: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    documentTypeCode: string | null;
    documentTypeName: string | null;
    description: string | null;
    createdAt: string | null;
  }[];
  serviceTicket: { id: string; ticketNo: string; subject: string } | null;
  link: { id: string; title: string | null; slug: string } | null;
};

export type Installation = {
  id: string;
  opportunityId?: string | null;
  quoteId?: string | null;
  customerDeviceId?: string | null;
  contactId?: string | null;
  assignedToUserId?: string | null;
  statusId?: string | null;
  companyId: string | null;
  scheduledDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  location: string | null;
  locationType?: string | null;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt?: string;
  formData?: Record<string, unknown> | null;
  status: { id: string; code: string; name: string } | null;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
  contact: { id: string; fullName: string } | null;
  assignedTo: { id: string; fullName: string } | null;
  customerDevice: {
    id: string;
    serialNumber: string | null;
    controlUnit?: string | null;
    controlUnitSerialNumber?: string | null;
    model: string | null;
    productModelName: string | null;
    brandName?: string | null;
    productTypeName?: string | null;
    technicalSpecs?: { key: string; value: string; unit?: string | null }[];
  } | null;
};

export type Shipment = {
  id: string;
  shipmentNo: string | null;
  companyId: string | null;
  direction: string;
  transportMode: string | null;
  carrier: string | null;
  trackingNo: string | null;
  origin: string | null;
  destination: string | null;
  loadingDate: string | null;
  eta: string | null;
  shippedAt: string | null;
  arrivedAt: string | null;
  notes: string | null;
  createdAt: string;
  status: { id: string; code: string; name: string } | null;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
  senderCompany: { id: string; legalTitle: string } | null;
  carrierCompany: { id: string; legalTitle: string } | null;
  destinationWarehouse: { id: string; name: string; type: string | null } | null;
  items: { id: string; description: string | null; quantity: string | null }[];
};

export type MaintenancePlan = {
  id: string;
  customerDeviceId: string;
  companyId: string;
  title: string;
  intervalDays: number;
  lastServiceDate: string | null;
  nextDueDate: string;
  reminderLeadDays: number;
  autoCreateTicket: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
  company: { id: string; legalTitle: string; shortName: string | null; name?: string } | null;
  machine?: { serialNumber: string | null; model: string | null; brand: string | null };
};

export type CustomerDevice = {
  id: string;
  companyId: string;
  inventoryItemId?: string | null;
  opportunityId?: string | null;
  quoteId?: string | null;
  productModelId?: string | null;
  saleDate: string | null;
  installationDate: string | null;
  deliveryDate: string | null;
  warrantyStartDate: string | null;
  warrantyEndDate: string | null;
  notes: string | null;
  createdAt: string;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
  serialNumber: string | null;
  controlUnit: string | null;
  controlUnitSerialNumber?: string | null;
  model: string | null;
  productModelName: string | null;
  brandName: string | null;
  productTypeName: string | null;
  cashPrice?: string | null;
  currencyCode?: string | null;
  technicalSpecs?: { key: string; value: string; unit?: string | null }[];
};

export const service = {
  tickets: (query: ServiceTicketListQuery & { page: number; pageSize: number }) =>
    request<Paginated<ServiceTicket>>('/service-tickets', { query }),
  ticketSummary: (query: Omit<ServiceTicketListQuery, 'sortDir'> = {}) =>
    request<ServiceTicketSummary>('/service-tickets/summary', { query }),
  ticket: (id: string) => request<ServiceTicket>(`/service-tickets/${id}`),
  /** service.controller.ts `ticketCreate` alan kümesi. */
  createTicket: (
    body: {
      companyId: string;
      contactId?: string;
      customerDeviceId?: string;
      subject: string;
      description?: string;
      severity?: 'low' | 'normal' | 'high' | 'critical';
      ticketType?: 'complaint' | 'request' | 'warranty_claim' | 'question';
      source?: 'manual' | 'phone' | 'email' | 'whatsapp' | 'portal' | 'web' | 'qr';
      assignedToUserId?: string | null;
    },
  ) => request<ServiceTicket>('/service-tickets', { method: 'POST', body }),
  updateTicket: (
    id: string,
    body: {
      description?: string;
      resolutionNote?: string;
      severity?: 'low' | 'normal' | 'high' | 'critical';
      ticketType?: 'complaint' | 'request' | 'warranty_claim' | 'question';
      assignedToUserId?: string | null;
    },
  ) => request<ServiceTicket>(`/service-tickets/${id}`, { method: 'PATCH', body }),
  setTicketStatus: (id: string, statusCode: string) =>
    request<ServiceTicket>(`/service-tickets/${id}/status`, { method: 'PATCH', body: { statusCode } }),
  warranty: (id: string) => request<WarrantyClaim>(`/service-tickets/${id}/warranty`),
  updateWarrantyAssessment: (
    id: string,
    body: {
      failureCategory?: string | null;
      technicianAssessment?: string | null;
      rmaNo?: string | null;
      supplierName?: string | null;
      supplierRmaStatus?: string | null;
      costAmount?: string | number | null;
      costCurrency?: string;
      customerChargeAmount?: string | number | null;
      customerChargeCurrency?: string;
      status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'rma_in_progress' | 'closed';
    },
  ) => request<WarrantyClaim>(`/service-tickets/${id}/warranty`, { method: 'PUT', body }),
  setWarrantyParts: (id: string, parts: WarrantyPartInput[]) =>
    request<WarrantyClaim>(`/service-tickets/${id}/warranty/parts`, { method: 'PUT', body: { parts } }),
  submitWarranty: (id: string, note?: string) =>
    request<WarrantyClaim>(`/service-tickets/${id}/warranty/submit`, { method: 'POST', body: note ? { note } : {} }),
  decideWarranty: (id: string, decision: 'approved' | 'rejected', decisionNote?: string) =>
    request<WarrantyClaim>(`/service-tickets/${id}/warranty/${decision}`, {
      method: 'POST',
      body: decisionNote ? { decisionNote } : {},
    }),
  complaints: (query: { page: number; pageSize: number; search?: string; status?: string; source?: string; companyId?: string }) =>
    request<Paginated<ServiceComplaint>>('/service-complaints', { query }),
  complaint: (id: string) => request<ServiceComplaint>(`/service-complaints/${id}`),
  updateComplaint: (id: string, body: ServiceComplaintUpdateInput) =>
    request<ServiceComplaint>(`/service-complaints/${id}`, { method: 'PATCH', body }),
  convertComplaint: (id: string, body: ServiceComplaintConvertInput = {}) =>
    request<ServiceComplaint>(`/service-complaints/${id}/convert`, { method: 'POST', body }),
  rejectComplaint: (id: string, body: ServiceComplaintRejectInput) =>
    request<ServiceComplaint>(`/service-complaints/${id}/reject`, { method: 'POST', body }),
  installations: (query: { page: number; pageSize: number; search?: string; phase?: 'planned' | 'ongoing' | 'done' }) =>
    request<Paginated<Installation>>('/installations', { query }),
  installation: (id: string) => request<Installation>(`/installations/${id}`),
  setInstallationStatus: (
    id: string,
    body: { statusCode: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'; installationDate?: string; formData?: Record<string, unknown> },
  ) => request<{ id: string }>(`/installations/${id}/status`, { method: 'PATCH', body }),
  shipments: (query: { page: number; pageSize: number; phase?: 'active' | 'arrived' }) =>
    request<Paginated<Shipment>>('/shipments', { query }),
  shipment: (id: string) => request<Shipment>(`/shipments/${id}`),
  /** Hazırlıktaki sevkiyati yola çıkarır; loadingDate yoksa sunucu bugünü kullanır. */
  startShipment: (id: string, loadingDate?: string) =>
    request<Shipment>(`/shipments/${id}/start`, { method: 'POST', body: loadingDate ? { loadingDate } : {} }),
  updateShipmentStatus: (
    id: string,
    body: {
      statusCode: 'preparing' | 'in_transit' | 'at_customs' | 'cleared' | 'delivered';
      destinationWarehouseId?: string;
      loadingDate?: string;
      arrivedAt?: string;
    },
  ) => request<Shipment>(`/shipments/${id}/status`, { method: 'PATCH', body }),
  maintenancePlans: (query: { page: number; pageSize: number; companyId?: string; customerDeviceId?: string; dueSoon?: boolean }) =>
    request<Paginated<MaintenancePlan>>('/maintenance-plans', { query }),
  maintenancePlan: (id: string) => request<MaintenancePlan>(`/maintenance-plans/${id}`),
  createMaintenancePlan: (
    body: {
      customerDeviceId: string;
      title?: string;
      intervalDays?: number;
      nextDueDate?: string;
      reminderLeadDays?: number;
      autoCreateTicket?: boolean;
      notes?: string | null;
    },
  ) => request<MaintenancePlan>('/maintenance-plans', { method: 'POST', body }),
  updateMaintenancePlan: (
    id: string,
    body: {
      title?: string;
      intervalDays?: number;
      nextDueDate?: string;
      reminderLeadDays?: number;
      autoCreateTicket?: boolean;
      isActive?: boolean;
      notes?: string | null;
    },
  ) => request<MaintenancePlan>(`/maintenance-plans/${id}`, { method: 'PATCH', body }),
  completeMaintenancePlan: (id: string, servicedAt?: string) =>
    request<MaintenancePlan>(`/maintenance-plans/${id}/complete`, { method: 'POST', body: servicedAt ? { servicedAt } : {} }),
};

export const devices = {
  list: (query: {
    page: number;
    pageSize: number;
    companyId?: string;
    search?: string;
    preset?: 'warranty' | 'expired';
  }) =>
    request<Paginated<CustomerDevice>>('/customer-devices', { query }),
  get: (id: string) => request<CustomerDevice>(`/customer-devices/${id}`),
  /** Makineyi başka firmaya ata (web MachinesPage "Firma Değiştir"). */
  updateDevice: (
    id: string,
    body: {
      companyId?: string;
      warrantyStartDate?: string | null;
      warrantyEndDate?: string | null;
      installationDate?: string | null;
      notes?: string | null;
    },
  ) => request<CustomerDevice>(`/customer-devices/${id}`, { method: 'PATCH', body }),
  removeDevice: (id: string) => request<{ ok: true }>(`/customer-devices/${id}`, { method: 'DELETE' }),
};

/* --------------------------------------------------------------- stok ---- */

export type InventoryItem = {
  id: string;
  serialNumber: string;
  /** 'new' | 'used' | 'demo' — web'de "Kondisyon" kolonu. */
  itemCondition: string;
  controlUnit: string | null;
  controlUnitSerialNumber: string | null;
  loadingDate: string | null;
  receivedDate: string | null;
  arrivalDate: string | null;
  reservedAt: string | null;
  notes: string | null;
  createdAt: string;
  product: { id: string; modelCode: string; fullName: string; stockCode: string | null } | null;
  brand: { id: string; name: string } | null;
  category: { id: string; code: string; name: string } | null;
  status: { id: string; code: string; name: string } | null;
  locationStatus: { id: string; code: string; name: string } | null;
  warehouse: { id: string; name: string } | null;
  reservedCompany: { id: string; legalTitle: string; shortName: string | null } | null;
};

export type Warehouse = { id: string; name: string; type: string | null };

export const inventoryApi = {
  list: (query: { page: number; pageSize: number; search?: string; statusCode?: string; categoryCode?: string }) =>
    request<Paginated<InventoryItem>>('/inventory', { query }),
  get: (id: string) => request<InventoryItem>(`/inventory/${id}`),
  bySerial: (serial: string) => request<InventoryItem>(`/inventory/serial/${encodeURIComponent(serial)}`),
  warehouses: () => request<Warehouse[]>('/warehouses'),
  /** Firmaya rezerve et — web StockPage "Rezerve Et" ile aynı uç. */
  reserve: (
    id: string,
    body: { companyId: string; divisionId?: string; opportunityId?: string; quoteId?: string; notes?: string },
  ) => request<InventoryItem>(`/inventory/${id}/reserve`, { method: 'PATCH', body }),
  /** Serbest bırakma dahil durum değişikliği (stockStatusCode). */
  update: (id: string, body: { stockStatusCode?: string; locationStatusCode?: string; notes?: string }) =>
    request<InventoryItem>(`/inventory/${id}`, { method: 'PATCH', body }),
};

/* --------------------------------------------------------------- ürün ---- */

export type ProductModel = {
  id: string;
  modelCode: string;
  modelName: string | null;
  fullName: string;
  series: string | null;
  stockCode: string | null;
  imageUrl: string | null;
  listPrice: string | null;
  cashPrice: string | null;
  vatRate: string | null;
  originCountry: string | null;
  productionYear: number | null;
  /** Gümrük tarife istatistik pozisyonu — web kartında "GTIP". */
  hsCode: string | null;
  description: string | null;
  isActive: boolean;
  brand: { id: string; name: string } | null;
  currency: { id: string; code: string } | null;
  productGroup: { id: string; code: string; name: string } | null;
  category: { id: string; code: string; name: string } | null;
  subcategory: { id: string; code: string; name: string } | null;
  productType: { id: string; code: string; name: string } | null;
  specs?: { key: string; value: string; unit?: string | null }[];
};

export type PriceList = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  currency: { id: string; code: string; name: string } | null;
};

export type PriceListItem = {
  item: {
    id: string;
    listPrice: string | null;
    cashPrice: string | null;
    campaignPrice: string | null;
    campaignIsActive: boolean;
    vatRate: string | null;
    updatedAt?: string | null;
  };
  product: { id: string; modelCode: string; fullName: string } | null;
};

export const productsApi = {
  list: (query: { page: number; pageSize: number; search?: string; brandId?: string; categoryCode?: string }) =>
    request<Paginated<ProductModel>>('/products', { query }),
  get: (id: string) => request<ProductModel>(`/products/${id}`),
  update: (id: string, body: ProductUpdateInput) =>
    request<ProductModel>(`/products/${id}`, { method: 'PATCH', body }),
  priceLists: (query: { page: number; pageSize: number }) => request<Paginated<PriceList>>('/price-lists', { query }),
  priceListItems: (id: string) => request<PriceListItem[]>(`/price-lists/${id}/items`),
  /** Kampanya/liste/nakit fiyat güncelleme (web PriceLists ile aynı uç). */
  updatePriceListItem: (
    listId: string,
    itemId: string,
    body: {
      listPrice?: number | string | null;
      cashPrice?: number | string | null;
      campaignPrice?: number | string | null;
      campaignIsActive?: boolean;
      campaignValidFrom?: string;
      campaignValidUntil?: string;
      notes?: string;
    },
  ) => request<{ id: string }>(`/price-lists/${listId}/items/${itemId}`, { method: 'PATCH', body }),
};

/* ------------------------------------------------------------ sipariş ---- */

type OrderBase = {
  id: string;
  orderNo: string;
  orderDate: string;
  subtotal: string;
  discountTotal: string;
  vatAmount: string;
  grandTotal: string;
  notes: string | null;
  createdAt: string;
  status: { id: string; code: string; name: string } | null;
  currency: { id: string; code: string } | null;
};

export type SalesOrder = OrderBase & {
  companyId: string;
  quoteId: string | null;
  opportunityId: string | null;
  confirmedAt: string | null;
  reservedAt: string | null;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
};

export type PurchaseOrder = OrderBase & {
  supplierCompanyId: string | null;
  purchaseType: string;
  paymentType: string;
  paymentTermDays: number | null;
  invoiceNo: string | null;
  expectedDate: string | null;
  /** Liste servisi bu join'i `supplier` adıyla döndürür. */
  supplier: { id: string; legalTitle: string; shortName: string | null } | null;
};

export type OrderItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  vatAmount: string;
  lineTotal: string;
  sortOrder: number;
  productModelId: string | null;
  unitId?: string | null;
  listPrice?: string | null;
  approvedPrice?: string | null;
  inventoryItemId?: string | null;
  expectedDate?: string | null;
};

export type SalesOrderDetail = Omit<SalesOrder, 'company' | 'status' | 'currency'> & {
  statusId: string | null;
  currencyId: string | null;
  contactId: string | null;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  items: OrderItem[];
};

export type PurchaseOrderDetail = Omit<PurchaseOrder, 'supplier' | 'status' | 'currency'> & {
  statusId: string | null;
  currencyId: string | null;
  sentAt: string | null;
  approvedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  approvalReason: string | null;
  previousPaymentTermDays: number | null;
  termChangeReason: string | null;
  incoterm: string | null;
  shipmentReference: string | null;
  items: OrderItem[];
};

export const orders = {
  sales: (query: { page: number; pageSize: number; search?: string; statusCode?: string; companyId?: string }) =>
    request<Paginated<SalesOrder>>('/sales-orders', { query }),
  /** Onaylı tekliften sipariş üretir (web OffersPage "Sipariş Oluştur"). */
  createFromQuote: (
    quoteId: string,
    body: { orderDate?: string; orderNo?: string; copyItems?: boolean; reserveStock?: boolean; notes?: string } = {},
  ) => request<SalesOrder>(`/sales-orders/from-quote/${quoteId}`, { method: 'POST', body }),
  purchases: (query: {
    page: number;
    pageSize: number;
    search?: string;
    statusCode?: string;
    supplierCompanyId?: string;
  }) => request<Paginated<PurchaseOrder>>('/purchase-orders', { query }),
  salesGet: (id: string) => request<SalesOrderDetail>(`/sales-orders/${id}`),
  // Durum endpoint'leri güncel kaydı değil yalnız `{ ok: true }` döndürür;
  // detay sorgusu mutasyon sonrası yeniden çekilmelidir.
  salesApprove: (id: string) => request<{ ok: true }>(`/sales-orders/${id}/approve`, { method: 'POST' }),
  salesReserve: (id: string) => request<{ ok: true }>(`/sales-orders/${id}/reserve`, { method: 'POST' }),
  salesStatus: (id: string, statusCode: string) =>
    request<{ ok: true }>(`/sales-orders/${id}/status`, { method: 'PATCH', body: { statusCode } }),
  purchaseGet: (id: string) => request<PurchaseOrderDetail>(`/purchase-orders/${id}`),
  purchaseSend: (id: string) => request<{ ok: true }>(`/purchase-orders/${id}/send`, { method: 'POST' }),
  purchaseApprove: (id: string) => request<{ ok: true }>(`/purchase-orders/${id}/approve`, { method: 'POST' }),
  purchaseStatus: (id: string, statusCode: string) =>
    request<{ ok: true }>(`/purchase-orders/${id}/status`, { method: 'PATCH', body: { statusCode } }),
};

/* ------------------------------------------------------------- finans ---- */

export type Receivable2 = {
  id: string;
  companyId: string;
  quoteId?: string | null;
  accountingInvoiceId?: string | null;
  invoiceNo: string | null;
  movementType: string;
  paymentMethod: string | null;
  documentRef: string | null;
  amount: string;
  dueDate: string;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
  company: { id: string; legalTitle: string; shortName: string | null; externalCompanyNo: string | null };
  status: { id: string; code: string; name: string } | null;
  currency: { id: string; code: string } | null;
};

export type Payment = {
  id: string;
  companyId: string;
  receivableId?: string | null;
  payableId?: string | null;
  accountingInvoiceId?: string | null;
  invoiceNo: string | null;
  /** 'in' tahsilat, 'out' ödeme. */
  direction: 'in' | 'out' | string;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
  status: { id: string; code: string; name: string } | null;
  currency: { id: string; code: string } | null;
};

export type PaymentSummary = {
  total: number;
  byCurrency: Array<{ currencyCode: string; incoming: number; outgoing: number; net: number }>;
};

export type ReceivableSummary = {
  total: number;
  openCount: number;
  overdueCount: number;
  byCurrency: Array<{ currencyCode: string; openAmount: number; overdueAmount: number }>;
};

export type AccountingInvoice = {
  id: string;
  companyId: string;
  type: 'sales' | 'purchase' | string;
  invoiceCategory: string;
  invoiceNo: string;
  invoiceDate: string;
  amount: string;
  vatAmount: string;
  grandTotal: string;
  firstDueDate: string | null;
  lastDueDate: string | null;
  installmentCount: number;
  paymentType: string;
  statusId?: string | null;
  fileId?: string | null;
  notes?: string | null;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
  currency: { code: string } | null;
};

export type AccountingInvoiceInstallment = {
  id: string;
  installmentNo: number;
  dueDate: string;
  amount: string;
  statusId: string | null;
  receivableId: string | null;
  payableId: string | null;
};

export type AccountingInvoiceLine = {
  id: string;
  productModelId: string | null;
  inventoryItemId: string | null;
  categoryCode: string | null;
  description: string | null;
  quantity: string;
  listPrice: string | null;
  unitPrice: string | null;
  discountAmount: string;
  vatRate: string;
  lineTotal: string | null;
  expectedDate: string | null;
};

export type AccountingInvoiceDetail = Omit<AccountingInvoice, 'company'> & {
  divisionId: string | null;
  currencyId: string | null;
  quoteId: string | null;
  salesOrderId: string | null;
  paymentTermDays: number | null;
  previousPaymentTermDays: number | null;
  termChangeReason: string | null;
  incoterm: string | null;
  shipmentReference: string | null;
  orderNo: string | null;
  expectedDate: string | null;
  statusId: string | null;
  fileId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  company: {
    id: string;
    legalTitle: string;
    shortName: string | null;
    taxOffice: string | null;
    taxNumber: string | null;
  } | null;
  installments: AccountingInvoiceInstallment[];
  lineItems: AccountingInvoiceLine[];
};

export type CustomerBalance = {
  companyId: string;
  companyName: string;
  currencies: CompanyFinanceCurrencyBalance[];
  salesTotal: number;
  collections: number;
  borc: number;
  purchases: number | null;
  payouts: number | null;
  alacak: number | null;
  netBorc: number;
  totalBalance: number;
  primaryCurrency: string | null;
  aging: CustomerBalanceAging;
  nearestDueDate: string | null;
  nearestDueAmount: number | null;
  nearestDueCurrency: string | null;
  nearestDueType: string | null;
};

/** finance.service.ts `AGING_BUCKETS`: vadesi henüz gelmemiş + gecikme aralıkları, tutar bazlı. */
export type AgingBucketCode = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export type CustomerBalanceCurrencyAging = {
  currencyCode: string;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  overdueTotal: number;
  openTotal: number;
  maxOverdueDays: number;
  oldestOverdueDate: string | null;
};

export type CustomerBalanceAging = {
  byCurrency: CustomerBalanceCurrencyAging[];
  /** Tutarı sıfırdan büyük olan en kötü kova — "Riskli" filtresi bunu kullanır. */
  worstBucket: AgingBucketCode;
  maxOverdueDays: number;
  oldestOverdueDate: string | null;
  overdueTotal: { currencyCode: string; amount: number }[];
};

export type DueDateItem = {
  id: string;
  companyId: string;
  companyName: string | null;
  dueDate: string;
  amount: number;
  currencyCode: string;
  invoiceNo: string | null;
  /** 'borc' müşteriden alacak, 'alacak' tedarikçiye borç. */
  type: 'borc' | 'alacak';
};

/** Firma kartı "Finansal Özet" 4 kutusu. finance.service.ts `getCompanyFinanceSummary()`. */
export type CompanyFinanceCurrencyBalance = {
  currencyCode: string;
  salesTotal: number;
  collections: number;
  purchases: number;
  payouts: number;
  borc: number;
  alacak: number;
  net: number;
  totalBalance: number;
};

export type CompanyFinanceSummary = {
  byCurrency: CompanyFinanceCurrencyBalance[];
  aging: CustomerBalanceAging;
  nearestDueDate: string | null;
  nearestDueAmount: number | null;
  nearestDueCurrency: string | null;
  nearestDueType: 'borc' | 'alacak' | null;
};

export const finance = {
  receivables: (query: { page: number; pageSize: number; companyId?: string }) =>
    request<Paginated<Receivable2>>('/receivables', { query }),
  receivable: (id: string) => request<Receivable2>(`/receivables/${id}`),
  /** Web CreatePaymentPlanDialog'un tek taksit karşılığı. */
  createReceivable: (
    body: {
      companyId: string;
      amount: number | string;
      currencyCode?: string;
      dueDate: string;
      invoiceNo?: string;
      paymentMethod?: string;
      documentRef?: string;
      notes?: string;
    },
  ) => request<{ id: string }>('/receivables', { method: 'POST', body }),
  updateReceivableStatus: (id: string, status: string) =>
    request<{ id: string }>(`/receivables/${id}/status`, { method: 'PATCH', body: { status } }),
  receivableSummary: (query: { companyId?: string } = {}) =>
    request<ReceivableSummary>('/receivables/summary', { query }),
  payments: (query: { page: number; pageSize: number; companyId?: string; direction?: 'in' | 'out' }) =>
    request<Paginated<Payment>>('/payments', { query }),
  payment: (id: string) => request<Payment>(`/payments/${id}`),
  createPayment: (body: PaymentCreateInput) => request<{ id: string }>('/payments', { method: 'POST', body }),
  updatePaymentStatus: (id: string, status: string) =>
    request<{ id: string }>(`/payments/${id}/status`, { method: 'PATCH', body: { status } }),
  paymentSummary: (query: { companyId?: string } = {}) =>
    request<PaymentSummary>('/payments/summary', { query }),
  invoices: (query: { page: number; pageSize: number; type?: 'sales' | 'purchase'; companyId?: string }) =>
    request<{ data: AccountingInvoice[]; page: number; pageSize: number; total: number }>(
      '/accounting-invoices',
      { query }
    ),
  invoice: (id: string) => request<AccountingInvoiceDetail>(`/accounting-invoices/${id}`),
  cancelInvoice: (id: string) =>
    request<{ ok: true }>(`/accounting-invoices/${id}/cancel`, { method: 'PATCH', body: {} }),
  customerBalances: () => request<CustomerBalance[]>('/reports/customer-balances'),
  dueDates: (query?: { from?: string; to?: string }) => request<DueDateItem[]>('/reports/due-dates', { query }),
  /** Firma Detayı → Genel: Toplam Ciro / Toplam Alacak / Vade Geçmiş Alacak. */
  companySummary: (companyId: string) =>
    request<CompanyFinanceSummary>(`/companies/${companyId}/finance-summary`),
};

/* ------------------------------------------------------------ takvim ---- */

export type CalendarEvent = {
  id: string;
  eventType: string;
  source: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  companyId: string | null;
  opportunityId: string | null;
  /** Dolu ise görev kapanmış demektir. */
  completedAt: string | null;
  owner: { id: string; fullName: string; email: string } | null;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
};

export const calendar = {
  /** `from`/`to` zorunlu (ISO). Sunucu aralık dışını döndürmez. */
  events: (query: { from: string; to: string; ownerUserId?: string }) =>
    request<CalendarEvent[]>('/calendar/events', { query }),
  owners: () => request<{ id: string; fullName: string; email: string }[]>('/calendar/owners'),
  create: (body: CalendarEventInput) => request<CalendarEvent>('/calendar/events', { method: 'POST', body }),
  update: (id: string, body: CalendarEventPatch) =>
    request<CalendarEvent>(`/calendar/events/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ ok: true }>(`/calendar/events/${id}`, { method: 'DELETE' }),
};

/** packages/shared calendarEventCreateSchema ile birebir alan kümesi. */
export type CalendarEventInput = {
  eventType: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  timezone?: string;
  companyId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
};

export type CalendarEventPatch = Partial<CalendarEventInput> & { completedAt?: string | null };

/* -------------------------------------------------------------- görevler ---- */

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskView = 'all' | 'mine' | 'today' | 'overdue' | 'upcoming' | 'completed';

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedToUserId: string | null;
  dueAt: string | null;
  remindBeforeMinutes: number | null;
  companyId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  quoteId: string | null;
  serviceTicketId: string | null;
  completedAt: string | null;
  createdAt: string;
  /** Sunucu hesaplar: son tarihi geçmiş ve hâlâ açık. */
  overdue: boolean;
  assignee: { id: string; fullName: string; email: string } | null;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
  contact: { id: string; fullName: string } | null;
  opportunity: { id: string; title: string } | null;
  quote: { id: string; documentNo: string } | null;
  serviceTicket: { id: string; ticketNo: string; subject: string } | null;
};

export type TaskDetail = Task & {
  events: Array<{
    id: string;
    eventType: string;
    summary: string;
    createdAt: string;
    actor: { id: string; fullName: string } | null;
  }>;
};

export type TaskCounts = Record<TaskView, number>;

export type TaskInput = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedToUserId?: string | null;
  dueAt?: string | null;
  remindBeforeMinutes?: number | null;
  companyId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  quoteId?: string | null;
  serviceTicketId?: string | null;
};

export const tasks = {
  list: (query: { view?: TaskView; search?: string; companyId?: string; opportunityId?: string; pageSize?: number }) =>
    request<{ data: Task[]; meta: { total: number } }>('/tasks', { query }),
  counts: () => request<TaskCounts>('/tasks/counts'),
  assignees: () => request<{ id: string; fullName: string; email: string }[]>('/tasks/assignees'),
  get: (id: string) => request<TaskDetail>(`/tasks/${id}`),
  create: (body: TaskInput) => request<TaskDetail>('/tasks', { method: 'POST', body }),
  update: (id: string, body: Partial<TaskInput>) => request<TaskDetail>(`/tasks/${id}`, { method: 'PATCH', body }),
};

/* ----------------------------------------------------------- raporlar ---- */

export type StockSummaryRow = { status: string | null; statusName: string | null; count: number };

export const reportsExtra = {
  stockSummary: () => request<StockSummaryRow[]>('/reports/stock-summary'),
};

/* ------------------------------------------------------ ticari belge ---- */

/**
 * Proforma / sözleşme / ticari fatura ortak alanları. Firma ve durum join'leri
 * `?` ile isteğe bağlı: bu üç uç yalnızca sayfalama alıyor ve sunucu sürümüne
 * göre join'li ya da ham satır dönebiliyor. Join yoksa arayüz
 * `companyNameText`e düşer, ekran boş kalmaz.
 */
type CommercialDocBase = {
  id: string;
  businessLine: string | null;
  quoteId: string | null;
  companyId: string | null;
  companyNameText: string | null;
  finalizedAt: string | null;
  createdAt: string;
  company?: { id: string; legalTitle: string; shortName: string | null } | null;
  status?: { id: string; code: string; name: string } | null;
  currency?: { id: string; code: string } | null;
};

export type Proforma = CommercialDocBase & { documentNo: string; issueDate: string };
export type Contract = CommercialDocBase & {
  contractNo: string;
  signedDate: string | null;
  paymentTermDays: number | null;
};
export type CommercialInvoice = Omit<CommercialDocBase, 'companyId' | 'companyNameText'> & {
  invoiceNo: string;
  invoiceDate: string;
  companyId?: string | null;
  companyNameText?: string | null;
};

export type ProformaDetail = Proforma & {
  divisionId: string | null;
  currencyId: string | null;
  statusId: string | null;
  fileId: string | null;
  signatureId: string | null;
  documentSnapshot: Record<string, unknown> | null;
  terms: Record<string, unknown> | null;
};

export type ContractDetail = Contract & {
  divisionId: string | null;
  currencyId: string | null;
  statusId: string | null;
  fileId: string | null;
  signatureId: string | null;
  documentSnapshot: Record<string, unknown> | null;
  terms: Record<string, unknown> | null;
};

export type CommercialInvoiceDetail = CommercialInvoice & {
  divisionId: string | null;
  quoteId: string;
  statusId: string | null;
  fileId: string | null;
  documentSnapshot: Record<string, unknown> | null;
};

export type CommercialDocumentDetail = ProformaDetail | ContractDetail | CommercialInvoiceDetail;

export type CommercialDocumentListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  companyId?: string;
  quoteId?: string;
};

export const commercialDocs = {
  proformas: (query: CommercialDocumentListQuery) => request<Paginated<Proforma>>('/proformas', { query }),
  contracts: (query: CommercialDocumentListQuery) => request<Paginated<Contract>>('/contracts', { query }),
  invoices: (query: CommercialDocumentListQuery) =>
    request<Paginated<CommercialInvoice>>('/commercial-invoices', { query }),
  getProforma: (id: string) => request<ProformaDetail>(`/proformas/${id}`),
  getContract: (id: string) => request<ContractDetail>(`/contracts/${id}`),
  getInvoice: (id: string) => request<CommercialInvoiceDetail>(`/commercial-invoices/${id}`),
};
