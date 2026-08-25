import { ApiError, api } from "./apiClient";

export type MetaPlatform = "facebook" | "instagram" | "messenger" | "whatsapp";
export type MetaConnectionStatus = "active" | "disabled" | "error";
export type MetaLeadStatus = "new" | "assigned" | "contacted" | "qualified" | "converted" | "rejected";
export type MetaCampaignStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";

export interface MetaConnection {
  id: string;
  name: string;
  status: MetaConnectionStatus;
  businessId?: string | null;
  datasetId?: string | null;
  pageId?: string | null;
  instagramAccountId?: string | null;
  adAccountId?: string | null;
  whatsappBusinessAccountId?: string | null;
  phoneNumberId?: string | null;
  permissions?: string[];
  tokenExpiresAt?: string | null;
  lastVerifiedAt?: string | null;
  lastWebhookAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MetaOverview {
  period: { from: string; to: string };
  summary: {
    spendMinor: number;
    currency: string;
    impressions: number;
    clicks: number;
    leads: number;
    qualifiedLeads: number;
    conversions: number;
    costPerLeadMinor: number;
    qualificationRate: number;
    conversionRate: number;
    firstResponseMinutes?: number | null;
  };
  connectionHealth: Array<{
    connectionId: string;
    name: string;
    status: MetaConnectionStatus;
    lastSyncAt?: string | null;
    lastError?: string | null;
  }>;
  recentLeads: MetaLead[];
}

export interface MetaLead {
  id: string;
  opportunityId?: string | null;
  externalLeadId: string;
  platform: MetaPlatform;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  status: MetaLeadStatus;
  campaignId?: string | null;
  campaignName?: string | null;
  adId?: string | null;
  adName?: string | null;
  formId?: string | null;
  formName?: string | null;
  ownerName?: string | null;
  createdAt: string;
  firstContactAt?: string | null;
}

export interface MetaInsightPoint {
  date: string;
  campaignId?: string | null;
  campaignName?: string | null;
  spendMinor: number;
  currency: string;
  impressions: number;
  clicks: number;
  leads: number;
  qualifiedLeads?: number;
  conversions?: number;
}

export interface MetaCampaign {
  id: string;
  connectionId: string;
  name: string;
  objective?: string | null;
  status: MetaCampaignStatus;
  effectiveStatus?: string | null;
  dailyBudgetMinor?: number | null;
  lifetimeBudgetMinor?: number | null;
  spendMinor?: number;
  currency: string;
  impressions?: number;
  clicks?: number;
  leads?: number;
  qualifiedLeads?: number;
  conversions?: number;
  updatedAt?: string | null;
}

export interface MetaConversation {
  id: string;
  connectionId: string;
  platform: MetaPlatform;
  participantName: string;
  participantHandle?: string | null;
  preview?: string | null;
  unreadCount: number;
  assignedUserName?: string | null;
  lastMessageAt: string;
  canReply: boolean;
  replyWindowEndsAt?: string | null;
}

export interface MetaMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  status?: "queued" | "sent" | "delivered" | "read" | "failed";
  createdAt: string;
  senderName?: string | null;
}

export interface MetaComment {
  id: string;
  connectionId: string;
  platform: "facebook" | "instagram";
  authorName: string;
  authorHandle?: string | null;
  message: string;
  postName?: string | null;
  isHidden: boolean;
  canReply: boolean;
  createdAt: string;
  replies?: Array<{ id: string; message: string; createdAt: string }>;
}

export interface MetaFormMapping {
  id: string;
  connectionId: string;
  formId: string;
  formName: string;
  isActive: boolean;
  divisionId?: string | null;
  ownerUserId?: string | null;
  fieldMappings: Record<string, string>;
  lastLeadAt?: string | null;
  updatedAt?: string | null;
}

export interface MetaConversionEvent {
  id: string;
  opportunityId: string;
  eventName: string;
  status: "pending" | "sent" | "failed" | "discarded";
  valueMinor?: number | null;
  currency?: string | null;
  occurredAt: string;
  sentAt?: string | null;
  retryCount?: number;
  lastError?: string | null;
}

export interface MetaAudience {
  id: string;
  connectionId: string;
  name: string;
  description?: string | null;
  subtype?: string | null;
  approximateCount?: number | null;
  syncStatus?: "idle" | "syncing" | "ready" | "failed";
  lastSyncAt?: string | null;
  lastError?: string | null;
}

