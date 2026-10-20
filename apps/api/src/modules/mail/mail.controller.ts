import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  MAIL_MAX_ATTACHMENT_BYTES,
  mailSendSchema,
  userMailAccountUpsertSchema,
  userMailSignatureSchema,
  mailSignatureSchema,
  type MailSignatureInput,
  type MailSendInput,
  type UserMailAccountUpsertInput,
  type UserMailSignatureInput,
} from '@haksan/shared';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { productModels } from '../../db/schema/products';
import { productGroups } from '../../db/schema/lookup';
import { resourceDivisionFilterWithShared } from '../../shared/utils/division-scope';
import { companies, contacts } from '../../db/schema/companies';
import { users } from '../../db/schema/users';
import { userMailAccounts } from '../../db/schema/mail';
import { DB } from '../../shared/database/database.module';
import { UserMailAccountService } from '../../shared/mailer/user-mail-account.service';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { companyVisibilityFilter } from '../../shared/utils/company-visibility';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { ActivitiesService } from '../activities/activities.service';
import { QuotesService } from '../quotes/quotes.service';
import { FilesService } from '../files/files.service';
import { HtmlPdfService } from '../../shared/pdf/html-pdf.service';

/**
 * Zaman çizelgesi "ne gönderdik" sorusunu da cevaplasın: ek adları mesajın sonunda.
 * Uzun mesaj kesilirken ek satırı korunur (alan 4000 karakter).
 */
export function activityDescription(body: string, filenames: string[]): string {
  const note = filenames.length ? `\n\nEkler: ${filenames.join(', ')}`.slice(0, 1000) : '';
  return body.slice(0, 4000 - note.length) + note;
}

const mailRecipientsQuerySchema = z.object({ companyId: z.string().uuid().optional() });

