import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { quotes, quoteItems, quoteTerms, proformas, contracts, commercialInvoices } from '../../db/schema/quotes';
import { companies, contacts } from '../../db/schema/companies';
import { opportunities } from '../../db/schema/crm';
import { inventoryItems } from '../../db/schema/inventory';
import { productModels } from '../../db/schema/products';
import { users } from '../../db/schema/users';
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
import PDFDocument from 'pdfkit';
import {
  companyPortfolioFilter,
  divisionFilter,
  resolveActorDivisionScope,
  resolveAssignedDivision,
} from '../../shared/utils/division-scope';

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

  private async assertOpportunity(opportunityId: string, actor: AuthContext, companyId: string) {
    const opportunity = await this.db.query.opportunities.findFirst({
      where: and(eq(opportunities.id, opportunityId), eq(opportunities.tenantId, actor.tenantId), isNull(opportunities.deletedAt)),
    });
    if (!opportunity) throw new NotFoundError('Fırsat');
    if (opportunity.companyId !== companyId) throw new ValidationError('Fırsat seçilen firmaya ait değil');
    return opportunity;
  }

  private async assertUser(userId: string, actor: AuthContext) {
    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.tenantId, actor.tenantId), isNull(users.deletedAt)),
    });
    if (!user) throw new NotFoundError('Kullanıcı');
    return user;
  }

  private async assertProductModel(productModelId: string, actor: AuthContext) {
    const product = await this.db.query.productModels.findFirst({
      where: and(eq(productModels.id, productModelId), eq(productModels.tenantId, actor.tenantId), isNull(productModels.deletedAt)),
    });
    if (!product) throw new NotFoundError('Ürün');
    return product;
  }

  private async assertInventoryItem(inventoryItemId: string, actor: AuthContext) {
    const item = await this.db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.tenantId, actor.tenantId), isNull(inventoryItems.deletedAt)),
    });
    if (!item) throw new NotFoundError('Stok kalemi');
    return item;
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
    const scoped = divisionFilter(resolveActorDivisionScope(actor), quotes.divisionId);
    if (scoped) filters.push(scoped);
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
      where: and(
        eq(quotes.id, id),
        eq(quotes.tenantId, actor.tenantId),
        isNull(quotes.deletedAt),
        divisionFilter(resolveActorDivisionScope(actor), quotes.divisionId) ?? sql`true`
      ),
    });
    if (!quote) throw new NotFoundError('Teklif');
    const items = await this.db.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
    const terms = await this.db.query.quoteTerms.findFirst({ where: eq(quoteTerms.quoteId, id) });
    return { ...quote, items, terms };
  }

  /**
   * Teklifi PDF olarak üretir (tenant-scope). Buffer + dosya adı döner; controller
   * stream eder. Not: PDFKit gömülü Helvetica fontu ç/ö/ü taşır ama ş/ğ/ı/İ
   * taşımaz; bu glyph'ler tr() ile sadeleştirilir. Tam diakritik için ileride
   * bir Unicode TTF (örn. DejaVuSans) gömülebilir.
   */
  async generatePdf(id: string, actor: AuthContext): Promise<{ buffer: Buffer; filename: string }> {
    const quote = await this.db.query.quotes.findFirst({
      where: and(
        eq(quotes.id, id),
        eq(quotes.tenantId, actor.tenantId),
        isNull(quotes.deletedAt),
        divisionFilter(resolveActorDivisionScope(actor), quotes.divisionId) ?? sql`true`
      ),
    });
    if (!quote) throw new NotFoundError('Teklif');
    const items = await this.db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(quoteItems.sortOrder);
    const terms = await this.db.query.quoteTerms.findFirst({ where: eq(quoteTerms.quoteId, id) });
    const company = await this.db.query.companies.findFirst({ where: eq(companies.id, quote.companyId) });
    const currency = quote.currencyId
      ? await this.db.query.currencies.findFirst({ where: eq(currencies.id, quote.currencyId) })
      : null;
    const cur = currency?.code ?? '';

    const tr = (s: string | null | undefined): string =>
      (s ?? '')
        .replace(/ş/g, 's').replace(/Ş/g, 'S')
        .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
        .replace(/ı/g, 'i').replace(/İ/g, 'I');
    const money = (v: string | number | null | undefined) =>
      `${Number(v ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`.trim();

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // Başlık
    doc.fontSize(22).font('Helvetica-Bold').text('TEKLIF', { align: 'right' });
    doc.font('Helvetica').fontSize(10)
      .text(`No: ${tr(quote.documentNo)}`, { align: 'right' })
      .text(`Tarih: ${new Date(quote.quoteDate).toLocaleDateString('tr-TR')}`, { align: 'right' })
      .text(`Gecerlilik: ${quote.validityDays} gun`, { align: 'right' });

    // Müşteri
    doc.moveDown(1.5);
    doc.fontSize(11).font('Helvetica-Bold').text('Musteri', 50);
    doc.font('Helvetica').fontSize(11).text(tr(company?.legalTitle ?? '-'), 50);

    // Kalemler tablosu
    doc.moveDown(1.5);
    const top = doc.y;
    const x = { no: 50, desc: 80, qty: 330, price: 400, total: 480 };
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('#', x.no, top, { lineBreak: false });
    doc.text('Aciklama', x.desc, top, { lineBreak: false });
    doc.text('Miktar', x.qty, top, { lineBreak: false });
    doc.text('B.Fiyat', x.price, top, { lineBreak: false });
    doc.text('Tutar', x.total, top, { lineBreak: false });
    doc.moveTo(50, top + 14).lineTo(545, top + 14).stroke();

    doc.font('Helvetica').fontSize(9);
    let y = top + 20;
    const rowH = 16;
    for (let i = 0; i < items.length; i++) {
      if (y > 770) { doc.addPage(); y = 50; }
      const it = items[i];
      const desc = tr(it.description);
      doc.text(String(i + 1), x.no, y, { lineBreak: false });
      doc.text(desc.length > 46 ? `${desc.slice(0, 45)}...` : desc, x.desc, y, { width: 240, lineBreak: false });
      doc.text(Number(it.quantity).toLocaleString('tr-TR'), x.qty, y, { lineBreak: false });
      doc.text(money(it.unitPrice), x.price, y, { lineBreak: false });
      doc.text(money(it.lineTotal), x.total, y, { lineBreak: false });
      y += rowH;
    }
    doc.moveTo(50, y).lineTo(545, y).stroke();

    // Toplamlar
    y += 12;
    const totalLine = (label: string, val: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9);
      doc.text(label, 340, y, { width: 110, align: 'right', lineBreak: false });
      doc.text(val, 455, y, { width: 90, align: 'right', lineBreak: false });
      y += bold ? 20 : 15;
    };
    totalLine('Ara Toplam', money(quote.subtotal));
    if (Number(quote.discountTotal) > 0) totalLine('Indirim', `-${money(quote.discountTotal)}`);
    totalLine('KDV', money(quote.vatAmount));
    totalLine('GENEL TOPLAM', money(quote.grandTotal), true);

    // Şartlar
    const termRows = ([
      ['Odeme', terms?.paymentTermsText ?? quote.paymentTerms],
      ['Teslim', terms?.deliveryTermsText ?? quote.deliveryTerms],
      ['Garanti', terms?.warrantyTermsText ?? quote.warrantyTerms],
    ] as Array<[string, string | null | undefined]>).filter(([, v]) => v);
    if (termRows.length) {
      doc.x = 50;
      doc.y = y + 24;
      doc.font('Helvetica-Bold').fontSize(10).text('Sartlar', 50);
      doc.font('Helvetica').fontSize(9);
      for (const [k, v] of termRows) doc.text(`${k}: ${tr(v)}`, 50, undefined, { width: 495 });
    }

    doc.end();
    const buffer = await done;
    const safeNo = tr(quote.documentNo).replace(/[^a-zA-Z0-9._-]/g, '_');
    return { buffer, filename: `teklif-${safeNo}.pdf` };
  }

  async create(input: QuoteCreateInput, actor: AuthContext) {
    await this.assertCompany(input.companyId, actor);
    if (input.contactId) await this.assertContact(input.contactId, actor, input.companyId);
    if (input.opportunityId) await this.assertOpportunity(input.opportunityId, actor, input.companyId);
    if (input.projectOwnerUserId) await this.assertUser(input.projectOwnerUserId, actor);
    const documentNo = input.documentNo?.trim() || (await this.nextDocumentNo(actor));
    const existing = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.tenantId, actor.tenantId), eq(quotes.documentNo, documentNo)),
    });
    if (existing) throw new ConflictError('Bu doküman numarası zaten kullanılıyor');
    const draft = await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.code, 'draft') });
    const currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    const divisionId = resolveAssignedDivision(actor, input.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Teklif için bölüm ataması zorunludur', { field: 'divisionId' });
    // Aynı fırsata bağlı tekliflerde revizyon numarası artar (1, 2, 3 …).
    // Fırsatı olmayan teklifler her zaman 1'dir.
    let revisionNo = 1;
    if (input.opportunityId) {
      const [{ maxRev }] = await this.db
        .select({ maxRev: sql<number>`coalesce(max(${quotes.revisionNo}), 0)::int` })
        .from(quotes)
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, input.opportunityId)));
      revisionNo = (maxRev ?? 0) + 1;
    }
    const [row] = await this.db
      .insert(quotes)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        opportunityId: input.opportunityId ?? null,
        companyId: input.companyId,
        contactId: input.contactId ?? null,
        documentNo,
        revisionNo,
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
    const existingQuote = await this.get(id, actor);
    const companyId = input.companyId ?? existingQuote.companyId;
    if (input.companyId !== undefined) await this.assertCompany(input.companyId, actor);
    if (input.contactId !== undefined) {
      if (input.contactId) await this.assertContact(input.contactId, actor, companyId);
    } else if (input.companyId !== undefined && existingQuote.contactId) {
      await this.assertContact(existingQuote.contactId, actor, companyId);
    }
    if (input.opportunityId !== undefined) {
      if (input.opportunityId) await this.assertOpportunity(input.opportunityId, actor, companyId);
    } else if (input.companyId !== undefined && existingQuote.opportunityId) {
      await this.assertOpportunity(existingQuote.opportunityId, actor, companyId);
    }
    if (input.projectOwnerUserId) await this.assertUser(input.projectOwnerUserId, actor);
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
    const quote = await this.get(quoteId, actor);
    if (input.productModelId) await this.assertProductModel(input.productModelId, actor);
    if (input.inventoryItemId) await this.assertInventoryItem(input.inventoryItemId, actor);
    const t = this.calcItem(input.quantity, input.unitPrice, input.discountAmount, input.vatRate);
    const unitId = await lookupIdByCode(this.db, units, input.unitCode);
    const [row] = await this.db
      .insert(quoteItems)
      .values({
        tenantId: actor.tenantId,
        divisionId: quote.divisionId,
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
    if (input.productModelId) await this.assertProductModel(input.productModelId, actor);
    if (input.inventoryItemId) await this.assertInventoryItem(input.inventoryItemId, actor);
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
    const where = and(
      eq(proformas.tenantId, actor.tenantId),
      isNull(proformas.deletedAt),
      divisionFilter(resolveActorDivisionScope(actor), proformas.divisionId) ?? sql`true`
    );
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
    const quote = await this.get(input.quoteId, actor);
    const statusId = await lookupIdByCode(this.db, proformaStatuses, input.statusCode);
    const [row] = await this.db
      .insert(proformas)
      .values({
        tenantId: actor.tenantId,
        divisionId: quote.divisionId,
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
    const where = and(
      eq(contracts.tenantId, actor.tenantId),
      isNull(contracts.deletedAt),
      divisionFilter(resolveActorDivisionScope(actor), contracts.divisionId) ?? sql`true`
    );
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
    const quote = await this.get(input.quoteId, actor);
    const statusId = await lookupIdByCode(this.db, contractStatuses, input.statusCode);
    const [row] = await this.db
      .insert(contracts)
      .values({
        tenantId: actor.tenantId,
        divisionId: quote.divisionId,
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
    const where = and(
      eq(commercialInvoices.tenantId, actor.tenantId),
      isNull(commercialInvoices.deletedAt),
      divisionFilter(resolveActorDivisionScope(actor), commercialInvoices.divisionId) ?? sql`true`
    );
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
    const quote = await this.get(input.quoteId, actor);
    const statusId = await lookupIdByCode(this.db, invoiceStatuses, input.statusCode);
    const [row] = await this.db
      .insert(commercialInvoices)
      .values({
        tenantId: actor.tenantId,
        divisionId: quote.divisionId,
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
      where: and(
        eq(proformas.id, id),
        eq(proformas.tenantId, actor.tenantId),
        isNull(proformas.deletedAt),
        divisionFilter(resolveActorDivisionScope(actor), proformas.divisionId) ?? sql`true`
      ),
    });
    if (!row) throw new NotFoundError('Proforma');
    return row;
  }

  private async getContract(id: string, actor: AuthContext) {
    const row = await this.db.query.contracts.findFirst({
      where: and(
        eq(contracts.id, id),
        eq(contracts.tenantId, actor.tenantId),
        isNull(contracts.deletedAt),
        divisionFilter(resolveActorDivisionScope(actor), contracts.divisionId) ?? sql`true`
      ),
    });
    if (!row) throw new NotFoundError('Sözleşme');
    return row;
  }

  private async getCommercialInvoice(id: string, actor: AuthContext) {
    const row = await this.db.query.commercialInvoices.findFirst({
      where: and(
        eq(commercialInvoices.id, id),
        eq(commercialInvoices.tenantId, actor.tenantId),
        isNull(commercialInvoices.deletedAt),
        divisionFilter(resolveActorDivisionScope(actor), commercialInvoices.divisionId) ?? sql`true`
      ),
    });
    if (!row) throw new NotFoundError('Ticari fatura');
    return row;
  }
}
