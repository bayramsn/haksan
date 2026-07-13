import { Inject, Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { quotes, quoteItems, quoteTerms, proformas, contracts, commercialInvoices } from '../../db/schema/quotes';
import { companies, contactCompanies, contacts } from '../../db/schema/companies';
import { opportunities } from '../../db/schema/crm';
import { inventoryItems } from '../../db/schema/inventory';
import { productModels } from '../../db/schema/products';
import { divisions } from '../../db/schema/tenants';
import { users } from '../../db/schema/users';
import { currencies, units, quoteStatuses, proformaStatuses, contractStatuses, invoiceStatuses, productGroups } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
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
  resourceCompanyPortfolioFilter,
  resourceDivisionFilter,
  resourceDivisionFilterWithShared,
  resolveAssignedResourceDivision,
} from '../../shared/utils/division-scope';
import { companyVisibilityFilter, companyVisibilityExistsFilter } from '../../shared/utils/company-visibility';
import {
  nextSeriesDocumentNo,
  normalizeSeriesDocumentNo,
  resolveBusinessLine,
  type BusinessLine,
} from '../../shared/utils/document-series';

interface ItemTotals {
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
}

const PDF_REGULAR_FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  `${process.cwd()}/node_modules/@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf`,
];

const PDF_BOLD_FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  `${process.cwd()}/node_modules/@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf`,
];

