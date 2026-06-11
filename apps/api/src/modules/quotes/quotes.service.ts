import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { quotes, quoteItems, quoteTerms, proformas, contracts, commercialInvoices } from '../../db/schema/quotes';
import { companies } from '../../db/schema/companies';
import { currencies, units, quoteStatuses, proformaStatuses, contractStatuses, invoiceStatuses } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type {
  CommercialInvoiceCreateInput,
  CommercialInvoiceUpdateInput,
  ContractCreateInput,
  ContractUpdateInput,
  Pagination,
  ProformaCreateInput,
  ProformaUpdateInput,
  QuoteCreateInput,
  QuoteItemCreateInput,
  QuoteItemUpdateInput,
  QuoteTermsUpsertInput,
  QuoteUpdateInput,
} from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { AuditService } from '../../shared/database/audit.service';

interface ItemTotals {
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
}

@Injectable()
export class QuotesService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  private calcItem(qty: number, unitPrice: number, discount: number, vatRate: number): ItemTotals & { lineTotal: number; vatAmount: number } {
    const gross = qty * unitPrice;
    const subtotal = gross - discount;
    const vat = subtotal * (vatRate / 100);
    const total = subtotal + vat;
    return { subtotal, discount, vat, total, lineTotal: subtotal, vatAmount: vat };
  }

  private async recalcQuoteTotals(quoteId: string) {
    const items = await this.db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
    let subtotal = 0;
    let discount = 0;
    let vat = 0;
    for (const it of items) {
      const t = this.calcItem(Number(it.quantity), Number(it.unitPrice), Number(it.discountAmount), Number(it.vatRate));
      subtotal += t.subtotal + t.discount; // gross
      discount += t.discount;
      vat += t.vat;
    }
    const grand = subtotal - discount + vat;
    await this.db
      .update(quotes)
      .set({
        subtotal: (subtotal - discount).toFixed(4),
        discountTotal: discount.toFixed(4),
        vatAmount: vat.toFixed(4),
        grandTotal: grand.toFixed(4),
      })
      .where(eq(quotes.id, quoteId));
  }

  private async nextDocumentNo(actor: AuthContext): Promise<string> {
    const year = new Date().getUTCFullYear();
    // count of current-year quotes; cheap & sufficient for MVP
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(quotes)
      .where(and(eq(quotes.tenantId, actor.tenantId), sql`extract(year from ${quotes.quoteDate}) = ${year}`));
    const next = (row?.c ?? 0) + 1;
    return `${year}/${String(next).padStart(3, '0')}`;
  }

  async list(actor: AuthContext, query: { search?: string; statusCode?: string; companyId?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt)];
    if (query.search) filters.push(ilike(quotes.documentNo, `%${query.search}%`));
    if (query.companyId) filters.push(eq(quotes.companyId, query.companyId));
    if (query.statusCode) {
      const sid = await lookupIdByCode(this.db, quoteStatuses, query.statusCode);
      if (sid) filters.push(eq(quotes.statusId, sid));
    }
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(quotes).where(where);
    const rows = await this.db
      .select({
        quote: quotes,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        status: { id: quoteStatuses.id, code: quoteStatuses.code, name: quoteStatuses.name },
        currency: { id: currencies.id, code: currencies.code },
      })
      .from(quotes)
      .leftJoin(companies, eq(quotes.companyId, companies.id))
      .leftJoin(quoteStatuses, eq(quotes.statusId, quoteStatuses.id))
      .leftJoin(currencies, eq(quotes.currencyId, currencies.id))
      .where(where)
      .orderBy(desc(quotes.quoteDate))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({ ...r.quote, company: r.company, status: r.status, currency: r.currency })),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, id), eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt)),
    });
    if (!quote) throw new NotFoundError('Teklif');
    const items = await this.db.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
    const terms = await this.db.query.quoteTerms.findFirst({ where: eq(quoteTerms.quoteId, id) });
    return { ...quote, items, terms };
  }

  async create(input: QuoteCreateInput, actor: AuthContext) {
    const documentNo = input.documentNo?.trim() || (await this.nextDocumentNo(actor));
    const existing = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.tenantId, actor.tenantId), eq(quotes.documentNo, documentNo)),
    });
    if (existing) throw new ConflictError('Bu doküman numarası zaten kullanılıyor');
    const draft = await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.code, 'draft') });
    const currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    const [row] = await this.db
      .insert(quotes)
      .values({
        tenantId: actor.tenantId,
        opportunityId: input.opportunityId ?? null,
        companyId: input.companyId,
        contactId: input.contactId ?? null,
        documentNo,
        quoteDate: input.quoteDate,
        validityDays: input.validityDays,
        projectOwnerUserId: input.projectOwnerUserId ?? actor.userId,
        currencyId,
        paymentTerms: input.paymentTerms ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        warrantyTerms: input.warrantyTerms ?? null,
        notes: input.notes ?? null,
        statusId: draft?.id ?? null,
        createdBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'quote.created',
      resourceType: 'quote',
      resourceId: row.id,
      newValues: { documentNo: row.documentNo, companyId: row.companyId },
    });
    return this.get(row.id, actor);
  }

  async update(id: string, input: QuoteUpdateInput, actor: AuthContext) {
    await this.get(id, actor);
    const patch: Record<string, unknown> = {};
    if (input.currencyCode !== undefined) patch.currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    for (const k of ['opportunityId', 'companyId', 'contactId', 'documentNo', 'quoteDate', 'validityDays', 'projectOwnerUserId', 'paymentTerms', 'deliveryTerms', 'warrantyTerms', 'notes'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    await this.db.update(quotes).set(patch).where(eq(quotes.id, id));
    return this.get(id, actor);
  }

  async delete(id: string, actor: AuthContext) {
    await this.get(id, actor);
    await this.db.update(quotes).set({ deletedAt: new Date() }).where(eq(quotes.id, id));
    return { ok: true };
  }

  // ────────── ITEMS ──────────
  async addItem(quoteId: string, input: QuoteItemCreateInput, actor: AuthContext) {
    await this.get(quoteId, actor);
    const t = this.calcItem(input.quantity, input.unitPrice, input.discountAmount, input.vatRate);
    const unitId = await lookupIdByCode(this.db, units, input.unitCode);
    const [row] = await this.db
      .insert(quoteItems)
      .values({
        tenantId: actor.tenantId,
        quoteId,
        productModelId: input.productModelId ?? null,
        inventoryItemId: input.inventoryItemId ?? null,
        description: input.description,
        quantity: input.quantity.toString(),
        unitId,
        unitPrice: input.unitPrice.toString(),
        discountAmount: input.discountAmount.toString(),
        vatRate: input.vatRate.toString(),
        vatAmount: t.vatAmount.toFixed(4),
        lineTotal: t.lineTotal.toFixed(4),
        sortOrder: input.sortOrder,
        compatibility: input.compatibility ?? null,
      })
      .returning();
    await this.recalcQuoteTotals(quoteId);
    return row;
  }

  async updateItem(quoteId: string, itemId: string, input: QuoteItemUpdateInput, actor: AuthContext) {
    const existing = await this.db.query.quoteItems.findFirst({
      where: and(eq(quoteItems.id, itemId), eq(quoteItems.quoteId, quoteId), eq(quoteItems.tenantId, actor.tenantId)),
    });
    if (!existing) throw new NotFoundError('Kalem');
    const patch: Record<string, unknown> = {};
    for (const k of ['productModelId', 'inventoryItemId', 'description', 'sortOrder'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    for (const k of ['quantity', 'unitPrice', 'discountAmount', 'vatRate'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = ((input as any)[k] as number | undefined)?.toString();
    }
    if (input.unitCode !== undefined) patch.unitId = await lookupIdByCode(this.db, units, input.unitCode);

    // Recalc line totals
    const quantity = Number(patch.quantity ?? existing.quantity);
    const unitPrice = Number(patch.unitPrice ?? existing.unitPrice);
    const discountAmount = Number(patch.discountAmount ?? existing.discountAmount);
    const vatRate = Number(patch.vatRate ?? existing.vatRate);
    const t = this.calcItem(quantity, unitPrice, discountAmount, vatRate);
    patch.lineTotal = t.lineTotal.toFixed(4);
    patch.vatAmount = t.vatAmount.toFixed(4);

    await this.db.update(quoteItems).set(patch).where(eq(quoteItems.id, itemId));
    await this.recalcQuoteTotals(quoteId);
    return { ok: true };
  }

  async deleteItem(quoteId: string, itemId: string, actor: AuthContext) {
    const existing = await this.db.query.quoteItems.findFirst({
      where: and(eq(quoteItems.id, itemId), eq(quoteItems.quoteId, quoteId), eq(quoteItems.tenantId, actor.tenantId)),
    });
    if (!existing) throw new NotFoundError('Kalem');
    await this.db.update(quoteItems).set({ deletedAt: new Date() }).where(eq(quoteItems.id, itemId));
    await this.recalcQuoteTotals(quoteId);
    return { ok: true };
  }

  // ────────── TERMS ──────────
  async upsertTerms(quoteId: string, input: QuoteTermsUpsertInput, actor: AuthContext) {
    await this.get(quoteId, actor);
    const existing = await this.db.query.quoteTerms.findFirst({ where: eq(quoteTerms.quoteId, quoteId) });
    if (existing) {
      await this.db
        .update(quoteTerms)
        .set({
          paymentTermsText: input.paymentTermsText ?? null,
          deliveryTermsText: input.deliveryTermsText ?? null,
          warrantyTermsText: input.warrantyTermsText ?? null,
          importCostsExcluded: input.importCostsExcluded,
          deliveryLocation: input.deliveryLocation ?? null,
          estimatedDeliveryDaysMin: input.estimatedDeliveryDaysMin ?? null,
          estimatedDeliveryDaysMax: input.estimatedDeliveryDaysMax ?? null,
        })
        .where(eq(quoteTerms.id, existing.id));
    } else {
      await this.db.insert(quoteTerms).values({
        tenantId: actor.tenantId,
        quoteId,
        paymentTermsText: input.paymentTermsText ?? null,
        deliveryTermsText: input.deliveryTermsText ?? null,
        warrantyTermsText: input.warrantyTermsText ?? null,
        importCostsExcluded: input.importCostsExcluded,
        deliveryLocation: input.deliveryLocation ?? null,
        estimatedDeliveryDaysMin: input.estimatedDeliveryDaysMin ?? null,
        estimatedDeliveryDaysMax: input.estimatedDeliveryDaysMax ?? null,
      });
    }
    return this.get(quoteId, actor);
  }

  // ────────── APPROVE / REJECT / SEND ──────────
  async approve(quoteId: string, actor: AuthContext) {
    const quote = await this.get(quoteId, actor);
    const status = await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.code, 'approved') });
    await this.db
      .update(quotes)
      .set({ statusId: status?.id ?? null, approvedBy: actor.userId, approvedAt: new Date() })
      .where(eq(quotes.id, quoteId));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'quote.approved',
      resourceType: 'quote',
      resourceId: quoteId,
    });
    return { ok: true };
  }

  async reject(quoteId: string, actor: AuthContext) {
    await this.get(quoteId, actor);
    const status = await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.code, 'rejected') });
    await this.db
      .update(quotes)
      .set({ statusId: status?.id ?? null, rejectedAt: new Date() })
      .where(eq(quotes.id, quoteId));
    return { ok: true };
  }

  async send(quoteId: string, actor: AuthContext) {
    await this.get(quoteId, actor);
    const status = await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.code, 'sent') });
    await this.db.update(quotes).set({ statusId: status?.id ?? null, sentAt: new Date() }).where(eq(quotes.id, quoteId));
    return { ok: true };
  }

  // ────────── PROFORMA / CONTRACT / COMMERCIAL INVOICE ──────────
  async listProformas(actor: AuthContext, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const where = and(eq(proformas.tenantId, actor.tenantId), isNull(proformas.deletedAt));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(proformas).where(where);
    const rows = await this.db
      .select({
        proforma: proformas,
        quote: { id: quotes.id, documentNo: quotes.documentNo, companyId: quotes.companyId, opportunityId: quotes.opportunityId },
        status: { id: proformaStatuses.id, code: proformaStatuses.code, name: proformaStatuses.name },
      })
      .from(proformas)
      .leftJoin(quotes, eq(proformas.quoteId, quotes.id))
      .leftJoin(proformaStatuses, eq(proformas.statusId, proformaStatuses.id))
      .where(where)
      .orderBy(desc(proformas.issueDate))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows.map((r) => ({ ...r.proforma, quote: r.quote, status: r.status })), count, page);
  }

  async createProforma(input: ProformaCreateInput, actor: AuthContext) {
    await this.get(input.quoteId, actor);
    const statusId = await lookupIdByCode(this.db, proformaStatuses, input.statusCode);
    const [row] = await this.db
      .insert(proformas)
      .values({
        tenantId: actor.tenantId,
        quoteId: input.quoteId,
        documentNo: input.documentNo,
        issueDate: input.issueDate,
        statusId,
        fileId: input.fileId ?? null,
        createdBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'proforma.created',
      resourceType: 'proforma',
      resourceId: row.id,
      newValues: { documentNo: row.documentNo, quoteId: row.quoteId },
    });
    return row;
  }

  async updateProforma(id: string, input: ProformaUpdateInput, actor: AuthContext) {
    const existing = await this.getProforma(id, actor);
    const patch: Record<string, unknown> = {};
    if (input.quoteId !== undefined) {
      await this.get(input.quoteId, actor);
      patch.quoteId = input.quoteId;
    }
    if (input.statusCode !== undefined) patch.statusId = await lookupIdByCode(this.db, proformaStatuses, input.statusCode);
    for (const k of ['documentNo', 'issueDate', 'fileId'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    await this.db.update(proformas).set(patch).where(eq(proformas.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'proforma.updated',
      resourceType: 'proforma',
      resourceId: id,
      oldValues: existing,
      newValues: patch,
    });
    return this.getProforma(id, actor);
  }

  async listContracts(actor: AuthContext, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const where = and(eq(contracts.tenantId, actor.tenantId), isNull(contracts.deletedAt));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(contracts).where(where);
    const rows = await this.db
      .select({
        contract: contracts,
        quote: { id: quotes.id, documentNo: quotes.documentNo, companyId: quotes.companyId, opportunityId: quotes.opportunityId },
        status: { id: contractStatuses.id, code: contractStatuses.code, name: contractStatuses.name },
      })
      .from(contracts)
      .leftJoin(quotes, eq(contracts.quoteId, quotes.id))
      .leftJoin(contractStatuses, eq(contracts.statusId, contractStatuses.id))
      .where(where)
      .orderBy(desc(contracts.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows.map((r) => ({ ...r.contract, quote: r.quote, status: r.status })), count, page);
  }

  async createContract(input: ContractCreateInput, actor: AuthContext) {
    await this.get(input.quoteId, actor);
    const statusId = await lookupIdByCode(this.db, contractStatuses, input.statusCode);
    const [row] = await this.db
      .insert(contracts)
      .values({
        tenantId: actor.tenantId,
        quoteId: input.quoteId,
        contractNo: input.contractNo,
        signedDate: input.signedDate ?? null,
        statusId,
        fileId: input.fileId ?? null,
        createdBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'contract.created',
      resourceType: 'contract',
      resourceId: row.id,
      newValues: { contractNo: row.contractNo, quoteId: row.quoteId },
    });
    return row;
  }

  async updateContract(id: string, input: ContractUpdateInput, actor: AuthContext) {
    const existing = await this.getContract(id, actor);
    const patch: Record<string, unknown> = {};
    if (input.quoteId !== undefined) {
      await this.get(input.quoteId, actor);
      patch.quoteId = input.quoteId;
    }
    if (input.statusCode !== undefined) patch.statusId = await lookupIdByCode(this.db, contractStatuses, input.statusCode);
    for (const k of ['contractNo', 'signedDate', 'fileId'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    await this.db.update(contracts).set(patch).where(eq(contracts.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'contract.updated',
      resourceType: 'contract',
      resourceId: id,
      oldValues: existing,
      newValues: patch,
    });
    return this.getContract(id, actor);
  }

  async listCommercialInvoices(actor: AuthContext, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const where = and(eq(commercialInvoices.tenantId, actor.tenantId), isNull(commercialInvoices.deletedAt));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(commercialInvoices).where(where);
    const rows = await this.db
      .select({
        invoice: commercialInvoices,
        quote: { id: quotes.id, documentNo: quotes.documentNo, companyId: quotes.companyId, opportunityId: quotes.opportunityId },
        status: { id: invoiceStatuses.id, code: invoiceStatuses.code, name: invoiceStatuses.name },
      })
      .from(commercialInvoices)
      .leftJoin(quotes, eq(commercialInvoices.quoteId, quotes.id))
      .leftJoin(invoiceStatuses, eq(commercialInvoices.statusId, invoiceStatuses.id))
      .where(where)
      .orderBy(desc(commercialInvoices.invoiceDate))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows.map((r) => ({ ...r.invoice, quote: r.quote, status: r.status })), count, page);
  }

  async createCommercialInvoice(input: CommercialInvoiceCreateInput, actor: AuthContext) {
    await this.get(input.quoteId, actor);
    const statusId = await lookupIdByCode(this.db, invoiceStatuses, input.statusCode);
    const [row] = await this.db
      .insert(commercialInvoices)
      .values({
        tenantId: actor.tenantId,
        quoteId: input.quoteId,
        invoiceNo: input.invoiceNo,
        invoiceDate: input.invoiceDate,
        statusId,
        fileId: input.fileId ?? null,
        createdBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'commercial_invoice.created',
      resourceType: 'commercial_invoice',
      resourceId: row.id,
      newValues: { invoiceNo: row.invoiceNo, quoteId: row.quoteId },
    });
    return row;
  }

  async updateCommercialInvoice(id: string, input: CommercialInvoiceUpdateInput, actor: AuthContext) {
    const existing = await this.getCommercialInvoice(id, actor);
    const patch: Record<string, unknown> = {};
    if (input.quoteId !== undefined) {
      await this.get(input.quoteId, actor);
      patch.quoteId = input.quoteId;
    }
    if (input.statusCode !== undefined) patch.statusId = await lookupIdByCode(this.db, invoiceStatuses, input.statusCode);
    for (const k of ['invoiceNo', 'invoiceDate', 'fileId'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    await this.db.update(commercialInvoices).set(patch).where(eq(commercialInvoices.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'commercial_invoice.updated',
      resourceType: 'commercial_invoice',
      resourceId: id,
      oldValues: existing,
      newValues: patch,
    });
    return this.getCommercialInvoice(id, actor);
  }

  private async getProforma(id: string, actor: AuthContext) {
    const row = await this.db.query.proformas.findFirst({
      where: and(eq(proformas.id, id), eq(proformas.tenantId, actor.tenantId), isNull(proformas.deletedAt)),
    });
    if (!row) throw new NotFoundError('Proforma');
    return row;
  }

  private async getContract(id: string, actor: AuthContext) {
    const row = await this.db.query.contracts.findFirst({
      where: and(eq(contracts.id, id), eq(contracts.tenantId, actor.tenantId), isNull(contracts.deletedAt)),
    });
    if (!row) throw new NotFoundError('Sözleşme');
    return row;
  }

  private async getCommercialInvoice(id: string, actor: AuthContext) {
    const row = await this.db.query.commercialInvoices.findFirst({
      where: and(eq(commercialInvoices.id, id), eq(commercialInvoices.tenantId, actor.tenantId), isNull(commercialInvoices.deletedAt)),
    });
    if (!row) throw new NotFoundError('Ticari fatura');
    return row;
  }
}
