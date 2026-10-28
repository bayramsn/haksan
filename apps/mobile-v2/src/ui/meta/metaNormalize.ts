/** Web `apps/web/src/lib/meta-service.ts` normalizasyonlarının birebir karşılığı (saf, test edilebilir). */

export type MetaPlatform = 'facebook' | 'instagram' | 'messenger' | 'whatsapp';
export type MetaConnectionStatus = 'active' | 'disabled' | 'error';
export type MetaLeadStatus = 'new' | 'assigned' | 'contacted' | 'qualified' | 'converted' | 'rejected';
export type MetaCampaignStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type MetaSyncStatus = 'idle' | 'syncing' | 'ready' | 'failed';

export type MetaConnection = {
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
};
export type RawMetaConnection = Omit<MetaConnection, 'status'> & { status: string };

export type MetaLead = {
  id: string;
  opportunityId: string | null;
  externalLeadId: string;
  platform: MetaPlatform;
  fullName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: MetaLeadStatus;
  campaignId: string | null;
  campaignName: string | null;
  adId: string | null;
  adName: string | null;
  formId: string | null;
  formName: string | null;
  ownerName: string | null;
  createdAt: string;
  firstContactAt: string | null;
};

export type MetaOverviewSummary = { spendMinor: number; currency: string; leads: number };

export type MetaConnectionHealth = {
  connectionId: string;
  name: string;
  status: MetaConnectionStatus;
  lastSyncAt?: string | null;
  lastError?: string | null;
};

export type MetaInsightPoint = {
  date: string;
  campaignId: string | null;
  campaignName: string | null;
  spendMinor: number;
  currency: string;
  impressions: number;
  clicks: number;
  leads: number;
};

export type MetaCampaign = {
  id: string;
  connectionId: string;
  name: string;
  objective: string | null;
  status: MetaCampaignStatus;
  effectiveStatus: string | null;
  dailyBudgetMinor: number | null;
  lifetimeBudgetMinor: number | null;
  spendMinor: number | null;
  currency: string;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  qualifiedLeads: number | null;
  conversions: number | null;
  updatedAt: string | null;
};

export type MetaConversation = {
  id: string;
  connectionId: string;
  platform: MetaPlatform;
  participantName: string;
  preview: string;
  lastMessageAt: string;
  canReply: boolean;
};

export type MetaMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: string;
  createdAt: string;
};

export type MetaComment = {
  id: string;
  connectionId: string;
  platform: 'facebook' | 'instagram';
  authorName: string;
  authorHandle: string | null;
  message: string;
  postName: string | null;
  isHidden: boolean;
  canReply: boolean;
  createdAt: string;
};

export type MetaFormMapping = {
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
};
export type RawMetaFormMapping = Omit<MetaFormMapping, 'isActive' | 'fieldMappings'> & {
  isActive?: boolean;
  enabled?: boolean;
  fieldMappings?: Record<string, string>;
  fieldMap?: Record<string, string>;
};

export type MetaConversionEvent = {
  id: string;
  opportunityId: string;
  eventName: string;
  status: 'pending' | 'sent' | 'failed' | 'discarded';
  valueMinor: number | null;
  currency: string | null;
  occurredAt: string;
  sentAt: string | null;
  retryCount: number;
  lastError: string | null;
};

export type MetaAudience = {
  id: string;
  connectionId: string;
  name: string;
  description: string | null;
  subtype: string | null;
  syncStatus: MetaSyncStatus;
  lastSyncAt: string | null;
};

export type MetaCatalog = {
  id: string;
  connectionId: string;
  name: string;
  vertical: string | null;
  productCount: number;
  syncStatus: MetaSyncStatus;
  lastSyncAt: string | null;
};

export type MetaPage<T> = { items: T[]; total: number; page: number; pageSize: number; hasNext: boolean };

export type ListEnvelope<T> =
  | T[]
  | {
      items?: T[];
      data?: T[];
      total?: number;
      page?: number;
      pageSize?: number;
      meta?: { total?: number; page?: number; pageSize?: number; hasNext?: boolean };
    };

export type Raw = Record<string, unknown>;

