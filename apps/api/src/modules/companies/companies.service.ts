import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNotNull, isNull, ne, not, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import {
  companies,
  companyAccessRequests,
  companyAddresses,
  companyDivisions,
  companyPhones,
  companyEmails,
  notifications,
} from '../../db/schema/companies';
import { receivables } from '../../db/schema/finance';
import { divisions } from '../../db/schema/tenants';
import { userDivisions } from '../../db/schema/users';
import { companyRelationTypes, companyStatuses, companyGroups, contactSources, paymentStatuses } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type {
  CompanyAccessRequestInput,
  CompanyAccessRequestDecisionInput,
  CompanyCreateInput,
  CompanyUpdateInput,
  CompanyListQuery,
  Pagination,
} from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { AuditService } from '../../shared/database/audit.service';
import {
  companyPortfolioFilter,
  resolveActorDivisionScope,
  resolveAssignedDivision,
  type DivisionScope,
} from '../../shared/utils/division-scope';

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  private scope(actor: AuthContext): DivisionScope {
    return resolveActorDivisionScope(actor);
  }

  private async resolveCreateDivision(input: CompanyCreateInput, actor: AuthContext): Promise<string> {
    const assigned = resolveAssignedDivision(actor, input.divisionId ?? null);
    if (assigned) {
      await this.assertDivision(assigned, actor);
      return assigned;
    }
    if (input.companyGroupCode && ['cnc', 'universal', 'sac_isleme'].includes(input.companyGroupCode)) {
      const division = await this.db.query.divisions.findFirst({
        where: and(eq(divisions.tenantId, actor.tenantId), eq(divisions.code, input.companyGroupCode)),
      });
      if (division) return division.id;
    }
    throw new ValidationError('Firma için CNC / Üniversal / Sac İşleme bölümü seçimi zorunludur', { field: 'divisionId' });
  }

  private async assertDivision(divisionId: string, actor: AuthContext) {
    const division = await this.db.query.divisions.findFirst({
      where: and(eq(divisions.id, divisionId), eq(divisions.tenantId, actor.tenantId), eq(divisions.isActive, true)),
    });
    if (!division) throw new NotFoundError('Bölüm');
    if (!actor.canViewAllDivisions && !actor.divisionIds.includes(divisionId)) {
      throw new ForbiddenError('Bu bölüme işlem yapamazsınız');
    }
    return division;
  }

  private async hasCompanyDivision(companyId: string, divisionId: string): Promise<boolean> {
    const row = await this.db.query.companyDivisions.findFirst({
      where: and(eq(companyDivisions.companyId, companyId), eq(companyDivisions.divisionId, divisionId)),
    });
    return !!row;
  }

  private async assertCompanyVisible(companyId: string, actor: AuthContext) {
    const filters = [eq(companies.id, companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)];
    const portfolio = companyPortfolioFilter(this.scope(actor), companies.id);
    if (portfolio) filters.push(portfolio);
    const row = await this.db.query.companies.findFirst({ where: and(...filters) });
    if (!row) throw new NotFoundError('Firma');
    return row;
  }

  private async companyDivisionRows(companyIds: string[]) {
    if (!companyIds.length) return [];
    return this.db
      .select({
        companyId: companyDivisions.companyId,
        id: divisions.id,
        code: divisions.code,
        name: divisions.name,
      })
      .from(companyDivisions)
      .innerJoin(divisions, eq(companyDivisions.divisionId, divisions.id))
      .where(inArray(companyDivisions.companyId, companyIds));
  }

  async list(actor: AuthContext, query: CompanyListQuery, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)];
    if (query.search) {
      filters.push(
        or(
          ilike(companies.legalTitle, `%${query.search}%`),
          ilike(companies.shortName, `%${query.search}%`),
          ilike(companies.taxNumber, `%${query.search}%`)
        )!
      );
    }
    if (query.relationTypeCode) {
      const relId = await lookupIdByCode(this.db, companyRelationTypes, query.relationTypeCode);
      if (relId) filters.push(eq(companies.relationTypeId, relId));
    }
    if (query.customerStatusCode) {
      const sid = await lookupIdByCode(this.db, companyStatuses, query.customerStatusCode);
      if (sid) filters.push(eq(companies.customerStatusId, sid));
    }
    const portfolio = companyPortfolioFilter(this.scope(actor), companies.id);
    if (portfolio) filters.push(portfolio);

    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(companies)
      .where(where);

    const rows = await this.db
      .select({
        company: companies,
        relationType: { code: companyRelationTypes.code, name: companyRelationTypes.name },
        customerStatus: { code: companyStatuses.code, name: companyStatuses.name },
        companyGroup: { code: companyGroups.code, name: companyGroups.name },
        contactSource: { code: contactSources.code, name: contactSources.name },
      })
      .from(companies)
      .leftJoin(companyRelationTypes, eq(companies.relationTypeId, companyRelationTypes.id))
      .leftJoin(companyStatuses, eq(companies.customerStatusId, companyStatuses.id))
      .leftJoin(companyGroups, eq(companies.companyGroupId, companyGroups.id))
      .leftJoin(contactSources, eq(companies.contactSourceId, contactSources.id))
      .where(where)
      .orderBy(desc(companies.createdAt))
      .limit(limit)
      .offset(offset);

    const companyIds = rows.map((r) => r.company.id);
    const [addresses, phones, emails, divisionRows] = companyIds.length
      ? await Promise.all([
          this.db.select().from(companyAddresses).where(inArray(companyAddresses.companyId, companyIds)),
          this.db.select().from(companyPhones).where(inArray(companyPhones.companyId, companyIds)),
          this.db.select().from(companyEmails).where(inArray(companyEmails.companyId, companyIds)),
          this.companyDivisionRows(companyIds),
        ])
      : [[], [], [], []];

    return buildPaginated(
      rows.map((r) => {
        const rowPhones = phones.filter((p) => p.companyId === r.company.id);
        const rowEmails = emails.filter((e) => e.companyId === r.company.id);
        return {
          ...r.company,
          relationType: r.relationType,
          customerStatus: r.customerStatus,
          companyGroup: r.companyGroup,
          contactSource: r.contactSource,
          primaryAddress: addresses.find((a) => a.companyId === r.company.id && a.isDefault) ?? addresses.find((a) => a.companyId === r.company.id) ?? null,
          primaryPhone: rowPhones.find((p) => p.phoneType === 'main')?.phone ?? rowPhones.find((p) => p.isDefault)?.phone ?? null,
          secondaryPhone: rowPhones.find((p) => p.phoneType === 'secondary')?.phone ?? null,
          fax: rowPhones.find((p) => p.phoneType === 'fax')?.phone ?? null,
          primaryEmail: rowEmails.find((e) => e.emailType === 'main')?.email ?? rowEmails.find((e) => e.isDefault)?.email ?? null,
          secondaryEmail: rowEmails.find((e) => e.emailType === 'secondary')?.email ?? null,
          divisions: divisionRows.filter((d) => d.companyId === r.company.id).map(({ companyId: _companyId, ...d }) => d),
        };
      }),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const row = await this.assertCompanyVisible(id, actor);

    const [addresses, phones, emails, divisionRows] = await Promise.all([
      this.db.select().from(companyAddresses).where(eq(companyAddresses.companyId, id)),
      this.db.select().from(companyPhones).where(eq(companyPhones.companyId, id)),
      this.db.select().from(companyEmails).where(eq(companyEmails.companyId, id)),
      this.companyDivisionRows([id]),
    ]);
    return { ...row, addresses, phones, emails, divisions: divisionRows.map(({ companyId: _companyId, ...d }) => d) };
  }

  async create(input: CompanyCreateInput, actor: AuthContext) {
    const divisionId = await this.resolveCreateDivision(input, actor);
    if (input.taxNumber) {
      const existing = await this.db.query.companies.findFirst({
        where: and(
          eq(companies.tenantId, actor.tenantId),
          eq(companies.taxNumber, input.taxNumber),
          isNull(companies.deletedAt)
        ),
      });
      if (existing) {
        if (await this.hasCompanyDivision(existing.id, divisionId)) {
          throw new ConflictError('Bu vergi numarası ile bir firma zaten kayıtlı');
        }
        const request = await this.createAccessRequestForDivision(existing.id, divisionId, actor, {
          note: input.notes ?? null,
        });
        throw new ConflictError('Bu vergi numarası başka bir bölüm portföyünde kayıtlı; erişim talebi oluşturuldu', {
          duplicateCompanyId: existing.id,
          accessRequestId: request.id,
          status: request.status,
        });
      }
    }

    const [relId, statusId, groupId, sourceId] = await Promise.all([
      lookupIdByCode(this.db, companyRelationTypes, input.relationTypeCode),
      lookupIdByCode(this.db, companyStatuses, input.customerStatusCode),
      lookupIdByCode(this.db, companyGroups, input.companyGroupCode),
      lookupIdByCode(this.db, contactSources, input.contactSourceCode),
    ]);

    const [created] = await this.db
      .insert(companies)
      .values({
        tenantId: actor.tenantId,
        companyType: input.companyType,
        relationTypeId: relId,
        customerStatusId: statusId,
        companyGroupId: groupId,
        contactSourceId: sourceId,
        sector: input.sector ?? null,
        legalTitle: input.legalTitle,
        shortName: input.shortName ?? null,
        taxOffice: input.taxOffice ?? null,
        taxNumber: input.taxNumber ?? null,
        website: input.website ?? null,
        notes: input.notes ?? null,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();

    await this.db
      .insert(companyDivisions)
      .values({
        tenantId: actor.tenantId,
        companyId: created.id,
        divisionId,
        addedByUserId: actor.userId,
      })
      .onConflictDoNothing();

    if (input.address) {
      await this.db.insert(companyAddresses).values({
        tenantId: actor.tenantId,
        companyId: created.id,
        addressType: 'billing',
        country: input.address.country ?? 'Türkiye',
        province: input.address.province ?? null,
        district: input.address.district ?? null,
        locality: input.address.locality ?? null,
        zipCode: input.address.zipCode ?? null,
        street: input.address.street ?? null,
        buildingNumber: input.address.buildingNumber ?? null,
        fullAddress: input.address.fullAddress ?? null,
        isDefault: true,
      });
    }
    if (input.primaryPhone) {
      await this.db.insert(companyPhones).values({
        tenantId: actor.tenantId,
        companyId: created.id,
        phoneType: 'main',
        phone: input.primaryPhone,
        isDefault: true,
      });
    }
    if (input.secondaryPhone) {
      await this.db.insert(companyPhones).values({
        tenantId: actor.tenantId,
        companyId: created.id,
        phoneType: 'secondary',
        phone: input.secondaryPhone,
        isDefault: false,
      });
    }
    if (input.fax) {
      await this.db.insert(companyPhones).values({
        tenantId: actor.tenantId,
        companyId: created.id,
        phoneType: 'fax',
        phone: input.fax,
        isDefault: false,
      });
    }
    if (input.primaryEmail) {
      await this.db.insert(companyEmails).values({
        tenantId: actor.tenantId,
        companyId: created.id,
        emailType: 'main',
        email: input.primaryEmail,
        isDefault: true,
      });
    }
    if (input.secondaryEmail) {
      await this.db.insert(companyEmails).values({
        tenantId: actor.tenantId,
        companyId: created.id,
        emailType: 'secondary',
        email: input.secondaryEmail,
        isDefault: false,
      });
    }

    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'company.created',
      resourceType: 'company',
      resourceId: created.id,
      newValues: { legalTitle: created.legalTitle, taxNumber: created.taxNumber },
    });
    return this.get(created.id, actor);
  }

  async update(id: string, input: CompanyUpdateInput, actor: AuthContext) {
    const existing = await this.get(id, actor);

    const [relId, statusId, groupId, sourceId] = await Promise.all([
      lookupIdByCode(this.db, companyRelationTypes, input.relationTypeCode),
      lookupIdByCode(this.db, companyStatuses, input.customerStatusCode),
      lookupIdByCode(this.db, companyGroups, input.companyGroupCode),
      lookupIdByCode(this.db, contactSources, input.contactSourceCode),
    ]);

    const patch: Record<string, unknown> = {
      updatedBy: actor.userId,
    };
    if (input.companyType !== undefined) patch.companyType = input.companyType;
    if (input.relationTypeCode !== undefined) patch.relationTypeId = relId;
    if (input.customerStatusCode !== undefined) patch.customerStatusId = statusId;
    if (input.companyGroupCode !== undefined) patch.companyGroupId = groupId;
    if (input.contactSourceCode !== undefined) patch.contactSourceId = sourceId;
    for (const k of ['sector', 'legalTitle', 'shortName', 'taxOffice', 'taxNumber', 'website', 'notes'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }

    await this.db.update(companies).set(patch).where(eq(companies.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'company.updated',
      resourceType: 'company',
      resourceId: id,
      oldValues: existing,
      newValues: patch,
    });
    return this.get(id, actor);
  }

  async createAccessRequest(companyId: string, input: CompanyAccessRequestInput, actor: AuthContext) {
    const activeDivisionId = actor.activeDivisionId && actor.activeDivisionId !== 'all' ? actor.activeDivisionId : null;
    const requestedDivisionId = resolveAssignedDivision(actor, input.divisionId ?? activeDivisionId);
    if (!requestedDivisionId) {
      throw new ValidationError('Erişim talebi için bölüm seçimi zorunludur', { field: 'divisionId' });
    }
    await this.assertDivision(requestedDivisionId, actor);
    return this.createAccessRequestForDivision(companyId, requestedDivisionId, actor, { note: input.note ?? null });
  }

  private async ensureCompanyTenant(companyId: string, actor: AuthContext) {
    const company = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)),
    });
    if (!company) throw new NotFoundError('Firma');
    return company;
  }

  private async userIdsInDivision(divisionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: userDivisions.userId })
      .from(userDivisions)
      .where(eq(userDivisions.divisionId, divisionId));
    return rows.map((r) => r.userId);
  }

  private async createAccessRequestForDivision(
    companyId: string,
    requestedDivisionId: string,
    actor: AuthContext,
    options: { note?: string | null }
  ) {
    const company = await this.ensureCompanyTenant(companyId, actor);
    if (await this.hasCompanyDivision(companyId, requestedDivisionId)) {
      return { id: null, status: 'already_granted', companyId, requestingDivisionId: requestedDivisionId };
    }

    const owner = await this.db.query.companyDivisions.findFirst({
      where: and(eq(companyDivisions.companyId, companyId), ne(companyDivisions.divisionId, requestedDivisionId)),
    });
    const existing = await this.db.query.companyAccessRequests.findFirst({
      where: and(
        eq(companyAccessRequests.tenantId, actor.tenantId),
        eq(companyAccessRequests.companyId, companyId),
        eq(companyAccessRequests.requestingDivisionId, requestedDivisionId),
        eq(companyAccessRequests.status, 'pending'),
        isNull(companyAccessRequests.deletedAt)
      ),
    });
    if (existing) return existing;

    const [request] = await this.db
      .insert(companyAccessRequests)
      .values({
        tenantId: actor.tenantId,
        companyId,
        requestingUserId: actor.userId,
        requestingDivisionId: requestedDivisionId,
        ownerDivisionId: owner?.divisionId ?? null,
        note: options.note ?? null,
      })
      .returning();

    const ownerDivision = owner?.divisionId
      ? await this.db.query.divisions.findFirst({ where: eq(divisions.id, owner.divisionId) })
      : null;
    await this.db.insert(notifications).values({
      tenantId: actor.tenantId,
      divisionId: owner?.divisionId ?? null,
      type: 'company_access_request',
      title: 'Mükerrer firma onayı bekliyor',
      body: `${company.legalTitle} için ${ownerDivision?.name ?? 'firma sahibi'} portföyünden erişim talebi var.`,
      entityType: 'company_access_request',
      entityId: request.id,
    });

    return request;
  }

  async listAccessRequests(actor: AuthContext, query: { status?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(companyAccessRequests.tenantId, actor.tenantId), isNull(companyAccessRequests.deletedAt)];
    if (query.status) filters.push(eq(companyAccessRequests.status, query.status));
    const scope = this.scope(actor);
    if (scope.mode === 'list') {
      if (scope.divisionIds.length === 0) {
        filters.push(sql`1 = 0`);
      } else {
        filters.push(
          or(
            inArray(companyAccessRequests.ownerDivisionId, scope.divisionIds),
            inArray(companyAccessRequests.requestingDivisionId, scope.divisionIds)
          )!
        );
      }
    }
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(companyAccessRequests)
      .where(where);
    const rows = await this.db
      .select({
        request: companyAccessRequests,
        company: { id: companies.id, legalTitle: companies.legalTitle, taxNumber: companies.taxNumber },
        requestingDivision: { id: divisions.id, name: divisions.name, code: divisions.code },
      })
      .from(companyAccessRequests)
      .innerJoin(companies, eq(companyAccessRequests.companyId, companies.id))
      .leftJoin(divisions, eq(companyAccessRequests.requestingDivisionId, divisions.id))
      .where(where)
      .orderBy(desc(companyAccessRequests.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({ ...r.request, company: r.company, requestingDivision: r.requestingDivision })),
      count,
      page
    );
  }

  async decideAccessRequest(id: string, decision: 'approved' | 'rejected', input: CompanyAccessRequestDecisionInput, actor: AuthContext) {
    const request = await this.db.query.companyAccessRequests.findFirst({
      where: and(eq(companyAccessRequests.id, id), eq(companyAccessRequests.tenantId, actor.tenantId), isNull(companyAccessRequests.deletedAt)),
    });
    if (!request) throw new NotFoundError('Erişim talebi');
    if (request.status !== 'pending') throw new ConflictError('Bu erişim talebi zaten sonuçlandırılmış');
    const canDecide =
      actor.canViewAllDivisions || (request.ownerDivisionId ? actor.divisionIds.includes(request.ownerDivisionId) : false);
    if (!canDecide) throw new ForbiddenError('Bu erişim talebini sonuçlandıramazsınız');

    await this.db
      .update(companyAccessRequests)
      .set({
        status: decision,
        decisionNote: input.decisionNote ?? null,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
      })
      .where(eq(companyAccessRequests.id, id));

    if (decision === 'approved') {
      await this.db
        .insert(companyDivisions)
        .values({
          tenantId: actor.tenantId,
          companyId: request.companyId,
          divisionId: request.requestingDivisionId,
          addedByUserId: actor.userId,
        })
        .onConflictDoNothing();
    }

    await this.db.insert(notifications).values({
      tenantId: actor.tenantId,
      userId: request.requestingUserId,
      divisionId: request.requestingDivisionId,
      type: decision === 'approved' ? 'company_access_approved' : 'company_access_rejected',
      title: decision === 'approved' ? 'Firma erişimi onaylandı' : 'Firma erişimi reddedildi',
      body: input.decisionNote ?? null,
      entityType: 'company_access_request',
      entityId: request.id,
    });

    return this.db.query.companyAccessRequests.findFirst({ where: eq(companyAccessRequests.id, id) });
  }

  async crossDivisionDebt(companyId: string, actor: AuthContext) {
    await this.ensureCompanyTenant(companyId, actor);
    const scope = this.scope(actor);
    const excludedDivisionIds = scope.mode === 'list' ? scope.divisionIds : actor.divisionIds;
    const filters = [
      eq(receivables.tenantId, actor.tenantId),
      eq(receivables.companyId, companyId),
      isNull(receivables.deletedAt),
      isNotNull(receivables.divisionId),
      or(isNull(paymentStatuses.code), not(inArray(paymentStatuses.code, ['paid', 'cancelled'])))!,
    ];
    if (excludedDivisionIds.length > 0) {
      filters.push(not(inArray(receivables.divisionId, excludedDivisionIds)));
    }
    const rows = await this.db
      .select({
        divisionId: divisions.id,
        name: divisions.name,
        amount: sql<string>`coalesce(sum(${receivables.amount}), 0)`,
      })
      .from(receivables)
      .innerJoin(divisions, eq(receivables.divisionId, divisions.id))
      .leftJoin(paymentStatuses, eq(receivables.statusId, paymentStatuses.id))
      .where(and(...filters))
      .groupBy(divisions.id, divisions.name);

    const canSeeAmount = actor.canViewAllDivisions || actor.roles.includes('super_admin');
    const departments = rows.map((row) => ({
      id: row.divisionId,
      name: row.name,
      ...(canSeeAmount ? { amount: Number(row.amount ?? 0) } : {}),
    }));
    return {
      hasDebt: rows.some((row) => Number(row.amount ?? 0) > 0),
      departments,
      ...(canSeeAmount ? { amount: departments.reduce((sum, row) => sum + (row.amount ?? 0), 0) } : {}),
    };
  }

  async delete(id: string, actor: AuthContext) {
    const existing = await this.get(id, actor);
    await this.db.update(companies).set({ deletedAt: new Date() }).where(eq(companies.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'company.deleted',
      resourceType: 'company',
      resourceId: id,
      oldValues: existing,
    });
    return { ok: true };
  }
}
