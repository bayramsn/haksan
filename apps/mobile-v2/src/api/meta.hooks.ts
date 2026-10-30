import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { can, useAuth } from '@/src/auth/AuthProvider';
import {
  metaApi,
  type MetaCampaignCreate,
  type MetaCampaignPatch,
  type MetaCatalogProductAction,
  type MetaConnectionBody,
  type MetaConversionCreate,
  type MetaMappingCreate,
} from '@/src/api/meta.api';
import type { MetaPlatform } from '@/src/ui/meta/metaNormalize';

export const META_LEAD_PAGE_SIZE = 25;
export const META_INBOX_PAGE_SIZE = 20;
export const META_EVENT_PAGE_SIZE = 20;

export const metaKeys = {
  root: ['meta'] as const,
  connections: ['meta', 'connections'] as const,
  overview: (params: object) => ['meta', 'overview', params] as const,
  leads: (params: object) => ['meta', 'leads', params] as const,
  insights: (params: object) => ['meta', 'insights', params] as const,
  campaigns: (connectionId: string) => ['meta', 'campaigns', connectionId] as const,
  conversations: (params: object) => ['meta', 'conversations', params] as const,
  messages: (conversationId: string, connectionId: string) => ['meta', 'messages', conversationId, connectionId] as const,
  comments: (connectionId: string) => ['meta', 'comments', connectionId] as const,
  mappings: ['meta', 'form-mappings'] as const,
  conversions: ['meta', 'conversion-events'] as const,
  audiences: ['meta', 'audiences'] as const,
  catalogs: ['meta', 'catalogs'] as const,
};

/** Web `MetaPage` yetki türetmesi. */
export function useMetaPermissions() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles?.some((role) => role === 'super_admin' || role === 'admin'));
  const any = (...perms: string[]) => isAdmin || perms.some((perm) => can(user, perm));
  return {
    canRead: any('meta.read', 'meta_campaigns.read', 'meta_messages.read'),
    canManageConnections: any('meta.create', 'meta.update', 'meta.delete'),
    canManageCampaigns: any('meta_campaigns.create', 'meta_campaigns.update', 'meta_campaigns.approve'),
    canManageMessages: any('meta_messages.create', 'meta_messages.update'),
    canManageAutomation: any('meta.create', 'meta.update'),
    canManageAudiences: any('meta_audiences.create', 'meta_audiences.update', 'meta_audiences.delete'),
    canManageCatalogs: any('meta_catalogs.create', 'meta_catalogs.update', 'meta_catalogs.delete'),
  };
}

/* ------------------------------------------------------------- okumalar ---- */

export function useMetaConnections(enabled = true) {
  return useQuery({ queryKey: metaKeys.connections, queryFn: metaApi.connections, staleTime: 60_000, enabled });
}

export function useMetaOverview(params: { from: string; to: string; connectionId?: string }) {
  return useQuery({ queryKey: metaKeys.overview(params), queryFn: () => metaApi.overview(params), staleTime: 30_000 });
}

