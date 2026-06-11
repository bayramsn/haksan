import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { companies, companyAddresses, companyPhones, companyEmails } from '../../db/schema/companies';
import { companyRelationTypes, companyStatuses, companyGroups, contactSources } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { ConflictError, NotFoundError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { CompanyCreateInput, CompanyUpdateInput, CompanyListQuery, Pagination } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { AuditService } from '../../shared/database/audit.service';

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

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
    const [addresses, phones, emails] = companyIds.length
      ? await Promise.all([
          this.db.select().from(companyAddresses).where(inArray(companyAddresses.companyId, companyIds)),
          this.db.select().from(companyPhones).where(inArray(companyPhones.companyId, companyIds)),
          this.db.select().from(companyEmails).where(inArray(companyEmails.companyId, companyIds)),
        ])
      : [[], [], []];

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
        };
      }),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const row = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, id), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)),
    });
    if (!row) throw new NotFoundError('Firma');

    const [addresses, phones, emails] = await Promise.all([
      this.db.select().from(companyAddresses).where(eq(companyAddresses.companyId, id)),
      this.db.select().from(companyPhones).where(eq(companyPhones.companyId, id)),
      this.db.select().from(companyEmails).where(eq(companyEmails.companyId, id)),
    ]);
    return { ...row, addresses, phones, emails };
  }

  async create(input: CompanyCreateInput, actor: AuthContext) {
    if (input.taxNumber) {
      const existing = await this.db.query.companies.findFirst({
        where: and(
          eq(companies.tenantId, actor.tenantId),
          eq(companies.taxNumber, input.taxNumber),
          isNull(companies.deletedAt)
        ),
      });
      if (existing) throw new ConflictError('Bu vergi numarası ile bir firma zaten kayıtlı');
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