export function asRecord(value: unknown): Raw {
  return value && typeof value === 'object' ? (value as Raw) : {};
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function normalizePage<T>(response: ListEnvelope<T>, requestedPage = 1, requestedPageSize = 25): MetaPage<T> {
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
  return { items, total, page, pageSize, hasNext: response.meta?.hasNext ?? page * pageSize < total };
}

export function normalizeLeadStatus(raw: Raw): MetaLeadStatus {
  const qualification = String(raw.qualificationStage ?? '').toLowerCase();
  const followUp = String(raw.leadFollowUpStatus ?? '').toLowerCase();
  if (['win', 'won', 'converted'].includes(qualification)) return 'converted';
  if (['lost', 'rejected', 'disqualified'].includes(qualification) || followUp === 'disqualified') return 'rejected';
  if (['a', 'a+', 'qualified'].includes(qualification)) return 'qualified';
  if (raw.firstContactAt || followUp === 'contacted') return 'contacted';
  if (raw.ownerUserId) return 'assigned';
  return 'new';
}

export function normalizeLead(raw: Raw, now = new Date()): MetaLead {
  const metadata = asRecord(raw.externalMetadata);
  return {
    id: String(raw.id ?? raw.externalKey ?? ''),
    opportunityId: asString(raw.id),
    externalLeadId: String(raw.externalKey ?? raw.id ?? ''),
    platform: String(metadata.platform ?? metadata.source ?? 'facebook') as MetaPlatform,
    fullName: String(raw.leadContactName ?? raw.title ?? 'İsimsiz lead'),
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
    createdAt: String(raw.createdAt ?? now.toISOString()),
    firstContactAt: asString(raw.firstContactAt),
  };
}

export function normalizeConnectionStatus(status: string): MetaConnectionStatus {
  if (status === 'active') return 'active';
  if (status === 'error' || status === 'degraded' || status === 'expired') return 'error';
  return 'disabled';
}

export function normalizeConnection(connection: RawMetaConnection): MetaConnection {
  return { ...connection, status: normalizeConnectionStatus(connection.status) };
}

export function normalizeCampaign(raw: Raw, connectionId: string): MetaCampaign {
  const budget = (snake: unknown, camel: unknown) => (snake == null && camel == null ? null : Number(snake ?? camel));
  return {
    id: String(raw.id ?? ''),
    connectionId,
    name: String(raw.name ?? 'İsimsiz kampanya'),
    objective: asString(raw.objective),
    status: String(raw.status ?? 'PAUSED') as MetaCampaignStatus,
    effectiveStatus: asString(raw.effective_status ?? raw.effectiveStatus),
    dailyBudgetMinor: budget(raw.daily_budget, raw.dailyBudgetMinor),
    lifetimeBudgetMinor: budget(raw.lifetime_budget, raw.lifetimeBudgetMinor),
    spendMinor: typeof raw.spendMinor === 'number' && Number.isFinite(raw.spendMinor) ? raw.spendMinor : null,
    currency: String(raw.currency ?? 'TRY'),
    impressions: typeof raw.impressions === 'number' && Number.isFinite(raw.impressions) ? raw.impressions : null,
    clicks: typeof raw.clicks === 'number' && Number.isFinite(raw.clicks) ? raw.clicks : null,
    leads: typeof raw.leads === 'number' && Number.isFinite(raw.leads) ? raw.leads : null,
    qualifiedLeads: typeof raw.qualifiedLeads === 'number' && Number.isFinite(raw.qualifiedLeads) ? raw.qualifiedLeads : null,
    conversions: typeof raw.conversions === 'number' && Number.isFinite(raw.conversions) ? raw.conversions : null,
    updatedAt: asString(raw.updated_time ?? raw.updatedAt),
  };
}

export function normalizeMapping(mapping: RawMetaFormMapping): MetaFormMapping {
  return { ...mapping, isActive: mapping.isActive ?? mapping.enabled ?? true, fieldMappings: mapping.fieldMappings ?? mapping.fieldMap ?? {} };
}

export function normalizeInsight(raw: Raw): MetaInsightPoint {
  return {
    date: String(raw.insightDate ?? raw.date ?? ''),
    campaignId: asString(raw.campaignId),
    campaignName: asString(raw.campaignName),
    spendMinor: Math.round(Number(raw.spend ?? 0) * 100),
    currency: String(asRecord(raw.rawMetrics).account_currency ?? ''),
    impressions: Number(raw.impressions ?? 0),
    clicks: Number(raw.clicks ?? 0),
    leads: Number(raw.leads ?? 0),
  };
}

export function insightTotals(items: MetaInsightPoint[]) {
  const currencies = new Set(items.map((item) => item.currency));
  const validCurrency = currencies.size === 1 && /^[A-Z]{3}$/.test(items[0]?.currency ?? '');
  return {
    spendMinor: validCurrency ? items.reduce((sum, item) => sum + item.spendMinor, 0) : null,
    impressions: items.reduce((sum, item) => sum + item.impressions, 0),
    clicks: items.reduce((sum, item) => sum + item.clicks, 0),
    leads: items.reduce((sum, item) => sum + item.leads, 0),
    currency: validCurrency ? items[0]!.currency : '',
  };
}

export function normalizeConversation(raw: Raw, fallbackConnectionId: string, now = new Date()): MetaConversation {
  return {
    id: String(raw.conversationExternalId ?? ''),
    connectionId: String(raw.connectionId ?? fallbackConnectionId),
    platform: String(raw.channel ?? 'messenger') as MetaPlatform,
    participantName: String(raw.conversationExternalId ?? 'Meta kullanıcısı'),
    preview: `${Number(raw.messageCount ?? 0)} mesaj`,
    lastMessageAt: String(raw.lastMessageAt ?? now.toISOString()),
    canReply: true,
  };
}

/** API yeniden eskiye döner; ekranda eskiden yeniye okunur. */
export function normalizeMessages(rows: Raw[], now = new Date()): MetaMessage[] {
  return rows
    .map((raw) => ({
      id: String(raw.id ?? raw.remoteId ?? ''),
      direction: (String(raw.direction ?? 'inbound') === 'outbound' ? 'outbound' : 'inbound') as MetaMessage['direction'],
      body: String(raw.text ?? ''),
      status: String(raw.status ?? 'sent'),
      createdAt: String(raw.sentAt ?? raw.createdAt ?? now.toISOString()),
    }))
    .reverse();
}

/** Gönderi listesindeki `comments.data` dizilerini düz yorum listesine açar. */
export function flattenComments(media: Raw[], connectionId: string, now = new Date()): MetaComment[] {
  return media.flatMap((post) => {
    const comments = asRecord(post.comments).data;
    if (!Array.isArray(comments)) return [];
    return comments.map((value): MetaComment => {
      const raw = asRecord(value);
      const from = asRecord(raw.from);
      return {
        id: String(raw.id ?? ''),
        connectionId,
        platform: raw.username ? 'instagram' : 'facebook',
        authorName: String(raw.username ?? from.name ?? 'Meta kullanıcısı'),
        authorHandle: asString(raw.username),
        message: String(raw.text ?? raw.message ?? ''),
        postName: asString(post.caption),
        isHidden: Boolean(raw.hidden),
        canReply: true,
        createdAt: String(raw.timestamp ?? raw.created_time ?? now.toISOString()),
      };
    });
  });
}

export function normalizeConversionEvent(raw: Raw, now = new Date()): MetaConversionEvent {
  const customData = asRecord(asRecord(raw.payload).custom_data);
  const value = Number(customData.value);
  return {
    id: String(raw.id ?? ''),
    opportunityId: String(raw.opportunityId ?? ''),
    eventName: String(raw.eventName ?? ''),
    status: String(raw.status ?? 'pending') as MetaConversionEvent['status'],
    valueMinor: customData.value != null && Number.isFinite(value) ? Math.round(value * 100) : null,
    currency: asString(customData.currency),
    occurredAt: String(raw.occurredAt ?? raw.createdAt ?? now.toISOString()),
    sentAt: asString(raw.sentAt),
    retryCount: Number(raw.attemptCount ?? 0),
    lastError: asString(raw.lastError),
  };
}

export function normalizeAudience(raw: Raw): MetaAudience {
  return {
    id: String(raw.id ?? ''),
    connectionId: String(raw.connectionId ?? ''),
    name: String(raw.name ?? 'İsimsiz kitle'),
    description: asString(raw.description),
    subtype: asString(raw.customerFileSource),
    syncStatus: String(raw.status ?? 'idle') as MetaSyncStatus,
    lastSyncAt: asString(raw.updatedAt),
  };
}

export function normalizeCatalog(raw: Raw): MetaCatalog {
  return {
    id: String(raw.id ?? ''),
    connectionId: String(raw.connectionId ?? ''),
    name: String(raw.name ?? 'İsimsiz katalog'),
    vertical: asString(raw.vertical),
    productCount: Number(raw.productCount ?? 0),
    syncStatus: String(raw.status ?? 'idle') as MetaSyncStatus,
    lastSyncAt: asString(raw.updatedAt),
  };
}

/* ------------------------------------------------------------ biçimleme ---- */

export const LEAD_STATUS_LABELS: Record<MetaLeadStatus, string> = {
  new: 'Yeni',
  assigned: 'Atandı',
  contacted: 'İletişim kuruldu',
  qualified: 'Nitelikli',
  converted: 'Dönüştü',
  rejected: 'Uygun değil',
};

export const CONNECTION_STATUS_LABELS: Record<MetaConnectionStatus, string> = {
  active: 'Bağlı',
  error: 'Kontrol gerekli',
  disabled: 'Bağlı değil',
};

export const CAMPAIGN_STATUS_LABELS: Record<MetaCampaignStatus, string> = {
  ACTIVE: 'Yayında',
  PAUSED: 'Duraklatıldı',
  ARCHIVED: 'Arşiv',
};

export const SYNC_STATUS_LABELS: Record<MetaSyncStatus, string> = {
  ready: 'Senkron',
  syncing: 'İşleniyor',
  failed: 'Hatalı',
  idle: 'Bekliyor',
};

export const PLATFORM_LABELS: Record<MetaPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  messenger: 'Messenger',
  whatsapp: 'WhatsApp',
};

