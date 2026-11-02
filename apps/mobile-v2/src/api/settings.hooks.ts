import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LeadAssignmentRuleCreateInput,
  LeadAssignmentRuleUpdateInput,
  MailSignatureInput,
  SignatureCreateInput,
  SignatureUpdateInput,
  UserMailAccountUpsertInput,
} from '@haksan/shared';
import { settingsApi, type AccessRequestStatus } from './settings.api';
import { collectPaginated } from './pagination';

export const settingsKeys = {
  all: ['settings'] as const,
  mailAccount: ['settings', 'mail-account'] as const,
  mailSignatureUsers: ['settings', 'mail-signature-users'] as const,
  mailUserSignature: (userId: string) => ['settings', 'mail-signature-users', userId] as const,
  signatures: ['settings', 'signatures'] as const,
  leadRules: ['settings', 'lead-rules'] as const,
  accessRequests: (status: AccessRequestStatus) => ['settings', 'access-requests', status] as const,
  accessRequestsAll: ['settings', 'access-requests'] as const,
  availableLookups: ['settings', 'available-lookups'] as const,
};

const STALE = 60 * 1000;

/** Kendi hesabının anahtarı değişmez (mail compose vb. onu okur); hedef kullanıcı ayrı anahtarda. */
const mailAccountKey = (userId?: string) => (userId ? [...settingsKeys.mailAccount, userId] : settingsKeys.mailAccount);

export function useMailAccount(userId?: string) {
  return useQuery({ queryKey: mailAccountKey(userId), queryFn: () => settingsApi.mailAccount(userId), staleTime: STALE });
}

export function useMailConnect(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserMailAccountUpsertInput) => settingsApi.mailConnect(body, userId),
    onSuccess: (status) => {
      qc.setQueryData(mailAccountKey(userId), status);
      if (userId) void qc.invalidateQueries({ queryKey: settingsKeys.mailSignatureUsers });
    },
  });
}

export function useMailDisconnect(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => settingsApi.mailDisconnect(userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mailAccountKey(userId), exact: true });
      if (userId) void qc.invalidateQueries({ queryKey: settingsKeys.mailSignatureUsers });
    },
  });
}

export function useMailTextSignature(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (signature: string | null) => settingsApi.mailTextSignature(signature, userId),
    onSuccess: (status) => qc.setQueryData(mailAccountKey(userId), status),
  });
}

export function useMailImageSignature(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MailSignatureInput) => settingsApi.mailImageSignature(body, userId),
    onSuccess: (status) => {
      qc.setQueryData(mailAccountKey(userId), status);
      if (userId) void qc.invalidateQueries({ queryKey: settingsKeys.mailUserSignature(userId) });
    },
  });
}

export function useMailSignatureUsers(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.mailSignatureUsers,
    queryFn: settingsApi.mailSignatureUsers,
    staleTime: STALE,
    enabled,
  });
}

export function useMailUserSignature(userId: string) {
  return useQuery({
    queryKey: settingsKeys.mailUserSignature(userId),
    queryFn: () => settingsApi.mailUserSignature(userId),
    enabled: Boolean(userId),
  });
}

export function useMailSaveUserSignature(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MailSignatureInput) => settingsApi.mailSaveUserSignature(userId, body),
    onSuccess: (data) => {
      qc.setQueryData(settingsKeys.mailUserSignature(userId), data);
      void qc.invalidateQueries({ queryKey: [...settingsKeys.mailAccount, userId] });
    },
  });
}

export function useSignatures() {
  return useQuery({ queryKey: settingsKeys.signatures, queryFn: settingsApi.signatures, staleTime: STALE });
}

export function useCreateSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SignatureCreateInput) => settingsApi.createSignature(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: settingsKeys.signatures }),
  });
}

export function useUpdateSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SignatureUpdateInput }) => settingsApi.updateSignature(id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: settingsKeys.signatures }),
  });
}

export function useRemoveSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.removeSignature(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: settingsKeys.signatures }),
  });
}

export function useLeadRules(enabled = true) {
  return useQuery({ queryKey: settingsKeys.leadRules, queryFn: settingsApi.leadRules, staleTime: STALE, enabled });
}

export function useCreateLeadRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadAssignmentRuleCreateInput) => settingsApi.createLeadRule(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: settingsKeys.leadRules }),
  });
}

export function useUpdateLeadRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: LeadAssignmentRuleUpdateInput }) => settingsApi.updateLeadRule(id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: settingsKeys.leadRules }),
  });
}

export function useRemoveLeadRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.removeLeadRule(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: settingsKeys.leadRules }),
  });
}

export function useAccessRequests(status: AccessRequestStatus) {
  return useQuery({
    queryKey: settingsKeys.accessRequests(status),
    queryFn: () => collectPaginated((page) => settingsApi.accessRequests({ status, page, pageSize: 100 })),
    staleTime: 30 * 1000,
  });
}

export function useDecideAccessRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, decisionNote }: { id: string; decision: 'approve' | 'reject'; decisionNote?: string }) =>
      decision === 'approve'
        ? settingsApi.approveAccessRequest(id, { decisionNote })
        : settingsApi.rejectAccessRequest(id, { decisionNote }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: settingsKeys.accessRequestsAll }),
  });
}

export function useAvailableLookups() {
  return useQuery({ queryKey: settingsKeys.availableLookups, queryFn: settingsApi.availableLookups, staleTime: 10 * STALE });
}
