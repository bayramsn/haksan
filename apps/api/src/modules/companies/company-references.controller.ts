import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  companyReferenceCreateSchema,
  companyReferenceUpdateSchema,
  type CompanyReferenceCreateInput,
  type CompanyReferenceUpdateInput,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { CompanyReferencesService } from './company-references.service';

/** Referanslar sayfası; yetkiler firma kartıyla aynı (companies.*). */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('references')
export class CompanyReferencesController {
  constructor(private readonly svc: CompanyReferencesService) {}

  @RequirePermissions('companies.read')
  @Get()
  list(@CurrentUser() user: AuthContext) {
    return this.svc.list(user);
  }

  @RequirePermissions('companies.create')
  @Post()
  create(
    @Body(new ZodValidationPipe(companyReferenceCreateSchema)) body: CompanyReferenceCreateInput,
    @CurrentUser() user: AuthContext,
  ) {
    return this.svc.create(body, user);
  }

  @RequirePermissions('companies.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(companyReferenceUpdateSchema)) body: CompanyReferenceUpdateInput,
    @CurrentUser() user: AuthContext,
  ) {
    return this.svc.update(id, body, user);
  }

  @RequirePermissions('companies.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.delete(id, user);
  }
}