export const CAMPAIGN_OBJECTIVES = [
  { value: 'OUTCOME_LEADS', label: 'Lead toplama' },
  { value: 'OUTCOME_SALES', label: 'Satış' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Etkileşim' },
] as const;

export const CONVERSION_EVENTS = [
  { value: 'QualifiedLead', label: 'Nitelikli lead' },
  { value: 'Contact', label: 'İletişim kuruldu' },
  { value: 'Schedule', label: 'Randevu' },
  { value: 'Purchase', label: 'Satış' },
] as const;

export const DEFAULT_FIELD_MAPPINGS: Record<string, string> = {
  full_name: 'contactName',
  company_name: 'companyTitle',
  email: 'email',
  phone_number: 'phone',
  city: 'city',
};

export type MetaTone = 'success' | 'info' | 'warning' | 'destructive' | 'neutral' | 'stage';

/** Web `STATUS_TONES` eşlemesi; bilinmeyen durum nötr. */
export function metaStatusTone(status: string): MetaTone {
  const key = status.toLowerCase();
  if (['active', 'ready', 'sent', 'converted', 'qualified'].includes(key)) return 'success';
  if (['assigned', 'contacted'].includes(key)) return 'info';
  if (['pending', 'syncing'].includes(key)) return 'warning';
  if (['error', 'failed', 'rejected'].includes(key)) return 'destructive';
  if (key === 'new') return 'stage';
  return 'neutral';
}

export function formatMetaDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function formatMetaMoney(minor: number | null | undefined, currency = 'TRY'): string {
  if (minor == null || !Number.isFinite(minor)) return '—';
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 2 }).format(Number(minor ?? 0) / 100);
  } catch {
    return `${(Number(minor ?? 0) / 100).toFixed(2)} ${currency}`;
  }
}

