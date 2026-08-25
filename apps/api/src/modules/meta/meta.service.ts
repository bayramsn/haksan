import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type MetaAudienceCreateInput,
  type MetaAudienceMembersInput,
  type MetaAudienceMembersRemoveInput,
  type MetaAudienceUpdateInput,
  type MetaCampaignCreateInput,
  type MetaCampaignUpdateInput,
  type MetaCatalogCreateInput,
  type MetaCatalogProductDeleteInput,
  type MetaCatalogProductsInput,
  type MetaCatalogUpdateInput,
  type MetaCommentReplyCreateInput,
  type MetaCommentUpdateInput,
  type MetaConnectionCreateInput,
  type MetaConnectionUpdateInput,
  type MetaConversationMessageCreateInput,
  type MetaConversionEventCreateInput,
  type MetaDateRangeQuery,
  type MetaDestructiveConfirmationInput,
  type MetaFormMappingCreateInput,
  type MetaFormMappingUpdateInput,
  type MetaListQuery,
} from '@haksan/shared';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { loadEnv } from '../../config/env';
import { z } from 'zod';
import type { DbClient } from '../../db/client';
import {
  metaAudiences,
  metaCatalogs,
  metaConnections,
  metaConversionEvents,
  metaDailyInsights,
  metaFormMappings,
  metaMessages,
  opportunities,
  productModels,
  currencies,
  divisions,
  users,
} from '../../db/schema';
import type { AuthContext } from '../../shared/security/auth.types';
import { AuditService } from '../../shared/database/audit.service';
import { DB } from '../../shared/database/database.module';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { resourceDivisionFilter } from '../../shared/utils/division-scope';
import { MetaCredentialService } from './meta-credential.service';
import { MetaGraphClient } from './meta-graph.client';

type ConnectionRow = typeof metaConnections.$inferSelect;

export interface GraphList<T> { data: T[]; paging?: { next?: string } }
export interface GraphId { id: string; success?: boolean }

const oauthStateSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  issuedAt: z.number().int().positive(),
  nonce: z.string().uuid(),
});

const connectionPublicColumns = {
  id: metaConnections.id,
  tenantId: metaConnections.tenantId,
  name: metaConnections.name,
  pageId: metaConnections.pageId,
  instagramAccountId: metaConnections.instagramAccountId,
  adAccountId: metaConnections.adAccountId,
  businessId: metaConnections.businessId,
  datasetId: metaConnections.datasetId,
  whatsappBusinessAccountId: metaConnections.whatsappBusinessAccountId,
  phoneNumberId: metaConnections.phoneNumberId,
  permissions: metaConnections.permissions,
  tokenExpiresAt: metaConnections.tokenExpiresAt,
  status: metaConnections.status,
  lastVerifiedAt: metaConnections.lastVerifiedAt,
  lastWebhookAt: metaConnections.lastWebhookAt,
  lastSyncAt: metaConnections.lastSyncAt,
  lastError: metaConnections.lastError,
  createdAt: metaConnections.createdAt,
  updatedAt: metaConnections.updatedAt,
};

