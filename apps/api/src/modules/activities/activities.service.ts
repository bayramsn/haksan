import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { salesActivities, visits, calls, opportunities } from '../../db/schema/crm';
import { companies, contacts } from '../../db/schema/companies';
import { activityTypes } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { ActivityCreateInput, VisitCreateInput, CallCreateInput, Pagination } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';

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

  async list(actor: AuthContext, query: { opportunityId?: string; companyId?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(salesActivities.tenantId, actor.tenantId)];
    if (query.opportunityId) filters.push(eq(salesActivities.opportunityId, query.opportunityId));
    if (query.companyId) filters.push(eq(salesActivities.companyId, query.companyId));
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(salesActivities)
      .where(where);
    const rows = await this.db
      .select({
        activity: salesActivities,
        type: { id: activityTypes.id, code: activityTypes.code, name: activityTypes.name },
      })
      .from(salesActivities)
      .leftJoin(activityTypes, eq(salesActivities.activityTypeId, activityTypes.id))
      .where(where)
      .orderBy(desc(salesActivities.activityDate))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({ ...r.activity, type: r.type })),
      count,
      page
    );
  }

  async createActivity(input: ActivityCreateInput, actor: AuthContext) {
    await this.assertReferences(input, actor);
    const typeId = await lookupIdByCode(this.db, activityTypes, input.activityTypeCode);
    if (!typeId) throw new ValidationError(`Bilinmeyen aktivite türü: ${input.activityTypeCode}`);
    const [row] = await this.db
      .insert(salesActivities)
      .values({
        tenantId: actor.tenantId,
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
    return row;
  }

  async createVisit(input: VisitCreateInput, actor: AuthContext) {
    await this.assertReferences(input, actor);
    const [row] = await this.db
      .insert(visits)
      .values({
        tenantId: actor.tenantId,
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
    const [row] = await this.db
      .insert(calls)
      .values({
        tenantId: actor.tenantId,
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
