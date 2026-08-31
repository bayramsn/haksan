import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  taskCreateSchema,
  taskCommentSchema,
  taskListQuerySchema,
  taskUpdateSchema,
  type TaskCreateInput,
  type TaskCommentInput,
  type TaskListQuery,
  type TaskUpdateInput,
} from '@haksan/shared';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { TasksService } from './tasks.service';

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @RequirePermissions('tasks.read')
  @Get()
  list(
    @Query(new ZodValidationPipe<any>(taskListQuerySchema)) query: TaskListQuery,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.list(actor, query);
  }

  /** Üst şeritteki hızlı görünüm rozetleri. */
  @RequirePermissions('tasks.read')
  @Get('counts')
  counts(@CurrentUser() actor: AuthContext) {
    return this.service.counts(actor);
  }

  /** Yönetici görünümü: kullanıcı başına açık / geciken / tamamlanan. */
  @RequirePermissions('tasks.read', 'tasks.manage')
  @Get('summary')
  summary(@CurrentUser() actor: AuthContext) {
    return this.service.summary(actor);
  }

  /** CRM kaydının geçmişine düşecek görev hareketleri. */
  @RequirePermissions('tasks.read')
  @Get('events')
  events(
    @Query(new ZodValidationPipe<any>(taskListQuerySchema)) query: TaskListQuery,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.eventsForRecord(actor, query);
  }

  /** Görev formundaki "Atanacak kullanıcı" listesi. */
  @RequirePermissions('tasks.read')
  @Get('assignees')
  assignees(@CurrentUser() actor: AuthContext) {
    return this.service.assignees(actor);
  }

  @RequirePermissions('tasks.read')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() actor: AuthContext) {
    return this.service.get(actor, id);
  }

  @RequirePermissions('tasks.create')
  @Post()
  create(
    @Body(new ZodValidationPipe(taskCreateSchema)) body: TaskCreateInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.create(actor, body);
  }

  @RequirePermissions('tasks.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(taskUpdateSchema)) body: TaskUpdateInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.update(actor, id, body);
  }

  @RequirePermissions('tasks.update')
  @Post(':id/comments')
  comment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(taskCommentSchema)) body: TaskCommentInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.addComment(actor, id, body.comment);
  }

  @RequirePermissions('tasks.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthContext) {
    return this.service.remove(actor, id);
  }
}
