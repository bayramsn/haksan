import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, isNull, max, or, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import type { DbClient } from '../../db/client';
import {
  brands,
  priceListItems,
  priceLists,
  productAlternatives,
  productOptionalEquipmentCompatibilities,
  productModels,
  productSpecs,
  productSpecTemplates,
  productEquipmentItems,
  productOptionSets,
  productOptionValues,
  productMedia,
} from '../../db/schema/products';
import { files } from '../../db/schema/files';
import { companies } from '../../db/schema/companies';
import { divisions } from '../../db/schema/tenants';
import {
  productGroups,
  productCategories,
  productSubcategories,
  productTypes,
  productSpecGroups,
  equipmentTypes,
  currencies,
  companyRelationTypes,
} from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type {
  ProductCreateInput,
  ProductUpdateInput,
  ProductSpecCreateInput,
  ProductEquipmentCreateInput,
  ProductDetailsReplaceInput,
  BrandCreateInput,
  PriceListCreateInput,
  PriceListItemCreateInput,
  PriceListItemUpdateInput,
  PriceListUpdateInput,
  Pagination,
  ProductImportCommitRequest,
  ProductImportRowInput,
  ProductOptionSetCreateInput,
  ProductOptionValueCreateInput,
} from '@haksan/shared';
import { productImportRowSchema } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import {
  assertCanUseResourceDivision,
  resourceDivisionFilterWithShared,
  resolveAssignedResourceDivision,
} from '../../shared/utils/division-scope';
import { AuditService } from '../../shared/database/audit.service';
import { brandLogoPath } from './brand-media.service';

type ImportStatus = 'create' | 'update' | 'error' | 'skip';

type ProductImportPreviewRow = ProductImportRowInput & {
  status: ImportStatus;
  errors: string[];
  warnings: string[];
};

type LookupRow = { code: string; name: string };

type ProductImportLookupMaps = {
  productGroups: LookupRow[];
  productCategories: LookupRow[];
  productSubcategories: LookupRow[];
  productTypes: LookupRow[];
  productSpecGroups: LookupRow[];
  equipmentTypes: LookupRow[];
  currencies: LookupRow[];
};

type ParsedImportFile = {
  sheetName: string;
  headerRowNumber: number;
  rows: Array<Record<string, unknown> & { rowNumber: number }>;
};

const PRODUCT_MEDIA_PATH_RE =
  /(?:^|\/)(?:api\/v\d+\/)?products\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:[?#].*)?$/i;

const BASE_IMPORT_FIELD_ALIASES: Record<string, string[]> = {
  brandName: ['marka', 'brand', 'uretici', 'üretici'],
  series: ['seri', 'urun serisi', 'ürün serisi', 'series'],
  modelCode: ['model', 'model kodu', 'modelkodu', 'urun kodu', 'ürün kodu', 'stok kodu model', 'kod'],
  modelName: ['model adi', 'model adı', 'model name'],
  fullName: ['urun adi', 'ürün adı', 'urun', 'ürün', 'product name', 'full name', 'ad', 'adi', 'adı'],
  productGroupCode: ['urun grubu', 'ürün grubu', 'grup', 'product group'],
  categoryCode: ['kategori', 'category'],
  subcategoryCode: ['alt kategori', 'altkategori', 'subcategory'],
  productTypeCode: ['urun tipi', 'ürün tipi', 'tip', 'type', 'makine tipi', 'machine type'],
  currencyCode: ['para birimi', 'parabirimi', 'doviz', 'döviz', 'currency'],
  listPrice: ['liste fiyati', 'liste fiyatı', 'list price', 'fiyat', 'price'],
  cashPrice: ['pesin fiyat', 'peşin fiyat', 'cash price'],
  vatRate: ['kdv', 'kdv orani', 'kdv oranı', 'vat', 'vat rate'],
  originCountry: ['mensei', 'menşei', 'origin', 'origin country', 'ulke', 'ülke'],
  hsCode: ['gtip', 'hs code', 'hscode', 'hs'],
  stockCode: ['stok kodu', 'stokkodu', 'stock code', 'stockcode'],
  imageUrl: ['urun fotografi', 'ürün fotoğrafı', 'fotograf', 'fotoğraf', 'image', 'image url', 'gorsel', 'görsel'],
  description: ['aciklama', 'açıklama', 'description', 'not', 'notes'],
  specsText: ['teknik ozellikler', 'teknik özellikler', 'specs', 'specifications'],
  standardEquipmentText: ['standart donanim', 'standart donanım', 'standard equipment', 'standart ekipman'],
  optionalEquipmentText: ['opsiyonel donanim', 'opsiyonel donanım', 'optional equipment', 'opsiyonel ekipman'],
  controlPanel: ['kontrol paneli', 'kontrol unitesi', 'kontrol ünitesi', 'control panel', 'cnc kontrol'],
};

const BASE_IMPORT_HEADER_MAP = Object.entries(BASE_IMPORT_FIELD_ALIASES).reduce<Record<string, string>>(
  (acc, [field, aliases]) => {
    for (const alias of aliases) acc[normalizeText(alias)] = field;
    return acc;
  },
  {}
);

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactCode(value: string): string {
  return normalizeText(value).replace(/\s+/g, '_').toUpperCase();
}

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as any;
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text ?? '').join('').trim();
    if (v.text) return String(v.text).trim();
    if (v.result != null) return cellToText(v.result);
    if (v.hyperlink && v.text) return String(v.text).trim();
  }
  return String(value).trim();
}

function parseNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  let s = String(value)
    .trim()
    .replace(/[^\d,.\-]/g, '');
  if (!s || s === '-' || s === ',' || s === '.') return undefined;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.replace(new RegExp(`\\${thousands}`, 'g'), '').replace(decimal, '.');
  } else if (lastComma >= 0) {
    const fraction = s.slice(lastComma + 1);
    s = fraction.length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const fraction = s.slice(lastDot + 1);
    if (fraction.length > 2) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function splitList(value: unknown): string[] {
  return cellToText(value)
    .split(/\r?\n|;|\|/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSpecsText(value: unknown, startOrder: number): ProductImportRowInput['specs'] {
  const specs: ProductImportRowInput['specs'] = [];
  splitList(value).forEach((line, idx) => {
    const [rawKey, ...rest] = line.split(/[:=]/);
    const key = rawKey?.trim();
    const specValue = rest.join(':').trim();
    if (!key || !specValue) return;
    specs.push({
      specGroupCode: 'GENEL',
      specKey: key,
      specValue,
      sortOrder: startOrder + idx,
    });
  });
  return specs;
}

function looksLikeSpecHeader(header: string): boolean {
  const normalized = normalizeText(header);
  if (!normalized) return false;
  if (normalized.startsWith('spec ') || normalized.startsWith('ozellik ') || normalized.startsWith('özellik ')) return true;
  return !BASE_IMPORT_HEADER_MAP[normalized] && normalized.length > 1;
}

function inferProductTypeCode(...values: Array<unknown>): string | undefined {
  const text = normalizeText(values.filter(Boolean).join(' '));
  if (!text) return undefined;
  if (text.includes('kopru') || text.includes('gantry')) return 'KOPRU_TIPI_ISLEME_MERKEZI';
  if (text.includes('torna') || text.includes('lathe')) return 'CNC_TORNA';
  if (text.includes('dik') || text.includes('isleme') || text.includes('vmc')) return 'DIK_ISLEME_MERKEZI';
  return undefined;
}

function inferSubcategoryCode(...values: Array<unknown>): string | undefined {
  const text = normalizeText(values.filter(Boolean).join(' '));
  if (text.includes('torna') || text.includes('lathe')) return 'TORNA';
  if (text.includes('isleme') || text.includes('vmc') || text.includes('hmc') || text.includes('kopru')) return 'ISLEME_MERKEZI';
  if (text.includes('taslama')) return 'TASLAMA';
  return undefined;
}

function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  private brandView(brand: { id: string | null; name: string | null; logoFileId: string | null } | null) {
    if (!brand?.id || !brand.name) return null;
    return {
      id: brand.id,
      name: brand.name,
      logoFileId: brand.logoFileId,
      logoUrl: brand.logoFileId ? brandLogoPath(brand.logoFileId) : null,
    };
  }

  // ────────── BRANDS ──────────
  // divisionScoped: markalar bölüme (departmana) atanabilir; form listeleri aktif
  // bölümün + paylaşılan ("Tümü") markaları görür. İçerideki kullanım (import
  // sırasında ada göre eşleme) tüm markaları görmeye devam eder ki aynı ad iki
  // kez oluşturulup tenant bazlı ad tekliğine takılmasın.
  private async assertActiveDivision(divisionId: string, actor: AuthContext) {
    assertCanUseResourceDivision(actor, 'products', divisionId);
    const division = await this.db.query.divisions.findFirst({
      where: and(
        eq(divisions.id, divisionId),
        eq(divisions.tenantId, actor.tenantId),
        eq(divisions.isActive, true),
        isNull(divisions.deletedAt)
      ),
    });
    if (!division) throw new ValidationError('Seçilen ürün bölümü bulunamadı veya aktif değil', { field: 'divisionId' });
    return division;
  }

  async listBrands(actor: AuthContext, options?: { divisionScoped?: boolean; divisionId?: string }) {
    const filters = [eq(brands.tenantId, actor.tenantId), isNull(brands.deletedAt)];
    if (options?.divisionId) {
      await this.assertActiveDivision(options.divisionId, actor);
      filters.push(or(eq(brands.divisionId, options.divisionId), isNull(brands.divisionId))!);
    } else if (options?.divisionScoped) {
      const divisionFilter = resourceDivisionFilterWithShared(actor, 'products', brands.divisionId);
      if (divisionFilter) filters.push(divisionFilter);
    }
    const rows = await this.db
      .select()
      .from(brands)
      .where(and(...filters))
      .orderBy(asc(brands.sortOrder), asc(brands.name));
    return rows.map((brand) => ({
      ...brand,
      logoUrl: brand.logoFileId ? brandLogoPath(brand.logoFileId) : null,
    }));
  }

  async createBrand(input: BrandCreateInput, actor: AuthContext) {
    if (input.divisionId) await this.assertActiveDivision(input.divisionId, actor);
    const isOwned = input.isOwned === true;
    const companyId = isOwned ? null : input.companyId ?? null;
    if (!isOwned) {
      if (!companyId) throw new ValidationError('Markanın bağlı olduğu firma zorunludur', { field: 'companyId' });
      const [company] = await this.db
        .select({ id: companies.id, relationCode: companyRelationTypes.code })
        .from(companies)
        .leftJoin(companyRelationTypes, eq(companies.relationTypeId, companyRelationTypes.id))
        .where(and(eq(companies.id, companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)))
        .limit(1);
      if (!company || !['supplier', 'supplier_customer'].includes(company.relationCode ?? '')) {
        throw new ValidationError('Yalnızca Tedarikçi veya Müşteri + Tedarikçi firması seçilebilir', { field: 'companyId' });
      }
    }
    if (input.logoFileId) {
      throw new ValidationError('Marka logosunu CRM Alan Ayarları üzerinden yükleyin', { field: 'logoFileId' });
    }
    const existing = await this.db.query.brands.findFirst({
      where: and(eq(brands.tenantId, actor.tenantId), eq(brands.name, input.name)),
    });
    if (existing) {
      const sameScope = (existing.divisionId ?? null) === (input.divisionId ?? null);
      throw new ConflictError(
        sameScope
          ? 'Bu marka seçilen ürün grubunda zaten kayıtlı'
          : 'Bu marka başka bir ürün grubuna bağlı; CRM Alan Ayarları üzerinden bölümünü kontrol edin'
      );
    }
    const orderFilters = [eq(brands.tenantId, actor.tenantId), isNull(brands.deletedAt)];
    orderFilters.push(input.divisionId ? eq(brands.divisionId, input.divisionId) : isNull(brands.divisionId));
    const [orderRow] = await this.db.select({ value: max(brands.sortOrder) }).from(brands).where(and(...orderFilters));
    const [row] = await this.db
      .insert(brands)
      .values({
        tenantId: actor.tenantId,
        name: input.name,
        country: input.country ?? null,
        website: input.website ?? null,
        notes: input.notes ?? null,
        companyId,
        isOwned,
        divisionId: input.divisionId ?? null,
        sortOrder: Number(orderRow?.value ?? 0) + 10,
      })
      .returning();
    return { ...row, logoUrl: row.logoFileId ? brandLogoPath(row.logoFileId) : null };
  }

  private async assertBrandMatchesProductGroup(brandId: string, productGroupId: string, actor: AuthContext) {
    const [brand, group] = await Promise.all([
      this.db.query.brands.findFirst({
        where: and(eq(brands.id, brandId), eq(brands.tenantId, actor.tenantId), isNull(brands.deletedAt)),
      }),
      this.db.query.productGroups.findFirst({ where: eq(productGroups.id, productGroupId) }),
    ]);
    if (!brand) throw new NotFoundError('Marka');
    if (!group) throw new NotFoundError('Ürün grubu');
    if (brand.divisionId && brand.divisionId !== group.divisionId) {
      throw new ValidationError('Seçilen marka bu ürün grubuna ait değil', { field: 'brandId' });
    }
  }

  private uniqueAlternativeIds(input: Pick<ProductCreateInput, 'muadilProductId' | 'muadilProductIds'>, productId?: string) {
    const ids = input.muadilProductIds !== undefined ? input.muadilProductIds : input.muadilProductId ? [input.muadilProductId] : [];
    return [...new Set(ids.filter((id): id is string => !!id && id !== productId))];
  }

  private async assertAlternativeProducts(productId: string, tenantId: string, alternativeIds: string[]) {
    if (!alternativeIds.length) return;
    if (alternativeIds.includes(productId)) throw new ValidationError('Ürün kendi kendine muadil olamaz');
    const rows = await this.db
      .select({ id: productModels.id })
      .from(productModels)
      .where(and(eq(productModels.tenantId, tenantId), inArray(productModels.id, alternativeIds), isNull(productModels.deletedAt)));
    if (rows.length !== alternativeIds.length) throw new ValidationError('Geçersiz muadil ürün seçimi');
  }

  private async replaceAlternatives(productId: string, tenantId: string, alternativeIds: string[]) {
    const uniqueIds = [...new Set(alternativeIds)].filter((id) => id !== productId);
    await this.assertAlternativeProducts(productId, tenantId, uniqueIds);
    const desired = new Set(uniqueIds);
    const current = await this.db.query.productAlternatives.findMany({
      where: and(eq(productAlternatives.tenantId, tenantId), eq(productAlternatives.productModelId, productId)),
    });
    const seen = new Set<string>();
    const now = new Date();

    for (const row of current) {
      if (desired.has(row.alternativeProductModelId)) {
        seen.add(row.alternativeProductModelId);
        if (row.deletedAt) {
          await this.db.update(productAlternatives).set({ deletedAt: null }).where(eq(productAlternatives.id, row.id));
        }
      } else if (!row.deletedAt) {
        await this.db.update(productAlternatives).set({ deletedAt: now }).where(eq(productAlternatives.id, row.id));
      }
    }

    const missing = uniqueIds.filter((id) => !seen.has(id));
    if (missing.length) {
      await this.db.insert(productAlternatives).values(
        missing.map((alternativeProductModelId) => ({
          tenantId,
          productModelId: productId,
          alternativeProductModelId,
        }))
      );
    }
  }

  private async alternativesByProduct(productIds: string[], tenantId: string) {
    const out = new Map<string, any[]>();
    if (!productIds.length) return out;
    const rows = await this.db
      .select({
        productId: productAlternatives.productModelId,
        product: productModels,
        brand: { id: brands.id, name: brands.name, logoFileId: brands.logoFileId },
        currency: { id: currencies.id, code: currencies.code },
        category: { id: productCategories.id, code: productCategories.code, name: productCategories.name },
        productType: { id: productTypes.id, code: productTypes.code, name: productTypes.name },
      })
      .from(productAlternatives)
      .innerJoin(productModels, eq(productAlternatives.alternativeProductModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(currencies, eq(productModels.currencyId, currencies.id))
      .leftJoin(productCategories, eq(productModels.categoryId, productCategories.id))
      .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
      .where(
        and(
          eq(productAlternatives.tenantId, tenantId),
          inArray(productAlternatives.productModelId, productIds),
          isNull(productAlternatives.deletedAt),
          isNull(productModels.deletedAt)
        )
      )
      .orderBy(asc(productCategories.name), asc(productModels.fullName));
    for (const row of rows) {
      const list = out.get(row.productId) ?? [];
      list.push({
        ...row.product,
        brand: this.brandView(row.brand),
        currency: row.currency,
        category: row.category,
        productType: row.productType,
      });
      out.set(row.productId, list);
    }
    return out;
  }

  private async productTypesById(typeIds: string[]) {
    const out = new Map<string, { id: string; code: string; name: string }>();
    const ids = [...new Set(typeIds.filter(Boolean))];
    if (!ids.length) return out;
    const rows = await this.db
      .select({ id: productTypes.id, code: productTypes.code, name: productTypes.name })
      .from(productTypes)
      .where(inArray(productTypes.id, ids));
    for (const row of rows) out.set(row.id, row);
    return out;
  }

  private optionalCompatibilityProvided(input: ProductCreateInput | ProductUpdateInput) {
    return (
      input.optionalCompatibilityGroupCodes !== undefined ||
      input.optionalCompatibilityCategoryCodes !== undefined ||
      input.optionalCompatibilitySubcategoryCodes !== undefined ||
      input.optionalCompatibilityTypeCodes !== undefined ||
      input.optionalCompatibilityBrandIds !== undefined
    );
  }

  private async lookupIdsByCode(table: any, codes: string[] | undefined) {
    const ids = await Promise.all([...new Set(codes ?? [])].filter(Boolean).map((code) => lookupIdByCode(this.db, table, code)));
    return ids.filter((id): id is string => Boolean(id));
  }

  private async assertSupplierCompany(companyId: string | null | undefined, tenantId: string) {
    if (!companyId) return;
    const [company] = await this.db
      .select({ id: companies.id, relationCode: companyRelationTypes.code })
      .from(companies)
      .leftJoin(companyRelationTypes, eq(companies.relationTypeId, companyRelationTypes.id))
      .where(and(eq(companies.id, companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)))
      .limit(1);
    if (!company) throw new NotFoundError('Tedarikçi');
    if (company.relationCode !== 'supplier' && company.relationCode !== 'supplier_customer') {
      throw new ValidationError('Tedarikçi firma seçiniz');
    }
  }

  private async defaultProductGroupCodeForActor(actor: AuthContext): Promise<string> {
    const divisionId = resolveAssignedResourceDivision(actor, 'products', null);
    if (!divisionId) {
      throw new ValidationError('Ürün oluştururken somut bölüm seçimi zorunludur', { field: 'divisionId' });
    }
    const division = await this.db.query.divisions.findFirst({ where: eq(divisions.id, divisionId) });
    const code = division?.code;
    if (code === 'cnc') return 'CNC';
    if (code === 'universal') return 'UNIVERSAL';
    if (code === 'sac_isleme') return 'SAC_ISLEME';
    throw new ValidationError('Aktif bölüm için varsayılan ürün grubu bulunamadı', { field: 'productGroupCode' });
  }

  private async assertProductGroupScope(productGroupId: string | null | undefined, actor: AuthContext) {
    if (!productGroupId) return;
    const group = await this.db.query.productGroups.findFirst({
      where: eq(productGroups.id, productGroupId),
    });
    if (!group) throw new NotFoundError('Ürün grubu');
    assertCanUseResourceDivision(actor, 'products', group.divisionId);
  }

  private productMediaFileId(imageUrl: string | null | undefined): string | null {
    const clean = imageUrl?.trim();
    if (!clean) return null;
    return PRODUCT_MEDIA_PATH_RE.exec(clean)?.[1] ?? null;
  }

  private async resolveProductImageMediaFile(actor: AuthContext, imageUrl: string | null | undefined) {
    const fileId = this.productMediaFileId(imageUrl);
    if (!fileId) return null;

    const file = await this.db.query.files.findFirst({
      where: and(
        eq(files.id, fileId),
        eq(files.tenantId, actor.tenantId),
        eq(files.bucket, 'erp-product-images'),
        eq(files.visibility, 'public'),
        inArray(files.uploadStatus, ['uploaded', 'linked']),
        isNull(files.deletedAt)
      ),
    });
    if (!file) throw new ValidationError('Ürün görsel dosyası bulunamadı veya public ürün görseli değil');
    if (file.uploadedBy !== actor.userId) throw new ValidationError('Ürün görselini yalnızca yükleyen kullanıcı bağlayabilir');
    if (!file.mimeType.startsWith('image/')) throw new ValidationError('Ürün görseli için yalnızca resim dosyası kullanılabilir');
    return { fileId, file };
  }

  private async attachProductImageMedia(productId: string, actor: AuthContext, imageUrl: string | null | undefined) {
    const resolved = await this.resolveProductImageMediaFile(actor, imageUrl);
    if (!resolved) return;
    const { fileId, file } = resolved;

    const existing = await this.db.query.productMedia.findFirst({
      where: and(
        eq(productMedia.tenantId, actor.tenantId),
        eq(productMedia.productModelId, productId),
        eq(productMedia.fileId, fileId)
      ),
    });
    if (existing) return;
    if (file.uploadStatus !== 'uploaded') throw new ValidationError('Ürün görseli zaten başka bir kayda bağlanmış');

    await this.db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(files)
        .set({ uploadStatus: 'linked' })
        .where(and(eq(files.id, fileId), eq(files.tenantId, actor.tenantId), eq(files.uploadStatus, 'uploaded')))
        .returning({ id: files.id });
      if (!claimed) throw new ValidationError('Ürün görseli zaten başka bir kayda bağlanmış');
      await tx.insert(productMedia).values({
        tenantId: actor.tenantId,
        productModelId: productId,
        fileId,
        mediaType: 'image',
        title: file.originalFilename,
        sortOrder: 0,
      });
    });
  }

  private async assertBrandIds(brandIds: string[] | undefined, tenantId: string) {
    const ids = [...new Set(brandIds ?? [])].filter(Boolean);
    if (!ids.length) return [];
    const rows = await this.db.query.brands.findMany({
      where: and(eq(brands.tenantId, tenantId), inArray(brands.id, ids), isNull(brands.deletedAt)),
    });
    if (rows.length !== ids.length) throw new NotFoundError('Marka');
    return ids;
  }

  private async replaceOptionalCompatibilities(productId: string, tenantId: string, input: ProductCreateInput | ProductUpdateInput) {
    const [groupIds, categoryIds, subcategoryIds, typeIds, brandIds] = await Promise.all([
      this.lookupIdsByCode(productGroups, input.optionalCompatibilityGroupCodes),
      this.lookupIdsByCode(productCategories, input.optionalCompatibilityCategoryCodes),
      this.lookupIdsByCode(productSubcategories, input.optionalCompatibilitySubcategoryCodes),
      this.lookupIdsByCode(productTypes, input.optionalCompatibilityTypeCodes),
      this.assertBrandIds(input.optionalCompatibilityBrandIds, tenantId),
    ]);

    await this.db
      .update(productOptionalEquipmentCompatibilities)
      .set({ deletedAt: new Date() })
      .where(and(eq(productOptionalEquipmentCompatibilities.tenantId, tenantId), eq(productOptionalEquipmentCompatibilities.productModelId, productId), isNull(productOptionalEquipmentCompatibilities.deletedAt)));

    const rows = [
      ...groupIds.map((productGroupId) => ({ productGroupId })),
      ...categoryIds.map((categoryId) => ({ categoryId })),
      ...subcategoryIds.map((subcategoryId) => ({ subcategoryId })),
      ...typeIds.map((productTypeId) => ({ productTypeId })),
      ...brandIds.map((brandId) => ({ brandId })),
    ].map((row) => ({
      tenantId,
      productModelId: productId,
      productGroupId: 'productGroupId' in row ? row.productGroupId : null,
      categoryId: 'categoryId' in row ? row.categoryId : null,
      subcategoryId: 'subcategoryId' in row ? row.subcategoryId : null,
      productTypeId: 'productTypeId' in row ? row.productTypeId : null,
      brandId: 'brandId' in row ? row.brandId : null,
    }));

    if (rows.length) {
      await this.db.insert(productOptionalEquipmentCompatibilities).values(rows).onConflictDoNothing();
    }
  }

  private async optionalCompatibilitiesByProduct(productIds: string[], tenantId: string) {
    const out = new Map<string, {
      groupCodes: string[];
      categoryCodes: string[];
      subcategoryCodes: string[];
      typeCodes: string[];
      brandIds: string[];
      rows: Array<{
        productGroupId: string | null;
        categoryId: string | null;
        subcategoryId: string | null;
        productTypeId: string | null;
        brandId: string | null;
      }>;
    }>();
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) return out;
    const rows = await this.db
      .select({
        productId: productOptionalEquipmentCompatibilities.productModelId,
        productGroupId: productOptionalEquipmentCompatibilities.productGroupId,
        categoryId: productOptionalEquipmentCompatibilities.categoryId,
        subcategoryId: productOptionalEquipmentCompatibilities.subcategoryId,
        productTypeId: productOptionalEquipmentCompatibilities.productTypeId,
        brandId: productOptionalEquipmentCompatibilities.brandId,
        groupCode: productGroups.code,
        categoryCode: productCategories.code,
        subcategoryCode: productSubcategories.code,
        typeCode: productTypes.code,
      })
      .from(productOptionalEquipmentCompatibilities)
      .leftJoin(productGroups, eq(productOptionalEquipmentCompatibilities.productGroupId, productGroups.id))
      .leftJoin(productCategories, eq(productOptionalEquipmentCompatibilities.categoryId, productCategories.id))
      .leftJoin(productSubcategories, eq(productOptionalEquipmentCompatibilities.subcategoryId, productSubcategories.id))
      .leftJoin(productTypes, eq(productOptionalEquipmentCompatibilities.productTypeId, productTypes.id))
      .where(and(
        eq(productOptionalEquipmentCompatibilities.tenantId, tenantId),
        inArray(productOptionalEquipmentCompatibilities.productModelId, ids),
        isNull(productOptionalEquipmentCompatibilities.deletedAt)
      ));

    for (const row of rows) {
      const item = out.get(row.productId) ?? { groupCodes: [], categoryCodes: [], subcategoryCodes: [], typeCodes: [], brandIds: [], rows: [] };
      if (row.groupCode) item.groupCodes.push(row.groupCode);
      if (row.categoryCode) item.categoryCodes.push(row.categoryCode);
      if (row.subcategoryCode) item.subcategoryCodes.push(row.subcategoryCode);
      if (row.typeCode) item.typeCodes.push(row.typeCode);
      if (row.brandId) item.brandIds.push(row.brandId);
      item.rows.push({
        productGroupId: row.productGroupId,
        categoryId: row.categoryId,
        subcategoryId: row.subcategoryId,
        productTypeId: row.productTypeId,
        brandId: row.brandId,
      });
      out.set(row.productId, item);
    }
    return out;
  }

  // ────────── PRODUCTS ──────────
  async list(actor: AuthContext, query: { search?: string; brandId?: string; categoryCode?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(productModels.tenantId, actor.tenantId), isNull(productModels.deletedAt)];
    if (query.search) filters.push(ilike(productModels.fullName, `%${query.search}%`));
    if (query.brandId) filters.push(eq(productModels.brandId, query.brandId));
    if (query.categoryCode) {
      const categoryId = await lookupIdByCode(this.db, productCategories, query.categoryCode);
      // Use a sentinel that matches nothing if the category code is unknown.
      filters.push(eq(productModels.categoryId, categoryId ?? '00000000-0000-0000-0000-000000000000'));
    }
    const productScope = resourceDivisionFilterWithShared(actor, 'products', productGroups.divisionId);
    if (productScope) filters.push(productScope);
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(productModels)
      .leftJoin(productGroups, eq(productModels.productGroupId, productGroups.id))
      .where(where);
    const rows = await this.db
      .select({
        product: productModels,
        brand: { id: brands.id, name: brands.name, logoFileId: brands.logoFileId },
        currency: { id: currencies.id, code: currencies.code },
        productGroup: { id: productGroups.id, code: productGroups.code, name: productGroups.name },
        category: { id: productCategories.id, code: productCategories.code, name: productCategories.name },
        subcategory: { id: productSubcategories.id, code: productSubcategories.code, name: productSubcategories.name },
        productType: { id: productTypes.id, code: productTypes.code, name: productTypes.name },
      })
      .from(productModels)
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(currencies, eq(productModels.currencyId, currencies.id))
      .leftJoin(productGroups, eq(productModels.productGroupId, productGroups.id))
      .leftJoin(productCategories, eq(productModels.categoryId, productCategories.id))
      .leftJoin(productSubcategories, eq(productModels.subcategoryId, productSubcategories.id))
      .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
      .where(where)
      .orderBy(desc(productModels.createdAt))
      .limit(limit)
      .offset(offset);

    const productIds = rows.map((r) => r.product.id);
    const specsByProduct = new Map<string, Array<{ key: string; value: string; unit?: string | null; groupCode?: string | null; groupName?: string | null; group?: string | null }>>();
    const standardByProduct = new Map<string, string[]>();
    const optionalByProduct = new Map<string, string[]>();

    if (productIds.length) {
      const specRows = await this.db
        .select({
          productId: productSpecs.productModelId,
          key: productSpecs.specKey,
          value: productSpecs.specValue,
          unit: productSpecs.specUnit,
          groupCode: productSpecGroups.code,
          groupName: productSpecGroups.name,
        })
        .from(productSpecs)
        .leftJoin(productSpecGroups, eq(productSpecs.specGroupId, productSpecGroups.id))
        .where(and(inArray(productSpecs.productModelId, productIds), isNull(productSpecs.deletedAt)))
        .orderBy(asc(productSpecs.sortOrder));

      for (const spec of specRows) {
        const list = specsByProduct.get(spec.productId) ?? [];
        list.push({ key: spec.key, value: spec.value, unit: spec.unit, groupCode: spec.groupCode, groupName: spec.groupName, group: spec.groupName });
        specsByProduct.set(spec.productId, list);
      }

      const equipmentRows = await this.db
        .select({
          productId: productEquipmentItems.productModelId,
          title: productEquipmentItems.title,
          typeCode: equipmentTypes.code,
        })
        .from(productEquipmentItems)
        .leftJoin(equipmentTypes, eq(productEquipmentItems.equipmentTypeId, equipmentTypes.id))
        .where(and(inArray(productEquipmentItems.productModelId, productIds), isNull(productEquipmentItems.deletedAt)))
        .orderBy(asc(productEquipmentItems.sortOrder));

      for (const item of equipmentRows) {
        const target = item.typeCode === 'opsiyonel' ? optionalByProduct : standardByProduct;
        const list = target.get(item.productId) ?? [];
        list.push(item.title);
        target.set(item.productId, list);
      }
    }
    const compatibleTypes = await this.productTypesById(
      rows.map((r) => r.product.compatibleMachineTypeId).filter((id): id is string => !!id)
    );
    const [alternatives, optionalCompatibilities] = await Promise.all([
      this.alternativesByProduct(productIds, actor.tenantId),
      this.optionalCompatibilitiesByProduct(productIds, actor.tenantId),
    ]);

    return buildPaginated(
      rows.map((r) => {
        const muadilProducts = alternatives.get(r.product.id) ?? [];
        const optionalCompatibility = optionalCompatibilities.get(r.product.id);
        return {
          ...r.product,
          brand: this.brandView(r.brand),
          currency: r.currency,
          productGroup: r.productGroup,
          category: r.category,
          subcategory: r.subcategory,
          productType: r.productType,
          compatibleMachineType: r.product.compatibleMachineTypeId ? compatibleTypes.get(r.product.compatibleMachineTypeId) ?? null : null,
          specs: specsByProduct.get(r.product.id) ?? [],
          standardEquipment: standardByProduct.get(r.product.id) ?? [],
          optionalEquipment: optionalByProduct.get(r.product.id) ?? [],
          muadilProductIds: muadilProducts.map((p) => p.id),
          muadilProducts,
          optionalCompatibilityGroupCodes: optionalCompatibility?.groupCodes ?? [],
          optionalCompatibilityCategoryCodes: optionalCompatibility?.categoryCodes ?? [],
          optionalCompatibilitySubcategoryCodes: optionalCompatibility?.subcategoryCodes ?? [],
          optionalCompatibilityTypeCodes: optionalCompatibility?.typeCodes ?? [],
          optionalCompatibilityBrandIds: optionalCompatibility?.brandIds ?? [],
        };
      }),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const [row] = await this.db
      .select({
        product: productModels,
        brand: { id: brands.id, name: brands.name, logoFileId: brands.logoFileId },
        currency: { id: currencies.id, code: currencies.code },
        productGroup: { id: productGroups.id, code: productGroups.code, name: productGroups.name },
        category: { id: productCategories.id, code: productCategories.code, name: productCategories.name },
        subcategory: { id: productSubcategories.id, code: productSubcategories.code, name: productSubcategories.name },
        productType: { id: productTypes.id, code: productTypes.code, name: productTypes.name },
      })
      .from(productModels)
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(currencies, eq(productModels.currencyId, currencies.id))
      .leftJoin(productGroups, eq(productModels.productGroupId, productGroups.id))
      .leftJoin(productCategories, eq(productModels.categoryId, productCategories.id))
      .leftJoin(productSubcategories, eq(productModels.subcategoryId, productSubcategories.id))
      .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
      .where(
        and(
          eq(productModels.id, id),
          eq(productModels.tenantId, actor.tenantId),
          isNull(productModels.deletedAt),
          resourceDivisionFilterWithShared(actor, 'products', productGroups.divisionId) ?? sql`true`
        )
      )
      .limit(1);
    if (!row) throw new NotFoundError('Ürün');
    const [compatibleTypes, alternatives, optionalCompatibilities] = await Promise.all([
      this.productTypesById(row.product.compatibleMachineTypeId ? [row.product.compatibleMachineTypeId] : []),
      this.alternativesByProduct([id], actor.tenantId),
      this.optionalCompatibilitiesByProduct([id], actor.tenantId),
    ]);
    const muadilProducts = alternatives.get(id) ?? [];
    const optionalCompatibility = optionalCompatibilities.get(id);
    return {
      ...row.product,
      brand: this.brandView(row.brand),
      currency: row.currency,
      productGroup: row.productGroup,
      category: row.category,
      subcategory: row.subcategory,
      productType: row.productType,
      compatibleMachineType: row.product.compatibleMachineTypeId ? compatibleTypes.get(row.product.compatibleMachineTypeId) ?? null : null,
      muadilProductIds: muadilProducts.map((p) => p.id),
      muadilProducts,
      optionalCompatibilityGroupCodes: optionalCompatibility?.groupCodes ?? [],
      optionalCompatibilityCategoryCodes: optionalCompatibility?.categoryCodes ?? [],
      optionalCompatibilitySubcategoryCodes: optionalCompatibility?.subcategoryCodes ?? [],
      optionalCompatibilityTypeCodes: optionalCompatibility?.typeCodes ?? [],
      optionalCompatibilityBrandIds: optionalCompatibility?.brandIds ?? [],
    };
  }

  async create(input: ProductCreateInput, actor: AuthContext) {
    const existing = await this.db.query.productModels.findFirst({
      where: and(eq(productModels.tenantId, actor.tenantId), eq(productModels.modelCode, input.modelCode)),
    });
    if (existing) throw new ConflictError('Bu model kodu zaten kayıtlı');

    const productGroupCode = input.productGroupCode ?? (await this.defaultProductGroupCodeForActor(actor));
    const [groupId, catId, subId, typeId, compatibleMachineTypeId, currencyId] = await Promise.all([
      lookupIdByCode(this.db, productGroups, productGroupCode),
      lookupIdByCode(this.db, productCategories, input.categoryCode),
      lookupIdByCode(this.db, productSubcategories, input.subcategoryCode),
      lookupIdByCode(this.db, productTypes, input.productTypeCode),
      input.compatibleMachineTypeCode ? lookupIdByCode(this.db, productTypes, input.compatibleMachineTypeCode) : Promise.resolve(null),
      lookupIdByCode(this.db, currencies, input.currencyCode),
    ]);
    const alternativeIds = this.uniqueAlternativeIds(input);
    await this.assertAlternativeProducts('', actor.tenantId, alternativeIds);
    await this.assertSupplierCompany(input.supplierCompanyId, actor.tenantId);
    if (!groupId) throw new ValidationError('Ürün grubu bulunamadı', { field: 'productGroupCode' });
    await this.assertProductGroupScope(groupId, actor);
    await this.assertBrandMatchesProductGroup(input.brandId, groupId, actor);
    await this.resolveProductImageMediaFile(actor, input.imageUrl);

    let row: typeof productModels.$inferSelect;
    try {
      [row] = await this.db
        .insert(productModels)
        .values({
          tenantId: actor.tenantId,
          brandId: input.brandId,
          series: input.series ?? null,
          productGroupId: groupId,
          categoryId: catId,
          subcategoryId: subId,
          productTypeId: typeId,
          compatibleMachineTypeId,
          supplierCompanyId: input.supplierCompanyId ?? null,
          modelCode: input.modelCode,
          modelName: input.modelName ?? null,
          fullName: input.fullName,
          currencyId,
          listPrice: input.listPrice?.toString() ?? null,
          cashPrice: input.cashPrice?.toString() ?? null,
          vatRate: input.vatRate.toString(),
          originCountry: input.originCountry ?? null,
          hsCode: input.hsCode ?? null,
          stockCode: input.stockCode ?? null,
          imageUrl: input.imageUrl ?? null,
          description: input.description ?? null,
          muadilProductId: alternativeIds[0] ?? input.muadilProductId ?? null,
        })
        .returning();
    } catch (error: any) {
      // Eşzamanlı (örn. çift tıklamayla gönderilen) istekler bu noktaya kadarki
      // "existing" kontrolünü ikisi de geçebilir; DB'nin unique constraint'i
      // ikinci isteği burada yakalar. Ham pg hatasını 500 olarak sızdırmak yerine
      // aynı temiz ConflictError'a çeviriyoruz.
      if ((error?.code ?? error?.cause?.code) === '23505') throw new ConflictError('Bu model kodu zaten kayıtlı');
      throw error;
    }
    await this.replaceAlternatives(row.id, actor.tenantId, alternativeIds);
    await this.replaceOptionalCompatibilities(row.id, actor.tenantId, input);
    await this.attachProductImageMedia(row.id, actor, input.imageUrl);
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'product.created',
      resourceType: 'product_model',
      resourceId: row.id,
      newValues: { modelCode: row.modelCode, fullName: row.fullName },
    });
    return row;
  }

  async update(id: string, input: ProductUpdateInput, actor: AuthContext) {
    const existing = await this.get(id, actor);
    const patch: Record<string, unknown> = {};
    if (input.brandId !== undefined) patch.brandId = input.brandId;
    if (input.productGroupCode !== undefined) {
      const groupId = await lookupIdByCode(this.db, productGroups, input.productGroupCode);
      await this.assertProductGroupScope(groupId, actor);
      patch.productGroupId = groupId;
    }
    if (input.categoryCode !== undefined)
      patch.categoryId = await lookupIdByCode(this.db, productCategories, input.categoryCode);
    if (input.subcategoryCode !== undefined)
      patch.subcategoryId = await lookupIdByCode(this.db, productSubcategories, input.subcategoryCode);
    if (input.productTypeCode !== undefined)
      patch.productTypeId = await lookupIdByCode(this.db, productTypes, input.productTypeCode);
    if (input.compatibleMachineTypeCode !== undefined)
      patch.compatibleMachineTypeId = input.compatibleMachineTypeCode ? await lookupIdByCode(this.db, productTypes, input.compatibleMachineTypeCode) : null;
    if (input.currencyCode !== undefined)
      patch.currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    if (input.supplierCompanyId !== undefined) {
      await this.assertSupplierCompany(input.supplierCompanyId, actor.tenantId);
      patch.supplierCompanyId = input.supplierCompanyId ?? null;
    }
    const targetBrandId = input.brandId ?? existing.brandId;
    const targetProductGroupId = (patch.productGroupId as string | undefined) ?? existing.productGroupId;
    if (targetBrandId && targetProductGroupId) {
      await this.assertBrandMatchesProductGroup(targetBrandId, targetProductGroupId, actor);
    }
    if (input.imageUrl !== undefined) await this.resolveProductImageMediaFile(actor, input.imageUrl);
    const alternativesProvided = input.muadilProductIds !== undefined || input.muadilProductId !== undefined;
    const alternativeIds = alternativesProvided ? this.uniqueAlternativeIds(input, id) : [];
    if (alternativesProvided) patch.muadilProductId = alternativeIds[0] ?? null;
    for (const k of ['series', 'modelCode', 'modelName', 'fullName', 'originCountry', 'hsCode', 'stockCode', 'imageUrl', 'description'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    for (const k of ['listPrice', 'cashPrice', 'vatRate'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = ((input as any)[k] as number | undefined)?.toString() ?? null;
    }
    try {
      await this.db.update(productModels).set(patch).where(eq(productModels.id, id));
    } catch (error: any) {
      if ((error?.code ?? error?.cause?.code) === '23505') throw new ConflictError('Bu model kodu zaten kayıtlı');
      throw error;
    }
    if (alternativesProvided) await this.replaceAlternatives(id, actor.tenantId, alternativeIds);
    if (this.optionalCompatibilityProvided(input)) await this.replaceOptionalCompatibilities(id, actor.tenantId, input);
    if (input.imageUrl !== undefined) await this.attachProductImageMedia(id, actor, input.imageUrl);
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'product.updated',
      resourceType: 'product_model',
      resourceId: id,
      oldValues: existing,
      newValues: patch,
    });
    return this.get(id, actor);
  }

  async delete(id: string, actor: AuthContext) {
    await this.get(id, actor);
    await this.db.update(productModels).set({ deletedAt: new Date() }).where(eq(productModels.id, id));
    return { ok: true };
  }

  // ────────── SPECS ──────────
  async listSpecTemplates(productTypeCode?: string, actor?: AuthContext) {
    const filters = [
      eq(productSpecTemplates.isActive, true),
      eq(productSpecTemplates.isDeleted, false),
    ];
    if (productTypeCode?.trim()) filters.push(eq(productSpecTemplates.productTypeCode, productTypeCode.trim()));
    // Aktif bölüm kendi + paylaşılan ("Tümü") şablonları görür (teklif/ürün diyalogları).
    if (actor) {
      const divFilter = resourceDivisionFilterWithShared(actor, 'products', productSpecTemplates.divisionId);
      if (divFilter) filters.push(divFilter);
    }
    return this.db
      .select()
      .from(productSpecTemplates)
      .where(and(...filters))
      .orderBy(asc(productSpecTemplates.productTypeCode), asc(productSpecTemplates.sortOrder), asc(productSpecTemplates.specKey));
  }

  async listSpecs(productId: string, actor: AuthContext) {
    await this.get(productId, actor);
    return this.db
      .select({
        spec: productSpecs,
        group: { id: productSpecGroups.id, code: productSpecGroups.code, name: productSpecGroups.name },
      })
      .from(productSpecs)
      .leftJoin(productSpecGroups, eq(productSpecs.specGroupId, productSpecGroups.id))
      .where(and(eq(productSpecs.productModelId, productId), isNull(productSpecs.deletedAt)))
      .orderBy(asc(productSpecs.sortOrder));
  }

  async addSpec(productId: string, input: ProductSpecCreateInput, actor: AuthContext) {
    await this.get(productId, actor);
    const groupId = await lookupIdByCode(this.db, productSpecGroups, input.specGroupCode);
    const [row] = await this.db
      .insert(productSpecs)
      .values({
        tenantId: actor.tenantId,
        productModelId: productId,
        specGroupId: groupId,
        specKey: input.specKey,
        specValue: input.specValue,
        specUnit: input.specUnit ?? null,
        sortOrder: input.sortOrder,
      })
      .returning();
    return row;
  }

  // ────────── EQUIPMENT ──────────
  async listEquipment(productId: string, actor: AuthContext) {
    await this.get(productId, actor);
    return this.db
      .select({
        item: productEquipmentItems,
        type: { id: equipmentTypes.id, code: equipmentTypes.code, name: equipmentTypes.name },
        currency: { id: currencies.id, code: currencies.code },
      })
      .from(productEquipmentItems)
      .leftJoin(equipmentTypes, eq(productEquipmentItems.equipmentTypeId, equipmentTypes.id))
      .leftJoin(currencies, eq(productEquipmentItems.currencyId, currencies.id))
      .where(and(eq(productEquipmentItems.productModelId, productId), isNull(productEquipmentItems.deletedAt)))
      .orderBy(asc(productEquipmentItems.sortOrder));
  }

  async listCompatibleOptionalEquipment(productId: string, actor: AuthContext) {
    const machine = await this.get(productId, actor);
    const optionalCategoryId = await lookupIdByCode(this.db, productCategories, 'OPSIYONEL_DONANIM');
    if (!optionalCategoryId) return [];
    const rows = await this.db
      .select({
        product: productModels,
        brand: { id: brands.id, name: brands.name, logoFileId: brands.logoFileId },
        currency: { id: currencies.id, code: currencies.code },
        productGroup: { id: productGroups.id, code: productGroups.code, name: productGroups.name },
        category: { id: productCategories.id, code: productCategories.code, name: productCategories.name },
        subcategory: { id: productSubcategories.id, code: productSubcategories.code, name: productSubcategories.name },
        productType: { id: productTypes.id, code: productTypes.code, name: productTypes.name },
      })
      .from(productModels)
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(currencies, eq(productModels.currencyId, currencies.id))
      .leftJoin(productGroups, eq(productModels.productGroupId, productGroups.id))
      .leftJoin(productCategories, eq(productModels.categoryId, productCategories.id))
      .leftJoin(productSubcategories, eq(productModels.subcategoryId, productSubcategories.id))
      .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
      .where(
        and(
          eq(productModels.tenantId, actor.tenantId),
          eq(productModels.categoryId, optionalCategoryId),
          isNull(productModels.deletedAt),
          resourceDivisionFilterWithShared(actor, 'products', productGroups.divisionId) ?? sql`true`
        )
      )
      .orderBy(asc(productModels.fullName));
    const compatibilities = await this.optionalCompatibilitiesByProduct(rows.map((r) => r.product.id), actor.tenantId);
    return rows.filter((row) => {
      if (row.product.compatibleMachineTypeId && row.product.compatibleMachineTypeId === machine.productTypeId) return true;
      const compatibility = compatibilities.get(row.product.id);
      if (!compatibility) return false;
      return compatibility.rows.some((item) =>
        (item.productGroupId && item.productGroupId === machine.productGroupId) ||
        (item.categoryId && item.categoryId === machine.categoryId) ||
        (item.subcategoryId && item.subcategoryId === machine.subcategoryId) ||
        (item.productTypeId && item.productTypeId === machine.productTypeId) ||
        (item.brandId && item.brandId === machine.brandId)
      );
    });
  }

  async addEquipment(productId: string, input: ProductEquipmentCreateInput, actor: AuthContext) {
    await this.get(productId, actor);
    const typeId = await lookupIdByCode(this.db, equipmentTypes, input.equipmentTypeCode);
    const [row] = await this.db
      .insert(productEquipmentItems)
      .values({
        tenantId: actor.tenantId,
        productModelId: productId,
        equipmentTypeId: typeId,
        title: input.title,
        description: input.description ?? null,
        isPromotion: input.isPromotion,
        sortOrder: input.sortOrder,
      })
      .returning();
    return row;
  }

  async replaceDetails(productId: string, input: ProductDetailsReplaceInput, actor: AuthContext) {
    await this.get(productId, actor);
    const deletedAt = new Date();
    await Promise.all([
      this.db.update(productSpecs).set({ deletedAt }).where(eq(productSpecs.productModelId, productId)),
      this.db.update(productEquipmentItems).set({ deletedAt }).where(eq(productEquipmentItems.productModelId, productId)),
    ]);

    if (input.specs.length) {
      await this.db.insert(productSpecs).values(
        await Promise.all(
          input.specs.map(async (spec) => ({
            tenantId: actor.tenantId,
            productModelId: productId,
            specGroupId: await lookupIdByCode(this.db, productSpecGroups, spec.specGroupCode),
            specKey: spec.specKey,
            specValue: spec.specValue,
            specUnit: spec.specUnit ?? null,
            sortOrder: spec.sortOrder,
          }))
        )
      );
    }

    if (input.equipment.length) {
      await this.db.insert(productEquipmentItems).values(
        await Promise.all(
          input.equipment.map(async (item) => ({
            tenantId: actor.tenantId,
            productModelId: productId,
            equipmentTypeId: await lookupIdByCode(this.db, equipmentTypes, item.equipmentTypeCode),
            title: item.title,
            description: item.description ?? null,
            isPromotion: item.isPromotion,
            sortOrder: item.sortOrder,
          }))
        )
      );
    }

    return { ok: true };
  }

  // ────────── OPTION SETS ──────────
  async listOptionSets(productId: string, actor: AuthContext) {
    await this.get(productId, actor);
    const sets = await this.db.query.productOptionSets.findMany({
      where: and(eq(productOptionSets.productModelId, productId), isNull(productOptionSets.deletedAt)),
      orderBy: asc(productOptionSets.sortOrder),
    });
    const setIds = sets.map((s: any) => s.id);
    const values = setIds.length > 0 ? await this.db.query.productOptionValues.findMany({
      where: and(inArray(productOptionValues.optionSetId, setIds as string[]), isNull(productOptionValues.deletedAt)),
      orderBy: asc(productOptionValues.sortOrder),
    }) : [];

    return sets.map((s: any) => ({
      ...s,
      values: values.filter((v: any) => v.optionSetId === s.id),
    }));
  }

  async addOptionSet(productId: string, input: ProductOptionSetCreateInput, actor: AuthContext) {
    await this.get(productId, actor);
    const [row] = await this.db.insert(productOptionSets).values({
      tenantId: actor.tenantId,
      productModelId: productId,
      name: input.name,
      sortOrder: input.sortOrder ?? 0,
    }).returning();
    return row;
  }

  async addOptionValue(optionSetId: string, input: ProductOptionValueCreateInput, actor: AuthContext) {
    const set = await this.db.query.productOptionSets.findFirst({
      where: and(eq(productOptionSets.id, optionSetId), eq(productOptionSets.tenantId, actor.tenantId), isNull(productOptionSets.deletedAt))
    });
    if (!set) throw new NotFoundError('Opsiyon seti bulunamadı');
    
    const currencyId = input.currencyCode ? await lookupIdByCode(this.db, currencies, input.currencyCode) : null;
    
    const [row] = await this.db.insert(productOptionValues).values({
      tenantId: actor.tenantId,
      optionSetId,
      value: input.value,
      priceDelta: input.priceDelta?.toString() ?? null,
      currencyId,
      sortOrder: input.sortOrder ?? 0,
    }).returning();
    return row;
  }

  // ────────── PRODUCT IMPORT ──────────
  async previewImport(input: { fileName: string; fileBase64: string }, actor: AuthContext) {
    const parsed = await this.parseImportFile(input.fileName, input.fileBase64);
    const lookups = await this.getImportLookupMaps();
    const rows: ProductImportPreviewRow[] = [];

    for (const raw of parsed.rows) {
      const row = await this.normalizeImportRow(raw, lookups, actor);
      rows.push(row);
    }

    return {
      fileName: input.fileName,
      sheetName: parsed.sheetName,
      headerRowNumber: parsed.headerRowNumber,
      totalRows: rows.length,
      rows,
      summary: this.summarizeImportRows(rows),
    };
  }

  async commitImport(input: ProductImportCommitRequest, actor: AuthContext) {
    const lookups = await this.getImportLookupMaps();
    const results: Array<{ rowNumber: number; modelCode: string; status: ImportStatus; productId?: string; errors: string[] }> = [];

    for (const candidate of input.rows) {
      const parsed = productImportRowSchema.safeParse(candidate);
      if (!parsed.success) {
        results.push({
          rowNumber: candidate.rowNumber,
          modelCode: candidate.modelCode ?? '',
          status: 'error',
          errors: parsed.error.issues.map((issue) => issue.message),
        });
        continue;
      }

      const normalized = await this.normalizeImportRow(parsed.data as any, lookups, actor);
      if (normalized.errors.length) {
        results.push({
          rowNumber: normalized.rowNumber,
          modelCode: normalized.modelCode,
          status: 'error',
          errors: normalized.errors,
        });
        continue;
      }

      const existing = await this.findProductByModelCode(normalized.modelCode, actor);
      if (existing && input.mode === 'create_only') {
        results.push({
          rowNumber: normalized.rowNumber,
          modelCode: normalized.modelCode,
          status: 'skip',
          productId: existing.id,
          errors: [],
        });
        continue;
      }

      const brand = await this.getOrCreateBrand(normalized.brandName, actor);
      const [groupId, catId, subId, typeId, currencyId] = await Promise.all([
        lookupIdByCode(this.db, productGroups, normalized.productGroupCode),
        lookupIdByCode(this.db, productCategories, normalized.categoryCode),
        lookupIdByCode(this.db, productSubcategories, normalized.subcategoryCode),
        lookupIdByCode(this.db, productTypes, normalized.productTypeCode),
        lookupIdByCode(this.db, currencies, normalized.currencyCode),
      ]);
      if (!groupId) {
        results.push({
          rowNumber: normalized.rowNumber,
          modelCode: normalized.modelCode,
          status: 'error',
          errors: ['Ürün grubu zorunlu'],
        });
        continue;
      }
      try {
        await this.assertProductGroupScope(groupId, actor);
        if (existing) await this.assertProductGroupScope(existing.productGroupId, actor);
        await this.resolveProductImageMediaFile(actor, normalized.imageUrl);
      } catch (error) {
        results.push({
          rowNumber: normalized.rowNumber,
          modelCode: normalized.modelCode,
          status: 'error',
          errors: [error instanceof Error ? error.message : 'Ürün grubu yetkiniz dışında'],
        });
        continue;
      }

      const values = {
        brandId: brand.id,
        series: normalized.series ?? null,
        productGroupId: groupId,
        categoryId: catId,
        subcategoryId: subId,
        productTypeId: typeId,
        modelCode: normalized.modelCode,
        modelName: normalized.modelName ?? null,
        fullName: normalized.fullName,
        currencyId,
        listPrice: normalized.listPrice?.toString() ?? null,
        cashPrice: normalized.cashPrice?.toString() ?? null,
        vatRate: normalized.vatRate.toString(),
        originCountry: normalized.originCountry ?? null,
        hsCode: normalized.hsCode ?? null,
        stockCode: normalized.stockCode ?? null,
        imageUrl: normalized.imageUrl ?? null,
        description: normalized.description ?? null,
      };

      let productId: string;
      let status: ImportStatus;
      if (existing) {
        await this.db.update(productModels).set(values).where(eq(productModels.id, existing.id));
        productId = existing.id;
        status = 'update';
      } else {
        const [created] = await this.db
          .insert(productModels)
          .values({
            tenantId: actor.tenantId,
            ...values,
          })
          .returning();
        productId = created.id;
        status = 'create';
      }
      await this.attachProductImageMedia(productId, actor, normalized.imageUrl);

      const hasDetails = normalized.specs.length > 0 || normalized.equipment.length > 0;
      if (hasDetails && input.replaceDetails) {
        await Promise.all([
          this.db.update(productSpecs).set({ deletedAt: new Date() }).where(eq(productSpecs.productModelId, productId)),
          this.db
            .update(productEquipmentItems)
            .set({ deletedAt: new Date() })
            .where(eq(productEquipmentItems.productModelId, productId)),
        ]);
      }

      if (normalized.specs.length) {
        await this.db.insert(productSpecs).values(
          await Promise.all(
            normalized.specs.map(async (spec) => ({
              tenantId: actor.tenantId,
              productModelId: productId,
              specGroupId: await lookupIdByCode(this.db, productSpecGroups, spec.specGroupCode ?? 'GENEL'),
              specKey: spec.specKey,
              specValue: spec.specValue,
              specUnit: spec.specUnit ?? null,
              sortOrder: spec.sortOrder,
            }))
          )
        );
      }

      if (normalized.equipment.length) {
        await this.db.insert(productEquipmentItems).values(
          await Promise.all(
            normalized.equipment.map(async (item) => ({
              tenantId: actor.tenantId,
              productModelId: productId,
              equipmentTypeId: await lookupIdByCode(this.db, equipmentTypes, item.equipmentTypeCode),
              title: item.title,
              description: item.description ?? null,
              isPromotion: item.isPromotion,
              sortOrder: item.sortOrder,
            }))
          )
        );
      }

      await this.audit.write({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: status === 'create' ? 'product.import.created' : 'product.import.updated',
        resourceType: 'product_model',
        resourceId: productId,
        newValues: { modelCode: normalized.modelCode, fullName: normalized.fullName },
      });

      results.push({ rowNumber: normalized.rowNumber, modelCode: normalized.modelCode, status, productId, errors: [] });
    }

    return {
      rows: results,
      summary: this.summarizeImportRows(results),
    };
  }

  // ────────── PRICE LISTS ──────────
  async listPriceLists(actor: AuthContext, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const where = and(
      eq(priceLists.tenantId, actor.tenantId),
      isNull(priceLists.deletedAt),
      resourceDivisionFilterWithShared(actor, 'price_lists', priceLists.divisionId) ?? sql`true`
    );
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(priceLists).where(where);
    const rows = await this.db
      .select({
        priceList: priceLists,
        currency: { id: currencies.id, code: currencies.code, name: currencies.name },
      })
      .from(priceLists)
      .leftJoin(currencies, eq(priceLists.currencyId, currencies.id))
      .where(where)
      .orderBy(asc(priceLists.name), asc(priceLists.code), asc(priceLists.id))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows.map((r) => ({ ...r.priceList, currency: r.currency })), count, page);
  }

  async createPriceList(input: PriceListCreateInput, actor: AuthContext) {
    const existing = await this.db.query.priceLists.findFirst({
      where: and(eq(priceLists.tenantId, actor.tenantId), eq(priceLists.code, input.code)),
    });
    if (existing) throw new ConflictError('Bu fiyat listesi kodu zaten kayıtlı');
    const currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    const divisionId = resolveAssignedResourceDivision(actor, 'price_lists', input.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Fiyat listesi için somut bölüm seçimi zorunludur', { field: 'divisionId' });
    const [row] = await this.db
      .insert(priceLists)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        currencyId,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        isActive: input.isActive,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'price_list.created',
      resourceType: 'price_list',
      resourceId: row.id,
      newValues: { code: row.code, name: row.name },
    });
    return row;
  }

  async updatePriceList(id: string, input: PriceListUpdateInput, actor: AuthContext) {
    const existing = await this.getPriceList(id, actor);
    const patch: Record<string, unknown> = {};
    if (input.currencyCode !== undefined) patch.currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    if (input.divisionId !== undefined) patch.divisionId = resolveAssignedResourceDivision(actor, 'price_lists', input.divisionId);
    for (const k of ['code', 'name', 'description', 'validFrom', 'validUntil', 'isActive'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    await this.db.update(priceLists).set(patch).where(eq(priceLists.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'price_list.updated',
      resourceType: 'price_list',
      resourceId: id,
      oldValues: existing,
      newValues: patch,
    });
    return this.getPriceList(id, actor);
  }

  async listPriceListItems(priceListId: string, actor: AuthContext) {
    await this.getPriceList(priceListId, actor);
    return this.db
      .select({
        item: priceListItems,
        product: { id: productModels.id, modelCode: productModels.modelCode, fullName: productModels.fullName },
      })
      .from(priceListItems)
      .leftJoin(productModels, eq(priceListItems.productModelId, productModels.id))
      .where(and(eq(priceListItems.priceListId, priceListId), eq(priceListItems.tenantId, actor.tenantId), isNull(priceListItems.deletedAt)))
      .orderBy(asc(productModels.fullName));
  }

  async createPriceListItem(priceListId: string, input: PriceListItemCreateInput, actor: AuthContext) {
    await this.getPriceList(priceListId, actor);
    await this.get(input.productModelId, actor);
    const campaignTouched = input.campaignIsActive === true
      || input.campaignPrice !== undefined
      || input.campaignValidFrom !== undefined
      || input.campaignValidUntil !== undefined;
    if (campaignTouched && !actor.roles.includes('super_admin')) {
      throw new ForbiddenError('Kampanyayı yalnız Süper Admin yönetebilir');
    }
    if (input.campaignIsActive && (!input.campaignPrice || input.campaignPrice <= 0)) {
      throw new ValidationError('Aktif kampanya için geçerli bir kampanya fiyatı zorunludur', { field: 'campaignPrice' });
    }
    if (input.campaignValidFrom && input.campaignValidUntil && input.campaignValidUntil < input.campaignValidFrom) {
      throw new ValidationError('Kampanya bitiş tarihi başlangıçtan önce olamaz', { field: 'campaignValidUntil' });
    }
    const [row] = await this.db
      .insert(priceListItems)
      .values({
        tenantId: actor.tenantId,
        priceListId,
        productModelId: input.productModelId,
        listPrice: input.listPrice?.toString() ?? null,
        cashPrice: input.cashPrice?.toString() ?? null,
        campaignPrice: input.campaignPrice?.toString() ?? null,
        campaignValidFrom: input.campaignValidFrom ?? null,
        campaignValidUntil: input.campaignValidUntil ?? null,
        campaignIsActive: input.campaignIsActive ?? false,
        vatRate: input.vatRate?.toString() ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'price_list_item.created',
      resourceType: 'price_list_item',
      resourceId: row.id,
      newValues: { priceListId, productModelId: row.productModelId },
    });
    return row;
  }

  async updatePriceListItem(priceListId: string, itemId: string, input: PriceListItemUpdateInput, actor: AuthContext) {
    await this.getPriceList(priceListId, actor);
    const existing = await this.db.query.priceListItems.findFirst({
      where: and(eq(priceListItems.id, itemId), eq(priceListItems.priceListId, priceListId), eq(priceListItems.tenantId, actor.tenantId), isNull(priceListItems.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Fiyat listesi kalemi');
    const campaignTouched = input.campaignIsActive !== undefined
      || input.campaignPrice !== undefined
      || input.campaignValidFrom !== undefined
      || input.campaignValidUntil !== undefined;
    if (campaignTouched && !actor.roles.includes('super_admin')) {
      throw new ForbiddenError('Kampanyayı yalnız Süper Admin yönetebilir');
    }
    const campaignWillBeActive = input.campaignIsActive ?? existing.campaignIsActive;
    const campaignPrice = input.campaignPrice ?? (existing.campaignPrice == null ? undefined : Number(existing.campaignPrice));
    if (campaignWillBeActive && (!campaignPrice || campaignPrice <= 0)) {
      throw new ValidationError('Aktif kampanya için geçerli bir kampanya fiyatı zorunludur', { field: 'campaignPrice' });
    }
    const campaignValidFrom = input.campaignValidFrom ?? existing.campaignValidFrom ?? undefined;
    const campaignValidUntil = input.campaignValidUntil ?? existing.campaignValidUntil ?? undefined;
    if (campaignValidFrom && campaignValidUntil && campaignValidUntil < campaignValidFrom) {
      throw new ValidationError('Kampanya bitiş tarihi başlangıçtan önce olamaz', { field: 'campaignValidUntil' });
    }
    const patch: Record<string, unknown> = {};
    if (input.productModelId !== undefined) {
      await this.get(input.productModelId, actor);
      patch.productModelId = input.productModelId;
    }
    for (const k of ['listPrice', 'cashPrice', 'campaignPrice', 'vatRate'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = ((input as any)[k] as number | undefined)?.toString() ?? null;
    }
    for (const k of ['campaignValidFrom', 'campaignValidUntil'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    if (input.campaignIsActive !== undefined) patch.campaignIsActive = input.campaignIsActive;
    if (input.notes !== undefined) patch.notes = input.notes ?? null;
    await this.db.update(priceListItems).set(patch).where(eq(priceListItems.id, itemId));
    return this.db.query.priceListItems.findFirst({ where: eq(priceListItems.id, itemId) });
  }

  private async getPriceList(id: string, actor: AuthContext) {
    const row = await this.db.query.priceLists.findFirst({
      where: and(
        eq(priceLists.id, id),
        eq(priceLists.tenantId, actor.tenantId),
        isNull(priceLists.deletedAt),
        resourceDivisionFilterWithShared(actor, 'price_lists', priceLists.divisionId) ?? sql`true`
      ),
    });
    if (!row) throw new NotFoundError('Fiyat listesi');
    return row;
  }

  private async parseImportFile(fileName: string, fileBase64: string): Promise<ParsedImportFile> {
    const cleanBase64 = fileBase64.includes(',') ? fileBase64.split(',').pop()! : fileBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (!buffer.length) throw new ValidationError('Dosya okunamadı');

    const lower = fileName.toLocaleLowerCase('tr-TR');
    let sheetName = 'Ürünler';
    let matrix: string[][];

    if (lower.endsWith('.csv')) {
      const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
      const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
      const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
      matrix = parseCsv(text, delimiter);
      sheetName = 'CSV';
    } else if (lower.endsWith('.xlsx')) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const worksheet =
        workbook.worksheets.find((ws) => {
          const name = normalizeText(ws.name);
          return name.includes('urun') || name.includes('product');
        }) ?? workbook.worksheets[0];

      if (!worksheet) throw new ValidationError('Excel dosyasında çalışma sayfası bulunamadı');
      sheetName = worksheet.name;
      matrix = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const values: string[] = [];
        for (let col = 1; col <= row.cellCount; col += 1) {
          values.push(cellToText(row.getCell(col).value));
        }
        matrix[rowNumber - 1] = values;
      });
    } else {
      throw new ValidationError('Sadece .xlsx ve .csv dosyaları destekleniyor');
    }

    const headerRowIndex = this.detectHeaderRow(matrix);
    const rows = this.matrixToImportRows(matrix, headerRowIndex);
    if (!rows.length) throw new ValidationError('Dosyada aktarılacak ürün satırı bulunamadı');

    return {
      sheetName,
      headerRowNumber: headerRowIndex + 1,
      rows,
    };
  }

  private detectHeaderRow(matrix: string[][]): number {
    let bestIndex = -1;
    let bestScore = 0;
    const limit = Math.min(matrix.length, 20);

    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      const normalized = row.map(normalizeText);
      const score = normalized.reduce((total, cell) => total + (BASE_IMPORT_HEADER_MAP[cell] ? 2 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = rowIndex;
      }
    }

    if (bestIndex < 0 || bestScore < 4) {
      throw new ValidationError('Başlık satırı bulunamadı. En az Marka ve Model kolonları olmalı.');
    }
    return bestIndex;
  }

  private matrixToImportRows(matrix: string[][], headerRowIndex: number): Array<Record<string, unknown> & { rowNumber: number }> {
    const headers = (matrix[headerRowIndex] ?? []).map((header) => cellToText(header));
    const rows: Array<Record<string, unknown> & { rowNumber: number }> = [];

    for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const values = matrix[rowIndex] ?? [];
      if (!values.some((value) => cellToText(value))) continue;

      const row: Record<string, unknown> & { rowNumber: number } = { rowNumber: rowIndex + 1 };
      const specs: ProductImportRowInput['specs'] = [];
      let specOrder = 0;

      headers.forEach((header, colIndex) => {
        const value = cellToText(values[colIndex]);
        if (!value) return;

        const normalizedHeader = normalizeText(header);
        const field = BASE_IMPORT_HEADER_MAP[normalizedHeader];
        if (field) {
          row[field] = value;
          return;
        }

        if (looksLikeSpecHeader(header)) {
          const specKey = header.replace(/^(spec|ozellik|özellik)\s*[:/-]?\s*/i, '').trim();
          specs.push({
            specGroupCode: 'GENEL',
            specKey: specKey || header,
            specValue: value,
            sortOrder: specOrder,
          });
          specOrder += 10;
        }
      });

      specs.push(...parseSpecsText(row.specsText, specOrder));
      if (row.controlPanel) {
        specs.push({
          specGroupCode: 'GENEL',
          specKey: 'Kontrol Ünitesi',
          specValue: cellToText(row.controlPanel),
          sortOrder: specOrder + specs.length + 10,
        });
      }

      row.specs = specs;
      row.equipment = [
        ...splitList(row.standardEquipmentText).map((title, idx) => ({
          equipmentTypeCode: 'standart',
          title,
          sortOrder: idx,
          isPromotion: false,
        })),
        ...splitList(row.optionalEquipmentText).map((title, idx) => ({
          equipmentTypeCode: 'opsiyonel',
          title,
          sortOrder: idx,
          isPromotion: false,
        })),
      ];

      rows.push(row);
    }

    return rows;
  }

  private async getImportLookupMaps(): Promise<ProductImportLookupMaps> {
    const [
      productGroupRows,
      productCategoryRows,
      productSubcategoryRows,
      productTypeRows,
      productSpecGroupRows,
      equipmentTypeRows,
      currencyRows,
    ] = await Promise.all([
      this.db.select({ code: productGroups.code, name: productGroups.name }).from(productGroups).where(eq(productGroups.isActive, true)),
      this.db.select({ code: productCategories.code, name: productCategories.name }).from(productCategories).where(eq(productCategories.isActive, true)),
      this.db.select({ code: productSubcategories.code, name: productSubcategories.name }).from(productSubcategories).where(eq(productSubcategories.isActive, true)),
      this.db.select({ code: productTypes.code, name: productTypes.name }).from(productTypes).where(eq(productTypes.isActive, true)),
      this.db.select({ code: productSpecGroups.code, name: productSpecGroups.name }).from(productSpecGroups).where(eq(productSpecGroups.isActive, true)),
      this.db.select({ code: equipmentTypes.code, name: equipmentTypes.name }).from(equipmentTypes).where(eq(equipmentTypes.isActive, true)),
      this.db.select({ code: currencies.code, name: currencies.name }).from(currencies).where(eq(currencies.isActive, true)),
    ]);

    return {
      productGroups: productGroupRows,
      productCategories: productCategoryRows,
      productSubcategories: productSubcategoryRows,
      productTypes: productTypeRows,
      productSpecGroups: productSpecGroupRows,
      equipmentTypes: equipmentTypeRows,
      currencies: currencyRows,
    };
  }

  private async normalizeImportRow(
    raw: Record<string, unknown> & { rowNumber: number },
    lookups: ProductImportLookupMaps,
    actor: AuthContext
  ): Promise<ProductImportPreviewRow> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const brandName = cellToText(raw.brandName);
    const series = cellToText(raw.series) || undefined;
    const modelCode = cellToText(raw.modelCode);
    const modelName = cellToText(raw.modelName) || undefined;
    const rawFullName = cellToText(raw.fullName);
    const fullName = rawFullName || [brandName, modelCode].filter(Boolean).join(' ');

    if (!brandName) errors.push('Marka zorunlu');
    if (!modelCode) errors.push('Model zorunlu');
    if (!fullName) errors.push('Ürün adı zorunlu');

    const inferredText = [raw.productTypeCode, raw.categoryCode, raw.subcategoryCode, fullName, modelName, raw.description];
    const rawProductGroupCode = cellToText(raw.productGroupCode);
    let fallbackProductGroupCode: string | undefined;
    if (!rawProductGroupCode) {
      try {
        fallbackProductGroupCode = await this.defaultProductGroupCodeForActor(actor);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Ürün grubu için bölüm seçimi zorunludur');
      }
    }
    const productGroupCode = this.resolveLookupCode(lookups.productGroups, rawProductGroupCode, fallbackProductGroupCode, warnings, 'Ürün grubu');
    if (!productGroupCode) errors.push('Ürün grubu zorunlu');
    const categoryCode = this.resolveLookupCode(lookups.productCategories, cellToText(raw.categoryCode), 'TEZGAH', warnings, 'Kategori');
    const subcategoryCode = this.resolveLookupCode(
      lookups.productSubcategories,
      cellToText(raw.subcategoryCode) || inferSubcategoryCode(...inferredText),
      undefined,
      warnings,
      'Alt kategori'
    );
    const productTypeCode = this.resolveLookupCode(
      lookups.productTypes,
      cellToText(raw.productTypeCode) || inferProductTypeCode(...inferredText),
      undefined,
      warnings,
      'Ürün tipi'
    );
    const currencyCode = this.resolveLookupCode(lookups.currencies, cellToText(raw.currencyCode), 'USD', warnings, 'Para birimi') ?? 'USD';
    const vatRate = parseNumber(raw.vatRate) ?? 20;

    const specs = this.normalizeImportSpecs(raw.specs, lookups, warnings);
    const equipment = this.normalizeImportEquipment(raw.equipment, lookups, warnings);

    const candidate = {
      rowNumber: raw.rowNumber,
      brandName,
      series,
      modelCode,
      modelName,
      fullName,
      productGroupCode,
      categoryCode,
      subcategoryCode,
      productTypeCode,
      currencyCode,
      listPrice: parseNumber(raw.listPrice),
      cashPrice: parseNumber(raw.cashPrice),
      vatRate,
      originCountry: cellToText(raw.originCountry) || undefined,
      hsCode: cellToText(raw.hsCode) || undefined,
      stockCode: cellToText(raw.stockCode) || undefined,
      imageUrl: cellToText(raw.imageUrl) || undefined,
      description: cellToText(raw.description) || undefined,
      specs,
      equipment,
    };

    const parsed = productImportRowSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
    }

    const existing = modelCode ? await this.findProductByModelCode(modelCode, actor) : null;
    if (existing) {
      try {
        await this.assertProductGroupScope(existing.productGroupId, actor);
      } catch {
        errors.push('Bu model kodu başka bir ürün yetki alanında kayıtlı');
      }
    }
    const status: ImportStatus = errors.length ? 'error' : existing ? 'update' : 'create';

    return {
      ...(parsed.success ? parsed.data : (candidate as ProductImportRowInput)),
      status,
      errors,
      warnings,
    };
  }

  private normalizeImportSpecs(rawSpecs: unknown, lookups: ProductImportLookupMaps, warnings: string[]) {
    if (!Array.isArray(rawSpecs)) return [];
    const specs: ProductImportRowInput['specs'] = [];
    rawSpecs.forEach((spec, idx) => {
      const item = spec as Record<string, unknown>;
      const specKey = cellToText(item.specKey);
      const specValue = cellToText(item.specValue);
      if (!specKey || !specValue) return;
      specs.push({
        specGroupCode: this.resolveLookupCode(
          lookups.productSpecGroups,
          cellToText(item.specGroupCode),
          'GENEL',
          warnings,
          'Teknik özellik grubu'
        ),
        specKey,
        specValue,
        specUnit: cellToText(item.specUnit) || undefined,
        sortOrder: parseNumber(item.sortOrder) ?? idx * 10,
      });
    });
    return specs;
  }

  private normalizeImportEquipment(rawEquipment: unknown, lookups: ProductImportLookupMaps, warnings: string[]) {
    if (!Array.isArray(rawEquipment)) return [];
    const equipmentRows: ProductImportRowInput['equipment'] = [];
    rawEquipment.forEach((equipment, idx) => {
      const item = equipment as Record<string, unknown>;
      const title = cellToText(item.title);
      if (!title) return;
      equipmentRows.push({
        equipmentTypeCode:
          this.resolveLookupCode(
            lookups.equipmentTypes,
            cellToText(item.equipmentTypeCode),
            'standart',
            warnings,
            'Donanım tipi'
          ) ?? 'standart',
        title,
        description: cellToText(item.description) || undefined,
        isPromotion: item.isPromotion === true,
        sortOrder: parseNumber(item.sortOrder) ?? idx * 10,
      });
    });
    return equipmentRows;
  }

  private resolveLookupCode(
    rows: LookupRow[],
    value: string | undefined,
    fallback: string | undefined,
    warnings: string[],
    label: string
  ): string | undefined {
    const clean = cellToText(value);
    if (!clean) return fallback;

    const normalized = normalizeText(clean);
    const compact = compactCode(clean);
    const match = rows.find((row) => {
      return (
        normalizeText(row.code) === normalized ||
        normalizeText(row.name) === normalized ||
        compactCode(row.code) === compact ||
        compactCode(row.name) === compact
      );
    });
    if (match) return match.code;

    warnings.push(`${label} "${clean}" eşleşmedi${fallback ? `; ${fallback} kullanıldı` : ''}`);
    return fallback;
  }

  private async findProductByModelCode(modelCode: string, actor: AuthContext) {
    return this.db.query.productModels.findFirst({
      where: and(eq(productModels.tenantId, actor.tenantId), eq(productModels.modelCode, modelCode), isNull(productModels.deletedAt)),
    });
  }

  private async getOrCreateBrand(name: string, actor: AuthContext) {
    const allBrands = await this.listBrands(actor);
    const existing = allBrands.find((brand) => normalizeText(brand.name) === normalizeText(name));
    if (existing) return existing;
    const [created] = await this.db.insert(brands).values({ tenantId: actor.tenantId, name }).returning();
    return created;
  }

  private summarizeImportRows(rows: Array<{ status: ImportStatus; errors?: string[] }>) {
    return rows.reduce(
      (summary, row) => {
        summary.total += 1;
        if (row.status === 'create') summary.create += 1;
        if (row.status === 'update') summary.update += 1;
        if (row.status === 'skip') summary.skip += 1;
        if (row.status === 'error' || row.errors?.length) summary.error += 1;
        return summary;
      },
      { total: 0, create: 0, update: 0, skip: 0, error: 0 }
    );
  }
}