const firstExistingPath = (paths: string[]) => paths.find((p) => existsSync(p));

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
    const [quote, items] = await Promise.all([
      this.db.query.quotes.findFirst({ where: eq(quotes.id, quoteId) }),
      this.db.select().from(quoteItems).where(and(eq(quoteItems.quoteId, quoteId), isNull(quoteItems.deletedAt))),
    ]);
    let subtotal = 0;
    let lineDiscount = 0;
    const taxableRows: Array<{ amount: number; vatRate: number }> = [];
    for (const it of items) {
      const t = this.calcItem(Number(it.quantity), Number(it.unitPrice), Number(it.discountAmount), Number(it.vatRate));
      subtotal += t.subtotal + t.discount; // gross
      lineDiscount += t.discount;
      taxableRows.push({ amount: t.subtotal, vatRate: Number(it.vatRate) });
    }
    const taxableBeforeHeader = Math.max(subtotal - lineDiscount, 0);
    const headerPercent = Number(quote?.headerDiscountPercent ?? 0);
    const headerAmount = Number(quote?.headerDiscountAmount ?? 0);
    const headerDiscount = Math.min(
      taxableBeforeHeader,
      Math.max(headerPercent > 0 ? taxableBeforeHeader * (headerPercent / 100) : headerAmount, 0)
    );
    const ratio = taxableBeforeHeader > 0 ? (taxableBeforeHeader - headerDiscount) / taxableBeforeHeader : 1;
    const vat = taxableRows.reduce((sum, row) => sum + (row.amount * ratio * (row.vatRate / 100)), 0);
    const discount = lineDiscount + headerDiscount;
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

  private async tenantHasActiveDivisions(actor: AuthContext): Promise<boolean> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(divisions)
      .where(and(eq(divisions.tenantId, actor.tenantId), eq(divisions.isActive, true)));
    return (row?.count ?? 0) > 0;
  }

  private async businessLineForQuote(quote: { divisionId: string | null; businessLine?: string | null }, actor: AuthContext) {
    if (quote.businessLine === 'CNC' || quote.businessLine === 'UNI' || quote.businessLine === 'SACISLE') {
      return quote.businessLine;
    }
    return quote.divisionId ? resolveBusinessLine(this.db, actor.tenantId, quote.divisionId) : 'CNC';
  }

  private async assertCompany(companyId: string, actor: AuthContext) {
    const company = await this.db.query.companies.findFirst({
      where: and(
        eq(companies.id, companyId),
        eq(companies.tenantId, actor.tenantId),
        isNull(companies.deletedAt),
        resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
        (await companyVisibilityFilter(this.db, actor)) ?? sql`true`
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
    const [link] = await this.db
      .select({ contactId: contactCompanies.contactId })
      .from(contactCompanies)
      .where(and(eq(contactCompanies.contactId, contactId), eq(contactCompanies.companyId, companyId)))
      .limit(1);
    if (contact.companyId !== companyId && !link) throw new ValidationError('Kontak seçilen firmaya ait değil');
    return contact;
  }

  private async assertOpportunity(opportunityId: string, actor: AuthContext, companyId: string) {
    const opportunity = await this.db.query.opportunities.findFirst({
      where: and(
        eq(opportunities.id, opportunityId),
        eq(opportunities.tenantId, actor.tenantId),
        isNull(opportunities.deletedAt),
        resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`,
        (await companyVisibilityExistsFilter(this.db, actor, opportunities.companyId)) ?? sql`true`
      ),
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

  private async assertProductModel(productModelId: string, actor: AuthContext, quoteDivisionId?: string | null) {
    const [row] = await this.db
      .select({ product: productModels, groupDivisionId: productGroups.divisionId })
      .from(productModels)
      .leftJoin(productGroups, eq(productModels.productGroupId, productGroups.id))
      .where(
        and(
          eq(productModels.id, productModelId),
          eq(productModels.tenantId, actor.tenantId),
          isNull(productModels.deletedAt),
          resourceDivisionFilterWithShared(actor, 'products', productGroups.divisionId) ?? sql`true`
        )
      )
      .limit(1);
    if (!row?.product) throw new NotFoundError('Ürün');
    if (quoteDivisionId && row.groupDivisionId && row.groupDivisionId !== quoteDivisionId) {
      throw new ValidationError('Ürün seçilen teklif bölümüne ait değil');
    }
    return row.product;
  }

  private async assertInventoryItem(inventoryItemId: string, actor: AuthContext, quoteDivisionId?: string | null) {
    const [item] = await this.db
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.id, inventoryItemId),
          eq(inventoryItems.tenantId, actor.tenantId),
          isNull(inventoryItems.deletedAt),
          resourceDivisionFilter(actor, 'inventory', inventoryItems.divisionId) ?? sql`true`
        )
      )
      .limit(1);
    if (!item) throw new NotFoundError('Stok kalemi');
    if (quoteDivisionId && item.divisionId && item.divisionId !== quoteDivisionId) {
      throw new ValidationError('Stok kalemi seçilen teklif bölümüne ait değil');
    }
    return item;
  }

  private isSuperAdmin(actor: AuthContext) {
    return actor.roles.includes('super_admin');
  }

  private assertQuoteMutable(quote: { approvedAt: Date | null }) {
    if (quote.approvedAt) {
      throw new ConflictError('Onaylı teklif değiştirilemez; yeni bir revizyon oluşturun');
    }
  }

  private async quotePriceCheck(quoteId: string) {
    const rows = await this.db
      .select({ item: quoteItems, product: productModels })
      .from(quoteItems)
      .leftJoin(productModels, eq(quoteItems.productModelId, productModels.id))
      .where(and(eq(quoteItems.quoteId, quoteId), isNull(quoteItems.deletedAt)));
    const belowItems = rows
      .map((row) => {
        const product = row.product;
        if (!product) return null;
        const basePrice = Number(product.cashPrice ?? product.listPrice ?? 0);
        if (!Number.isFinite(basePrice) || basePrice <= 0) return null;
        const quantity = Number(row.item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) return null;
        const netUnitPrice = Math.max((quantity * Number(row.item.unitPrice) - Number(row.item.discountAmount ?? 0)) / quantity, 0);
        if (netUnitPrice + 0.0001 >= basePrice) return null;
        return {
          itemId: row.item.id,
          productModelId: product.id,
          productName: product.fullName,
          stockCode: row.item.stockCode ?? product.stockCode,
          basePrice,
          netUnitPrice,
        };
      })
      .filter(Boolean) as Array<{
      itemId: string;
      productModelId: string;
      productName: string;
      stockCode: string | null;
      basePrice: number;
      netUnitPrice: number;
    }>;
    return { needsApproval: belowItems.length > 0, belowItems };
  }

  private async refreshPriceApprovalStatus(quoteId: string, actor: AuthContext) {
    const check = await this.quotePriceCheck(quoteId);
    if (!check.needsApproval) {
      await this.db
        .update(quotes)
        .set({
          priceApprovalStatus: 'not_required',
          priceApprovalRequestedBy: null,
          priceApprovalRequestedAt: null,
          priceApprovedBy: null,
          priceApprovedAt: null,
          priceRejectedBy: null,
          priceRejectedAt: null,
          priceApprovalNote: null,
        })
        .where(eq(quotes.id, quoteId));
      return check;
    }

    const pendingStatusId = await lookupIdByCode(this.db, quoteStatuses, 'pending_super_admin_approval');
    await this.db
      .update(quotes)
      .set({
        statusId: pendingStatusId,
        priceApprovalStatus: 'pending',
        priceApprovalRequestedBy: actor.userId,
        priceApprovalRequestedAt: new Date(),
        priceApprovedBy: null,
        priceApprovedAt: null,
        priceRejectedBy: null,
        priceRejectedAt: null,
        priceApprovalNote: null,
      })
      .where(eq(quotes.id, quoteId));
    return check;
  }

  private async ensurePriceApprovalAllowsAction(quoteId: string, actor: AuthContext) {
    const check = await this.quotePriceCheck(quoteId);
    if (!check.needsApproval) {
      await this.refreshPriceApprovalStatus(quoteId, actor);
      return;
    }

    const quote = await this.db.query.quotes.findFirst({ where: eq(quotes.id, quoteId) });
    if (quote?.priceApprovalStatus === 'approved') return;
    if (this.isSuperAdmin(actor)) {
      await this.approvePrice(quoteId, actor, 'Süper admin işlem sırasında onayladı');
      return;
    }
    await this.refreshPriceApprovalStatus(quoteId, actor);
    throw new ConflictError('Peşin/liste fiyatının altındaki teklif için Süper Admin onayı gerekiyor', {
      belowItems: check.belowItems,
    });
  }

  async list(actor: AuthContext, query: { search?: string; statusCode?: string; companyId?: string; businessLine?: BusinessLine }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt)];
    if (query.search) filters.push(ilike(quotes.documentNo, `%${query.search}%`));
    if (query.companyId) filters.push(eq(quotes.companyId, query.companyId));
    if (query.businessLine) filters.push(eq(quotes.businessLine, query.businessLine));
    if (query.statusCode) {
      const sid = await lookupIdByCode(this.db, quoteStatuses, query.statusCode);
      if (sid) filters.push(eq(quotes.statusId, sid));
    }
    const scoped = resourceDivisionFilter(actor, 'quotes', quotes.divisionId);
    if (scoped) filters.push(scoped);
    const visibility = await companyVisibilityExistsFilter(this.db, actor, quotes.companyId);
    if (visibility) filters.push(visibility);
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(quotes).where(where);
    const rows = await this.db
      .select({
        quote: quotes,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        status: { id: quoteStatuses.id, code: quoteStatuses.code, name: quoteStatuses.name },
        currency: { id: currencies.id, code: currencies.code },
        division: { id: divisions.id, code: divisions.code, name: divisions.name },
      })
      .from(quotes)
      .leftJoin(companies, eq(quotes.companyId, companies.id))
      .leftJoin(quoteStatuses, eq(quotes.statusId, quoteStatuses.id))
      .leftJoin(currencies, eq(quotes.currencyId, currencies.id))
      .leftJoin(divisions, eq(quotes.divisionId, divisions.id))
      .where(where)
      .orderBy(desc(quotes.quoteDate))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({ ...r.quote, company: r.company, status: r.status, currency: r.currency, division: r.division })),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const visibility = await companyVisibilityExistsFilter(this.db, actor, quotes.companyId);
    const quote = await this.db.query.quotes.findFirst({
      where: and(
        eq(quotes.id, id),
        eq(quotes.tenantId, actor.tenantId),
        isNull(quotes.deletedAt),
        resourceDivisionFilter(actor, 'quotes', quotes.divisionId) ?? sql`true`,
        visibility ?? sql`true`
      ),
    });
    if (!quote) throw new NotFoundError('Teklif');
    const items = await this.db.select().from(quoteItems).where(and(eq(quoteItems.quoteId, id), isNull(quoteItems.deletedAt)));
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
    const visibility = await companyVisibilityExistsFilter(this.db, actor, quotes.companyId);
    const quote = await this.db.query.quotes.findFirst({
      where: and(
        eq(quotes.id, id),
        eq(quotes.tenantId, actor.tenantId),
        isNull(quotes.deletedAt),
        resourceDivisionFilter(actor, 'quotes', quotes.divisionId) ?? sql`true`,
        visibility ?? sql`true`
      ),
    });
    if (!quote) throw new NotFoundError('Teklif');
    const items = await this.db
      .select()
      .from(quoteItems)
      .where(and(eq(quoteItems.quoteId, id), isNull(quoteItems.deletedAt)))
      .orderBy(quoteItems.sortOrder);
    const terms = await this.db.query.quoteTerms.findFirst({ where: eq(quoteTerms.quoteId, id) });
    const company = await this.db.query.companies.findFirst({ where: eq(companies.id, quote.companyId) });
    const contact = quote.contactId
      ? await this.db.query.contacts.findFirst({ where: eq(contacts.id, quote.contactId) })
      : null;
    const currency = quote.currencyId
      ? await this.db.query.currencies.findFirst({ where: eq(currencies.id, quote.currencyId) })
      : null;
    const cur = currency?.code ?? '';

    const money = (v: string | number | null | undefined) =>
      `${Number(v ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`.trim();

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const regularFontPath = firstExistingPath(PDF_REGULAR_FONT_CANDIDATES);
    const boldFontPath = firstExistingPath(PDF_BOLD_FONT_CANDIDATES);
    const regularFont = regularFontPath ? 'HaksanRegular' : 'Helvetica';
    const boldFont = boldFontPath ? 'HaksanBold' : 'Helvetica-Bold';
    if (regularFontPath) doc.registerFont(regularFont, regularFontPath);
    if (boldFontPath) doc.registerFont(boldFont, boldFontPath);

    const supportsTurkish = !!regularFontPath;
    const tr = (s: string | null | undefined): string => {
      const value = s ?? '';
      if (supportsTurkish) return value;
      return value
        .replace(/ş/g, 's').replace(/Ş/g, 'S')
        .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
        .replace(/ı/g, 'i').replace(/İ/g, 'I');
    };

    const ensureSpace = (height: number) => {
      if (doc.y + height <= 790) return;
      doc.addPage();
      doc.y = 50;
    };

    const splitTermLines = (value: string | null | undefined) =>
      tr(value)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    // Başlık
    doc.fontSize(22).font(boldFont).text(tr('FİYAT TEKLİFİ'), { align: 'right' });
    doc.font(regularFont).fontSize(10)
      .text(`No: ${tr(quote.documentNo)}`, { align: 'right' })
      .text(`Tarih: ${new Date(quote.quoteDate).toLocaleDateString('tr-TR')}`, { align: 'right' })
      .text(`Geçerlilik: ${quote.validityDays} gün`, { align: 'right' });

    // Müşteri
    doc.moveDown(1.5);
    doc.fontSize(11).font(boldFont).text('Müşteri', 50);
    doc.font(regularFont).fontSize(11).text(tr(company?.legalTitle ?? '-'), 50);
    if (contact?.fullName) doc.text(`İlgili: ${tr(contact.fullName)}`, 50);
    if (contact?.workPhone || contact?.mobilePhone) {
      doc.text(`Tel: ${tr([contact.workPhone, contact.mobilePhone].filter(Boolean).join(' / '))}`, 50);
    }
    if (contact?.workEmail) doc.text(`E-posta: ${tr(contact.workEmail)}`, 50);
    if (company?.taxNumber || company?.taxOffice) {
      doc.text(`Vergi: ${tr([company.taxOffice, company.taxNumber].filter(Boolean).join(' / '))}`, 50);
    }

    // Kalemler tablosu
    doc.moveDown(1.5);
    const x = { no: 50, stock: 75, desc: 145, qty: 340, price: 400, total: 480 };
    const colW = { stock: 65, desc: 190, qty: 55, price: 75, total: 65 };

    // Metni kolon genişliğine sığdırır: önce yazı küçülür, yine sığmazsa "..." ile kesilir.
    const fitCell = (
      value: string,
      cx: number,
      cy: number,
      width: number,
      opts: { size?: number; minSize?: number; align?: 'left' | 'right'; bold?: boolean } = {},
    ) => {
      if (!value) return;
      let size = opts.size ?? 9;
      const minSize = opts.minSize ?? 6.5;
      doc.font(opts.bold ? boldFont : regularFont).fontSize(size);
      while (size > minSize && doc.widthOfString(value) > width) {
        size -= 0.25;
        doc.fontSize(size);
      }
      let shown = value;
      while (shown.length > 1 && doc.widthOfString(`${shown}...`) > width && doc.widthOfString(shown) > width) {
        shown = shown.slice(0, -1);
      }
      if (shown !== value) shown = `${shown.trimEnd()}...`;
      doc.text(shown, cx, cy, { width, align: opts.align ?? 'left', lineBreak: false });
    };

    // Tablo başlığı her sayfada yeniden çizilir.
    const drawTableHeader = (headerY: number) => {
      doc.fontSize(9).font(boldFont);
      doc.text('#', x.no, headerY, { lineBreak: false });
      doc.text('Stok Kodu', x.stock, headerY, { lineBreak: false });
      doc.text(tr('Açıklama'), x.desc, headerY, { lineBreak: false });
      doc.text('Miktar', x.qty, headerY, { width: colW.qty, align: 'right', lineBreak: false });
      doc.text('B.Fiyat', x.price, headerY, { width: colW.price, align: 'right', lineBreak: false });
      doc.text('Tutar', x.total, headerY, { width: colW.total, align: 'right', lineBreak: false });
      doc.moveTo(50, headerY + 14).lineTo(545, headerY + 14).stroke();
      return headerY + 20;
    };

    let y = drawTableHeader(doc.y);
    const rowH = 16;
    for (let i = 0; i < items.length; i++) {
      if (y > 770) {
        doc.addPage();
        y = drawTableHeader(50);
      }
      const it = items[i];
      doc.font(regularFont).fontSize(9);
      doc.text(String(i + 1), x.no, y, { lineBreak: false });
      fitCell(tr(it.stockCode ?? ''), x.stock, y, colW.stock);
      fitCell(tr(it.description), x.desc, y, colW.desc, { minSize: 7 });
      fitCell(Number(it.quantity).toLocaleString('tr-TR'), x.qty, y, colW.qty, { align: 'right' });
      fitCell(money(it.unitPrice), x.price, y, colW.price, { align: 'right' });
      fitCell(money(it.lineTotal), x.total, y, colW.total, { align: 'right' });
      y += rowH;
    }
    doc.moveTo(50, y).lineTo(545, y).stroke();

    // Toplamlar
    y += 12;
    const totalLine = (label: string, val: string, bold = false) => {
      doc.font(bold ? boldFont : regularFont).fontSize(bold ? 11 : 9);
      doc.text(label, 340, y, { width: 110, align: 'right', lineBreak: false });
      fitCell(val, 455, y, 90, { align: 'right', bold, size: bold ? 11 : 9, minSize: 7.5 });
      y += bold ? 20 : 15;
    };
    totalLine('Ara Toplam', money(quote.subtotal));
    if (Number(quote.discountTotal) > 0) totalLine('Indirim', `-${money(quote.discountTotal)}`);
    totalLine('KDV', money(quote.vatAmount));
    totalLine('GENEL TOPLAM', money(quote.grandTotal), true);

    // Şartlar — örnek formdaki gibi 1/2/3 ve a/b/c maddeleri.
    const termSections = ([
      ['ÖDEME ŞARTLARI', splitTermLines(terms?.paymentTermsText ?? quote.paymentTerms)],
      ['TESLİMAT ŞARTLARI', splitTermLines(terms?.deliveryTermsText ?? quote.deliveryTerms)],
      ['GARANTİ ŞARTLARI', splitTermLines(terms?.warrantyTermsText ?? quote.warrantyTerms)],
      ['NOTLAR', splitTermLines(quote.notes)],
    ] as Array<[string, string[]]>).filter(([, lines]) => lines.length > 0);

    if (termSections.length) {
      doc.x = 50;
      doc.y = y + 24;
      termSections.forEach(([title, lines], sectionIndex) => {
        ensureSpace(24);
        doc.font(boldFont).fontSize(10).text(`${sectionIndex + 1}. ${title}`, 50, doc.y, { width: 495 });
        doc.moveDown(0.3);
        lines.forEach((line, lineIndex) => {
          const label = `${String.fromCharCode(97 + lineIndex)}.`;
          const textWidth = 465;
          const textHeight = doc.font(regularFont).fontSize(9).heightOfString(line, { width: textWidth, align: 'left' });
          ensureSpace(textHeight + 8);
          const rowY = doc.y;
          doc.font(boldFont).fontSize(9).text(label, 62, rowY, { width: 14, lineBreak: false });
          doc.font(regularFont).fontSize(9).text(line, 82, rowY, { width: textWidth, align: 'left' });
          doc.y = rowY + textHeight + 4;
        });
        doc.moveDown(0.35);
      });
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
    const divisionId = resolveAssignedResourceDivision(actor, 'quotes', input.divisionId ?? null);
    if (!divisionId && (await this.tenantHasActiveDivisions(actor))) {
      throw new ValidationError('Teklif için bölüm ataması zorunludur', { field: 'divisionId' });
    }
    const businessLine = divisionId ? await resolveBusinessLine(this.db, actor.tenantId, divisionId) : 'CNC';
    const documentNo =
      normalizeSeriesDocumentNo(input.documentNo, businessLine) ??
      (await nextSeriesDocumentNo(this.db, actor.tenantId, businessLine, 'quote', input.quoteDate));
    const existing = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.tenantId, actor.tenantId), eq(quotes.documentNo, documentNo)),
    });
    if (existing) throw new ConflictError('Bu doküman numarası zaten kullanılıyor');
    const draft = await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.code, 'draft') });
    const currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
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
        businessLine,
        opportunityId: input.opportunityId ?? null,
        companyId: input.companyId,
        contactId: input.contactId ?? null,
        documentNo,
        revisionNo,
        quoteDate: input.quoteDate,
        validityDays: input.validityDays,
        projectOwnerUserId: input.projectOwnerUserId ?? actor.userId,
        currencyId,
        headerDiscountAmount: (input.headerDiscountAmount ?? 0).toString(),
        headerDiscountPercent: (input.headerDiscountPercent ?? 0).toString(),
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
    this.assertQuoteMutable(existingQuote);
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
    const targetDivisionId = input.divisionId !== undefined
      ? resolveAssignedResourceDivision(actor, 'quotes', input.divisionId)
      : existingQuote.divisionId;
    const businessLine = targetDivisionId
      ? await resolveBusinessLine(this.db, actor.tenantId, targetDivisionId)
      : ((existingQuote.businessLine as BusinessLine | null) ?? 'CNC');
    if (input.divisionId !== undefined) {
      patch.divisionId = targetDivisionId;
      patch.businessLine = businessLine;
    }
    if (input.currencyCode !== undefined) patch.currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    for (const k of ['opportunityId', 'companyId', 'contactId', 'quoteDate', 'validityDays', 'projectOwnerUserId', 'paymentTerms', 'deliveryTerms', 'warrantyTerms', 'notes'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    if (input.documentNo !== undefined) {
      const documentNo = normalizeSeriesDocumentNo(input.documentNo, businessLine);
      if (!documentNo) throw new ValidationError('Teklif numarası boş bırakılamaz', { field: 'documentNo' });
      const duplicate = await this.db.query.quotes.findFirst({
        where: and(eq(quotes.tenantId, actor.tenantId), eq(quotes.documentNo, documentNo)),
      });
      if (duplicate && duplicate.id !== id) throw new ConflictError('Bu doküman numarası zaten kullanılıyor');
      patch.documentNo = documentNo;
    } else if (input.divisionId !== undefined && businessLine !== existingQuote.businessLine) {
      patch.documentNo = await nextSeriesDocumentNo(
        this.db,
        actor.tenantId,
        businessLine,
        'quote',
        input.quoteDate ?? existingQuote.quoteDate
      );
    }
    for (const k of ['headerDiscountAmount', 'headerDiscountPercent'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = ((input as any)[k] as number | undefined)?.toString() ?? '0';
    }
    await this.db.update(quotes).set(patch).where(eq(quotes.id, id));
    if (input.headerDiscountAmount !== undefined || input.headerDiscountPercent !== undefined) {
      await this.recalcQuoteTotals(id);
      await this.refreshPriceApprovalStatus(id, actor);
    }
    return this.get(id, actor);
  }

  async delete(id: string, actor: AuthContext) {
    const quote = await this.get(id, actor);
    this.assertQuoteMutable(quote);
    await this.db.update(quotes).set({ deletedAt: new Date() }).where(eq(quotes.id, id));
    return { ok: true };
  }

  // ────────── ITEMS ──────────
  async addItem(quoteId: string, input: QuoteItemCreateInput, actor: AuthContext) {
    const quote = await this.get(quoteId, actor);
    this.assertQuoteMutable(quote);
    if (input.productModelId) await this.assertProductModel(input.productModelId, actor, quote.divisionId);
    if (input.inventoryItemId) await this.assertInventoryItem(input.inventoryItemId, actor, quote.divisionId);
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
        stockCode: input.stockCode ?? null,
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
    await this.refreshPriceApprovalStatus(quoteId, actor);
    return row;
  }

  async updateItem(quoteId: string, itemId: string, input: QuoteItemUpdateInput, actor: AuthContext) {
    const quote = await this.get(quoteId, actor);
    this.assertQuoteMutable(quote);
    const existing = await this.db.query.quoteItems.findFirst({
      where: and(eq(quoteItems.id, itemId), eq(quoteItems.quoteId, quoteId), eq(quoteItems.tenantId, actor.tenantId), isNull(quoteItems.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Kalem');
    if (input.productModelId) await this.assertProductModel(input.productModelId, actor, quote.divisionId);
    if (input.inventoryItemId) await this.assertInventoryItem(input.inventoryItemId, actor, quote.divisionId);
    const patch: Record<string, unknown> = {};
    for (const k of ['productModelId', 'inventoryItemId', 'stockCode', 'description', 'sortOrder'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    for (const k of ['quantity', 'unitPrice', 'discountAmount', 'vatRate'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = ((input as any)[k] as number | undefined)?.toString();
    }
    if (input.compatibility !== undefined) patch.compatibility = input.compatibility ?? null;
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
    await this.refreshPriceApprovalStatus(quoteId, actor);
    return { ok: true };
  }

  async deleteItem(quoteId: string, itemId: string, actor: AuthContext) {
    const quote = await this.get(quoteId, actor);
    this.assertQuoteMutable(quote);
    const existing = await this.db.query.quoteItems.findFirst({
      where: and(eq(quoteItems.id, itemId), eq(quoteItems.quoteId, quoteId), eq(quoteItems.tenantId, actor.tenantId), isNull(quoteItems.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Kalem');
    await this.db.update(quoteItems).set({ deletedAt: new Date() }).where(eq(quoteItems.id, itemId));
    await this.recalcQuoteTotals(quoteId);
    await this.refreshPriceApprovalStatus(quoteId, actor);
    return { ok: true };
  }

  // ────────── TERMS ──────────
  async upsertTerms(quoteId: string, input: QuoteTermsUpsertInput, actor: AuthContext) {
    const quote = await this.get(quoteId, actor);
    this.assertQuoteMutable(quote);
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
  async approvePrice(quoteId: string, actor: AuthContext, note?: string) {
    if (!actor.permissions.has('quotes.approve')) throw new ForbiddenError('Liste altı teklif fiyatını onaylama yetkiniz yok');
    await this.get(quoteId, actor);
    const check = await this.quotePriceCheck(quoteId);
    if (!check.needsApproval) {
      await this.refreshPriceApprovalStatus(quoteId, actor);
      return this.get(quoteId, actor);
    }
    await this.db
      .update(quotes)
      .set({
        priceApprovalStatus: 'approved',
        priceApprovedBy: actor.userId,
        priceApprovedAt: new Date(),
        priceRejectedBy: null,
        priceRejectedAt: null,
        priceApprovalNote: note ?? null,
      })
      .where(eq(quotes.id, quoteId));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'quote.price_approved',
      resourceType: 'quote',
      resourceId: quoteId,
      newValues: { belowItems: check.belowItems, note },
    });
    return this.get(quoteId, actor);
  }

  async rejectPrice(quoteId: string, actor: AuthContext, note?: string) {
    if (!actor.permissions.has('quotes.reject')) throw new ForbiddenError('Liste altı teklif fiyatını reddetme yetkiniz yok');
    await this.get(quoteId, actor);
    const status = await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.code, 'rejected') });
    await this.db
      .update(quotes)
      .set({
        statusId: status?.id ?? null,
        priceApprovalStatus: 'rejected',
        priceRejectedBy: actor.userId,
        priceRejectedAt: new Date(),
        priceApprovalNote: note ?? null,
        rejectedAt: new Date(),
      })
      .where(eq(quotes.id, quoteId));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'quote.price_rejected',
      resourceType: 'quote',
      resourceId: quoteId,
      newValues: { note },
    });
    return this.get(quoteId, actor);
  }

  async approve(quoteId: string, actor: AuthContext) {
    const quote = await this.get(quoteId, actor);
    await this.ensurePriceApprovalAllowsAction(quoteId, actor);
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
    await this.ensurePriceApprovalAllowsAction(quoteId, actor);
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
      resourceDivisionFilter(actor, 'proformas', proformas.divisionId) ?? sql`true`
    );
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(proformas).where(where);
    const rows = await this.db
      .select({
        proforma: proformas,
        quote: { id: quotes.id, documentNo: quotes.documentNo, companyId: quotes.companyId, opportunityId: quotes.opportunityId, grandTotal: quotes.grandTotal },
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        currency: { id: currencies.id, code: currencies.code },
        status: { id: proformaStatuses.id, code: proformaStatuses.code, name: proformaStatuses.name },
      })
      .from(proformas)
      .leftJoin(quotes, eq(proformas.quoteId, quotes.id))
      .leftJoin(companies, eq(quotes.companyId, companies.id))
      .leftJoin(currencies, eq(quotes.currencyId, currencies.id))
      .leftJoin(proformaStatuses, eq(proformas.statusId, proformaStatuses.id))
      .where(where)
      .orderBy(desc(proformas.issueDate))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({ ...r.proforma, quote: r.quote, company: r.company, currency: r.currency, status: r.status })),
      count,
      page
    );
  }

  async createProforma(input: ProformaCreateInput, actor: AuthContext) {
    const quote = await this.get(input.quoteId, actor);
    const businessLine = await this.businessLineForQuote(quote, actor);
    const documentNo =
      normalizeSeriesDocumentNo(input.documentNo, businessLine) ??
      (await nextSeriesDocumentNo(this.db, actor.tenantId, businessLine, 'proforma', input.issueDate));
    const statusId = await lookupIdByCode(this.db, proformaStatuses, input.statusCode);
    if (!statusId) throw new ValidationError('Geçersiz proforma durumu', { field: 'statusCode' });
    const [row] = await this.db
      .insert(proformas)
      .values({
        tenantId: actor.tenantId,
        divisionId: quote.divisionId,
        businessLine,
        quoteId: input.quoteId,
        documentNo,
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
    let quote = await this.get(existing.quoteId, actor);
    if (input.quoteId !== undefined) {
      quote = await this.get(input.quoteId, actor);
      patch.quoteId = input.quoteId;
      patch.divisionId = quote.divisionId;
    }
    const businessLine = await this.businessLineForQuote(quote, actor);
    if (input.quoteId !== undefined) patch.businessLine = businessLine;
    if (input.statusCode !== undefined) {
      const statusId = await lookupIdByCode(this.db, proformaStatuses, input.statusCode);
      if (!statusId) throw new ValidationError('Geçersiz proforma durumu', { field: 'statusCode' });
      patch.statusId = statusId;
    }
    for (const k of ['issueDate', 'fileId'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    if (input.documentNo !== undefined) patch.documentNo = normalizeSeriesDocumentNo(input.documentNo, businessLine);
    else if (input.quoteId !== undefined && businessLine !== existing.businessLine) {
      patch.documentNo = await nextSeriesDocumentNo(this.db, actor.tenantId, businessLine, 'proforma', input.issueDate ?? existing.issueDate);
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

  async deleteProforma(id: string, actor: AuthContext) {
    const existing = await this.getProforma(id, actor);
    const now = new Date();
    await this.db.update(proformas).set({ deletedAt: now }).where(eq(proformas.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'proforma.deleted',
      resourceType: 'proforma',
      resourceId: id,
      oldValues: existing,
      newValues: { deletedAt: now },
    });
    return { ok: true };
  }

  async listContracts(actor: AuthContext, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const where = and(
      eq(contracts.tenantId, actor.tenantId),
      isNull(contracts.deletedAt),
      resourceDivisionFilter(actor, 'contracts', contracts.divisionId) ?? sql`true`
    );
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(contracts).where(where);
    const rows = await this.db
      .select({
        contract: contracts,
        quote: { id: quotes.id, documentNo: quotes.documentNo, companyId: quotes.companyId, opportunityId: quotes.opportunityId, grandTotal: quotes.grandTotal },
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        currency: { id: currencies.id, code: currencies.code },
        status: { id: contractStatuses.id, code: contractStatuses.code, name: contractStatuses.name },
      })
      .from(contracts)
      .leftJoin(quotes, eq(contracts.quoteId, quotes.id))
      .leftJoin(companies, eq(quotes.companyId, companies.id))
      .leftJoin(currencies, eq(quotes.currencyId, currencies.id))
      .leftJoin(contractStatuses, eq(contracts.statusId, contractStatuses.id))
      .where(where)
      .orderBy(desc(contracts.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({ ...r.contract, quote: r.quote, company: r.company, currency: r.currency, status: r.status })),
      count,
      page
    );
  }

  async createContract(input: ContractCreateInput, actor: AuthContext) {
    const quote = await this.get(input.quoteId, actor);
    const businessLine = await this.businessLineForQuote(quote, actor);
    const contractNo =
      normalizeSeriesDocumentNo(input.contractNo, businessLine) ??
      (await nextSeriesDocumentNo(this.db, actor.tenantId, businessLine, 'contract', input.signedDate ?? new Date()));
    const statusId = await lookupIdByCode(this.db, contractStatuses, input.statusCode);
    if (!statusId) throw new ValidationError('Geçersiz sözleşme durumu', { field: 'statusCode' });
    const [row] = await this.db
      .insert(contracts)
      .values({
        tenantId: actor.tenantId,
        divisionId: quote.divisionId,
        businessLine,
        quoteId: input.quoteId,
        contractNo,
        signedDate: input.signedDate ?? null,
        paymentTermDays: input.paymentTermDays ?? null,
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
    let quote = await this.get(existing.quoteId, actor);
    if (input.quoteId !== undefined) {
      quote = await this.get(input.quoteId, actor);
      patch.quoteId = input.quoteId;
      patch.divisionId = quote.divisionId;
    }
    const businessLine = await this.businessLineForQuote(quote, actor);
    if (input.quoteId !== undefined) patch.businessLine = businessLine;
    if (input.statusCode !== undefined) {
      const statusId = await lookupIdByCode(this.db, contractStatuses, input.statusCode);
      if (!statusId) throw new ValidationError('Geçersiz sözleşme durumu', { field: 'statusCode' });
      patch.statusId = statusId;
    }
    for (const k of ['signedDate', 'paymentTermDays', 'fileId'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    if (input.contractNo !== undefined) patch.contractNo = normalizeSeriesDocumentNo(input.contractNo, businessLine);
    else if (input.quoteId !== undefined && businessLine !== existing.businessLine) {
      patch.contractNo = await nextSeriesDocumentNo(this.db, actor.tenantId, businessLine, 'contract', input.signedDate ?? existing.signedDate ?? new Date());
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

  async deleteContract(id: string, actor: AuthContext) {
    const existing = await this.getContract(id, actor);
    const now = new Date();
    await this.db.update(contracts).set({ deletedAt: now }).where(eq(contracts.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'contract.deleted',
      resourceType: 'contract',
      resourceId: id,
      oldValues: existing,
      newValues: { deletedAt: now },
    });
    return { ok: true };
  }

  async listCommercialInvoices(actor: AuthContext, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const where = and(
      eq(commercialInvoices.tenantId, actor.tenantId),
      isNull(commercialInvoices.deletedAt),
      resourceDivisionFilter(actor, 'commercial_invoices', commercialInvoices.divisionId) ?? sql`true`
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
    const businessLine = await this.businessLineForQuote(quote, actor);
    const invoiceNo =
      normalizeSeriesDocumentNo(input.invoiceNo, businessLine) ??
      (await nextSeriesDocumentNo(this.db, actor.tenantId, businessLine, 'commercial_invoice', input.invoiceDate));
    const statusId = await lookupIdByCode(this.db, invoiceStatuses, input.statusCode);
    if (!statusId) throw new ValidationError('Geçersiz ticari fatura durumu', { field: 'statusCode' });
    const [row] = await this.db
      .insert(commercialInvoices)
      .values({
        tenantId: actor.tenantId,
        divisionId: quote.divisionId,
        businessLine,
        quoteId: input.quoteId,
        invoiceNo,
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
    let quote = await this.get(existing.quoteId, actor);
    if (input.quoteId !== undefined) {
      quote = await this.get(input.quoteId, actor);
      patch.quoteId = input.quoteId;
      patch.divisionId = quote.divisionId;
    }
    const businessLine = await this.businessLineForQuote(quote, actor);
    if (input.quoteId !== undefined) patch.businessLine = businessLine;
    if (input.statusCode !== undefined) {
      const statusId = await lookupIdByCode(this.db, invoiceStatuses, input.statusCode);
      if (!statusId) throw new ValidationError('Geçersiz ticari fatura durumu', { field: 'statusCode' });
      patch.statusId = statusId;
    }
    for (const k of ['invoiceDate', 'fileId'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    if (input.invoiceNo !== undefined) patch.invoiceNo = normalizeSeriesDocumentNo(input.invoiceNo, businessLine);
    else if (input.quoteId !== undefined && businessLine !== existing.businessLine) {
      patch.invoiceNo = await nextSeriesDocumentNo(this.db, actor.tenantId, businessLine, 'commercial_invoice', input.invoiceDate ?? existing.invoiceDate);
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

  async deleteCommercialInvoice(id: string, actor: AuthContext) {
    const existing = await this.getCommercialInvoice(id, actor);
    await this.db.update(commercialInvoices).set({ deletedAt: new Date() }).where(eq(commercialInvoices.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'commercial_invoice.deleted',
      resourceType: 'commercial_invoice',
      resourceId: id,
      oldValues: existing,
    });
    return { ok: true };
  }

  private async getProforma(id: string, actor: AuthContext) {
    const row = await this.db.query.proformas.findFirst({
      where: and(
        eq(proformas.id, id),
        eq(proformas.tenantId, actor.tenantId),
        isNull(proformas.deletedAt),
        resourceDivisionFilter(actor, 'proformas', proformas.divisionId) ?? sql`true`
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
        resourceDivisionFilter(actor, 'contracts', contracts.divisionId) ?? sql`true`
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
        resourceDivisionFilter(actor, 'commercial_invoices', commercialInvoices.divisionId) ?? sql`true`
      ),
    });
    if (!row) throw new NotFoundError('Ticari fatura');
    return row;
  }
}
