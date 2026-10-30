import type {
  CompanyAccessRequestDecisionInput,
  LeadAssignmentRuleCreateInput,
  LeadAssignmentRuleUpdateInput,
  MailSignatureInput,
  SignatureCreateInput,
  SignatureUpdateInput,
  SignatureView,
  UserMailAccountStatus,
  UserMailAccountUpsertInput,
} from '@haksan/shared';
import { request, type Paginated } from '@/src/api/client';

/* Yanıt biçimleri: mail.controller, signatures.controller, lead-assignment-rules.controller, companies.controller (AccessRequestsController). */

export type MailSignatureUser = { id: string; name: string; email: string; hasMailAccount: boolean };
export type MailImageSignature = { image: string | null; filename: string | null };

export type LeadAssignmentRule = {
  id: string;
  name: string;
  priority: number;
  active: boolean;
  divisionId: string | null;
  criteria: { cities: string[]; productTerms: string[]; sourceCodes: string[] };
  assigneeUserIds: string[];
};

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';
export type AccessRequestRow = {
  id: string;
  companyId: string;
  status: AccessRequestStatus;
  note: string | null;
  createdAt: string;
  ownerDivisionId: string;
  requestingDivisionId: string;
  company: { id: string; legalTitle: string; taxNumber: string | null } | null;
  requestingDivision: { id: string; name: string; code: string } | null;
};

export const settingsApi = {
  /* ------------------------------------------------------------- webmail */
  mailAccount: () => request<UserMailAccountStatus>('/mail/account'),
  /** Parola yalnız bu istekte gider; yanıt ve önbellek onu taşımaz. */
  mailConnect: (body: UserMailAccountUpsertInput) =>
    request<UserMailAccountStatus>('/mail/account', { method: 'PUT', body }),
  mailDisconnect: () => request<{ ok: true }>('/mail/account', { method: 'DELETE' }),
  /** `null` kayıtlı imzayı siler (profilden üretilen varsayılana döner), `''` imzayı kapatır. */
  mailTextSignature: (signature: string | null) =>
    request<UserMailAccountStatus>('/mail/signature', { method: 'PUT', body: { signature } }),
  mailImageSignature: (body: MailSignatureInput) =>
    request<UserMailAccountStatus>('/mail/signature/image', { method: 'PUT', body }),
  mailSignatureUsers: () => request<MailSignatureUser[]>('/mail/signature/users'),
  mailUserSignature: (userId: string) => request<MailImageSignature>(`/mail/signature/users/${userId}`),
  mailSaveUserSignature: (userId: string, body: MailSignatureInput) =>
    request<MailImageSignature>(`/mail/signature/users/${userId}`, { method: 'PUT', body }),

  /* -------------------------------------------------------- belge imzaları */
  signatures: () => request<SignatureView[]>('/signatures'),
  createSignature: (body: SignatureCreateInput) => request<SignatureView>('/signatures', { method: 'POST', body }),
  updateSignature: (id: string, body: SignatureUpdateInput) =>
    request<SignatureView>(`/signatures/${id}`, { method: 'PATCH', body }),
  removeSignature: (id: string) => request<{ ok: true }>(`/signatures/${id}`, { method: 'DELETE' }),

  /* ---------------------------------------------------- fırsat atama kuralı */
  leadRules: () => request<LeadAssignmentRule[]>('/lead-assignment-rules'),
  createLeadRule: (body: LeadAssignmentRuleCreateInput) =>
    request<LeadAssignmentRule>('/lead-assignment-rules', { method: 'POST', body }),
  updateLeadRule: (id: string, body: LeadAssignmentRuleUpdateInput) =>
    request<LeadAssignmentRule>(`/lead-assignment-rules/${id}`, { method: 'PATCH', body }),
  removeLeadRule: (id: string) => request<{ ok: true }>(`/lead-assignment-rules/${id}`, { method: 'DELETE' }),

  /* ------------------------------------------------------- erişim talepleri */
  accessRequests: (query: { status?: AccessRequestStatus; page?: number; pageSize?: number }) =>
    request<Paginated<AccessRequestRow>>('/access-requests', { query }),
  approveAccessRequest: (id: string, body: CompanyAccessRequestDecisionInput) =>
    request<unknown>(`/access-requests/${id}/approve`, { method: 'POST', body }),
  rejectAccessRequest: (id: string, body: CompanyAccessRequestDecisionInput) =>
    request<unknown>(`/access-requests/${id}/reject`, { method: 'POST', body }),

  /* ----------------------------------------------------------------- lookup */
  availableLookups: () => request<{ available: string[] }>('/lookups'),
};
