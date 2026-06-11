import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  activityCreateSchema,
  visitCreateSchema,
  callCreateSchema,
  paginationSchema,
  type ActivityCreateInput,
  type VisitCreateInput,
  type CallCreateInput,
  type Pagination,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ActivitiesService } from './activities.service';

const listQuery = z.object({ opportunityId: z.string().optional(), companyId: z.string().optional() });

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class ActivitiesController {
  constructor(private readonly svc: ActivitiesService) {}

  @RequirePermissions('activities.read')
  @Get('activities')
  list(
    @Query(new ZodValidationPipe(listQuery.merge(paginationSchema)))
    qp: z.infer<typeof listQuery> & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.list(user, query, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('activities.create')
  @Post('activities')
  createActivity(
    @Body(new ZodValidationPipe(activityCreateSchema)) body: ActivityCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.createActivity(body, user);
  }

  @RequirePermissions('activities.create')
  @Post('visits')
  createVisit(@Body(new ZodValidationPipe(visitCreateSchema)) body: VisitCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.createVisit(body, user);
  }

  @RequirePermissions('activities.create')
  @Post('calls')
  createCall(@Body(new ZodValidationPipe(callCreateSchema)) body: CallCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.createCall(body, user);
  }
}
