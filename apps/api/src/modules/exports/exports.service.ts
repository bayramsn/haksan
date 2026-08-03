import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { companies, companyAddresses, companyDivisions, companyEmails, companyPhones, contacts } from '../../db/schema/companies';
import { opportunities, salesActivities } from '../../db/schema/crm';
import { files, fileLinks } from '../../db/schema/files';
import { receivables, payments } from '../../db/schema/finance';
import { customerDevices, inventoryItems } from '../../db/schema/inventory';
import { purchaseOrders } from '../../db/schema/orders';
import { productModels, productSpecs, brands } from '../../db/schema/products';
import { quotes } from '../../db/schema/quotes';
import { deliveries, serviceComplaintIntakes, serviceTickets, shipments } from '../../db/schema/service';
import {
  companyRelationTypes,
  companyStatuses,
  companyGroups,
  contactSources,
  currencies,
  fileDocumentTypes,
  inventoryStatuses,
  paymentStatuses,
  pipelineStages,
  productCategories,
  productGroups,
  purchaseOrderStatuses,
  quoteStatuses,
  serviceTicketStatuses,
  shipmentStatuses,
  stockLocationStatuses,
} from '../../db/schema/lookup';
import { users } from '../../db/schema/users';
import { warehouses } from '../../db/schema/inventory';
import { divisions } from '../../db/schema/tenants';
import { DB } from '../../shared/database/database.module';
import type { AuthContext } from '../../shared/security/auth.types';
import { isoDate, type ExportRow } from '../../shared/utils/excel-export';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { FinanceService } from '../finance/finance.service';
import type { DateRange } from '@haksan/shared';
import { resourceCompanyPortfolioFilter, resourceDivisionFilter, resourceDivisionFilterWithShared } from '../../shared/utils/division-scope';
import {
  allowUnlinkedCompanyRecords,
  companyVisibilityExistsFilter,
  companyVisibilityFilter,
} from '../../shared/utils/company-visibility';

const EXPORT_LIMIT = 15_000;

