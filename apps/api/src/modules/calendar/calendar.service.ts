import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type {
  CalendarDeviceEventInput,
  CalendarEventCreateInput,
  CalendarEventUpdateInput,
  CalendarImportCommitInput,
  CalendarImportPreviewRequest,
  CalendarSyncInput,
  CalendarSyncSettingsInput,
} from '@haksan/shared';
import { decodeIcsFile, parseIcs } from './ics-parser';
import type { DbClient } from '../../db/client';
import {
  calendarDeviceLinks,
  calendarEvents,
  calendarSyncSettings,
  companies,
  contacts,
  opportunities,
  users,
  visits,
} from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import type { AuthContext } from '../../shared/security/auth.types';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';

const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const IMPORT_WINDOW_MONTHS = 6;

type EventRow = typeof calendarEvents.$inferSelect;

@Injectable()
export class CalendarService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  private isSuperAdmin(actor: AuthContext) {
    return actor.roles.includes('super_admin');
  }

  private async findOwnedEvent(actor: AuthContext, id: string, includeDeleted = true): Promise<EventRow> {
    const filters = [eq(calendarEvents.id, id), eq(calendarEvents.tenantId, actor.tenantId), eq(calendarEvents.ownerUserId, actor.userId)];
    if (!includeDeleted) filters.push(isNull(calendarEvents.deletedAt));
    const event = await this.db.query.calendarEvents.findFirst({ where: and(...filters) });
    if (!event) throw new NotFoundError('Takvim etkinliği');
    return event;
  }

  private async assertReferences(
    actor: AuthContext,
    input: { companyId?: string | null; contactId?: string | null; opportunityId?: string | null }
  ) {
    if (input.companyId) {
      const company = await this.db.query.companies.findFirst({
        where: and(eq(companies.id, input.companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)),
      });
      if (!company) throw new NotFoundError('Firma');
    }
    if (input.contactId) {
      const contact = await this.db.query.contacts.findFirst({
        where: and(eq(contacts.id, input.contactId), eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)),
      });
      if (!contact) throw new NotFoundError('Kontak');
      if (input.companyId && contact.companyId !== input.companyId) throw new ValidationError('Kontak seçilen firmaya ait değil');
    }
    if (input.opportunityId) {
      const opportunity = await this.db.query.opportunities.findFirst({
        where: and(eq(opportunities.id, input.opportunityId), eq(opportunities.tenantId, actor.tenantId), isNull(opportunities.deletedAt)),
      });
      if (!opportunity) throw new NotFoundError('Fırsat');
      if (input.companyId && opportunity.companyId !== input.companyId) throw new ValidationError('Fırsat seçilen firmaya ait değil');
    }
  }

  async list(
    actor: AuthContext,
    query: { from: Date; to: Date; ownerUserId?: string; includeArchived: boolean }
  ) {
    if (query.to < query.from) throw new ValidationError('Bitiş tarihi başlangıçtan önce olamaz');
    const maxRangeMs = 370 * 24 * 60 * 60 * 1000;
    if (query.to.getTime() - query.from.getTime() > maxRangeMs) throw new ValidationError('Takvim aralığı 370 günü aşamaz');
    if (query.ownerUserId && query.ownerUserId !== actor.userId && !this.isSuperAdmin(actor)) {
      throw new ForbiddenError('Başka bir kullanıcının takvimini görüntüleyemezsiniz');
    }

    const filters = [
      eq(calendarEvents.tenantId, actor.tenantId),
      lte(calendarEvents.startsAt, query.to),
      gte(calendarEvents.endsAt, query.from),
    ];
    if (!this.isSuperAdmin(actor)) filters.push(eq(calendarEvents.ownerUserId, actor.userId));
    else if (query.ownerUserId) filters.push(eq(calendarEvents.ownerUserId, query.ownerUserId));
    if (!query.includeArchived) filters.push(isNull(calendarEvents.deletedAt));

    return this.db
      .select({
        event: calendarEvents,
        owner: { id: users.id, fullName: users.fullName, email: users.email },
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
      })
      .from(calendarEvents)
      .innerJoin(users, eq(calendarEvents.ownerUserId, users.id))
      .leftJoin(companies, eq(calendarEvents.companyId, companies.id))
      .where(and(...filters))
      .orderBy(asc(calendarEvents.startsAt))
      .limit(5000)
      .then((rows) => rows.map((row) => ({ ...row.event, owner: row.owner, company: row.company?.id ? row.company : null })));
  }

  async owners(actor: AuthContext) {
    if (!this.isSuperAdmin(actor)) throw new ForbiddenError('Yalnız süper yönetici kullanıcı takvimlerini listeleyebilir');
    return this.db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(and(eq(users.tenantId, actor.tenantId), eq(users.status, 'active'), isNull(users.deletedAt)))
      .orderBy(asc(users.fullName));
  }

  async create(actor: AuthContext, input: CalendarEventCreateInput) {
    await this.assertReferences(actor, input);
    const now = new Date();
    return this.db.transaction(async (tx) => {
      let visitId: string | null = null;
      if (input.eventType === 'customer_visit') {
        const [visit] = await tx
          .insert(visits)
          .values({
            tenantId: actor.tenantId,
            companyId: input.companyId!,
            contactId: input.contactId ?? null,
            opportunityId: input.opportunityId ?? null,
            visitDate: input.startsAt,
            visitLocation: input.location ?? null,
            visitPurpose: input.title,
            createdBy: actor.userId,
          })
          .returning();
        visitId = visit.id;
      }
      const [event] = await tx
        .insert(calendarEvents)
        .values({
          tenantId: actor.tenantId,
          ownerUserId: actor.userId,
          eventType: input.eventType,
          source: 'manual',
          title: input.title,
          description: input.description ?? null,
          location: input.location ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          allDay: input.allDay,
          timezone: input.timezone,
          recurrenceRule: input.recurrenceRule ?? null,
          companyId: input.companyId ?? null,
          contactId: input.contactId ?? null,
          opportunityId: input.opportunityId ?? null,
          visitId,
          sourceModifiedAt: now,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })
        .returning();
      return event;
    });
  }

  async update(actor: AuthContext, id: string, input: CalendarEventUpdateInput) {
    const current = await this.findOwnedEvent(actor, id, false);
    const merged = { ...current, ...input };
    if (merged.endsAt < merged.startsAt) throw new ValidationError('Bitiş başlangıçtan önce olamaz');
    if (merged.eventType === 'customer_visit' && !merged.companyId) throw new ValidationError('Müşteri ziyareti için firma zorunlu');
    await this.assertReferences(actor, merged);
    const now = new Date();

    return this.db.transaction(async (tx) => {
      let visitId = current.visitId;
      if (merged.eventType === 'customer_visit') {
        if (visitId) {
          await tx
            .update(visits)
            .set({
              companyId: merged.companyId!,
              contactId: merged.contactId ?? null,
              opportunityId: merged.opportunityId ?? null,
              visitDate: merged.startsAt,
              visitLocation: merged.location ?? null,
              visitPurpose: merged.title,
              updatedAt: now,
              deletedAt: null,
            })
            .where(and(eq(visits.id, visitId), eq(visits.tenantId, actor.tenantId)));
        } else {
          const [visit] = await tx
            .insert(visits)
            .values({
              tenantId: actor.tenantId,
              companyId: merged.companyId!,
              contactId: merged.contactId ?? null,
              opportunityId: merged.opportunityId ?? null,
              visitDate: merged.startsAt,
              visitLocation: merged.location ?? null,
              visitPurpose: merged.title,
              createdBy: actor.userId,
            })
            .returning();
          visitId = visit.id;
        }
      } else if (visitId) {
        await tx.update(visits).set({ deletedAt: now, updatedAt: now }).where(eq(visits.id, visitId));
        visitId = null;
      }

      const [event] = await tx
        .update(calendarEvents)
        .set({
          eventType: input.eventType,
          title: input.title,
          description: input.description,
          location: input.location,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          allDay: input.allDay,
          timezone: input.timezone,
          recurrenceRule: input.recurrenceRule,
          companyId: input.companyId,
          contactId: input.contactId,
          opportunityId: input.opportunityId,
          visitId,
          sourceModifiedAt: now,
          updatedAt: now,
          updatedBy: actor.userId,
        })
        .where(eq(calendarEvents.id, current.id))
        .returning();
      return event;
    });
  }

  async remove(actor: AuthContext, id: string) {
    const current = await this.findOwnedEvent(actor, id, false);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.update(calendarEvents).set({ deletedAt: now, updatedAt: now, sourceModifiedAt: now, updatedBy: actor.userId }).where(eq(calendarEvents.id, id));
      if (current.visitId) await tx.update(visits).set({ deletedAt: now, updatedAt: now }).where(eq(visits.id, current.visitId));
    });
    return { deleted: true, restoreUntil: new Date(now.getTime() + RESTORE_WINDOW_MS) };
  }

  async restore(actor: AuthContext, id: string) {
    const current = await this.findOwnedEvent(actor, id, true);
    if (!current.deletedAt) return current;
    if (Date.now() - current.deletedAt.getTime() > RESTORE_WINDOW_MS) throw new ValidationError('Geri alma süresi dolmuş');
    const now = new Date();
    return this.db.transaction(async (tx) => {
      if (current.visitId) await tx.update(visits).set({ deletedAt: null, updatedAt: now }).where(eq(visits.id, current.visitId));
      const [event] = await tx
        .update(calendarEvents)
        .set({ deletedAt: null, updatedAt: now, sourceModifiedAt: now, updatedBy: actor.userId })
        .where(eq(calendarEvents.id, id))
        .returning();
      return event;
    });
  }

  getSettings(actor: AuthContext) {
    return this.db.query.calendarSyncSettings.findFirst({
      where: and(eq(calendarSyncSettings.tenantId, actor.tenantId), eq(calendarSyncSettings.ownerUserId, actor.userId)),
    });
  }

  async saveSettings(actor: AuthContext, input: CalendarSyncSettingsInput) {
    if (input.destinationCalendarId) {
      const destination = input.selectedCalendars.find((calendar) => calendar.id === input.destinationCalendarId);
      if (!destination?.writable) throw new ValidationError('Hedef takvim seçili ve yazılabilir olmalı');
    }
    const [settings] = await this.db
      .insert(calendarSyncSettings)
      .values({
        tenantId: actor.tenantId,
        ownerUserId: actor.userId,
        primaryDeviceId: input.deviceId,
        platform: input.platform,
        autoSync: input.autoSync,
        selectedCalendars: input.selectedCalendars,
        destinationCalendarId: input.destinationCalendarId ?? null,
      })
      .onConflictDoUpdate({
        target: [calendarSyncSettings.tenantId, calendarSyncSettings.ownerUserId],
        set: {
          primaryDeviceId: input.deviceId,
          platform: input.platform,
          autoSync: input.autoSync,
          selectedCalendars: input.selectedCalendars,
          destinationCalendarId: input.destinationCalendarId ?? null,
          updatedAt: new Date(),
          lastSyncError: null,
        },
      })
      .returning();
    return settings;
  }

  async importPreview(actor: AuthContext, input: CalendarImportPreviewRequest) {
    const text = decodeIcsFile(input.fileName, input.fileBase64);
    const parsed = parseIcs(text);
    if (!parsed.length) throw new ValidationError('Dosyada içe aktarılabilecek etkinlik bulunamadı');

    const now = new Date();
    const from = new Date(now);
    from.setMonth(from.getMonth() - IMPORT_WINDOW_MONTHS);
    const to = new Date(now);
    to.setMonth(to.getMonth() + IMPORT_WINDOW_MONTHS);

    const uids = Array.from(new Set(parsed.map((event) => event.uid)));
    const existing = await this.db.query.calendarEvents.findMany({
      columns: { importUid: true },
      where: and(
        eq(calendarEvents.tenantId, actor.tenantId),
        eq(calendarEvents.ownerUserId, actor.userId),
        inArray(calendarEvents.importUid, uids)
      ),
    });
    const existingUids = new Set(existing.map((row) => row.importUid));

    const events = parsed.map((event) => ({
      ...event,
      duplicate: existingUids.has(event.uid),
      inWindow: event.startsAt <= to && event.endsAt >= from,
    }));

    return {
      window: { from, to },
      summary: {
        total: events.length,
        duplicates: events.filter((event) => event.duplicate).length,
        inWindow: events.filter((event) => event.inWindow).length,
      },
      events,
    };
  }

  async importCommit(actor: AuthContext, input: CalendarImportCommitInput) {
    let created = 0;
    let updated = 0;
    const now = new Date();

    await this.db.transaction(async (tx) => {
      for (const item of input.events) {
        const endsAt = item.endsAt < item.startsAt ? item.startsAt : item.endsAt;
        const existing = await tx.query.calendarEvents.findFirst({
          columns: { id: true },
          where: and(
            eq(calendarEvents.tenantId, actor.tenantId),
            eq(calendarEvents.ownerUserId, actor.userId),
            eq(calendarEvents.importUid, item.uid)
          ),
        });

        if (existing) {
          await tx
            .update(calendarEvents)
            .set({
              title: item.title,
              description: item.description ?? null,
              location: item.location ?? null,
              startsAt: item.startsAt,
              endsAt,
              allDay: item.allDay,
              timezone: item.timezone,
              recurrenceRule: item.recurrenceRule ?? null,
              source: 'import',
              deletedAt: null,
              sourceModifiedAt: now,
              updatedAt: now,
              updatedBy: actor.userId,
            })
            .where(eq(calendarEvents.id, existing.id));
          updated += 1;
        } else {
          await tx
            .insert(calendarEvents)
            .values({
              tenantId: actor.tenantId,
              ownerUserId: actor.userId,
              eventType: input.defaultEventType,
              source: 'import',
              importUid: item.uid,
              title: item.title,
              description: item.description ?? null,
              location: item.location ?? null,
              startsAt: item.startsAt,
              endsAt,
              allDay: item.allDay,
              timezone: item.timezone,
              recurrenceRule: item.recurrenceRule ?? null,
              sourceModifiedAt: now,
              lastSyncedAt: now,
              createdBy: actor.userId,
              updatedBy: actor.userId,
            });
          created += 1;
        }
      }
    });

    return { created, updated };
  }

  async sync(actor: AuthContext, input: CalendarSyncInput) {
    const settings = await this.getSettings(actor);
    if (!settings || settings.primaryDeviceId !== input.deviceId) throw new ForbiddenError('Bu telefon ana senkron cihazı değil');
    const selectedIds = new Set(settings.selectedCalendars.map((calendar) => calendar.id));
    const acceptedEvents = input.events.filter((event) => selectedIds.has(event.externalCalendarId));
    const from = new Date(input.observedAt);
    from.setMonth(from.getMonth() - settings.windowPastMonths);
    const to = new Date(input.observedAt);
    to.setMonth(to.getMonth() + settings.windowFutureMonths);
    for (const deviceEvent of acceptedEvents) await this.applyDeviceEvent(actor, input, deviceEvent);
    await this.applyMissingDeviceDeletions(actor, input, acceptedEvents, selectedIds, from, to);
    const serverRows = await this.db.query.calendarEvents.findMany({
      where: and(
        eq(calendarEvents.tenantId, actor.tenantId),
        eq(calendarEvents.ownerUserId, actor.userId),
        lte(calendarEvents.startsAt, to),
        gte(calendarEvents.endsAt, from),
        or(isNull(calendarEvents.deletedAt), gte(calendarEvents.deletedAt, new Date(Date.now() - RESTORE_WINDOW_MS)))
      ),
      orderBy: [asc(calendarEvents.startsAt)],
    });
    const links = await this.db.query.calendarDeviceLinks.findMany({
      where: and(
        eq(calendarDeviceLinks.tenantId, actor.tenantId),
        eq(calendarDeviceLinks.ownerUserId, actor.userId),
        eq(calendarDeviceLinks.deviceId, input.deviceId)
      ),
    });
    const linkByEvent = new Map(links.map((link) => [link.calendarEventId, link]));
    const upserts = serverRows
      .filter((event) => !event.deletedAt)
      .filter((event) => {
        const link = linkByEvent.get(event.id);
        return !link || event.sourceModifiedAt >= link.providerModifiedAt;
      })
      .map((event) => this.toDeviceCommand(event, linkByEvent.get(event.id), settings.destinationCalendarId));
    const deletions = serverRows
      .filter((event) => !!event.deletedAt)
      .map((event) => linkByEvent.get(event.id))
      .filter((link): link is NonNullable<typeof link> => !!link)
      .map((link) => ({
        crmEventId: link.calendarEventId,
        externalCalendarId: link.externalCalendarId,
        externalEventId: link.externalEventId,
        occurrenceId: link.occurrenceId,
      }));

    const now = new Date();
    await this.db
      .update(calendarSyncSettings)
      .set({ lastSyncAt: now, lastSyncError: null, updatedAt: now })
      .where(eq(calendarSyncSettings.id, settings.id));
    return { upserts, deletions, syncedAt: now, window: { from, to } };
  }

  private async applyDeviceEvent(actor: AuthContext, sync: CalendarSyncInput, input: CalendarDeviceEventInput) {
    const link = await this.db.query.calendarDeviceLinks.findFirst({
      where: and(
        eq(calendarDeviceLinks.tenantId, actor.tenantId),
        eq(calendarDeviceLinks.ownerUserId, actor.userId),
        eq(calendarDeviceLinks.deviceId, sync.deviceId),
        eq(calendarDeviceLinks.externalCalendarId, input.externalCalendarId),
        eq(calendarDeviceLinks.externalEventId, input.externalEventId),
        eq(calendarDeviceLinks.occurrenceId, input.occurrenceId)
      ),
    });

    let event = link ? await this.db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, link.calendarEventId) }) : undefined;
    if (!event && input.crmEventId) {
      event = await this.db.query.calendarEvents.findFirst({
        where: and(
          eq(calendarEvents.id, input.crmEventId),
          eq(calendarEvents.tenantId, actor.tenantId),
          eq(calendarEvents.ownerUserId, actor.userId)
        ),
      });
    }
    if (!event && input.deleted) return;

    if (!event) {
      const [created] = await this.db
        .insert(calendarEvents)
        .values({
          tenantId: actor.tenantId,
          ownerUserId: actor.userId,
          eventType: 'other',
          source: 'device',
          title: input.title,
          description: input.description ?? null,
          location: input.location ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          allDay: input.allDay,
          timezone: input.timezone,
          recurrenceRule: input.recurrenceRule ?? null,
          sourceModifiedAt: input.modifiedAt,
          lastSyncedAt: sync.observedAt,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })
        .returning();
      event = created;
    } else if (input.modifiedAt > event.sourceModifiedAt) {
      const now = new Date();
      const [updated] = await this.db
        .update(calendarEvents)
        .set(
          input.deleted
            ? { deletedAt: input.modifiedAt, updatedAt: now, sourceModifiedAt: input.modifiedAt, lastSyncedAt: sync.observedAt }
            : {
                title: input.title,
                description: input.description ?? null,
                location: input.location ?? null,
                startsAt: input.startsAt,
                endsAt: input.endsAt,
                allDay: input.allDay,
                timezone: input.timezone,
                recurrenceRule: input.recurrenceRule ?? null,
                deletedAt: null,
                updatedAt: now,
                sourceModifiedAt: input.modifiedAt,
                lastSyncedAt: sync.observedAt,
              }
        )
        .where(eq(calendarEvents.id, event.id))
        .returning();
      event = updated;
      if (input.deleted && event.visitId) {
        await this.db.update(visits).set({ deletedAt: input.modifiedAt, updatedAt: now }).where(eq(visits.id, event.visitId));
      } else if (!input.deleted && event.visitId) {
        await this.db
          .update(visits)
          .set({
            visitDate: input.startsAt,
            visitLocation: input.location ?? null,
            visitPurpose: input.title,
            deletedAt: null,
            updatedAt: now,
          })
          .where(eq(visits.id, event.visitId));
      }
    }

    if (!link) {
      await this.db
        .insert(calendarDeviceLinks)
        .values({
          tenantId: actor.tenantId,
          ownerUserId: actor.userId,
          calendarEventId: event.id,
          deviceId: sync.deviceId,
          platform: sync.platform,
          externalCalendarId: input.externalCalendarId,
          externalEventId: input.externalEventId,
          occurrenceId: input.occurrenceId,
          providerModifiedAt: input.modifiedAt,
          lastSyncedAt: sync.observedAt,
          deletedAt: input.deleted ? input.modifiedAt : null,
        })
        .onConflictDoNothing();
    } else {
      await this.db
        .update(calendarDeviceLinks)
        .set({
          providerModifiedAt: input.modifiedAt,
          lastSyncedAt: sync.observedAt,
          deletedAt: input.deleted ? input.modifiedAt : null,
          updatedAt: new Date(),
        })
        .where(eq(calendarDeviceLinks.id, link.id));
    }
  }

  private async applyMissingDeviceDeletions(
    actor: AuthContext,
    sync: CalendarSyncInput,
    received: CalendarDeviceEventInput[],
    selectedCalendarIds: Set<string>,
    from: Date,
    to: Date
  ) {
    const receivedKeys = new Set(received.map((event) => `${event.externalCalendarId}\u0000${event.externalEventId}\u0000${event.occurrenceId}`));
    const links = await this.db.query.calendarDeviceLinks.findMany({
      where: and(
        eq(calendarDeviceLinks.tenantId, actor.tenantId),
        eq(calendarDeviceLinks.ownerUserId, actor.userId),
        eq(calendarDeviceLinks.deviceId, sync.deviceId),
        isNull(calendarDeviceLinks.deletedAt)
      ),
    });
    for (const link of links) {
      if (!selectedCalendarIds.has(link.externalCalendarId)) continue;
      const key = `${link.externalCalendarId}\u0000${link.externalEventId}\u0000${link.occurrenceId}`;
      if (receivedKeys.has(key)) continue;
      const event = await this.db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, link.calendarEventId) });
      if (!event || event.deletedAt || event.startsAt > to || event.endsAt < from) continue;
      await this.db.transaction(async (tx) => {
        await tx
          .update(calendarEvents)
          .set({ deletedAt: sync.observedAt, sourceModifiedAt: sync.observedAt, lastSyncedAt: sync.observedAt, updatedAt: new Date() })
          .where(eq(calendarEvents.id, event.id));
        await tx
          .update(calendarDeviceLinks)
          .set({ deletedAt: sync.observedAt, providerModifiedAt: sync.observedAt, lastSyncedAt: sync.observedAt, updatedAt: new Date() })
          .where(eq(calendarDeviceLinks.id, link.id));
        if (event.visitId) await tx.update(visits).set({ deletedAt: sync.observedAt, updatedAt: new Date() }).where(eq(visits.id, event.visitId));
      });
    }
  }

  private toDeviceCommand(event: EventRow, link: typeof calendarDeviceLinks.$inferSelect | undefined, destinationId: string | null) {
    return {
      crmEventId: event.id,
      externalCalendarId: link?.externalCalendarId ?? destinationId,
      externalEventId: link?.externalEventId ?? null,
      occurrenceId: link?.occurrenceId ?? '',
      title: event.title,
      description: event.description,
      location: event.location,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      timezone: event.timezone,
      recurrenceRule: event.recurrenceRule,
      modifiedAt: event.sourceModifiedAt,
    };
  }
}
