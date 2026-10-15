import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  mailCampaignCandidatesQuerySchema,
  mailCampaignCreateSchema,
  type MailCampaignCandidatesQuery,
  mailRecipientListParseSchema,
  mailSuppressionSchema,
  type MailCampaignCreateInput,
  type MailRecipientListParseInput,
  type MailSuppressionInput,
} from '@haksan/shared';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { NotFoundError } from '../../shared/utils/errors';
import { loadEnv } from '../../config/env';
import { MailCampaignsService } from './mail-campaigns.service';

const idPipe = new ZodValidationPipe(z.string().uuid());

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('mail/campaigns')
export class MailCampaignsController {
  constructor(private readonly service: MailCampaignsService) {}

  @RequirePermissions('mail_campaigns.read')
  @Get()
  list(@CurrentUser() actor: AuthContext) {
    return this.service.list(actor);
  }

  @RequirePermissions('mail_campaigns.create')
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@Body(new ZodValidationPipe(mailCampaignCreateSchema)) body: MailCampaignCreateInput, @CurrentUser() actor: AuthContext) {
    return this.service.create(body, actor);
  }

  @RequirePermissions('mail_campaigns.create', 'companies.read', 'contacts.read')
  @Get('candidates')
  candidates(@Query(new ZodValidationPipe<any>(mailCampaignCandidatesQuerySchema)) query: MailCampaignCandidatesQuery, @CurrentUser() actor: AuthContext) {
    return this.service.candidates(query, actor);
  }

  @RequirePermissions('mail_campaigns.create')
  @Post('parse-list')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  parseList(@Body(new ZodValidationPipe(mailRecipientListParseSchema)) body: MailRecipientListParseInput) {
    return this.service.parseList(body);
  }

  @RequirePermissions('mail_campaigns.read')
  @Get('suppressions')
  suppressions(@CurrentUser() actor: AuthContext) {
    return this.service.listSuppressions(actor);
  }

  @RequirePermissions('mail_campaigns.create')
  @Post('suppressions')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  addSuppression(@Body(new ZodValidationPipe(mailSuppressionSchema)) body: MailSuppressionInput, @CurrentUser() actor: AuthContext) {
    return this.service.addSuppression(body, actor);
  }

  @RequirePermissions('mail_campaigns.create')
  @Delete('suppressions/:id')
  removeSuppression(@Param('id', idPipe) id: string, @CurrentUser() actor: AuthContext) {
    return this.service.removeSuppression(id, actor);
  }

  @RequirePermissions('mail_campaigns.read')
  @Get(':id')
  get(@Param('id', idPipe) id: string, @CurrentUser() actor: AuthContext) {
    return this.service.get(id, actor);
  }

  @RequirePermissions('mail_campaigns.create')
  @Post(':id/resume')
  resume(@Param('id', idPipe) id: string, @CurrentUser() actor: AuthContext) {
    return this.service.resume(id, actor);
  }

  @RequirePermissions('mail_campaigns.create')
  @Post(':id/cancel')
  cancel(@Param('id', idPipe) id: string, @CurrentUser() actor: AuthContext) {
    return this.service.cancel(id, actor);
  }
}

/**
 * Herkese açık ret uçları (oturum yok). GET, mail istemcisinin başlıktaki bağlantıyı açtığı durum için
 * onay sayfasına yönlendirir — bağlantı tarayıcıları tek GET ile kimseyi listeden çıkaramaz. POST
 * hem sayfanın düğmesi hem RFC 8058 tek tık (form gövdesi "List-Unsubscribe=One-Click") içindir.
 */
@Controller('public/mail-unsubscribe')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class PublicMailUnsubscribeController {
  constructor(private readonly service: MailCampaignsService) {}

  @Get(':token')
  page(@Param('token', idPipe) token: string, @Res() reply: FastifyReply) {
    const base = loadEnv().APP_PUBLIC_URL;
    if (!base) throw new NotFoundError('Sayfa');
    return reply.redirect(new URL(`/public/unsubscribe/${token}`, base).toString(), 303);
  }

  @Post(':token')
  @HttpCode(200)
  unsubscribe(@Param('token', idPipe) token: string) {
    return this.service.unsubscribe(token);
  }
}