export interface MetaCatalog {
  id: string;
  connectionId: string;
  name: string;
  vertical?: string | null;
  productCount?: number;
  syncStatus?: "idle" | "syncing" | "ready" | "failed";
  lastSyncAt?: string | null;
  lastError?: string | null;
}

export interface MetaPageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

type ListEnvelope<T> =
  | T[]
  | {
      items?: T[];
      data?: T[];
      total?: number;
      page?: number;
      pageSize?: number;
      meta?: { total?: number; page?: number; pageSize?: number; hasNext?: boolean };
    };

export interface MetaListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  platform?: string;
  connectionId?: string;
  campaignId?: string;
  from?: string;
  to?: string;
}

const META_PATHS = {
  overview: "/meta/overview",
  connections: "/meta/connections",
  formMappings: "/meta/form-mappings",
  leads: "/meta/leads",
  insights: "/meta/insights",
  conversations: "/meta/conversations",
  comments: "/meta/comments",
  campaigns: "/meta/campaigns",
  audiences: "/meta/audiences",
  catalogs: "/meta/catalogs",
  conversionEvents: "/meta/conversion-events",
  processJobs: "/meta/jobs/process",
} as const;

type RawMetaConnection = Omit<MetaConnection, "status"> & { status: string };
type RawMetaFormMapping = Omit<MetaFormMapping, "isActive" | "fieldMappings"> & {
  isActive?: boolean;
  enabled?: boolean;
  fieldMappings?: Record<string, string>;
  fieldMap?: Record<string, string>;
};

