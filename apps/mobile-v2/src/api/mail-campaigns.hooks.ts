import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MailCampaignCreateInput, MailSuppressionInput } from '@haksan/shared';
import { useCan } from '@/src/auth/AuthProvider';
import { mailCampaignsApi, type MailCampaignCandidatesQuery, type MailCampaignDetail } from './mail-campaigns.api';

export const mailCampaignKeys = {
  all: ['mail-campaigns'] as const,
  list: ['mail-campaigns', 'list'] as const,
  detail: (id: string) => ['mail-campaigns', 'detail', id] as const,
  candidates: (query: MailCampaignCandidatesQuery) => ['mail-campaigns', 'candidates', query] as const,
  suppressions: ['mail-campaigns', 'suppressions'] as const,
};

/** Web: gönderimdeki kampanya varken liste 5 sn'de, detay 4 sn'de yenilenir. */
export function useMailCampaigns() {
  return useQuery({
    queryKey: mailCampaignKeys.list,
    queryFn: mailCampaignsApi.list,
    refetchInterval: (query) => (query.state.data?.some((row) => row.status === 'sending') ? 5_000 : false),
  });
}

export function useMailCampaign(id: string) {
  return useQuery({
    queryKey: mailCampaignKeys.detail(id),
    queryFn: () => mailCampaignsApi.get(id),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.status === 'sending' ? 4_000 : false),
  });
}

function useStoreCampaign() {
  const qc = useQueryClient();
  return (detail: MailCampaignDetail) => {
    qc.setQueryData(mailCampaignKeys.detail(detail.id), detail);
    void qc.invalidateQueries({ queryKey: mailCampaignKeys.list });
  };
}

export function useCreateMailCampaign() {
  const store = useStoreCampaign();
  return useMutation({ mutationFn: (body: MailCampaignCreateInput) => mailCampaignsApi.create(body), onSuccess: store });
}

export function useMailCampaignAction() {
  const store = useStoreCampaign();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'cancel' | 'resume' }) => mailCampaignsApi[action](id),
    onSuccess: store,
  });
}

/** Sunucu ayrıca companies.read + contacts.read ister; yetki yoksa istek atılmaz. */
export function useCanPickCrmRecipients(): boolean {
  const canCreate = useCan('mail_campaigns.create');
  const canCompanies = useCan('companies.read');
  const canContacts = useCan('contacts.read');
  return canCreate && canCompanies && canContacts;
}

export function useMailCampaignCandidates(query: MailCampaignCandidatesQuery, enabled: boolean) {
  return useQuery({
    queryKey: mailCampaignKeys.candidates(query),
    queryFn: ({ signal }) => mailCampaignsApi.candidates(query, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useParseRecipientList() {
  return useMutation({ mutationFn: mailCampaignsApi.parseList });
}

export function useMailSuppressions() {
  return useQuery({ queryKey: mailCampaignKeys.suppressions, queryFn: mailCampaignsApi.suppressions });
}

export function useAddMailSuppression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MailSuppressionInput) => mailCampaignsApi.addSuppression(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mailCampaignKeys.suppressions }),
  });
}

export function useRemoveMailSuppression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mailCampaignsApi.removeSuppression(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mailCampaignKeys.suppressions }),
  });
}
