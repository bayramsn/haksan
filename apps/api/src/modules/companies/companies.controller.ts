import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  accessRequestListQuerySchema,
  companyAccessRequestDecisionSchema,
  companyAccessRequestSchema,
  companyCreateSchema,
  companyLocationSchema,
  companyOsmSearchQuerySchema,
  companyUpdateSchema,
  companyListQuerySchema,
  paginationSchema,
  type AccessRequestListQuery,
  type CompanyAccessRequestDecisionInput,
  type CompanyAccessRequestInput,
  type CompanyCreateInput,
  type CompanyLocationInput,
  type CompanyOsmSearchQuery,
  type CompanyUpdateInput,
  type CompanyListQuery,
  type Pagination,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { CompaniesService } from './companies.service';

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly svc: CompaniesService) {}

  @RequirePermissions('companies.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(companyListQuerySchema.merge(paginationSchema)))
    qp: CompanyListQuery & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.list(user, query, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('companies.read')
  @Get('osm-search')
  osmSearch(
    @Query(new ZodValidationPipe(companyOsmSearchQuerySchema))
    query: CompanyOsmSearchQuery,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.searchOpenStreetMap(query, user);
  }

  @RequirePermissions('companies.read')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.get(id, user);
  }

  @RequirePermissions('companies.read')
  @Get(':id/cross-department-debt')
  crossDepartmentDebt(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.crossDivisionDebt(id, user);
  }

  @RequirePermissions('companies.create')
  @Post(':id/access-requests')
  createAccessRequest(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(companyAccessRequestSchema)) body: CompanyAccessRequestInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.createAccessRequest(id, body, user);
  }

  @RequirePermissions('companies.create')
  @Post()
  create(
    @Body(new ZodValidationPipe(companyCreateSchema)) body: CompanyCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.create(body, user);
  }

  @RequirePermissions('companies.update')
  @Patch(':id/location')
  setLocation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(companyLocationSchema)) body: CompanyLocationInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.setLocation(id, body, user);
  }

  @RequirePermissions('companies.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(companyUpdateSchema)) body: CompanyUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.update(id, body, user);
  }

  @RequirePermissions('companies.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.delete(id, user);
  }
}

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('access-requests')
export class AccessRequestsController {
  constructor(private readonly svc: CompaniesService) {}

  @RequirePermissions('companies.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(accessRequestListQuerySchema.merge(paginationSchema)))
    qp: AccessRequestListQuery & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.listAccessRequests(user, query, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('companies.update')
  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(companyAccessRequestDecisionSchema)) body: CompanyAccessRequestDecisionInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.decideAccessRequest(id, 'approved', body, user);
  }

  @RequirePermissions('companies.update')
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(companyAccessRequestDecisionSchema)) body: CompanyAccessRequestDecisionInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.decideAccessRequest(id, 'rejected', body, user);
  }
}
