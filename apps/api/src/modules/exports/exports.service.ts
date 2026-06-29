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
import { companies, companyAddresses, companyEmails, companyPhones, contacts } from '../../db/schema/companies';
import { opportunities } from '../../db/schema/crm';
import { files, fileLinks } from '../../db/schema/files';
import { receivables, payments } from '../../db/schema/finance';
import { customerDevices, inventoryItems } from '../../db/schema/inventory';
import { purchaseOrders } from '../../db/schema/orders';
import { productModels, brands } from '../../db/schema/products';
import { quotes } from '../../db/schema/quotes';
import { deliveries, serviceComplaintIntakes, serviceTickets, shipments } from '../../db/schema/service';
import {
  companyRelationTypes,
  companyStatuses,
  currencies,
  fileDocumentTypes,
  inventoryStatuses,
  paymentStatuses,
  pipelineStages,
  purchaseOrderStatuses,
  quoteStatuses,
  serviceTicketStatuses,
  shipmentStatuses,
} from '../../db/schema/lookup';
import { users } from '../../db/schema/users';
import { warehouses } from '../../db/schema/inventory';
import { DB } from '../../shared/database/database.module';
import type { AuthContext } from '../../shared/security/auth.types';
import { isoDate, type ExportRow } from '../../shared/utils/excel-export';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { FinanceService } from '../finance/finance.service';
import type { DateRange } from '@haksan/shared';
import { divisionFilter, resolveActorDivisionScope } from '../../shared/utils/division-scope';

const EXPORT_LIMIT = 15_000;

