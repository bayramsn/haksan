import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  assistantChatInputSchema,
  assistantExecuteActionInputSchema,
  type AssistantChatInput,
  type AssistantExecuteActionInput,
} from '@haksan/shared';
import { AssistantService } from './assistant.service';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { PermissionsGuard } from '../../shared/security/permissions.guard';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';

const ASSISTANT_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@UseGuards(AuthGuard, PermissionsGuard)
@Throttle(ASSISTANT_THROTTLE)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('suggestions')
  suggestions(@CurrentUser() user: AuthContext) {
    return this.assistant.listSuggestions(user);
  }

  @Post('chat')
  chat(@Body(new ZodValidationPipe(assistantChatInputSchema)) body: AssistantChatInput, @CurrentUser() user: AuthContext) {
    return this.assistant.chat(body, user);
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
