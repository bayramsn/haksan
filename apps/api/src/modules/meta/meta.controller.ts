import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  metaAudienceCreateSchema,
  metaAudienceMembersRemoveSchema,
  metaAudienceMembersSchema,
  metaAudienceUpdateSchema,
  metaCampaignCreateSchema,
  metaCampaignUpdateSchema,
  metaCatalogCreateSchema,
  metaCatalogProductDeleteSchema,
  metaCatalogProductsSchema,
  metaCatalogUpdateSchema,
  metaCommentReplyCreateSchema,
  metaCommentUpdateSchema,
  metaConnectionCreateSchema,
  metaConnectionUpdateSchema,
  metaConversationMessageCreateSchema,
  metaConversionEventCreateSchema,
  metaDateRangeQuerySchema,
  metaDestructiveConfirmationSchema,
  metaFormMappingCreateSchema,
  metaFormMappingUpdateSchema,
  metaListQuerySchema,
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
import { loadEnv } from '../../config/env';
import { AuthGuard } from '../../shared/security/auth.guard';
import type { AuthContext } from '../../shared/security/auth.types';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { ForbiddenError } from '../../shared/utils/errors';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { MetaJobsService } from './meta-jobs.service';
import { MetaService } from './meta.service';
import { MetaWebhookService, webhookPayloadSchema } from './meta-webhook.service';

const connectionQuerySchema = z.object({ connectionId: z.string().uuid() });
const destructiveQuerySchema = metaDestructiveConfirmationSchema;
const remoteIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:+-]+$/);

