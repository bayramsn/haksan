import { ApiError, OfflineError, request } from '@/src/api/client';
import {
  activeConnections,
  flattenComments,
  normalizeAudience,
  normalizeCampaign,
  normalizeCatalog,
  normalizeConnection,
  normalizeConnectionStatus,
  normalizeConversation,
  normalizeConversionEvent,
  normalizeInsight,
  normalizeLead,
  normalizeMapping,
  normalizeMessages,
  normalizePage,
  type ListEnvelope,
  type MetaAudience,
  type MetaCampaign,
  type MetaCampaignStatus,
  type MetaCatalog,
  type MetaComment,
  type MetaConnection,
  type MetaConnectionHealth,
  type MetaConversation,
  type MetaConversionEvent,
  type MetaFormMapping,
  type MetaInsightPoint,
  type MetaLead,
  type MetaMessage,
  type MetaPage,
  type MetaPlatform,
  type Raw,
  type RawMetaConnection,
  type RawMetaFormMapping,
} from '@/src/ui/meta/metaNormalize';

/** Web `meta-service.ts` ile aynı uçlar ve gövdeler. Erişim token'ı yalnız oluşturma isteğinin gövdesinde gider, saklanmaz. */

export type MetaOverview = {
  summary: {
    spendMinor: number;
    currency: string;
    leads: number;
    qualifiedLeads: number;
    conversions: number;
    costPerLeadMinor: number;
    qualificationRate: number;
    conversionRate: number;
    firstResponseMinutes: number | null;
  };
  connectionHealth: MetaConnectionHealth[];
  recentLeads: MetaLead[];
};

export type MetaLeadQuery = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  platform?: string;
  connectionId?: string;
};

export type MetaConnectionBody = {
  name: string;
  accessToken: string;
  businessId?: string;
  pageId?: string;
  adAccountId?: string;
  instagramAccountId?: string;
  whatsappBusinessAccountId?: string;
  datasetId?: string;
  phoneNumberId?: string;
  permissions: string[];
};

export type MetaCampaignCreate = {
  connectionId: string;
  name: string;
  objective: string;
  dailyBudgetMinor: number;
};

export type MetaCampaignPatch = { connectionId: string; status?: MetaCampaignStatus; dailyBudgetMinor?: number };

export type MetaMappingCreate = {
  connectionId: string;
  formId: string;
  formName: string;
  isActive: boolean;
  fieldMappings: Record<string, string>;
};

export type MetaConversionCreate = {
  connectionId: string;
  opportunityId: string;
  eventName: string;
  occurredAt: string;
  value?: number;
  currency?: string;
  eventId: string;
};

export type MetaCatalogProductAction = 'upsert' | 'sync' | 'remove';