function queryString(params?: object): string {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]: [string, unknown]) => {
    if ((typeof value === "string" || typeof value === "number" || typeof value === "boolean") && value !== "") search.set(key, String(value));
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

function normalizePage<T>(response: ListEnvelope<T>, requestedPage = 1, requestedPageSize = 25): MetaPageResult<T> {
  if (Array.isArray(response)) {
    const hasNext = response.length >= requestedPageSize;
    return {
      items: response,
      total: (requestedPage - 1) * requestedPageSize + response.length + (hasNext ? 1 : 0),
      page: requestedPage,
      pageSize: requestedPageSize,
      hasNext,
    };
  }
  const items = response.items ?? response.data ?? [];
  const page = response.meta?.page ?? response.page ?? requestedPage;
  const pageSize = response.meta?.pageSize ?? response.pageSize ?? requestedPageSize;
  const total = response.meta?.total ?? response.total ?? items.length;
  return {
    items,
    total,
    page,
    pageSize,
    hasNext: response.meta?.hasNext ?? page * pageSize < total,
  };
}

function slicePage<T>(items: T[], requestedPage = 1, requestedPageSize = 25): MetaPageResult<T> {
  const start = (requestedPage - 1) * requestedPageSize;
  return {
    items: items.slice(start, start + requestedPageSize),
    total: items.length,
    page: requestedPage,
    pageSize: requestedPageSize,
    hasNext: start + requestedPageSize < items.length,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeLeadStatus(raw: Record<string, unknown>): MetaLeadStatus {
  const qualification = String(raw.qualificationStage ?? "").toLowerCase();
  const followUp = String(raw.leadFollowUpStatus ?? "").toLowerCase();
  if (["win", "won", "converted"].includes(qualification)) return "converted";
  if (["lost", "rejected", "disqualified"].includes(qualification) || followUp === "disqualified") return "rejected";
  if (["a", "a+", "qualified"].includes(qualification)) return "qualified";
  if (raw.firstContactAt || followUp === "contacted") return "contacted";
  if (raw.ownerUserId) return "assigned";
  return "new";
}

function normalizeLead(raw: Record<string, unknown>): MetaLead {
  const metadata = asRecord(raw.externalMetadata);
  return {
    id: String(raw.id ?? raw.externalKey ?? ""),
    opportunityId: asString(raw.id),
    externalLeadId: String(raw.externalKey ?? raw.id ?? ""),
    platform: String(metadata.platform ?? metadata.source ?? "facebook") as MetaPlatform,
    fullName: String(raw.leadContactName ?? raw.title ?? "İsimsiz lead"),
    email: asString(raw.leadEmail),
    phone: asString(raw.leadPhone),
    city: asString(raw.leadCity),
    status: normalizeLeadStatus(raw),
    campaignId: asString(metadata.campaignId),
    campaignName: asString(metadata.campaignName),
    adId: asString(metadata.adId),
    adName: asString(metadata.adName),
    formId: asString(metadata.formId),
    formName: asString(metadata.formName),
    ownerName: asString(metadata.ownerName),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    firstContactAt: asString(raw.firstContactAt),
  };
}

function normalizeCampaign(raw: Record<string, unknown>, connectionId: string): MetaCampaign {
  return {
    id: String(raw.id ?? ""),
    connectionId,
    name: String(raw.name ?? "İsimsiz kampanya"),
    objective: asString(raw.objective),
    status: String(raw.status ?? "PAUSED") as MetaCampaignStatus,
    effectiveStatus: asString(raw.effective_status ?? raw.effectiveStatus),
    dailyBudgetMinor: raw.daily_budget == null && raw.dailyBudgetMinor == null ? null : Number(raw.daily_budget ?? raw.dailyBudgetMinor),
    lifetimeBudgetMinor: raw.lifetime_budget == null && raw.lifetimeBudgetMinor == null ? null : Number(raw.lifetime_budget ?? raw.lifetimeBudgetMinor),
    spendMinor: Number(raw.spendMinor ?? 0),
    currency: String(raw.currency ?? "TRY"),
    impressions: Number(raw.impressions ?? 0),
    clicks: Number(raw.clicks ?? 0),
    leads: Number(raw.leads ?? 0),
    qualifiedLeads: Number(raw.qualifiedLeads ?? 0),
    conversions: Number(raw.conversions ?? 0),
    updatedAt: asString(raw.updated_time ?? raw.updatedAt),
  };
}

function normalizeConnectionStatus(status: string): MetaConnectionStatus {
  if (status === "active") return "active";
  if (status === "error" || status === "degraded" || status === "expired") return "error";
  return "disabled";
}

function normalizeConnection(connection: RawMetaConnection): MetaConnection {
  return { ...connection, status: normalizeConnectionStatus(connection.status) };
}

function normalizeMapping(mapping: RawMetaFormMapping): MetaFormMapping {
  return {
    ...mapping,
    isActive: mapping.isActive ?? mapping.enabled ?? true,
    fieldMappings: mapping.fieldMappings ?? mapping.fieldMap ?? {},
  };
}

export const metaQueryKeys = {
  root: ["meta"] as const,
  overview: (params: { from?: string; to?: string; connectionId?: string }) => ["meta", "overview", params] as const,
  connections: ["meta", "connections"] as const,
  leads: (params: MetaListParams) => ["meta", "leads", params] as const,
  insights: (params: MetaListParams) => ["meta", "insights", params] as const,
  campaigns: (params: MetaListParams) => ["meta", "campaigns", params] as const,
  conversations: (params: MetaListParams) => ["meta", "conversations", params] as const,
  messages: (conversationId: string, connectionId?: string) => ["meta", "conversations", connectionId, conversationId, "messages"] as const,
  comments: (params: MetaListParams) => ["meta", "comments", params] as const,
  mappings: ["meta", "form-mappings"] as const,
  conversions: (params: MetaListParams) => ["meta", "conversion-events", params] as const,
  audiences: (params: MetaListParams) => ["meta", "audiences", params] as const,
  catalogs: (params: MetaListParams) => ["meta", "catalogs", params] as const,
};

export const metaService = {
  overview: async (params: { from?: string; to?: string; connectionId?: string } = {}): Promise<MetaOverview> => {
    const [rawSummary, rawConnections, rawLeads] = await Promise.all([
      api.get<{ connections?: number; leads?: number; pendingConversions?: number; totalSpend?: number }>(`${META_PATHS.overview}${queryString(params)}`),
      api.get<RawMetaConnection[]>(META_PATHS.connections),
      api.get<ListEnvelope<Record<string, unknown>>>(`${META_PATHS.leads}${queryString({ page: 1, pageSize: 5, connectionId: params.connectionId })}`),
    ]);
    const leadPage = normalizePage(rawLeads, 1, 5);
    return {
      period: { from: params.from ?? "", to: params.to ?? "" },
      summary: {
        spendMinor: Math.round(Number(rawSummary.totalSpend ?? 0) * 100),
        currency: "TRY",
        impressions: 0,
        clicks: 0,
        leads: Number(rawSummary.leads ?? leadPage.total),
        qualifiedLeads: 0,
        conversions: 0,
        costPerLeadMinor: 0,
        qualificationRate: 0,
        conversionRate: 0,
        firstResponseMinutes: null,
      },
      connectionHealth: rawConnections.map((item) => ({
        connectionId: item.id,
        name: item.name,
        status: normalizeConnectionStatus(item.status),
        lastSyncAt: item.lastSyncAt,
        lastError: item.lastError,
      })),
      recentLeads: leadPage.items.map(normalizeLead),
    };
  },
  connections: async () => (await api.get<RawMetaConnection[]>(META_PATHS.connections)).map(normalizeConnection),
  startOAuth: () => api.post<{ authorizationUrl: string }>(`${META_PATHS.connections}/oauth/start`, {}),
  createConnection: (body: {
    name: string;
    accessToken: string;
    businessId?: string;
    pageId?: string;
    adAccountId?: string;
    instagramAccountId?: string;
    whatsappBusinessAccountId?: string;
    datasetId?: string;
    phoneNumberId?: string;
    permissions?: string[];
  }) => api.post<MetaConnection>(META_PATHS.connections, body),
  updateConnection: (id: string, body: Partial<Pick<MetaConnection, "name" | "status">>) =>
    api.patch<MetaConnection>(`${META_PATHS.connections}/${id}`, body),
  verifyConnection: (id: string) =>
    api.post<{ ok: true; remote: { id: string; name?: string } }>(`${META_PATHS.connections}/${id}/verify`, {}),
  disconnectConnection: (id: string) =>
    api.patch<MetaConnection>(`${META_PATHS.connections}/${id}`, { status: "disabled" }),
  deleteConnection: (id: string) => api.delete<MetaConnection>(`${META_PATHS.connections}/${id}`),

  leads: async (params: MetaListParams) => {
    const response = await api.get<ListEnvelope<Record<string, unknown>>>(`${META_PATHS.leads}${queryString(params)}`);
    const page = normalizePage(response, params.page, params.pageSize);
    return { ...page, items: page.items.map(normalizeLead) };
  },
  insights: async (params: MetaListParams) => {
    const response = await api.get<Array<Record<string, unknown>>>(`${META_PATHS.insights}${queryString(params)}`);
    const items: MetaInsightPoint[] = response.map((raw) => ({
      date: String(raw.insightDate ?? raw.date ?? ""),
      campaignId: asString(raw.campaignId),
      campaignName: asString(raw.campaignName),
      spendMinor: Math.round(Number(raw.spend ?? 0) * 100),
      currency: String(asRecord(raw.rawMetrics).account_currency ?? "TRY"),
      impressions: Number(raw.impressions ?? 0),
      clicks: Number(raw.clicks ?? 0),
      leads: Number(raw.leads ?? 0),
    }));
    return normalizePage(items, params.page, params.pageSize);
  },
  campaigns: async (params: MetaListParams) => {
    if (!params.connectionId) return normalizePage<MetaCampaign>([], params.page, params.pageSize);
    const response = await api.get<{ data?: Array<Record<string, unknown>> }>(`${META_PATHS.campaigns}${queryString({ connectionId: params.connectionId })}`);
    return slicePage((response.data ?? []).map((item) => normalizeCampaign(item, params.connectionId!)), params.page, params.pageSize);
  },
  createCampaign: (body: {
    connectionId: string;
    name: string;
    objective: string;
    status: "PAUSED";
    dailyBudgetMinor: number;
  }) => api.post<{ id: string }>(META_PATHS.campaigns, {
    connectionId: body.connectionId,
    name: body.name,
    objective: body.objective,
    status: "PAUSED",
  }).then(async (created) => {
    await api.patch(`${META_PATHS.campaigns}/${created.id}`, {
      connectionId: body.connectionId,
      dailyBudgetMinor: body.dailyBudgetMinor,
      confirmation: "META_CAMPAIGN_CHANGE",
    });
    return normalizeCampaign({ ...created, ...body }, body.connectionId);
  }),
  updateCampaign: (id: string, body: { connectionId: string; status?: MetaCampaignStatus; dailyBudgetMinor?: number }) =>
    api.patch<MetaCampaign>(`${META_PATHS.campaigns}/${id}`, {
      ...body,
      ...((body.status === "ACTIVE" || body.dailyBudgetMinor !== undefined) ? { confirmation: "META_CAMPAIGN_CHANGE" } : {}),
    }),

  conversations: async (params: MetaListParams) => {
    const response = await api.get<Array<Record<string, unknown>>>(`${META_PATHS.conversations}${queryString(params)}`);
    const items: MetaConversation[] = response.map((raw) => ({
      id: String(raw.conversationExternalId ?? ""),
      connectionId: String(raw.connectionId ?? params.connectionId ?? ""),
      platform: String(raw.channel ?? "messenger") as MetaPlatform,
      participantName: String(raw.conversationExternalId ?? "Meta kullanıcısı"),
      participantHandle: null,
      preview: `${Number(raw.messageCount ?? 0)} mesaj`,
      unreadCount: 0,
      assignedUserName: null,
      lastMessageAt: String(raw.lastMessageAt ?? new Date().toISOString()),
      canReply: true,
    }));
    return normalizePage(items, params.page, params.pageSize);
  },
  messages: async (conversationId: string, params: { connectionId: string }) => {
    const response = await api.get<Array<Record<string, unknown>>>(`${META_PATHS.conversations}/${conversationId}/messages${queryString({ ...params, page: 1, pageSize: 100 })}`);
    return response.map((raw): MetaMessage => ({
      id: String(raw.id ?? raw.remoteId ?? ""),
      direction: String(raw.direction ?? "inbound") as "inbound" | "outbound",
      body: String(raw.text ?? ""),
      status: String(raw.status ?? "sent") as MetaMessage["status"],
      createdAt: String(raw.sentAt ?? raw.createdAt ?? new Date().toISOString()),
    })).reverse();
  },
  sendMessage: (conversation: Pick<MetaConversation, "id" | "connectionId" | "platform">, body: { message: string }) =>
    api.post<MetaMessage>(`${META_PATHS.conversations}/${conversation.id}/messages`, { connectionId: conversation.connectionId, channel: conversation.platform, text: body.message }),
  comments: async (params: MetaListParams) => {
    if (!params.connectionId) return normalizePage<MetaComment>([], params.page, params.pageSize);
    const response = await api.get<{ data?: Array<Record<string, unknown>> }>(`${META_PATHS.comments}${queryString({ connectionId: params.connectionId })}`);
    const items = (response.data ?? []).flatMap((media): MetaComment[] => {
      const comments = asRecord(media.comments).data;
      if (!Array.isArray(comments)) return [];
      return comments.map((value): MetaComment => {
        const raw = asRecord(value);
        const from = asRecord(raw.from);
        return {
          id: String(raw.id ?? ""),
          connectionId: params.connectionId!,
          platform: raw.username ? "instagram" : "facebook",
          authorName: String(raw.username ?? from.name ?? "Meta kullanıcısı"),
          authorHandle: asString(raw.username),
          message: String(raw.text ?? raw.message ?? ""),
          postName: asString(media.caption),
          isHidden: Boolean(raw.hidden),
          canReply: true,
          createdAt: String(raw.timestamp ?? raw.created_time ?? new Date().toISOString()),
        };
      });
    });
    return slicePage(items, params.page, params.pageSize);
  },
  replyToComment: (commentId: string, body: { connectionId: string; message: string }) =>
    api.post<{ id: string; message: string; createdAt: string }>(`${META_PATHS.comments}/${commentId}/replies`, body),
  updateComment: (commentId: string, body: { connectionId: string; isHidden: boolean }) =>
    api.patch<MetaComment>(`${META_PATHS.comments}/${commentId}`, { connectionId: body.connectionId, hidden: body.isHidden }),

  formMappings: async () => (await api.get<RawMetaFormMapping[]>(META_PATHS.formMappings)).map(normalizeMapping),
  createFormMapping: (body: Omit<MetaFormMapping, "id" | "lastLeadAt" | "updatedAt">) =>
    api.post<MetaFormMapping>(META_PATHS.formMappings, body),
  updateFormMapping: (id: string, body: Partial<Omit<MetaFormMapping, "id">>) =>
    api.patch<MetaFormMapping>(`${META_PATHS.formMappings}/${id}`, body),
  conversionEvents: async (params: MetaListParams) => {
    const response = await api.get<Array<Record<string, unknown>>>(`${META_PATHS.conversionEvents}${queryString(params)}`);
    const items = response.map((raw): MetaConversionEvent => {
      const customData = asRecord(asRecord(raw.payload).custom_data);
      const value = Number(customData.value);
      return {
        id: String(raw.id ?? ""),
        opportunityId: String(raw.opportunityId ?? ""),
        eventName: String(raw.eventName ?? ""),
        status: String(raw.status ?? "pending") as MetaConversionEvent["status"],
        valueMinor: Number.isFinite(value) ? Math.round(value * 100) : null,
        currency: asString(customData.currency),
        occurredAt: String(raw.occurredAt ?? raw.createdAt ?? new Date().toISOString()),
        sentAt: asString(raw.sentAt),
        retryCount: Number(raw.attemptCount ?? 0),
        lastError: asString(raw.lastError),
      };
    });
    return normalizePage(items, params.page, params.pageSize);
  },
  createConversionEvent: (body: {
    connectionId: string;
    opportunityId: string;
    eventName: string;
    occurredAt: string;
    value?: number;
    currency?: string;
    eventId: string;
  }) => api.post<MetaConversionEvent>(META_PATHS.conversionEvents, { ...body, userData: {} }),
  processJobs: () => api.post<{ processed: number; failed: number }>(META_PATHS.processJobs, {}),

  audiences: async (params: MetaListParams) => {
    const response = await api.get<Array<Record<string, unknown>>>(META_PATHS.audiences);
    const items: MetaAudience[] = response.map((raw) => ({
      id: String(raw.id ?? ""),
      connectionId: String(raw.connectionId ?? ""),
      name: String(raw.name ?? "İsimsiz kitle"),
      description: asString(raw.description),
      subtype: asString(raw.customerFileSource),
      approximateCount: null,
      syncStatus: String(raw.status ?? "idle") as MetaAudience["syncStatus"],
      lastSyncAt: asString(raw.updatedAt),
    }));
    return slicePage(items, params.page, params.pageSize);
  },
  createAudience: (body: { connectionId: string; name: string; description?: string }) =>
    api.post<MetaAudience>(META_PATHS.audiences, body),
  syncAudienceMembers: (id: string, body: { connectionId: string; opportunityIds: string[]; legalBasisConfirmed: true }) =>
    api.post<{ accepted: number }>(`${META_PATHS.audiences}/${id}/members`, body),
  removeAudienceMembers: (id: string, body: { connectionId: string; opportunityIds: string[] }) =>
    api.post<{ accepted: number }>(`${META_PATHS.audiences}/${id}/member-removals`, { ...body, confirmation: "DELETE" }),
  deleteAudience: (id: string, connectionId: string) => api.delete<{ ok: true }>(`${META_PATHS.audiences}/${id}${queryString({ connectionId, confirmation: "DELETE" })}`),

  catalogs: async (params: MetaListParams) => {
    const response = await api.get<Array<Record<string, unknown>>>(META_PATHS.catalogs);
    const items: MetaCatalog[] = response.map((raw) => ({
      id: String(raw.id ?? ""),
      connectionId: String(raw.connectionId ?? ""),
      name: String(raw.name ?? "İsimsiz katalog"),
      vertical: asString(raw.vertical),
      productCount: Number(raw.productCount ?? 0),
      syncStatus: String(raw.status ?? "idle") as MetaCatalog["syncStatus"],
      lastSyncAt: asString(raw.updatedAt),
    }));
    return slicePage(items, params.page, params.pageSize);
  },
  createCatalog: (body: { connectionId: string; name: string; vertical?: "commerce" | "vehicles" }) =>
    api.post<MetaCatalog>(META_PATHS.catalogs, body),
  syncCatalogProducts: (id: string, body: { connectionId: string; productIds: string[] }) =>
    api.post<{ accepted: number }>(`${META_PATHS.catalogs}/${id}/products`, body),
  syncCatalog: (id: string, body: { connectionId: string; productIds: string[] }) =>
    api.post<{ accepted: number }>(`${META_PATHS.catalogs}/${id}/sync`, body),
  deleteCatalogProducts: (id: string, body: { connectionId: string; productIds: string[] }) =>
    api.post<{ accepted: number }>(`${META_PATHS.catalogs}/${id}/product-removals`, { ...body, confirmation: "DELETE" }),
  deleteCatalog: (id: string, connectionId: string) => api.delete<{ ok: true }>(`${META_PATHS.catalogs}/${id}${queryString({ connectionId, confirmation: "DELETE" })}`),
};

export function getMetaErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Meta istek sınırına ulaşıldı. Kısa süre sonra yeniden deneyin.";
    if (error.status === 403) return "Bu Meta işlemi için yetkiniz bulunmuyor.";
    if (error.status === 409) return "Kayıt güncel durumla çakıştı. Veriyi yenileyip yeniden deneyin.";
    return error.message;
  }
  return "Meta servisine ulaşılamadı. Bağlantıyı kontrol edip yeniden deneyin.";
}
