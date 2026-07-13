import { Inject, Injectable } from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { DB } from '../../shared/database/database.module';
import {
  callAssistantSuggestions,
  callEvents,
  phoneNumberIndex,
} from '../../db/schema/call-assistant';
import {
  companies,
  companyDivisions,
  companyPhones,
  contactPhones,
  contacts,
  notifications,
} from '../../db/schema/companies';
import { tenants } from '../../db/schema/tenants';
import { roles, userDivisions, userRoles, users } from '../../db/schema/users';
import { calls } from '../../db/schema/crm';
import { serviceComplaintIntakes } from '../../db/schema/service';
import { QuotesService } from '../quotes/quotes.service';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import {
  callSuggestionActionInputSchema,
  callWebhookPayloadSchema,
  manualCallEventSchema,
  mobileCallEventSchema,
  normalizePhoneNumber,
  type CallAssistantAction,
  type CallSuggestionActionInput,
  type CallWebhookPayload,
  type ManualCallEventInput,
  type MobileCallEventInput,
} from '@haksan/shared';
import { buildPaginated } from '../../shared/utils/pagination';
import {
  divisionFilter,
  resolveActorDivisionScope,
  resolveAssignedResourceDivision,
} from '../../shared/utils/division-scope';

type PhoneMatch = {
  companyId: string | null;
  contactId: string | null;
  matchStatus: 'matched' | 'unmatched' | 'ambiguous';
};

type CanonicalCallInput = {
  tenantId: string;
  provider: string;
  providerEventId: string;
  source: 'pbx' | 'android' | 'manual_pbx';
  direction: 'inbound' | 'outbound';
  eventType: 'completed' | 'missed';
  callerNumber?: string | null;
  calleeNumber?: string | null;
  matchedNumber?: string | null;
  normalizedPhone?: string | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationSeconds?: number | null;
  userId?: string | null;
  payload: Record<string, unknown>;
};

