import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron } from '@nestjs/schedule';
import { and, desc, eq, isNull, or, lt, sql, type AnyColumn } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { activityCreateSchema, normalizePhoneNumber, opportunityCreateSchema, taskCreateSchema, type CallAssistantMatchInput, type CallSuggestionActionInput, type ManualCallEventInput, type MobileCallEventInput, type CallAssistantDraftCommitInput } from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { withDatabaseTransaction } from '../../db/transaction-context';
import { DB } from '../../shared/database/database.module';
import { loadEnv } from '../../config/env';
import type { AuthContext } from '../../shared/security/auth.types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { resourceCompanyPortfolioFilter } from '../../shared/utils/division-scope';
import { companyVisibilityFilter } from '../../shared/utils/company-visibility';
import { companies, companyPhones, contacts, contactPhones, contactCompanies } from '../../db/schema/companies';
import { callEvents, callAssistantSuggestions, callAssistantDrafts, phoneNumberIndex } from '../../db/schema/call-assistant';
import { CompaniesService } from '../companies/companies.service';
import { ContactsService } from '../contacts/contacts.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { TasksService } from '../tasks/tasks.service';
import { ActivitiesService } from '../activities/activities.service';
import { ServiceController, ticketCreate } from '../service/service.controller';

type Match = { companyId: string; companyName: string; contactId: string | null; contactName: string | null };
type PhoneEntry = Match & { normalizedPhone: string };
const actionKinds: Record<string, string> = { new_opportunity: 'opportunity', add_note: 'note', create_task: 'task', new_service_ticket: 'service_ticket' };
const kindPermissions: Record<string, string> = { opportunity: 'opportunities.create', note: 'activities.create', task: 'tasks.create', service_ticket: 'service_tickets.create' };
const DAY_MS = 86400_000;
export function callAssistantExpired(createdAt: Date, ttlMs: number, now = Date.now()): boolean {
  const timestamp = new Date(createdAt).getTime();
  return !Number.isFinite(timestamp) || timestamp > now + 300_000 || now - timestamp >= ttlMs;
}
function canonical(input: unknown): unknown {
  if (input instanceof Date) return input.toISOString();
  if (Array.isArray(input)) return input.map(canonical);
  if (input && typeof input === 'object') return Object.fromEntries(Object.keys(input).sort().map((key) => [key, canonical((input as Record<string, unknown>)[key])]));
  return input;
}

@Injectable()
export class CallAssistantService {
  constructor(@Inject(DB) private readonly db: DbClient, private readonly companyService: CompaniesService,
    private readonly contactService: ContactsService, private readonly opportunities: OpportunitiesService,
    private readonly tasks: TasksService, private readonly activities: ActivitiesService, private readonly moduleRef: ModuleRef) {}

  capabilities() { return { enabled: loadEnv().CALL_ASSISTANT_ENABLED }; }
  assertEnabled() { if (!this.capabilities().enabled) throw new NotFoundError('Çağrı asistanı'); }
  private require(actor: AuthContext, permission: string) { if (!actor.permissions.has(permission)) throw new ForbiddenError('Bu işlem için yetkiniz yok'); }

