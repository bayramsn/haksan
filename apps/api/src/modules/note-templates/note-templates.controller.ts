import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  noteTemplateCreateSchema,
  noteTemplateListQuerySchema,
  type NoteTemplateCreateInput,
  type NoteTemplateListQuery,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { NoteTemplatesService } from './note-templates.service';

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('note-templates')
export class NoteTemplatesController {
  constructor(private readonly svc: NoteTemplatesService) {}

  @RequirePermissions('quotes.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(noteTemplateListQuerySchema)) query: NoteTemplateListQuery,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.list(user, query.scope);
  }

  @RequirePermissions('quotes.create')
  @Post()
  create(
    @Body(new ZodValidationPipe(noteTemplateCreateSchema)) body: NoteTemplateCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.create(body, user);
  }

  @RequirePermissions('quotes.create')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.delete(id, user);
  }
}