@Injectable()
export class CallAssistantService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly quotes: QuotesService
  ) {}

  verifyWebhookSecret(headerValue: string | string[] | undefined, configuredSecret?: string | null) {
    const expected = configuredSecret || 'dev-call-secret';
    const actual = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!actual || !this.safeEqual(actual, expected)) {
      throw new UnauthorizedError('Geçersiz çağrı webhook sırrı');
    }
  }

  verifyTenantWebhookSecret(
    headerValue: string | string[] | undefined,
    tenantId: string,
    configuredSecret?: string | null
  ) {
    const actual = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const expected = this.tenantWebhookSecret(tenantId, configuredSecret);
    if (!actual || !this.safeEqual(actual, expected)) {
      throw new UnauthorizedError('Geçersiz çağrı webhook sırrı');
    }
  }

  webhookCredential(actor: AuthContext, configuredSecret?: string | null) {
    if (!actor.roles.includes('super_admin')) {
      throw new ForbiddenError('Webhook kimlik bilgisi yalnızca tenant süper yöneticisi tarafından görüntülenebilir');
    }
    return { tenantId: actor.tenantId, secret: this.tenantWebhookSecret(actor.tenantId, configuredSecret) };
  }

  async tenantForWebhook(input: { tenantId?: string | null; headerTenantId?: string | null }) {
    const explicitTenantId = input.tenantId || input.headerTenantId || null;
    if (explicitTenantId) {
      const tenant = await this.db.query.tenants.findFirst({
        where: and(eq(tenants.id, explicitTenantId), eq(tenants.isActive, true), isNull(tenants.deletedAt)),
      });
      if (!tenant) throw new NotFoundError('Tenant');
      return tenant.id;
    }
    const rows = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.isActive, true), isNull(tenants.deletedAt)))
      .limit(2);
    if (rows.length !== 1) {
      throw new ValidationError('Webhook için x-haksan-tenant-id başlığı veya tenantId alanı zorunludur');
    }
    return rows[0].id;
  }

  async ingestWebhook(provider: string, rawPayload: Record<string, unknown>, tenantId: string) {
    const parsed = callWebhookPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) throw new ValidationError('Geçersiz çağrı webhook gövdesi', { issues: parsed.error.issues });
    const body = parsed.data;
    const canonical = this.webhookToCanonical(provider, body, rawPayload, tenantId);
    return this.ingestCanonical(canonical);
  }

  async ingestMobileEvent(input: MobileCallEventInput, actor: AuthContext) {
    const parsed = mobileCallEventSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Geçersiz mobil çağrı gövdesi', { issues: parsed.error.issues });
    const body = parsed.data;
    const normalized = normalizePhoneNumber(body.phoneNumber);
    if (!normalized) throw new ValidationError('Telefon numarası normalize edilemedi');
    const providerEventId = body.eventId?.trim() || this.payloadHash('android', { ...body, userId: actor.userId });
    return this.ingestCanonical({
      tenantId: actor.tenantId,
      provider: 'android',
      providerEventId,
      source: 'android',
      direction: body.direction,
      eventType: this.eventTypeFromStatus(body.eventType, body.status),
      callerNumber: body.direction === 'inbound' ? body.phoneNumber : null,
      calleeNumber: body.direction === 'outbound' ? body.phoneNumber : null,
      matchedNumber: body.phoneNumber,
      normalizedPhone: normalized,
      startedAt: body.startedAt ?? null,
      endedAt: body.endedAt ?? null,
      durationSeconds: body.durationSeconds ?? null,
      userId: actor.userId,
      payload: body as Record<string, unknown>,
    });
  }

  async ingestManualEvent(input: ManualCallEventInput, actor: AuthContext) {
    const parsed = manualCallEventSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Geçersiz manuel santral gövdesi', { issues: parsed.error.issues });
    const body = parsed.data;
    const normalized = normalizePhoneNumber(body.phoneNumber);
    if (!normalized) throw new ValidationError('Telefon numarası normalize edilemedi');
    const providerEventId = body.eventId?.trim() || `manual:${actor.userId}:${Date.now()}:${randomUUID()}`;
    return this.ingestCanonical({
      tenantId: actor.tenantId,
      provider: 'manual_pbx',
      providerEventId,
      source: 'manual_pbx',
      direction: body.direction,
      eventType: this.eventTypeFromStatus(body.eventType, body.status),
      callerNumber: body.direction === 'inbound' ? body.phoneNumber : null,
      calleeNumber: body.direction === 'outbound' ? body.phoneNumber : null,
      matchedNumber: body.phoneNumber,
      normalizedPhone: normalized,
      startedAt: body.startedAt ?? null,
      endedAt: body.endedAt ?? new Date(),
      durationSeconds: body.durationSeconds ?? null,
      userId: actor.userId,
      payload: { ...body, source: 'manual_pbx' },
    });
  }

  async listSuggestions(actor: AuthContext, query: { status?: string }) {
    const status = query.status || 'pending';
    const filters = [
      eq(callAssistantSuggestions.tenantId, actor.tenantId),
      eq(callAssistantSuggestions.status, status),
      isNull(callAssistantSuggestions.deletedAt),
    ];
    const scope = resolveActorDivisionScope(actor);
    const scopedDivision = divisionFilter(scope, callAssistantSuggestions.divisionId);
    const sharedDivisionVisibility = and(isNull(callAssistantSuggestions.userId), scopedDivision ?? sql`1 = 0`);
    const visibility = actor.canViewAllDivisions && scope.mode === 'all'
      ? undefined
      : or(eq(callAssistantSuggestions.userId, actor.userId), sharedDivisionVisibility);
    if (visibility) filters.push(visibility);

    const rows = await this.db
      .select({
        suggestion: callAssistantSuggestions,
        event: callEvents,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        contact: { id: contacts.id, fullName: contacts.fullName },
      })
      .from(callAssistantSuggestions)
      .innerJoin(callEvents, eq(callAssistantSuggestions.callEventId, callEvents.id))
      .innerJoin(companies, eq(callAssistantSuggestions.companyId, companies.id))
      .leftJoin(contacts, eq(callAssistantSuggestions.contactId, contacts.id))
      .where(and(...filters))
      .orderBy(desc(callAssistantSuggestions.createdAt))
      .limit(50);

    return buildPaginated(
      rows.map((row) => ({
        ...row.suggestion,
        event: row.event,
        company: row.company,
        contact: row.contact?.id ? row.contact : null,
        availableActions: this.availableActions(actor),
      })),
      rows.length,
      { page: 1, pageSize: 50, sortDir: 'desc' }
    );
  }

  async actOnSuggestion(id: string, input: CallSuggestionActionInput, actor: AuthContext) {
    const parsed = callSuggestionActionInputSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Geçersiz çağrı aksiyonu', { issues: parsed.error.issues });
    const suggestion = await this.getVisiblePendingSuggestion(id, actor);
    const action = parsed.data.action;

    if (action === 'dismiss') {
      return this.completeSuggestion(suggestion.id, action, null, null);
    }
    if (action === 'create_quote') {
      this.requirePermission(actor, 'quotes.create');
      const quote = await this.quotes.create(
        {
          companyId: suggestion.companyId,
          contactId: suggestion.contactId ?? undefined,
          divisionId: suggestion.divisionId ?? undefined,
          quoteDate: new Date(),
          validityDays: 30,
          currencyCode: 'USD',
          notes: parsed.data.notes ?? 'Telefon görüşmesi sonrası hızlı teklif taslağı.',
        },
        actor
      );
      await this.completeSuggestion(suggestion.id, action, 'quote', quote.id);
      return { action, quote };
    }
    if (action === 'create_service_ticket') {
      this.requirePermission(actor, 'service_tickets.create');
      const complaint = await this.createComplaintIntakeFromSuggestion(suggestion, parsed.data, actor);
      await this.completeSuggestion(suggestion.id, action, 'service_complaint_intake', complaint.id);
      return { action, complaint };
    }
    if (action === 'log_call') {
      this.requirePermission(actor, 'activities.create');
      const event = await this.db.query.callEvents.findFirst({ where: eq(callEvents.id, suggestion.callEventId) });
      const divisionId = resolveAssignedResourceDivision(actor, 'activities', suggestion.divisionId ?? null);
      if (!divisionId) throw new ValidationError('Arama kaydı için bölüm ataması zorunludur', { field: 'divisionId' });
      const [row] = await this.db
        .insert(calls)
        .values({
          tenantId: actor.tenantId,
          divisionId,
          companyId: suggestion.companyId,
          contactId: suggestion.contactId ?? null,
          callDate: event?.endedAt ?? event?.startedAt ?? new Date(),
          callResult: parsed.data.description ?? parsed.data.subject ?? 'Telefon görüşmesi kaydedildi.',
          nextAction: parsed.data.notes ?? null,
          createdBy: actor.userId,
        })
        .returning();
      await this.completeSuggestion(suggestion.id, action, 'call', row.id);
      return { action, call: row };
    }
    throw new ValidationError('Bilinmeyen aksiyon');
  }

  async rebuildTenantPhoneIndex(tenantId: string) {
    const indexRows: Array<typeof phoneNumberIndex.$inferInsert> = [];

    const companyRows = await this.db
      .select({
        companyId: companyPhones.companyId,
        phoneSource: companyPhones.phoneType,
        phone: companyPhones.phone,
        isDefault: companyPhones.isDefault,
      })
      .from(companyPhones)
      .innerJoin(companies, eq(companyPhones.companyId, companies.id))
      .where(and(eq(companyPhones.tenantId, tenantId), isNull(companyPhones.deletedAt), isNull(companies.deletedAt)));

    for (const row of companyRows) {
      const normalized = normalizePhoneNumber(row.phone);
      if (!normalized) continue;
      indexRows.push({
        tenantId,
        companyId: row.companyId,
        contactId: null,
        entityType: 'company',
        entityId: row.companyId,
        phoneSource: row.phoneSource,
        originalPhone: row.phone,
        normalizedPhone: normalized,
        isDefault: row.isDefault,
        priority: row.isDefault || row.phoneSource === 'main' ? 50 : 70,
      });
    }

    const contactRows = await this.db
      .select({
        contactId: contacts.id,
        companyId: contacts.companyId,
        workPhone: contacts.workPhone,
        mobilePhone: contacts.mobilePhone,
        otherPhone: contacts.otherPhone,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)));

    for (const row of contactRows) {
      for (const [source, phone, priority] of [
        ['mobilePhone', row.mobilePhone, 10],
        ['workPhone', row.workPhone, 20],
        ['otherPhone', row.otherPhone, 30],
      ] as const) {
        const normalized = normalizePhoneNumber(phone);
        if (!normalized) continue;
        indexRows.push({
          tenantId,
          companyId: row.companyId,
          contactId: row.contactId,
          entityType: 'contact',
          entityId: row.contactId,
          phoneSource: source,
          originalPhone: phone!,
          normalizedPhone: normalized,
          isDefault: source === 'mobilePhone',
          priority,
        });
      }
    }

    const extraContactRows = await this.db
      .select({
        contactId: contactPhones.contactId,
        companyId: contacts.companyId,
        phoneType: contactPhones.phoneType,
        phone: contactPhones.phone,
        isDefault: contactPhones.isDefault,
      })
      .from(contactPhones)
      .innerJoin(contacts, eq(contactPhones.contactId, contacts.id))
      .where(and(eq(contactPhones.tenantId, tenantId), isNull(contactPhones.deletedAt), isNull(contacts.deletedAt)));

    for (const row of extraContactRows) {
      const normalized = normalizePhoneNumber(row.phone);
      if (!normalized) continue;
      indexRows.push({
        tenantId,
        companyId: row.companyId,
        contactId: row.contactId,
        entityType: 'contact',
        entityId: row.contactId,
        phoneSource: `contactPhones:${row.phoneType}`,
        originalPhone: row.phone,
        normalizedPhone: normalized,
        isDefault: row.isDefault,
        priority: row.isDefault ? 15 : 35,
      });
    }

    await this.db.delete(phoneNumberIndex).where(eq(phoneNumberIndex.tenantId, tenantId));
    const deduped = Array.from(
      new Map(indexRows.map((row) => [`${row.entityType}:${row.entityId}:${row.phoneSource}:${row.normalizedPhone}`, row])).values()
    );
    if (deduped.length) await this.db.insert(phoneNumberIndex).values(deduped);
    return { count: deduped.length };
  }

  private async ingestCanonical(input: CanonicalCallInput) {
    await this.rebuildTenantPhoneIndex(input.tenantId);
    const match = input.normalizedPhone ? await this.matchPhone(input.tenantId, input.normalizedPhone) : null;
    const existing = await this.db.query.callEvents.findFirst({
      where: and(
        eq(callEvents.tenantId, input.tenantId),
        eq(callEvents.provider, input.provider),
        eq(callEvents.providerEventId, input.providerEventId)
      ),
    });
    if (existing) {
      const suggestions = await this.suggestionsForCallEvent(existing.id);
      return { event: existing, suggestions, idempotent: true };
    }

    const [event] = await this.db
      .insert(callEvents)
      .values({
        tenantId: input.tenantId,
        provider: input.provider,
        providerEventId: input.providerEventId,
        source: input.source,
        direction: input.direction,
        eventType: input.eventType,
        callerNumber: input.callerNumber ?? null,
        calleeNumber: input.calleeNumber ?? null,
        matchedNumber: input.matchedNumber ?? null,
        normalizedPhone: input.normalizedPhone ?? null,
        companyId: match?.companyId ?? null,
        contactId: match?.contactId ?? null,
        userId: input.userId ?? null,
        matchStatus: match?.matchStatus ?? 'unmatched',
        startedAt: input.startedAt ?? null,
        endedAt: input.endedAt ?? null,
        durationSeconds: input.durationSeconds ?? null,
        payload: input.payload,
      })
      .returning();

    const suggestions = event.matchStatus === 'matched' && event.companyId
      ? [await this.createSuggestion(event)]
      : [];
    return { event, suggestions, idempotent: false };
  }

  private webhookToCanonical(
    provider: string,
    body: CallWebhookPayload,
    rawPayload: Record<string, unknown>,
    tenantId: string
  ): CanonicalCallInput {
    const direction = body.direction;
    const callerNumber = body.callerNumber ?? body.from ?? (direction === 'inbound' ? body.phoneNumber : undefined);
    const calleeNumber = body.calleeNumber ?? body.to ?? (direction === 'outbound' ? body.phoneNumber : undefined);
    const matchedNumber = direction === 'inbound' ? callerNumber : calleeNumber;
    const normalized = normalizePhoneNumber(matchedNumber);
    if (!normalized) throw new ValidationError('Telefon numarası normalize edilemedi');
    return {
      tenantId,
      provider: provider.trim().toLowerCase().slice(0, 64) || 'pbx',
      providerEventId: body.eventId ?? body.callId ?? body.id ?? this.payloadHash(provider, rawPayload),
      source: 'pbx',
      direction,
      eventType: this.eventTypeFromStatus(body.eventType, body.status),
      callerNumber: callerNumber ?? null,
      calleeNumber: calleeNumber ?? null,
      matchedNumber: matchedNumber ?? null,
      normalizedPhone: normalized,
      startedAt: body.startedAt ?? null,
      endedAt: body.endedAt ?? null,
      durationSeconds: body.durationSeconds ?? null,
      userId: body.userId ?? null,
      payload: rawPayload,
    };
  }

  private eventTypeFromStatus(eventType?: string, status?: string): 'completed' | 'missed' {
    if (eventType === 'completed' || eventType === 'missed') return eventType;
    return ['missed', 'no_answer', 'busy', 'failed'].includes(status ?? '') ? 'missed' : 'completed';
  }

  private async matchPhone(tenantId: string, normalizedPhone: string): Promise<PhoneMatch> {
    const rows = await this.db
      .select()
      .from(phoneNumberIndex)
      .where(and(eq(phoneNumberIndex.tenantId, tenantId), eq(phoneNumberIndex.normalizedPhone, normalizedPhone), isNull(phoneNumberIndex.deletedAt)))
      .orderBy(asc(phoneNumberIndex.priority), desc(phoneNumberIndex.isDefault), asc(phoneNumberIndex.createdAt));
    if (!rows.length) return { companyId: null, contactId: null, matchStatus: 'unmatched' };
    const companyIds = new Set(rows.map((row) => row.companyId).filter(Boolean));
    if (companyIds.size > 1) return { companyId: null, contactId: null, matchStatus: 'ambiguous' };
    const first = rows[0];
    return { companyId: first.companyId, contactId: first.contactId, matchStatus: 'matched' };
  }

  private async createSuggestion(event: typeof callEvents.$inferSelect) {
    const existing = await this.db.query.callAssistantSuggestions.findFirst({
      where: and(
        eq(callAssistantSuggestions.callEventId, event.id),
        event.userId ? eq(callAssistantSuggestions.userId, event.userId) : isNull(callAssistantSuggestions.userId),
        isNull(callAssistantSuggestions.deletedAt)
      ),
    });
    if (existing) return existing;

    const company = await this.db.query.companies.findFirst({ where: eq(companies.id, event.companyId!) });
    const contact = event.contactId
      ? await this.db.query.contacts.findFirst({ where: eq(contacts.id, event.contactId) })
      : null;
    const divisionId = await this.firstCompanyDivision(event.companyId!, event.tenantId);
    const title = `${company?.shortName || company?.legalTitle || 'Firma'} aradı`;
    const body = [
      contact?.fullName ? `Kontak: ${contact.fullName}` : null,
      event.eventType === 'missed' ? 'Kaçan arama' : 'Arama tamamlandı',
      event.normalizedPhone,
    ].filter(Boolean).join(' · ');
    const [createdSuggestion] = await this.db
      .insert(callAssistantSuggestions)
      .values({
        tenantId: event.tenantId,
        callEventId: event.id,
        userId: event.userId ?? null,
        divisionId,
        companyId: event.companyId!,
        contactId: event.contactId ?? null,
        title,
        body,
        deepLink: null,
        metadata: {
          eventType: event.eventType,
          direction: event.direction,
          normalizedPhone: event.normalizedPhone,
        },
      })
      .returning();
    const deepLink = `/call-assistant/suggestions/${createdSuggestion.id}`;
    const [suggestion] = await this.db
      .update(callAssistantSuggestions)
      .set({ deepLink })
      .where(eq(callAssistantSuggestions.id, createdSuggestion.id))
      .returning();

    await this.db.insert(notifications).values({
      tenantId: event.tenantId,
      userId: event.userId ?? null,
      divisionId,
      type: 'call_assistant_suggestion',
      title,
      body,
      entityType: 'call_assistant_suggestion',
      entityId: suggestion.id,
    });
    return suggestion;
  }

  private async suggestionsForCallEvent(callEventId: string) {
    return this.db.select().from(callAssistantSuggestions).where(and(eq(callAssistantSuggestions.callEventId, callEventId), isNull(callAssistantSuggestions.deletedAt)));
  }

  private async firstCompanyDivision(companyId: string, tenantId: string) {
    const [row] = await this.db
      .select({ divisionId: companyDivisions.divisionId })
      .from(companyDivisions)
      .where(and(eq(companyDivisions.companyId, companyId), eq(companyDivisions.tenantId, tenantId)))
      .limit(1);
    return row?.divisionId ?? null;
  }

  private async getVisiblePendingSuggestion(id: string, actor: AuthContext) {
    const filters = [
      eq(callAssistantSuggestions.id, id),
      eq(callAssistantSuggestions.tenantId, actor.tenantId),
      eq(callAssistantSuggestions.status, 'pending'),
      isNull(callAssistantSuggestions.deletedAt),
    ];
    const scope = resolveActorDivisionScope(actor);
    const scopedDivision = divisionFilter(scope, callAssistantSuggestions.divisionId);
    const sharedDivisionVisibility = and(isNull(callAssistantSuggestions.userId), scopedDivision ?? sql`1 = 0`);
    const visibility = actor.canViewAllDivisions && scope.mode === 'all'
      ? undefined
      : or(eq(callAssistantSuggestions.userId, actor.userId), sharedDivisionVisibility);
    if (visibility) filters.push(visibility);

    const suggestion = await this.db.query.callAssistantSuggestions.findFirst({ where: and(...filters) });
    if (!suggestion) throw new NotFoundError('Arama önerisi');
    return suggestion;
  }

  private async createComplaintIntakeFromSuggestion(
    suggestion: typeof callAssistantSuggestions.$inferSelect,
    input: CallSuggestionActionInput,
    actor: AuthContext
  ) {
    const divisionId = resolveAssignedResourceDivision(actor, 'service_tickets', suggestion.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Şikayet kaydı için bölüm ataması zorunludur', { field: 'divisionId' });
    const [{ c }] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(serviceComplaintIntakes)
      .where(eq(serviceComplaintIntakes.tenantId, actor.tenantId));
    const year = new Date().getUTCFullYear();
    const complaintNo = `CMP-${year}-${String(c + 1).padStart(4, '0')}`;
    const [complaint] = await this.db
      .insert(serviceComplaintIntakes)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        complaintNo,
        companyId: suggestion.companyId,
        customerDeviceId: null,
        subject: input.subject ?? 'Telefon görüşmesi sonrası servis talebi',
        description: input.description ?? input.notes ?? 'Arama asistanından oluşturuldu.',
        severity: 'normal',
        ticketType: 'request',
        source: 'phone',
        status: 'reviewing',
        contactName: null,
        contactPhone: null,
        contactEmail: null,
        createdBy: actor.userId,
        metadata: { callAssistantSuggestionId: suggestion.id, callEventId: suggestion.callEventId },
      })
      .returning();
    await this.notifyComplaintCreated({
      tenantId: actor.tenantId,
      divisionId,
      complaintId: complaint.id,
      complaintNo: complaint.complaintNo,
      subject: complaint.subject,
      source: complaint.source,
    });
    return complaint;
  }

  private async notifyComplaintCreated(params: {
    tenantId: string;
    divisionId: string | null;
    complaintId: string;
    complaintNo: string;
    subject: string;
    source: string;
  }) {
    const filters = [
      eq(users.tenantId, params.tenantId),
      eq(users.status, 'active'),
      isNull(users.deletedAt),
      inArray(roles.code, ['service', 'admin', 'super_admin']),
    ];
    if (params.divisionId) {
      filters.push(or(inArray(roles.code, ['admin', 'super_admin']), eq(userDivisions.divisionId, params.divisionId))!);
    }
    const targets = await this.db
      .selectDistinct({ userId: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(userDivisions, eq(userDivisions.userId, users.id))
      .where(and(...filters));
    if (!targets.length) return;
    await this.db.insert(notifications).values(
      targets.map((target) => ({
        tenantId: params.tenantId,
        userId: target.userId,
        divisionId: params.divisionId,
        type: 'service_complaint_new',
        title: 'Yeni şikayet kaydı',
        body: `${params.complaintNo} · ${params.source.toUpperCase()} · ${params.subject}`,
        entityType: 'service_complaint_intake',
        entityId: params.complaintId,
      }))
    );
  }

  private async completeSuggestion(id: string, action: CallAssistantAction, entityType: string | null, entityId: string | null) {
    const [row] = await this.db
      .update(callAssistantSuggestions)
      .set({
        status: action === 'dismiss' ? 'dismissed' : 'acted',
        actionTaken: action,
        actionEntityType: entityType,
        actionEntityId: entityId,
        actionedAt: new Date(),
      })
      .where(eq(callAssistantSuggestions.id, id))
      .returning();
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.entityType, 'call_assistant_suggestion'), eq(notifications.entityId, id)));
    return { action, suggestion: row };
  }

  private availableActions(actor: AuthContext) {
    return {
      createQuote: actor.permissions.has('quotes.create'),
      createServiceTicket: actor.permissions.has('service_tickets.create'),
      logCall: actor.permissions.has('activities.create'),
    };
  }

  private requirePermission(actor: AuthContext, code: string) {
    if (!actor.permissions.has(code)) throw new ForbiddenError(`Yetki gerekli: ${code}`);
  }

  private payloadHash(provider: string, payload: unknown) {
    return `hash:${createHash('sha256').update(`${provider}:${this.stableStringify(payload)}`).digest('hex').slice(0, 64)}`;
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => `${JSON.stringify(key)}:${this.stableStringify(val)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private safeEqual(actual: string, expected: string) {
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private tenantWebhookSecret(tenantId: string, configuredSecret?: string | null) {
    const masterSecret = configuredSecret || 'dev-call-secret';
    return createHmac('sha256', masterSecret).update(`haksan:call-webhook:${tenantId}`).digest('base64url');
  }
}
