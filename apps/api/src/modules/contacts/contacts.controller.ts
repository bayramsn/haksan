import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  contactCreateSchema,
  contactUpdateSchema,
  paginationSchema,
  type ContactCreateInput,
  type ContactUpdateInput,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ContactsService } from './contacts.service';

export const contactListQuerySchema = z.object({
  search: z.string().trim().max(128).optional(),
  companyId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  department: z.string().trim().min(1).max(128).optional(),
  isPrimary: z.preprocess(
    (value) => value === 'true' ? true : value === 'false' ? false : value,
    z.boolean().optional(),
  ),
  isBlacklisted: z.preprocess(
    (value) => value === 'true' ? true : value === 'false' ? false : value,
    z.boolean().optional(),
  ),
});

export const contactListRequestQuerySchema = contactListQuerySchema.merge(
  paginationSchema.extend({ sortBy: z.enum(['name', 'createdAt']).optional() }),
);

export const contactSummaryQuerySchema = z.object({
  divisionId: z.string().uuid().optional(),
});

type ContactListRequestQuery = z.infer<typeof contactListRequestQuerySchema>;

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly svc: ContactsService) {}

  @RequirePermissions('contacts.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(contactListRequestQuerySchema))
    qp: ContactListRequestQuery,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.list(user, query, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('contacts.read')
  @Get('summary')
  summary(
    @Query(new ZodValidationPipe(contactSummaryQuerySchema)) query: z.infer<typeof contactSummaryQuerySchema>,
    @CurrentUser() user: AuthContext,
  ) {
    return this.svc.summary(user, query);
  }

  @RequirePermissions('contacts.read')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.get(id, user);
  }

  @RequirePermissions('contacts.read')
  @Get(':id/companies')
  companies(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.listCompanies(id, user);
  }

  @RequirePermissions('contacts.update')
  @Delete(':id/companies/:companyId')
  unlinkCompany(
    @Param('id') id: string,
    @Param('companyId') companyId: string,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.unlinkCompany(id, companyId, user);
  }

  @RequirePermissions('contacts.update')
  @Post(':id/companies/:companyId/primary')
  setPrimaryCompany(
    @Param('id') id: string,
    @Param('companyId') companyId: string,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.setPrimaryCompany(id, companyId, user);
  }

  @RequirePermissions('contacts.create')
  @Post()
  create(
    @Body(new ZodValidationPipe(contactCreateSchema)) body: ContactCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.create(body, user);
  }

  @RequirePermissions('contacts.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(contactUpdateSchema)) body: ContactUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.update(id, body, user);
  }

  @RequirePermissions('contacts.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.delete(id, user);
  }
}
