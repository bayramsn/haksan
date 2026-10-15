import type {
  LeadContactChannelCode as LeadContactChannel,
  LeadContactOutcomeCode as LeadContactOutcome,
  PipelineStageCode,
  TrelloCompanyCandidate,
  TrelloCompanyResolution,
  TrelloImportRowInput,
} from '@haksan/shared';
import { request, type Paginated } from '@/src/api/client';
import type { OpportunityListItem, OpportunityListQuery, opportunities } from '@/src/api/endpoints';

/* ------------------------------------------------------------ fırsat listesi ---- */

/**
 * `GET /opportunities` satırı `opportunities` tablosunun tüm kolonlarını da
 * taşır (service `list()` → `...r.opp`); kanban kartı ve geçmiş görünümü bu
 * ek alanları kullanır.
 */
export type SalesOpportunityRow = OpportunityListItem & {
  primaryContactId: string | null;
  leadDistrict: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  firstContactAt: string | null;
  closedAt: string | null;
  lostCompanyName: string | null;
  lostCompetitorName: string | null;
  products: { id: string; productId: string | null; quantity: number | string | null }[];
};

/** opportunities.controller.ts `list` query; `followUp` yalnız `'true'` kabul eder. */
export type SalesListQuery = OpportunityListQuery & {
  lostReasonCode?: string;
  wonReason?: string;
  followUp?: 'true';
};

/** `GET /opportunities/lead-summary` (son 30 gün lead performansı). */
export type LeadSummaryBucket = { key: string; label: string; total: number; converted: number; conversionRate: number };
export type LeadSummary = {
  periodDays: number;
  totalCreated: number;
  activeLeads: number;
  medianFirstContactHours: number | null;
  contactedWithinFourHoursRate: number | null;
  slaBreaches: number;
  actionlessLeads: number;
  unassignedLeads: number;
  conversionRate: number;
  justifiedConversionRate: number;
  bySource: LeadSummaryBucket[];
  byProduct: LeadSummaryBucket[];
  byOwner: LeadSummaryBucket[];
};

/** `POST /opportunities/:id/contact-events` gövdesi (leadContactEventSchema). */
export type LeadContactEventBody = {
  idempotencyKey: string;
  channel: LeadContactChannel;
  outcome: LeadContactOutcome;
  note?: string;
  nextAction?: string | null;
  nextActionAt?: string | null;
};

/** `PATCH /opportunities/:id/stage` gövdesi (opportunityStageChangeSchema). */
export type OpportunityStageChangeBody = {
  toStage: PipelineStageCode;
  changeReason?: string;
  cancellationReasonCode?: string;
  outcome?: 'lost' | 'cancelled';
  cancellationReasonName?: string;
  lostCompetitorId?: string;
  lostCompetitorName?: string;
  lostCompetitorProductModel?: string;
  quoteId?: string;
  inventoryItemIds?: string[];
};

/** `POST /opportunities/from-activity/:activityId` gövdesi (opportunityCreateSchema alt kümesi). */
export type OpportunityFromActivityBody = Parameters<typeof opportunities.create>[0] & { sourceActivityId: string };

/* -------------------------------------------------------------- Trello ---- */

export type TrelloImportStatus = 'create' | 'skip' | 'error';

export type TrelloCompanyMatch = {
  id: string;
  legalTitle: string;
  shortName?: string | null;
  taxNumber?: string | null;
  province?: string | null;
  district?: string | null;
  score: number;
  confidence: 'strong' | 'possible';
  reasons: string[];
  contactMatch?: { id: string; fullName: string; reason: string };
};

export type TrelloImportPreviewRow = TrelloImportRowInput & {
  candidate: TrelloCompanyCandidate;
  matches: TrelloCompanyMatch[];
  status: TrelloImportStatus;
  errors: string[];
  warnings: string[];
};

export type TrelloImportPreview = {
  fileName: string;
  headerRowNumber: number;
  rows: TrelloImportPreviewRow[];
  summary: { total: number; create: number; skip: number; error: number };
  capabilities: { canCreateCompany: boolean; canUpdateCompany: boolean; canCreateContact: boolean };
};

export type TrelloImportCommitBody = {
  divisionId: string;
  currencyCode: 'USD' | 'EUR' | 'TRY' | 'GBP';
  rows: (TrelloImportRowInput & { candidate: TrelloCompanyCandidate; resolution: TrelloCompanyResolution })[];
};

