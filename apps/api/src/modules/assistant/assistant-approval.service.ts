import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  activityCreateSchema,
  assistantApprovalCardSchema,
  assistantSecretaryActionKindSchema,
  calendarEventCreateSchema,
  companyCreateSchema,
  companyUpdateSchema,
  contactCreateSchema,
  contractCreateSchema,
  proformaCreateSchema,
  quoteCreateSchema,
  type AssistantApprovalCard,
  type AssistantApprovalDecisionResponse,
  type AssistantOperationAction,
  type AssistantSecretaryActionKind,
} from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { assistantInboxItems, assistantLogs } from '../../db/schema/assistant';
import { divisions } from '../../db/schema/tenants';
import { DB } from '../../shared/database/database.module';
import { MailerService } from '../../shared/mailer/mailer.service';
import type { AuthContext } from '../../shared/security/auth.types';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { ActivitiesService } from '../activities/activities.service';
import { CalendarService } from '../calendar/calendar.service';
import { CompaniesService } from '../companies/companies.service';
import { ContactsService } from '../contacts/contacts.service';
import { QuotesService } from '../quotes/quotes.service';

const APPROVAL_TTL_MS = 15 * 60 * 1000;

const followUpArgumentsSchema = z
  .object({
    companyId: z.string().uuid(),
    opportunityId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    subject: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4000).optional(),
    nextFollowUpAt: z.coerce.date(),
  })
  .strict();

const updateCompanyArgumentsSchema = z
  .object({
    companyId: z.string().uuid(),
    changes: companyUpdateSchema,
  })
  .strict();

const quoteIdArgumentsSchema = z.object({ quoteId: z.string().uuid() }).strict();

const smartQuoteItemArgumentsSchema = z
  .object({
    productModelId: z.string().uuid(),
    quantity: z.coerce.number().positive().max(100_000).multipleOf(0.001),
    discountPercent: z.coerce.number().min(0).max(100).default(0),
  })
  .strict();

const createQuoteArgumentsSchema = quoteCreateSchema
  .extend({ items: z.array(smartQuoteItemArgumentsSchema).max(25).default([]) })
  .strict();

