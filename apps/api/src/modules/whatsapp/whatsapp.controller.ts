import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WhatsAppService } from '../../shared/whatsapp/whatsapp.service';
import { AssistantInboxService } from '../assistant/assistant-inbox.service';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { AuthGuard, Public } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';

const sendSchema = z.object({
  to: z.string().min(7).max(32),
  body: z.string().min(1).max(4000),
});

/**
 * WhatsApp Business (Meta Cloud API) entegrasyonu — bayrağa bağlı iskelet.
 * - GET webhook: Meta abonelik doğrulaması (hub.challenge).
 * - POST webhook: gelen mesajları asistan gelen kutusuna düşürür.
 * - POST send: yetkili kullanıcı düz metin gönderir (dahili/test).
 */
@Controller('integrations/whatsapp')
export class WhatsAppController {
  private readonly env = loadEnv();

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly inbox: AssistantInboxService,
  ) {}

  @Public()
  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() reply: FastifyReply,
  ) {
    const expected = this.env.WHATSAPP_VERIFY_TOKEN;
    if (mode === 'subscribe' && expected && token === expected) {
      reply.status(200).send(challenge);
      return;
    }
    reply.status(403).send('forbidden');
  }

  @Public()
  @Post('webhook')
  async receive(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    // Meta 200 dışında yanıt görürse tekrar dener; her koşulda hızlıca 200 dön.
    reply.status(200).send('ok');
    const tenantId = this.env.WHATSAPP_DEFAULT_TENANT_ID;
    if (!this.env.WHATSAPP_ENABLED || !tenantId) return;
    try {
      const body = req.body as WhatsAppWebhookBody;
      const entries = body?.entry ?? [];
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          const value = change.value;
          const contacts = value?.contacts ?? [];
          for (const message of value?.messages ?? []) {
            const text = message.text?.body ?? message.button?.text ?? message.interactive?.list_reply?.title ?? '';
            if (!text) continue;
            const senderName = contacts.find((c) => c.wa_id === message.from)?.profile?.name ?? null;
            await this.inbox.captureInbound(tenantId, {
              channel: 'whatsapp',
              provider: 'whatsapp_cloud',
              providerMessageId: message.id,
              senderName: senderName ?? undefined,
              senderPhone: message.from,
              body: text,
              receivedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : undefined,
            });
          }
        }
      }
    } catch (error) {
      logger.warn({ action: 'whatsapp_webhook_error' }, String(error));
    }
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions('activities.create')
  @Post('send')
  async send(@Body(new ZodValidationPipe(sendSchema)) body: z.infer<typeof sendSchema>, @CurrentUser() _user: AuthContext) {
    if (!this.whatsapp.isConfigured()) {
      return { sent: false, reason: 'whatsapp_not_configured' };
    }
    const sent = await this.whatsapp.sendText(body.to, body.body);
    return { sent };
  }
}

// Meta Cloud API webhook gövdesinin ilgili alt kümesi.
type WhatsAppWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp?: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: { list_reply?: { title?: string } };
        }>;
      };
    }>;
  }>;
};