@Injectable()
export class MetaService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly credentials: MetaCredentialService,
    private readonly graph: MetaGraphClient,
    private readonly audit: AuditService
  ) {}

  async overview(actor: AuthContext) {
    const [connectionCount, leadCount, pendingConversions, spend] = await Promise.all([
      this.db.select({ value: sql<number>`count(*)::int` }).from(metaConnections).where(and(eq(metaConnections.tenantId, actor.tenantId), isNull(metaConnections.deletedAt))),
      this.db.select({ value: sql<number>`count(*)::int` }).from(opportunities).where(and(eq(opportunities.tenantId, actor.tenantId), eq(opportunities.externalSource, 'meta_lead_ads'), isNull(opportunities.deletedAt), resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`)),
      this.db.select({ value: sql<number>`count(*)::int` }).from(metaConversionEvents).where(and(eq(metaConversionEvents.tenantId, actor.tenantId), eq(metaConversionEvents.status, 'pending'))),
      this.db.select({ value: sql<string>`coalesce(sum(${metaDailyInsights.spend}), 0)` }).from(metaDailyInsights).where(eq(metaDailyInsights.tenantId, actor.tenantId)),
    ]);
    return {
      connections: connectionCount[0]?.value ?? 0,
      leads: leadCount[0]?.value ?? 0,
      pendingConversions: pendingConversions[0]?.value ?? 0,
      totalSpend: Number(spend[0]?.value ?? 0),
    };
  }

  listConnections(actor: AuthContext) {
    return this.db.select(connectionPublicColumns).from(metaConnections).where(and(eq(metaConnections.tenantId, actor.tenantId), isNull(metaConnections.deletedAt))).orderBy(metaConnections.name);
  }

  startOauth(actor: AuthContext) {
    const payload = Buffer.from(JSON.stringify({ tenantId: actor.tenantId, userId: actor.userId, issuedAt: Date.now(), nonce: randomUUID() }), 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.graph.appSecret()).update(payload).digest('base64url');
    return { authorizationUrl: this.graph.authorizationUrl(`${payload}.${signature}`) };
  }

  async completeOauth(code: string, state: string) {
    const identity = this.verifyOauthState(state);
    const userToken = await this.graph.exchangeAuthorizationCode(code);
    const [accounts, adAccounts, businesses] = await Promise.all([
      this.graph.get<GraphList<{ id: string; name?: string; access_token?: string; instagram_business_account?: { id: string } }>>(userToken, 'me/accounts', { fields: 'id,name,access_token,instagram_business_account{id}', limit: 100 }),
      this.graph.get<GraphList<{ id: string }>>(userToken, 'me/adaccounts', { fields: 'id', limit: 100 }),
      this.graph.get<GraphList<{ id: string }>>(userToken, 'me/businesses', { fields: 'id', limit: 100 }),
    ]);
    const page = accounts.data.find((candidate) => candidate.access_token);
    if (!page?.access_token) throw new ValidationError('Meta hesabında erişilebilir bir Facebook sayfası bulunamadı');
    const actor: AuthContext = {
      userId: identity.userId,
      tenantId: identity.tenantId,
      email: '',
      roles: [],
      permissions: new Set(),
      divisionIds: [],
      primaryDivisionId: null,
      departmentIds: [],
      primaryDepartmentId: null,
      canViewAllDivisions: false,
      activeDivisionId: null,
      activeDepartmentId: null,
      accessScopes: [],
    };
    return this.createConnection(actor, {
      name: page.name ?? `Meta Page ${page.id}`,
      accessToken: page.access_token,
      pageId: page.id,
      instagramAccountId: page.instagram_business_account?.id,
      adAccountId: adAccounts.data[0]?.id,
      businessId: businesses.data[0]?.id,
      permissions: [],
    });
  }

  async createConnection(actor: AuthContext, input: MetaConnectionCreateInput) {
    await this.graph.get<{ id: string; name?: string }>(input.accessToken, 'me', { fields: 'id,name' });
    const id = randomUUID();
    const [created] = await this.db.insert(metaConnections).values({
      id,
      tenantId: actor.tenantId,
      name: input.name,
      accessTokenEncrypted: this.credentials.encryptAccessToken(actor.tenantId, id, input.accessToken),
      pageId: input.pageId ?? null,
      instagramAccountId: input.instagramAccountId ?? null,
      adAccountId: input.adAccountId ?? null,
      businessId: input.businessId ?? null,
      datasetId: input.datasetId ?? null,
      whatsappBusinessAccountId: input.whatsappBusinessAccountId ?? null,
      phoneNumberId: input.phoneNumberId ?? null,
      permissions: input.permissions,
      tokenExpiresAt: input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : null,
      lastVerifiedAt: new Date(),
      createdBy: actor.userId,
      updatedBy: actor.userId,
    }).returning(connectionPublicColumns);
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'meta.connection.created', resourceType: 'meta_connection', resourceId: created.id, newValues: created });
    return created;
  }

  async updateConnection(actor: AuthContext, id: string, input: MetaConnectionUpdateInput) {
    const current = await this.connection(actor, id, true);
    if (input.accessToken) await this.graph.get(input.accessToken, 'me', { fields: 'id,name' });
    const patch: Partial<typeof metaConnections.$inferInsert> = {
      updatedBy: actor.userId,
      updatedAt: new Date(),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.pageId !== undefined ? { pageId: input.pageId ?? null } : {}),
      ...(input.instagramAccountId !== undefined ? { instagramAccountId: input.instagramAccountId ?? null } : {}),
      ...(input.adAccountId !== undefined ? { adAccountId: input.adAccountId ?? null } : {}),
      ...(input.businessId !== undefined ? { businessId: input.businessId ?? null } : {}),
      ...(input.datasetId !== undefined ? { datasetId: input.datasetId ?? null } : {}),
      ...(input.whatsappBusinessAccountId !== undefined ? { whatsappBusinessAccountId: input.whatsappBusinessAccountId ?? null } : {}),
      ...(input.phoneNumberId !== undefined ? { phoneNumberId: input.phoneNumberId ?? null } : {}),
      ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
      ...(input.tokenExpiresAt !== undefined ? { tokenExpiresAt: input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.accessToken ? { accessTokenEncrypted: this.credentials.encryptAccessToken(actor.tenantId, id, input.accessToken), lastVerifiedAt: new Date(), lastError: null } : {}),
    };
    const [updated] = await this.db.update(metaConnections).set(patch).where(and(eq(metaConnections.id, id), eq(metaConnections.tenantId, actor.tenantId), isNull(metaConnections.deletedAt))).returning(connectionPublicColumns);
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'meta.connection.updated', resourceType: 'meta_connection', resourceId: id, oldValues: this.publicConnection(current), newValues: updated });
    return updated;
  }

  async deleteConnection(actor: AuthContext, id: string) {
    await this.connection(actor, id, true);
    const [removed] = await this.db.update(metaConnections).set({ deletedAt: new Date(), status: 'disabled', updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(metaConnections.id, id), eq(metaConnections.tenantId, actor.tenantId))).returning(connectionPublicColumns);
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'meta.connection.deleted', resourceType: 'meta_connection', resourceId: id });
    return removed;
  }

  async verifyConnection(actor: AuthContext, id: string) {
    const { row, token } = await this.authorizedConnection(actor, id);
    const remote = await this.graph.get<{ id: string; name?: string }>(token, 'me', { fields: 'id,name' });
    await this.db.update(metaConnections).set({ lastVerifiedAt: new Date(), lastError: null, status: 'active', updatedAt: new Date(), updatedBy: actor.userId }).where(eq(metaConnections.id, row.id));
    return { ok: true, remote };
  }

  listFormMappings(actor: AuthContext) {
    return this.db.select().from(metaFormMappings).where(and(eq(metaFormMappings.tenantId, actor.tenantId), isNull(metaFormMappings.deletedAt))).orderBy(metaFormMappings.formName);
  }

  async createFormMapping(actor: AuthContext, input: MetaFormMappingCreateInput) {
    await this.connection(actor, input.connectionId);
    await this.assertAssignments(actor, input.divisionId, input.ownerUserId);
    const [created] = await this.db.insert(metaFormMappings).values({ ...input, divisionId: input.divisionId ?? null, ownerUserId: input.ownerUserId ?? null, tenantId: actor.tenantId, createdBy: actor.userId, updatedBy: actor.userId }).returning();
    return created;
  }

  async updateFormMapping(actor: AuthContext, id: string, input: MetaFormMappingUpdateInput) {
    const current = await this.db.query.metaFormMappings.findFirst({ where: and(eq(metaFormMappings.id, id), eq(metaFormMappings.tenantId, actor.tenantId), isNull(metaFormMappings.deletedAt)) });
    if (!current) throw new NotFoundError('Meta form eşlemesi');
    await this.assertAssignments(actor, input.divisionId, input.ownerUserId);
    const [updated] = await this.db.update(metaFormMappings).set({ ...input, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(metaFormMappings.id, id), eq(metaFormMappings.tenantId, actor.tenantId))).returning();
    return updated;
  }

  async deleteFormMapping(actor: AuthContext, id: string) {
    const [removed] = await this.db.update(metaFormMappings).set({ deletedAt: new Date(), isActive: false, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(metaFormMappings.id, id), eq(metaFormMappings.tenantId, actor.tenantId), isNull(metaFormMappings.deletedAt))).returning();
    if (!removed) throw new NotFoundError('Meta form eşlemesi');
    return removed;
  }

  async listLeads(actor: AuthContext, query: MetaListQuery) {
    const where = and(eq(opportunities.tenantId, actor.tenantId), eq(opportunities.externalSource, 'meta_lead_ads'), isNull(opportunities.deletedAt), resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`);
    const [data, count] = await Promise.all([
      this.db.select().from(opportunities).where(where).orderBy(desc(opportunities.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      this.db.select({ value: sql<number>`count(*)::int` }).from(opportunities).where(where),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total: count[0]?.value ?? 0 } };
  }

  async listInsights(actor: AuthContext, query: MetaDateRangeQuery) {
    const where = and(eq(metaDailyInsights.tenantId, actor.tenantId), gte(metaDailyInsights.insightDate, query.from), lte(metaDailyInsights.insightDate, query.to), query.connectionId ? eq(metaDailyInsights.connectionId, query.connectionId) : undefined);
    return this.db.select().from(metaDailyInsights).where(where).orderBy(desc(metaDailyInsights.insightDate)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
  }

  async syncInsights(actor: AuthContext, connectionId: string, from: Date, to: Date) {
    const { row, token } = await this.authorizedConnection(actor, connectionId);
    if (!row.adAccountId) throw new ValidationError('Bağlantıda reklam hesabı tanımlı değil');
    const account = row.adAccountId.startsWith('act_') ? row.adAccountId : `act_${row.adAccountId}`;
    const response = await this.graph.get<GraphList<Record<string, unknown>>>(token, `${account}/insights`, {
      fields: 'date_start,campaign_id,campaign_name,spend,impressions,clicks,actions',
      level: 'campaign',
      time_increment: 1,
      time_range: JSON.stringify({ since: this.dateOnly(from), until: this.dateOnly(to) }),
      limit: 500,
    });
    for (const insight of response.data) {
      const actions = Array.isArray(insight.actions) ? insight.actions as Array<{ action_type?: string; value?: string }> : [];
      const leads = actions.filter((action) => ['lead', 'onsite_conversion.lead_grouped'].includes(action.action_type ?? '')).reduce((sum, action) => sum + Number(action.value ?? 0), 0);
      const values = {
        tenantId: actor.tenantId,
        connectionId: row.id,
        insightDate: new Date(`${String(insight.date_start)}T00:00:00.000Z`),
        campaignId: String(insight.campaign_id ?? ''),
        campaignName: String(insight.campaign_name ?? ''),
        spend: String(insight.spend ?? 0),
        impressions: Number(insight.impressions ?? 0),
        clicks: Number(insight.clicks ?? 0),
        leads,
        rawMetrics: insight,
        updatedAt: new Date(),
      };
      await this.db.insert(metaDailyInsights).values(values).onConflictDoUpdate({ target: [metaDailyInsights.connectionId, metaDailyInsights.insightDate, metaDailyInsights.campaignId], set: values });
    }
    await this.db.update(metaConnections).set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(metaConnections.id, row.id));
    return { imported: response.data.length };
  }

  async listCampaigns(actor: AuthContext, connectionId: string) {
    const { row, token } = await this.authorizedConnection(actor, connectionId);
    if (!row.adAccountId) throw new ValidationError('Bağlantıda reklam hesabı tanımlı değil');
    return this.graph.get<GraphList<Record<string, unknown>>>(token, `${this.adAccount(row)}/campaigns`, { fields: 'id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget,created_time,updated_time', limit: 100 });
  }

  async createCampaign(actor: AuthContext, input: MetaCampaignCreateInput) {
    const { row, token } = await this.authorizedConnection(actor, input.connectionId);
    if (!row.adAccountId) throw new ValidationError('Bağlantıda reklam hesabı tanımlı değil');
    const created = await this.graph.post<GraphId>(token, `${this.adAccount(row)}/campaigns`, {
      name: input.name,
      objective: input.objective,
      buying_type: input.buyingType,
      special_ad_categories: input.specialAdCategories,
      status: 'PAUSED',
    });
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'meta.campaign.created', resourceType: 'meta_campaign', resourceId: created.id, newValues: { ...input, connectionId: row.id } });
    return created;
  }

  async updateCampaign(actor: AuthContext, campaignId: string, input: MetaCampaignUpdateInput) {
    const { token } = await this.authorizedConnection(actor, input.connectionId);
    const result = await this.graph.post<GraphId>(token, campaignId, {
      ...(input.status ? { status: input.status } : {}),
      ...(input.dailyBudgetMinor !== undefined ? { daily_budget: input.dailyBudgetMinor } : {}),
    });
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'meta.campaign.updated', resourceType: 'meta_campaign', resourceId: campaignId, newValues: { status: input.status, dailyBudgetMinor: input.dailyBudgetMinor } });
    return result;
  }

  async deleteCampaign(actor: AuthContext, campaignId: string, input: MetaDestructiveConfirmationInput) {
    const { token } = await this.authorizedConnection(actor, input.connectionId);
    const result = await this.graph.post<GraphId>(token, campaignId, { status: 'DELETED' });
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'meta.campaign.deleted', resourceType: 'meta_campaign', resourceId: campaignId });
    return result;
  }

  async listConversations(actor: AuthContext, query: MetaListQuery) {
    const where = and(eq(metaMessages.tenantId, actor.tenantId), query.connectionId ? eq(metaMessages.connectionId, query.connectionId) : undefined);
    return this.db.select({
      connectionId: metaMessages.connectionId,
      conversationExternalId: metaMessages.conversationExternalId,
      channel: metaMessages.channel,
      lastMessageAt: sql<Date>`max(${metaMessages.sentAt})`,
      messageCount: sql<number>`count(*)::int`,
    }).from(metaMessages).where(where).groupBy(metaMessages.connectionId, metaMessages.conversationExternalId, metaMessages.channel).orderBy(desc(sql`max(${metaMessages.sentAt})`)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
  }

  listMessages(actor: AuthContext, conversationId: string, query: MetaListQuery) {
    return this.db.select().from(metaMessages).where(and(eq(metaMessages.tenantId, actor.tenantId), eq(metaMessages.conversationExternalId, conversationId), query.connectionId ? eq(metaMessages.connectionId, query.connectionId) : undefined)).orderBy(desc(metaMessages.sentAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
  }

  async sendMessage(actor: AuthContext, conversationId: string, input: MetaConversationMessageCreateInput) {
    const { row, token } = await this.authorizedConnection(actor, input.connectionId);
    let remote: GraphId & { messages?: Array<{ id: string }> };
    let recipientId: string;
    if (input.channel === 'whatsapp') {
      if (!row.phoneNumberId) throw new ValidationError('Bağlantıda WhatsApp telefon numarası tanımlı değil');
      recipientId = conversationId;
      remote = await this.graph.post(token, `${row.phoneNumberId}/messages`, { messaging_product: 'whatsapp', recipient_type: 'individual', to: conversationId, type: 'text', text: { preview_url: false, body: input.text } });
    } else {
      if (!row.pageId) throw new ValidationError('Bağlantıda Facebook sayfası tanımlı değil');
      recipientId = conversationId;
      remote = await this.graph.post(token, `${row.pageId}/messages`, { recipient: { id: conversationId }, messaging_type: 'RESPONSE', message: { text: input.text } });
    }
    const remoteId = remote.messages?.[0]?.id ?? remote.id;
    if (!remoteId) throw new ConflictError('Meta mesaj kimliği döndürmedi');
    const [stored] = await this.db.insert(metaMessages).values({ tenantId: actor.tenantId, connectionId: row.id, channel: input.channel, conversationExternalId: conversationId, remoteId, direction: 'outbound', recipientExternalId: recipientId, text: input.text, status: 'sent', sentAt: new Date(), rawMetadata: {} }).onConflictDoNothing().returning();
    return stored ?? { remoteId, status: 'sent' };
  }

  async listComments(actor: AuthContext, connectionId: string) {
    const { row, token } = await this.authorizedConnection(actor, connectionId);
    const sourceId = row.instagramAccountId ?? row.pageId;
    if (!sourceId) throw new ValidationError('Bağlantıda yorum kaynağı tanımlı değil');
    const collection = row.instagramAccountId ? 'media' : 'feed';
    return this.graph.get<GraphList<Record<string, unknown>>>(token, `${sourceId}/${collection}`, { fields: 'id,caption,message,timestamp,created_time,comments.limit(50){id,text,message,username,from,timestamp,created_time,like_count,hidden}', limit: 50 });
  }

  async replyComment(actor: AuthContext, commentId: string, input: MetaCommentReplyCreateInput) {
    const { token } = await this.authorizedConnection(actor, input.connectionId);
    return this.graph.post<GraphId>(token, `${commentId}/replies`, { message: input.message });
  }

  async updateComment(actor: AuthContext, commentId: string, input: MetaCommentUpdateInput) {
    const { token } = await this.authorizedConnection(actor, input.connectionId);
    return this.graph.post<GraphId>(token, commentId, { hide: input.hidden });
  }

  listAudiences(actor: AuthContext) {
    return this.db.select().from(metaAudiences).where(and(eq(metaAudiences.tenantId, actor.tenantId), isNull(metaAudiences.deletedAt))).orderBy(metaAudiences.name);
  }

  async createAudience(actor: AuthContext, input: MetaAudienceCreateInput) {
    const { row, token } = await this.authorizedConnection(actor, input.connectionId);
    if (!row.adAccountId) throw new ValidationError('Bağlantıda reklam hesabı tanımlı değil');
    const remote = await this.graph.post<GraphId>(token, `${this.adAccount(row)}/customaudiences`, { name: input.name, description: input.description ?? '', subtype: 'CUSTOM', customer_file_source: input.customerFileSource });
    const [created] = await this.db.insert(metaAudiences).values({ tenantId: actor.tenantId, connectionId: row.id, remoteId: remote.id, name: input.name, description: input.description ?? null, customerFileSource: input.customerFileSource, createdBy: actor.userId, updatedBy: actor.userId }).returning();
    return created;
  }

  async updateAudience(actor: AuthContext, id: string, input: MetaAudienceUpdateInput) {
    const local = await this.audience(actor, id);
    const { token } = await this.authorizedConnection(actor, input.connectionId);
    if (local.connectionId !== input.connectionId) throw new ValidationError('Bağlantı audience ile eşleşmiyor');
    await this.graph.post<GraphId>(token, local.remoteId, { ...(input.name ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description } : {}) });
    const [updated] = await this.db.update(metaAudiences).set({ ...(input.name ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description } : {}), updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(metaAudiences.id, id), eq(metaAudiences.tenantId, actor.tenantId))).returning();
    return updated;
  }

  async addAudienceMembers(actor: AuthContext, id: string, input: MetaAudienceMembersInput) {
    const result = await this.changeAudienceMembers(actor, id, input, 'add');
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'meta.audience.members_added', resourceType: 'meta_audience', resourceId: id, newValues: { memberCount: input.opportunityIds.length, legalBasisConfirmed: true } });
    return result;
  }

  async removeAudienceMembers(actor: AuthContext, id: string, input: MetaAudienceMembersRemoveInput) {
    const result = await this.changeAudienceMembers(actor, id, input, 'remove');
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'meta.audience.members_removed', resourceType: 'meta_audience', resourceId: id, newValues: { memberCount: input.opportunityIds.length } });
    return result;
  }

  async deleteAudience(actor: AuthContext, id: string, input: MetaDestructiveConfirmationInput) {
    const local = await this.audience(actor, id);
    const { token } = await this.authorizedConnection(actor, input.connectionId);
    if (local.connectionId !== input.connectionId) throw new ValidationError('Bağlantı audience ile eşleşmiyor');
    await this.graph.delete<GraphId>(token, local.remoteId);
    const [removed] = await this.db.update(metaAudiences).set({ deletedAt: new Date(), status: 'deleted', updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(metaAudiences.id, id), eq(metaAudiences.tenantId, actor.tenantId))).returning();
    return removed;
  }

  listCatalogs(actor: AuthContext) {
    return this.db.select().from(metaCatalogs).where(and(eq(metaCatalogs.tenantId, actor.tenantId), isNull(metaCatalogs.deletedAt))).orderBy(metaCatalogs.name);
  }

  async createCatalog(actor: AuthContext, input: MetaCatalogCreateInput) {
    const { row, token } = await this.authorizedConnection(actor, input.connectionId);
    if (!row.businessId) throw new ValidationError('Bağlantıda Meta Business kimliği tanımlı değil');
    const remote = await this.graph.post<GraphId>(token, `${row.businessId}/owned_product_catalogs`, { name: input.name, vertical: input.vertical });
    const [created] = await this.db.insert(metaCatalogs).values({ tenantId: actor.tenantId, connectionId: row.id, remoteId: remote.id, name: input.name, vertical: input.vertical, createdBy: actor.userId, updatedBy: actor.userId }).returning();
    return created;
  }

  async updateCatalog(actor: AuthContext, id: string, input: MetaCatalogUpdateInput) {
    const local = await this.catalog(actor, id);
    const { token } = await this.authorizedConnection(actor, input.connectionId);
    if (local.connectionId !== input.connectionId) throw new ValidationError('Bağlantı katalog ile eşleşmiyor');
    await this.graph.post<GraphId>(token, local.remoteId, { name: input.name });
    const [updated] = await this.db.update(metaCatalogs).set({ name: input.name, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(metaCatalogs.id, id), eq(metaCatalogs.tenantId, actor.tenantId))).returning();
    return updated;
  }

  async upsertCatalogProducts(actor: AuthContext, id: string, input: MetaCatalogProductsInput) {
    const local = await this.catalog(actor, id);
    const { token } = await this.authorizedConnection(actor, input.connectionId);
    if (local.connectionId !== input.connectionId) throw new ValidationError('Bağlantı katalog ile eşleşmiyor');
    const requests = (await this.catalogProductRequests(actor, input.productIds)).map((item) => ({ method: 'UPDATE', retailer_id: item.retailerId, data: item.data }));
    return this.graph.post<Record<string, unknown>>(token, `${local.remoteId}/items_batch`, { item_type: 'PRODUCT_ITEM', requests });
  }

  async deleteCatalogProduct(actor: AuthContext, id: string, input: MetaCatalogProductDeleteInput) {
    const local = await this.catalog(actor, id);
    const { token } = await this.authorizedConnection(actor, input.connectionId);
    if (local.connectionId !== input.connectionId) throw new ValidationError('Bağlantı katalog ile eşleşmiyor');
    const rows = await this.db.select({ id: productModels.id, retailerId: productModels.modelCode }).from(productModels).where(and(eq(productModels.tenantId, actor.tenantId), inArray(productModels.id, input.productIds), isNull(productModels.deletedAt)));
    if (rows.length !== new Set(input.productIds).size) throw new ValidationError('Katalog ürünlerinden biri bu tenant içinde bulunamadı');
    const requests = rows.map((item) => ({ method: 'DELETE', retailer_id: item.retailerId }));
    return this.graph.post<Record<string, unknown>>(token, `${local.remoteId}/items_batch`, { item_type: 'PRODUCT_ITEM', requests });
  }

  async deleteCatalog(actor: AuthContext, id: string, input: MetaDestructiveConfirmationInput) {
    const local = await this.catalog(actor, id);
    const { token } = await this.authorizedConnection(actor, input.connectionId);
    if (local.connectionId !== input.connectionId) throw new ValidationError('Bağlantı katalog ile eşleşmiyor');
    await this.graph.delete<GraphId>(token, local.remoteId);
    const [removed] = await this.db.update(metaCatalogs).set({ deletedAt: new Date(), status: 'deleted', updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(metaCatalogs.id, id), eq(metaCatalogs.tenantId, actor.tenantId))).returning();
    return removed;
  }

  listConversionEvents(actor: AuthContext, query: MetaListQuery) {
    return this.db.select().from(metaConversionEvents).where(and(eq(metaConversionEvents.tenantId, actor.tenantId), query.connectionId ? eq(metaConversionEvents.connectionId, query.connectionId) : undefined)).orderBy(desc(metaConversionEvents.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
  }

  async createConversionEvent(actor: AuthContext, input: MetaConversionEventCreateInput) {
    const connection = await this.connection(actor, input.connectionId);
    if (!connection.datasetId) throw new ValidationError('Bağlantıda Meta dataset/pixel kimliği tanımlı değil');
    const opportunity = await this.db.query.opportunities.findFirst({ where: and(eq(opportunities.id, input.opportunityId), eq(opportunities.tenantId, actor.tenantId), isNull(opportunities.deletedAt), resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`) });
    if (!opportunity) throw new NotFoundError('Fırsat');
    const payload = {
      event_name: input.eventName,
      event_time: Math.floor(new Date(input.occurredAt).getTime() / 1000),
      event_id: input.eventId,
      action_source: 'system_generated',
      user_data: {
        ...(input.userData.emailSha256 ? { em: [input.userData.emailSha256.toLowerCase()] } : {}),
        ...(input.userData.phoneSha256 ? { ph: [input.userData.phoneSha256.toLowerCase()] } : {}),
        ...(input.userData.clientIpAddress ? { client_ip_address: input.userData.clientIpAddress } : {}),
        ...(input.userData.clientUserAgent ? { client_user_agent: input.userData.clientUserAgent } : {}),
        ...(input.userData.fbc ? { fbc: input.userData.fbc } : {}),
        ...(input.userData.fbp ? { fbp: input.userData.fbp } : {}),
      },
      custom_data: { ...(input.value !== undefined ? { value: input.value } : {}), ...(input.currency ? { currency: input.currency } : {}), ...(input.customData ?? {}) },
    };
    const [created] = await this.db.insert(metaConversionEvents).values({ tenantId: actor.tenantId, connectionId: input.connectionId, opportunityId: input.opportunityId, eventId: input.eventId, eventName: input.eventName, occurredAt: new Date(input.occurredAt), payload, createdBy: actor.userId, updatedBy: actor.userId }).onConflictDoNothing().returning();
    if (created) return created;
    const existing = await this.db.query.metaConversionEvents.findFirst({ where: and(eq(metaConversionEvents.tenantId, actor.tenantId), eq(metaConversionEvents.eventId, input.eventId)) });
    if (!existing) throw new ConflictError('Dönüşüm olayı oluşturulamadı');
    return existing;
  }

  async connectionByAssetId(assetId: string): Promise<ConnectionRow | undefined> {
    return this.db.query.metaConnections.findFirst({ where: and(or(eq(metaConnections.pageId, assetId), eq(metaConnections.instagramAccountId, assetId), eq(metaConnections.phoneNumberId, assetId), eq(metaConnections.whatsappBusinessAccountId, assetId)), eq(metaConnections.status, 'active'), isNull(metaConnections.deletedAt)) });
  }

  decryptConnectionToken(row: ConnectionRow): string {
    return this.credentials.decryptAccessToken(row.tenantId, row.id, row.accessTokenEncrypted);
  }

  private async connection(actor: AuthContext, id: string, includeDisabled = false): Promise<ConnectionRow> {
    const row = await this.db.query.metaConnections.findFirst({ where: and(eq(metaConnections.id, id), eq(metaConnections.tenantId, actor.tenantId), isNull(metaConnections.deletedAt), includeDisabled ? undefined : eq(metaConnections.status, 'active')) });
    if (!row) throw new NotFoundError('Meta bağlantısı');
    return row;
  }

  private async authorizedConnection(actor: AuthContext, id: string) {
    const row = await this.connection(actor, id);
    if (row.tokenExpiresAt && row.tokenExpiresAt <= new Date()) throw new ValidationError('Meta erişim tokenının süresi dolmuş');
    return { row, token: this.decryptConnectionToken(row) };
  }

  private publicConnection(row: ConnectionRow) {
    const { accessTokenEncrypted: _secret, ...safe } = row;
    return safe;
  }

  private async assertAssignments(actor: AuthContext, divisionId?: string | null, ownerUserId?: string | null) {
    if (divisionId) {
      const division = await this.db.query.divisions.findFirst({ where: and(eq(divisions.id, divisionId), eq(divisions.tenantId, actor.tenantId)) });
      if (!division) throw new ValidationError('Bölüm bu tenant içinde değil');
    }
    if (ownerUserId) {
      const user = await this.db.query.users.findFirst({ where: and(eq(users.id, ownerUserId), eq(users.tenantId, actor.tenantId)) });
      if (!user) throw new ValidationError('Temsilci bu tenant içinde değil');
    }
  }

  private adAccount(row: ConnectionRow): string {
    if (!row.adAccountId) throw new ValidationError('Bağlantıda reklam hesabı tanımlı değil');
    return row.adAccountId.startsWith('act_') ? row.adAccountId : `act_${row.adAccountId}`;
  }

  private dateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private async audience(actor: AuthContext, id: string) {
    const row = await this.db.query.metaAudiences.findFirst({ where: and(eq(metaAudiences.id, id), eq(metaAudiences.tenantId, actor.tenantId), isNull(metaAudiences.deletedAt)) });
    if (!row) throw new NotFoundError('Meta audience');
    return row;
  }

  private async catalog(actor: AuthContext, id: string) {
    const row = await this.db.query.metaCatalogs.findFirst({ where: and(eq(metaCatalogs.id, id), eq(metaCatalogs.tenantId, actor.tenantId), isNull(metaCatalogs.deletedAt)) });
    if (!row) throw new NotFoundError('Meta kataloğu');
    return row;
  }

  private async changeAudienceMembers(actor: AuthContext, id: string, input: MetaAudienceMembersInput | MetaAudienceMembersRemoveInput, operation: 'add' | 'remove') {
    const local = await this.audience(actor, id);
    const { token } = await this.authorizedConnection(actor, input.connectionId);
    if (local.connectionId !== input.connectionId) throw new ValidationError('Bağlantı audience ile eşleşmiyor');
    const leads = await this.db.select({ email: opportunities.leadEmail, phone: opportunities.leadPhone }).from(opportunities).where(and(eq(opportunities.tenantId, actor.tenantId), inArray(opportunities.id, input.opportunityIds), isNull(opportunities.deletedAt), resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`));
    if (leads.length !== new Set(input.opportunityIds).size) throw new ValidationError('Audience üyelerinden biri bu tenant içinde bulunamadı');
    const data = leads.flatMap((lead) => {
      const email = lead.email?.trim().toLowerCase();
      const phone = lead.phone?.replace(/\D/g, '');
      if (!email && !phone) return [];
      return [[email ? this.sha256(email) : '', phone ? this.sha256(phone) : '']];
    });
    if (data.length === 0) throw new ValidationError('Seçilen leadlerde e-posta veya telefon bulunamadı');
    const payload = { schema: ['EMAIL_SHA256', 'PHONE_SHA256'], data };
    return operation === 'add'
      ? this.graph.post<Record<string, unknown>>(token, `${local.remoteId}/users`, { payload })
      : this.graph.deleteBody<Record<string, unknown>>(token, `${local.remoteId}/users`, { payload });
  }

  private async catalogProductRequests(actor: AuthContext, productIds: string[]) {
    const rows = await this.db.select({
      id: productModels.id,
      modelCode: productModels.modelCode,
      fullName: productModels.fullName,
      description: productModels.description,
      listPrice: productModels.listPrice,
      imageUrl: productModels.imageUrl,
      isActive: productModels.isActive,
      currency: currencies.code,
    }).from(productModels).leftJoin(currencies, eq(productModels.currencyId, currencies.id)).where(and(eq(productModels.tenantId, actor.tenantId), inArray(productModels.id, productIds), isNull(productModels.deletedAt)));
    if (rows.length !== new Set(productIds).size) throw new ValidationError('Katalog ürünlerinden biri bu tenant içinde bulunamadı');
    const publicUrl = loadEnv().APP_PUBLIC_URL;
    if (!publicUrl) throw new ValidationError('Katalog senkronizasyonu için APP_PUBLIC_URL ayarlanmalıdır');
    return rows.map((row) => {
      if (!row.listPrice || !row.currency || !row.imageUrl) throw new ValidationError(`${row.fullName} için fiyat, para birimi ve görsel zorunludur`);
      const imageUrl = new URL(row.imageUrl, publicUrl).toString();
      return {
        retailerId: row.modelCode,
        data: {
          name: row.fullName,
          description: row.description ?? '',
          availability: row.isActive ? 'in stock' : 'out of stock',
          condition: 'new',
          price: `${Math.round(Number(row.listPrice) * 100)} ${row.currency}`,
          url: new URL(`/products/${row.id}`, publicUrl).toString(),
          image_url: imageUrl,
        },
      };
    });
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private verifyOauthState(state: string) {
    const [payload, signature, extra] = state.split('.');
    if (!payload || !signature || extra) throw new ValidationError('Meta OAuth state geçersiz');
    const expected = createHmac('sha256', this.graph.appSecret()).update(payload).digest('base64url');
    const suppliedBytes = Buffer.from(signature, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) throw new ValidationError('Meta OAuth state geçersiz');
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new ValidationError('Meta OAuth state geçersiz');
    }
    const parsed = oauthStateSchema.safeParse(decoded);
    if (!parsed.success) throw new ValidationError('Meta OAuth state geçersiz');
    const identity = parsed.data;
    if (Date.now() - identity.issuedAt > 10 * 60_000 || identity.issuedAt > Date.now() + 60_000) throw new ValidationError('Meta OAuth oturumunun süresi doldu');
    return identity;
  }
}
