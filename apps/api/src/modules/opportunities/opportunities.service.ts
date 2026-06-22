import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { opportunities, opportunityStageHistory, salesActivities, visits, calls } from '../../db/schema/crm';
import { companies, contacts } from '../../db/schema/companies';
import { users } from '../../db/schema/users';
import { quotes } from '../../db/schema/quotes';
import { inventoryItems, customerDevices } from '../../db/schema/inventory';
import { pipelineStages, currencies, opportunityStatuses, contactSources, inventoryStatuses, warrantyStatuses } from '../../db/schema/lookup';
import { cancellationReasons } from '../../db/schema/crm';
import { commercialInvoices, contracts } from '../../db/schema/quotes';
import { receivables } from '../../db/schema/finance';
import { DB } from '../../shared/database/database.module';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { OpportunityCreateInput, OpportunityUpdateInput, OpportunityStageChangeInput, Pagination } from '@haksan/shared';
import { PIPELINE_STAGES, STAGE_TRANSITIONS, type PipelineStageCode } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { AuditService } from '../../shared/database/audit.service';
import { inArray } from 'drizzle-orm';
import {
  companyPortfolioFilter,
  divisionFilter,
  resolveActorDivisionScope,
  resolveAssignedDivision,
} from '../../shared/utils/division-scope';

