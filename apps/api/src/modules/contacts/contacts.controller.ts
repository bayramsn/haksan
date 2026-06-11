import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  contactCreateSchema,
  contactUpdateSchema,
  paginationSchema,
  type ContactCreateInput,
  type ContactUpdateInput,
  type Pagination,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ContactsService } from './contacts.service';

const listQuerySchema = z.object({
  search: z.string().max(128).optional(),
  companyId: z.string().optional(),
});

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly svc: ContactsService) {}

  @RequirePermissions('contacts.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(listQuerySchema.merge(paginationSchema)))
    qp: z.infer<typeof listQuerySchema> & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.list(user, query, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('contacts.read')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.get(id, user);
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
