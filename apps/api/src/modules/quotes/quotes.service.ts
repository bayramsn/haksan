import { Inject, Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { quotes, quoteItems, quoteTerms, proformas, contracts, commercialInvoices } from '../../db/schema/quotes';
import { companies, companyAddresses, companyEmails, companyPhones, contactCompanies, contacts } from '../../db/schema/companies';
import { opportunities, opportunityApprovals, salesActivities } from '../../db/schema/crm';
import { receivables } from '../../db/schema/finance';
import { inventoryItems } from '../../db/schema/inventory';
import { brands, productModels } from '../../db/schema/products';
import { departments, divisions } from '../../db/schema/tenants';
import { users } from '../../db/schema/users';
import { files, fileLinks } from '../../db/schema/files';
import {
  activityTypes,
  currencies,
  units,
  quoteStatuses,
  proformaStatuses,
  contractStatuses,
  invoiceStatuses,
  productGroups,
  productTypes,
  userTitles,
} from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type {
  CommercialInvoiceCreateInput,
  CommercialInvoiceUpdateInput,
  ContractCreateInput,
  DocumentSignatureSnapshot,
  ContractUpdateInput,
  Pagination,
  ProformaCreateInput,
  ProformaFreeItemInput,
  ProformaPriceItemInput,
  ProformaUpdateInput,
  QuoteCreateInput,
  QuoteItemCreateInput,
  QuoteItemUpdateInput,
  QuoteStatusChangeInput,
  QuoteTermsUpsertInput,
  QuoteUpdateInput,
  StandaloneContractCreateInput,
  StandaloneContractUpdateInput,
  StandaloneProformaCreateInput,
  StandaloneProformaUpdateInput,
  StandaloneQuoteCreateInput,
} from '@haksan/shared';
import {
  DISCOUNT_APPROVAL_THRESHOLD_PERCENT,
  computeCustomsCharges,
  discountPercent,
  isMachiningCenterTypeCode,
  referencePriceDiscountPercent,
  requiresDiscountApproval,
  requiresReferencePriceApproval,
} from '@haksan/shared';
import { FxService } from '../fx/fx.service';
import { SignaturesService } from '../signatures/signatures.service';
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

export type CatalogQuoteItemRequest = {
  productModelId: string;
  quantity: number;
  discountPercent?: number;
};

export type CatalogQuoteItemPreview = {
  productModelId: string;
  description: string;
  stockCode?: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  vatRate: number;
};

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
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Anlık görüntüye gömülecek belge başlığı — kendi `documentSnapshot` sütunu
 * ATILIR. Fiyat her yeniden pazarlık edildiğinde görüntü yeniden kuruluyor ve
 * `{ ...existing }` bir önceki görüntüyü de taşıdığı için, temizlenmezse JSONB
 * her düzenlemede bir kat daha katlanıyordu (belge listesi bu sütunu tam olarak
 * döndürdüğü için yük doğrudan açılış süresine biniyor).
 */
const documentHeaderOnly = (document: Record<string, unknown>) => {
  const { documentSnapshot: _nested, ...header } = document;
  return header;
};

/**
 * Belgenin kendi şartları — yoksa `null` ve çıktı teklifin şartlarına düşer.
 *
 * Proforma/sözleşme ekranındaki düzenleme eskiden `quote_terms`'i yeniden
 * yazıyordu; imza masasında yazılan bir teslim şartı onaylı teklifin çıktısını
 * da geriye dönük değiştiriyordu. Şart artık belgenin `terms` sütununda durur.
 */
const documentOwnTerms = (document: Record<string, unknown>) => {
  const terms = document.terms;
  return terms && typeof terms === 'object' ? (terms as Record<string, unknown>) : null;
};

/** Belgeye özel genel iskonto girdisi (tutar ya da yüzde). */
type DocumentHeaderDiscount = { amount?: number; percent?: number };

/**
 * Genel iskontoyu kısmi PATCH'lerde korur: istekte alan yoksa belgenin
 * anlık görüntüsünde saklanan girdi devam eder, o da yoksa belge bağlı
 * teklifin genel iskontosuna düşer.
 */
const mergeDocumentHeaderDiscount = (
  snapshot: unknown,
  input: { headerDiscountAmount?: number; headerDiscountPercent?: number },
): DocumentHeaderDiscount | undefined => {
  if (input.headerDiscountAmount !== undefined || input.headerDiscountPercent !== undefined) {
    return { amount: input.headerDiscountAmount, percent: input.headerDiscountPercent };
  }
  const stored = snapshot && typeof snapshot === 'object'
    ? (snapshot as { documentDiscount?: unknown }).documentDiscount
    : null;
  if (!stored || typeof stored !== 'object') return undefined;
  const amount = Number((stored as { amount?: unknown }).amount);
  const percent = Number((stored as { percent?: unknown }).percent);
  if (!Number.isFinite(amount) && !Number.isFinite(percent)) return undefined;
  return {
    amount: Number.isFinite(amount) ? amount : undefined,
    percent: Number.isFinite(percent) ? percent : undefined,
  };
};
const publicProductLabel = (
  catalogName: string | null | undefined,
  description: string | null | undefined,
  stockCode: string | null | undefined,
) => {
  let label = String(catalogName ?? '').trim() || String(description ?? '').trim();
  const code = String(stockCode ?? '').trim();
  if (code) {
    label = label
      .replace(new RegExp(escapeRegExp(code), 'giu'), ' ')
      .replace(/^[\s./|:;,_–—-]+|[\s./|:;,_–—-]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return label || 'Ürün';
};

@Injectable()
export class QuotesService {
  private async assertContractFile(
    fileId: string,
    actor: AuthContext,
    relation: { opportunityId?: string | null; companyId?: string | null },
  ) {
    const file = await this.db.query.files.findFirst({
      where: and(
        eq(files.id, fileId),
        eq(files.tenantId, actor.tenantId),
        isNull(files.deletedAt),
      ),
    });
    if (!file) throw new ValidationError('İmzalı sözleşme dosyası bulunamadı', { field: 'fileId' });
    if (file.bucket !== 'erp-contract-documents') {
      throw new ValidationError('Sözleşme dosyası yanlış depolama alanında', { field: 'fileId' });
    }
    if (file.uploadStatus !== 'linked' || file.mimeType !== 'application/pdf' || file.extension.toLowerCase() !== 'pdf') {
      throw new ValidationError('İmzalı sözleşme tamamlanmış ve PDF formatında olmalıdır', { field: 'fileId' });
    }
    const allowedRelations = [
      relation.opportunityId ? { entityType: 'opportunity', entityId: relation.opportunityId } : null,
      relation.companyId ? { entityType: 'company', entityId: relation.companyId } : null,
    ].filter((item): item is { entityType: string; entityId: string } => Boolean(item));
    const links = await this.db
      .select({ entityType: fileLinks.entityType, entityId: fileLinks.entityId })
      .from(fileLinks)
      .where(and(eq(fileLinks.tenantId, actor.tenantId), eq(fileLinks.fileId, fileId)));
    if (!allowedRelations.some((allowed) => links.some(
      (link) => link.entityType === allowed.entityType && link.entityId === allowed.entityId,
    ))) {
      throw new ValidationError('İmzalı sözleşme bu fırsat veya firmaya bağlı değil', { field: 'fileId' });
    }
  }
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService,
    private readonly fx: FxService,
    private readonly signatures: SignaturesService
  ) {}

  /**
   * Belge gövdesinden gelen imza seçimini tabloya yazılacak kolona çevirir.
   *
   * `undefined` → alan gönderilmedi, mevcut seçim korunur (patch'e girmez).
   * `null`      → imza kaldırılır.
   * Dolu değer  → kiracı, bölüm ve aktiflik doğrulanır (SignaturesService).
   *
   * Belgeye gömülen ad/ünvan/görsel kopyası burada değil, `document_snapshot`
   * üretilirken alınır: snapshot belgenin dondurulduğu andaki imzayı taşımalı,
   * seçimin yapıldığı andakini değil.
   */
  private async resolveSignatureId(
    signatureId: string | null | undefined,
    actor: AuthContext
  ): Promise<string | null | undefined> {
    if (signatureId === undefined) return undefined;
    if (signatureId === null) return null;
    return (await this.signatures.resolveForDocument(signatureId, actor)).signatureId;
  }

  /** Belgenin `signature_id`'sinden `document_snapshot`'a gömülecek kopyayı üretir. */
  private async captureSignatureSnapshot(
    signatureId: string | null | undefined,
    actor: AuthContext
  ): Promise<DocumentSignatureSnapshot | null> {
    if (!signatureId) return null;
    // Seçim yapıldıktan sonra imza pasife alınmış/silinmiş olabilir; belgeyi
    // dondurmak bu yüzden patlamamalı, imza sessizce boş kalır.
    try {
      return (await this.signatures.resolveForDocument(signatureId, actor)).snapshot;
    } catch {
      return null;
    }
  }

  private async invalidateInvoiceApprovals(quoteIds: string[], actor: AuthContext, reason: string) {
    const ids = [...new Set(quoteIds.filter(Boolean))];
    if (!ids.length) return;
    const rows = await this.db
      .select({ opportunityId: quotes.opportunityId })
      .from(quotes)
      .where(
        and(
          eq(quotes.tenantId, actor.tenantId),
          inArray(quotes.id, ids),
          isNull(quotes.deletedAt)
        )
      );
    const opportunityIds = [
      ...new Set(rows.map((row) => row.opportunityId).filter((id): id is string => Boolean(id))),
    ];
    if (!opportunityIds.length) return;
    await this.db
      .update(opportunityApprovals)
      .set({
        status: 'pending',
        decidedBy: null,
        decidedAt: null,
        note: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(opportunityApprovals.tenantId, actor.tenantId),
          inArray(opportunityApprovals.opportunityId, opportunityIds),
          inArray(opportunityApprovals.approvalType, ['invoice', 'win']),
          isNull(opportunityApprovals.deletedAt)
        )
      );
    for (const opportunityId of opportunityIds) {
      await this.audit.write({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'opportunity.approvals.invalidated',
        resourceType: 'opportunity',
        resourceId: opportunityId,
        oldValues: { approvalTypes: ['invoice', 'win'] },
        newValues: { status: 'pending', reason },
      });
    }
  }

  /** 1 USD karşılığı teklif para birimi tutarı (USD teklif için 1). */
  private async usdToQuoteRate(currencyCode: string | null | undefined): Promise<number> {
    const code = (currencyCode || 'USD').toUpperCase();
    if (code === 'USD') return 1;
    const snapshot = await this.fx.rates();
    const rate = (snapshot.rates as Record<string, number>)[code];
    return Number.isFinite(rate) && rate > 0 ? rate : 1;
  }

  private calcItem(qty: number, unitPrice: number, discount: number, vatRate: number): ItemTotals & { lineTotal: number; vatAmount: number } {
    const gross = qty * unitPrice;
    const subtotal = gross - discount;
    const vat = subtotal * (vatRate / 100);
    const total = subtotal + vat;
    return { subtotal, discount, vat, total, lineTotal: subtotal, vatAmount: vat };
  }

  private assertItemDiscount(quantity: number, unitPrice: number, discountAmount: number) {
    const gross = quantity * unitPrice;
    if (!Number.isFinite(gross) || gross < 0 || !Number.isFinite(discountAmount) || discountAmount < 0) {
      throw new ValidationError('Ürün fiyatı ve iskontosu geçerli bir tutar olmalı');
    }
    if (discountAmount > gross + 0.0001) {
      throw new ValidationError('Ürüne özel iskonto satırın brüt tutarını aşamaz', {
        field: 'discountAmount',
      });
    }
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
    const customsTotal = await this.calcCustomsTotal(quote?.currencyId ?? null, items);
    const grand = subtotal - discount + vat + customsTotal;
    await this.db
      .update(quotes)
      .set({
        subtotal: (subtotal - discount).toFixed(4),
        discountTotal: discount.toFixed(4),
        vatAmount: vat.toFixed(4),
        customsTotal: customsTotal.toFixed(4),
        grandTotal: grand.toFixed(4),
      })
      .where(eq(quotes.id, quoteId));
  }

  /**
   * Millileştirilmiş işleme merkezi satırları için otomatik gümrük/vergi toplamı.
   * Yalnız ürün tipi işleme merkezi VE `nationalized` işaretli satırlar dahildir.
   * Sabit USD ücretler teklif para birimine güncel kur ile çevrilir.
   */
  private async calcCustomsTotal(
    currencyId: string | null,
    items: Array<{
      nationalized: boolean;
      productModelId: string | null;
      quantity: string | number;
      unitPrice: string | number;
    }>
  ): Promise<number> {
    const nationalized = items.filter((it) => it.nationalized);
    if (!nationalized.length) return 0;

    const modelIds = [...new Set(nationalized.map((it) => it.productModelId).filter((id): id is string => Boolean(id)))];
    if (!modelIds.length) return 0;
    const typeRows = await this.db
      .select({ id: productModels.id, code: productTypes.code })
      .from(productModels)
      .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
      .where(inArray(productModels.id, modelIds));
    const typeByModel = new Map(typeRows.map((row) => [row.id, row.code ?? null]));

    const machining = nationalized.filter(
      (it) => it.productModelId && isMachiningCenterTypeCode(typeByModel.get(it.productModelId))
    );
    if (!machining.length) return 0;

    const currencyCode = currencyId
      ? (await this.db.query.currencies.findFirst({ where: eq(currencies.id, currencyId) }))?.code ?? 'USD'
      : 'USD';
    const usdToQuoteRate = await this.usdToQuoteRate(currencyCode);

    let total = 0;
    for (const it of machining) {
      const gross = Number(it.quantity) * Number(it.unitPrice);
      const charges = computeCustomsCharges({ lineTotal: gross, quantity: Number(it.quantity), usdToQuoteRate });
      total += charges.total;
    }
    return Number(total.toFixed(4));
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

  private async resolveCompanyAddress(
    companyId: string,
    companyAddressId: string | undefined,
    actor: AuthContext,
  ) {
    const rows = await this.db
      .select()
      .from(companyAddresses)
      .where(and(
        eq(companyAddresses.companyId, companyId),
        eq(companyAddresses.tenantId, actor.tenantId),
        isNull(companyAddresses.deletedAt),
      ))
      .orderBy(desc(companyAddresses.isBilling), desc(companyAddresses.isDefault), companyAddresses.createdAt);
    if (!companyAddressId) return rows[0] ?? null;
    const selected = rows.find((address) => address.id === companyAddressId);
    if (!selected) {
      throw new ValidationError('PDF için seçilen adres bu firmaya ait değil', {
        field: 'companyAddressId',
      });
    }
    return selected;
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

  /**
   * Teklif otomasyonu fiyatı hiçbir zaman LLM'den almaz. Ürün kimliği, bölüm
   * görünürlüğü, para birimi ve fiyat burada sunucu tarafında doğrulanır.
   */
  async previewCatalogItems(
    items: CatalogQuoteItemRequest[],
    actor: AuthContext,
    quoteDivisionId?: string | null,
    currencyCode = 'USD'
  ): Promise<CatalogQuoteItemPreview[]> {
    const currency = await this.db.query.currencies.findFirst({ where: eq(currencies.code, currencyCode) });
    if (!currency) throw new ValidationError('Geçersiz para birimi');

    const previews: CatalogQuoteItemPreview[] = [];
    for (const item of items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 100_000) {
        throw new ValidationError('Ürün miktarı 0 ile 100.000 arasında olmalı');
      }
      const discountPercent = item.discountPercent ?? 0;
      if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
        throw new ValidationError('İndirim oranı 0 ile 100 arasında olmalı');
      }
      const product = await this.assertProductModel(item.productModelId, actor, quoteDivisionId);
      if (!product.isActive) throw new ValidationError(`${product.modelCode} ürünü aktif değil`);
      if (product.currencyId && product.currencyId !== currency.id) {
        throw new ValidationError(`${product.modelCode} ürününün para birimi teklif para birimiyle uyuşmuyor`);
      }
      const listPrice = Number(product.listPrice ?? 0);
      const cashPrice = Number(product.cashPrice ?? 0);
      const unitPrice = listPrice > 0 ? listPrice : cashPrice;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new ValidationError(`${product.modelCode} için katalog fiyatı tanımlı değil`);
      }
      const discountAmount = Number((item.quantity * unitPrice * (discountPercent / 100)).toFixed(4));
      previews.push({
        productModelId: product.id,
        description: product.fullName,
        stockCode: product.stockCode ?? undefined,
        quantity: item.quantity,
        unitPrice,
        discountPercent,
        discountAmount,
        vatRate: Number(product.vatRate ?? 20),
      });
    }
    return previews;
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

  private assertQuoteMutable(quote: { approvedAt: Date | null; finalizedAt?: Date | null }) {
    if (quote.approvedAt || quote.finalizedAt) {
      throw new ConflictError('Kesinleşmiş teklif değiştirilemez; yeni bir revizyon oluşturun');
    }
  }

  private async quoteStatusCode(statusId: string | null | undefined) {
    if (!statusId) return null;
    const status = await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.id, statusId) });
    return status?.code ?? null;
  }

  private async quotePriceCheck(quoteId: string) {
    const [rows, quote] = await Promise.all([
      this.db
        .select({ item: quoteItems, product: productModels })
        .from(quoteItems)
        .leftJoin(productModels, eq(quoteItems.productModelId, productModels.id))
        .where(and(eq(quoteItems.quoteId, quoteId), isNull(quoteItems.deletedAt))),
      this.db.query.quotes.findFirst({ where: eq(quotes.id, quoteId) }),
    ]);
    const belowItems = rows
      .map((row) => {
        const product = row.product;
        if (!product) return null;
        const basePrice = Number(product.cashPrice ?? product.listPrice ?? 0);
        if (!Number.isFinite(basePrice) || basePrice <= 0) return null;
        const quantity = Number(row.item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) return null;
        const netUnitPrice = Math.max((quantity * Number(row.item.unitPrice) - Number(row.item.discountAmount ?? 0)) / quantity, 0);
        if (!requiresReferencePriceApproval(basePrice, netUnitPrice)) return null;
        return {
          itemId: row.item.id,
          productModelId: product.id,
          productName: product.fullName,
          stockCode: row.item.stockCode ?? product.stockCode,
          basePrice,
          netUnitPrice,
          discountPercent: referencePriceDiscountPercent(basePrice, netUnitPrice),
        };
      })
      .filter(Boolean) as Array<{
      itemId: string;
      productModelId: string;
      productName: string;
      stockCode: string | null;
      basePrice: number;
      netUnitPrice: number;
      discountPercent: number;
    }>;
    const grossTotal = rows.reduce(
      (sum, row) => sum + Number(row.item.quantity) * Number(row.item.unitPrice),
      0,
    );
    const lineDiscountTotal = rows.reduce(
      (sum, row) => sum + Number(row.item.discountAmount ?? 0),
      0,
    );
    const totalDiscount = Math.max(Number(quote?.discountTotal ?? 0), lineDiscountTotal);
    const totalDiscountPercent = discountPercent(grossTotal, totalDiscount);
    const documentDiscountNeedsApproval = requiresDiscountApproval(grossTotal, totalDiscount);
    return {
      needsApproval: belowItems.length > 0 || documentDiscountNeedsApproval,
      belowItems,
      discountSummary: {
        thresholdPercent: DISCOUNT_APPROVAL_THRESHOLD_PERCENT,
        grossTotal,
        discountTotal: totalDiscount,
        discountPercent: totalDiscountPercent,
      },
    };
  }

  private async refreshPriceApprovalStatus(quoteId: string, actor: AuthContext) {
    const check = await this.quotePriceCheck(quoteId);
    if (!check.needsApproval) {
      const [quote, pendingStatusId, draftStatusId] = await Promise.all([
        this.db.query.quotes.findFirst({ where: eq(quotes.id, quoteId) }),
        lookupIdByCode(this.db, quoteStatuses, 'pending_super_admin_approval'),
        lookupIdByCode(this.db, quoteStatuses, 'draft'),
      ]);
      await this.db
        .update(quotes)
        .set({
          ...(quote?.statusId === pendingStatusId && draftStatusId ? { statusId: draftStatusId } : {}),
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
    throw new ConflictError(`%${DISCOUNT_APPROVAL_THRESHOLD_PERCENT} üzeri indirim için onay gerekiyor`, {
      belowItems: check.belowItems,
      discountSummary: check.discountSummary,
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
        contact: { id: contacts.id, fullName: contacts.fullName },
        status: { id: quoteStatuses.id, code: quoteStatuses.code, name: quoteStatuses.name },
        currency: { id: currencies.id, code: currencies.code },
        division: { id: divisions.id, code: divisions.code, name: divisions.name },
      })
      .from(quotes)
      .leftJoin(
        companies,
        and(
          eq(quotes.companyId, companies.id),
          eq(companies.tenantId, actor.tenantId),
          isNull(companies.deletedAt),
        ),
      )
      .leftJoin(
        contacts,
        and(
          eq(quotes.contactId, contacts.id),
          eq(contacts.tenantId, actor.tenantId),
          isNull(contacts.deletedAt),
        ),
      )
      .leftJoin(quoteStatuses, eq(quotes.statusId, quoteStatuses.id))
      .leftJoin(currencies, eq(quotes.currencyId, currencies.id))
      .leftJoin(divisions, eq(quotes.divisionId, divisions.id))
      .where(where)
      .orderBy(desc(quotes.quoteDate))
      .limit(limit)
      .offset(offset);
    const quoteIds = rows.map((row) => row.quote.id);
    const quoteProductRows = quoteIds.length
      ? await this.db
          .select({
            quoteId: quoteItems.quoteId,
            description: quoteItems.description,
            productName: productModels.fullName,
            sortOrder: quoteItems.sortOrder,
          })
          .from(quoteItems)
          .leftJoin(productModels, eq(quoteItems.productModelId, productModels.id))
          .where(and(
            eq(quoteItems.tenantId, actor.tenantId),
            inArray(quoteItems.quoteId, quoteIds),
            isNull(quoteItems.deletedAt),
          ))
          .orderBy(quoteItems.sortOrder)
      : [];
    const productNamesByQuoteId = new Map<string, string[]>();
    for (const item of quoteProductRows) {
      const description = item.description.trim();
      if (description.startsWith('↳ Opsiyon:')) continue;
      const productName = item.productName?.trim() || description;
      if (!productName) continue;
      const names = productNamesByQuoteId.get(item.quoteId) ?? [];
      if (!names.includes(productName)) names.push(productName);
      productNamesByQuoteId.set(item.quoteId, names);
    }
    return buildPaginated(
      rows.map((r) => ({
        ...r.quote,
        company: r.company,
        contact: r.contact?.id ? r.contact : null,
        status: r.status,
        currency: r.currency,
        division: r.division,
        productName: productNamesByQuoteId.get(r.quote.id)?.join(' / ') ?? null,
      })),
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
    const items = await this.db
      .select()
      .from(quoteItems)
      .where(and(eq(quoteItems.quoteId, id), isNull(quoteItems.deletedAt)))
      .orderBy(quoteItems.sortOrder, quoteItems.createdAt);
    const terms = await this.db.query.quoteTerms.findFirst({ where: eq(quoteTerms.quoteId, id) });
    const [projectOwner] = quote.projectOwnerUserId
      ? await this.db
          .select({
            id: users.id,
            name: users.fullName,
            email: users.email,
            phone: users.phone,
            title: userTitles.name,
            department: departments.name,
          })
          .from(users)
          .leftJoin(userTitles, eq(users.titleId, userTitles.id))
          .leftJoin(departments, eq(users.departmentId, departments.id))
          .where(and(
            eq(users.id, quote.projectOwnerUserId),
            eq(users.tenantId, actor.tenantId),
            isNull(users.deletedAt),
          ))
          .limit(1)
      : [];
    return { ...quote, items, terms, projectOwner: projectOwner ?? null };
  }

  private async buildDocumentSnapshot(quoteId: string, actor: AuthContext) {
    const quote = await this.get(quoteId, actor);
    const { items, terms, projectOwner, documentSnapshot: _documentSnapshot, ...quoteHeader } = quote;
    const productModelIds = [...new Set(items.map((item) => item.productModelId).filter((id): id is string => Boolean(id)))];
    const unitIds = [...new Set(items.map((item) => item.unitId).filter((id): id is string => Boolean(id)))];
    const [company, contact, currency, addresses, phones, emails, quoteReceivables, productRows, unitRows] = await Promise.all([
      this.db.query.companies.findFirst({ where: eq(companies.id, quote.companyId) }),
      quote.contactId ? this.db.query.contacts.findFirst({ where: eq(contacts.id, quote.contactId) }) : null,
      quote.currencyId ? this.db.query.currencies.findFirst({ where: eq(currencies.id, quote.currencyId) }) : null,
      this.db.select().from(companyAddresses).where(and(eq(companyAddresses.companyId, quote.companyId), isNull(companyAddresses.deletedAt))).orderBy(desc(companyAddresses.isBilling), desc(companyAddresses.isDefault), companyAddresses.createdAt),
      this.db.select().from(companyPhones).where(and(eq(companyPhones.companyId, quote.companyId), isNull(companyPhones.deletedAt))).orderBy(desc(companyPhones.isDefault), companyPhones.createdAt),
      this.db.select().from(companyEmails).where(and(eq(companyEmails.companyId, quote.companyId), isNull(companyEmails.deletedAt))).orderBy(desc(companyEmails.isDefault), companyEmails.createdAt),
      this.db.select().from(receivables).where(and(eq(receivables.quoteId, quoteId), isNull(receivables.deletedAt))).orderBy(receivables.dueDate),
      productModelIds.length
        ? this.db
            .select({
              id: productModels.id,
              brandName: brands.name,
              modelCode: productModels.modelCode,
              modelName: productModels.modelName,
              fullName: productModels.fullName,
              originCountry: productModels.originCountry,
              hsCode: productModels.hsCode,
              stockCode: productModels.stockCode,
            })
            .from(productModels)
            .leftJoin(brands, eq(productModels.brandId, brands.id))
            .where(and(eq(productModels.tenantId, actor.tenantId), inArray(productModels.id, productModelIds)))
        : Promise.resolve([]),
      unitIds.length
        ? this.db.select({ id: units.id, code: units.code }).from(units).where(inArray(units.id, unitIds))
        : Promise.resolve([]),
    ]);
    const productsById = new Map(productRows.map((product) => [product.id, product]));
    const unitsById = new Map(unitRows.map((unit) => [unit.id, unit.code]));
    const orderedAddresses = quote.companyAddressId
      ? [
          ...addresses.filter((address) => address.id === quote.companyAddressId),
          ...addresses.filter((address) => address.id !== quote.companyAddressId),
        ]
      : addresses;
    const snapshotItems = items.map((item) => ({
      ...item,
      unitCode: item.unitId ? unitsById.get(item.unitId) ?? null : null,
      product: item.productModelId ? productsById.get(item.productModelId) ?? null : null,
    }));
    return {
      schemaVersion: 2,
      capturedAt: new Date().toISOString(),
      quote: quoteHeader,
      // Yazdırma katmanı canlı imzaya değil bu bloğa bakar: imza sonradan
      // değişse veya silinse bile belge kendi bastığı imzayı korur.
      signature: await this.captureSignatureSnapshot(quote.signatureId, actor),
      projectOwner,
      company: company ?? null,
      companyAddresses: orderedAddresses,
      companyPhones: phones,
      companyEmails: emails,
      receivables: quoteReceivables,
      contact: contact ?? null,
      currency: currency ?? null,
      items: snapshotItems,
      terms: terms ?? null,
    };
  }

  /**
   * Teklife bağlı ticari belgenin (proforma / sözleşme / fatura) imzası:
   * belgenin kendi seçimi varsa o, yoksa bağlı teklifin imzası. Böylece
   * teklifte imzayı seçen kullanıcı aynı seçimi her belgede tekrarlamaz.
   */
  private async resolveCommercialSignature(
    document: Record<string, unknown>,
    inherited: DocumentSignatureSnapshot | null,
    actor: AuthContext
  ): Promise<DocumentSignatureSnapshot | null> {
    const own = document.signatureId;
    if (typeof own !== 'string' || !own) return inherited;
    return this.captureSignatureSnapshot(own, actor);
  }

  private async buildCommercialDocumentSnapshot(
    document: Record<string, unknown>,
    quoteId: string,
    actor: AuthContext
  ) {
    const snapshot = await this.buildDocumentSnapshot(quoteId, actor);
    return {
      ...snapshot,
      terms: documentOwnTerms(document) ?? snapshot.terms,
      signature: await this.resolveCommercialSignature(document, snapshot.signature, actor),
      document: documentHeaderOnly(document),
    };
  }

  /**
   * Teklife bağlı belgenin (proforma / sözleşme) kendi fiyatlarıyla dondurulmuş
   * anlık görüntüsü. Onaylı teklif kilitlidir; belge fiyatı ondan bağımsız
   * pazarlık edilebildiği için toplamlar burada yeniden hesaplanır.
   */
  private async buildPricedDocumentSnapshot(
    document: Record<string, unknown>,
    quoteId: string,
    actor: AuthContext,
    priceItems?: ProformaPriceItemInput[],
    headerDiscount?: DocumentHeaderDiscount
  ) {
    const snapshot = await this.buildDocumentSnapshot(quoteId, actor);
    const overrides = new Map((priceItems ?? []).map((item) => [item.quoteItemId, item]));
    const quoteItemIds = new Set(snapshot.items.map((item) => item.id));
    const unknownItemId = [...overrides.keys()].find((id) => !quoteItemIds.has(id));
    if (unknownItemId) {
      throw new ValidationError('Belge fiyat kalemi bağlı teklife ait değil', {
        field: 'items',
        quoteItemId: unknownItemId,
      });
    }

    const originalLineDiscount = snapshot.items.reduce(
      (sum, item) => sum + Number(item.discountAmount ?? 0),
      0
    );
    // Belgenin kendi genel iskontosu verilmemişse bağlı teklifin geneli devralınır.
    const ownHeaderDiscount =
      headerDiscount?.amount !== undefined || headerDiscount?.percent !== undefined
        ? { amount: Number(headerDiscount.amount ?? 0), percent: Number(headerDiscount.percent ?? 0) }
        : null;
    const inheritedHeaderDiscount = Math.max(
      Number(snapshot.quote.discountTotal ?? 0) - originalLineDiscount,
      0
    );
    const roundMoney = (value: number) => Number(value.toFixed(4));

    const pricedItems = snapshot.items.map((item) => {
      const quantity = Number(item.quantity ?? 0);
      const override = overrides.get(item.id);
      const unitPrice = override ? Number(override.unitPrice) : Number(item.unitPrice ?? 0);
      const discountAmount = override?.discountAmount !== undefined
        ? Number(override.discountAmount)
        : Number(item.discountAmount ?? 0);
      this.assertItemDiscount(quantity, unitPrice, discountAmount);
      const lineTotal = roundMoney(quantity * unitPrice - discountAmount);
      return {
        ...item,
        unitPrice: roundMoney(unitPrice),
        discountAmount: roundMoney(discountAmount),
        lineTotal,
      };
    });
    const lineDiscount = roundMoney(
      pricedItems.reduce((sum, item) => sum + Number(item.discountAmount), 0)
    );
    const taxableBeforeHeader = roundMoney(
      pricedItems.reduce((sum, item) => sum + Number(item.lineTotal), 0)
    );
    // Yüzde doluysa tutar net ara toplamdan türetilir (teklifteki kuralla aynı).
    const requestedHeaderDiscount = ownHeaderDiscount
      ? Math.max(
          ownHeaderDiscount.percent > 0
            ? taxableBeforeHeader * (ownHeaderDiscount.percent / 100)
            : ownHeaderDiscount.amount,
          0
        )
      : inheritedHeaderDiscount;
    const appliedHeaderDiscount = roundMoney(
      Math.min(requestedHeaderDiscount, taxableBeforeHeader)
    );
    const headerRatio = taxableBeforeHeader > 0
      ? (taxableBeforeHeader - appliedHeaderDiscount) / taxableBeforeHeader
      : 1;
    const items = pricedItems.map((item) => ({
      ...item,
      vatAmount: roundMoney(
        Number(item.lineTotal) * headerRatio * (Number(item.vatRate ?? 0) / 100)
      ),
    }));
    const subtotal = roundMoney(taxableBeforeHeader - appliedHeaderDiscount);
    const vatAmount = roundMoney(items.reduce((sum, item) => sum + Number(item.vatAmount), 0));
    const customsTotal = roundMoney(
      await this.calcCustomsTotal(snapshot.quote.currencyId ?? null, pricedItems)
    );

    return {
      ...snapshot,
      schemaVersion: 4,
      terms: documentOwnTerms(document) ?? snapshot.terms,
      signature: await this.resolveCommercialSignature(document, snapshot.signature, actor),
      // Belgenin kendi genel iskonto GİRDİSİ; PATCH'te kaybolmaması için saklanır
      // (uygulanan tutar tekrar hesaplanır, çünkü satır fiyatları değişebilir).
      documentDiscount: ownHeaderDiscount,
      quote: {
        ...snapshot.quote,
        subtotal,
        discountTotal: roundMoney(lineDiscount + appliedHeaderDiscount),
        headerDiscountAmount: appliedHeaderDiscount,
        headerDiscountPercent: ownHeaderDiscount?.percent ?? 0,
        vatAmount,
        customsTotal,
        grandTotal: roundMoney(subtotal + vatAmount + customsTotal),
      },
      items,
      document: documentHeaderOnly(document),
    };
  }

  /**
   * Taslak belge fiyatlarını kısmi PATCH çağrılarında korur.
   *
   * `items` yalnız değişen satırları taşıyabilir; ayrıca kullanıcı sadece
   * şartları güncellediğinde hiç gelmez. Önceki snapshot fiyatlarını hesaba
   * katmadan belgeyi yeniden kurmak, sözleşmede pazarlık edilen fiyatları
   * sessizce tekrar teklif fiyatına döndürüyordu.
   */
  private mergeDocumentPriceItems(
    snapshot: unknown,
    quoteItemIds: Set<string>,
    updates?: ProformaPriceItemInput[],
  ): ProformaPriceItemInput[] | undefined {
    const storedItems = snapshot && typeof snapshot === 'object'
      && Array.isArray((snapshot as { items?: unknown }).items)
      ? (snapshot as { items: Array<Record<string, unknown>> }).items
      : [];
    const stored = storedItems.flatMap((item) => {
      const quoteItemId = typeof item.id === 'string' ? item.id : '';
      const unitPrice = Number(item.unitPrice);
      const discountAmount = Number(item.discountAmount);
      return quoteItemId && quoteItemIds.has(quoteItemId) && Number.isFinite(unitPrice)
        ? [{
            quoteItemId,
            unitPrice,
            ...(Number.isFinite(discountAmount) ? { discountAmount } : {}),
          }]
        : [];
    });
    if (updates === undefined) return stored.length > 0 ? stored : undefined;

    const merged = new Map(stored.map((item) => [item.quoteItemId, item]));
    for (const update of updates) {
      const previous = merged.get(update.quoteItemId);
      merged.set(update.quoteItemId, {
        ...previous,
        ...update,
        // Birim fiyat tek başına değiştirildiğinde belgeye özel iskonto
        // teklif satırına geri düşmemeli.
        ...(update.discountAmount === undefined && previous?.discountAmount !== undefined
          ? { discountAmount: previous.discountAmount }
          : {}),
      });
    }
    return [...merged.values()];
  }

  private assertCommercialDocumentMutable(document: { finalizedAt?: Date | null }, label: string) {
    if (document.finalizedAt) {
      throw new ConflictError(`${label} kesinleşmiş; içerik değiştirilemez veya silinemez`);
    }
  }

  /**
   * Teklifi PDF olarak üretir (tenant-scope). Buffer + dosya adı döner; controller
   * stream eder. Not: PDFKit gömülü Helvetica fontu ç/ö/ü taşır ama ş/ğ/ı/İ
   * taşımaz; bu glyph'ler tr() ile sadeleştirilir. Tam diakritik için ileride
   * bir Unicode TTF (örn. DejaVuSans) gömülebilir.
   */
  async generatePdf(id: string, actor: AuthContext): Promise<{ buffer: Buffer; filename: string }> {
    const visibility = await companyVisibilityExistsFilter(this.db, actor, quotes.companyId);
    const storedQuote = await this.db.query.quotes.findFirst({
      where: and(
        eq(quotes.id, id),
        eq(quotes.tenantId, actor.tenantId),
        isNull(quotes.deletedAt),
        resourceDivisionFilter(actor, 'quotes', quotes.divisionId) ?? sql`true`,
        visibility ?? sql`true`
      ),
    });
    if (!storedQuote) throw new NotFoundError('Teklif');
    const snapshot = storedQuote.documentSnapshot as undefined | {
      quote?: typeof storedQuote;
      items?: Array<typeof quoteItems.$inferSelect & { product?: { fullName?: string | null } | null }>;
      terms?: typeof quoteTerms.$inferSelect | null;
      company?: typeof companies.$inferSelect | null;
      companyAddresses?: Array<typeof companyAddresses.$inferSelect>;
      contact?: typeof contacts.$inferSelect | null;
      currency?: typeof currencies.$inferSelect | null;
    };
    const quote = snapshot?.quote ? { ...storedQuote, ...snapshot.quote } : storedQuote;
    const items = snapshot?.items ?? await this.db
      .select()
      .from(quoteItems)
      .where(and(eq(quoteItems.quoteId, id), isNull(quoteItems.deletedAt)))
      .orderBy(quoteItems.sortOrder);
    const itemProductIds = [...new Set(items.map((item) => item.productModelId).filter((value): value is string => Boolean(value)))];
    const itemProducts = itemProductIds.length
      ? await this.db
          .select({ id: productModels.id, fullName: productModels.fullName, typeCode: productTypes.code })
          .from(productModels)
          .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
          .where(and(eq(productModels.tenantId, actor.tenantId), inArray(productModels.id, itemProductIds), isNull(productModels.deletedAt)))
      : [];
    const itemProductNames = new Map(itemProducts.map((product) => [product.id, product.fullName]));
    const itemProductTypes = new Map(itemProducts.map((product) => [product.id, product.typeCode]));
    const customsTotal = Math.max(0, Number(quote.customsTotal ?? 0));
    const nationalizedIndexes = items
      .map((item, index) => item.nationalized ? index : -1)
      .filter((index) => index >= 0);
    const machiningIndexes = items
      .map((item, index) => item.productModelId && isMachiningCenterTypeCode(itemProductTypes.get(item.productModelId)) ? index : -1)
      .filter((index) => index >= 0);
    const eligibleIndexes = nationalizedIndexes.filter((index) => {
      const productModelId = items[index].productModelId;
      const typeCode = productModelId ? itemProductTypes.get(productModelId) : null;
      return !typeCode || isMachiningCenterTypeCode(typeCode);
    });
    const allocationIndexes = eligibleIndexes.length
      ? eligibleIndexes
      : nationalizedIndexes.length
        ? nationalizedIndexes
        : machiningIndexes;
    const customsAllocations = items.map(() => 0);
    const allocationGross = allocationIndexes.reduce(
      (sum, index) => sum + Math.max(0, Number(items[index].quantity) * Number(items[index].unitPrice)),
      0,
    );
    let allocatedCustoms = 0;
    allocationIndexes.forEach((index, allocationIndex) => {
      const weight = allocationGross > 0
        ? Math.max(0, Number(items[index].quantity) * Number(items[index].unitPrice)) / allocationGross
        : 1 / allocationIndexes.length;
      const allocation = allocationIndex === allocationIndexes.length - 1
        ? customsTotal - allocatedCustoms
        : Number((customsTotal * weight).toFixed(4));
      customsAllocations[index] = allocation;
      allocatedCustoms += allocation;
    });
    const terms = snapshot ? (snapshot.terms ?? null) : await this.db.query.quoteTerms.findFirst({ where: eq(quoteTerms.quoteId, id) });
    const company = snapshot ? (snapshot.company ?? null) : await this.db.query.companies.findFirst({ where: eq(companies.id, quote.companyId) });
    const liveCompanyAddresses = snapshot
      ? []
      : await this.db.select().from(companyAddresses)
          .where(and(eq(companyAddresses.companyId, quote.companyId), isNull(companyAddresses.deletedAt)))
          .orderBy(desc(companyAddresses.isBilling), desc(companyAddresses.isDefault), companyAddresses.createdAt);
    const companyAddress = snapshot
      ? (snapshot.companyAddresses?.[0] ?? null)
      : liveCompanyAddresses.find((address) => address.id === quote.companyAddressId) ?? liveCompanyAddresses[0] ?? null;
    const contact = snapshot ? (snapshot.contact ?? null) : (quote.contactId
      ? await this.db.query.contacts.findFirst({ where: eq(contacts.id, quote.contactId) })
      : null);
    const currency = snapshot ? (snapshot.currency ?? null) : (quote.currencyId
      ? await this.db.query.currencies.findFirst({ where: eq(currencies.id, quote.currencyId) })
      : null);
    const status = storedQuote.statusId
      ? await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.id, storedQuote.statusId) })
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

    const drawDraftWatermark = () => {
      doc.save();
      doc.opacity(0.08);
      doc.fillColor('#6b7280');
      doc.font(boldFont).fontSize(72);
      doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.text('TASLAK', 95, doc.page.height / 2 - 35, { width: 405, align: 'center' });
      doc.restore();
    };
    const isFinalDocument = !!storedQuote.finalizedAt || status?.code === 'sent' || status?.code === 'approved';
    if (!isFinalDocument) {
      drawDraftWatermark();
      doc.on('pageAdded', drawDraftWatermark);
    }

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
    if (companyAddress) {
      const addressText = companyAddress.fullAddress || [
        companyAddress.street,
        companyAddress.buildingNumber,
        companyAddress.district,
        companyAddress.province,
        companyAddress.country,
      ].filter(Boolean).join(' ');
      if (addressText) doc.text(`Adres: ${tr(addressText)}`, 50);
    }
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
    const x = { no: 50, stock: 75, desc: 240, qty: 340, price: 400, total: 480 };
    const colW = { stock: 160, desc: 95, qty: 55, price: 75, total: 65 };

    // Tek satırlık parasal alanları kolona sığdırır. Açıklama alanları aşağıda
    // satırlara bölünerek eksiksiz yazılır; belge verisi hiçbir zaman kesilmez.
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

    const wrapCellLines = (value: string, width: number, font = regularFont, size = 9): string[] => {
      doc.font(font).fontSize(size);
      const lines: string[] = [];
      const paragraphs = value.replace(/\r\n?/g, '\n').split('\n');
      const splitLongToken = (token: string) => {
        const parts: string[] = [];
        let current = '';
        for (const char of token) {
          if (current && doc.widthOfString(current + char) > width) {
            parts.push(current);
            current = char;
          } else {
            current += char;
          }
        }
        if (current) parts.push(current);
        return parts;
      };
      paragraphs.forEach((paragraph) => {
        if (!paragraph.trim()) {
          lines.push('');
          return;
        }
        let current = '';
        const tokens = paragraph.trim().split(/\s+/).flatMap((token) =>
          doc.widthOfString(token) <= width ? [token] : splitLongToken(token));
        tokens.forEach((token) => {
          const candidate = current ? `${current} ${token}` : token;
          if (current && doc.widthOfString(candidate) > width) {
            lines.push(current);
            current = token;
          } else {
            current = candidate;
          }
        });
        lines.push(current);
      });
      return lines.length ? lines : [''];
    };

    // Tablo başlığı her sayfada yeniden çizilir.
    const drawTableHeader = (headerY: number) => {
      doc.fontSize(9).font(boldFont);
      doc.text('#', x.no, headerY, { lineBreak: false });
      doc.text(tr('Ürün Adı'), x.stock, headerY, { lineBreak: false });
      doc.text(tr('Açıklama'), x.desc, headerY, { lineBreak: false });
      doc.text('Miktar', x.qty, headerY, { width: colW.qty, align: 'right', lineBreak: false });
      doc.text('B.Fiyat', x.price, headerY, { width: colW.price, align: 'right', lineBreak: false });
      doc.text('Tutar', x.total, headerY, { width: colW.total, align: 'right', lineBreak: false });
      doc.moveTo(50, headerY + 14).lineTo(545, headerY + 14).stroke();
      return headerY + 20;
    };

    let y = drawTableHeader(doc.y);
    const lineHeight = 10.5;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const productName = publicProductLabel(
        (it as typeof it & { product?: { fullName?: string | null } | null }).product?.fullName
          ?? (it.productModelId ? itemProductNames.get(it.productModelId) : undefined),
        it.description,
        it.stockCode,
      );
      const description = String(it.description ?? '').trim() === String(productName ?? '').trim()
        ? ''
        : it.description;
      const stockLines = wrapCellLines(tr(productName), colW.stock);
      const descriptionLines = wrapCellLines(tr(description), colW.desc);
      const totalLines = Math.max(stockLines.length, descriptionLines.length, 1);
      let lineOffset = 0;
      while (lineOffset < totalLines) {
        if (y > 760) {
          doc.addPage();
          y = drawTableHeader(50);
        }
        const availableLines = Math.max(1, Math.floor((770 - y - 4) / lineHeight));
        const linesOnPage = Math.min(totalLines - lineOffset, availableLines);
        const rowHeight = Math.max(18, linesOnPage * lineHeight + 4);
        const stockFragment = stockLines.slice(lineOffset, lineOffset + linesOnPage).join('\n');
        const descriptionFragment = descriptionLines.slice(lineOffset, lineOffset + linesOnPage).join('\n');
        doc.font(regularFont).fontSize(9);
        doc.text(lineOffset === 0 ? String(i + 1) : '', x.no, y + 2, { lineBreak: false });
        doc.text(stockFragment, x.stock, y + 2, { width: colW.stock, lineGap: 0 });
        doc.text(descriptionFragment, x.desc, y + 2, { width: colW.desc, lineGap: 0 });
        if (lineOffset === 0) {
          const quantity = Number(it.quantity);
          const displayGross = quantity * Number(it.unitPrice) + (customsAllocations[i] ?? 0);
          const displayUnitPrice = quantity > 0 ? displayGross / quantity : Number(it.unitPrice);
          fitCell(Number(it.quantity).toLocaleString('tr-TR'), x.qty, y + 2, colW.qty, { align: 'right' });
          fitCell(money(displayUnitPrice), x.price, y + 2, colW.price, { align: 'right' });
          fitCell(money(displayGross), x.total, y + 2, colW.total, { align: 'right' });
        }
        y += rowHeight;
        doc.moveTo(50, y).lineTo(545, y).lineWidth(0.35).strokeColor('#d1d5db').stroke();
        lineOffset += linesOnPage;
      }
    }
    doc.moveTo(50, y).lineTo(545, y).stroke();

    // Toplamlar
    y += 12;
    const totalLine = (label: string, val: string, bold = false) => {
      if (y + (bold ? 20 : 15) > 780) {
        doc.addPage();
        y = 50;
      }
      doc.font(bold ? boldFont : regularFont).fontSize(bold ? 11 : 9);
      doc.text(label, 340, y, { width: 110, align: 'right', lineBreak: false });
      fitCell(val, 455, y, 90, { align: 'right', bold, size: bold ? 11 : 9, minSize: 7.5 });
      y += bold ? 20 : 15;
    };
    const grossTotal = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), customsTotal);
    const lineDiscountTotal = items.reduce((sum, item) => sum + Number(item.discountAmount ?? 0), 0);
    const headerDiscountTotal = Math.max(Number(quote.discountTotal ?? 0) - lineDiscountTotal, 0);
    const primaryItem = items.find((item) => !String(item.description ?? '').trimStart().startsWith('↳ Opsiyon:'));
    const documentVatRate = Number(primaryItem?.vatRate ?? 0);
    const applyDocumentVatRate = (value: unknown) => {
      const text = String(value ?? '');
      if (!Number.isFinite(documentVatRate) || documentVatRate <= 0) return text;
      return text
        .replace(/\{\{KDV_ORANI\}\}/g, String(documentVatRate))
        .replace(/%(?:10|20)(?=\s*K\.?\s*D\.?\s*V\.?)/giu, `%${documentVatRate}`);
    };
    totalLine('Brüt Toplam', money(grossTotal));
    if (lineDiscountTotal > 0) totalLine('Kalem İndirimi', `-${money(lineDiscountTotal)}`);
    totalLine('Özel İskonto', headerDiscountTotal > 0 ? `-${money(headerDiscountTotal)}` : money(0));
    totalLine('Net Ara Toplam', money(Number(quote.subtotal ?? 0) + customsTotal));
    totalLine(documentVatRate > 0 ? `KDV (%${documentVatRate})` : 'KDV', money(quote.vatAmount));
    totalLine('GENEL TOPLAM', money(quote.grandTotal), true);
    doc.y = y;

    // Şartlar — örnek formdaki gibi 1/2/3 ve a/b/c maddeleri.
    const termSections = ([
      ['ÖDEME ŞARTLARI', splitTermLines(applyDocumentVatRate(terms?.paymentTermsText ?? quote.paymentTerms))],
      ['TESLİMAT ŞARTLARI', splitTermLines(applyDocumentVatRate(terms?.deliveryTermsText ?? quote.deliveryTerms))],
      ['GARANTİ ŞARTLARI', splitTermLines(applyDocumentVatRate(terms?.warrantyTermsText ?? quote.warrantyTerms))],
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
    const companyAddress = await this.resolveCompanyAddress(input.companyId, input.companyAddressId, actor);
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
        companyAddressId: companyAddress?.id ?? null,
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
        signatureId: (await this.resolveSignatureId(input.signatureId, actor)) ?? null,
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

  /**
   * Fırsat açmadan ("hızlı") teklif keser.
   *
   * Normal akışta istemci önce fırsat açıp sonra teklifi ve kalemleri tek tek
   * eklediği için, satış kartı istemeyen küçük işler bile boş bir fırsat üretiyordu.
   * Burada başlık, kalemler ve şartlar tek istekte yazılır ve `opportunityId`
   * bilerek boş bırakılır (şema zaten izin veriyor, revizyon numarası 1'de kalır).
   *
   * Kalem ekleme veya şart yazma sırasında hata olursa yarım kalan teklif
   * arkada bırakılmaz; taslak yumuşak silinir ve hata istemciye döner.
   */
  async createStandaloneQuote(input: StandaloneQuoteCreateInput, actor: AuthContext) {
    const { items, terms, ...header } = input;
    const quote = await this.create({ ...header, opportunityId: undefined }, actor);
    try {
      for (let index = 0; index < items.length; index++) {
        await this.addItem(quote.id, { ...items[index], sortOrder: items[index].sortOrder || index }, actor);
      }
      if (terms) {
        await this.upsertTerms(
          quote.id,
          {
            importCostsExcluded: true,
            ...terms,
          } as QuoteTermsUpsertInput,
          actor
        );
      }
    } catch (error) {
      // Telafi: kalemsiz/eksik teklif kaydı kalmasın.
      await this.db.update(quotes).set({ deletedAt: new Date() }).where(eq(quotes.id, quote.id));
      throw error;
    }
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'quote.created',
      resourceType: 'quote',
      resourceId: quote.id,
      newValues: { documentNo: quote.documentNo, standalone: true, itemCount: items.length },
    });
    return this.get(quote.id, actor);
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
    if (input.companyAddressId !== undefined || (input.companyId !== undefined && input.companyId !== existingQuote.companyId)) {
      const companyAddress = await this.resolveCompanyAddress(companyId, input.companyAddressId, actor);
      patch.companyAddressId = companyAddress?.id ?? null;
    }
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
    // Yukarıdaki döngüde değil: imza seçimi doğrulanmadan tabloya yazılamaz.
    const signatureId = await this.resolveSignatureId(input.signatureId, actor);
    if (signatureId !== undefined) patch.signatureId = signatureId;
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
    this.assertItemDiscount(input.quantity, input.unitPrice, input.discountAmount);
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
        nationalized: input.nationalized ?? false,
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
    if (input.nationalized !== undefined) patch.nationalized = input.nationalized;
    if (input.unitCode !== undefined) patch.unitId = await lookupIdByCode(this.db, units, input.unitCode);

    // Recalc line totals
    const quantity = Number(patch.quantity ?? existing.quantity);
    const unitPrice = Number(patch.unitPrice ?? existing.unitPrice);
    const discountAmount = Number(patch.discountAmount ?? existing.discountAmount);
    const vatRate = Number(patch.vatRate ?? existing.vatRate);
    this.assertItemDiscount(quantity, unitPrice, discountAmount);
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
          vatIncluded: input.vatIncluded ?? false,
          freightPaidBySeller: input.freightPaidBySeller ?? false,
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
        vatIncluded: input.vatIncluded ?? false,
        freightPaidBySeller: input.freightPaidBySeller ?? false,
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
    const quote = await this.get(quoteId, actor);
    const check = await this.quotePriceCheck(quoteId);
    if (!check.needsApproval) {
      await this.refreshPriceApprovalStatus(quoteId, actor);
      return this.get(quoteId, actor);
    }
    const [pendingStatusId, draftStatusId] = await Promise.all([
      lookupIdByCode(this.db, quoteStatuses, 'pending_super_admin_approval'),
      lookupIdByCode(this.db, quoteStatuses, 'draft'),
    ]);
    await this.db
      .update(quotes)
      .set({
        ...(quote.statusId === pendingStatusId && draftStatusId ? { statusId: draftStatusId } : {}),
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
      newValues: { belowItems: check.belowItems, discountSummary: check.discountSummary, note },
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
    const currentStatus = await this.quoteStatusCode(quote.statusId);
    if (currentStatus === 'approved') return { ok: true };
    if (currentStatus === 'rejected' || currentStatus === 'cancelled') {
      throw new ConflictError('Reddedilmiş veya iptal edilmiş teklif onaylanamaz');
    }
    await this.ensurePriceApprovalAllowsAction(quoteId, actor);
    const status = await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.code, 'approved') });
    const finalizedAt = new Date();
    const documentSnapshot = quote.documentSnapshot ?? await this.buildDocumentSnapshot(quoteId, actor);
    await this.db
      .update(quotes)
      .set({
        statusId: status?.id ?? null,
        approvedBy: actor.userId,
        approvedAt: finalizedAt,
        finalizedAt,
        documentSnapshot,
        followUpAt: null,
        statusNote: null,
        statusChangedAt: finalizedAt,
        statusChangedBy: actor.userId,
      })
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
    const quote = await this.get(quoteId, actor);
    const currentStatus = await this.quoteStatusCode(quote.statusId);
    if (currentStatus === 'rejected') return { ok: true };
    if (currentStatus === 'approved' || currentStatus === 'cancelled') {
      throw new ConflictError('Onaylanmış veya iptal edilmiş teklif reddedilemez');
    }
    const status = await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.code, 'rejected') });
    const rejectedAt = new Date();
    const documentSnapshot = quote.documentSnapshot ?? await this.buildDocumentSnapshot(quoteId, actor);
    await this.db
      .update(quotes)
      .set({
        statusId: status?.id ?? null,
        rejectedAt,
        finalizedAt: quote.finalizedAt ?? rejectedAt,
        documentSnapshot,
        followUpAt: null,
        statusNote: null,
        statusChangedAt: rejectedAt,
        statusChangedBy: actor.userId,
      })
      .where(eq(quotes.id, quoteId));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'quote.rejected',
      resourceType: 'quote',
      resourceId: quoteId,
    });
    return { ok: true };
  }

  async send(quoteId: string, actor: AuthContext) {
    const quote = await this.assertCanSend(quoteId, actor);
    const currentStatus = await this.quoteStatusCode(quote.statusId);
    if (currentStatus === 'sent') return { ok: true };
    if (currentStatus === 'approved' || currentStatus === 'rejected' || currentStatus === 'cancelled') {
      throw new ConflictError('Sonuçlanmış teklif yeniden gönderilemez');
    }
    const status = await this.db.query.quoteStatuses.findFirst({ where: eq(quoteStatuses.code, 'sent') });
    const finalizedAt = new Date();
    const documentSnapshot = quote.documentSnapshot ?? await this.buildDocumentSnapshot(quoteId, actor);
    await this.db
      .update(quotes)
      .set({
        statusId: status?.id ?? null,
        sentAt: finalizedAt,
        finalizedAt,
        documentSnapshot,
        followUpAt: null,
        statusNote: null,
        statusChangedAt: finalizedAt,
        statusChangedBy: actor.userId,
      })
      .where(eq(quotes.id, quoteId));
    return { ok: true };
  }

  async changeStatus(quoteId: string, input: QuoteStatusChangeInput, actor: AuthContext) {
    const quote = await this.get(quoteId, actor);
    const currentStatus = await this.quoteStatusCode(quote.statusId);
    if (currentStatus === input.statusCode) return this.get(quoteId, actor);
    if (currentStatus === 'approved' || currentStatus === 'rejected' || currentStatus === 'cancelled') {
      throw new ConflictError('Sonuçlanmış teklifin durumu değiştirilemez');
    }

    const statusId = await lookupIdByCode(this.db, quoteStatuses, input.statusCode);
    if (!statusId) throw new ValidationError('Geçersiz teklif durumu', { field: 'statusCode' });

    const changedAt = new Date();
    const isCancelled = input.statusCode === 'cancelled';
    const documentSnapshot = isCancelled
      ? quote.documentSnapshot ?? await this.buildDocumentSnapshot(quoteId, actor)
      : quote.documentSnapshot;
    await this.db
      .update(quotes)
      .set({
        statusId,
        followUpAt: isCancelled ? null : input.followUpAt ?? null,
        statusNote: input.note ?? null,
        statusChangedAt: changedAt,
        statusChangedBy: actor.userId,
        ...(isCancelled
          ? {
              finalizedAt: quote.finalizedAt ?? changedAt,
              documentSnapshot,
            }
          : {}),
      })
      .where(eq(quotes.id, quoteId));

    if (!isCancelled && input.followUpAt) {
      const activityTypeId = await lookupIdByCode(this.db, activityTypes, 'note');
      if (activityTypeId) {
        const statusLabels: Record<Exclude<QuoteStatusChangeInput['statusCode'], 'cancelled'>, string> = {
          price_waiting: 'Fiyat Bekleniyor',
          budget_waiting: 'Bütçe Bekleniyor',
          on_hold: 'Askıya Alındı',
          postponed: 'Ertelendi',
        };
        await this.db.insert(salesActivities).values({
          tenantId: actor.tenantId,
          divisionId: quote.divisionId,
          opportunityId: quote.opportunityId,
          companyId: quote.companyId,
          contactId: quote.contactId,
          activityTypeId,
          subject: `${quote.documentNo} teklif takibi — ${statusLabels[input.statusCode as keyof typeof statusLabels]}`,
          description: input.note ?? null,
          origin: 'system',
          activityDate: changedAt,
          nextFollowUpAt: input.followUpAt,
          createdBy: actor.userId,
        });
      }
    }

    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: isCancelled ? 'quote.cancelled' : 'quote.follow_up_scheduled',
      resourceType: 'quote',
      resourceId: quoteId,
      oldValues: { statusCode: currentStatus },
      newValues: {
        statusCode: input.statusCode,
        followUpAt: input.followUpAt ?? null,
        note: input.note ?? null,
      },
    });
    return this.get(quoteId, actor);
  }

  async assertCanSend(quoteId: string, actor: AuthContext) {
    const quote = await this.get(quoteId, actor);
    await this.ensurePriceApprovalAllowsAction(quoteId, actor);
    if (!quote.items.length) throw new ValidationError('Kalemsiz teklif gönderilemez');
    if (Number(quote.grandTotal ?? 0) <= 0) throw new ValidationError('Toplamı sıfır olan teklif gönderilemez');
    return quote;
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
      // Teklifsiz ("hızlı") proformada firma ve para birimi teklif üzerinden
      // okunamaz; coalesce ile belgenin kendi sütunlarına düşülür.
      .leftJoin(companies, eq(companies.id, sql`coalesce(${quotes.companyId}, ${proformas.companyId})`))
      .leftJoin(currencies, eq(currencies.id, sql`coalesce(${quotes.currencyId}, ${proformas.currencyId})`))
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
    const finalizedAt = input.statusCode !== 'draft' ? new Date() : null;
    const signatureId = (await this.resolveSignatureId(input.signatureId, actor)) ?? null;
    const documentSnapshot = await this.buildPricedDocumentSnapshot(
      {
        businessLine,
        quoteId: input.quoteId,
        documentNo,
        issueDate: input.issueDate,
        statusId,
        fileId: input.fileId ?? null,
        signatureId,
        finalizedAt,
        createdBy: actor.userId,
        terms: input.terms ?? null,
      },
      input.quoteId,
      actor,
      input.items,
      mergeDocumentHeaderDiscount(null, input)
    );
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
        signatureId,
        documentSnapshot,
        // Şartlar belgeye özeldir; teklifin `quote_terms` kaydı değişmez.
        terms: input.terms ?? null,
        finalizedAt,
        createdBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'proforma.created',
      resourceType: 'proforma',
      resourceId: row.id,
      newValues: { documentNo: row.documentNo, quoteId: row.quoteId, priceItemCount: input.items?.length ?? 0 },
    });
    return this.getProforma(row.id, actor);
  }

  async updateProforma(id: string, input: ProformaUpdateInput, actor: AuthContext) {
    const existing = await this.getProforma(id, actor);
    this.assertCommercialDocumentMutable(existing, 'Proforma');
    if (!existing.quoteId && !input.quoteId) {
      throw new ValidationError('Bu proforma bir teklife bağlı değil; hızlı proforma olarak güncelleyin');
    }
    const patch: Record<string, unknown> = {};
    let quote = await this.get(String(input.quoteId ?? existing.quoteId), actor);
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
    // Belgeye özel şart; `null` gönderilirse belge yeniden teklifin şartlarına düşer.
    if (input.terms !== undefined) patch.terms = input.terms ?? null;
    const signatureId = await this.resolveSignatureId(input.signatureId, actor);
    if (signatureId !== undefined) patch.signatureId = signatureId;
    if (input.documentNo !== undefined) patch.documentNo = normalizeSeriesDocumentNo(input.documentNo, businessLine);
    else if (input.quoteId !== undefined && businessLine !== existing.businessLine) {
      patch.documentNo = await nextSeriesDocumentNo(this.db, actor.tenantId, businessLine, 'proforma', input.issueDate ?? existing.issueDate);
    }
    const snapshotDocument = { ...existing, ...patch };
    // İmza değişikliği de snapshot'ı tazeler; aksi halde belge eski imzayla basılırdı.
    const headerDiscountChanged =
      input.headerDiscountAmount !== undefined || input.headerDiscountPercent !== undefined;
    if (signatureId !== undefined || input.items !== undefined || headerDiscountChanged || input.terms !== undefined || input.quoteId !== undefined || !existing.documentSnapshot) {
      const quoteItemIds = new Set((quote.items ?? []).map((item: { id: string }) => item.id));
      const carriedSnapshot = input.quoteId !== undefined ? null : existing.documentSnapshot;
      const priceItems = this.mergeDocumentPriceItems(carriedSnapshot, quoteItemIds, input.items);
      patch.documentSnapshot = await this.buildPricedDocumentSnapshot(
        snapshotDocument,
        String(patch.quoteId ?? existing.quoteId),
        actor,
        priceItems,
        mergeDocumentHeaderDiscount(carriedSnapshot, input)
      );
    }
    if (input.statusCode !== undefined && input.statusCode !== 'draft') {
      patch.finalizedAt = new Date();
      if (!patch.documentSnapshot) {
        const currentSnapshot = existing.documentSnapshot as Record<string, unknown> | null;
        patch.documentSnapshot = currentSnapshot
          ? { ...currentSnapshot, document: documentHeaderOnly({ ...snapshotDocument, finalizedAt: patch.finalizedAt }) }
          : await this.buildPricedDocumentSnapshot(
              { ...snapshotDocument, finalizedAt: patch.finalizedAt },
              String(patch.quoteId ?? existing.quoteId),
              actor,
              this.mergeDocumentPriceItems(
                existing.documentSnapshot,
                new Set((quote.items ?? []).map((item: { id: string }) => item.id)),
                input.items,
              ),
              mergeDocumentHeaderDiscount(existing.documentSnapshot, input)
            );
      }
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
    this.assertCommercialDocumentMutable(existing, 'Proforma');
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

  // ────────── TEKLİFTEN BAĞIMSIZ ("HIZLI") PROFORMA ──────────
  //
  // Küçük/ad-hoc işlerde teklif açmadan proforma kesilebilmesi gerekir. Kalemler bir
  // teklif satırına değil doğrudan belgeye aittir; bu yüzden tutarlar ve firma bilgisi
  // burada üretilip `documentSnapshot` içine yazılır. Yazdırma katmanı zaten yalnızca
  // snapshot okuduğu için PDF tarafında değişiklik gerekmez.

  /** Firma, adres, telefon ve para birimi bağlamını (kayıtlı firma varsa DB'den) çözer. */
  private async resolveStandaloneDocumentContext(
    input: Partial<Pick<StandaloneProformaCreateInput, 'companyId' | 'currencyCode'>>,
    actor: AuthContext
  ) {
    const company = input.companyId ? await this.assertCompany(input.companyId, actor) : null;
    const [addresses, phones, emails] = company
      ? await Promise.all([
          this.db
            .select()
            .from(companyAddresses)
            .where(and(eq(companyAddresses.companyId, company.id), isNull(companyAddresses.deletedAt)))
            .orderBy(desc(companyAddresses.isBilling), desc(companyAddresses.isDefault), companyAddresses.createdAt),
          this.db
            .select()
            .from(companyPhones)
            .where(and(eq(companyPhones.companyId, company.id), isNull(companyPhones.deletedAt)))
            .orderBy(desc(companyPhones.isDefault), companyPhones.createdAt),
          this.db
            .select()
            .from(companyEmails)
            .where(and(eq(companyEmails.companyId, company.id), isNull(companyEmails.deletedAt)))
            .orderBy(desc(companyEmails.isDefault), companyEmails.createdAt),
        ])
      : [[], [], []];
    const currency = input.currencyCode
      ? await this.db.query.currencies.findFirst({ where: eq(currencies.code, input.currencyCode) })
      : null;
    if (input.currencyCode && !currency) {
      throw new ValidationError('Geçersiz para birimi', { field: 'currencyCode' });
    }
    return { company, addresses, phones, emails, currency };
  }

  /**
   * Belgeye ait (teklif satırına değil) serbest kalemleri fiyatlandırır.
   * Gümrük bu akışta yoktur; satır toplamı brüt eksi satır iskontosudur.
   * Belgenin kendi GENEL iskontosu varsa net ara toplamdan düşülür ve KDV
   * aynı oranla ölçeklenir (teklife bağlı belgelerdeki kuralla aynı).
   */
  private priceStandaloneItems(
    items: ProformaFreeItemInput[],
    headerDiscount?: DocumentHeaderDiscount,
  ) {
    const roundMoney = (value: number) => Number(value.toFixed(4));
    const priced = items.map((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const discountAmount = Number(item.discountAmount ?? 0);
      this.assertItemDiscount(quantity, unitPrice, discountAmount);
      const lineTotal = roundMoney(quantity * unitPrice - discountAmount);
      return {
        id: randomUUID(),
        description: item.description,
        quantity,
        unitCode: item.unitCode ?? 'adet',
        unitPrice: roundMoney(unitPrice),
        discountAmount: roundMoney(discountAmount),
        vatRate: Number(item.vatRate ?? 0),
        lineTotal,
        vatAmount: roundMoney(lineTotal * (Number(item.vatRate ?? 0) / 100)),
        // Katalog bağı yok; PDF'deki Markası/Menşei/G.T.İ.P. satırları elle girilir
        // ve boş bırakılırsa basılmaz.
        product:
          item.brand || item.model || item.originCountry || item.hsCode
            ? {
                brandName: item.brand ?? null,
                modelName: item.model ?? null,
                originCountry: item.originCountry ?? null,
                hsCode: item.hsCode ?? null,
              }
            : null,
        productModelId: null,
        nationalized: false,
      };
    });
    const lineDiscountTotal = roundMoney(priced.reduce((sum, item) => sum + item.discountAmount, 0));
    const taxableBeforeHeader = roundMoney(priced.reduce((sum, item) => sum + item.lineTotal, 0));
    const headerPercent = Math.max(Number(headerDiscount?.percent ?? 0), 0);
    const requestedHeaderDiscount = Math.max(
      headerPercent > 0 ? taxableBeforeHeader * (headerPercent / 100) : Number(headerDiscount?.amount ?? 0),
      0,
    );
    const headerDiscountAmount = roundMoney(Math.min(requestedHeaderDiscount, taxableBeforeHeader));
    const headerRatio = taxableBeforeHeader > 0
      ? (taxableBeforeHeader - headerDiscountAmount) / taxableBeforeHeader
      : 1;
    const pricedWithVat = priced.map((item) => ({
      ...item,
      vatAmount: roundMoney(item.lineTotal * headerRatio * (item.vatRate / 100)),
    }));
    return {
      items: pricedWithVat,
      headerDiscountAmount,
      headerDiscountPercent: headerPercent,
      discountTotal: roundMoney(lineDiscountTotal + headerDiscountAmount),
      subtotal: roundMoney(taxableBeforeHeader - headerDiscountAmount),
      vatAmount: roundMoney(pricedWithVat.reduce((sum, item) => sum + item.vatAmount, 0)),
    };
  }

  /**
   * Alıcı bloğunu (`company` / `companyAddresses` / `contact` / `currency`) yazdırma
   * katmanının beklediği biçimde üretir. Kayıtlı firma varsa DB kaydı, yoksa elle
   * girilen serbest metin kullanılır.
   */
  private buildStandalonePartySnapshot(
    input: Partial<
      Pick<
        StandaloneProformaCreateInput,
        | 'companyName'
        | 'companyAddress'
        | 'companyTaxOffice'
        | 'companyTaxNumber'
        | 'contactName'
        | 'contactPhone'
        | 'currencyCode'
      >
    >,
    context: Awaited<ReturnType<QuotesService['resolveStandaloneDocumentContext']>>
  ) {
    const address = context.company
      ? context.addresses[0] ?? null
      : input.companyAddress
        ? { fullAddress: input.companyAddress }
        : null;
    return {
      company: context.company
        ? {
            id: context.company.id,
            legalTitle: context.company.legalTitle,
            shortName: context.company.shortName,
            taxOffice: context.company.taxOffice,
            taxNumber: context.company.taxNumber,
          }
        : {
            id: null,
            legalTitle: input.companyName ?? null,
            shortName: null,
            taxOffice: input.companyTaxOffice ?? null,
            taxNumber: input.companyTaxNumber ?? null,
          },
      companyAddresses: address ? [address] : [],
      companyPhones: context.phones,
      companyEmails: context.emails,
      contact:
        input.contactName || input.contactPhone
          ? { fullName: input.contactName ?? null, mobilePhone: input.contactPhone ?? null, workPhone: null }
          : null,
      currency: context.currency ?? { code: input.currencyCode ?? 'USD' },
    };
  }

  /**
   * Yazdırma katmanının (`proformaFromSnapshot`) beklediği şekilde bir belge anlık
   * görüntüsü üretir. Toplam mantığı teklife bağlı proformayla aynıdır; tek fark
   * teklif geneli iskonto ve gümrüğün burada bulunmamasıdır.
   */
  private buildStandaloneProformaSnapshot(
    document: Record<string, unknown>,
    input: StandaloneProformaCreateInput,
    context: Awaited<ReturnType<QuotesService['resolveStandaloneDocumentContext']>>,
    signature: DocumentSignatureSnapshot | null = null
  ) {
    const roundMoney = (value: number) => Number(value.toFixed(4));
    const { items, discountTotal, subtotal, vatAmount, headerDiscountAmount, headerDiscountPercent } =
      this.priceStandaloneItems(input.items, {
        amount: input.headerDiscountAmount,
        percent: input.headerDiscountPercent,
      });

    return {
      schemaVersion: 4,
      capturedAt: new Date().toISOString(),
      /** Teklife bağlı snapshot'lardan ayırmak için işaret. */
      standalone: true,
      // Bu kurucu senkron; imza kopyası çağrı yerinde çözülüp buraya verilir.
      signature,
      document,
      quote: {
        documentNo: document.documentNo ?? null,
        subtotal,
        discountTotal,
        headerDiscountAmount,
        headerDiscountPercent,
        vatAmount,
        customsTotal: 0,
        grandTotal: roundMoney(subtotal + vatAmount),
        paymentTerms: input.paymentTerms ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        warrantyTerms: input.warrantyTerms ?? null,
        notes: input.notes ?? null,
      },
      ...this.buildStandalonePartySnapshot(input, context),
      receivables: [],
      items,
      terms: {
        paymentTermsText: input.paymentTerms ?? null,
        deliveryTermsText: input.deliveryTerms ?? null,
        warrantyTermsText: input.warrantyTerms ?? null,
      },
    };
  }

  async createStandaloneProforma(input: StandaloneProformaCreateInput, actor: AuthContext) {
    const context = await this.resolveStandaloneDocumentContext(input, actor);
    const divisionId = resolveAssignedResourceDivision(actor, 'proformas', input.divisionId ?? null);
    if (!divisionId && (await this.tenantHasActiveDivisions(actor))) {
      throw new ValidationError('Proforma için bölüm ataması zorunludur', { field: 'divisionId' });
    }
    const businessLine = divisionId ? await resolveBusinessLine(this.db, actor.tenantId, divisionId) : 'CNC';
    const documentNo =
      normalizeSeriesDocumentNo(input.documentNo, businessLine) ??
      (await nextSeriesDocumentNo(this.db, actor.tenantId, businessLine, 'proforma', input.issueDate));
    const statusId = await lookupIdByCode(this.db, proformaStatuses, input.statusCode);
    if (!statusId) throw new ValidationError('Geçersiz proforma durumu', { field: 'statusCode' });
    const finalizedAt = input.statusCode !== 'draft' ? new Date() : null;
    const signatureId = (await this.resolveSignatureId(input.signatureId, actor)) ?? null;
    const documentSnapshot = this.buildStandaloneProformaSnapshot(
      {
        businessLine,
        quoteId: null,
        documentNo,
        issueDate: input.issueDate,
        statusId,
        signatureId,
        finalizedAt,
        createdBy: actor.userId,
      },
      input,
      context,
      await this.captureSignatureSnapshot(signatureId, actor)
    );
    const [row] = await this.db
      .insert(proformas)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        businessLine,
        quoteId: null,
        companyId: context.company?.id ?? null,
        currencyId: context.currency?.id ?? null,
        companyNameText: context.company ? null : (input.companyName ?? null),
        documentNo,
        issueDate: input.issueDate,
        statusId,
        signatureId,
        documentSnapshot,
        finalizedAt,
        createdBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'proforma.created',
      resourceType: 'proforma',
      resourceId: row.id,
      newValues: { documentNo: row.documentNo, standalone: true, itemCount: input.items.length },
    });
    return this.getProforma(row.id, actor);
  }

  async updateStandaloneProforma(id: string, input: StandaloneProformaUpdateInput, actor: AuthContext) {
    const existing = await this.getProforma(id, actor);
    if (existing.quoteId) {
      throw new ValidationError('Bu proforma bir teklife bağlı; teklif proforması olarak güncelleyin');
    }
    this.assertCommercialDocumentMutable(existing, 'Proforma');
    const previous = (existing.documentSnapshot ?? {}) as Record<string, any>;
    // Gönderilmeyen alanlar mevcut belgeden korunur: kısmi güncelleme snapshot'ı sıfırlamamalı.
    const merged: StandaloneProformaCreateInput = {
      companyId: input.companyId ?? existing.companyId ?? undefined,
      companyName: input.companyName ?? previous.company?.legalTitle ?? undefined,
      companyAddress: input.companyAddress ?? previous.companyAddresses?.[0]?.fullAddress ?? undefined,
      companyTaxOffice: input.companyTaxOffice ?? previous.company?.taxOffice ?? undefined,
      companyTaxNumber: input.companyTaxNumber ?? previous.company?.taxNumber ?? undefined,
      contactName: input.contactName ?? previous.contact?.fullName ?? undefined,
      contactPhone: input.contactPhone ?? previous.contact?.mobilePhone ?? undefined,
      divisionId: input.divisionId ?? existing.divisionId ?? undefined,
      documentNo: input.documentNo ?? existing.documentNo,
      issueDate: input.issueDate ?? existing.issueDate,
      statusCode: input.statusCode ?? 'draft',
      currencyCode: input.currencyCode ?? previous.currency?.code ?? 'USD',
      items: input.items ?? previous.items ?? [],
      paymentTerms: input.paymentTerms ?? previous.terms?.paymentTermsText ?? undefined,
      deliveryTerms: input.deliveryTerms ?? previous.terms?.deliveryTermsText ?? undefined,
      warrantyTerms: input.warrantyTerms ?? previous.terms?.warrantyTermsText ?? undefined,
      notes: input.notes ?? previous.quote?.notes ?? undefined,
    };
    if (!merged.items.length) throw new ValidationError('Proforma en az bir kalem içermeli', { field: 'items' });
    const context = await this.resolveStandaloneDocumentContext(merged, actor);
    const businessLine = (existing.businessLine ?? 'CNC') as BusinessLine;
    const documentNo =
      input.documentNo !== undefined
        ? normalizeSeriesDocumentNo(input.documentNo, businessLine) ?? existing.documentNo
        : existing.documentNo;
    const statusId =
      input.statusCode !== undefined
        ? await lookupIdByCode(this.db, proformaStatuses, input.statusCode)
        : existing.statusId;
    if (!statusId) throw new ValidationError('Geçersiz proforma durumu', { field: 'statusCode' });
    const finalizedAt = input.statusCode !== undefined && input.statusCode !== 'draft' ? new Date() : existing.finalizedAt;
    // Gönderilmeyen imza mevcut seçimi korur (diğer alanlarla aynı birleştirme
    // kuralı); açıkça `null` gönderilmişse imza kaldırılır.
    const requestedSignatureId = await this.resolveSignatureId(input.signatureId, actor);
    const signatureId = requestedSignatureId === undefined ? existing.signatureId ?? null : requestedSignatureId;
    const patch = {
      companyId: context.company?.id ?? null,
      currencyId: context.currency?.id ?? null,
      companyNameText: context.company ? null : (merged.companyName ?? null),
      documentNo,
      issueDate: merged.issueDate,
      statusId,
      signatureId,
      finalizedAt,
      documentSnapshot: this.buildStandaloneProformaSnapshot(
        { businessLine, quoteId: null, documentNo, issueDate: merged.issueDate, statusId, signatureId, finalizedAt, createdBy: existing.createdBy },
        merged,
        context,
        await this.captureSignatureSnapshot(signatureId, actor)
      ),
    };
    await this.db.update(proformas).set(patch).where(eq(proformas.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'proforma.updated',
      resourceType: 'proforma',
      resourceId: id,
      oldValues: existing,
      newValues: { ...patch, standalone: true },
    });
    return this.getProforma(id, actor);
  }

  // ────────── TEKLİFTEN BAĞIMSIZ ("HIZLI") SÖZLEŞME ──────────
  //
  // Proforma ile aynı gerekçe: teklif açmadan sözleşme kesilebilmeli. Sözleşme
  // çıktısı (`buildContractPrintData`) zaten `documentSnapshot` verildiğinde canlı
  // teklife hiç bakmadığı için PDF tarafında yeni bir yol açmak gerekmez.

  /**
   * Sözleşme çıktısının beklediği belge anlık görüntüsü. Teklife bağlı sözleşmenin
   * snapshot'ıyla aynı alan adlarını kullanır; ödeme planı cari alacaklar yerine
   * elle girilen taksitlerden üretilir.
   */
  private buildStandaloneContractSnapshot(
    document: Record<string, unknown>,
    input: StandaloneContractCreateInput,
    context: Awaited<ReturnType<QuotesService['resolveStandaloneDocumentContext']>>,
    signature: DocumentSignatureSnapshot | null = null
  ) {
    const roundMoney = (value: number) => Number(value.toFixed(4));
    const { items, discountTotal, subtotal, vatAmount, headerDiscountAmount, headerDiscountPercent } =
      this.priceStandaloneItems(input.items, {
        amount: input.headerDiscountAmount,
        percent: input.headerDiscountPercent,
      });

    return {
      schemaVersion: 4,
      capturedAt: new Date().toISOString(),
      /** Teklife bağlı snapshot'lardan ayırmak için işaret. */
      standalone: true,
      // Bu kurucu senkron; imza kopyası çağrı yerinde çözülüp buraya verilir.
      signature,
      document,
      quote: {
        documentNo: document.contractNo ?? null,
        subtotal,
        discountTotal,
        headerDiscountAmount,
        headerDiscountPercent,
        vatAmount,
        customsTotal: 0,
        grandTotal: roundMoney(subtotal + vatAmount),
        paymentTerms: input.paymentTerms ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        warrantyTerms: input.warrantyTerms ?? null,
        notes: input.notes ?? null,
      },
      ...this.buildStandalonePartySnapshot(input, context),
      // Sözleşme çıktısındaki ödeme planı bu listeden basılır; teklife bağlı
      // sözleşmede aynı alan cari alacaklardan doldurulur.
      receivables: (input.installments ?? []).map((installment) => ({
        id: randomUUID(),
        amount: roundMoney(Number(installment.amount)),
        dueDate: installment.dueDate ?? null,
        notes: installment.label ?? (installment.promissoryNote ? 'Senet' : null),
      })),
      items,
      terms: {
        paymentTermsText: input.paymentTerms ?? null,
        deliveryTermsText: input.deliveryTerms ?? null,
        warrantyTermsText: input.warrantyTerms ?? null,
        deliveryLocation: input.deliveryLocation ?? null,
        estimatedDeliveryDaysMin: input.estimatedDeliveryDaysMin ?? null,
        estimatedDeliveryDaysMax: input.estimatedDeliveryDaysMax ?? null,
        importCostsExcluded: input.importCostsExcluded ?? true,
        vatIncluded: input.vatIncluded ?? false,
        freightPaidBySeller: input.freightPaidBySeller ?? false,
      },
    };
  }

  async createStandaloneContract(input: StandaloneContractCreateInput, actor: AuthContext) {
    const context = await this.resolveStandaloneDocumentContext(input, actor);
    const divisionId = resolveAssignedResourceDivision(actor, 'contracts', input.divisionId ?? null);
    if (!divisionId && (await this.tenantHasActiveDivisions(actor))) {
      throw new ValidationError('Sözleşme için bölüm ataması zorunludur', { field: 'divisionId' });
    }
    const businessLine = divisionId ? await resolveBusinessLine(this.db, actor.tenantId, divisionId) : 'CNC';
    const contractNo =
      normalizeSeriesDocumentNo(input.contractNo, businessLine) ??
      (await nextSeriesDocumentNo(this.db, actor.tenantId, businessLine, 'contract', input.signedDate));
    const statusId = await lookupIdByCode(this.db, contractStatuses, input.statusCode);
    if (!statusId) throw new ValidationError('Geçersiz sözleşme durumu', { field: 'statusCode' });
    const finalizedAt = input.statusCode !== 'draft' ? new Date() : null;
    const signatureId = (await this.resolveSignatureId(input.signatureId, actor)) ?? null;
    const documentSnapshot = this.buildStandaloneContractSnapshot(
      {
        businessLine,
        quoteId: null,
        contractNo,
        signedDate: input.signedDate,
        paymentTermDays: input.paymentTermDays ?? null,
        statusId,
        signatureId,
        finalizedAt,
        createdBy: actor.userId,
      },
      input,
      context,
      await this.captureSignatureSnapshot(signatureId, actor)
    );
    const [row] = await this.db
      .insert(contracts)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        businessLine,
        quoteId: null,
        companyId: context.company?.id ?? null,
        currencyId: context.currency?.id ?? null,
        companyNameText: context.company ? null : (input.companyName ?? null),
        contractNo,
        signedDate: input.signedDate,
        paymentTermDays: input.paymentTermDays ?? null,
        statusId,
        signatureId,
        documentSnapshot,
        finalizedAt,
        createdBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'contract.created',
      resourceType: 'contract',
      resourceId: row.id,
      newValues: { contractNo: row.contractNo, standalone: true, itemCount: input.items.length },
    });
    return this.getContract(row.id, actor);
  }

  async updateStandaloneContract(id: string, input: StandaloneContractUpdateInput, actor: AuthContext) {
    const existing = await this.getContract(id, actor);
    if (existing.quoteId) {
      throw new ValidationError('Bu sözleşme bir teklife bağlı; teklif sözleşmesi olarak güncelleyin');
    }
    this.assertCommercialDocumentMutable(existing, 'Sözleşme');
    const previous = (existing.documentSnapshot ?? {}) as Record<string, any>;
    // Gönderilmeyen alanlar mevcut belgeden korunur: kısmi güncelleme snapshot'ı sıfırlamamalı.
    const merged: StandaloneContractCreateInput = {
      companyId: input.companyId ?? existing.companyId ?? undefined,
      companyName: input.companyName ?? previous.company?.legalTitle ?? undefined,
      companyAddress: input.companyAddress ?? previous.companyAddresses?.[0]?.fullAddress ?? undefined,
      companyTaxOffice: input.companyTaxOffice ?? previous.company?.taxOffice ?? undefined,
      companyTaxNumber: input.companyTaxNumber ?? previous.company?.taxNumber ?? undefined,
      contactName: input.contactName ?? previous.contact?.fullName ?? undefined,
      contactPhone: input.contactPhone ?? previous.contact?.mobilePhone ?? undefined,
      divisionId: input.divisionId ?? existing.divisionId ?? undefined,
      contractNo: input.contractNo ?? existing.contractNo,
      signedDate: input.signedDate ?? existing.signedDate ?? new Date(),
      paymentTermDays: input.paymentTermDays ?? existing.paymentTermDays ?? undefined,
      statusCode: input.statusCode ?? 'draft',
      currencyCode: input.currencyCode ?? previous.currency?.code ?? 'USD',
      items: input.items ?? previous.items ?? [],
      paymentTerms: input.paymentTerms ?? previous.terms?.paymentTermsText ?? undefined,
      deliveryTerms: input.deliveryTerms ?? previous.terms?.deliveryTermsText ?? undefined,
      warrantyTerms: input.warrantyTerms ?? previous.terms?.warrantyTermsText ?? undefined,
      notes: input.notes ?? previous.quote?.notes ?? undefined,
      deliveryLocation: input.deliveryLocation ?? previous.terms?.deliveryLocation ?? undefined,
      estimatedDeliveryDaysMin:
        input.estimatedDeliveryDaysMin ?? previous.terms?.estimatedDeliveryDaysMin ?? undefined,
      estimatedDeliveryDaysMax:
        input.estimatedDeliveryDaysMax ?? previous.terms?.estimatedDeliveryDaysMax ?? undefined,
      importCostsExcluded: input.importCostsExcluded ?? previous.terms?.importCostsExcluded ?? true,
      vatIncluded: input.vatIncluded ?? previous.terms?.vatIncluded ?? false,
      freightPaidBySeller: input.freightPaidBySeller ?? previous.terms?.freightPaidBySeller ?? false,
      installments:
        input.installments
        ?? (previous.receivables ?? []).map((receivable: any) => ({
          label: receivable?.notes ?? undefined,
          amount: Number(receivable?.amount ?? 0),
          dueDate: receivable?.dueDate ?? undefined,
        })),
    };
    if (!merged.items.length) throw new ValidationError('Sözleşme en az bir kalem içermeli', { field: 'items' });
    const context = await this.resolveStandaloneDocumentContext(merged, actor);
    const businessLine = (existing.businessLine ?? 'CNC') as BusinessLine;
    const contractNo =
      input.contractNo !== undefined
        ? normalizeSeriesDocumentNo(input.contractNo, businessLine) ?? existing.contractNo
        : existing.contractNo;
    const statusId =
      input.statusCode !== undefined
        ? await lookupIdByCode(this.db, contractStatuses, input.statusCode)
        : existing.statusId;
    if (!statusId) throw new ValidationError('Geçersiz sözleşme durumu', { field: 'statusCode' });
    const finalizedAt = input.statusCode !== undefined && input.statusCode !== 'draft' ? new Date() : existing.finalizedAt;
    // Gönderilmeyen imza mevcut seçimi korur; açıkça `null` gönderilmişse kaldırılır.
    const requestedSignatureId = await this.resolveSignatureId(input.signatureId, actor);
    const signatureId = requestedSignatureId === undefined ? existing.signatureId ?? null : requestedSignatureId;
    const patch = {
      companyId: context.company?.id ?? null,
      currencyId: context.currency?.id ?? null,
      companyNameText: context.company ? null : (merged.companyName ?? null),
      contractNo,
      signedDate: merged.signedDate,
      paymentTermDays: merged.paymentTermDays ?? null,
      statusId,
      signatureId,
      finalizedAt,
      documentSnapshot: this.buildStandaloneContractSnapshot(
        {
          businessLine,
          quoteId: null,
          contractNo,
          signedDate: merged.signedDate,
          paymentTermDays: merged.paymentTermDays ?? null,
          statusId,
          signatureId,
          finalizedAt,
          createdBy: existing.createdBy,
        },
        merged,
        context,
        await this.captureSignatureSnapshot(signatureId, actor)
      ),
    };
    await this.db.update(contracts).set(patch).where(eq(contracts.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'contract.updated',
      resourceType: 'contract',
      resourceId: id,
      oldValues: existing,
      newValues: { ...patch, standalone: true },
    });
    return this.getContract(id, actor);
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
      // Teklifsiz ("hızlı") sözleşmede firma ve para birimi teklif üzerinden
      // okunamaz; coalesce ile belgenin kendi sütunlarına düşülür.
      .leftJoin(companies, eq(companies.id, sql`coalesce(${quotes.companyId}, ${contracts.companyId})`))
      .leftJoin(currencies, eq(currencies.id, sql`coalesce(${quotes.currencyId}, ${contracts.currencyId})`))
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
    if (input.fileId) {
      await this.assertContractFile(input.fileId, actor, {
        opportunityId: quote.opportunityId,
        companyId: quote.companyId,
      });
    }
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
        signatureId: (await this.resolveSignatureId(input.signatureId, actor)) ?? null,
        createdBy: actor.userId,
        // Şartlar sözleşmeye özeldir; teklifin `quote_terms` kaydı değişmez.
        terms: input.terms ?? null,
      })
      .returning();
    // Fiyat pazarlığı sözleşmede yapılabildiği için taslak sözleşme de kendi
    // fiyatlarıyla dondurulur; aksi hâlde çıktı canlı teklife dönerdi.
    const pricedContract = (input.items?.length ?? 0) > 0
      || input.headerDiscountAmount !== undefined
      || input.headerDiscountPercent !== undefined;
    if (input.statusCode !== 'draft' || pricedContract || input.terms) {
      const finalizedAt = input.statusCode !== 'draft' ? new Date() : null;
      const documentSnapshot = pricedContract
        ? await this.buildPricedDocumentSnapshot(
            { ...(row as unknown as Record<string, unknown>), finalizedAt },
            input.quoteId,
            actor,
            input.items,
            mergeDocumentHeaderDiscount(null, input)
          )
        : await this.buildCommercialDocumentSnapshot(
            row as unknown as Record<string, unknown>,
            input.quoteId,
            actor
          );
      await this.db.update(contracts).set({ finalizedAt, documentSnapshot }).where(eq(contracts.id, row.id));
    }
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'contract.created',
      resourceType: 'contract',
      resourceId: row.id,
      newValues: { contractNo: row.contractNo, quoteId: row.quoteId, priceItemCount: input.items?.length ?? 0 },
    });
    return this.getContract(row.id, actor);
  }

  async updateContract(id: string, input: ContractUpdateInput, actor: AuthContext) {
    const existing = await this.getContract(id, actor);
    this.assertCommercialDocumentMutable(existing, 'Sözleşme');
    if (!existing.quoteId && !input.quoteId) {
      throw new ValidationError('Bu sözleşme bir teklife bağlı değil; hızlı sözleşme olarak güncelleyin');
    }
    const patch: Record<string, unknown> = {};
    let quote = await this.get(String(input.quoteId ?? existing.quoteId), actor);
    if (input.quoteId !== undefined) {
      quote = await this.get(input.quoteId, actor);
      patch.quoteId = input.quoteId;
      patch.divisionId = quote.divisionId;
    }
    const businessLine = await this.businessLineForQuote(quote, actor);
    if (input.fileId) {
      await this.assertContractFile(input.fileId, actor, {
        opportunityId: quote.opportunityId,
        companyId: quote.companyId,
      });
    }
    if (input.quoteId !== undefined) patch.businessLine = businessLine;
    if (input.statusCode !== undefined) {
      const statusId = await lookupIdByCode(this.db, contractStatuses, input.statusCode);
      if (!statusId) throw new ValidationError('Geçersiz sözleşme durumu', { field: 'statusCode' });
      patch.statusId = statusId;
    }
    for (const k of ['signedDate', 'paymentTermDays', 'fileId'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    const signatureId = await this.resolveSignatureId(input.signatureId, actor);
    if (signatureId !== undefined) patch.signatureId = signatureId;
    if (input.contractNo !== undefined) patch.contractNo = normalizeSeriesDocumentNo(input.contractNo, businessLine);
    else if (input.quoteId !== undefined && businessLine !== existing.businessLine) {
      patch.contractNo = await nextSeriesDocumentNo(this.db, actor.tenantId, businessLine, 'contract', input.signedDate ?? existing.signedDate ?? new Date());
    }
    // Belgeye özel şart; `null` gönderilirse belge yeniden teklifin şartlarına düşer.
    if (input.terms !== undefined) patch.terms = input.terms ?? null;
    const snapshotDocument = { ...existing, ...patch };
    // Sözleşme fiyatı bağlı teklifi değiştirmeden burada saklanır: onaylı
    // teklif kilitlidir, oysa imza masasında fiyat hâlâ pazarlığa açıktır.
    const headerDiscountChanged =
      input.headerDiscountAmount !== undefined || input.headerDiscountPercent !== undefined;
    if (input.items !== undefined || headerDiscountChanged || input.terms !== undefined) {
      const quoteItemIds = new Set(
        (quote.items ?? []).map((item: { id: string }) => item.id),
      );
      const carriedSnapshot = input.quoteId !== undefined ? null : existing.documentSnapshot;
      const priceItems = this.mergeDocumentPriceItems(carriedSnapshot, quoteItemIds, input.items);
      patch.documentSnapshot = await this.buildPricedDocumentSnapshot(
        snapshotDocument,
        String(patch.quoteId ?? existing.quoteId),
        actor,
        priceItems,
        mergeDocumentHeaderDiscount(carriedSnapshot, input)
      );
    }
    if (input.statusCode !== undefined && input.statusCode !== 'draft') {
      patch.finalizedAt = new Date();
      // Kesinleştirme, daha önce pazarlık edilmiş fiyatları silmemeli: mevcut
      // anlık görüntü varsa yalnız belge başlığı tazelenir.
      if (!patch.documentSnapshot) {
        const currentSnapshot = existing.documentSnapshot as Record<string, unknown> | null;
        patch.documentSnapshot = currentSnapshot
          ? { ...currentSnapshot, document: documentHeaderOnly({ ...snapshotDocument, finalizedAt: patch.finalizedAt }) }
          : await this.buildCommercialDocumentSnapshot(
              { ...snapshotDocument, finalizedAt: patch.finalizedAt },
              String(patch.quoteId ?? existing.quoteId),
              actor
            );
      }
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
    this.assertCommercialDocumentMutable(existing, 'Sözleşme');
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
    if (input.statusCode !== 'draft') {
      const finalizedAt = new Date();
      const documentSnapshot = await this.buildCommercialDocumentSnapshot(row as unknown as Record<string, unknown>, row.quoteId, actor);
      await this.db.update(commercialInvoices).set({ finalizedAt, documentSnapshot }).where(eq(commercialInvoices.id, row.id));
    }
    await this.invalidateInvoiceApprovals([row.quoteId], actor, 'Ticari fatura oluşturuldu');
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'commercial_invoice.created',
      resourceType: 'commercial_invoice',
      resourceId: row.id,
      newValues: { invoiceNo: row.invoiceNo, quoteId: row.quoteId },
    });
    return this.getCommercialInvoice(row.id, actor);
  }

  async updateCommercialInvoice(id: string, input: CommercialInvoiceUpdateInput, actor: AuthContext) {
    const existing = await this.getCommercialInvoice(id, actor);
    this.assertCommercialDocumentMutable(existing, 'Ticari fatura');
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
    if (input.statusCode !== undefined && input.statusCode !== 'draft') {
      patch.finalizedAt = new Date();
      patch.documentSnapshot = await this.buildCommercialDocumentSnapshot(
        { ...existing, ...patch },
        String(patch.quoteId ?? existing.quoteId),
        actor
      );
    }
    await this.db.update(commercialInvoices).set(patch).where(eq(commercialInvoices.id, id));
    await this.invalidateInvoiceApprovals(
      [existing.quoteId, String(patch.quoteId ?? existing.quoteId)],
      actor,
      'Ticari fatura değiştirildi'
    );
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
    this.assertCommercialDocumentMutable(existing, 'Ticari fatura');
    await this.db.update(commercialInvoices).set({ deletedAt: new Date() }).where(eq(commercialInvoices.id, id));
    await this.invalidateInvoiceApprovals([existing.quoteId], actor, 'Ticari fatura silindi');
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