@Injectable()
export class OpportunitiesService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  private async stageRowByCode(code: string) {
    const row = await this.db.query.pipelineStages.findFirst({ where: eq(pipelineStages.code, code) });
    if (!row) throw new ValidationError(`Bilinmeyen aşama: ${code}`);
    return row;
  }

  private async assertCompany(companyId: string, actor: AuthContext) {
    const company = await this.db.query.companies.findFirst({
      where: and(
        eq(companies.id, companyId),
        eq(companies.tenantId, actor.tenantId),
        isNull(companies.deletedAt),
        companyPortfolioFilter(resolveActorDivisionScope(actor), companies.id) ?? sql`true`
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
    if (contact.companyId !== companyId) throw new ValidationError('Kontak seçilen firmaya ait değil');
    return contact;
  }

  private async assertUser(userId: string, actor: AuthContext) {
    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.tenantId, actor.tenantId), isNull(users.deletedAt)),
    });
    if (!user) throw new NotFoundError('Kullanıcı');
    return user;
  }

  async list(actor: AuthContext, query: { search?: string; stageCode?: string; companyId?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(opportunities.tenantId, actor.tenantId), isNull(opportunities.deletedAt)];
    if (query.search) filters.push(ilike(opportunities.title, `%${query.search}%`));
    if (query.companyId) filters.push(eq(opportunities.companyId, query.companyId));
    if (query.stageCode) {
      const stage = await this.stageRowByCode(query.stageCode);
      filters.push(eq(opportunities.currentStageId, stage.id));
    }
    const scoped = divisionFilter(resolveActorDivisionScope(actor), opportunities.divisionId);
    if (scoped) filters.push(scoped);
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(where);
    const rows = await this.db
      .select({
        opp: opportunities,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        stage: { id: pipelineStages.id, code: pipelineStages.code, name: pipelineStages.name },
        currency: { id: currencies.id, code: currencies.code },
      })
      .from(opportunities)
      .leftJoin(companies, eq(opportunities.companyId, companies.id))
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .leftJoin(currencies, eq(opportunities.currencyId, currencies.id))
      .where(where)
      .orderBy(desc(opportunities.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({ ...r.opp, company: r.company, stage: r.stage, currency: r.currency })),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const row = await this.db
      .select({
        opp: opportunities,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        stage: { id: pipelineStages.id, code: pipelineStages.code, name: pipelineStages.name },
        currency: { id: currencies.id, code: currencies.code },
      })
      .from(opportunities)
      .leftJoin(companies, eq(opportunities.companyId, companies.id))
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .leftJoin(currencies, eq(opportunities.currencyId, currencies.id))
      .where(
        and(
          eq(opportunities.id, id),
          eq(opportunities.tenantId, actor.tenantId),
          isNull(opportunities.deletedAt),
          divisionFilter(resolveActorDivisionScope(actor), opportunities.divisionId) ?? sql`true`
        )
      )
      .limit(1);
    if (!row.length) throw new NotFoundError('Fırsat');
    const r = row[0];

    const history = await this.db
      .select()
      .from(opportunityStageHistory)
      .where(eq(opportunityStageHistory.opportunityId, id))
      .orderBy(desc(opportunityStageHistory.createdAt));
    return { ...r.opp, company: r.company, stage: r.stage, currency: r.currency, history };
  }

  async create(input: OpportunityCreateInput, actor: AuthContext) {
    await this.assertCompany(input.companyId, actor);
    if (input.primaryContactId) await this.assertContact(input.primaryContactId, actor, input.companyId);
    if (input.ownerUserId) await this.assertUser(input.ownerUserId, actor);

    const leadStage = await this.stageRowByCode('lead');
    const currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    const sourceId = await lookupIdByCode(this.db, contactSources, input.sourceCode);
    const openStatus = await this.db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'open') });
    const divisionId = resolveAssignedDivision(actor, input.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Fırsat için bölüm ataması zorunludur', { field: 'divisionId' });

    const [row] = await this.db
      .insert(opportunities)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        companyId: input.companyId,
        primaryContactId: input.primaryContactId ?? null,
        ownerUserId: input.ownerUserId ?? actor.userId,
        title: input.title,
        description: input.description ?? null,
        currentStageId: leadStage.id,
        estimatedValue: input.estimatedValue?.toString() ?? null,
        currencyId,
        probability: input.probability,
        expectedCloseDate: input.expectedCloseDate ?? null,
        sourceId,
        statusId: openStatus?.id ?? null,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await this.db.insert(opportunityStageHistory).values({
      tenantId: actor.tenantId,
      opportunityId: row.id,
      fromStageId: null,
      toStageId: leadStage.id,
      changedBy: actor.userId,
      changeReason: 'Initial lead',
    });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.created',
      resourceType: 'opportunity',
      resourceId: row.id,
      newValues: { title: row.title },
    });
    return this.get(row.id, actor);
  }

  async update(id: string, input: OpportunityUpdateInput, actor: AuthContext) {
    const existing = await this.get(id, actor);
    const companyId = input.companyId ?? existing.companyId;
    if (input.companyId !== undefined) await this.assertCompany(input.companyId, actor);
    if (input.primaryContactId !== undefined) {
      if (input.primaryContactId) await this.assertContact(input.primaryContactId, actor, companyId);
    } else if (input.companyId !== undefined && existing.primaryContactId) {
      await this.assertContact(existing.primaryContactId, actor, companyId);
    }
    if (input.ownerUserId) await this.assertUser(input.ownerUserId, actor);
    const patch: Record<string, unknown> = { updatedBy: actor.userId };
    if (input.currencyCode !== undefined) patch.currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    if (input.sourceCode !== undefined) patch.sourceId = await lookupIdByCode(this.db, contactSources, input.sourceCode);
    if (input.estimatedValue !== undefined) patch.estimatedValue = input.estimatedValue?.toString() ?? null;
    for (const k of ['companyId', 'primaryContactId', 'ownerUserId', 'title', 'description', 'probability', 'expectedCloseDate', 'wonReason'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    await this.db.update(opportunities).set(patch).where(eq(opportunities.id, id));
    return this.get(id, actor);
  }

  async delete(id: string, actor: AuthContext) {
    await this.get(id, actor);
    await this.db.update(opportunities).set({ deletedAt: new Date() }).where(eq(opportunities.id, id));
    return { ok: true };
  }

  /**
   * Kanban DnD endpoint. Enforces bölüm 3 transition rules:
   *  - cancelled → cancellation_reason zorunlu
   *  - quote → mevcut quote olmalı
   *  - contract → quote'a contract dosyası yüklenmeli
   *  - commercial_invoice → ticari fatura dosyası yüklenmeli
   *  - customs_approved → öncesinde commercial_invoice tamamlanmış olmalı
   *  - stock_picking → customs_approved'tan sonra; inventory_item seçilmeli (reserved'a alınır)
   *  - delivered → customer_device kaydı oluşturulur
   */
  async changeStage(id: string, input: OpportunityStageChangeInput, actor: AuthContext) {
    const opp = await this.db.query.opportunities.findFirst({
      where: and(
        eq(opportunities.id, id),
        eq(opportunities.tenantId, actor.tenantId),
        isNull(opportunities.deletedAt),
        divisionFilter(resolveActorDivisionScope(actor), opportunities.divisionId) ?? sql`true`
      ),
    });
    if (!opp) throw new NotFoundError('Fırsat');

    const fromStage = await this.db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.id, opp.currentStageId),
    });
    if (!fromStage) throw new ValidationError('Mevcut aşama bulunamadı');

    const toStage = await this.stageRowByCode(input.toStage);

    if (!PIPELINE_STAGES.includes(input.toStage)) {
      throw new ValidationError(`Bilinmeyen aşama: ${input.toStage}`);
    }
    if (fromStage.code === input.toStage) return this.get(id, actor);

    const allowedFrom = STAGE_TRANSITIONS[input.toStage as PipelineStageCode];
    if (!allowedFrom.includes(fromStage.code as PipelineStageCode)) {
      throw new ValidationError(`'${fromStage.code}' aşamasından '${input.toStage}' aşamasına geçiş yapılamaz`);
    }

    const patch: Record<string, unknown> = { currentStageId: toStage.id, updatedBy: actor.userId };

    if (input.toStage === 'cancelled') {
      if (!input.cancellationReasonCode) throw new ValidationError('İptal nedeni zorunludur', { field: 'cancellationReasonCode' });
      const reason = await this.db.query.cancellationReasons.findFirst({
        where: and(eq(cancellationReasons.tenantId, actor.tenantId), eq(cancellationReasons.code, input.cancellationReasonCode)),
      });
      // Auto-create if missing — lighter UX
      let reasonId = reason?.id;
      if (!reasonId) {
        const [created] = await this.db
          .insert(cancellationReasons)
          .values({
            tenantId: actor.tenantId,
            code: input.cancellationReasonCode,
            name: input.cancellationReasonCode,
          })
          .returning();
        reasonId = created.id;
      }
      patch.lostReasonId = reasonId;
      if (input.lostCompetitorId) patch.lostCompetitorId = input.lostCompetitorId;
      if (input.lostCompetitorProductModel) patch.lostCompetitorProductModel = input.lostCompetitorProductModel;
      const lost = await this.db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'lost') });
      if (lost) patch.statusId = lost.id;
    }

    if (input.toStage === 'quote') {
      const qcount = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(quotes)
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, id)));
      if (!qcount[0].c) {
        throw new ValidationError('Quote aşamasına geçmek için en az bir teklif oluşturulmalıdır');
      }
    }
    if (input.toStage === 'contract') {
      const ccount = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(contracts)
        .innerJoin(quotes, eq(contracts.quoteId, quotes.id))
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, id)));
      if (!ccount[0].c) throw new ValidationError('Contract aşamasına geçmek için sözleşme dosyası yüklenmelidir');
    }
    if (input.toStage === 'commercial_invoice') {
      const rcount = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(receivables)
        .innerJoin(quotes, eq(receivables.quoteId, quotes.id))
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, id)));
      if (!rcount[0].c) {
        throw new ValidationError('Ticari fatura aşamasına geçmek için önce ödeme planı oluşturulmalıdır');
      }

      const icount = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(commercialInvoices)
        .innerJoin(quotes, eq(commercialInvoices.quoteId, quotes.id))
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, id)));
      if (!icount[0].c) throw new ValidationError('Ticari fatura dosyası yüklenmelidir');
    }
    if (input.toStage === 'stock_picking') {
      if (!input.inventoryItemIds?.length) {
        throw new ValidationError('Stok seçimi için en az bir seri no belirtilmelidir');
      }
      const reserved = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'reserved') });
      // Verify items belong to tenant
      const items = await this.db.query.inventoryItems.findMany({
        where: and(eq(inventoryItems.tenantId, actor.tenantId), inArray(inventoryItems.id, input.inventoryItemIds)),
      });
      if (items.length !== input.inventoryItemIds.length) {
        throw new ValidationError('Bazı stok kalemleri bu tenant\'a ait değil');
      }
      for (const item of items) {
        await this.db
          .update(inventoryItems)
          .set({ stockStatusId: reserved?.id ?? item.stockStatusId })
          .where(eq(inventoryItems.id, item.id));
      }
    }
    if (input.toStage === 'installation') {
      // Garanti, tezgâhın kurulumuyla başlar: rezerve stok kalemlerinden
      // müşteri cihazı / garanti kayıtları oluşturulur (idempotent).
      await this.ensureWarrantyDevices(opp, actor, input.inventoryItemIds);
    }
    if (input.toStage === 'delivered') {
      // Cihaz/garanti kayıtları kurulumda oluşturulmuş olabilir; tekrar çağırmak
      // güvenlidir (idempotent). Kurulum atlandıysa burada oluşturulur.
      await this.ensureWarrantyDevices(opp, actor, input.inventoryItemIds);
      const won = await this.db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'won') });
      if (won) patch.statusId = won.id;
    }

    await this.db.update(opportunities).set(patch).where(eq(opportunities.id, id));
    await this.db.insert(opportunityStageHistory).values({
      tenantId: actor.tenantId,
      opportunityId: id,
      fromStageId: fromStage.id,
      toStageId: toStage.id,
      changedBy: actor.userId,
      changeReason: input.changeReason ?? null,
    });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.stage.changed',
      resourceType: 'opportunity',
      resourceId: id,
      oldValues: { stage: fromStage.code },
      newValues: { stage: toStage.code, reason: input.changeReason },
    });
    return this.get(id, actor);
  }

  /**
   * Rezerve stok kalemlerinden müşteri cihazı (garanti) kaydı üretir.
   * Garanti kurulum aşamasında başlar; idempotenttir — aynı fırsat+kalem için
   * zaten cihaz varsa atlanır, böylece teslim aşaması da çağırdığında çift
   * kayıt oluşmaz.
   */
  private async ensureWarrantyDevices(
    opp: { id: string; companyId: string; divisionId: string | null },
    actor: AuthContext,
    inventoryItemIds?: string[],
  ) {
    const items = await this.db.query.inventoryItems.findMany({
      where: and(eq(inventoryItems.tenantId, actor.tenantId)),
    });
    const reservedStatus = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'reserved') });
    const soldStatus = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'sold') });
    const activeWarranty = await this.db.query.warrantyStatuses.findFirst({ where: eq(warrantyStatuses.code, 'active') });
    const ids = inventoryItemIds ?? [];
    const selected = ids.length
      ? items.filter((i) => ids.includes(i.id))
      : items.filter((i) => reservedStatus && i.stockStatusId === reservedStatus.id);
    for (const item of selected) {
      const existing = await this.db
        .select({ id: customerDevices.id })
        .from(customerDevices)
        .where(and(
          eq(customerDevices.tenantId, actor.tenantId),
          eq(customerDevices.opportunityId, opp.id),
          eq(customerDevices.inventoryItemId, item.id),
        ))
        .limit(1);
      if (existing.length) continue;
      await this.db.insert(customerDevices).values({
        tenantId: actor.tenantId,
        divisionId: opp.divisionId,
        companyId: opp.companyId,
        inventoryItemId: item.id,
        opportunityId: opp.id,
        saleDate: new Date(),
        deliveryDate: new Date(),
        warrantyStartDate: new Date(),
        warrantyEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        statusId: activeWarranty?.id ?? null,
      });
      if (soldStatus) {
        await this.db.update(inventoryItems).set({ stockStatusId: soldStatus.id }).where(eq(inventoryItems.id, item.id));
      }
    }
  }
}
