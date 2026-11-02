import type { MailCampaignCreateInput, MailCampaignRecipientStatus, MailCampaignStatus, MailSuppressionInput } from '@haksan/shared';
import { request } from '@/src/api/client';

/** Web `mailCampaignService` tipleri (apps/web/src/lib/services.ts). */
export type MailCampaignSummary = {
  id: string;
  subject: string;
  status: MailCampaignStatus;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  createdBy: string;
  createdByName: string | null;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
};

export type MailCampaignRecipient = {
  id: string;
  email: string;
  name: string | null;
  companyName: string | null;
  companyId: string | null;
  status: MailCampaignRecipientStatus;
  error: string | null;
  sentAt: string | null;
};

export type MailCampaignDetail = Omit<MailCampaignSummary, 'total' | 'sent' | 'failed' | 'skipped' | 'createdByName'> & {
  body: string;
  fileIds: string[];
  recipients: MailCampaignRecipient[];
};

export type MailCampaignCandidate = {
  email: string;
  name: string | null;
  companyName: string;
  companyId: string;
  contactId: string | null;
  detail: string | null;
};

/** `mailCampaignCandidatesQuerySchema`: Firmalar süzgeçleri + firma genel e-postaları. */
export type MailCampaignCandidatesQuery = {
  search?: string;
  city?: string;
  sector?: string;
  relationTypeCode?: string;
  customerStatusCode?: string;
  includeCompanyEmails?: 'true';
};

export type MailSuppression = { id: string; email: string; reason: string | null; createdAt: string };

export const mailCampaignsApi = {
  list: () => request<MailCampaignSummary[]>('/mail/campaigns'),
  get: (id: string) => request<MailCampaignDetail>(`/mail/campaigns/${encodeURIComponent(id)}`),
  create: (body: MailCampaignCreateInput) => request<MailCampaignDetail>('/mail/campaigns', { method: 'POST', body }),
  cancel: (id: string) => request<MailCampaignDetail>(`/mail/campaigns/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} }),
  resume: (id: string) => request<MailCampaignDetail>(`/mail/campaigns/${encodeURIComponent(id)}/resume`, { method: 'POST', body: {} }),
  candidates: (query: MailCampaignCandidatesQuery, signal?: AbortSignal) =>
    request<{ rows: MailCampaignCandidate[]; truncated: boolean }>('/mail/campaigns/candidates', { query, signal }),
  parseList: (body: { fileName: string; fileBase64: string }) =>
    request<{ rows: Array<{ email: string; name?: string; companyName?: string }>; invalid: number }>('/mail/campaigns/parse-list', {
      method: 'POST',
      body,
    }),
  suppressions: () => request<MailSuppression[]>('/mail/campaigns/suppressions'),
  addSuppression: (body: MailSuppressionInput) => request<{ email: string }>('/mail/campaigns/suppressions', { method: 'POST', body }),
  removeSuppression: (id: string) =>
    request<{ deleted: boolean }>(`/mail/campaigns/suppressions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
