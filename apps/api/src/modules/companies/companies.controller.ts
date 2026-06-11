import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  companyCreateSchema,
  companyUpdateSchema,
  companyListQuerySchema,
  paginationSchema,
  type CompanyCreateInput,
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
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.get(id, user);
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