const salesPackageArgumentsSchema = z
  .object({
    quoteId: z.string().uuid(),
    includeProforma: z.boolean().default(true),
    includeContract: z.boolean().default(true),
    createFollowUp: z.boolean().default(false),
    nextFollowUpAt: z.coerce.date().optional(),
    followUpSubject: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .refine((value) => value.includeProforma || value.includeContract || value.createFollowUp, {
    message: 'Satış paketinde en az bir işlem seçilmeli',
  });

const sendEmailArgumentsSchema = z
  .object({
    to: z.string().trim().email().max(320),
    subject: z.string().trim().min(1).max(255).refine((value) => !/[\r\n]/.test(value), 'E-posta konusu satır sonu içeremez'),
    body: z.string().trim().min(1).max(10_000),
  })
  .strict();

const sendQuoteEmailArgumentsSchema = sendEmailArgumentsSchema.extend({ quoteId: z.string().uuid() }).strict();

export type AssistantSecretaryPlan = {
  kind: AssistantSecretaryActionKind;
  arguments: Record<string, unknown>;
  source?: { type: 'assistant_inbox'; id: string };
};

type ApprovalMetadata = {
  version: 1;
  action: AssistantSecretaryActionKind;
  arguments: Record<string, unknown>;
  card: AssistantApprovalCard;
  source?: { type: 'assistant_inbox'; id: string };
};

@Injectable()
export class AssistantApprovalService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly companies: CompaniesService,
    private readonly contacts: ContactsService,
    private readonly quotes: QuotesService,
    private readonly activities: ActivitiesService,
    private readonly calendar: CalendarService,
    private readonly mailer: MailerService
  ) {}

  async create(plan: AssistantSecretaryPlan, actor: AuthContext, requestMessage: string): Promise<AssistantApprovalCard> {
    const action = assistantSecretaryActionKindSchema.parse(plan.kind);
    const parsedArguments = this.parseArguments(action, plan.arguments);
    this.requirePermissionForAction(actor, action, parsedArguments);
    if ((action === 'send_email' || action === 'send_quote_email') && !this.mailer.isConfigured()) {
      throw new ValidationError('E-posta gönderimi için SMTP ayarları tamamlanmamış');
    }

    const id = randomUUID();
    const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString();
    const card = await this.buildCard(id, action, parsedArguments, expiresAt, actor);
    const metadata: ApprovalMetadata = {
      version: 1,
      action,
      arguments: this.jsonRecord(parsedArguments),
      card,
      source: plan.source,
    };
    await this.db.insert(assistantLogs).values({
      id,
      tenantId: actor.tenantId,
      userId: actor.userId,
      eventType: 'approval_requested',
      sourceType: plan.source?.type ?? this.sourceType(action),
      sourceId: plan.source?.id ?? this.sourceId(parsedArguments),
      action,
      status: 'pending',
      message: requestMessage.slice(0, 4000),
      response: card.description,
      metadata,
    });
    return card;
  }

  async listPending(actor: AuthContext): Promise<AssistantApprovalCard[]> {
    const rows = await this.db
      .select()
      .from(assistantLogs)
      .where(
        and(
          eq(assistantLogs.tenantId, actor.tenantId),
          eq(assistantLogs.userId, actor.userId),
          eq(assistantLogs.eventType, 'approval_requested'),
          eq(assistantLogs.status, 'pending')
        )
      )
      .orderBy(desc(assistantLogs.createdAt))
      .limit(50);

    const cards: AssistantApprovalCard[] = [];
    for (const row of rows) {
      const metadata = this.readMetadata(row.metadata);
      if (!metadata) continue;
      if (Date.parse(metadata.card.expiresAt) <= Date.now()) {
        await this.db
          .update(assistantLogs)
          .set({ status: 'expired' })
          .where(and(eq(assistantLogs.id, row.id), eq(assistantLogs.status, 'pending')));
        continue;
      }
      cards.push({ ...metadata.card, status: 'pending' });
    }
    return cards;
  }

  async decide(id: string, confirm: boolean, actor: AuthContext): Promise<AssistantApprovalDecisionResponse> {
    const row = await this.findOwnedApproval(id, actor);
    const metadata = this.readMetadata(row.metadata);
    if (!metadata) throw new ValidationError('Onay kaydı geçersiz');
    if (row.status !== 'pending') throw new ValidationError('Bu onay kartı daha önce sonuçlandırılmış');

    if (Date.parse(metadata.card.expiresAt) <= Date.now()) {
      await this.db
        .update(assistantLogs)
        .set({ status: 'expired' })
        .where(and(eq(assistantLogs.id, id), eq(assistantLogs.status, 'pending')));
      return { ok: false, status: 'expired', message: 'Onay kartının süresi doldu. İşlemi yeniden hazırlayın.' };
    }

    if (!confirm) {
      const [cancelled] = await this.db
        .update(assistantLogs)
        .set({ status: 'cancelled' })
        .where(and(eq(assistantLogs.id, id), eq(assistantLogs.status, 'pending')))
        .returning({ id: assistantLogs.id });
      if (!cancelled) throw new ValidationError('Bu onay kartı daha önce sonuçlandırılmış');
      return { ok: true, status: 'cancelled', message: 'İşlem iptal edildi; hiçbir kayıt değiştirilmedi.' };
    }

    this.requirePermissionForAction(actor, metadata.action, metadata.arguments);
    const [claimed] = await this.db
      .update(assistantLogs)
      .set({ status: 'executing' })
      .where(and(eq(assistantLogs.id, id), eq(assistantLogs.status, 'pending')))
      .returning({ id: assistantLogs.id });
    if (!claimed) throw new ValidationError('Bu onay kartı daha önce sonuçlandırılmış');

    try {
      const execution = await this.execute(metadata.action, metadata.arguments, actor);
      if (metadata.source?.type === 'assistant_inbox') {
        const now = new Date();
        try {
          await this.db
            .update(assistantInboxItems)
            .set({
              status: 'waiting',
              lastFollowUpAt: now,
              nextFollowUpAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
              followUpCount: sql`${assistantInboxItems.followUpCount} + 1`,
              updatedAt: now,
            })
            .where(and(eq(assistantInboxItems.id, metadata.source.id), eq(assistantInboxItems.tenantId, actor.tenantId)));
        } catch {
          // Dış e-posta başarıyla gönderildikten sonra ikincil takip alanı hatası
          // işlemi "başarısız" gösterip aynı e-postanın yeniden gönderilmesine
          // yol açmamalı. Ana onay/audit kaydı yine executed olarak kapanır.
        }
      }
      await this.db.update(assistantLogs).set({ status: 'executed' }).where(eq(assistantLogs.id, id));
      await this.db.insert(assistantLogs).values({
        tenantId: actor.tenantId,
        userId: actor.userId,
        eventType: 'execute',
        sourceType: this.sourceType(metadata.action),
        sourceId: id,
        action: metadata.action,
        status: 'ok',
        metadata: { approvalId: id },
      });
      return {
        ok: true,
        status: 'executed',
        message: execution.message,
        result: execution.result,
        operationAction: execution.operationAction,
      };
    } catch (error) {
      await this.db.update(assistantLogs).set({ status: 'failed' }).where(eq(assistantLogs.id, id));
      await this.db.insert(assistantLogs).values({
        tenantId: actor.tenantId,
        userId: actor.userId,
        eventType: 'execute',
        sourceType: this.sourceType(metadata.action),
        sourceId: id,
        action: metadata.action,
        status: 'error',
        metadata: { approvalId: id, error: error instanceof Error ? error.message : String(error) },
      });
      return {
        ok: false,
        status: 'failed',
        message: error instanceof AppError ? error.message : 'İşlem tamamlanamadı. Sistem yöneticisi kayıtları inceleyebilir.',
      };
    }
  }

  private async execute(
    action: AssistantSecretaryActionKind,
    rawArguments: Record<string, unknown>,
    actor: AuthContext
  ): Promise<{ message: string; result?: unknown; operationAction?: AssistantOperationAction }> {
    const args = this.parseArguments(action, rawArguments);
    switch (action) {
      case 'create_company': {
        const result = await this.companies.create(companyCreateSchema.parse(args), actor);
        return {
          message: 'Firma kaydı oluşturuldu.',
          result,
          operationAction: { kind: 'navigate', nav: 'customers', query: result.shortName || result.legalTitle },
        };
      }
      case 'update_company': {
        const parsed = updateCompanyArgumentsSchema.parse(args);
        const result = await this.companies.update(parsed.companyId, parsed.changes, actor);
        return {
          message: 'Firma bilgileri güncellendi.',
          result,
          operationAction: { kind: 'customer', customerId: parsed.companyId },
        };
      }
      case 'create_contact': {
        const parsed = contactCreateSchema.parse(args);
        const result = await this.contacts.create(parsed, actor);
        return {
          message: 'Kontak kaydı oluşturuldu.',
          result,
          operationAction: { kind: 'navigate', nav: 'contacts', query: parsed.fullName },
        };
      }
      case 'create_quote': {
        const parsed = createQuoteArgumentsSchema.parse(args);
        const { items, ...quoteInput } = parsed;
        const catalogItems = await this.quotes.previewCatalogItems(items, actor, quoteInput.divisionId, quoteInput.currencyCode);
        let created: Awaited<ReturnType<QuotesService['create']>> | null = null;
        try {
          created = await this.quotes.create(quoteInput, actor);
          for (const [index, item] of catalogItems.entries()) {
            await this.quotes.addItem(
              created.id,
              {
                productModelId: item.productModelId,
                stockCode: item.stockCode,
                description: item.description,
                quantity: item.quantity,
                unitCode: 'adet',
                unitPrice: item.unitPrice,
                discountAmount: item.discountAmount,
                vatRate: item.vatRate,
                sortOrder: index,
              },
              actor
            );
          }
          const result = await this.quotes.get(created.id, actor);
          return {
            message: items.length ? 'Katalog fiyatlı teklif taslağı oluşturuldu.' : 'Teklif taslağı oluşturuldu.',
            result,
            operationAction: { kind: 'navigate', nav: 'offers', query: created.documentNo },
          };
        } catch (error) {
          if (created) await this.quotes.delete(created.id, actor).catch(() => undefined);
          throw error;
        }
      }
      case 'create_activity': {
        const parsed = activityCreateSchema.parse(args);
        const result = await this.activities.createActivity(parsed, actor);
        return {
          message: 'Aktivite oluşturuldu.',
          result,
          operationAction: { kind: 'navigate', nav: 'customers', query: parsed.subject },
        };
      }
      case 'create_follow_up': {
        const parsed = followUpArgumentsSchema.parse(args);
        const result = await this.activities.createActivity(
          {
            companyId: parsed.companyId,
            opportunityId: parsed.opportunityId,
            contactId: parsed.contactId,
            activityTypeCode: 'note',
            subject: parsed.subject,
            description: parsed.description,
            activityDate: new Date(),
            nextFollowUpAt: parsed.nextFollowUpAt,
          },
          actor
        );
        return {
          message: 'Takip görevi oluşturuldu.',
          result,
          operationAction: { kind: 'navigate', nav: 'customers', query: parsed.subject },
        };
      }
      case 'create_calendar_event': {
        const parsed = calendarEventCreateSchema.parse(args);
        const result = await this.calendar.create(actor, parsed);
        return {
          message: 'Takvim kaydı oluşturuldu.',
          result,
          operationAction: { kind: 'navigate', nav: 'calendar', query: parsed.title },
        };
      }
      case 'create_proforma': {
        const parsed = proformaCreateSchema.parse(args);
        const result = await this.quotes.createProforma(parsed, actor);
        return {
          message: 'Proforma taslağı oluşturuldu.',
          result,
          operationAction: { kind: 'navigate', nav: 'proformas', query: result.documentNo },
        };
      }
      case 'create_contract': {
        const parsed = contractCreateSchema.parse(args);
        const result = await this.quotes.createContract(parsed, actor);
        return {
          message: 'Sözleşme taslağı oluşturuldu.',
          result,
          operationAction: { kind: 'navigate', nav: 'contracts', query: result.contractNo },
        };
      }
      case 'approve_quote': {
        const parsed = quoteIdArgumentsSchema.parse(args);
        const result = await this.quotes.approve(parsed.quoteId, actor);
        const quote = await this.quotes.get(parsed.quoteId, actor);
        return {
          message: 'Teklif onaylandı.',
          result,
          operationAction: { kind: 'navigate', nav: 'offers', query: quote.documentNo },
        };
      }
      case 'send_email': {
        const parsed = sendEmailArgumentsSchema.parse(args);
        const delivered = await this.mailer.sendTextEmail({ to: parsed.to, subject: parsed.subject, text: parsed.body });
        if (!delivered) throw new ValidationError('E-posta gönderimi için SMTP ayarları tamamlanmamış');
        return { message: 'E-posta gönderildi.', result: { delivered: true } };
      }
      case 'send_quote_email': {
        const parsed = sendQuoteEmailArgumentsSchema.parse(args);
        await this.quotes.assertCanSend(parsed.quoteId, actor);
        const attachment = await this.quotes.generatePdf(parsed.quoteId, actor);
        const delivered = await this.mailer.sendTextEmail({
          to: parsed.to,
          subject: parsed.subject,
          text: parsed.body,
          attachments: [{ filename: attachment.filename, content: attachment.buffer, contentType: 'application/pdf' }],
        });
        if (!delivered) throw new ValidationError('E-posta gönderimi için SMTP ayarları tamamlanmamış');
        await this.quotes.send(parsed.quoteId, actor);
        const quote = await this.quotes.get(parsed.quoteId, actor);
        return {
          message: 'Teklif PDF olarak e-postayla gönderildi.',
          result: { delivered: true, documentNo: quote.documentNo },
          operationAction: { kind: 'navigate', nav: 'offers', query: quote.documentNo },
        };
      }
      case 'create_sales_package': {
        const parsed = salesPackageArgumentsSchema.parse(args);
        const quote = await this.quotes.get(parsed.quoteId, actor);
        let proforma: Awaited<ReturnType<QuotesService['createProforma']>> | null = null;
        let contract: Awaited<ReturnType<QuotesService['createContract']>> | null = null;
        let followUp: Awaited<ReturnType<ActivitiesService['createActivity']>> | null = null;
        try {
          if (parsed.includeProforma) {
            proforma = await this.quotes.createProforma(
              { quoteId: parsed.quoteId, issueDate: new Date(), statusCode: 'draft' },
              actor
            );
          }
          if (parsed.includeContract) {
            contract = await this.quotes.createContract({ quoteId: parsed.quoteId, statusCode: 'draft' }, actor);
          }
          if (parsed.createFollowUp) {
            followUp = await this.activities.createActivity(
              {
                companyId: quote.companyId,
                opportunityId: quote.opportunityId ?? undefined,
                activityTypeCode: 'note',
                subject: parsed.followUpSubject ?? `${quote.documentNo} satış paketi takibi`,
                description: 'CRM Asistanı satış paketi üzerinden oluşturuldu.',
                activityDate: new Date(),
                nextFollowUpAt: parsed.nextFollowUpAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
              },
              actor
            );
          }
          return {
            message: 'Satış paketi oluşturuldu.',
            result: { quoteId: quote.id, proforma, contract, followUp },
            operationAction: { kind: 'navigate', nav: 'offers', query: quote.documentNo },
          };
        } catch (error) {
          if (followUp) await this.activities.deleteActivity(followUp.id, actor).catch(() => undefined);
          if (contract) await this.quotes.deleteContract(contract.id, actor).catch(() => undefined);
          if (proforma) await this.quotes.deleteProforma(proforma.id, actor).catch(() => undefined);
          throw error;
        }
      }
    }
  }

  private parseArguments(action: AssistantSecretaryActionKind, raw: Record<string, unknown>): Record<string, unknown> {
    const now = new Date();
    switch (action) {
      case 'create_company':
        return companyCreateSchema.parse(raw) as Record<string, unknown>;
      case 'update_company':
        return updateCompanyArgumentsSchema.parse(raw) as Record<string, unknown>;
      case 'create_contact':
        return contactCreateSchema.parse(raw) as Record<string, unknown>;
      case 'create_quote':
        return createQuoteArgumentsSchema.parse({ quoteDate: now, currencyCode: 'USD', validityDays: 30, ...raw }) as Record<string, unknown>;
      case 'create_activity':
        return activityCreateSchema.parse({ activityDate: now, activityTypeCode: 'note', ...raw }) as Record<string, unknown>;
      case 'create_follow_up':
        return followUpArgumentsSchema.parse(raw) as Record<string, unknown>;
      case 'create_calendar_event':
        return calendarEventCreateSchema.parse(raw) as Record<string, unknown>;
      case 'create_proforma':
        return proformaCreateSchema.parse({ issueDate: now, statusCode: 'draft', ...raw }) as Record<string, unknown>;
      case 'create_contract':
        return contractCreateSchema.parse({ statusCode: 'draft', ...raw }) as Record<string, unknown>;
      case 'approve_quote':
        return quoteIdArgumentsSchema.parse(raw) as Record<string, unknown>;
      case 'send_email':
        return sendEmailArgumentsSchema.parse(raw) as Record<string, unknown>;
      case 'send_quote_email':
        return sendQuoteEmailArgumentsSchema.parse(raw) as Record<string, unknown>;
      case 'create_sales_package':
        return salesPackageArgumentsSchema.parse(raw) as Record<string, unknown>;
    }
  }

  private async buildCard(
    id: string,
    action: AssistantSecretaryActionKind,
    args: Record<string, unknown>,
    expiresAt: string,
    actor: AuthContext
  ): Promise<AssistantApprovalCard> {
    const field = (label: string, value: unknown) => ({ label, value: this.displayValue(value) });
    const base = { id, action, status: 'pending' as const, expiresAt };
    if (action === 'create_company') {
      const parsed = companyCreateSchema.parse(args);
      return {
        ...base,
        title: 'Firma kaydı oluştur',
        description: `${parsed.legalTitle} CRM'e eklenecek.`,
        impact: 'medium',
        fields: [
          field('Firma', parsed.legalTitle),
          field('İlişki', parsed.relationTypeCode),
          field('Statü', parsed.customerStatusCode),
          field('E-posta', parsed.primaryEmail ?? '—'),
          field('Telefon', parsed.primaryPhone ?? '—'),
        ],
      };
    }
    if (action === 'update_company') {
      const parsed = updateCompanyArgumentsSchema.parse(args);
      const company = await this.companies.get(parsed.companyId, actor);
      return {
        ...base,
        title: 'Firma bilgilerini güncelle',
        description: `${company.shortName || company.legalTitle} kaydındaki seçili alanlar değiştirilecek.`,
        impact: 'medium',
        fields: [field('Firma', company.shortName || company.legalTitle), ...Object.entries(parsed.changes).map(([key, value]) => field(key, value))].slice(0, 20),
      };
    }
    if (action === 'create_contact') {
      const parsed = contactCreateSchema.parse(args);
      const company = await this.companies.get(parsed.companyId, actor);
      return {
        ...base,
        title: 'Kontak oluştur',
        description: `${company.shortName || company.legalTitle} firmasına yeni kontak eklenecek.`,
        impact: 'medium',
        fields: [field('Firma', company.shortName || company.legalTitle), field('Ad Soyad', parsed.fullName), field('E-posta', parsed.workEmail ?? '—'), field('Telefon', parsed.mobilePhone ?? parsed.workPhone ?? '—')],
      };
    }
    if (action === 'create_quote') {
      const parsed = createQuoteArgumentsSchema.parse(args);
      const [company, division] = await Promise.all([
        this.companies.get(parsed.companyId, actor),
        parsed.divisionId ? this.divisionLabel(parsed.divisionId, actor) : Promise.resolve('Varsayılan bölüm'),
      ]);
      const catalogItems = await this.quotes.previewCatalogItems(parsed.items, actor, parsed.divisionId, parsed.currencyCode);
      return {
        ...base,
        title: 'Teklif taslağı oluştur',
        description: `${company.shortName || company.legalTitle} için yeni teklif numarası ayrılacak.`,
        impact: 'medium',
        fields: [
          field('Firma', company.shortName || company.legalTitle),
          field('Bölüm', division),
          field('Para Birimi', parsed.currencyCode),
          field('Geçerlilik', `${parsed.validityDays} gün`),
          ...catalogItems.map((item) =>
            field(
              'Katalog Kalemi',
              `${item.description} · ${item.quantity} adet · ${item.unitPrice.toLocaleString('tr-TR')} ${parsed.currencyCode}${item.discountPercent ? ` · %${item.discountPercent} indirim` : ''}`
            )
          ),
          field('Not', parsed.notes ?? '—'),
        ].slice(0, 20),
      };
    }
    if (action === 'create_activity' || action === 'create_follow_up') {
      const parsedActivity = action === 'create_activity' ? activityCreateSchema.parse(args) : null;
      const parsedFollowUp = action === 'create_follow_up' ? followUpArgumentsSchema.parse(args) : null;
      const parsed = parsedActivity ?? parsedFollowUp!;
      const company = await this.companies.get(parsed.companyId, actor);
      const dateValue = parsedActivity?.activityDate ?? parsedFollowUp!.nextFollowUpAt;
      return {
        ...base,
        title: action === 'create_activity' ? 'Aktivite oluştur' : 'Takip görevi oluştur',
        description: `${company.shortName || company.legalTitle} kaydına iş eklenecek.`,
        impact: 'medium',
        fields: [field('Firma', company.shortName || company.legalTitle), field('Konu', parsed.subject), field('Tarih', dateValue), field('Açıklama', parsed.description ?? '—')],
      };
    }
    if (action === 'create_calendar_event') {
      const parsed = calendarEventCreateSchema.parse(args);
      return {
        ...base,
        title: 'Takvim kaydı oluştur',
        description: 'Kişisel CRM takviminize yeni bir etkinlik eklenecek.',
        impact: 'medium',
        fields: [field('Başlık', parsed.title), field('Başlangıç', parsed.startsAt), field('Bitiş', parsed.endsAt), field('Konum', parsed.location ?? '—')],
      };
    }
    if (action === 'create_proforma' || action === 'create_contract' || action === 'approve_quote' || action === 'send_quote_email' || action === 'create_sales_package') {
      const quoteId = String(args.quoteId);
      const quote = await this.quotes.get(quoteId, actor);
      const company = await this.companies.get(quote.companyId, actor);
      const title = action === 'create_proforma'
        ? 'Proforma taslağı oluştur'
        : action === 'create_contract'
          ? 'Sözleşme taslağı oluştur'
          : action === 'approve_quote'
            ? 'Teklifi onayla'
            : action === 'send_quote_email'
              ? 'Teklifi e-postayla gönder'
              : 'Satış paketi oluştur';
      const fields = [field('Teklif', quote.documentNo), field('Firma', company.shortName || company.legalTitle)];
      if (action === 'send_quote_email') {
        const parsed = sendQuoteEmailArgumentsSchema.parse(args);
        fields.push(field('Alıcı', parsed.to), field('Konu', parsed.subject), field('Ek', 'Teklif PDF'));
      }
      if (action === 'create_sales_package') {
        const parsed = salesPackageArgumentsSchema.parse(args);
        fields.push(
          field('Proforma', parsed.includeProforma ? 'Oluşturulacak' : 'Hayır'),
          field('Sözleşme', parsed.includeContract ? 'Oluşturulacak' : 'Hayır'),
          field('Takip', parsed.createFollowUp ? parsed.nextFollowUpAt ?? 'Yarın' : 'Hayır')
        );
      }
      return {
        ...base,
        title,
        description: action === 'approve_quote' || action === 'send_quote_email'
          ? 'Bu işlem teklifin durumunu değiştirir ve dışarıya yansır.'
          : action === 'create_sales_package'
            ? 'Seçilen belgeler ve takip işi tek onayla hazırlanacak; CNC/UNI/SAC numara serisi korunacak.'
            : 'Belge, teklifin CNC/UNI/SAC iş alanı ve numara serisi korunarak oluşturulacak.',
        impact: action === 'approve_quote' || action === 'send_quote_email' ? 'high' : 'medium',
        fields,
      };
    }
    const parsed = sendEmailArgumentsSchema.parse(args);
    return {
      ...base,
      title: 'E-posta gönder',
      description: 'Mesaj belirtilen alıcıya dış iletişim olarak gönderilecek.',
      impact: 'high',
      fields: [field('Alıcı', parsed.to), field('Konu', parsed.subject), field('Mesaj', parsed.body)],
    };
  }

  private async divisionLabel(id: string, actor: AuthContext) {
    const [row] = await this.db
      .select({ name: divisions.name, code: divisions.code })
      .from(divisions)
      .where(and(eq(divisions.id, id), eq(divisions.tenantId, actor.tenantId), eq(divisions.isActive, true)))
      .limit(1);
    if (!row) throw new ValidationError('Geçerli bir bölüm seçin');
    if (!actor.canViewAllDivisions && !actor.divisionIds.includes(id)) throw new ForbiddenError('Bu bölüm için yetkiniz yok');
    return `${row.name} (${row.code})`;
  }

  private async findOwnedApproval(id: string, actor: AuthContext) {
    const [row] = await this.db
      .select()
      .from(assistantLogs)
      .where(
        and(
          eq(assistantLogs.id, id),
          eq(assistantLogs.tenantId, actor.tenantId),
          eq(assistantLogs.userId, actor.userId),
          eq(assistantLogs.eventType, 'approval_requested')
        )
      )
      .limit(1);
    if (!row) throw new NotFoundError('Onay kartı');
    return row;
  }

  private readMetadata(value: Record<string, unknown> | null): ApprovalMetadata | null {
    if (!value || value.version !== 1 || !value.card || !value.arguments || !value.action) return null;
    const action = assistantSecretaryActionKindSchema.safeParse(value.action);
    const card = assistantApprovalCardSchema.safeParse(value.card);
    if (!action.success || !card.success || card.data.action !== action.data) return null;
    if (typeof value.arguments !== 'object' || Array.isArray(value.arguments)) return null;
    const sourceSchema = z.object({ type: z.literal('assistant_inbox'), id: z.string().uuid() }).strict();
    const source = value.source === undefined ? undefined : sourceSchema.safeParse(value.source);
    if (source && !source.success) return null;
    return {
      version: 1,
      action: action.data,
      arguments: value.arguments as Record<string, unknown>,
      card: card.data,
      source: source?.data,
    };
  }

  private requirePermissionForAction(actor: AuthContext, action: AssistantSecretaryActionKind, args?: Record<string, unknown>) {
    const permission: Record<AssistantSecretaryActionKind, string> = {
      create_company: 'companies.create',
      update_company: 'companies.update',
      create_contact: 'contacts.create',
      create_quote: 'quotes.create',
      create_activity: 'activities.create',
      create_follow_up: 'activities.create',
      create_calendar_event: 'calendar.create',
      create_proforma: 'proformas.create',
      create_contract: 'contracts.create',
      approve_quote: 'quotes.approve',
      send_email: 'activities.create',
      send_quote_email: 'quotes.update',
      create_sales_package: 'quotes.read',
    };
    if (!actor.permissions.has(permission[action])) throw new ForbiddenError(`Yetki gerekli: ${permission[action]}`);
    if (action === 'create_sales_package') {
      const parsed = salesPackageArgumentsSchema.parse(args ?? {});
      const extras = [
        parsed.includeProforma ? 'proformas.create' : null,
        parsed.includeContract ? 'contracts.create' : null,
        parsed.createFollowUp ? 'activities.create' : null,
      ].filter((value): value is string => Boolean(value));
      for (const required of extras) {
        if (!actor.permissions.has(required)) throw new ForbiddenError(`Yetki gerekli: ${required}`);
      }
    }
  }

  private sourceType(action: AssistantSecretaryActionKind) {
    if (action.includes('quote') || action === 'create_sales_package') return 'quote';
    if (action.includes('company')) return 'company';
    if (action.includes('contact')) return 'contact';
    if (action.includes('calendar')) return 'calendar_event';
    if (action.includes('proforma')) return 'proforma';
    if (action.includes('contract')) return 'contract';
    if (action.includes('email')) return 'email';
    return 'activity';
  }

  private sourceId(args: Record<string, unknown>): string | null {
    for (const key of ['quoteId', 'companyId', 'contactId', 'opportunityId']) {
      if (typeof args[key] === 'string') return args[key] as string;
    }
    return null;
  }

  private displayValue(value: unknown): string {
    let text: string;
    if (value === null || value === undefined || value === '') text = '—';
    else if (value instanceof Date) text = value.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    else if (Array.isArray(value)) text = value.map((item) => this.displayValue(item)).join(', ');
    else if (typeof value === 'object') text = JSON.stringify(value);
    else text = String(value);
    return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
  }

  private jsonRecord(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }
}
