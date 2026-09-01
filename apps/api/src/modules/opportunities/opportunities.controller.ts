import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  opportunityCreateSchema,
  opportunityUpdateSchema,
  opportunityStageChangeSchema,
  opportunityCompanyLinkSchema,
  opportunityApprovalDecisionSchema,
  opportunityApprovalTypeEnum,
  opportunityCloseSchema,
  opportunityDeferSchema,
  opportunityConvertSchema,
  leadContactEventSchema,
  opportunityQualificationChangeSchema,
  opportunityProcessCheckUpsertSchema,
  opportunityQualificationStageEnum,
  trelloImportCommitRequestSchema,
  trelloImportPreviewRequestSchema,
  opportunityViewEnum,
  paginationSchema,
  type OpportunityCreateInput,
  type OpportunityUpdateInput,
  type OpportunityStageChangeInput,
  type OpportunityCompanyLinkInput,
  type OpportunityApprovalDecisionInput,
  type OpportunityCloseInput,
  type OpportunityDeferInput,
  type OpportunityConvertInput,
  type LeadContactEventInput,
  type OpportunityQualificationChangeInput,
  type OpportunityProcessCheckUpsertInput,
  type OpportunityApprovalType,
  type TrelloImportCommitRequest,
  type TrelloImportPreviewRequest,
  type Pagination,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { OpportunitiesService } from './opportunities.service';

const listQuery = z.object({
  search: z.string().optional(),
  stageCode: z.string().optional(),
  qualificationStage: opportunityQualificationStageEnum.optional(),
  lifecycle: z.enum(['lead', 'opportunity']).optional(),
  companyId: z.string().optional(),
  // active (varsayılan) | closed (Geçmiş/Arşiv) | all
  view: opportunityViewEnum.optional(),
  lostReasonCode: z.string().trim().max(64).optional(),
  wonReason: z.string().trim().max(255).optional(),
  followUp: z.enum(['true']).optional(),
});

const TRELLO_IMPORT_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly svc: OpportunitiesService) {}

  @RequirePermissions('opportunities.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(listQuery.merge(paginationSchema)))
    qp: z.infer<typeof listQuery> & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.list(user, query, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('opportunities.read')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('lead-summary')
  leadSummary(@CurrentUser() user: AuthContext) {
    return this.svc.leadSummary(user);
  }

  @RequirePermissions('opportunities.read')
  @Get('assignees')
  assignees(@CurrentUser() user: AuthContext) {
    return this.svc.listAssignableOwners(user);
  }

  @RequirePermissions('opportunities.read')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.get(id, user);
  }

  @RequirePermissions('opportunities.create')
  @Post()
  create(
    @Body(new ZodValidationPipe(opportunityCreateSchema)) body: OpportunityCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.create(body, user);
  }

  @RequirePermissions('activities.convert')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('from-activity/:activityId')
  createFromActivity(
    @Param('activityId') activityId: string,
    @Body(new ZodValidationPipe(opportunityCreateSchema)) body: OpportunityCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.create({ ...body, sourceActivityId: activityId }, user);
  }

  @RequirePermissions('opportunities.create')
  @Throttle(TRELLO_IMPORT_THROTTLE)
  @Post('imports/trello/preview')
  previewTrelloImport(
    @Body(new ZodValidationPipe(trelloImportPreviewRequestSchema)) body: TrelloImportPreviewRequest,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.previewTrelloImport(body, user);
  }

  @RequirePermissions('opportunities.create')
  @Throttle(TRELLO_IMPORT_THROTTLE)
  @Post('imports/trello/commit')
  commitTrelloImport(
    @Body(new ZodValidationPipe(trelloImportCommitRequestSchema)) body: TrelloImportCommitRequest,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.commitTrelloImport(body, user);
  }

  @RequirePermissions('opportunities.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(opportunityUpdateSchema)) body: OpportunityUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.update(id, body, user);
  }

  @RequirePermissions('opportunities.update', 'companies.read')
  @Post(':id/company')
  linkCompany(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(opportunityCompanyLinkSchema)) body: OpportunityCompanyLinkInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.linkCompany(id, body, user);
  }

  @RequirePermissions('opportunities.update')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/contact-events')
  recordLeadContactEvent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(leadContactEventSchema)) body: LeadContactEventInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.recordLeadContactEvent(id, body, user);
  }

  @RequirePermissions('opportunities.update')
  @Post(':id/convert')
  convertLead(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(opportunityConvertSchema)) body: OpportunityConvertInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.convertLead(id, body, user);
  }

  @RequirePermissions('opportunities.update')
  @Patch(':id/qualification-stage')
  changeQualificationStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(opportunityQualificationChangeSchema)) body: OpportunityQualificationChangeInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.changeQualificationStage(id, body, user);
  }

  @RequirePermissions('opportunities.update')
  @Patch(':id/process-checks/:key')
  setProcessCheck(
    @Param('id') id: string,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(opportunityProcessCheckUpsertSchema)) body: OpportunityProcessCheckUpsertInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.setProcessCheck(id, key, body, user);
  }

  @RequirePermissions('opportunities.approve')
  @Post(':id/approvals/:type')
  decideQualificationApproval(
    @Param('id') id: string,
    @Param('type', new ZodValidationPipe(opportunityApprovalTypeEnum)) type: OpportunityApprovalType,
    @Body(new ZodValidationPipe(opportunityApprovalDecisionSchema)) body: OpportunityApprovalDecisionInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.decideQualificationApproval(id, type, body, user);
  }

  @RequirePermissions('opportunities.update')
  @Patch(':id/stage')
  changeStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(opportunityStageChangeSchema)) body: OpportunityStageChangeInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.changeStage(id, body, user);
  }

  @RequirePermissions('opportunities.update')
  @Post(':id/defer')
  defer(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(opportunityDeferSchema)) body: OpportunityDeferInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.defer(id, body, user);
  }

  @RequirePermissions('opportunities.update')
  @Post(':id/close')
  close(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(opportunityCloseSchema)) body: OpportunityCloseInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.close(id, user, body.reason ?? null);
  }

  @RequirePermissions('opportunities.update')
  @Post(':id/reopen')
  reopen(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.reopen(id, user);
  }

  @RequirePermissions('opportunities.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.delete(id, user);
  }
}
