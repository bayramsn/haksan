import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { salesActivities, visits, calls, opportunities, type ActivityOrigin } from '../../db/schema/crm';
import { companies, contactCompanies, contacts, notifications } from '../../db/schema/companies';
import { activityTypes, fileDocumentTypes } from '../../db/schema/lookup';
import { fileLinks, files } from '../../db/schema/files';
import { userAccessScopes, userDivisions, users } from '../../db/schema/users';
import { DB } from '../../shared/database/database.module';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { ActivityCreateInput, ActivityUpdateInput, VisitCreateInput, CallCreateInput, Pagination } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import {
  assertCanUseResourceDivision,
  resourceCompanyPortfolioFilter,
  resourceDivisionFilter,
  resolveAssignedResourceDivision,
} from '../../shared/utils/division-scope';
import {
  allowUnlinkedCompanyRecords,
  companyVisibilityExistsFilter,
  companyVisibilityFilter,
} from '../../shared/utils/company-visibility';

@Injectable()
export class ActivitiesService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  private async resolveActivityTypeId(code: string) {
    const exact = await lookupIdByCode(this.db, activityTypes, code);
    if (exact) return exact;

    // Uygulama ile lookup migration'ı farklı anlarda yayınlansa bile aktivite
    // kaydı kesilmesin. Migration tamamlanınca doğrudan yeni kodlar kullanılır.
    const legacyCodeByType: Record<string, string> = {
      incoming_call: 'call',
      outgoing_call: 'call',
      customer_visit: 'visit',
      online_meeting: 'meeting',
      showroom_meeting: 'meeting',
    };
    const legacyCode = legacyCodeByType[code];
    return legacyCode ? lookupIdByCode(this.db, activityTypes, legacyCode) : undefined;
  }

  private async assertCompany(companyId: string, actor: AuthContext) {
    const company = await this.db.query.companies.findFirst({
      where: and(
        eq(companies.id, companyId),
        eq(companies.tenantId, actor.tenantId),
        isNull(companies.deletedAt),
        resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
        (await companyVisibilityFilter(this.db, actor)) ?? sql`true`
      ),
    });
    if (!company) throw new NotFoundError('Firma');
    return company;
  }

  private async assertContact(contactId: string, actor: AuthContext, companyId: string) {
    const contact = await this.db.query.contacts.findFirst({
      where: and(eq(contacts.id, contactId), eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)),
    });
    if (!contact) throw new NotFoundError('Kontak');
    const [link] = await this.db
      .select({ contactId: contactCompanies.contactId })
      .from(contactCompanies)
      .where(and(eq(contactCompanies.contactId, contactId), eq(contactCompanies.companyId, companyId)))
      .limit(1);
    if (contact.companyId !== companyId && !link) throw new ValidationError('Kontak seçilen firmaya ait değil');
    return contact;
  }

  private async assertOpportunity(opportunityId: string, actor: AuthContext, companyId?: string | null) {
    const visibility = await companyVisibilityExistsFilter(this.db, actor, opportunities.companyId);
    const opportunity = await this.db.query.opportunities.findFirst({
      where: and(
        eq(opportunities.id, opportunityId),
        eq(opportunities.tenantId, actor.tenantId),
        isNull(opportunities.deletedAt),
        resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`,
        allowUnlinkedCompanyRecords(opportunities.companyId, visibility)
      ),
    });
    if (!opportunity) throw new NotFoundError('Fırsat');
    if (companyId && opportunity.companyId !== companyId) {
      throw new ValidationError('Fırsat seçilen firmaya ait değil');
    }
    return opportunity;
  }

  private async assertReferences(
    input: { companyId?: string; contactId?: string; opportunityId?: string },
    actor: AuthContext
  ): Promise<string | null> {
    let companyId = input.companyId ?? null;
    if (companyId) await this.assertCompany(companyId, actor);
    if (input.opportunityId) {
      const opportunity = await this.assertOpportunity(input.opportunityId, actor, companyId);
      companyId = companyId ?? opportunity.companyId;
    }
    if (!companyId && !input.opportunityId) {
      throw new ValidationError('Aktivite için firma veya satış kartı zorunludur');
    }
    if (input.contactId) {
      if (!companyId) throw new ValidationError('Kontak bağlamak için önce firma kaydı oluşturulmalıdır');
      await this.assertContact(input.contactId, actor, companyId);
    }
    return companyId;
  }

  private async assertActivity(activityId: string, actor: AuthContext) {
    const filters = [eq(salesActivities.id, activityId), eq(salesActivities.tenantId, actor.tenantId), isNull(salesActivities.deletedAt)];
    const scoped = resourceDivisionFilter(actor, 'activities', salesActivities.divisionId);
    if (scoped) filters.push(scoped);
    const visibility = await companyVisibilityExistsFilter(this.db, actor, salesActivities.companyId);
    filters.push(allowUnlinkedCompanyRecords(salesActivities.companyId, visibility));
    const [row] = await this.db.select().from(salesActivities).where(and(...filters)).limit(1);
    if (!row) throw new NotFoundError('Aktivite');
    return row;
  }

  /** Aktiviteye atanacak bölüm: bağlı fırsattan miras, yoksa kullanıcının birincil bölümü. */
  private async resolveActivityDivision(input: { opportunityId?: string }, actor: AuthContext): Promise<string | null> {
    if (input.opportunityId) {
      const opp = await this.db.query.opportunities.findFirst({
        where: and(
          eq(opportunities.id, input.opportunityId),
          eq(opportunities.tenantId, actor.tenantId),
          resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`
        ),
        columns: { divisionId: true },
      });
      if (opp?.divisionId) {
        assertCanUseResourceDivision(actor, 'activities', opp.divisionId);
        return opp.divisionId;
      }
    }
    return resolveAssignedResourceDivision(actor, 'activities', null);
  }

  async list(
    actor: AuthContext,
    query: { opportunityId?: string; companyId?: string; contactId?: string },
    page: Pagination,
  ) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(salesActivities.tenantId, actor.tenantId), isNull(salesActivities.deletedAt)];
    const canViewStandaloneActivities = actor.roles.some((role) =>
      ['sales', 'service', 'admin', 'super_admin'].includes(role),
    );
    // Fırsata bağlı olmayan firma temasları yalnız satış, servis ve yönetim
    // rollerine görünür. Diğer roller kendi yetkileri dahilinde yalnız fırsat
    // geçmişini görmeye devam eder.
    if (!canViewStandaloneActivities) filters.push(isNotNull(salesActivities.opportunityId));
    if (query.opportunityId) filters.push(eq(salesActivities.opportunityId, query.opportunityId));
    if (query.companyId) filters.push(eq(salesActivities.companyId, query.companyId));
    if (query.contactId) filters.push(eq(salesActivities.contactId, query.contactId));
    const scoped = resourceDivisionFilter(actor, 'activities', salesActivities.divisionId);
    if (scoped) filters.push(scoped);
    const visibility = await companyVisibilityExistsFilter(this.db, actor, salesActivities.companyId);
    filters.push(allowUnlinkedCompanyRecords(salesActivities.companyId, visibility));
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

  async createActivity(input: ActivityCreateInput, actor: AuthContext, origin: ActivityOrigin = 'system') {
    const companyId = await this.assertReferences(input, actor);
    const typeId = await this.resolveActivityTypeId(input.activityTypeCode);
    if (!typeId) throw new ValidationError(`Bilinmeyen aktivite türü: ${input.activityTypeCode}`);
    const divisionId = await this.resolveActivityDivision(input, actor);
    if (!divisionId) throw new ValidationError('Aktivite için bölüm ataması zorunludur', { field: 'divisionId' });
    const [row] = await this.db
      .insert(salesActivities)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        opportunityId: input.opportunityId ?? null,
        companyId,
        contactId: input.contactId ?? null,
        activityTypeId: typeId,
        subject: input.subject,
        description: input.description ?? null,
        origin,
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
    activity: {
      id: string;
      divisionId: string | null;
      subject: string;
      description: string | null;
      previousText?: string;
    },
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
      const existedBefore = activity.previousText
        ? handles.some((h) => new RegExp('@' + escape(h) + '(?![\\p{L}\\p{N}])', 'iu').test(activity.previousText!))
        : false;
      if (hit && !existedBefore) mentioned.add(u.id);
    }
    if (!mentioned.size) return;
    let mentionedIds = [...mentioned];
    if (activity.divisionId) {
      const [scopeRows, legacyRows] = await Promise.all([
        this.db
          .select({ userId: userAccessScopes.userId })
          .from(userAccessScopes)
          .where(and(
            eq(userAccessScopes.tenantId, actor.tenantId),
            eq(userAccessScopes.resource, 'activities'),
            inArray(userAccessScopes.userId, mentionedIds),
            or(isNull(userAccessScopes.divisionId), eq(userAccessScopes.divisionId, activity.divisionId))
          )),
        this.db
          .select({ userId: userDivisions.userId })
          .from(userDivisions)
          .where(and(inArray(userDivisions.userId, mentionedIds), eq(userDivisions.divisionId, activity.divisionId))),
      ]);
      const visibleUserIds = new Set([...scopeRows.map((row) => row.userId), ...legacyRows.map((row) => row.userId)]);
      mentionedIds = mentionedIds.filter((userId) => visibleUserIds.has(userId));
      if (!mentionedIds.length) return;
    }
    await this.db.insert(notifications).values(
      mentionedIds.map((userId) => ({
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
    const companyId = await this.assertReferences(
      {
        companyId: input.companyId ?? existing.companyId ?? undefined,
        contactId: input.contactId ?? existing.contactId ?? undefined,
        opportunityId: input.opportunityId ?? existing.opportunityId ?? undefined,
      },
      actor
    );

    const patch: Record<string, unknown> = {};
    if (input.companyId !== undefined) patch.companyId = companyId;
    if (input.contactId !== undefined) patch.contactId = input.contactId || null;
    if (input.opportunityId !== undefined) patch.opportunityId = input.opportunityId || null;
    if (input.activityTypeCode !== undefined) {
      const typeId = await this.resolveActivityTypeId(input.activityTypeCode);
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
    await this.notifyActivityMentions(
      {
        id: row.id,
        divisionId: row.divisionId,
        subject: row.subject,
        description: row.description,
        previousText: [existing.subject, existing.description].filter(Boolean).join(' '),
      },
      actor,
    ).catch(() => undefined);
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
    if (!divisionId) throw new ValidationError('Ziyaret için bölüm ataması zorunludur', { field: 'divisionId' });
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
    if (!divisionId) throw new ValidationError('Arama kaydı için bölüm ataması zorunludur', { field: 'divisionId' });
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
