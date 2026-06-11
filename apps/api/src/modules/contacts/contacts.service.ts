import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { contacts, companies } from '../../db/schema/companies';
import { decisionRoles } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { NotFoundError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { ContactCreateInput, ContactUpdateInput, Pagination } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { AuditService } from '../../shared/database/audit.service';

@Injectable()
export class ContactsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  async list(actor: AuthContext, query: { search?: string; companyId?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)];
    if (query.companyId) filters.push(eq(contacts.companyId, query.companyId));
    if (query.search) {
      filters.push(ilike(contacts.fullName, `%${query.search}%`));
    }
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(where);
    const rows = await this.db
      .select({
        contact: contacts,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        decisionRole: { code: decisionRoles.code, name: decisionRoles.name },
      })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .leftJoin(decisionRoles, eq(contacts.decisionRoleId, decisionRoles.id))
      .where(where)
      .orderBy(desc(contacts.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({ ...r.contact, company: r.company })),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const row = await this.db.query.contacts.findFirst({
      where: and(eq(contacts.id, id), eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)),
    });
    if (!row) throw new NotFoundError('Kontak');
    return row;
  }

  async create(input: ContactCreateInput, actor: AuthContext) {
    // verify company belongs to tenant
    const company = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, input.companyId), eq(companies.tenantId, actor.tenantId)),
    });
    if (!company) throw new NotFoundError('Firma');
    const decisionId = await lookupIdByCode(this.db, decisionRoles, input.decisionRoleCode);
    const [created] = await this.db
      .insert(contacts)
      .values({
        tenantId: actor.tenantId,
        companyId: input.companyId,
        fullName: input.fullName,
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
        knownIllness: input.knownIllness ?? null,
        favoriteColor: input.favoriteColor ?? null,
        graduatedSchool: input.graduatedSchool ?? null,
        politicalView: input.politicalView ?? null,
        notes: input.notes ?? null,
        isPrimary: input.isPrimary ?? false,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
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
    const patch: Record<string, unknown> = { updatedBy: actor.userId };
    if (input.decisionRoleCode !== undefined) {
      patch.decisionRoleId = await lookupIdByCode(this.db, decisionRoles, input.decisionRoleCode);
    }
    for (const k of [
      'fullName',
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
      'knownIllness',
      'favoriteColor',
      'graduatedSchool',
      'politicalView',
      'notes',
      'isPrimary',
      'companyId',
    ] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    await this.db.update(contacts).set(patch).where(eq(contacts.id, id));
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

  async delete(id: string, actor: AuthContext) {
    await this.get(id, actor);
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