@Injectable()
export class ExportsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly finance: FinanceService
  ) {}

  private async canExportDocumentLink(link: typeof fileLinks.$inferSelect, actor: AuthContext): Promise<boolean> {
    switch (link.entityType) {
      case 'company': {
        const visibility = await companyVisibilityFilter(this.db, actor);
        const [row] = await this.db
          .select({ id: companies.id })
          .from(companies)
          .where(and(
            eq(companies.id, link.entityId),
            eq(companies.tenantId, actor.tenantId),
            isNull(companies.deletedAt),
            resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
            visibility ?? sql`true`
          ))
          .limit(1);
        return Boolean(row);
      }
      case 'opportunity': {
        const visibility = await companyVisibilityExistsFilter(this.db, actor, opportunities.companyId);
        const [row] = await this.db
          .select({ id: opportunities.id })
          .from(opportunities)
          .where(and(
            eq(opportunities.id, link.entityId),
            eq(opportunities.tenantId, actor.tenantId),
            isNull(opportunities.deletedAt),
            resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`,
            allowUnlinkedCompanyRecords(opportunities.companyId, visibility)
          ))
          .limit(1);
        return Boolean(row);
      }
      case 'sales_activity': {
        const visibility = await companyVisibilityExistsFilter(this.db, actor, salesActivities.companyId);
        const [row] = await this.db
          .select({ id: salesActivities.id })
          .from(salesActivities)
          .where(and(
            eq(salesActivities.id, link.entityId),
            eq(salesActivities.tenantId, actor.tenantId),
            isNull(salesActivities.deletedAt),
            resourceDivisionFilter(actor, 'activities', salesActivities.divisionId) ?? sql`true`,
            visibility ?? sql`true`
          ))
          .limit(1);
        return Boolean(row);
      }
      case 'service_ticket': {
        const visibility = await companyVisibilityExistsFilter(this.db, actor, serviceTickets.companyId);
        const [row] = await this.db
          .select({ id: serviceTickets.id })
          .from(serviceTickets)
          .where(and(
            eq(serviceTickets.id, link.entityId),
            eq(serviceTickets.tenantId, actor.tenantId),
            isNull(serviceTickets.deletedAt),
            resourceDivisionFilter(actor, 'service_tickets', serviceTickets.divisionId) ?? sql`true`,
            visibility ?? sql`true`
          ))
          .limit(1);
        return Boolean(row);
      }
      case 'service_complaint_intake': {
        const visibility = await companyVisibilityExistsFilter(this.db, actor, serviceComplaintIntakes.companyId);
        const [row] = await this.db
          .select({ id: serviceComplaintIntakes.id })
          .from(serviceComplaintIntakes)
          .where(and(
            eq(serviceComplaintIntakes.id, link.entityId),
            eq(serviceComplaintIntakes.tenantId, actor.tenantId),
            isNull(serviceComplaintIntakes.deletedAt),
            resourceDivisionFilter(actor, 'service_tickets', serviceComplaintIntakes.divisionId) ?? sql`true`,
            visibility ? (or(isNull(serviceComplaintIntakes.companyId), visibility) ?? sql`true`) : sql`true`
          ))
          .limit(1);
        return Boolean(row);
      }
      case 'product':
      case 'product_model': {
        const [row] = await this.db
          .select({ id: productModels.id })
          .from(productModels)
          .leftJoin(productGroups, eq(productModels.productGroupId, productGroups.id))
          .where(and(
            eq(productModels.id, link.entityId),
            eq(productModels.tenantId, actor.tenantId),
            isNull(productModels.deletedAt),
            resourceDivisionFilterWithShared(actor, 'products', productGroups.divisionId) ?? sql`true`
          ))
          .limit(1);
        return Boolean(row);
      }
      default:
        return false;
    }
  }

  async exportCompanies(
    actor: AuthContext,
    query: { search?: string; relationTypeCode?: string; customerStatusCode?: string; divisionId?: string }
  ): Promise<ExportRow[]> {
    const filters = [eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)];
    if (query.search) {
      filters.push(
        or(
          ilike(companies.legalTitle, `%${query.search}%`),
          ilike(companies.shortName, `%${query.search}%`),
          ilike(companies.taxNumber, `%${query.search}%`),
          ilike(companies.externalCompanyNo, `%${query.search}%`)
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
    if (query.divisionId) {
      filters.push(sql`exists (
        select 1 from ${companyDivisions}
        where ${companyDivisions.companyId} = ${companies.id}
          and ${companyDivisions.divisionId} = ${query.divisionId}
      )`);
    }
    filters.push(resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`);
    filters.push((await companyVisibilityFilter(this.db, actor)) ?? sql`true`);

    const rows = await this.db
      .select({
        company: companies,
        relationType: { name: companyRelationTypes.name },
        customerStatus: { name: companyStatuses.name },
        companyGroup: { name: companyGroups.name },
        contactSource: { name: contactSources.name },
      })
      .from(companies)
      .leftJoin(companyRelationTypes, eq(companies.relationTypeId, companyRelationTypes.id))
      .leftJoin(companyStatuses, eq(companies.customerStatusId, companyStatuses.id))
      .leftJoin(companyGroups, eq(companies.companyGroupId, companyGroups.id))
      .leftJoin(contactSources, eq(companies.contactSourceId, contactSources.id))
      .where(and(...filters))
      .orderBy(desc(companies.createdAt))
      .limit(EXPORT_LIMIT);

    const companyIds = rows.map((r) => r.company.id);
    const [addresses, phones, emails, companyDivisionRows] = companyIds.length
      ? await Promise.all([
          this.db.select().from(companyAddresses).where(inArray(companyAddresses.companyId, companyIds)),
          this.db.select().from(companyPhones).where(inArray(companyPhones.companyId, companyIds)),
          this.db.select().from(companyEmails).where(inArray(companyEmails.companyId, companyIds)),
          this.db
            .select({ companyId: companyDivisions.companyId, name: divisions.name })
            .from(companyDivisions)
            .innerJoin(divisions, eq(companyDivisions.divisionId, divisions.id))
            .where(inArray(companyDivisions.companyId, companyIds)),
        ])
      : [[], [], [], []];

    return rows.map((r) => {
      const cid = r.company.id;
      const addr = addresses.find((a) => a.companyId === cid && a.isDefault) ?? addresses.find((a) => a.companyId === cid);
      const phone =
        phones.find((p) => p.companyId === cid && p.phoneType === 'main')?.phone ??
        phones.find((p) => p.companyId === cid && p.isDefault)?.phone ??
        '';
      const email =
        emails.find((e) => e.companyId === cid && e.emailType === 'main')?.email ??
        emails.find((e) => e.companyId === cid && e.isDefault)?.email ??
        '';
      return {
        'Firma No': r.company.externalCompanyNo ?? '',
        Firma: r.company.legalTitle,
        'Kısa Ad': r.company.shortName ?? '',
        Tip: r.relationType?.name ?? '',
        'Müşteri Statüsü': r.customerStatus?.name ?? '',
        'Bağlı Bulunduğu Birim': companyDivisionRows.filter((division) => division.companyId === cid).map((division) => division.name).join(', '),
        'Firma Grubu': r.companyGroup?.name ?? '',
        'İrtibat Şekli / Kaynak': r.company.contactSourceText ?? r.contactSource?.name ?? '',
        Telefon: phone,
        'E-posta': email,
        Şehir: addr?.province ?? '',
        İlçe: addr?.district ?? '',
        VKN: r.company.taxNumber ?? '',
        Sektör: r.company.sector ?? '',
        'Oluşturma': isoDate(r.company.createdAt),
      };
    });
  }

  async exportContacts(actor: AuthContext, query: { search?: string; companyId?: string }): Promise<ExportRow[]> {
    const filters = [eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)];
    if (query.companyId) filters.push(eq(contacts.companyId, query.companyId));
    if (query.search) {
      filters.push(
        or(
          ilike(contacts.fullName, `%${query.search}%`),
          ilike(contacts.externalContactNo, `%${query.search}%`),
          ilike(companies.legalTitle, `%${query.search}%`),
          ilike(companies.externalCompanyNo, `%${query.search}%`)
        )!
      );
    }
    filters.push(eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt));
    filters.push(resourceCompanyPortfolioFilter(actor, 'contacts', companies.id) ?? sql`true`);
    filters.push((await companyVisibilityFilter(this.db, actor)) ?? sql`true`);

    const rows = await this.db
      .select({
        contact: contacts,
        company: { legalTitle: companies.legalTitle, externalCompanyNo: companies.externalCompanyNo },
      })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(and(...filters))
      .orderBy(desc(contacts.createdAt))
      .limit(EXPORT_LIMIT);

    return rows.map((r) => ({
      'Kontak No': r.contact.externalContactNo ?? '',
      'Ad Soyad': r.contact.fullName,
      Ünvan: r.contact.title ?? '',
      Departman: r.contact.department ?? '',
      Firma: r.company?.legalTitle ?? '',
      'Firma No': r.company?.externalCompanyNo ?? '',
      Telefon: r.contact.workPhone ?? '',
      Cep: r.contact.mobilePhone ?? '',
      'E-posta': r.contact.workEmail ?? r.contact.personalEmail ?? '',
      Birincil: r.contact.isPrimary ? 'Evet' : 'Hayır',
    }));
  }

  async exportOpportunities(
    actor: AuthContext,
    query: { search?: string; stageCode?: string; qualificationStage?: string; companyId?: string }
  ): Promise<ExportRow[]> {
    const filters = [eq(opportunities.tenantId, actor.tenantId), isNull(opportunities.deletedAt)];
    if (query.search) {
      filters.push(
        or(
          ilike(opportunities.title, `%${query.search}%`),
          ilike(opportunities.leadContactName, `%${query.search}%`),
          ilike(opportunities.leadCompanyTitle, `%${query.search}%`)
        )!
      );
    }
    if (query.companyId) filters.push(eq(opportunities.companyId, query.companyId));
    if (query.qualificationStage) {
      filters.push(eq(opportunities.qualificationStage, query.qualificationStage));
    }
    if (query.stageCode) {
      const stage = await this.db.query.pipelineStages.findFirst({ where: eq(pipelineStages.code, query.stageCode) });
      if (stage) filters.push(eq(opportunities.currentStageId, stage.id));
    }
    filters.push(resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`);
    filters.push(
      allowUnlinkedCompanyRecords(
        opportunities.companyId,
        await companyVisibilityExistsFilter(this.db, actor, opportunities.companyId)
      )
    );

    const rows = await this.db
      .select({
        opp: opportunities,
        company: { legalTitle: companies.legalTitle },
        stage: { name: pipelineStages.name },
        currency: { code: currencies.code },
        owner: { fullName: users.fullName },
      })
      .from(opportunities)
      .leftJoin(companies, eq(opportunities.companyId, companies.id))
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .leftJoin(currencies, eq(opportunities.currencyId, currencies.id))
      .leftJoin(users, eq(opportunities.ownerUserId, users.id))
      .where(and(...filters))
      .orderBy(desc(opportunities.createdAt))
      .limit(EXPORT_LIMIT);

    return rows.map((r) => ({
      No: r.opp.id,
      Müşteri: r.company?.legalTitle ?? r.opp.leadCompanyTitle ?? '',
      Kontak: r.opp.leadContactName ?? '',
      'İrtibat Bilgisi': r.opp.leadContactValue ?? '',
      Başlık: r.opp.title,
      Tutar: r.opp.estimatedValue ?? '',
      'Para Birimi': r.currency?.code ?? '',
      Derece: r.opp.qualificationStage?.toLocaleUpperCase('tr-TR').replace('_PLUS', '+') ?? '',
      'Operasyon Aşaması': r.stage?.name ?? '',
      Atanan: r.owner?.fullName ?? '',
      Açılış: isoDate(r.opp.createdAt),
    }));
  }

  async exportQuotes(
    actor: AuthContext,
    query: { search?: string; statusCode?: string; companyId?: string }
  ): Promise<ExportRow[]> {
    const filters = [eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt)];
    if (query.search) filters.push(ilike(quotes.documentNo, `%${query.search}%`));
    if (query.companyId) filters.push(eq(quotes.companyId, query.companyId));
    if (query.statusCode) {
      const sid = await lookupIdByCode(this.db, quoteStatuses, query.statusCode);
      if (sid) filters.push(eq(quotes.statusId, sid));
    }
    filters.push(resourceDivisionFilter(actor, 'quotes', quotes.divisionId) ?? sql`true`);
    filters.push((await companyVisibilityExistsFilter(this.db, actor, quotes.companyId)) ?? sql`true`);

    const rows = await this.db
      .select({
        quote: quotes,
        company: { legalTitle: companies.legalTitle },
        status: { name: quoteStatuses.name },
        currency: { code: currencies.code },
      })
      .from(quotes)
      .leftJoin(companies, eq(quotes.companyId, companies.id))
      .leftJoin(quoteStatuses, eq(quotes.statusId, quoteStatuses.id))
      .leftJoin(currencies, eq(quotes.currencyId, currencies.id))
      .where(and(...filters))
      .orderBy(desc(quotes.quoteDate))
      .limit(EXPORT_LIMIT);

    return rows.map((r) => ({
      'Teklif No': r.quote.documentNo ?? '',
      Müşteri: r.company?.legalTitle ?? '',
      Tutar: r.quote.grandTotal ?? '',
      'Para Birimi': r.currency?.code ?? '',
      Durum: r.status?.name ?? '',
      Tarih: isoDate(r.quote.quoteDate),
    }));
  }

  async exportFinance(actor: AuthContext): Promise<Array<{ name: string; rows: ExportRow[] }>> {
    const paymentCompanyVisibility = await companyVisibilityExistsFilter(this.db, actor, payments.companyId);
    const receivableCompanyVisibility = await companyVisibilityExistsFilter(this.db, actor, receivables.companyId);
    const payRows = await this.db
      .select({
        payment: payments,
        company: { legalTitle: companies.legalTitle },
        status: { name: paymentStatuses.name },
        currency: { code: currencies.code },
      })
      .from(payments)
      .leftJoin(companies, eq(payments.companyId, companies.id))
      .leftJoin(paymentStatuses, eq(payments.statusId, paymentStatuses.id))
      .leftJoin(currencies, eq(payments.currencyId, currencies.id))
      .where(and(
        eq(payments.tenantId, actor.tenantId),
        isNull(payments.deletedAt),
        resourceDivisionFilter(actor, 'payments', payments.divisionId) ?? sql`true`,
        paymentCompanyVisibility ?? sql`true`
      ))
      .orderBy(desc(payments.paymentDate))
      .limit(EXPORT_LIMIT);

    const recvRows = await this.db
      .select({
        receivable: receivables,
        company: { legalTitle: companies.legalTitle },
        status: { name: paymentStatuses.name },
        currency: { code: currencies.code },
      })
      .from(receivables)
      .leftJoin(companies, eq(receivables.companyId, companies.id))
      .leftJoin(paymentStatuses, eq(receivables.statusId, paymentStatuses.id))
      .leftJoin(currencies, eq(receivables.currencyId, currencies.id))
      .where(and(
        eq(receivables.tenantId, actor.tenantId),
        isNull(receivables.deletedAt),
        resourceDivisionFilter(actor, 'receivables', receivables.divisionId) ?? sql`true`,
        receivableCompanyVisibility ?? sql`true`
      ))
      .orderBy(desc(receivables.dueDate))
      .limit(EXPORT_LIMIT);

    return [
      {
        name: 'Ödemeler',
        rows: payRows.map((r) => ({
          Firma: r.company?.legalTitle ?? '',
          Yön: r.payment.direction === 'in' ? 'Alınan (Giren)' : 'Ödenen (Çıkan)',
          Tutar: r.payment.amount,
          'Para Birimi': r.currency?.code ?? '',
          'Fatura No': r.payment.invoiceNo ?? '',
          'Ödeme Tarihi': isoDate(r.payment.paymentDate),
          Durum: r.status?.name ?? '',
          Not: r.payment.notes ?? '',
        })),
      },
      {
        name: 'Alacaklar',
        rows: recvRows.map((r) => ({
          Firma: r.company?.legalTitle ?? '',
          Tutar: r.receivable.amount,
          'Para Birimi': r.currency?.code ?? '',
          'Fatura No': r.receivable.invoiceNo ?? '',
          Vade: isoDate(r.receivable.dueDate),
          Durum: r.status?.name ?? '',
          Not: r.receivable.notes ?? '',
        })),
      },
    ];
  }

  async exportCustomerStatement(actor: AuthContext, companyId: string, range: DateRange): Promise<ExportRow[]> {
    const lines = await this.finance.getCompanyStatement(companyId, actor, range);
    return lines.map((l) => ({
      Tarih: isoDate(l.date),
      Tür: l.type,
      Açıklama: l.description,
      'Fatura No': l.invoiceNo ?? '',
      Borç: l.debit,
      Alacak: l.credit,
      Bakiye: l.balance,
      'Para Birimi': l.currencyCode,
    }));
  }

  async customerStatementCompanyLabel(actor: AuthContext, companyId: string): Promise<string> {
    const visibility = await companyVisibilityFilter(this.db, actor);
    const [row] = await this.db
      .select({ legalTitle: companies.legalTitle, shortName: companies.shortName })
      .from(companies)
      .where(and(
        eq(companies.id, companyId),
        eq(companies.tenantId, actor.tenantId),
        isNull(companies.deletedAt),
        visibility ?? sql`true`,
      ))
      .limit(1);
    if (!row) return companyId;
    return row.shortName || row.legalTitle;
  }

  async exportCustomerBalances(actor: AuthContext): Promise<ExportRow[]> {
    const rows = await this.finance.getCustomerBalances(actor);
    const showAlacak = this.finance.isFinanceAdmin(actor);
    return rows.map((r) => {
      const cur = r.currencies[0];
      const currencyCode = cur?.currencyCode ?? r.primaryCurrency ?? '';
      // Yaşlandırma kovaları para birimi bazında tutulur; satırın para birimine
      // karşılık geleni yazılır (yoksa ilk kayıt).
      const aging = r.aging.byCurrency.find((item) => item.currencyCode === currencyCode) ?? r.aging.byCurrency[0];
      const base: ExportRow = {
        Firma: r.companyName,
        Satış: cur?.salesTotal ?? r.salesTotal ?? 0,
        Tahsilat: cur?.collections ?? r.collections ?? 0,
        Borç: cur?.borc ?? r.borc,
        'Para Birimi': currencyCode,
        'Vadesi Gelmemiş': aging?.current ?? 0,
        '1-30 Gün': aging?.d1_30 ?? 0,
        '31-60 Gün': aging?.d31_60 ?? 0,
        '61-90 Gün': aging?.d61_90 ?? 0,
        '90+ Gün': aging?.d90_plus ?? 0,
        'Gecikmiş Toplam': aging?.overdueTotal ?? 0,
        'Gecikme (gün)': r.aging.maxOverdueDays || '',
        'En Eski Gecikme': r.aging.oldestOverdueDate ? isoDate(r.aging.oldestOverdueDate) : '',
        'En Yakın Vade': r.nearestDueDate ? isoDate(r.nearestDueDate) : '',
        'Vade Tutarı': r.nearestDueAmount ?? '',
      };
      if (showAlacak) {
        base['Alış'] = cur?.purchases ?? r.purchases ?? 0;
        base['Ödeme'] = cur?.payouts ?? r.payouts ?? 0;
        base['Alacak (bizim borcumuz)'] = cur?.alacak ?? r.alacak ?? 0;
        base['Toplam Bakiye'] = cur?.totalBalance ?? cur?.net ?? r.totalBalance ?? r.netBorc;
      }
      return base;
    });
  }

  async exportServiceTickets(actor: AuthContext): Promise<ExportRow[]> {
    const visibility = await companyVisibilityExistsFilter(this.db, actor, serviceTickets.companyId);
    const rows = await this.db
      .select({
        ticket: serviceTickets,
        company: { legalTitle: companies.legalTitle },
        status: { name: serviceTicketStatuses.name },
      })
      .from(serviceTickets)
      .leftJoin(companies, eq(serviceTickets.companyId, companies.id))
      .leftJoin(serviceTicketStatuses, eq(serviceTickets.statusId, serviceTicketStatuses.id))
      .where(and(
        eq(serviceTickets.tenantId, actor.tenantId),
        isNull(serviceTickets.deletedAt),
        resourceDivisionFilter(actor, 'service_tickets', serviceTickets.divisionId) ?? sql`true`,
        visibility ?? sql`true`
      ))
      .orderBy(desc(serviceTickets.reportedAt))
      .limit(EXPORT_LIMIT);

    return rows.map((r) => ({
      'Talep No': r.ticket.ticketNo,
      Firma: r.company?.legalTitle ?? '',
      Konu: r.ticket.subject,
      Önem: r.ticket.severity,
      Durum: r.status?.name ?? '',
      Tarih: isoDate(r.ticket.reportedAt),
      Açıklama: r.ticket.description ?? '',
    }));
  }

  async exportServiceComplaints(actor: AuthContext): Promise<ExportRow[]> {
    const visibility = await companyVisibilityExistsFilter(this.db, actor, serviceComplaintIntakes.companyId);
    const rows = await this.db
      .select({
        complaint: serviceComplaintIntakes,
        company: { legalTitle: companies.legalTitle },
        device: { id: customerDevices.id },
        inventory: { serialNumber: inventoryItems.serialNumber },
        product: { modelCode: productModels.modelCode, modelName: productModels.modelName, fullName: productModels.fullName },
        brand: { name: brands.name },
        ticket: { ticketNo: serviceTickets.ticketNo },
      })
      .from(serviceComplaintIntakes)
      .leftJoin(companies, eq(serviceComplaintIntakes.companyId, companies.id))
      .leftJoin(customerDevices, eq(serviceComplaintIntakes.customerDeviceId, customerDevices.id))
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(serviceTickets, eq(serviceComplaintIntakes.serviceTicketId, serviceTickets.id))
      .where(
        and(
          eq(serviceComplaintIntakes.tenantId, actor.tenantId),
          isNull(serviceComplaintIntakes.deletedAt),
          resourceDivisionFilter(actor, 'service_tickets', serviceComplaintIntakes.divisionId) ?? sql`true`,
          visibility ? (or(isNull(serviceComplaintIntakes.companyId), visibility) ?? sql`true`) : sql`true`
        )
      )
      .orderBy(desc(serviceComplaintIntakes.createdAt))
      .limit(EXPORT_LIMIT);

    return rows.map((r) => ({
      'Şikayet No': r.complaint.complaintNo,
      Durum: r.complaint.status,
      Kaynak: r.complaint.source,
      Önem: r.complaint.severity,
      Tip: r.complaint.ticketType,
      Firma: r.company?.legalTitle ?? '',
      Makine: [r.brand?.name, r.product?.modelName ?? r.product?.fullName ?? r.product?.modelCode, r.inventory?.serialNumber].filter(Boolean).join(' / '),
      Konu: r.complaint.subject,
      Açıklama: r.complaint.description ?? '',
      'Kontak Adı': r.complaint.contactName ?? '',
      Telefon: r.complaint.contactPhone ?? '',
      'E-posta': r.complaint.contactEmail ?? '',
      'Servis Talebi': r.ticket?.ticketNo ?? '',
      'Reddetme Notu': r.complaint.rejectionNote ?? '',
      'Oluşturma': isoDate(r.complaint.createdAt),
    }));
  }

  async exportInventory(
    actor: AuthContext,
    query: { search?: string; statusCode?: string; categoryCode?: string }
  ): Promise<ExportRow[]> {
    const filters = [eq(inventoryItems.tenantId, actor.tenantId), isNull(inventoryItems.deletedAt)];
    if (query.search) {
      const term = `%${query.search}%`;
      filters.push(
        or(
          ilike(inventoryItems.serialNumber, term),
          ilike(inventoryItems.controlUnit, term),
          ilike(productModels.fullName, term),
          ilike(productModels.modelCode, term),
          ilike(productModels.stockCode, term),
          ilike(brands.name, term),
        ) ?? sql`false`,
      );
    }
    if (query.statusCode) {
      const sid = await lookupIdByCode(this.db, inventoryStatuses, query.statusCode);
      if (sid) filters.push(eq(inventoryItems.stockStatusId, sid));
    }
    if (query.categoryCode) {
      const categoryId = await lookupIdByCode(this.db, productCategories, query.categoryCode);
      filters.push(categoryId ? eq(productModels.categoryId, categoryId) : sql`false`);
    }
    filters.push(resourceDivisionFilter(actor, 'inventory', inventoryItems.divisionId) ?? sql`true`);

    const rows = await this.db
      .select({
        item: inventoryItems,
        product: { id: productModels.id, fullName: productModels.fullName, modelCode: productModels.modelCode },
        brand: { name: brands.name },
        status: { name: inventoryStatuses.name },
        locationStatus: { name: stockLocationStatuses.name },
        warehouse: { name: warehouses.name },
        reservedCompany: { legalTitle: companies.legalTitle, shortName: companies.shortName },
      })
      .from(inventoryItems)
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(inventoryStatuses, eq(inventoryItems.stockStatusId, inventoryStatuses.id))
      .leftJoin(stockLocationStatuses, eq(inventoryItems.locationStatusId, stockLocationStatuses.id))
      .leftJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
      .leftJoin(companies, eq(inventoryItems.reservedCompanyId, companies.id))
      .where(and(...filters))
      .orderBy(desc(inventoryItems.createdAt))
      .limit(EXPORT_LIMIT);

    const productIds = Array.from(new Set(rows.map((row) => row.product?.id).filter((id): id is string => Boolean(id))));
    const specs = productIds.length
      ? await this.db
          .select({
            productModelId: productSpecs.productModelId,
            key: productSpecs.specKey,
            value: productSpecs.specValue,
            unit: productSpecs.specUnit,
          })
          .from(productSpecs)
          .where(and(
            eq(productSpecs.tenantId, actor.tenantId),
            inArray(productSpecs.productModelId, productIds),
            isNull(productSpecs.deletedAt),
          ))
      : [];
    const normalizedSpecKey = (value: string) =>
      value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const specFor = (productModelId: string | null | undefined, keywords: string[]) => {
      if (!productModelId) return '';
      const normalizedKeywords = keywords.map(normalizedSpecKey);
      const spec = specs.find((item) => (
        item.productModelId === productModelId
        && normalizedKeywords.some((keyword) => normalizedSpecKey(item.key).includes(keyword))
      ));
      return spec ? `${spec.value}${spec.unit ? ` ${spec.unit}` : ''}` : '';
    };

    return rows.map((r) => ({
      Marka: r.brand?.name ?? '',
      'Yeni / Kullanılmış': r.item.itemCondition === 'used' ? 'Kullanılmış' : 'Yeni',
      'Ürün Adı': r.product?.fullName ?? r.product?.modelCode ?? '',
      'Seri No': r.item.serialNumber ?? '',
      'Kontrol Ünitesi': r.item.controlUnit ?? '',
      'Fener Mili Devri': specFor(r.product?.id, ['fener mili devri', 'spindle speed']),
      'Takım Adeti': specFor(r.product?.id, ['takim adeti', 'takim kapasitesi', 'takim yuvasi sayisi', 'tool count', 'tool capacity']),
      'Fener Mili Motor Gücü': specFor(r.product?.id, ['fener mili motor gucu', 'spindle motor power']),
      'Ürünün Bulunduğu Yer': [r.warehouse?.name, r.locationStatus?.name].filter(Boolean).join(' · '),
      'Rezerve Edilen Firma': r.reservedCompany?.shortName ?? r.reservedCompany?.legalTitle ?? '',
      'Yüklendiği Tarih': isoDate(r.item.loadingDate),
      'Geldiği Tarih': isoDate(r.item.receivedDate),
      'Geleceği Tarih': isoDate(r.item.arrivalDate),
      Durum: r.status?.name ?? '',
    }));
  }

  async exportShipments(actor: AuthContext): Promise<ExportRow[]> {
    const rows = await this.db
      .select({
        shipment: shipments,
        company: { legalTitle: companies.legalTitle },
        status: { name: shipmentStatuses.name },
      })
      .from(shipments)
      .leftJoin(companies, eq(shipments.companyId, companies.id))
      .leftJoin(shipmentStatuses, eq(shipments.statusId, shipmentStatuses.id))
      .where(and(eq(shipments.tenantId, actor.tenantId), isNull(shipments.deletedAt), resourceDivisionFilter(actor, 'shipments', shipments.divisionId) ?? sql`true`))
      .orderBy(desc(shipments.createdAt))
      .limit(EXPORT_LIMIT);

    return rows.map((r) => ({
      'Takip No': r.shipment.trackingNo ?? '',
      Taşıyıcı: r.shipment.carrier ?? '',
      Çıkış: r.shipment.origin ?? '',
      Varış: r.shipment.destination ?? '',
      Müşteri: r.company?.legalTitle ?? '',
      Durum: r.status?.name ?? '',
      ETA: isoDate(r.shipment.eta),
    }));
  }

  async exportDeliveries(actor: AuthContext): Promise<ExportRow[]> {
    const rows = await this.db
      .select({
        delivery: deliveries,
        company: { legalTitle: companies.legalTitle },
      })
      .from(deliveries)
      .leftJoin(companies, eq(deliveries.companyId, companies.id))
      .where(and(eq(deliveries.tenantId, actor.tenantId), isNull(deliveries.deletedAt), resourceDivisionFilter(actor, 'shipments', deliveries.divisionId) ?? sql`true`))
      .orderBy(desc(deliveries.createdAt))
      .limit(EXPORT_LIMIT);

    return rows.map((r) => ({
      Müşteri: r.company?.legalTitle ?? '',
      Tarih: isoDate(r.delivery.deliveryDate),
      'Teslim Alan': r.delivery.signedBy ?? '',
      Durum: r.delivery.status,
    }));
  }

  async exportPurchaseOrders(
    actor: AuthContext,
    query: { search?: string; supplierCompanyId?: string; statusCode?: string }
  ): Promise<ExportRow[]> {
    const filters = [eq(purchaseOrders.tenantId, actor.tenantId), isNull(purchaseOrders.deletedAt)];
    if (query.search) filters.push(ilike(purchaseOrders.orderNo, `%${query.search}%`));
    if (query.supplierCompanyId) filters.push(eq(purchaseOrders.supplierCompanyId, query.supplierCompanyId));
    if (query.statusCode) {
      const statusId = await lookupIdByCode(this.db, purchaseOrderStatuses, query.statusCode);
      if (statusId) filters.push(eq(purchaseOrders.statusId, statusId));
    }
    filters.push(resourceDivisionFilter(actor, 'purchase_orders', purchaseOrders.divisionId) ?? sql`true`);

    const rows = await this.db
      .select({
        order: purchaseOrders,
        supplier: { legalTitle: companies.legalTitle },
        status: { name: purchaseOrderStatuses.name },
        currency: { code: currencies.code },
      })
      .from(purchaseOrders)
      .leftJoin(companies, eq(purchaseOrders.supplierCompanyId, companies.id))
      .leftJoin(purchaseOrderStatuses, eq(purchaseOrders.statusId, purchaseOrderStatuses.id))
      .leftJoin(currencies, eq(purchaseOrders.currencyId, currencies.id))
      .where(and(...filters))
      .orderBy(desc(purchaseOrders.orderDate))
      .limit(EXPORT_LIMIT);

    return rows.map((r) => ({
      Sipariş: r.order.orderNo ?? '',
      Tedarikçi: r.supplier?.legalTitle ?? '',
      'Ödeme Tipi': r.order.paymentType ?? '',
      'Yeni Vade (Gün)': r.order.paymentTermDays ?? '',
      'Önceki Vade (Gün)': r.order.previousPaymentTermDays ?? '',
      Tarih: isoDate(r.order.orderDate),
      ETA: isoDate(r.order.expectedDate),
      'Ara Toplam': r.order.subtotal ?? '',
      KDV: r.order.vatAmount ?? '',
      'Son Tutar': r.order.grandTotal ?? '',
      'Para Birimi': r.currency?.code ?? '',
      Durum: r.status?.name ?? '',
      'Onay Nedeni': r.order.approvalReason ?? '',
    }));
  }

  async exportDocuments(actor: AuthContext): Promise<ExportRow[]> {
    const rows = await this.db
      .select({
        file: files,
        link: fileLinks,
        docType: { name: fileDocumentTypes.name },
        uploader: { fullName: users.fullName },
      })
      .from(fileLinks)
      .innerJoin(files, eq(fileLinks.fileId, files.id))
      .leftJoin(fileDocumentTypes, eq(fileLinks.documentTypeId, fileDocumentTypes.id))
      .leftJoin(users, eq(files.uploadedBy, users.id))
      .where(and(eq(fileLinks.tenantId, actor.tenantId), isNull(files.deletedAt)))
      .orderBy(desc(files.createdAt))
      .limit(EXPORT_LIMIT);

    const visibleRows = [];
    for (const row of rows) {
      if (await this.canExportDocumentLink(row.link, actor)) visibleRows.push(row);
    }

    return visibleRows.map((r) => ({
      Dosya: r.file.originalFilename,
      Tip: r.docType?.name ?? r.file.extension,
      'Bağlı Kayıt': `${r.link.entityType}:${r.link.entityId}`,
      Boyut: r.file.sizeBytes,
      Yükleyen: r.uploader?.fullName ?? '',
      Tarih: isoDate(r.file.createdAt),
    }));
  }

  /** Operasyonel özet — aylık veya yıllık teklif/satış/servis KPI'ları. */
  async exportOperational(actor: AuthContext, year: number, period: 'monthly' | 'yearly'): Promise<ExportRow[]> {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const tenant = eq(opportunities.tenantId, actor.tenantId);
    const opportunityScope = resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`;
    const quoteScope = resourceDivisionFilter(actor, 'quotes', quotes.divisionId) ?? sql`true`;
    const serviceScope = resourceDivisionFilter(actor, 'service_tickets', serviceTickets.divisionId) ?? sql`true`;
    const isWon = sql`${pipelineStages.code} in ('contract','commercial_invoice','customs_approved','stock_picking','shipping','installation','delivered')`;
    const isLost = sql`${pipelineStages.code} = 'cancelled'`;

    if (period === 'monthly') {
      const months = Array.from({ length: 12 }, (_, i) => i + 1);
      const out: ExportRow[] = [];
      for (const m of months) {
        const mFrom = new Date(Date.UTC(year, m - 1, 1));
        const mTo = new Date(Date.UTC(year, m, 0, 23, 59, 59));
        const [opp] = await this.db
          .select({
            won: sql<number>`count(*) filter (where ${isWon})::int`,
            lost: sql<number>`count(*) filter (where ${isLost})::int`,
            wonValue: sql<string>`coalesce(sum(${opportunities.estimatedValue}) filter (where ${isWon}), 0)::text`,
          })
          .from(opportunities)
          .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
          .where(and(tenant, isNull(opportunities.deletedAt), opportunityScope, gte(opportunities.createdAt, mFrom), lte(opportunities.createdAt, mTo)));

        const [qc] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(quotes)
          .where(and(eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt), quoteScope, gte(quotes.quoteDate, mFrom), lte(quotes.quoteDate, mTo)));

        const [sc] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(serviceTickets)
          .where(
            and(
              eq(serviceTickets.tenantId, actor.tenantId),
              isNull(serviceTickets.deletedAt),
              serviceScope,
              gte(serviceTickets.reportedAt, mFrom),
              lte(serviceTickets.reportedAt, mTo)
            )
          );

        out.push({
          Dönem: `${year}-${String(m).padStart(2, '0')}`,
          Teklif: qc?.count ?? 0,
          Kazanılan: opp?.won ?? 0,
          Kaybedilen: opp?.lost ?? 0,
          Servis: sc?.count ?? 0,
          Ciro: opp?.wonValue ?? '0',
        });
      }
      return out;
    }

    const years = await this.db
      .select({ y: sql<number>`distinct extract(year from ${opportunities.createdAt})::int` })
      .from(opportunities)
      .where(and(tenant, isNull(opportunities.deletedAt), opportunityScope))
      .orderBy(sql`1`);

    const yearList = years.map((r) => r.y).filter((y) => y > 0);
    const out: ExportRow[] = [];
    for (const y of yearList.length ? yearList : [year]) {
      const yFrom = new Date(Date.UTC(y, 0, 1));
      const yTo = new Date(Date.UTC(y, 11, 31, 23, 59, 59));
      const [opp] = await this.db
        .select({
          won: sql<number>`count(*) filter (where ${isWon})::int`,
          lost: sql<number>`count(*) filter (where ${isLost})::int`,
          wonValue: sql<string>`coalesce(sum(${opportunities.estimatedValue}) filter (where ${isWon}), 0)::text`,
        })
        .from(opportunities)
        .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
        .where(and(tenant, isNull(opportunities.deletedAt), opportunityScope, gte(opportunities.createdAt, yFrom), lte(opportunities.createdAt, yTo)));

      const [qc] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(quotes)
        .where(and(eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt), quoteScope, gte(quotes.quoteDate, yFrom), lte(quotes.quoteDate, yTo)));

      const [sc] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(serviceTickets)
        .where(
          and(
            eq(serviceTickets.tenantId, actor.tenantId),
            isNull(serviceTickets.deletedAt),
            serviceScope,
            gte(serviceTickets.reportedAt, yFrom),
            lte(serviceTickets.reportedAt, yTo)
          )
        );

      out.push({
        Yıl: y,
        Teklif: qc?.count ?? 0,
        Kazanılan: opp?.won ?? 0,
        Kaybedilen: opp?.lost ?? 0,
        Servis: sc?.count ?? 0,
        Ciro: opp?.wonValue ?? '0',
      });
    }
    return out;
  }
}