@Injectable()
export class ExportsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly finance: FinanceService
  ) {}

  async exportCompanies(
    actor: AuthContext,
    query: { search?: string; relationTypeCode?: string; customerStatusCode?: string }
  ): Promise<ExportRow[]> {
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

    const rows = await this.db
      .select({
        company: companies,
        relationType: { name: companyRelationTypes.name },
        customerStatus: { name: companyStatuses.name },
      })
      .from(companies)
      .leftJoin(companyRelationTypes, eq(companies.relationTypeId, companyRelationTypes.id))
      .leftJoin(companyStatuses, eq(companies.customerStatusId, companyStatuses.id))
      .where(and(...filters))
      .orderBy(desc(companies.createdAt))
      .limit(EXPORT_LIMIT);

    const companyIds = rows.map((r) => r.company.id);
    const [addresses, phones, emails] = companyIds.length
      ? await Promise.all([
          this.db.select().from(companyAddresses).where(inArray(companyAddresses.companyId, companyIds)),
          this.db.select().from(companyPhones).where(inArray(companyPhones.companyId, companyIds)),
          this.db.select().from(companyEmails).where(inArray(companyEmails.companyId, companyIds)),
        ])
      : [[], [], []];

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
        Firma: r.company.legalTitle,
        'Kısa Ad': r.company.shortName ?? '',
        Tip: r.relationType?.name ?? '',
        'Müşteri Statüsü': r.customerStatus?.name ?? '',
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
    if (query.search) filters.push(ilike(contacts.fullName, `%${query.search}%`));

    const rows = await this.db
      .select({
        contact: contacts,
        company: { legalTitle: companies.legalTitle },
      })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(and(...filters))
      .orderBy(desc(contacts.createdAt))
      .limit(EXPORT_LIMIT);

    return rows.map((r) => ({
      'Ad Soyad': r.contact.fullName,
      Ünvan: r.contact.title ?? '',
      Departman: r.contact.department ?? '',
      Firma: r.company?.legalTitle ?? '',
      Telefon: r.contact.workPhone ?? '',
      Cep: r.contact.mobilePhone ?? '',
      'E-posta': r.contact.workEmail ?? r.contact.personalEmail ?? '',
      Birincil: r.contact.isPrimary ? 'Evet' : 'Hayır',
    }));
  }

  async exportOpportunities(
    actor: AuthContext,
    query: { search?: string; stageCode?: string; companyId?: string }
  ): Promise<ExportRow[]> {
    const filters = [eq(opportunities.tenantId, actor.tenantId), isNull(opportunities.deletedAt)];
    if (query.search) filters.push(ilike(opportunities.title, `%${query.search}%`));
    if (query.companyId) filters.push(eq(opportunities.companyId, query.companyId));
    if (query.stageCode) {
      const stage = await this.db.query.pipelineStages.findFirst({ where: eq(pipelineStages.code, query.stageCode) });
      if (stage) filters.push(eq(opportunities.currentStageId, stage.id));
    }

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
      Müşteri: r.company?.legalTitle ?? '',
      Başlık: r.opp.title,
      Tutar: r.opp.estimatedValue ?? '',
      'Para Birimi': r.currency?.code ?? '',
      Aşama: r.stage?.name ?? '',
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
      .where(and(eq(payments.tenantId, actor.tenantId), isNull(payments.deletedAt)))
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
      .where(and(eq(receivables.tenantId, actor.tenantId), isNull(receivables.deletedAt)))
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

  async exportCustomerBalances(actor: AuthContext): Promise<ExportRow[]> {
    const rows = await this.finance.getCustomerBalances(actor);
    const showAlacak = this.finance.isFinanceAdmin(actor);
    return rows.map((r) => {
      const cur = r.currencies[0];
      const base: ExportRow = {
        Firma: r.companyName,
        Satış: cur?.salesTotal ?? r.salesTotal ?? 0,
        Tahsilat: cur?.collections ?? r.collections ?? 0,
        Borç: cur?.borc ?? r.borc,
        'Para Birimi': cur?.currencyCode ?? r.primaryCurrency ?? '',
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
    const rows = await this.db
      .select({
        ticket: serviceTickets,
        company: { legalTitle: companies.legalTitle },
        status: { name: serviceTicketStatuses.name },
      })
      .from(serviceTickets)
      .leftJoin(companies, eq(serviceTickets.companyId, companies.id))
      .leftJoin(serviceTicketStatuses, eq(serviceTickets.statusId, serviceTicketStatuses.id))
      .where(and(eq(serviceTickets.tenantId, actor.tenantId), isNull(serviceTickets.deletedAt)))
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
          divisionFilter(resolveActorDivisionScope(actor), serviceComplaintIntakes.divisionId) ?? sql`true`
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
    query: { search?: string; statusCode?: string }
  ): Promise<ExportRow[]> {
    const filters = [eq(inventoryItems.tenantId, actor.tenantId), isNull(inventoryItems.deletedAt)];
    if (query.search) {
      filters.push(ilike(inventoryItems.serialNumber, `%${query.search}%`));
    }
    if (query.statusCode) {
      const sid = await lookupIdByCode(this.db, inventoryStatuses, query.statusCode);
      if (sid) filters.push(eq(inventoryItems.stockStatusId, sid));
    }

    const rows = await this.db
      .select({
        item: inventoryItems,
        product: { fullName: productModels.fullName, modelCode: productModels.modelCode },
        brand: { name: brands.name },
        status: { name: inventoryStatuses.name },
        warehouse: { name: warehouses.name },
      })
      .from(inventoryItems)
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(inventoryStatuses, eq(inventoryItems.stockStatusId, inventoryStatuses.id))
      .leftJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
      .where(and(...filters))
      .orderBy(desc(inventoryItems.createdAt))
      .limit(EXPORT_LIMIT);

    return rows.map((r) => ({
      'Stok Kodu': r.product?.modelCode ?? r.item.serialNumber,
      Marka: r.brand?.name ?? '',
      Model: r.product?.fullName ?? r.product?.modelCode ?? '',
      'Seri No': r.item.serialNumber ?? '',
      'Kontrol Ünitesi': r.item.controlUnit ?? '',
      Depo: r.warehouse?.name ?? '',
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
      .where(and(eq(shipments.tenantId, actor.tenantId), isNull(shipments.deletedAt)))
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
      .where(and(eq(deliveries.tenantId, actor.tenantId), isNull(deliveries.deletedAt)))
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

    return rows.map((r) => ({
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
          .where(and(tenant, isNull(opportunities.deletedAt), gte(opportunities.createdAt, mFrom), lte(opportunities.createdAt, mTo)));

        const [qc] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(quotes)
          .where(
            and(eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt), gte(quotes.quoteDate, mFrom), lte(quotes.quoteDate, mTo))
          );

        const [sc] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(serviceTickets)
          .where(
            and(
              eq(serviceTickets.tenantId, actor.tenantId),
              isNull(serviceTickets.deletedAt),
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
      .where(and(tenant, isNull(opportunities.deletedAt)))
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
        .where(and(tenant, isNull(opportunities.deletedAt), gte(opportunities.createdAt, yFrom), lte(opportunities.createdAt, yTo)));

      const [qc] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(quotes)
        .where(and(eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt), gte(quotes.quoteDate, yFrom), lte(quotes.quoteDate, yTo)));

      const [sc] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(serviceTickets)
        .where(
          and(
            eq(serviceTickets.tenantId, actor.tenantId),
            isNull(serviceTickets.deletedAt),
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
