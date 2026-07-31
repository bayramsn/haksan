import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  leadAssignmentRuleCreateSchema,
  leadAssignmentRuleUpdateSchema,
  type LeadAssignmentRuleCreateInput,
  type LeadAssignmentRuleUpdateInput,
} from '@haksan/shared';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { OpportunitiesService } from './opportunities.service';

@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions('lead_assignment_rules.manage')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('lead-assignment-rules')
export class LeadAssignmentRulesController {
  constructor(private readonly service: OpportunitiesService) {}

  @Get()
  list(@CurrentUser() user: AuthContext) {
    return this.service.listAssignmentRules(user);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(leadAssignmentRuleCreateSchema)) body: LeadAssignmentRuleCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.service.createAssignmentRule(body, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(leadAssignmentRuleUpdateSchema)) body: LeadAssignmentRuleUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.service.updateAssignmentRule(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.service.deleteAssignmentRule(id, user);
  }
}
