import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { callAssistantMatchSchema, manualCallEventSchema, mobileCallEventSchema, callSuggestionActionInputSchema, callAssistantDraftCommitSchema } from '@haksan/shared';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { CallAssistantService } from './call-assistant.service';

@Controller('call-assistant')
@UseGuards(AuthGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class CallAssistantController {
  constructor(private readonly service: CallAssistantService) {}
  @Get('capabilities') capabilities() { return this.service.capabilities(); }
  @Get('phone-index') phoneIndex(@CurrentUser() actor: AuthContext) { return this.service.phoneIndex(actor); }
  @Post('match') match(@CurrentUser() actor: AuthContext, @Body(new ZodValidationPipe(callAssistantMatchSchema)) body: z.infer<typeof callAssistantMatchSchema>) { return this.service.match(actor, body); }
  @Post('manual-events') manual(@CurrentUser() actor: AuthContext, @Body(new ZodValidationPipe(manualCallEventSchema)) body: z.infer<typeof manualCallEventSchema>) { return this.service.ingest(actor, body, body.source); }
  @Get('suggestions') suggestions(@CurrentUser() actor: AuthContext) { return this.service.suggestions(actor); }
  @Get('suggestions/:id') suggestion(@CurrentUser() actor: AuthContext, @Param('id', new ZodValidationPipe(z.string().uuid())) id: string) { return this.service.suggestion(actor, id); }
  @Post('suggestions/:id/actions') action(@CurrentUser() actor: AuthContext, @Param('id', new ZodValidationPipe(z.string().uuid())) id: string, @Body(new ZodValidationPipe(callSuggestionActionInputSchema)) body: z.infer<typeof callSuggestionActionInputSchema>) { return this.service.action(actor, id, body); }
  @Get('drafts/:id') draft(@CurrentUser() actor: AuthContext, @Param('id', new ZodValidationPipe(z.string().uuid())) id: string) { return this.service.draft(actor, id); }
  @Post('drafts/:id/commit') commit(@CurrentUser() actor: AuthContext, @Param('id', new ZodValidationPipe(z.string().uuid())) id: string, @Body(new ZodValidationPipe(callAssistantDraftCommitSchema)) body: z.infer<typeof callAssistantDraftCommitSchema>) { return this.service.commit(actor, id, body); }
}

@Controller('mobile/calls')
@UseGuards(AuthGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class MobileCallEventsController {
  constructor(private readonly service: CallAssistantService) {}
  @Post('events') event(@CurrentUser() actor: AuthContext, @Body(new ZodValidationPipe(mobileCallEventSchema)) body: z.infer<typeof mobileCallEventSchema>) { return this.service.ingest(actor, body, 'android'); }
}
