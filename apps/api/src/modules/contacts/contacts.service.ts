import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { companyDivisions, contactCompanies, contacts, companies } from '../../db/schema/companies';
import { decisionRoles } from '../../db/schema/lookup';
import { users } from '../../db/schema/users';
import { DB } from '../../shared/database/database.module';
import { ConflictError, NotFoundError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { ContactCreateInput, ContactUpdateInput, Pagination } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { AuditService } from '../../shared/database/audit.service';
import { resourceCompanyPortfolioFilter, resolveResourceDivisionScope } from '../../shared/utils/division-scope';
import { companyVisibilityFilter } from '../../shared/utils/company-visibility';
import { normalizePersonName } from '../../shared/utils/text-normalization';
import { nextRecordNo } from '../../shared/utils/record-sequence';

@Injectable()
export class ContactsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  private async createdByUser(createdBy: string | null | undefined, tenantId: string) {
    if (!createdBy) return null;
    const [row] = await this.db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(and(eq(users.id, createdBy), eq(users.tenantId, tenantId)))
      .limit(1);
    return row ?? null;
  }

  async list(actor: AuthContext, query: { search?: string; companyId?: string; divisionId?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const scope = resolveResourceDivisionScope(actor, 'contacts');
    const visibility = await companyVisibilityFilter(this.db, actor);
    const filters = [eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)];
    if (query.companyId) {
      await this.assertCompany(query.companyId, actor);
      filters.push(sql`exists (
        select 1
        from contact_companies cc
        where cc.contact_id = ${contacts.id}
          and cc.company_id = ${query.companyId}
      )`);
    } else {
      const requestedDivisionAllowed =
        query.divisionId && (scope.mode === 'all' || scope.divisionIds.includes(query.divisionId));
      const scopeFilter = requestedDivisionAllowed
        ? eq(companyDivisions.divisionId, query.divisionId!)
        : scope.mode === 'all'
          ? sql`true`
          : scope.divisionIds.length === 0
            ? sql`1 = 0`
            : inArray(companyDivisions.divisionId, scope.divisionIds);
      filters.push(sql`exists (
        select 1
        from contact_companies
        join companies on companies.id = contact_companies.company_id
        left join company_divisions on company_divisions.company_id = contact_companies.company_id
        where contact_companies.contact_id = ${contacts.id}
          and companies.tenant_id = ${actor.tenantId}
          and companies.deleted_at is null
          and ${resourceCompanyPortfolioFilter(actor, 'contacts', companies.id) ?? sql`true`}
          and ${visibility ?? sql`true`}
          and ${scopeFilter}
      )`);
    }
    if (query.search) {
      filters.push(or(
        ilike(contacts.fullName, `%${query.search}%`),
        ilike(contacts.externalContactNo, `%${query.search}%`),
        sql`exists (
          select 1 from companies search_company
          where search_company.id = ${contacts.companyId}
            and search_company.tenant_id = ${actor.tenantId}
            and search_company.deleted_at is null
            and search_company.external_company_no ilike ${`%${query.search}%`}
        )`,
      )!);
    }
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(where);
    const rows = await this.db
      .select({
        contact: contacts,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName, externalCompanyNo: companies.externalCompanyNo },
        decisionRole: { code: decisionRoles.code, name: decisionRoles.name },
        createdByUser: { id: users.id, fullName: users.fullName, email: users.email },
      })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .leftJoin(decisionRoles, eq(contacts.decisionRoleId, decisionRoles.id))
      .leftJoin(users, and(eq(contacts.createdBy, users.id), eq(users.tenantId, actor.tenantId)))
      .where(where)
      .orderBy(desc(contacts.createdAt), desc(contacts.id))
      .limit(limit)
      .offset(offset);
    if (rows.length === 0) return buildPaginated([], count, page);
    const contactIds = rows.map((r) => r.contact.id);
    const linkRows = await this.db
      .select({
        contactId: contactCompanies.contactId,
        id: companies.id,
        legalTitle: companies.legalTitle,
        shortName: companies.shortName,
        externalCompanyNo: companies.externalCompanyNo,
        isPrimary: contactCompanies.isPrimary,
      })
      .from(contactCompanies)
      .innerJoin(companies, eq(contactCompanies.companyId, companies.id))
      .where(
        and(
          eq(contactCompanies.tenantId, actor.tenantId),
          inArray(contactCompanies.contactId, contactIds),
          eq(companies.tenantId, actor.tenantId),
          isNull(companies.deletedAt),
          resourceCompanyPortfolioFilter(actor, 'contacts', companies.id) ?? sql`true`,
          visibility ?? sql`true`
        )
      )
      .orderBy(desc(contactCompanies.isPrimary));
    const linksByContact = new Map<string, Array<{ id: string; legalTitle: string; shortName: string | null; externalCompanyNo: string | null; isPrimary: boolean }>>();
    for (const link of linkRows) {
      const links = linksByContact.get(link.contactId) ?? [];
      links.push({ id: link.id, legalTitle: link.legalTitle, shortName: link.shortName, externalCompanyNo: link.externalCompanyNo, isPrimary: link.isPrimary });
      linksByContact.set(link.contactId, links);
    }
    return buildPaginated(
      rows.map((r) => {
        const companyLinks = linksByContact.get(r.contact.id) ?? [];
        const primaryCompany = companyLinks.find((company) => company.isPrimary) ?? companyLinks[0] ?? null;
        return {
          ...r.contact,
          // contacts.companyId denormalize bir alan; görünmeyen birincil firma
          // burada döndürülmez. Görünen bağlardan biri güvenli temsilci olur.
          companyId: primaryCompany?.id ?? null,
          company: primaryCompany
            ? {
                id: primaryCompany.id,
                legalTitle: primaryCompany.legalTitle,
                shortName: primaryCompany.shortName,
                externalCompanyNo: primaryCompany.externalCompanyNo,
              }
            : null,
          decisionRole: r.decisionRole,
          createdByUser: r.createdByUser?.id ? r.createdByUser : null,
          companyLinks,
        };
      }),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const row = await this.db.query.contacts.findFirst({
      where: and(eq(contacts.id, id), eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)),
    });
    if (!row) throw new NotFoundError('Kontak');
    await this.assertContactVisible(row.id, actor);
    const [creator, companyLinks] = await Promise.all([
      this.createdByUser(row.createdBy, actor.tenantId),
      this.visibleCompanyLinks(row.id, actor),
    ]);
    const primaryCompany = companyLinks.find((company) => company.isPrimary) ?? companyLinks[0] ?? null;
    return {
      ...row,
      companyId: primaryCompany?.id ?? null,
      companyLinks,
      createdByUser: creator,
    };
  }

  /**
   * Bir kontağın bağlı olduğu firmalar (contact_companies M2M). Aynı kişi birden
   * çok firmada yetkili olabilir. Yalnızca kullanıcının portföyündeki firmalar
   * döner (view_all → hepsi).
   */
  async listCompanies(contactId: string, actor: AuthContext) {
    await this.get(contactId, actor); // görünürlük + varlık kontrolü
    return this.visibleCompanyLinks(contactId, actor);
  }

  private async visibleCompanyLinks(contactId: string, actor: AuthContext) {
    const visibility = await companyVisibilityFilter(this.db, actor);
    return this.db
      .select({
        id: companies.id,
        legalTitle: companies.legalTitle,
        shortName: companies.shortName,
        externalCompanyNo: companies.externalCompanyNo,
        isPrimary: contactCompanies.isPrimary,
      })
      .from(contactCompanies)
      .innerJoin(companies, eq(contactCompanies.companyId, companies.id))
      .where(
        and(
          eq(contactCompanies.contactId, contactId),
          eq(companies.tenantId, actor.tenantId),
          isNull(companies.deletedAt),
          resourceCompanyPortfolioFilter(actor, 'contacts', companies.id) ?? sql`true`,
          visibility ?? sql`true`
        )
      )
      .orderBy(desc(contactCompanies.isPrimary));
  }

  /** Kontağın tüm firma bağları görünmüyorsa ortak kaydı değiştirmek yasaktır. */
  private async assertAllContactCompaniesVisible(contactId: string, actor: AuthContext) {
    const [allLinks, visibleLinks] = await Promise.all([
      this.db
        .select({ companyId: contactCompanies.companyId })
        .from(contactCompanies)
        .where(and(eq(contactCompanies.contactId, contactId), eq(contactCompanies.tenantId, actor.tenantId))),
      this.visibleCompanyLinks(contactId, actor),
    ]);
    if (allLinks.length !== visibleLinks.length) throw new NotFoundError('Kontak');
  }

  /** Kontağı bir firmadan ayırır (contact_companies bağını siler). Kontağın en az
   *  bir firmaya bağlı kalması gerekir; birincil bağ silinirse kalanlardan biri
   *  birincil yapılır ve contacts.companyId ona göre güncellenir. */
  async unlinkCompany(contactId: string, companyId: string, actor: AuthContext) {
    await this.get(contactId, actor); // görünürlük + varlık kontrolü
    await this.assertAllContactCompaniesVisible(contactId, actor);
    const links = await this.db
      .select({ companyId: contactCompanies.companyId, isPrimary: contactCompanies.isPrimary })
      .from(contactCompanies)
      .where(and(eq(contactCompanies.contactId, contactId), eq(contactCompanies.tenantId, actor.tenantId)));
    const target = links.find((l) => l.companyId === companyId);
    if (!target) throw new NotFoundError('Firma bağlantısı');
    if (links.length <= 1) throw new ConflictError('Kontağın en az bir firmaya bağlı olması gerekir');
    await this.db
      .delete(contactCompanies)
      .where(and(eq(contactCompanies.contactId, contactId), eq(contactCompanies.companyId, companyId)));
    if (target.isPrimary) {
      const next = links.find((l) => l.companyId !== companyId)!;
      await this.db
        .update(contactCompanies)
        .set({ isPrimary: true })
        .where(and(eq(contactCompanies.contactId, contactId), eq(contactCompanies.companyId, next.companyId)));
      await this.db.update(contacts).set({ companyId: next.companyId }).where(eq(contacts.id, contactId));
    }
    return this.listCompanies(contactId, actor);
  }

  /** Bir firmayı kontağın birincil firması yapar (diğerlerini ikincilleştirir) ve
   *  denormalize contacts.companyId alanını eşitler. */
  async setPrimaryCompany(contactId: string, companyId: string, actor: AuthContext) {
    await this.get(contactId, actor);
    await this.assertAllContactCompaniesVisible(contactId, actor);
    const target = await this.db
      .select({ companyId: contactCompanies.companyId })
      .from(contactCompanies)
      .where(
        and(
          eq(contactCompanies.contactId, contactId),
          eq(contactCompanies.companyId, companyId),
          eq(contactCompanies.tenantId, actor.tenantId)
        )
      )
      .limit(1);
    if (target.length === 0) throw new NotFoundError('Firma bağlantısı');
    await this.db
      .update(contactCompanies)
      .set({ isPrimary: false })
      .where(eq(contactCompanies.contactId, contactId));
    await this.db
      .update(contactCompanies)
      .set({ isPrimary: true })
      .where(and(eq(contactCompanies.contactId, contactId), eq(contactCompanies.companyId, companyId)));
    await this.db.update(contacts).set({ companyId }).where(eq(contacts.id, contactId));
    return this.listCompanies(contactId, actor);
  }

  async create(input: ContactCreateInput, actor: AuthContext) {
    await this.assertCompany(input.companyId, actor);
    const duplicate = await this.findDuplicate(input, actor);
    if (duplicate) {
      const duplicateVisible = await this.canSeeContact(duplicate.id, actor);
      if (!duplicateVisible) {
        throw new ConflictError('Bu kontak başka bir yetki alanında kayıtlı');
      }
      if (duplicate.isBlacklisted) {
        throw new ConflictError('Bu kontak kara listede', { contactId: duplicate.id, reason: duplicate.blacklistReason });
      }
      await this.db
        .insert(contactCompanies)
        .values({
          tenantId: actor.tenantId,
          contactId: duplicate.id,
          companyId: input.companyId,
          isPrimary: input.isPrimary ?? false,
        })
        .onConflictDoNothing();
      return this.get(duplicate.id, actor);
    }
    const decisionId = await lookupIdByCode(this.db, decisionRoles, input.decisionRoleCode);
    const externalContactNo = input.externalContactNo ?? await nextRecordNo(this.db, actor.tenantId, 'contact');
    const [created] = await this.db
      .insert(contacts)
      .values({
        tenantId: actor.tenantId,
        companyId: input.companyId,
        externalContactNo,
        fullName: normalizePersonName(input.fullName),
        title: input.title ?? null,
        department: input.department ?? null,
        decisionRoleId: decisionId,
        workPhone: input.workPhone ?? null,
        phoneExtension: input.phoneExtension ?? null,
        mobilePhone: input.mobilePhone ?? null,
        otherPhone: input.otherPhone ?? null,
        workEmail: input.workEmail ?? null,
        personalEmail: input.personalEmail ?? null,
        otherEmail: input.otherEmail ?? null,
        gender: input.gender ?? null,
        birthDate: input.birthDate ?? null,
        hometown: input.hometown ?? null,
        favoriteTeam: input.favoriteTeam ?? null,
        favoriteColor: input.favoriteColor ?? null,
        graduatedSchool: input.graduatedSchool ?? null,
        notes: input.notes ?? null,
        isBlacklisted: input.isBlacklisted ?? false,
        blacklistReason: input.blacklistReason ?? null,
        isPrimary: input.isPrimary ?? false,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await this.db
      .insert(contactCompanies)
      .values({
        tenantId: actor.tenantId,
        contactId: created.id,
        companyId: input.companyId,
        isPrimary: input.isPrimary ?? true,
      })
      .onConflictDoNothing();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'contact.created',
      resourceType: 'contact',
      resourceId: created.id,
      newValues: { fullName: created.fullName },
    });
    return created;
  }

  async update(id: string, input: ContactUpdateInput, actor: AuthContext) {
    const existing = await this.get(id, actor);
    await this.assertAllContactCompaniesVisible(id, actor);
    if (input.externalContactNo && input.externalContactNo !== existing.externalContactNo) {
      const duplicate = await this.db.query.contacts.findFirst({
        where: and(
          eq(contacts.tenantId, actor.tenantId),
          eq(contacts.externalContactNo, input.externalContactNo),
          isNull(contacts.deletedAt),
          ne(contacts.id, id)
        ),
      });
      if (duplicate) throw new ConflictError('Bu kontak numarası ile bir kontak zaten kayıtlı');
    }
    const patch: Record<string, unknown> = { updatedBy: actor.userId };
    if (input.companyId !== undefined) await this.assertCompany(input.companyId, actor);
    if (input.decisionRoleCode !== undefined) {
      patch.decisionRoleId = await lookupIdByCode(this.db, decisionRoles, input.decisionRoleCode);
    }
    for (const k of [
      'fullName',
      'externalContactNo',
      'title',
      'department',
      'workPhone',
      'phoneExtension',
      'mobilePhone',
      'otherPhone',
      'workEmail',
      'personalEmail',
      'otherEmail',
      'gender',
      'birthDate',
      'hometown',
      'favoriteTeam',
      'favoriteColor',
      'graduatedSchool',
      'notes',
      'isBlacklisted',
      'blacklistReason',
      'isPrimary',
      'companyId',
    ] as const) {
      if ((input as any)[k] === undefined) continue;
      const value = (input as any)[k];
      patch[k] = k === 'fullName' && value ? normalizePersonName(value) : value ?? null;
    }
    await this.db.update(contacts).set(patch).where(eq(contacts.id, id));
    if (input.companyId !== undefined) {
      await this.db
        .update(contactCompanies)
        .set({ isPrimary: false })
        .where(and(eq(contactCompanies.contactId, id), eq(contactCompanies.tenantId, actor.tenantId)));
      await this.db
        .insert(contactCompanies)
        .values({
          tenantId: actor.tenantId,
          contactId: id,
          companyId: input.companyId,
          isPrimary: true,
        })
        .onConflictDoNothing();
      await this.db
        .update(contactCompanies)
        .set({ isPrimary: true })
        .where(
          and(
            eq(contactCompanies.contactId, id),
            eq(contactCompanies.companyId, input.companyId),
            eq(contactCompanies.tenantId, actor.tenantId)
          )
        );
    }
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'contact.updated',
      resourceType: 'contact',
      resourceId: id,
      oldValues: existing,
      newValues: patch,
    });
    return this.get(id, actor);
  }

  private async assertCompany(companyId: string, actor: AuthContext) {
    const visibility = await companyVisibilityFilter(this.db, actor);
    const company = await this.db.query.companies.findFirst({
      where: and(
        eq(companies.id, companyId),
        eq(companies.tenantId, actor.tenantId),
        isNull(companies.deletedAt),
        resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
        visibility ?? sql`true`
      ),
    });
    if (!company) throw new NotFoundError('Firma');
    return company;
  }

  private async assertContactVisible(contactId: string, actor: AuthContext) {
    const scope = resolveResourceDivisionScope(actor, 'contacts');
    const visibility = await companyVisibilityFilter(this.db, actor);
    if (scope.mode === 'list' && scope.divisionIds.length === 0) throw new NotFoundError('Kontak');
    const rows = await this.db
      .select({ contactId: contactCompanies.contactId })
      .from(contactCompanies)
      .innerJoin(companies, eq(contactCompanies.companyId, companies.id))
      .leftJoin(companyDivisions, eq(contactCompanies.companyId, companyDivisions.companyId))
      .where(
        and(
          eq(contactCompanies.contactId, contactId),
          eq(companies.tenantId, actor.tenantId),
          isNull(companies.deletedAt),
          resourceCompanyPortfolioFilter(actor, 'contacts', companies.id) ?? sql`true`,
          visibility ?? sql`true`,
          scope.mode === 'all' ? sql`true` : inArray(companyDivisions.divisionId, scope.divisionIds)
        )
      )
      .limit(1);
    if (!rows.length) throw new NotFoundError('Kontak');
  }

  private async canSeeContact(contactId: string, actor: AuthContext) {
    try {
      await this.assertContactVisible(contactId, actor);
      return true;
    } catch {
      return false;
    }
  }

  private async findDuplicate(input: ContactCreateInput, actor: AuthContext) {
    const probes = [
      input.externalContactNo ? eq(contacts.externalContactNo, input.externalContactNo) : undefined,
      input.workEmail ? eq(contacts.workEmail, input.workEmail) : undefined,
      input.personalEmail ? eq(contacts.personalEmail, input.personalEmail) : undefined,
      input.otherEmail ? eq(contacts.otherEmail, input.otherEmail) : undefined,
      input.mobilePhone ? eq(contacts.mobilePhone, input.mobilePhone) : undefined,
      input.workPhone ? eq(contacts.workPhone, input.workPhone) : undefined,
      input.otherPhone ? eq(contacts.otherPhone, input.otherPhone) : undefined,
    ].filter((p): p is NonNullable<typeof p> => !!p);
    if (!probes.length) return null;
    return this.db.query.contacts.findFirst({
      where: and(eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt), or(...probes)!),
    });
  }

  async delete(id: string, actor: AuthContext) {
    await this.get(id, actor);
    await this.assertAllContactCompaniesVisible(id, actor);
    await this.db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'contact.deleted',
      resourceType: 'contact',
      resourceId: id,
    });
    return { ok: true };
  }
}