@UseGuards(AuthGuard)
@Controller('mail')
export class MailController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly accounts: UserMailAccountService,
    private readonly activities: ActivitiesService,
    private readonly quotes: QuotesService,
    private readonly htmlPdf: HtmlPdfService,
    private readonly files: FilesService
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

  @Put('signature')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  signature(
    @Body(new ZodValidationPipe(userMailSignatureSchema)) body: UserMailSignatureInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.accounts.updateSignature(body, actor);
  }

  @Delete('account')
  disconnect(@CurrentUser() actor: AuthContext) {
    return this.accounts.remove(actor);
  }

  @Put('signature/image')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async signatureImage(@Body(new ZodValidationPipe(mailSignatureSchema)) body: MailSignatureInput, @CurrentUser() actor: AuthContext) {
    await this.accounts.saveSignature(body, actor);
    return this.accounts.status(actor);
  }

  /** Süper admin: webmail ayarı yapılabilecek kullanıcılar (hesabı bağlı mı bilgisiyle). */
  @Get('account/users')
  async accountUsers(@CurrentUser() actor: AuthContext) {
    if (!actor.roles.includes('super_admin')) throw new ForbiddenError('Kullanıcıların webmail ayarları süper admin yetkisi gerektirir');
    const rows = await this.db.select({ id: users.id, name: users.fullName, email: users.email, accountId: userMailAccounts.id }).from(users)
      .leftJoin(userMailAccounts, and(eq(userMailAccounts.userId, users.id), eq(userMailAccounts.tenantId, actor.tenantId)))
      .where(and(eq(users.tenantId, actor.tenantId), isNull(users.deletedAt))).orderBy(asc(users.fullName));
    return rows.map(({ accountId, ...row }) => ({ ...row, hasMailAccount: Boolean(accountId) }));
  }

  // Kullanıcı bazlı uçlar: kendi id'si herkes için, başkasınınki yalnız süper admin (owner()).
  @Get('account/users/:userId')
  async userAccount(@Param('userId', new ZodValidationPipe(z.string().uuid())) userId: string, @CurrentUser() actor: AuthContext) {
    return this.accounts.status(await this.accounts.owner(actor, userId));
  }

  @Put('account/users/:userId')
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  connectUser(
    @Param('userId', new ZodValidationPipe(z.string().uuid())) userId: string,
    @Body(new ZodValidationPipe(userMailAccountUpsertSchema)) body: UserMailAccountUpsertInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.accounts.configure(body, actor, userId);
  }

  @Delete('account/users/:userId')
  disconnectUser(@Param('userId', new ZodValidationPipe(z.string().uuid())) userId: string, @CurrentUser() actor: AuthContext) {
    return this.accounts.remove(actor, userId);
  }

  @Put('account/users/:userId/signature')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  userTextSignature(
    @Param('userId', new ZodValidationPipe(z.string().uuid())) userId: string,
    @Body(new ZodValidationPipe(userMailSignatureSchema)) body: UserMailSignatureInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.accounts.updateSignature(body, actor, userId);
  }

  @Put('account/users/:userId/signature/image')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async userSignatureImage(
    @Param('userId', new ZodValidationPipe(z.string().uuid())) userId: string,
    @Body(new ZodValidationPipe(mailSignatureSchema)) body: MailSignatureInput,
    @CurrentUser() actor: AuthContext
  ) {
    await this.accounts.saveSignature(body, actor, userId);
    return this.accounts.status(await this.accounts.owner(actor, userId));
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

  private async quoteAttachment(quote: { id: string; document?: { html: string; filename: string } }, actor: AuthContext) {
    if (quote.document && this.htmlPdf.isAvailable()) {
      // Erişim kontrolü: get, generatePdf ile aynı tenant/bölüm/firma süzgeci; atılacak PDFKit çıktısı üretilmez.
      await this.quotes.get(quote.id, actor);
      const content = await this.htmlPdf.render(quote.document.html);
      return { filename: quote.document.filename, content, contentType: 'application/pdf' };
    }
    const { buffer, filename } = await this.quotes.generatePdf(quote.id, actor);
    return { filename, content: buffer, contentType: 'application/pdf' };
  }

  /**
   * Rapor eki: istemcinin ürettiği "Yazdır / PDF Kaydet" belgesi. Teklif ekinden ayrı
   * bir yetki kapısı var (`reports.export`) ve CRM kaydına bağlanmaz — rapor bir
   * kaydın değil, ekranın çıktısıdır.
   */
  private async reportAttachment(body: MailSendInput, actor: AuthContext) {
    if (!actor.permissions.has('reports.export')) {
      throw new ForbiddenError('Rapor ekleyebilmek için reports.export yetkisi gerekli');
    }
    // Teklif yolunda PDFKit yedeği var; burada yok. Chromium eksikliği istemcinin
    // hatası değil, sunucu yapılandırması — 4xx değil 503.
    if (!this.htmlPdf.isAvailable()) {
      throw new AppError('PDF_UNAVAILABLE', 'Sunucuda PDF üretici (Chromium) bulunamadı', 503);
    }
    const content = await this.htmlPdf.render(body.reportDocument!.html);
    return { filename: body.reportDocument!.filename, content, contentType: 'application/pdf' };
  }

  /**
   * Proforma / sözleşme eki: istemcinin "Yazdır / PDF Kaydet" belgesi. Kayıt, okuma
   * yetkisi ve görünürlük süzgecinden (getProforma / getContract) geçmeden PDF üretilmez.
   */
  private async documentAttachment(document: NonNullable<MailSendInput['document']>, actor: AuthContext) {
    const permission = document.kind === 'proforma' ? 'proformas.read' : 'contracts.read';
    if (!actor.permissions.has(permission)) {
      throw new ForbiddenError(`Belge ekleyebilmek için ${permission} yetkisi gerekli`);
    }
    if (document.kind === 'proforma') await this.quotes.getProforma(document.id, actor);
    else await this.quotes.getContract(document.id, actor);
    if (!this.htmlPdf.isAvailable()) {
      throw new AppError('PDF_UNAVAILABLE', 'Sunucuda PDF üretici (Chromium) bulunamadı', 503);
    }
    const content = await this.htmlPdf.render(document.pdf.html);
    return { filename: document.pdf.filename, content, contentType: 'application/pdf' };
  }

  /** Teknik föy, ürün detay ekranıyla aynı tenant/bölüm görünürlüğünü kullanır. */
  private async productAttachment(document: NonNullable<MailSendInput['productDocument']>, actor: AuthContext) {
    if (!actor.permissions.has('products.read')) {
      throw new ForbiddenError('Teknik föy ekleyebilmek için products.read yetkisi gerekli');
    }
    const [product] = await this.db.select({ id: productModels.id })
      .from(productModels)
      .leftJoin(productGroups, eq(productModels.productGroupId, productGroups.id))
      .where(and(
        eq(productModels.id, document.id),
        eq(productModels.tenantId, actor.tenantId),
        isNull(productModels.deletedAt),
        resourceDivisionFilterWithShared(actor, 'products', productGroups.divisionId) ?? sql`true`
      )).limit(1);
    if (!product) throw new NotFoundError('Ürün');
    if (!this.htmlPdf.isAvailable()) {
      throw new AppError('PDF_UNAVAILABLE', 'Sunucuda PDF üretici (Chromium) bulunamadı', 503);
    }
    const content = await this.htmlPdf.render(document.pdf.html);
    return { filename: document.pdf.filename, content, contentType: 'application/pdf' };
  }

  /**
   * Kullanıcının eklediği dosyalar. Her biri `createSignedDownloadUrl` ile aynı
   * erişim süzgecinden geçer; toplam boyut SMTP'yi kilitlememesi için burada
   * kapanır — tek tek küçük, toplamı büyük ekler aksi hâlde sınırı aşıyordu.
   */
  private async fileAttachments(fileIds: string[], actor: AuthContext, alreadyAttachedBytes = 0) {
    const attachments = [];
    let total = alreadyAttachedBytes;
    for (const fileId of fileIds) {
      const file = await this.files.readForAttachment(fileId, actor);
      total += file.content.byteLength;
      if (total > MAIL_MAX_ATTACHMENT_BYTES) {
        throw new ValidationError(
          `Eklerin toplam boyutu ${Math.round(MAIL_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB sınırını aşıyor`
        );
      }
      attachments.push({ filename: file.filename, content: file.content, contentType: file.mimeType });
    }
    return attachments;
  }

  @Post('send')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async send(
    @Body(new ZodValidationPipe(mailSendSchema)) body: MailSendInput,
    @CurrentUser() actor: AuthContext
  ) {
    await this.assertCrmLinks(body, actor);
    // Eski istemciler tek teklifi `quoteId` ile yollar; ikisi şemada birlikte gelemez.
    const quotes = body.quotes ?? (body.quoteId ? [{ id: body.quoteId, document: body.quoteDocument }] : []);
    if (quotes.length && !actor.permissions.has('quotes.read')) {
      throw new ForbiddenError('Teklif ekleyebilmek için quotes.read yetkisi gerekli');
    }
    // Ek PDF: istemci "Yazdır / PDF Kaydet" belgesini gönderdiyse birebir o (Chromium);
    // göndermediyse (eski istemci / Chromium yok) sunucunun sade PDFKit şablonu.
    // Sırayla: paralel üretim tek mailin Chromium kuyruğunun tamamını kaplayıp başkalarına PDF_BUSY döndürürdü.
    const quoteAttachments = [];
    for (const quote of quotes) quoteAttachments.push(await this.quoteAttachment(quote, actor));
    const generated = quoteAttachments.length
      ? quoteAttachments
      : body.reportDocument
        ? [await this.reportAttachment(body, actor)]
        : body.document
          ? [await this.documentAttachment(body.document, actor)]
          : body.productDocument
            ? [await this.productAttachment(body.productDocument, actor)]
            : [];
    // Üretilen PDF de SMTP boyut sınırına sayılır.
    const generatedBytes = generated.reduce((sum, item) => sum + item.content.byteLength, 0);
    if (generatedBytes > MAIL_MAX_ATTACHMENT_BYTES) {
      throw new ValidationError(`Eklerin toplam boyutu ${Math.round(MAIL_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB sınırını aşıyor`);
    }
    const attachments = [...generated, ...(body.fileIds?.length ? await this.fileAttachments(body.fileIds, actor, generatedBytes) : [])];
    const delivery = await this.accounts.send(
      { to: body.to, cc: body.cc, subject: body.subject, text: body.body, attachments: attachments.length ? attachments : undefined },
      actor
    );
    if (body.companyId && actor.permissions.has('activities.create')) {
      await this.activities.createActivity(
        {
          companyId: body.companyId,
          contactId: body.contactId,
          activityTypeCode: 'email',
          subject: body.subject,
          description: activityDescription(body.body, attachments.map((item) => item.filename)),
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
