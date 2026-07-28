import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  opportunityCreateSchema,
  opportunityUpdateSchema,
  opportunityStageChangeSchema,
  opportunityCompanyLinkSchema,
  opportunityCloseSchema,
  trelloImportCommitRequestSchema,
  trelloImportPreviewRequestSchema,
  opportunityViewEnum,
  paginationSchema,
  type OpportunityCreateInput,
  type OpportunityUpdateInput,
  type OpportunityStageChangeInput,
  type OpportunityCompanyLinkInput,
  type OpportunityCloseInput,
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
  companyId: z.string().optional(),
  // active (varsayılan) | closed (Geçmiş/Arşiv) | all
  view: opportunityViewEnum.optional(),
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
  @Patch(':id/stage')
  changeStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(opportunityStageChangeSchema)) body: OpportunityStageChangeInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.changeStage(id, body, user);
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