@UseGuards(AuthGuard, PermissionsGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('meta')
export class MetaController {
  constructor(private readonly service: MetaService, private readonly jobs: MetaJobsService) {}

  @Get('overview')
  @RequirePermissions('meta.read')
  overview(@CurrentUser() actor: AuthContext) { return this.service.overview(actor); }

  @Get('connections')
  @RequirePermissions('meta.read')
  connections(@CurrentUser() actor: AuthContext) { return this.service.listConnections(actor); }

  @Post('connections')
  @RequirePermissions('meta.create')
  createConnection(@Body(new ZodValidationPipe(metaConnectionCreateSchema)) body: MetaConnectionCreateInput, @CurrentUser() actor: AuthContext) { return this.service.createConnection(actor, body); }

  @Post('connections/oauth/start')
  @RequirePermissions('meta.create')
  startOauth(@CurrentUser() actor: AuthContext) { return this.service.startOauth(actor); }

  @Patch('connections/:id')
  @RequirePermissions('meta.update')
  updateConnection(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(metaConnectionUpdateSchema)) body: MetaConnectionUpdateInput, @CurrentUser() actor: AuthContext) { return this.service.updateConnection(actor, id, body); }

  @Delete('connections/:id')
  @RequirePermissions('meta.delete')
  deleteConnection(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() actor: AuthContext) { return this.service.deleteConnection(actor, id); }

  @Post('connections/:id/verify')
  @RequirePermissions('meta.update')
  verifyConnection(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() actor: AuthContext) { return this.service.verifyConnection(actor, id); }

  @Get('form-mappings')
  @RequirePermissions('meta.read')
  formMappings(@CurrentUser() actor: AuthContext) { return this.service.listFormMappings(actor); }

  @Post('form-mappings')
  @RequirePermissions('meta.create')
  createFormMapping(@Body(new ZodValidationPipe(metaFormMappingCreateSchema)) body: MetaFormMappingCreateInput, @CurrentUser() actor: AuthContext) { return this.service.createFormMapping(actor, body); }

  @Patch('form-mappings/:id')
  @RequirePermissions('meta.update')
  updateFormMapping(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(metaFormMappingUpdateSchema)) body: MetaFormMappingUpdateInput, @CurrentUser() actor: AuthContext) { return this.service.updateFormMapping(actor, id, body); }

  @Delete('form-mappings/:id')
  @RequirePermissions('meta.delete')
  deleteFormMapping(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() actor: AuthContext) { return this.service.deleteFormMapping(actor, id); }

  @Get('leads')
  @RequirePermissions('meta.read')
  leads(@Query(new ZodValidationPipe(metaListQuerySchema)) query: MetaListQuery, @CurrentUser() actor: AuthContext) { return this.service.listLeads(actor, query); }

  @Get('insights')
  @RequirePermissions('meta.read')
  insights(@Query(new ZodValidationPipe(metaDateRangeQuerySchema)) query: MetaDateRangeQuery, @CurrentUser() actor: AuthContext) { return this.service.listInsights(actor, query); }

  @Post('insights/sync')
  @RequirePermissions('meta.update')
  syncInsights(@Body(new ZodValidationPipe(metaDateRangeQuerySchema)) body: MetaDateRangeQuery, @CurrentUser() actor: AuthContext) {
    if (!body.connectionId) throw new ForbiddenError('connectionId zorunludur');
    return this.service.syncInsights(actor, body.connectionId, body.from, body.to);
  }

  @Get('campaigns')
  @RequirePermissions('meta_campaigns.read')
  campaigns(@Query(new ZodValidationPipe(connectionQuerySchema)) query: { connectionId: string }, @CurrentUser() actor: AuthContext) { return this.service.listCampaigns(actor, query.connectionId); }

  @Post('campaigns')
  @RequirePermissions('meta_campaigns.create')
  createCampaign(@Body(new ZodValidationPipe(metaCampaignCreateSchema)) body: MetaCampaignCreateInput, @CurrentUser() actor: AuthContext) { return this.service.createCampaign(actor, body); }

  @Patch('campaigns/:id')
  @RequirePermissions('meta_campaigns.update')
  updateCampaign(@Param('id', new ZodValidationPipe(remoteIdSchema)) id: string, @Body(new ZodValidationPipe(metaCampaignUpdateSchema)) body: MetaCampaignUpdateInput, @CurrentUser() actor: AuthContext) {
    if ((body.status === 'ACTIVE' || body.dailyBudgetMinor !== undefined) && !actor.permissions.has('meta_campaigns.approve')) throw new ForbiddenError('Kampanya aktivasyonu veya bütçe değişikliği onayı gerekli');
    return this.service.updateCampaign(actor, id, body);
  }

  @Delete('campaigns/:id')
  @RequirePermissions('meta_campaigns.delete')
  deleteCampaign(@Param('id', new ZodValidationPipe(remoteIdSchema)) id: string, @Query(new ZodValidationPipe(destructiveQuerySchema)) query: MetaDestructiveConfirmationInput, @CurrentUser() actor: AuthContext) { return this.service.deleteCampaign(actor, id, query); }

  @Get('conversations')
  @RequirePermissions('meta_messages.read')
  conversations(@Query(new ZodValidationPipe(metaListQuerySchema)) query: MetaListQuery, @CurrentUser() actor: AuthContext) { return this.service.listConversations(actor, query); }

  @Get('conversations/:id/messages')
  @RequirePermissions('meta_messages.read')
  messages(@Param('id', new ZodValidationPipe(remoteIdSchema)) id: string, @Query(new ZodValidationPipe(metaListQuerySchema)) query: MetaListQuery, @CurrentUser() actor: AuthContext) { return this.service.listMessages(actor, id, query); }

  @Post('conversations/:id/messages')
  @RequirePermissions('meta_messages.create')
  sendMessage(@Param('id', new ZodValidationPipe(remoteIdSchema)) id: string, @Body(new ZodValidationPipe(metaConversationMessageCreateSchema)) body: MetaConversationMessageCreateInput, @CurrentUser() actor: AuthContext) { return this.service.sendMessage(actor, id, body); }

  @Get('comments')
  @RequirePermissions('meta_messages.read')
  comments(@Query(new ZodValidationPipe(connectionQuerySchema)) query: { connectionId: string }, @CurrentUser() actor: AuthContext) { return this.service.listComments(actor, query.connectionId); }

  @Post('comments/:id/replies')
  @RequirePermissions('meta_messages.create')
  replyComment(@Param('id', new ZodValidationPipe(remoteIdSchema)) id: string, @Body(new ZodValidationPipe(metaCommentReplyCreateSchema)) body: MetaCommentReplyCreateInput, @CurrentUser() actor: AuthContext) { return this.service.replyComment(actor, id, body); }

  @Patch('comments/:id')
  @RequirePermissions('meta_messages.update')
  updateComment(@Param('id', new ZodValidationPipe(remoteIdSchema)) id: string, @Body(new ZodValidationPipe(metaCommentUpdateSchema)) body: MetaCommentUpdateInput, @CurrentUser() actor: AuthContext) { return this.service.updateComment(actor, id, body); }

  @Get('audiences')
  @RequirePermissions('meta_audiences.read')
  audiences(@CurrentUser() actor: AuthContext) { return this.service.listAudiences(actor); }

  @Post('audiences')
  @RequirePermissions('meta_audiences.create')
  createAudience(@Body(new ZodValidationPipe(metaAudienceCreateSchema)) body: MetaAudienceCreateInput, @CurrentUser() actor: AuthContext) { return this.service.createAudience(actor, body); }

  @Patch('audiences/:id')
  @RequirePermissions('meta_audiences.update')
  updateAudience(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(metaAudienceUpdateSchema)) body: MetaAudienceUpdateInput, @CurrentUser() actor: AuthContext) { return this.service.updateAudience(actor, id, body); }

  @Post('audiences/:id/members')
  @RequirePermissions('meta_audiences.update')
  addAudienceMembers(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(metaAudienceMembersSchema)) body: MetaAudienceMembersInput, @CurrentUser() actor: AuthContext) { return this.service.addAudienceMembers(actor, id, body); }

  @Post('audiences/:id/member-removals')
  @RequirePermissions('meta_audiences.update')
  removeAudienceMembers(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(metaAudienceMembersRemoveSchema)) body: MetaAudienceMembersRemoveInput, @CurrentUser() actor: AuthContext) { return this.service.removeAudienceMembers(actor, id, body); }

  @Delete('audiences/:id')
  @RequirePermissions('meta_audiences.delete')
  deleteAudience(@Param('id', new ParseUUIDPipe()) id: string, @Query(new ZodValidationPipe(destructiveQuerySchema)) query: MetaDestructiveConfirmationInput, @CurrentUser() actor: AuthContext) { return this.service.deleteAudience(actor, id, query); }

  @Get('catalogs')
  @RequirePermissions('meta_catalogs.read')
  catalogs(@CurrentUser() actor: AuthContext) { return this.service.listCatalogs(actor); }

  @Post('catalogs')
  @RequirePermissions('meta_catalogs.create')
  createCatalog(@Body(new ZodValidationPipe(metaCatalogCreateSchema)) body: MetaCatalogCreateInput, @CurrentUser() actor: AuthContext) { return this.service.createCatalog(actor, body); }

  @Patch('catalogs/:id')
  @RequirePermissions('meta_catalogs.update')
  updateCatalog(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(metaCatalogUpdateSchema)) body: MetaCatalogUpdateInput, @CurrentUser() actor: AuthContext) { return this.service.updateCatalog(actor, id, body); }

  @Post('catalogs/:id/products')
  @RequirePermissions('meta_catalogs.update')
  upsertCatalogProducts(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(metaCatalogProductsSchema)) body: MetaCatalogProductsInput, @CurrentUser() actor: AuthContext) { return this.service.upsertCatalogProducts(actor, id, body); }

  @Post('catalogs/:id/sync')
  @RequirePermissions('meta_catalogs.update')
  syncCatalogProducts(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(metaCatalogProductsSchema)) body: MetaCatalogProductsInput, @CurrentUser() actor: AuthContext) { return this.service.upsertCatalogProducts(actor, id, body); }

  @Post('catalogs/:id/product-removals')
  @RequirePermissions('meta_catalogs.update')
  deleteCatalogProducts(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(metaCatalogProductDeleteSchema)) body: MetaCatalogProductDeleteInput, @CurrentUser() actor: AuthContext) { return this.service.deleteCatalogProduct(actor, id, body); }

  @Delete('catalogs/:id')
  @RequirePermissions('meta_catalogs.delete')
  deleteCatalog(@Param('id', new ParseUUIDPipe()) id: string, @Query(new ZodValidationPipe(destructiveQuerySchema)) query: MetaDestructiveConfirmationInput, @CurrentUser() actor: AuthContext) { return this.service.deleteCatalog(actor, id, query); }

  @Get('conversion-events')
  @RequirePermissions('meta.read')
  conversionEvents(@Query(new ZodValidationPipe(metaListQuerySchema)) query: MetaListQuery, @CurrentUser() actor: AuthContext) { return this.service.listConversionEvents(actor, query); }

  @Post('conversion-events')
  @RequirePermissions('meta.create')
  createConversionEvent(@Body(new ZodValidationPipe(metaConversionEventCreateSchema)) body: MetaConversionEventCreateInput, @CurrentUser() actor: AuthContext) { return this.service.createConversionEvent(actor, body); }

  @Post('jobs/process')
  @RequirePermissions('meta.update')
  processJobs(@CurrentUser() actor: AuthContext) { return this.jobs.processNow(actor.tenantId); }
}

