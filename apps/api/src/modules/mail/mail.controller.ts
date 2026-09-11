import { Body, Controller, Delete, Get, Inject, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  mailSendSchema,
  userMailAccountUpsertSchema,
  type MailSendInput,
  type UserMailAccountUpsertInput,
} from '@haksan/shared';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { companies, contacts } from '../../db/schema/companies';
import { users } from '../../db/schema/users';
import { DB } from '../../shared/database/database.module';
import { UserMailAccountService } from '../../shared/mailer/user-mail-account.service';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { companyVisibilityFilter } from '../../shared/utils/company-visibility';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { ActivitiesService } from '../activities/activities.service';
import { QuotesService } from '../quotes/quotes.service';
import { HtmlPdfService } from '../../shared/pdf/html-pdf.service';

const mailRecipientsQuerySchema = z.object({ companyId: z.string().uuid().optional() });

@UseGuards(AuthGuard)
@Controller('mail')
export class MailController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly accounts: UserMailAccountService,
    private readonly activities: ActivitiesService,
    private readonly quotes: QuotesService,
    private readonly htmlPdf: HtmlPdfService
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

  /**
   * Alıcı seçicisi: firmanın kontakları (To/CC) ve kiracının kullanıcıları (CC).
   * Kullanıcı listesi ad+e-postayla sınırlı; users.read yetkisi gerekmez.
   */
  @Get('recipients')
  async recipients(
    @Query(new ZodValidationPipe(mailRecipientsQuerySchema)) query: { companyId?: string },
    @CurrentUser() actor: AuthContext
  ) {
    if (query.companyId) await this.assertCompanyVisible(query.companyId, actor);
    const contactRows = query.companyId
      ? await this.db
          .select({
            id: contacts.id,
            fullName: contacts.fullName,
            title: contacts.title,
            workEmail: contacts.workEmail,
            personalEmail: contacts.personalEmail,
            otherEmail: contacts.otherEmail,
          })
          .from(contacts)
          .where(
            and(
              eq(contacts.tenantId, actor.tenantId),
              eq(contacts.companyId, query.companyId),
              isNull(contacts.deletedAt)
            )
          )
          .orderBy(asc(contacts.fullName))
      : [];

    const colleagueRows = await this.db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(and(eq(users.tenantId, actor.tenantId), isNull(users.deletedAt), ne(users.id, actor.userId)))
      .orderBy(asc(users.fullName));

    return {
      contacts: contactRows.flatMap((row) => {
        const email = row.workEmail ?? row.personalEmail ?? row.otherEmail;
        if (!email) return [];
        return [{ email, name: row.fullName, detail: row.title ?? null, contactId: row.id }];
      }),
      colleagues: colleagueRows.map((row) => ({
        email: row.email,
        name: row.fullName,
        detail: null,
        contactId: null,
      })),
    };
  }

  private async quoteAttachment(body: MailSendInput, actor: AuthContext) {
    if (body.quoteDocument && this.htmlPdf.isAvailable()) {
      // Belge teklife ait mi: erişim yetkisi generatePdf ile aynı süzgeçten geçer.
      const { filename } = await this.quotes.generatePdf(body.quoteId!, actor);
      const content = await this.htmlPdf.render(body.quoteDocument.html);
      return { filename: body.quoteDocument.filename || filename, content, contentType: 'application/pdf' };
    }
    const { buffer, filename } = await this.quotes.generatePdf(body.quoteId!, actor);
    return { filename, content: buffer, contentType: 'application/pdf' };
  }

  @Post('send')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async send(
    @Body(new ZodValidationPipe(mailSendSchema)) body: MailSendInput,
    @CurrentUser() actor: AuthContext
  ) {
    await this.assertCrmLinks(body, actor);
    if (body.quoteId && !actor.permissions.has('quotes.read')) {
      throw new ForbiddenError('Teklif ekleyebilmek için quotes.read yetkisi gerekli');
    }
    // Ek PDF: istemci "Yazdır / PDF Kaydet" belgesini gönderdiyse birebir o (Chromium);
    // göndermediyse (eski istemci / Chromium yok) sunucunun sade PDFKit şablonu.
    const attachments = body.quoteId ? [await this.quoteAttachment(body, actor)] : undefined;
    const delivery = await this.accounts.send(
      { to: body.to, cc: body.cc, subject: body.subject, text: body.body, attachments },
      actor
    );
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

  private async assertCompanyVisible(companyId: string, actor: AuthContext): Promise<void> {
    const visibility = await companyVisibilityFilter(this.db, actor);
    const [company] = await this.db
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(companies.id, companyId),
          eq(companies.tenantId, actor.tenantId),
          isNull(companies.deletedAt),
          visibility ?? sql`true`
        )
      )
      .limit(1);
    if (!company) throw new NotFoundError('Firma');
  }

  private async assertCrmLinks(input: MailSendInput, actor: AuthContext): Promise<void> {
    if (input.contactId && !input.companyId) {
      throw new ValidationError('Kontak bağlantısı için firma bağlantısı da gereklidir');
    }
    if (!input.companyId) return;
    await this.assertCompanyVisible(input.companyId, actor);
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