export type TrelloImportCommitResult = {
  rows: { rowNumber: number; trelloCardId?: string; title: string; status: TrelloImportStatus; opportunityId?: string; errors: string[] }[];
  summary: { total: number; create: number; skip: number; error: number };
};

/* ------------------------------------------------------------- görevler ---- */

export type TaskUserSummary = { userId: string; fullName: string; open: number; overdue: number; completed: number };

/* ------------------------------------------------------- ekip aktivitesi ---- */

export type TeamActivityPeriod = 'day' | 'week' | 'month' | 'year';
export type TeamActivityMetric = 'all' | 'quotes' | 'activities' | 'opportunitiesCreated' | 'won';
export type ActivityDelta = { current: number; previous: number };

export type TeamActivityReport = {
  period: TeamActivityPeriod;
  scope: 'team' | 'self';
  canSeeTeam: boolean;
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  bucket: 'hour' | 'day' | 'month';
  totals: { quotes: number; activities: number; opportunitiesCreated: number; won: number; wonValue: number };
  previousTotals: { quotes: number; activities: number; opportunitiesCreated: number; won: number };
  timeline: { bucket: string; quotes: number; activities: number }[];
  users: {
    userId: string;
    name: string;
    quotes: ActivityDelta;
    activities: ActivityDelta;
    opportunitiesCreated: ActivityDelta;
    won: ActivityDelta;
    wonValue: number;
    total: ActivityDelta;
  }[];
};

export type TeamActivityDetailItem = {
  id: string;
  source: 'quote' | 'visit' | 'call' | 'activity' | 'opportunity_created' | 'opportunity_won';
  metric: Exclude<TeamActivityMetric, 'all'>;
  typeCode: string;
  typeName: string;
  title: string;
  occurredAt: string;
  userId: string;
  userName: string;
  company: { id: string | null; name: string | null };
  content?: {
    detail: string | null;
    result: string | null;
    location: string | null;
    nextAction: string | null;
    followUpAt: string | null;
  };
};

export type TeamActivityDetails = {
  period: TeamActivityPeriod;
  scope: 'team' | 'self';
  metric: TeamActivityMetric;
  range: { from: string; to: string };
  user: { id: string; name: string } | null;
  items: TeamActivityDetailItem[];
};

/* ------------------------------------------------------------------ uçlar ---- */

export const salesApi = {
  list: (query: SalesListQuery & { page: number; pageSize: number }) =>
    request<Paginated<SalesOpportunityRow>>('/opportunities', { query }),
  leadSummary: () => request<LeadSummary>('/opportunities/lead-summary'),
  createFromActivity: (activityId: string, body: OpportunityFromActivityBody) =>
    request<{ id: string }>(`/opportunities/from-activity/${encodeURIComponent(activityId)}`, { method: 'POST', body }),
  previewTrelloImport: (body: { fileName: string; fileBase64: string }) =>
    request<TrelloImportPreview>('/opportunities/imports/trello/preview', { method: 'POST', body, timeoutMs: 60_000 }),
  commitTrelloImport: (body: TrelloImportCommitBody) =>
    request<TrelloImportCommitResult>('/opportunities/imports/trello/commit', { method: 'POST', body, timeoutMs: 120_000 }),
  linkCompany: (id: string, body: { companyId: string; createContact: boolean }) =>
    request<{ id: string }>(`/opportunities/${encodeURIComponent(id)}/company`, { method: 'POST', body }),
  recordContact: (id: string, body: LeadContactEventBody) =>
    request<{ id: string }>(`/opportunities/${encodeURIComponent(id)}/contact-events`, { method: 'POST', body }),
  convert: (id: string, body: { note?: string; overrideReason?: string }) =>
    request<{ id: string }>(`/opportunities/${encodeURIComponent(id)}/convert`, { method: 'POST', body }),
  changeStage: (id: string, body: OpportunityStageChangeBody) =>
    request<{ id: string }>(`/opportunities/${encodeURIComponent(id)}/stage`, { method: 'PATCH', body }),

  tasksSummary: () => request<TaskUserSummary[]>('/tasks/summary'),

  teamActivity: (query: { period: TeamActivityPeriod; date?: string; scope?: 'team' | 'self' }) =>
    request<TeamActivityReport>('/reports/team-activity', { query }),
  teamActivityDetails: (query: {
    period: TeamActivityPeriod;
    date?: string;
    scope?: 'team' | 'self';
    metric?: TeamActivityMetric;
    userId?: string;
  }) => request<TeamActivityDetails>('/reports/team-activity/details', { query }),
};
