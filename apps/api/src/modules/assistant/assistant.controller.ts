import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  assistantChatInputSchema,
  assistantApprovalDecisionInputSchema,
  assistantExecuteActionInputSchema,
  assistantInboxCaptureSchema,
  assistantInboxListQuerySchema,
  assistantInboxUpdateSchema,
  type AssistantApprovalDecisionInput,
  type AssistantChatInput,
  type AssistantExecuteActionInput,
  type AssistantInboxCapture,
  type AssistantInboxListQuery,
  type AssistantInboxUpdate,
} from '@haksan/shared';
import { AssistantApprovalService } from './assistant-approval.service';
import { AssistantInboxService } from './assistant-inbox.service';
import { AssistantService } from './assistant.service';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';

const ASSISTANT_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@UseGuards(AuthGuard, PermissionsGuard)
@Throttle(ASSISTANT_THROTTLE)
@RequirePermissions('companies.read')
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly approvals: AssistantApprovalService,
    private readonly inbox: AssistantInboxService
  ) {}

  @Get('suggestions')
  suggestions(@CurrentUser() user: AuthContext) {
    return this.assistant.listSuggestions(user);
  }

  @Get('briefing')
  briefing(@CurrentUser() user: AuthContext) {
    return this.assistant.briefing(user);
  }

  @Get('companies/:companyId/memory')
  companyMemory(@Param('companyId', new ParseUUIDPipe()) companyId: string, @CurrentUser() user: AuthContext) {
    return this.assistant.companyMemory(companyId, user);
  }

  @Post('chat')
  chat(@Body(new ZodValidationPipe(assistantChatInputSchema)) body: AssistantChatInput, @CurrentUser() user: AuthContext) {
    return this.assistant.chat(body, user);
  }

  @Get('inbox')
  inboxItems(
    @Query(new ZodValidationPipe(assistantInboxListQuerySchema)) query: AssistantInboxListQuery,
    @CurrentUser() user: AuthContext
  ) {
    return this.inbox.list(user, query);
  }

  @Post('inbox')
  captureInboxItem(
    @Body(new ZodValidationPipe(assistantInboxCaptureSchema)) body: AssistantInboxCapture,
    @CurrentUser() user: AuthContext
  ) {
    return this.inbox.capture(body, user);
  }

  @Patch('inbox/:id')
  updateInboxItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(assistantInboxUpdateSchema)) body: AssistantInboxUpdate,
    @CurrentUser() user: AuthContext
  ) {
    return this.inbox.update(id, body, user);
  }

  @Post('inbox/:id/reply-approval')
  prepareInboxReply(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthContext) {
    return this.inbox.prepareReply(id, user);
  }

  @Get('approvals')
  pendingApprovals(@CurrentUser() user: AuthContext) {
    return this.approvals.listPending(user);
  }

  @Post('approvals/:id/decision')
  decideApproval(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(assistantApprovalDecisionInputSchema)) body: AssistantApprovalDecisionInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.approvals.decide(id, body.confirm, user);
  }

  @Post('actions/:id/execute')
  execute(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assistantExecuteActionInputSchema)) body: AssistantExecuteActionInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.assistant.executeAction(id, body, user);
  }
}