export function formatMetaNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(Number(value ?? 0));
}

/** Son `days` gün (bugün dahil), `YYYY-MM-DD`. */
export function metaDateRange(days = 30, now = new Date()): { from: string; to: string } {
  const from = new Date(now);
  from.setDate(from.getDate() - days + 1);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

/** Virgül, boşluk, noktalı virgül veya satırla ayrılmış benzersiz kimlikler. */
export function parseIds(value: string): string[] {
  return [...new Set(value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean))];
}

/** "1.250,50" / "1250.5" → 1250.5; geçersizse NaN. */
export function parseDecimal(value: string): number {
  const text = value.trim();
  if (!text) return Number.NaN;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  return Number(normalized);
}

export function tokenExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  return expiresAt ? new Date(expiresAt).getTime() <= now.getTime() : false;
}

/** OAuth yönlendirmesi yalnız HTTPS Meta/Facebook adresine açılır. */
export function isSafeAuthorizationUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)facebook\.com$|(^|\.)meta\.com$|(^|\.)instagram\.com$/.test(url.hostname);
  } catch {
    return false;
  }
}

export function activeConnections(connections: MetaConnection[]): MetaConnection[] {
  return connections.filter((item) => item.status === 'active');
}

/** Missing aggregate fields are unavailable; they must never become fabricated zeros. */
export function normalizeOverviewSummary(raw: Raw) {
  const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const spend = numeric(raw.totalSpend);
  return {
    spendMinor: spend === null ? null : Math.round(spend * 100), currency: asString(raw.currency) ?? 'TRY',
    leads: numeric(raw.leads), qualifiedLeads: numeric(raw.qualifiedLeads), conversions: numeric(raw.conversions),
    costPerLeadMinor: numeric(raw.costPerLeadMinor), qualificationRate: numeric(raw.qualificationRate),
    conversionRate: numeric(raw.conversionRate), firstResponseMinutes: numeric(raw.firstResponseMinutes),
  };
}