@Controller('meta/webhooks')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class MetaWebhookController {
  constructor(private readonly webhooks: MetaWebhookService) {}

  @Get()
  verify(@Query('hub.mode') mode: string | undefined, @Query('hub.verify_token') token: string | undefined, @Query('hub.challenge') challenge: string | undefined, @Res() reply: FastifyReply) {
    reply.type('text/plain').send(this.webhooks.verifyChallenge(mode, token, challenge));
  }

  @Post()
  @HttpCode(200)
  ingest(@Req() request: FastifyRequest, @Headers('x-hub-signature-256') signature: string | undefined, @Body(new ZodValidationPipe(webhookPayloadSchema)) body: unknown) {
    return this.webhooks.ingest(request.rawBody, signature, body);
  }

}

@Controller('meta/connections/oauth/callback')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class MetaOauthController {
  constructor(private readonly service: MetaService) {}

  @Get()
  async completeOauth(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    if (!code || !state || code.length > 4096 || state.length > 4096) throw new ForbiddenError('Meta OAuth callback geçersiz');
    await this.service.completeOauth(code, state);

    const appUrl = new URL(loadEnv().APP_PUBLIC_URL!);
    appUrl.searchParams.set('metaConnection', 'success');
    return reply.redirect(appUrl.toString(), 303);
  }
}
