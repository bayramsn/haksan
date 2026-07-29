import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import {
  assistantInboxItemSchema,
  type AssistantApprovalCard,
  type AssistantInboxCapture,
  type AssistantInboxCategory,
  type AssistantInboxItem,
  type AssistantInboxListQuery,
  type AssistantInboxPriority,
  type AssistantInboxUpdate,
} from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { assistantInboxItems } from '../../db/schema/assistant';
import { companies, companyEmails, companyPhones, contacts, notifications } from '../../db/schema/companies';
import { users } from '../../db/schema/users';
import { DB } from '../../shared/database/database.module';
import type { AuthContext } from '../../shared/security/auth.types';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { companyVisibilityFilter } from '../../shared/utils/company-visibility';
import { resourceDivisionFilter } from '../../shared/utils/division-scope';
import { ActivitiesService } from '../activities/activities.service';
import { AssistantApprovalService } from './assistant-approval.service';

type PartyMatch = { companyId: string | null; contactId: string | null };

@Injectable()
export class AssistantInboxService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly activities: ActivitiesService,
    private readonly approvals: AssistantApprovalService
  ) {}

  async list(actor: AuthContext, query: AssistantInboxListQuery): Promise<AssistantInboxItem[]> {
    const filters = [eq(assistantInboxItems.tenantId, actor.tenantId)];
    if (query.status) filters.push(eq(assistantInboxItems.status, query.status));
    else filters.push(sql`${assistantInboxItems.status} not in ('resolved', 'archived')`);
    if (query.category) filters.push(eq(assistantInboxItems.category, query.category));
    if (query.channel) filters.push(eq(assistantInboxItems.channel, query.channel));
    const divisionScope = resourceDivisionFilter(actor, 'activities', assistantInboxItems.divisionId);
    if (divisionScope) filters.push(divisionScope);
    if (!actor.roles.includes('super_admin')) {
      filters.push(or(isNull(assistantInboxItems.assignedToUserId), eq(assistantInboxItems.assignedToUserId, actor.userId))!);
    }

    const rows = await this.db
      .select({
        item: assistantInboxItems,
        companyName: sql<string | null>`coalesce(${companies.shortName}, ${companies.legalTitle})`,
        contactName: contacts.fullName,
      })
      .from(assistantInboxItems)
      .leftJoin(companies, eq(assistantInboxItems.companyId, companies.id))
      .leftJoin(contacts, eq(assistantInboxItems.contactId, contacts.id))
      .where(and(...filters))
      .orderBy(
        sql`case ${assistantInboxItems.priority} when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
        desc(assistantInboxItems.receivedAt)
      )
      .limit(query.pageSize);

    return rows.map((row) => this.toDto(row.item, row.companyName, row.contactName));
  }

  async capture(input: AssistantInboxCapture, actor: AuthContext): Promise<AssistantInboxItem> {
    if (input.providerMessageId) {
      const existing = await this.db.query.assistantInboxItems.findFirst({
        where: and(
          eq(assistantInboxItems.tenantId, actor.tenantId),
          eq(assistantInboxItems.provider, input.provider),
          eq(assistantInboxItems.providerMessageId, input.providerMessageId)
        ),
      });
      if (existing) return this.get(existing.id, actor);
    }

    const match = await this.matchParty(input, actor);
    const classification = this.classify(`${input.subject ?? ''}\n${input.body}`);
    const receivedAt = input.receivedAt ?? new Date();
    const dueAt = new Date(receivedAt.getTime() + this.dueWindowMs(classification.priority));
    const nextFollowUpAt = new Date(receivedAt.getTime() + this.followUpWindowMs(classification.category));
    const divisionId = actor.activeDivisionId && actor.activeDivisionId !== 'all'
      ? actor.activeDivisionId
      : actor.primaryDivisionId;
    const draftReply = this.buildDraftReply(input, classification.category);

    const [created] = await this.db
      .insert(assistantInboxItems)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        channel: input.channel,
        provider: input.provider,
        providerMessageId: input.providerMessageId ?? null,
        senderName: input.senderName ?? null,
        senderEmail: input.senderEmail?.toLowerCase() ?? null,
        senderPhone: input.senderPhone ?? null,
        subject: input.subject ?? null,
        body: input.body,
        category: classification.category,
        priority: classification.priority,
        companyId: match.companyId,
        contactId: match.contactId,
        assignedToUserId: actor.userId,
        receivedAt,
        dueAt,
        nextFollowUpAt,
        draftReply,
        classificationConfidence: classification.confidence,
        metadata: { classificationVersion: 1, autoMatched: Boolean(match.companyId || match.contactId) },
        createdBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      if (input.providerMessageId) {
        const concurrent = await this.db.query.assistantInboxItems.findFirst({
          where: and(
            eq(assistantInboxItems.tenantId, actor.tenantId),
            eq(assistantInboxItems.provider, input.provider),
            eq(assistantInboxItems.providerMessageId, input.providerMessageId)
          ),
        });
        if (concurrent) return this.get(concurrent.id, actor);
      }
      throw new ValidationError('Gelen ileti kaydedilemedi');
    }

    if (match.companyId && actor.permissions.has('activities.create')) {
      await this.activities
        .createActivity(
          {
            companyId: match.companyId,
            contactId: match.contactId ?? undefined,
            activityTypeCode: input.channel === 'phone_note' ? 'call' : input.channel === 'email' ? 'email' : 'note',
            subject: this.cleanSubject(input.subject || `${this.channelLabel(input.channel)} mesajı`),
            description: input.body.slice(0, 4000),
            activityDate: receivedAt,
            nextFollowUpAt,
          },
          actor
        )
        .catch(() => undefined);
    }

    if (classification.priority === 'critical') {
      await this.db.insert(notifications).values({
        tenantId: actor.tenantId,
        userId: actor.userId,
        divisionId,
        type: 'assistant_inbox_critical',
        title: 'Kritik gelen ileti',
        body: this.cleanSubject(input.subject || input.body.slice(0, 180)),
        entityType: 'assistant_inbox',
        entityId: created.id,
      });
    }

    return this.get(created.id, actor);
  }

  /**
   * Sistem (webhook) kaynaklı gelen ileti yakalama — actor gerektirmez.
   * WhatsApp/entegrasyon webhook'ları için: tenant-scoped basit telefon eşleştirme
   * + sınıflandırma + yanıt taslağı. Aktivite/bildirim yan etkileri actor
   * gerektirdiğinden burada üretilmez (gelen kutusunda görünür ve atanabilir).
   */
  async captureInbound(tenantId: string, input: AssistantInboxCapture): Promise<string | null> {
    if (input.providerMessageId) {
      const existing = await this.db.query.assistantInboxItems.findFirst({
        where: and(
          eq(assistantInboxItems.tenantId, tenantId),
          eq(assistantInboxItems.provider, input.provider),
          eq(assistantInboxItems.providerMessageId, input.providerMessageId),
        ),
        columns: { id: true },
      });
      if (existing) return existing.id;
    }

    // Basit telefon eşleştirme (son 10 hane) — firma ve kontak telefonları.
    let companyId: string | null = null;
    let contactId: string | null = null;
    const digits = (input.senderPhone ?? '').replace(/\D/g, '');
    if (digits.length >= 7) {
      const last10 = digits.slice(-10);
      const phoneMatch = await this.db
        .select({ companyId: companyPhones.companyId })
        .from(companyPhones)
        .innerJoin(companies, eq(companyPhones.companyId, companies.id))
        .where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt), sql`right(regexp_replace(${companyPhones.phone}, '[^0-9]', '', 'g'), 10) = ${last10}`))
        .limit(1);
      companyId = phoneMatch[0]?.companyId ?? null;
    }

    const classification = this.classify(`${input.subject ?? ''}\n${input.body}`);
    const receivedAt = input.receivedAt ?? new Date();
    const [created] = await this.db
      .insert(assistantInboxItems)
      .values({
        tenantId,
        divisionId: null,
        channel: input.channel,
        provider: input.provider,
        providerMessageId: input.providerMessageId ?? null,
        senderName: input.senderName ?? null,
        senderEmail: input.senderEmail?.toLowerCase() ?? null,
        senderPhone: input.senderPhone ?? null,
        subject: input.subject ?? null,
        body: input.body,
        category: classification.category,
        priority: classification.priority,
        companyId,
        contactId,
        assignedToUserId: null,
        receivedAt,
        dueAt: new Date(receivedAt.getTime() + this.dueWindowMs(classification.priority)),
        nextFollowUpAt: new Date(receivedAt.getTime() + this.followUpWindowMs(classification.category)),
        draftReply: this.buildDraftReply(input, classification.category),
        classificationConfidence: classification.confidence,
        metadata: { classificationVersion: 1, autoMatched: Boolean(companyId), inboundWebhook: true },
        createdBy: null,
      })
      .onConflictDoNothing()
      .returning({ id: assistantInboxItems.id });

    if (created && classification.priority === 'critical') {
      await this.db.insert(notifications).values({
        tenantId,
        userId: null,
        divisionId: null,
        type: 'assistant_inbox_critical',
        title: 'Kritik gelen ileti',
        body: this.cleanSubject(input.subject || input.body.slice(0, 180)),
        entityType: 'assistant_inbox',
        entityId: created.id,
      });
    }
    return created?.id ?? null;
  }

  async update(id: string, input: AssistantInboxUpdate, actor: AuthContext): Promise<AssistantInboxItem> {
    const current = await this.assertItem(id, actor);
    if (!actor.roles.includes('super_admin') && current.assignedToUserId && current.assignedToUserId !== actor.userId) {
      throw new ForbiddenError('Bu gelen ileti başka bir kullanıcıya atanmış');
    }
    if (input.assignedToUserId) {
      const assignee = await this.db.query.users.findFirst({
        where: and(eq(users.id, input.assignedToUserId), eq(users.tenantId, actor.tenantId), eq(users.status, 'active')),
        columns: { id: true },
      });
      if (!assignee) throw new ValidationError('Atanan kullanıcı bulunamadı');
      if (!actor.roles.includes('super_admin') && assignee.id !== actor.userId) {
        throw new ForbiddenError('Başka kullanıcıya atama yetkiniz yok');
      }
    }
    const resolved = input.status === 'resolved' || input.status === 'archived';
    await this.db
      .update(assistantInboxItems)
      .set({
        ...(input.status !== undefined ? { status: input.status, resolvedAt: resolved ? new Date() : null } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
        ...(input.nextFollowUpAt !== undefined ? { nextFollowUpAt: input.nextFollowUpAt } : {}),
        ...(input.draftReply !== undefined ? { draftReply: input.draftReply } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(assistantInboxItems.id, id), eq(assistantInboxItems.tenantId, actor.tenantId)));
    return this.get(id, actor);
  }

  async prepareReply(id: string, actor: AuthContext): Promise<AssistantApprovalCard> {
    const item = await this.assertItem(id, actor);
    if (item.channel !== 'email' || !item.senderEmail) {
      throw new ValidationError('Bu kayıtta onaylı e-posta gönderimi için geçerli alıcı adresi yok');
    }
    if (!item.draftReply) throw new ValidationError('Önce yanıt taslağı hazırlanmalı');
    const subject = this.cleanSubject(item.subject ? `Re: ${item.subject}` : 'Mesajınız hakkında');
    return this.approvals.create(
      {
        kind: 'send_email',
        arguments: { to: item.senderEmail, subject, body: item.draftReply },
        source: { type: 'assistant_inbox', id: item.id },
      },
      actor,
      `Gelen kutusu yanıtı: ${item.id}`
    );
  }

  private async get(id: string, actor: AuthContext): Promise<AssistantInboxItem> {
    const item = await this.assertItem(id, actor);
    const [row] = await this.db
      .select({
        companyName: sql<string | null>`coalesce(${companies.shortName}, ${companies.legalTitle})`,
        contactName: contacts.fullName,
      })
      .from(assistantInboxItems)
      .leftJoin(companies, eq(assistantInboxItems.companyId, companies.id))
      .leftJoin(contacts, eq(assistantInboxItems.contactId, contacts.id))
      .where(and(eq(assistantInboxItems.id, id), eq(assistantInboxItems.tenantId, actor.tenantId)))
      .limit(1);
    return this.toDto(item, row?.companyName ?? null, row?.contactName ?? null);
  }

  private async assertItem(id: string, actor: AuthContext) {
    const filters = [eq(assistantInboxItems.id, id), eq(assistantInboxItems.tenantId, actor.tenantId)];
    const divisionScope = resourceDivisionFilter(actor, 'activities', assistantInboxItems.divisionId);
    if (divisionScope) filters.push(divisionScope);
    const item = await this.db.query.assistantInboxItems.findFirst({ where: and(...filters) });
    if (!item) throw new NotFoundError('Gelen ileti');
    return item;
  }

  private async matchParty(input: AssistantInboxCapture, actor: AuthContext): Promise<PartyMatch> {
    const visibility = await companyVisibilityFilter(this.db, actor);
    if (input.contactId) {
      const [contact] = await this.db
        .select({ contactId: contacts.id, companyId: contacts.companyId })
        .from(contacts)
        .innerJoin(companies, eq(contacts.companyId, companies.id))
        .where(
          and(
            eq(contacts.id, input.contactId),
            eq(contacts.tenantId, actor.tenantId),
            isNull(contacts.deletedAt),
            isNull(companies.deletedAt),
            visibility ?? sql`true`
          )
        )
        .limit(1);
      if (!contact) throw new NotFoundError('Kontak');
      if (input.companyId && input.companyId !== contact.companyId) throw new ValidationError('Kontak seçilen firmaya ait değil');
      return contact;
    }
    if (input.companyId) {
      const [company] = await this.db
        .select({ companyId: companies.id })
        .from(companies)
        .where(and(eq(companies.id, input.companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt), visibility ?? sql`true`))
        .limit(1);
      if (!company) throw new NotFoundError('Firma');
      return { companyId: company.companyId, contactId: null };
    }

    const email = input.senderEmail?.trim().toLowerCase();
    if (email) {
      const [contact] = await this.db
        .select({ contactId: contacts.id, companyId: contacts.companyId })
        .from(contacts)
        .innerJoin(companies, eq(contacts.companyId, companies.id))
        .where(
          and(
            eq(contacts.tenantId, actor.tenantId),
            isNull(contacts.deletedAt),
            isNull(companies.deletedAt),
            or(ilike(contacts.workEmail, email), ilike(contacts.personalEmail, email), ilike(contacts.otherEmail, email)),
            visibility ?? sql`true`
          )
        )
        .limit(1);
      if (contact) return contact;
      const [company] = await this.db
        .select({ companyId: companies.id })
        .from(companyEmails)
        .innerJoin(companies, eq(companyEmails.companyId, companies.id))
        .where(
          and(
            eq(companyEmails.tenantId, actor.tenantId),
            ilike(companyEmails.email, email),
            isNull(companyEmails.deletedAt),
            isNull(companies.deletedAt),
            visibility ?? sql`true`
          )
        )
        .limit(1);
      if (company) return { companyId: company.companyId, contactId: null };
    }

    const phone = this.digits(input.senderPhone);
    if (phone.length >= 7) {
      const suffix = phone.slice(-10);
      const [contact] = await this.db
        .select({ contactId: contacts.id, companyId: contacts.companyId })
        .from(contacts)
        .innerJoin(companies, eq(contacts.companyId, companies.id))
        .where(
          and(
            eq(contacts.tenantId, actor.tenantId),
            isNull(contacts.deletedAt),
            isNull(companies.deletedAt),
            sql`right(regexp_replace(coalesce(${contacts.mobilePhone}, ${contacts.workPhone}, ${contacts.otherPhone}, ''), '[^0-9]', '', 'g'), 10) = ${suffix}`,
            visibility ?? sql`true`
          )
        )
        .limit(1);
      if (contact) return contact;
      const [company] = await this.db
        .select({ companyId: companies.id })
        .from(companyPhones)
        .innerJoin(companies, eq(companyPhones.companyId, companies.id))
        .where(
          and(
            eq(companyPhones.tenantId, actor.tenantId),
            isNull(companyPhones.deletedAt),
            isNull(companies.deletedAt),
            sql`right(regexp_replace(${companyPhones.phone}, '[^0-9]', '', 'g'), 10) = ${suffix}`,
            visibility ?? sql`true`
          )
        )
        .limit(1);
      if (company) return { companyId: company.companyId, contactId: null };
    }
    return { companyId: null, contactId: null };
  }

  private classify(value: string): { category: AssistantInboxCategory; priority: AssistantInboxPriority; confidence: number } {
    const text = value.toLocaleLowerCase('tr-TR');
    const category: AssistantInboxCategory = /servis|arıza|ariza|bakım|bakim|teknik|kurulum|şikayet|sikayet/.test(text)
      ? 'service'
      : /sevkiyat|kargo|teslimat|nakliye|gümrük|gumruk/.test(text)
        ? 'shipment'
        : /ödeme|odeme|fatura|tahsilat|vade|banka|borç|borc/.test(text)
          ? 'finance'
          : /teklif|fiyat|satın|satin|ürün|urun|makine|cnc|üniversal|universal|sac/.test(text)
            ? 'sales'
            : 'general';
    const priority: AssistantInboxPriority = /acil|hemen|üretim durdu|uretim durdu|çalışmıyor|calismiyor|kritik|bugün teslim|bugun teslim/.test(text)
      ? 'critical'
      : /gecik|son gün|son gun|yarın|yarin|şikayet|sikayet/.test(text)
        ? 'high'
        : /bilgi|teşekkür|tesekkur/.test(text)
          ? 'low'
          : 'normal';
    return { category, priority, confidence: category === 'general' ? 55 : 82 };
  }

  private buildDraftReply(input: AssistantInboxCapture, category: AssistantInboxCategory): string {
    const salutation = input.senderName ? `Merhaba ${input.senderName},` : 'Merhaba,';
    const receipt = category === 'service'
      ? 'Teknik talebinizi aldık. İlgili ekip kaydı inceleyerek en kısa sürede dönüş sağlayacak.'
      : category === 'sales'
        ? 'Talebinizi aldık. Ürün ve teklif detaylarını kontrol ederek size dönüş sağlayacağız.'
        : category === 'shipment'
          ? 'Sevkiyat talebinizi aldık. Teslimat durumunu kontrol ederek bilgi vereceğiz.'
          : category === 'finance'
            ? 'Finansal bildiriminizi aldık. İlgili kayıtları kontrol ederek dönüş sağlayacağız.'
            : 'Mesajınızı aldık. Konuyu kontrol ederek size dönüş sağlayacağız.';
    return `${salutation}\n\n${receipt}\n\nSaygılarımızla,\nHaksan`;
  }

  private toDto(item: typeof assistantInboxItems.$inferSelect, companyName: string | null, contactName: string | null): AssistantInboxItem {
    return assistantInboxItemSchema.parse({
      id: item.id,
      channel: item.channel,
      direction: item.direction,
      senderName: item.senderName,
      senderEmail: item.senderEmail,
      senderPhone: item.senderPhone,
      subject: item.subject,
      body: item.body,
      category: item.category,
      priority: item.priority,
      status: item.status,
      companyId: item.companyId,
      companyName,
      contactId: item.contactId,
      contactName,
      assignedToUserId: item.assignedToUserId,
      receivedAt: item.receivedAt.toISOString(),
      dueAt: item.dueAt?.toISOString() ?? null,
      nextFollowUpAt: item.nextFollowUpAt?.toISOString() ?? null,
      followUpCount: item.followUpCount,
      draftReply: item.draftReply,
      classificationConfidence: item.classificationConfidence / 100,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    });
  }

  private dueWindowMs(priority: AssistantInboxPriority) {
    return priority === 'critical' ? 2 * 60 * 60 * 1000 : priority === 'high' ? 8 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  }

  private followUpWindowMs(category: AssistantInboxCategory) {
    return category === 'sales' ? 3 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  }

  private channelLabel(channel: AssistantInboxCapture['channel']) {
    return channel === 'email' ? 'E-posta' : channel === 'whatsapp' ? 'WhatsApp' : channel === 'web_form' ? 'Web formu' : channel === 'phone_note' ? 'Telefon notu' : 'CRM';
  }

  private cleanSubject(value: string) {
    return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 255);
  }

  private digits(value?: string) {
    return (value ?? '').replace(/\D/g, '');
  }
}