export function useMetaLeads(filters: { search?: string; status?: string; platform?: string; connectionId?: string }) {
  return useInfiniteQuery({
    queryKey: metaKeys.leads(filters),
    queryFn: ({ pageParam }) => metaApi.leads({ ...filters, page: pageParam, pageSize: META_LEAD_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    staleTime: 20_000,
  });
}

export function useMetaInsights(params: { connectionId: string; from: string; to: string }) {
  return useQuery({
    queryKey: metaKeys.insights(params),
    queryFn: () => metaApi.insights(params),
    enabled: Boolean(params.connectionId),
    staleTime: 30_000,
  });
}

export function useMetaCampaigns(connectionId: string) {
  return useQuery({
    queryKey: metaKeys.campaigns(connectionId),
    queryFn: () => metaApi.campaigns(connectionId),
    enabled: Boolean(connectionId),
    staleTime: 30_000,
  });
}

export function useMetaConversations(params: { connectionId: string; search?: string }) {
  return useInfiniteQuery({
    queryKey: metaKeys.conversations(params),
    queryFn: ({ pageParam }) => metaApi.conversations({ ...params, page: pageParam, pageSize: META_INBOX_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled: Boolean(params.connectionId),
    staleTime: 15_000,
  });
}

export function useMetaMessages(conversationId: string, connectionId: string) {
  return useQuery({
    queryKey: metaKeys.messages(conversationId, connectionId),
    queryFn: () => metaApi.messages(conversationId, connectionId),
    enabled: Boolean(conversationId && connectionId),
    staleTime: 10_000,
  });
}

export function useMetaComments(connectionId: string) {
  return useQuery({
    queryKey: metaKeys.comments(connectionId),
    queryFn: () => metaApi.comments(connectionId),
    enabled: Boolean(connectionId),
    staleTime: 15_000,
  });
}

export function useMetaMappings() {
  return useQuery({ queryKey: metaKeys.mappings, queryFn: metaApi.formMappings, staleTime: 30_000 });
}

export function useMetaConversionEvents() {
  return useInfiniteQuery({
    queryKey: metaKeys.conversions,
    queryFn: ({ pageParam }) => metaApi.conversionEvents({ page: pageParam, pageSize: META_EVENT_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    staleTime: 20_000,
  });
}

export function useMetaAudiences() {
  return useQuery({ queryKey: metaKeys.audiences, queryFn: metaApi.audiences, staleTime: 30_000 });
}

export function useMetaCatalogs() {
  return useQuery({ queryKey: metaKeys.catalogs, queryFn: metaApi.catalogs, staleTime: 30_000 });
}

/* ------------------------------------------------------------- yazmalar ---- */

function useInvalidate(...keys: (readonly unknown[])[]) {
  const qc = useQueryClient();
  return () => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function useStartMetaOAuth() {
  return useMutation({ mutationFn: metaApi.startOAuth });
}

export function useCreateMetaConnection() {
  const invalidate = useInvalidate(metaKeys.root);
  return useMutation({ mutationFn: (body: MetaConnectionBody) => metaApi.createConnection(body), onSuccess: invalidate });
}

export function useVerifyMetaConnection() {
  const invalidate = useInvalidate(metaKeys.root);
  return useMutation({ mutationFn: (id: string) => metaApi.verifyConnection(id), onSuccess: invalidate });
}

export function useDeleteMetaConnection() {
  const invalidate = useInvalidate(metaKeys.root);
  return useMutation({ mutationFn: (id: string) => metaApi.deleteConnection(id), onSuccess: invalidate });
}

export function useCreateMetaCampaign() {
  const invalidate = useInvalidate(['meta', 'campaigns']);
  return useMutation({ mutationFn: (body: MetaCampaignCreate) => metaApi.createCampaign(body), onSuccess: invalidate });
}

export function useUpdateMetaCampaign() {
  const invalidate = useInvalidate(['meta', 'campaigns']);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MetaCampaignPatch }) => metaApi.updateCampaign(id, patch),
    onSuccess: invalidate,
  });
}

export function useSendMetaMessage() {
  const invalidate = useInvalidate(['meta', 'messages'], ['meta', 'conversations']);
  return useMutation({
    mutationFn: (vars: { conversationId: string; connectionId: string; channel: MetaPlatform; text: string }) =>
      metaApi.sendMessage(vars.conversationId, { connectionId: vars.connectionId, channel: vars.channel, text: vars.text }),
    onSuccess: invalidate,
  });
}

export function useReplyMetaComment() {
  const invalidate = useInvalidate(['meta', 'comments']);
  return useMutation({
    mutationFn: (vars: { id: string; connectionId: string; message: string }) =>
      metaApi.replyComment(vars.id, { connectionId: vars.connectionId, message: vars.message }),
    onSuccess: invalidate,
  });
}

export function useSetMetaCommentHidden() {
  const invalidate = useInvalidate(['meta', 'comments']);
  return useMutation({
    mutationFn: (vars: { id: string; connectionId: string; hidden: boolean }) =>
      metaApi.setCommentHidden(vars.id, { connectionId: vars.connectionId, hidden: vars.hidden }),
    onSuccess: invalidate,
  });
}

export function useCreateMetaMapping() {
  const invalidate = useInvalidate(metaKeys.mappings);
  return useMutation({ mutationFn: (body: MetaMappingCreate) => metaApi.createFormMapping(body), onSuccess: invalidate });
}

export function useToggleMetaMapping() {
  const invalidate = useInvalidate(metaKeys.mappings);
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => metaApi.updateFormMapping(id, { isActive }),
    onSuccess: invalidate,
  });
}

export function useCreateMetaConversion() {
  const invalidate = useInvalidate(metaKeys.conversions);
  return useMutation({ mutationFn: (body: MetaConversionCreate) => metaApi.createConversionEvent(body), onSuccess: invalidate });
}

export function useProcessMetaJobs() {
  const invalidate = useInvalidate(metaKeys.root);
  return useMutation({ mutationFn: metaApi.processJobs, onSuccess: invalidate });
}

export function useCreateMetaAudience() {
  const invalidate = useInvalidate(metaKeys.audiences);
  return useMutation({
    mutationFn: (body: { connectionId: string; name: string; description?: string }) => metaApi.createAudience(body),
    onSuccess: invalidate,
  });
}

export function useMetaAudienceMembers() {
  const invalidate = useInvalidate(metaKeys.audiences);
  return useMutation({
    mutationFn: (vars: { id: string; connectionId: string; opportunityIds: string[]; remove: boolean }) =>
      vars.remove
        ? metaApi.removeAudienceMembers(vars.id, { connectionId: vars.connectionId, opportunityIds: vars.opportunityIds })
        : metaApi.addAudienceMembers(vars.id, { connectionId: vars.connectionId, opportunityIds: vars.opportunityIds }),
    onSuccess: invalidate,
  });
}

export function useDeleteMetaAudience() {
  const invalidate = useInvalidate(metaKeys.audiences);
  return useMutation({
    mutationFn: (vars: { id: string; connectionId: string }) => metaApi.deleteAudience(vars.id, vars.connectionId),
    onSuccess: invalidate,
  });
}

export function useCreateMetaCatalog() {
  const invalidate = useInvalidate(metaKeys.catalogs);
  return useMutation({
    mutationFn: (body: { connectionId: string; name: string; vertical: 'commerce' | 'vehicles' }) => metaApi.createCatalog(body),
    onSuccess: invalidate,
  });
}

export function useMetaCatalogProducts() {
  const invalidate = useInvalidate(metaKeys.catalogs);
  return useMutation({
    mutationFn: (vars: { id: string; action: MetaCatalogProductAction; connectionId: string; productIds: string[] }) =>
      metaApi.catalogProducts(vars.id, vars.action, { connectionId: vars.connectionId, productIds: vars.productIds }),
    onSuccess: invalidate,
  });
}

export function useDeleteMetaCatalog() {
  const invalidate = useInvalidate(metaKeys.catalogs);
  return useMutation({
    mutationFn: (vars: { id: string; connectionId: string }) => metaApi.deleteCatalog(vars.id, vars.connectionId),
    onSuccess: invalidate,
  });
}