export const metaApi = {
  async overview(params: { from?: string; to?: string; connectionId?: string }): Promise<MetaOverview> {
    const [rawSummary, rawConnections, rawLeads] = await Promise.all([
      request<{ leads?: number; totalSpend?: number }>('/meta/overview', { query: params }),
      request<RawMetaConnection[]>('/meta/connections'),
      request<ListEnvelope<Raw>>('/meta/leads', { query: { page: 1, pageSize: 5, connectionId: params.connectionId } }),
    ]);
    const leadPage = normalizePage(rawLeads, 1, 5);
    return {
      summary: {
        spendMinor: Math.round(Number(rawSummary.totalSpend ?? 0) * 100),
        currency: 'TRY',
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
      recentLeads: leadPage.items.map((raw) => normalizeLead(raw)),
    };
  },

  async connections(): Promise<MetaConnection[]> {
    return (await request<RawMetaConnection[]>('/meta/connections')).map(normalizeConnection);
  },
  startOAuth: () => request<{ authorizationUrl: string }>('/meta/connections/oauth/start', { method: 'POST', body: {} }),
  createConnection: (body: MetaConnectionBody) => request<RawMetaConnection>('/meta/connections', { method: 'POST', body }),
  verifyConnection: (id: string) => request<{ ok: true }>(`/meta/connections/${encodeURIComponent(id)}/verify`, { method: 'POST', body: {} }),
  deleteConnection: (id: string) => request<RawMetaConnection>(`/meta/connections/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  async leads(params: MetaLeadQuery): Promise<MetaPage<MetaLead>> {
    const response = await request<ListEnvelope<Raw>>('/meta/leads', { query: params });
    const page = normalizePage(response, params.page, params.pageSize);
    return { ...page, items: page.items.map((raw) => normalizeLead(raw)) };
  },

  async insights(params: { connectionId: string; from: string; to: string }): Promise<MetaInsightPoint[]> {
    const response = await request<Raw[]>('/meta/insights', { query: { page: 1, pageSize: 100, ...params } });
    return response.map(normalizeInsight);
  },

  async campaigns(connectionId: string): Promise<MetaCampaign[]> {
    const response = await request<{ data?: Raw[] }>('/meta/campaigns', { query: { connectionId } });
    return (response.data ?? []).map((raw) => normalizeCampaign(raw, connectionId));
  },
  async createCampaign(body: MetaCampaignCreate): Promise<{ id?: string }> {
    const created = await request<{ id?: string }>('/meta/campaigns', {
      method: 'POST',
      body: { connectionId: body.connectionId, name: body.name, objective: body.objective, status: 'PAUSED' },
    });
    if (created.id) {
      await request(`/meta/campaigns/${encodeURIComponent(created.id)}`, {
        method: 'PATCH',
        body: { connectionId: body.connectionId, dailyBudgetMinor: body.dailyBudgetMinor, confirmation: 'META_CAMPAIGN_CHANGE' },
      });
    }
    return created;
  },
  updateCampaign: (id: string, patch: MetaCampaignPatch) =>
    request(`/meta/campaigns/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: {
        ...patch,
        ...(patch.status === 'ACTIVE' || patch.dailyBudgetMinor !== undefined ? { confirmation: 'META_CAMPAIGN_CHANGE' } : {}),
      },
    }),

  async conversations(params: { page: number; pageSize: number; search?: string; connectionId: string }): Promise<MetaPage<MetaConversation>> {
    const response = await request<Raw[]>('/meta/conversations', { query: params });
    const page = normalizePage(response, params.page, params.pageSize);
    return { ...page, items: page.items.map((raw) => normalizeConversation(raw, params.connectionId)) };
  },
  async messages(conversationId: string, connectionId: string): Promise<MetaMessage[]> {
    const response = await request<Raw[]>(`/meta/conversations/${encodeURIComponent(conversationId)}/messages`, {
      query: { connectionId, page: 1, pageSize: 100 },
    });
    return normalizeMessages(response);
  },
  sendMessage: (conversationId: string, body: { connectionId: string; channel: MetaPlatform; text: string }) =>
    request(`/meta/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body }),

  async comments(connectionId: string): Promise<MetaComment[]> {
    const response = await request<{ data?: Raw[] }>('/meta/comments', { query: { connectionId } });
    return flattenComments(response.data ?? [], connectionId);
  },
  replyComment: (id: string, body: { connectionId: string; message: string }) =>
    request(`/meta/comments/${encodeURIComponent(id)}/replies`, { method: 'POST', body }),
  setCommentHidden: (id: string, body: { connectionId: string; hidden: boolean }) =>
    request(`/meta/comments/${encodeURIComponent(id)}`, { method: 'PATCH', body }),

  async formMappings(): Promise<MetaFormMapping[]> {
    return (await request<RawMetaFormMapping[]>('/meta/form-mappings')).map(normalizeMapping);
  },
  createFormMapping: (body: MetaMappingCreate) => request<RawMetaFormMapping>('/meta/form-mappings', { method: 'POST', body }),
  updateFormMapping: (id: string, body: { isActive: boolean }) =>
    request<RawMetaFormMapping>(`/meta/form-mappings/${encodeURIComponent(id)}`, { method: 'PATCH', body }),

  async conversionEvents(params: { page: number; pageSize: number }): Promise<MetaPage<MetaConversionEvent>> {
    const response = await request<ListEnvelope<Raw>>('/meta/conversion-events', { query: params });
    const page = normalizePage(response, params.page, params.pageSize);
    return { ...page, items: page.items.map((raw) => normalizeConversionEvent(raw)) };
  },
  createConversionEvent: (body: MetaConversionCreate) =>
    request('/meta/conversion-events', { method: 'POST', body: { ...body, userData: {} } }),
  processJobs: () => request<{ processed: number; failed: number }>('/meta/jobs/process', { method: 'POST', body: {} }),

  async audiences(): Promise<MetaAudience[]> {
    return (await request<Raw[]>('/meta/audiences')).map(normalizeAudience);
  },
  createAudience: (body: { connectionId: string; name: string; description?: string }) =>
    request('/meta/audiences', { method: 'POST', body }),
  addAudienceMembers: (id: string, body: { connectionId: string; opportunityIds: string[] }) =>
    request<{ accepted?: number }>(`/meta/audiences/${encodeURIComponent(id)}/members`, {
      method: 'POST',
      body: { ...body, legalBasisConfirmed: true },
    }),
  removeAudienceMembers: (id: string, body: { connectionId: string; opportunityIds: string[] }) =>
    request<{ accepted?: number }>(`/meta/audiences/${encodeURIComponent(id)}/member-removals`, {
      method: 'POST',
      body: { ...body, confirmation: 'DELETE' },
    }),
  deleteAudience: (id: string, connectionId: string) =>
    request(`/meta/audiences/${encodeURIComponent(id)}`, { method: 'DELETE', query: { connectionId, confirmation: 'DELETE' } }),

  async catalogs(): Promise<MetaCatalog[]> {
    return (await request<Raw[]>('/meta/catalogs')).map(normalizeCatalog);
  },
  createCatalog: (body: { connectionId: string; name: string; vertical: 'commerce' | 'vehicles' }) =>
    request('/meta/catalogs', { method: 'POST', body }),
  catalogProducts(id: string, action: MetaCatalogProductAction, body: { connectionId: string; productIds: string[] }) {
    const catalogId = encodeURIComponent(id);
    if (action === 'remove') {
      return request<{ accepted?: number }>(`/meta/catalogs/${catalogId}/product-removals`, {
        method: 'POST',
        body: { ...body, confirmation: 'DELETE' },
      });
    }
    if (action === 'sync') return request<{ accepted?: number }>(`/meta/catalogs/${catalogId}/sync`, { method: 'POST', body });
    return request<{ accepted?: number }>(`/meta/catalogs/${catalogId}/products`, { method: 'POST', body });
  },
  deleteCatalog: (id: string, connectionId: string) =>
    request(`/meta/catalogs/${encodeURIComponent(id)}`, { method: 'DELETE', query: { connectionId, confirmation: 'DELETE' } }),
};

export { activeConnections };

/** Web `getMetaErrorMessage` ile aynı Türkçe hata metinleri. */
export function getMetaErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Meta istek sınırına ulaşıldı. Kısa süre sonra yeniden deneyin.';
    if (error.status === 403) return 'Bu Meta işlemi için yetkiniz bulunmuyor.';
    if (error.status === 409) return 'Kayıt güncel durumla çakıştı. Veriyi yenileyip yeniden deneyin.';
    return error.message;
  }
  if (error instanceof OfflineError) return error.message;
  return 'Meta servisine ulaşılamadı. Bağlantıyı kontrol edip yeniden deneyin.';
}
