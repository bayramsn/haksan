import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  calendarEventCreateSchema,
  calendarEventUpdateSchema,
  calendarImportCommitSchema,
  calendarImportPreviewRequestSchema,
  calendarSyncSchema,
  calendarSyncSettingsSchema,
  type CalendarEventCreateInput,
  type CalendarEventUpdateInput,
  type CalendarImportCommitInput,
  type CalendarImportPreviewRequest,
  type CalendarSyncInput,
  type CalendarSyncSettingsInput,
} from '@haksan/shared';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { CalendarService } from './calendar.service';

const listQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  ownerUserId: z.string().uuid().optional(),
  includeArchived: z.enum(['true', 'false']).transform((value) => value === 'true').default('false'),
});

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @RequirePermissions('calendar.read')
  @Get('calendar/events')
  list(
    @Query(new ZodValidationPipe<any>(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.list(actor, query);
  }

  @RequirePermissions('calendar.create')
  @Post('calendar/events')
  create(
    @Body(new ZodValidationPipe(calendarEventCreateSchema)) body: CalendarEventCreateInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.create(actor, body);
  }

  @RequirePermissions('calendar.update')
  @Patch('calendar/events/:id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(calendarEventUpdateSchema)) body: CalendarEventUpdateInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.update(actor, id, body);
  }

  @RequirePermissions('calendar.delete')
  @Delete('calendar/events/:id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthContext) {
    return this.service.remove(actor, id);
  }

  @RequirePermissions('calendar.update')
  @Post('calendar/events/:id/restore')
  restore(@Param('id') id: string, @CurrentUser() actor: AuthContext) {
    return this.service.restore(actor, id);
  }

  @RequirePermissions('calendar.read')
  @Get('calendar/owners')
  owners(@CurrentUser() actor: AuthContext) {
    return this.service.owners(actor);
  }

  @RequirePermissions('calendar.create')
  @Post('calendar/import/preview')
  importPreview(
    @Body(new ZodValidationPipe(calendarImportPreviewRequestSchema)) body: CalendarImportPreviewRequest,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.importPreview(actor, body);
  }

  @RequirePermissions('calendar.create')
  @Post('calendar/import/commit')
  importCommit(
    @Body(new ZodValidationPipe(calendarImportCommitSchema)) body: CalendarImportCommitInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.importCommit(actor, body);
  }

  @RequirePermissions('calendar.read')
  @Get('calendar/sync-settings')
  settings(@CurrentUser() actor: AuthContext) {
    return this.service.getSettings(actor);
  }

  @RequirePermissions('calendar.update')
  @Put('calendar/sync-settings')
  saveSettings(
    @Body(new ZodValidationPipe(calendarSyncSettingsSchema)) body: CalendarSyncSettingsInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.saveSettings(actor, body);
  }

  @RequirePermissions('calendar.update')
  @Post('mobile/calendar/sync')
  sync(
    @Body(new ZodValidationPipe(calendarSyncSchema)) body: CalendarSyncInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.sync(actor, body);
  }
}