  async phoneIndex(actor: AuthContext, phoneNumber?: string) {
    this.assertEnabled(); this.require(actor, 'companies.read');
    const visible = await companyVisibilityFilter(this.db, actor);
    const companyFilter = and(eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt), resourceCompanyPortfolioFilter(actor, 'companies', companies.id), visible);
    const normalizedFilter = phoneNumber ? normalizePhoneNumber(phoneNumber) : null;
    const phoneFilter = (column: AnyColumn) => {
      if (!normalizedFilter) return undefined;
      const digits = sql`regexp_replace(${column}, '[^0-9]', '', 'g')`;
      const normalized = sql`case when ${digits} like '00%' then substring(${digits} from 3) when length(${digits}) = 11 and ${digits} like '0%' then '90' || substring(${digits} from 2) when length(${digits}) = 10 and trim(${column}) not like '+%' then '90' || ${digits} else ${digits} end`;
      return sql`${normalized} = ${normalizedFilter.slice(1)}`;
    };
    const companyRows = await this.db.select({ phone: companyPhones.phone, companyId: companies.id, companyName: companies.legalTitle })
      .from(companyPhones).innerJoin(companies, eq(companyPhones.companyId, companies.id))
      .where(and(companyFilter, eq(companyPhones.tenantId, actor.tenantId), isNull(companyPhones.deletedAt), phoneFilter(companyPhones.phone))).limit(10001);
    const entries: PhoneEntry[] = [];
    const append = (row: Match, input: string | null) => { const normalizedPhone = input && normalizePhoneNumber(input); if (normalizedPhone) entries.push({ companyId: row.companyId, companyName: row.companyName, contactId: row.contactId, contactName: row.contactName, normalizedPhone }); };
    companyRows.forEach((row) => append({ ...row, contactId: null, contactName: null }, row.phone));
    if (actor.permissions.has('contacts.read')) {
      const contactScope = and(companyFilter, eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt), resourceCompanyPortfolioFilter(actor, 'contacts', companies.id));
      const rows = await this.db.select({ companyId: companies.id, companyName: companies.legalTitle, contactId: contacts.id, contactName: contacts.fullName, workPhone: contacts.workPhone, mobilePhone: contacts.mobilePhone, otherPhone: contacts.otherPhone })
        .from(contacts).leftJoin(contactCompanies, and(eq(contactCompanies.contactId, contacts.id), eq(contactCompanies.tenantId, actor.tenantId)))
        .innerJoin(companies, or(eq(contactCompanies.companyId, companies.id), and(isNull(contactCompanies.companyId), eq(contacts.companyId, companies.id)))).where(and(contactScope, normalizedFilter ? or(phoneFilter(contacts.workPhone), phoneFilter(contacts.mobilePhone), phoneFilter(contacts.otherPhone)) : undefined)).limit(10001);
      for (const row of rows) { append(row, row.workPhone); append(row, row.mobilePhone); append(row, row.otherPhone); }
      const extra = await this.db.select({ companyId: companies.id, companyName: companies.legalTitle, contactId: contacts.id, contactName: contacts.fullName, phone: contactPhones.phone })
        .from(contactPhones).innerJoin(contacts, eq(contactPhones.contactId, contacts.id))
        .leftJoin(contactCompanies, and(eq(contactCompanies.contactId, contacts.id), eq(contactCompanies.tenantId, actor.tenantId)))
        .innerJoin(companies, or(eq(contactCompanies.companyId, companies.id), and(isNull(contactCompanies.companyId), eq(contacts.companyId, companies.id))))
        .where(and(contactScope, eq(contactPhones.tenantId, actor.tenantId), isNull(contactPhones.deletedAt), phoneFilter(contactPhones.phone))).limit(10001);
      extra.forEach((row) => append(row, row.phone));
    }
    const unique = [...new Map(entries.map((entry) => [`${entry.normalizedPhone}:${entry.companyId}:${entry.contactId ?? ''}`, entry])).values()];
    return { items: unique.slice(0, 10000), truncated: unique.length > 10000 };
  }

  private async visibleMatch(actor: AuthContext, companyId: string, contactId?: string | null): Promise<Match> {
    this.require(actor, 'companies.read');
    const company = await this.companyService.get(companyId, actor);
    let contact: Awaited<ReturnType<ContactsService['get']>> | null = null;
    if (contactId) {
      this.require(actor, 'contacts.read'); contact = await this.contactService.get(contactId, actor);
      if (contact.companyId !== companyId && !contact.companyLinks.some((link) => link.id === companyId)) throw new NotFoundError('Firma kontağı');
    }
    return { companyId, companyName: company.legalTitle, contactId: contact?.id ?? null, contactName: contact?.fullName ?? null };
  }

  async match(actor: AuthContext, input: CallAssistantMatchInput) {
    this.assertEnabled();
    let matches: Match[];
    if (input.companyId) matches = [await this.visibleMatch(actor, input.companyId, input.contactId)];
    else if (input.contactId) {
      this.require(actor, 'contacts.read'); const contact = await this.contactService.get(input.contactId, actor);
      matches = await Promise.all(contact.companyLinks.map((company) => this.visibleMatch(actor, company.id, contact.id)));
    } else {
      const number = normalizePhoneNumber(input.phoneNumber ?? '');
      const index = await this.phoneIndex(actor, input.phoneNumber);
      matches = index.items.filter((entry) => entry.normalizedPhone === number);
      // A company's main number and its named contact are one firm, but two
      // different named contacts sharing a number must remain an explicit choice.
      matches = matches.filter((entry) => entry.contactId || !matches.some((other) => other.companyId === entry.companyId && other.contactId));
      matches = await Promise.all(matches.map((entry) => this.visibleMatch(actor, entry.companyId, entry.contactId)));
    }
    matches = [...new Map(matches.map((entry) => [`${entry.companyId}:${entry.contactId ?? ''}`, entry])).values()];
    return { matches, status: matches.length === 1 ? 'matched' as const : matches.length ? 'ambiguous' as const : 'unmatched' as const };
  }

  async ingest(actor: AuthContext, input: ManualCallEventInput | MobileCallEventInput, source: string) {
    this.assertEnabled();
    if (input.startedAt && input.endedAt && new Date(input.startedAt) > new Date(input.endedAt)) throw new ValidationError('Çağrı zaman aralığı geçersiz');
    const provider = `mobile:${actor.userId}`;
    const providerEventId = `${input.deviceId}:${input.eventId}`;
    const fingerprint = createHash('sha256').update(JSON.stringify({ source, phone: input.phoneNumber ? normalizePhoneNumber(input.phoneNumber) : null, direction: input.direction, eventType: input.eventType,
      startedAt: input.startedAt, endedAt: input.endedAt, durationSeconds: input.durationSeconds, companyId: 'companyId' in input ? input.companyId : undefined, contactId: 'contactId' in input ? input.contactId : undefined })).digest('hex');
    const match = await this.match(actor, { phoneNumber: input.phoneNumber, ...('companyId' in input ? { companyId: input.companyId, contactId: input.contactId } : {}) });
    // Unknown callers stay on-device. No unidentified phone event or raw payload
    // is retained server-side merely because the phone reported a call.
    if (!match.matches.length) return match;
    return this.db.transaction(async (tx) => {
      const selected = match.matches.length === 1 ? match.matches[0] : null;
      const [event] = await tx.insert(callEvents).values({ tenantId: actor.tenantId, userId: actor.userId, provider, providerEventId, source,
        direction: input.direction, eventType: input.eventType, normalizedPhone: input.phoneNumber ? normalizePhoneNumber(input.phoneNumber) : null,
        companyId: selected?.companyId, contactId: selected?.contactId, matchStatus: match.status,
        startedAt: input.startedAt ? new Date(input.startedAt) : null, endedAt: input.endedAt ? new Date(input.endedAt) : null,
        durationSeconds: input.durationSeconds, payload: { deviceId: input.deviceId, eventId: input.eventId, fingerprint } }).onConflictDoNothing().returning();
      if (!event) {
        const existing = await tx.query.callEvents.findFirst({ where: and(eq(callEvents.tenantId, actor.tenantId), eq(callEvents.userId, actor.userId), eq(callEvents.provider, provider), eq(callEvents.providerEventId, providerEventId)) });
        if (!existing || existing.payload?.fingerprint !== fingerprint) throw new ConflictError('Çağrı olay kimliği başka içerikle kullanılmış');
        const suggestion = existing ? await tx.query.callAssistantSuggestions.findFirst({ where: and(eq(callAssistantSuggestions.callEventId, existing.id), eq(callAssistantSuggestions.userId, actor.userId)) }) : null;
        return { ...match, suggestionId: suggestion?.id, duplicate: true };
      }
      if (!selected) return match;
      const [suggestion] = await tx.insert(callAssistantSuggestions).values({ tenantId: actor.tenantId, userId: actor.userId, callEventId: event.id, companyId: selected.companyId,
        contactId: selected.contactId, title: `${selected.companyName} — çağrı sonrası`, metadata: { source, direction: input.direction, eventType: input.eventType }, status: 'pending' }).returning();
      return { ...match, suggestionId: suggestion.id, duplicate: false };
    });
  }

  async suggestion(actor: AuthContext, id: string) {
    this.assertEnabled();
    const row = await this.db.query.callAssistantSuggestions.findFirst({ where: and(eq(callAssistantSuggestions.id, id), eq(callAssistantSuggestions.tenantId, actor.tenantId), eq(callAssistantSuggestions.userId, actor.userId), isNull(callAssistantSuggestions.deletedAt)) });
    if (!row) throw new NotFoundError('Çağrı önerisi');
    if (callAssistantExpired(row.createdAt, 7 * DAY_MS)) throw new NotFoundError('Çağrı önerisi');
    const match = await this.visibleMatch(actor, row.companyId, row.contactId);
    const open = actor.permissions.has('opportunities.read') ? await this.opportunities.list(actor, { companyId: row.companyId, view: 'active' }, { page: 1, pageSize: 50, sortDir: 'desc' }) : null;
    return { id: row.id, title: row.title, status: row.status, company: { id: match.companyId, name: match.companyName }, contact: match.contactId ? { id: match.contactId, name: match.contactName } : null,
      source: row.metadata?.source, direction: row.metadata?.direction, eventType: row.metadata?.eventType,
      openOpportunities: open?.data.map((item) => ({ id: item.id, title: item.title })) ?? [] };
  }

  async suggestions(actor: AuthContext) {
    this.assertEnabled();
    const rows = await this.db.select({ id: callAssistantSuggestions.id }).from(callAssistantSuggestions).where(and(eq(callAssistantSuggestions.tenantId, actor.tenantId), eq(callAssistantSuggestions.userId, actor.userId), eq(callAssistantSuggestions.status, 'pending'), isNull(callAssistantSuggestions.deletedAt))).orderBy(desc(callAssistantSuggestions.createdAt)).limit(50);
    const items = [];
    for (const row of rows) { try { items.push(await this.suggestion(actor, row.id)); } catch (error) { if (!(error instanceof NotFoundError) && !(error instanceof ForbiddenError)) throw error; } }
    return { items };
  }

  async action(actor: AuthContext, id: string, input: CallSuggestionActionInput) {
    const suggestion = await this.suggestion(actor, id);
    if (input.action === 'open_opportunities') { this.require(actor, 'opportunities.read'); return { status: 'opened', companyId: suggestion.company.id, opportunities: suggestion.openOpportunities }; }
    if (input.action === 'dismiss') { await this.db.update(callAssistantSuggestions).set({ status: 'dismissed', actionTaken: 'dismiss', actionedAt: new Date() }).where(and(eq(callAssistantSuggestions.id, id), eq(callAssistantSuggestions.tenantId, actor.tenantId), eq(callAssistantSuggestions.userId, actor.userId))); return { status: 'dismissed' }; }
    const kind = actionKinds[input.action]; this.require(actor, kindPermissions[kind]);
    if (suggestion.status !== 'pending') throw new ConflictError('Çağrı önerisi artık açık değil');
    const prefill = { title: input.title, text: input.text, dueAt: input.dueAt };
    const [draft] = await this.db.insert(callAssistantDrafts).values({ tenantId: actor.tenantId, userId: actor.userId, suggestionId: id, operationId: input.operationId, kind, prefill }).onConflictDoNothing().returning();
    const existing = draft ?? await this.db.query.callAssistantDrafts.findFirst({ where: and(eq(callAssistantDrafts.tenantId, actor.tenantId), eq(callAssistantDrafts.userId, actor.userId), eq(callAssistantDrafts.operationId, input.operationId)) });
    if (!existing || existing.suggestionId !== id || existing.kind !== kind || JSON.stringify(canonical(existing.prefill ?? {})) !== JSON.stringify(canonical(prefill))) throw new ConflictError('İşlem kimliği başka bir taslağa ait');
    return { draftId: existing.id, status: existing.status };
  }

  async draft(actor: AuthContext, id: string) {
    this.assertEnabled();
    const row = await this.db.query.callAssistantDrafts.findFirst({ where: and(eq(callAssistantDrafts.id, id), eq(callAssistantDrafts.tenantId, actor.tenantId), eq(callAssistantDrafts.userId, actor.userId), isNull(callAssistantDrafts.deletedAt)) });
    if (!row) throw new NotFoundError('Çağrı taslağı');
    if (row.status === 'pending' && callAssistantExpired(row.createdAt, 30 * 60_000)) throw new NotFoundError('Çağrı taslağı');
    this.require(actor, kindPermissions[row.kind]);
    const suggestion = await this.suggestion(actor, row.suggestionId);
    return { ...row, expiresAt: new Date(new Date(row.createdAt).getTime() + 30 * 60_000).toISOString(), companyId: suggestion.company.id, contactId: suggestion.contact?.id ?? null, company: suggestion.company, contact: suggestion.contact,
      title: row.prefill?.title ?? suggestion.title, text: row.prefill?.text ?? '', dueAt: row.prefill?.dueAt ?? null };
  }

  async commit(actor: AuthContext, id: string, input: CallAssistantDraftCommitInput) {
    this.assertEnabled();
    this.require(actor, kindPermissions[input.kind]);
    return withDatabaseTransaction(this.db, async () => {
      // Lock is scoped to this owner and tenant; concurrent retries serialize
      // before any existing CRM service can write a second resource.
      const [locked] = await this.db.select().from(callAssistantDrafts).where(and(eq(callAssistantDrafts.id, id), eq(callAssistantDrafts.tenantId, actor.tenantId), eq(callAssistantDrafts.userId, actor.userId), isNull(callAssistantDrafts.deletedAt))).for('update');
      if (!locked) throw new NotFoundError('Çağrı taslağı');
      const draft = await this.draft(actor, id); // recheck live CRM visibility and permissions
      if (locked.kind !== input.kind) throw new ConflictError('Taslak işlem türü uyuşmuyor');
      if (input.payload.companyId && input.payload.companyId !== draft.companyId) throw new ValidationError('Taslak firması değiştirilemez');
      const body = { ...input.payload, companyId: draft.companyId };
      const requestedContact = input.payload.contactId ?? input.payload.primaryContactId;
      if (typeof requestedContact === 'string') await this.visibleMatch(actor, draft.companyId, requestedContact);
      let payload: any;
      try {
        payload = input.kind === 'opportunity' ? opportunityCreateSchema.parse(body)
          : input.kind === 'task' ? taskCreateSchema.parse(body)
          : input.kind === 'note' ? activityCreateSchema.parse({ ...body, activityTypeCode: 'note' })
          : ticketCreate.parse(body);
      } catch { throw new ValidationError('Taslak alanları geçersiz; zorunlu alanları kontrol edin'); }
      const fingerprint = createHash('sha256').update(JSON.stringify(canonical({ kind: input.kind, payload }))).digest('hex');
      if (locked.status === 'committed') {
        if (locked.commitOperationId !== input.operationId || locked.commitFingerprint !== fingerprint) throw new ConflictError('Taslak başka içerikle kaydedilmiş');
        return { resourceId: locked.resourceId, resourceType: locked.resourceType, status: 'committed' as const };
      }
      if (locked.status !== 'pending') throw new ConflictError('Taslak artık düzenlenebilir değil');
      // Different drafts of the same suggestion must share one consumption
      // boundary. The draft lock above alone only serializes identical retries.
      const [suggestion] = await this.db.select().from(callAssistantSuggestions).where(and(eq(callAssistantSuggestions.id, locked.suggestionId), eq(callAssistantSuggestions.tenantId, actor.tenantId), eq(callAssistantSuggestions.userId, actor.userId), isNull(callAssistantSuggestions.deletedAt))).for('update');
      if (!suggestion) throw new NotFoundError('Çağrı önerisi');
      if (suggestion.status !== 'pending') throw new ConflictError('Çağrı önerisi artık açık değil');
      const created = input.kind === 'opportunity' ? await this.opportunities.create(payload, actor)
        : input.kind === 'task' ? await this.tasks.create(actor, payload)
        : input.kind === 'note' ? await this.activities.createActivity(payload, actor, 'manual')
        : await this.moduleRef.get(ServiceController, { strict: false }).createTicket(payload, actor);
      const resourceType = input.kind === 'note' ? 'activity' : input.kind;
      await this.db.update(callAssistantDrafts).set({ status: 'committed', resourceId: created.id, resourceType, commitOperationId: input.operationId, commitFingerprint: fingerprint, updatedAt: new Date() }).where(eq(callAssistantDrafts.id, id));
      await this.db.update(callAssistantSuggestions).set({ status: 'actioned', actionEntityId: created.id, actionEntityType: resourceType, actionTaken: input.kind, actionedAt: new Date() }).where(and(eq(callAssistantSuggestions.id, locked.suggestionId), eq(callAssistantSuggestions.tenantId, actor.tenantId), eq(callAssistantSuggestions.userId, actor.userId)));
      return { resourceId: created.id, resourceType, status: 'committed' as const };
    });
  }

  /** TTL checks above are authoritative even if this retention job is delayed. */
  @Cron('0 3 * * *')
  async cleanupRetention() {
    // Disabling ingestion must never suspend deletion of previously collected PII.
    const sevenDays = new Date(Date.now() - 7 * DAY_MS);
    const thirtyDays = new Date(Date.now() - 30 * DAY_MS);
    await this.db.delete(callAssistantDrafts).where(lt(callAssistantDrafts.createdAt, thirtyDays));
    await this.db.delete(callAssistantSuggestions).where(lt(callAssistantSuggestions.createdAt, sevenDays));
    await this.db.delete(callEvents).where(or(lt(callEvents.createdAt, thirtyDays), and(eq(callEvents.matchStatus, 'unmatched'), lt(callEvents.createdAt, sevenDays))));
    // The native index is generated from visible CRM rows, never persisted here;
    // remove obsolete legacy index copies rather than retaining extra raw PII.
    await this.db.delete(phoneNumberIndex).where(lt(phoneNumberIndex.updatedAt, sevenDays));
  }
}
