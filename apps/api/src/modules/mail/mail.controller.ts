import { Body, Controller, Delete, Get, Inject, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  mailSendSchema,
  userMailAccountUpsertSchema,
  type MailSendInput,
  type UserMailAccountUpsertInput,
} from '@haksan/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { assistantInboxItems } from '../../db/schema/assistant';
import { companies, contacts } from '../../db/schema/companies';
import { DB } from '../../shared/database/database.module';
import { UserMailAccountService } from '../../shared/mailer/user-mail-account.service';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { companyVisibilityFilter } from '../../shared/utils/company-visibility';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { logger } from '../../shared/utils/logger';
import { ActivitiesService } from '../activities/activities.service';

@UseGuards(AuthGuard)
@Controller('mail')
export class MailController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly accounts: UserMailAccountService,
    private readonly activities: ActivitiesService
  ) {}

  @Get('account')
  account(@CurrentUser() actor: AuthContext) {
    return this.accounts.status(actor);
  }

  @Put('account')
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  connect(
    @Body(new ZodValidationPipe(userMailAccountUpsertSchema)) body: UserMailAccountUpsertInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.accounts.configure(body, actor);
  }

  @Delete('account')
  disconnect(@CurrentUser() actor: AuthContext) {
    return this.accounts.remove(actor);
  }

  @Post('send')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async send(
    @Body(new ZodValidationPipe(mailSendSchema)) body: MailSendInput,
    @CurrentUser() actor: AuthContext
  ) {
    await this.assertCrmLinks(body, actor);
    const delivery = await this.accounts.send(
      { to: body.to, subject: body.subject, text: body.body },
      actor
    );
    const resolvedAt = delivery.sentAt;
    const divisionId = actor.activeDivisionId && actor.activeDivisionId !== 'all'
      ? actor.activeDivisionId
      : actor.primaryDivisionId;

    await this.db.insert(assistantInboxItems).values({
      tenantId: actor.tenantId,
      divisionId,
      channel: 'email',
      provider: 'personal_smtp',
      providerMessageId: delivery.messageId?.slice(0, 160) ?? null,
      direction: 'outbound',
      senderName: delivery.fromName,
      senderEmail: delivery.fromEmail,
      subject: body.subject,
      body: body.body,
      category: 'general',
      priority: 'normal',
      status: 'resolved',
      companyId: body.companyId ?? null,
      contactId: body.contactId ?? null,
      assignedToUserId: actor.userId,
      receivedAt: delivery.sentAt,
      classificationConfidence: 100,
      metadata: { recipientEmail: body.to.toLowerCase(), transport: 'smtp' },
      resolvedAt,
      createdBy: actor.userId,
    }).catch((error) => {
      // SMTP sunucusu mesajı kabul etti; iz kaydı başarısız diye istemciye hata
      // döndürmek yeniden denemede çift gönderime neden olur.
      logger.error({ error, action: 'outbound_mail_log_failed', userId: actor.userId }, '[mail] sent message could not be recorded');
    });

    if (body.companyId && actor.permissions.has('activities.create')) {
      await this.activities.createActivity(
        {
          companyId: body.companyId,
          contactId: body.contactId,
          activityTypeCode: 'email',
          subject: body.subject,
          description: body.body.slice(0, 4000),
          activityDate: delivery.sentAt,
        },
        actor
      ).catch(() => undefined);
    }

    return {
      delivered: true as const,
      messageId: delivery.messageId,
      sentAt: delivery.sentAt.toISOString(),
    };
  }

  private async assertCrmLinks(input: MailSendInput, actor: AuthContext): Promise<void> {
    if (input.contactId && !input.companyId) {
      throw new ValidationError('Kontak bağlantısı için firma bağlantısı da gereklidir');
    }
    if (!input.companyId) return;
    const visibility = await companyVisibilityFilter(this.db, actor);
    const [company] = await this.db
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(companies.id, input.companyId),
          eq(companies.tenantId, actor.tenantId),
          isNull(companies.deletedAt),
          visibility ?? sql`true`
        )
      )
      .limit(1);
    if (!company) throw new NotFoundError('Firma');
    if (!input.contactId) return;
    const [contact] = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, input.contactId),
          eq(contacts.tenantId, actor.tenantId),
          eq(contacts.companyId, input.companyId),
          isNull(contacts.deletedAt)
        )
      )
      .limit(1);
    if (!contact) throw new NotFoundError('Kontak');
  }
}
