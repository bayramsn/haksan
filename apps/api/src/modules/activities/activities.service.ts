import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { salesActivities, visits, calls, opportunities } from '../../db/schema/crm';
import { companies, contacts, notifications } from '../../db/schema/companies';
import { activityTypes, fileDocumentTypes } from '../../db/schema/lookup';
import { fileLinks, files } from '../../db/schema/files';
import { users } from '../../db/schema/users';
import { DB } from '../../shared/database/database.module';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { ActivityCreateInput, ActivityUpdateInput, VisitCreateInput, CallCreateInput, Pagination } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { divisionFilter, resolveActorDivisionScope, resolveAssignedDivision } from '../../shared/utils/division-scope';

@Injectable()
export class ActivitiesService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  private async assertCompany(companyId: string, actor: AuthContext) {
    const company = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)),
    });
    if (!company) throw new NotFoundError('Firma');
    return company;
  }

  private async assertContact(contactId: string, actor: AuthContext, companyId: string) {
    const contact = await this.db.query.contacts.findFirst({
      where: and(eq(contacts.id, contactId), eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)),
    });
    if (!contact) throw new NotFoundError('Kontak');
    if (contact.companyId !== companyId) throw new ValidationError('Kontak seçilen firmaya ait değil');
    return contact;
  }

  private async assertOpportunity(opportunityId: string, actor: AuthContext, companyId: string) {
    const opportunity = await this.db.query.opportunities.findFirst({
      where: and(eq(opportunities.id, opportunityId), eq(opportunities.tenantId, actor.tenantId), isNull(opportunities.deletedAt)),
    });
    if (!opportunity) throw new NotFoundError('Fırsat');
    if (opportunity.companyId !== companyId) throw new ValidationError('Fırsat seçilen firmaya ait değil');
    return opportunity;
  }

  private async assertReferences(input: { companyId: string; contactId?: string; opportunityId?: string }, actor: AuthContext) {
    await this.assertCompany(input.companyId, actor);
    if (input.contactId) await this.assertContact(input.contactId, actor, input.companyId);
    if (input.opportunityId) await this.assertOpportunity(input.opportunityId, actor, input.companyId);
  }

  private async assertActivity(activityId: string, actor: AuthContext) {
    const filters = [eq(salesActivities.id, activityId), eq(salesActivities.tenantId, actor.tenantId), isNull(salesActivities.deletedAt)];
    const scoped = divisionFilter(resolveActorDivisionScope(actor), salesActivities.divisionId);
    if (scoped) filters.push(scoped);
    const [row] = await this.db.select().from(salesActivities).where(and(...filters)).limit(1);
    if (!row) throw new NotFoundError('Aktivite');
    return row;
  }

  /** Aktiviteye atanacak bölüm: bağlı fırsattan miras, yoksa kullanıcının birincil bölümü. */
  private async resolveActivityDivision(input: { opportunityId?: string }, actor: AuthContext): Promise<string | null> {
    if (input.opportunityId) {
      const opp = await this.db.query.opportunities.findFirst({
        where: and(eq(opportunities.id, input.opportunityId), eq(opportunities.tenantId, actor.tenantId)),
        columns: { divisionId: true },
      });
      if (opp?.divisionId) return opp.divisionId;
    }
    return resolveAssignedDivision(actor, null);
  }

  async list(actor: AuthContext, query: { opportunityId?: string; companyId?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(salesActivities.tenantId, actor.tenantId), isNull(salesActivities.deletedAt)];
    if (query.opportunityId) filters.push(eq(salesActivities.opportunityId, query.opportunityId));
    if (query.companyId) filters.push(eq(salesActivities.companyId, query.companyId));
    const scoped = divisionFilter(resolveActorDivisionScope(actor), salesActivities.divisionId);
    if (scoped) filters.push(scoped);
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(salesActivities)
      .where(where);
    const rows = await this.db
      .select({
        activity: salesActivities,
        type: { id: activityTypes.id, code: activityTypes.code, name: activityTypes.name },
        createdByUser: { id: users.id, fullName: users.fullName, email: users.email },
      })
      .from(salesActivities)
      .leftJoin(activityTypes, eq(salesActivities.activityTypeId, activityTypes.id))
      .leftJoin(users, eq(salesActivities.createdBy, users.id))
      .where(where)
      .orderBy(desc(salesActivities.activityDate))
      .limit(limit)
      .offset(offset);
    const activityIds = rows.map((r) => r.activity.id);
    const filesByActivity = new Map<string, any[]>();
    if (activityIds.length) {
      const linkedFiles = await this.db
        .select({
          link: fileLinks,
          file: files,
          documentType: { id: fileDocumentTypes.id, code: fileDocumentTypes.code, name: fileDocumentTypes.name },
        })
        .from(fileLinks)
        .innerJoin(files, eq(fileLinks.fileId, files.id))
        .leftJoin(fileDocumentTypes, eq(fileLinks.documentTypeId, fileDocumentTypes.id))
        .where(
          and(
            eq(fileLinks.tenantId, actor.tenantId),
            eq(fileLinks.entityType, 'sales_activity'),
            inArray(fileLinks.entityId, activityIds),
            isNull(files.deletedAt)
          )
        );
      for (const row of linkedFiles) {
        const list = filesByActivity.get(row.link.entityId) ?? [];
        list.push({
          ...row.file,
          linkId: row.link.id,
          documentType: row.documentType,
          description: row.link.description,
        });
        filesByActivity.set(row.link.entityId, list);
      }
    }
    return buildPaginated(
      rows.map((r) => ({
        ...r.activity,
        type: r.type,
        createdByUser: r.createdByUser?.id ? r.createdByUser : null,
        files: filesByActivity.get(r.activity.id) ?? [],
      })),
      count,
      page
    );
  }

  async createActivity(input: ActivityCreateInput, actor: AuthContext) {
    await this.assertReferences(input, actor);
    const typeId = await lookupIdByCode(this.db, activityTypes, input.activityTypeCode);
    if (!typeId) throw new ValidationError(`Bilinmeyen aktivite türü: ${input.activityTypeCode}`);
    const divisionId = await this.resolveActivityDivision(input, actor);
    const [row] = await this.db
      .insert(salesActivities)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        opportunityId: input.opportunityId ?? null,
        companyId: input.companyId,
        contactId: input.contactId ?? null,
        activityTypeId: typeId,
        subject: input.subject,
        description: input.description ?? null,
        activityDate: input.activityDate,
        nextFollowUpAt: input.nextFollowUpAt ?? null,
        result: input.result ?? null,
        createdBy: actor.userId,
      })
      .returning();
    // Aktivite metninde (@ isim) etiketlenen kullanıcılara bildirim gönder.
    // Bildirim hatası aktivite oluşturmayı bozmamalı.
    await this.notifyActivityMentions(
      { id: row.id, divisionId, subject: input.subject, description: input.description ?? null },
      actor,
    ).catch(() => undefined);
    return row;
  }

  /**
   * Aktivite konu/açıklamasındaki "@isim" bahisleri tenant kullanıcılarıyla
   * eşleştirilip her bahsi geçen kullanıcıya (kendisi hariç) bildirim yazılır.
   * Tam ad, ilk ad veya e-posta kullanıcı-adı ile eşleşme aranır; @'ten sonra
   * gelen harf/rakamla devam eden token'lar (kısmi eşleşme) elenir.
   */
  private async notifyActivityMentions(
    activity: { id: string; divisionId: string | null; subject: string; description: string | null },
    actor: AuthContext,
  ) {
    const text = [activity.subject, activity.description].filter(Boolean).join(' ');
    if (!text.includes('@')) return;
    const tenantUsers = await this.db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(and(eq(users.tenantId, actor.tenantId), eq(users.status, 'active')));
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentioned = new Set<string>();
    for (const u of tenantUsers) {
      if (u.id === actor.userId) continue;
      const full = (u.fullName ?? '').trim();
      const first = full.split(/\s+/)[0] ?? '';
      const emailLocal = (u.email ?? '').split('@')[0] ?? '';
      const handles = [full, first, emailLocal].filter((h) => h.length >= 2);
      const hit = handles.some((h) => new RegExp('@' + escape(h) + '(?![\\p{L}\\p{N}])', 'iu').test(text));
      if (hit) mentioned.add(u.id);
    }
    if (!mentioned.size) return;
    await this.db.insert(notifications).values(
      [...mentioned].map((userId) => ({
        tenantId: actor.tenantId,
        userId,
        divisionId: activity.divisionId,
        type: 'mention',
        title: 'Bir aktivitede sizden bahsedildi',
        body: activity.subject?.slice(0, 240) ?? null,
        entityType: 'activity',
        entityId: activity.id,
      })),
    );
  }

  async updateActivity(activityId: string, input: ActivityUpdateInput, actor: AuthContext) {
    const existing = await this.assertActivity(activityId, actor);
    const companyId = input.companyId ?? existing.companyId;
    if (!companyId) throw new ValidationError('Aktivite için firma zorunlu');
    await this.assertReferences(
      {
        companyId,
        contactId: input.contactId ?? existing.contactId ?? undefined,
        opportunityId: input.opportunityId ?? existing.opportunityId ?? undefined,
      },
      actor
    );

    const patch: Record<string, unknown> = {};
    if (input.companyId !== undefined) patch.companyId = input.companyId;
    if (input.contactId !== undefined) patch.contactId = input.contactId || null;
    if (input.opportunityId !== undefined) patch.opportunityId = input.opportunityId || null;
    if (input.activityTypeCode !== undefined) {
      const typeId = await lookupIdByCode(this.db, activityTypes, input.activityTypeCode);
      if (!typeId) throw new ValidationError(`Bilinmeyen aktivite türü: ${input.activityTypeCode}`);
      patch.activityTypeId = typeId;
    }
    if (input.subject !== undefined) patch.subject = input.subject;
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.activityDate !== undefined) patch.activityDate = input.activityDate;
    if (input.nextFollowUpAt !== undefined) patch.nextFollowUpAt = input.nextFollowUpAt ?? null;
    if (input.result !== undefined) patch.result = input.result ?? null;
    patch.updatedAt = new Date();

    const [row] = await this.db.update(salesActivities).set(patch).where(eq(salesActivities.id, activityId)).returning();
    return row;
  }

  async deleteActivity(activityId: string, actor: AuthContext) {
    await this.assertActivity(activityId, actor);
    await this.db.update(salesActivities).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(salesActivities.id, activityId));
    return { ok: true };
  }

  async createVisit(input: VisitCreateInput, actor: AuthContext) {
    await this.assertReferences(input, actor);
    const divisionId = await this.resolveActivityDivision(input, actor);
    const [row] = await this.db
      .insert(visits)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        opportunityId: input.opportunityId ?? null,
        companyId: input.companyId,
        contactId: input.contactId ?? null,
        visitDate: input.visitDate,
        visitLocation: input.visitLocation ?? null,
        visitPurpose: input.visitPurpose ?? null,
        visitResult: input.visitResult ?? null,
        nextAction: input.nextAction ?? null,
        createdBy: actor.userId,
      })
      .returning();
    return row;
  }

  async createCall(input: CallCreateInput, actor: AuthContext) {
    await this.assertReferences(input, actor);
    const divisionId = await this.resolveActivityDivision(input, actor);
    const [row] = await this.db
      .insert(calls)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        opportunityId: input.opportunityId ?? null,
        companyId: input.companyId,
        contactId: input.contactId ?? null,
        callDate: input.callDate,
        callResult: input.callResult ?? null,
        nextAction: input.nextAction ?? null,
        createdBy: actor.userId,
      })
      .returning();
    return row;
  }
}
