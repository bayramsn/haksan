import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  callSuggestionActionInputSchema,
  callSuggestionListQuerySchema,
  callWebhookPayloadSchema,
  manualCallEventSchema,
  mobileCallEventSchema,
  type CallSuggestionActionInput,
  type CallWebhookPayload,
  type ManualCallEventInput,
  type MobileCallEventInput,
} from '@haksan/shared';
import { CallAssistantService } from './call-assistant.service';
import { loadEnv } from '../../config/env';
import { AuthGuard, Public } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';

@Controller()
export class CallAssistantController {
  constructor(private readonly svc: CallAssistantService) {}

  @Public()
  @Post('integrations/calls/webhook/:provider')
  async webhook(
    @Param('provider') provider: string,
    @Body(new ZodValidationPipe(callWebhookPayloadSchema.passthrough())) body: CallWebhookPayload,
    @Req() req: FastifyRequest
  ) {
    const raw = body as Record<string, unknown>;
    const env = loadEnv();
    this.svc.verifyWebhookSecret(req.headers['x-call-webhook-secret'], env.CALL_WEBHOOK_SECRET);
    const headerTenantId = Array.isArray(req.headers['x-haksan-tenant-id'])
      ? req.headers['x-haksan-tenant-id'][0]
      : req.headers['x-haksan-tenant-id'];
    const tenantId = await this.svc.tenantForWebhook({
      tenantId: typeof raw.tenantId === 'string' ? raw.tenantId : null,
      headerTenantId: typeof headerTenantId === 'string' ? headerTenantId : null,
    });
    return this.svc.ingestWebhook(provider, raw, tenantId);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions('companies.read')
  @Post('mobile/calls/events')
  mobileEvent(
    @Body(new ZodValidationPipe(mobileCallEventSchema)) body: MobileCallEventInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.ingestMobileEvent(body, user);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions('companies.read')
  @Post('call-assistant/manual-events')
  manualEvent(
    @Body(new ZodValidationPipe(manualCallEventSchema)) body: ManualCallEventInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.ingestManualEvent(body, user);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions('companies.read')
  @Get('call-assistant/suggestions')
  suggestions(
    @Query(new ZodValidationPipe(callSuggestionListQuerySchema))
    query: z.infer<typeof callSuggestionListQuerySchema>,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.listSuggestions(user, query);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions('companies.read')
  @Post('call-assistant/suggestions/:id/actions')
  action(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(callSuggestionActionInputSchema)) body: CallSuggestionActionInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.actOnSuggestion(id, body, user);
  }
}
