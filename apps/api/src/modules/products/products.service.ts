import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import type { DbClient } from '../../db/client';
import { brands, priceListItems, priceLists, productModels, productSpecs, productEquipmentItems, productOptionSets, productOptionValues } from '../../db/schema/products';
import {
  productGroups,
  productCategories,
  productSubcategories,
  productTypes,
  productSpecGroups,
  equipmentTypes,
  currencies,
} from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/utils/errors';
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
} from '@haksan/shared';
import { productImportRowSchema } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { AuditService } from '../../shared/database/audit.service';

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

const BASE_IMPORT_FIELD_ALIASES: Record<string, string[]> = {
  brandName: ['marka', 'brand', 'uretici', 'üretici'],
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
  if (text.includes('yatay') || text.includes('hmc')) return 'YATAY_ISLEME_MERKEZI';
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

  // ────────── BRANDS ──────────
  async listBrands(actor: AuthContext) {
    return this.db
      .select()
      .from(brands)
      .where(and(eq(brands.tenantId, actor.tenantId), isNull(brands.deletedAt)))
      .orderBy(asc(brands.name));
  }

  async createBrand(input: BrandCreateInput, actor: AuthContext) {
    const existing = await this.db.query.brands.findFirst({
      where: and(eq(brands.tenantId, actor.tenantId), eq(brands.name, input.name)),
    });
    if (existing) throw new ConflictError('Bu marka adı zaten kayıtlı');
    const [row] = await this.db
      .insert(brands)
      .values({
        tenantId: actor.tenantId,
        name: input.name,
        country: input.country ?? null,
        website: input.website ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return row;
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
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(productModels)
      .where(where);
    const rows = await this.db
      .select({
        product: productModels,
        brand: { id: brands.id, name: brands.name },
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
    const specsByProduct = new Map<string, Array<{ key: string; value: string; unit?: string | null; group?: string | null }>>();
    const standardByProduct = new Map<string, string[]>();
    const optionalByProduct = new Map<string, string[]>();

    if (productIds.length) {
      const specRows = await this.db
        .select({
          productId: productSpecs.productModelId,
          key: productSpecs.specKey,
          value: productSpecs.specValue,
          unit: productSpecs.specUnit,
          group: productSpecGroups.name,
        })
        .from(productSpecs)
        .leftJoin(productSpecGroups, eq(productSpecs.specGroupId, productSpecGroups.id))
        .where(and(inArray(productSpecs.productModelId, productIds), isNull(productSpecs.deletedAt)))
        .orderBy(asc(productSpecs.sortOrder));

      for (const spec of specRows) {
        const list = specsByProduct.get(spec.productId) ?? [];
        list.push({ key: spec.key, value: spec.value, unit: spec.unit, group: spec.group });
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

    return buildPaginated(
      rows.map((r) => ({
        ...r.product,
        brand: r.brand,
        currency: r.currency,
        productGroup: r.productGroup,
        category: r.category,
        subcategory: r.subcategory,
        productType: r.productType,
        specs: specsByProduct.get(r.product.id) ?? [],
        standardEquipment: standardByProduct.get(r.product.id) ?? [],
        optionalEquipment: optionalByProduct.get(r.product.id) ?? [],
      })),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const row = await this.db.query.productModels.findFirst({
      where: and(
        eq(productModels.id, id),
        eq(productModels.tenantId, actor.tenantId),
        isNull(productModels.deletedAt)
      ),
    });
    if (!row) throw new NotFoundError('Ürün');
    return row;
  }

  async create(input: ProductCreateInput, actor: AuthContext) {
    const existing = await this.db.query.productModels.findFirst({
      where: and(eq(productModels.tenantId, actor.tenantId), eq(productModels.modelCode, input.modelCode)),
    });
    if (existing) throw new ConflictError('Bu model kodu zaten kayıtlı');

    const [groupId, catId, subId, typeId, currencyId] = await Promise.all([
      lookupIdByCode(this.db, productGroups, input.productGroupCode),
      lookupIdByCode(this.db, productCategories, input.categoryCode),
      lookupIdByCode(this.db, productSubcategories, input.subcategoryCode),
      lookupIdByCode(this.db, productTypes, input.productTypeCode),
      lookupIdByCode(this.db, currencies, input.currencyCode),
    ]);

    const [row] = await this.db
      .insert(productModels)
      .values({
        tenantId: actor.tenantId,
        brandId: input.brandId,
        productGroupId: groupId,
        categoryId: catId,
        subcategoryId: subId,
        productTypeId: typeId,
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
        muadilProductId: input.muadilProductId ?? null,
      })
      .returning();
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
    if (input.productGroupCode !== undefined)
      patch.productGroupId = await lookupIdByCode(this.db, productGroups, input.productGroupCode);
    if (input.categoryCode !== undefined)
      patch.categoryId = await lookupIdByCode(this.db, productCategories, input.categoryCode);
    if (input.subcategoryCode !== undefined)
      patch.subcategoryId = await lookupIdByCode(this.db, productSubcategories, input.subcategoryCode);
    if (input.productTypeCode !== undefined)
      patch.productTypeId = await lookupIdByCode(this.db, productTypes, input.productTypeCode);
    if (input.currencyCode !== undefined)
      patch.currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    for (const k of ['modelCode', 'modelName', 'fullName', 'originCountry', 'hsCode', 'stockCode', 'imageUrl', 'description', 'muadilProductId'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    for (const k of ['listPrice', 'cashPrice', 'vatRate'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = ((input as any)[k] as number | undefined)?.toString() ?? null;
    }
    await this.db.update(productModels).set(patch).where(eq(productModels.id, id));
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

  async addOptionSet(productId: string, input: any, actor: AuthContext) {
    await this.get(productId, actor);
    const [row] = await this.db.insert(productOptionSets).values({
      tenantId: actor.tenantId,
      productModelId: productId,
      name: input.name,
      sortOrder: input.sortOrder ?? 0,
    }).returning();
    return row;
  }

  async addOptionValue(optionSetId: string, input: any, actor: AuthContext) {
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

      const values = {
        brandId: brand.id,
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
    const where = and(eq(priceLists.tenantId, actor.tenantId), isNull(priceLists.deletedAt));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(priceLists).where(where);
    const rows = await this.db
      .select({
        priceList: priceLists,
        currency: { id: currencies.id, code: currencies.code, name: currencies.name },
      })
      .from(priceLists)
      .leftJoin(currencies, eq(priceLists.currencyId, currencies.id))
      .where(where)
      .orderBy(desc(priceLists.createdAt))
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
    const [row] = await this.db
      .insert(priceLists)
      .values({
        tenantId: actor.tenantId,
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
    const [row] = await this.db
      .insert(priceListItems)
      .values({
        tenantId: actor.tenantId,
        priceListId,
        productModelId: input.productModelId,
        listPrice: input.listPrice?.toString() ?? null,
        cashPrice: input.cashPrice?.toString() ?? null,
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
    const patch: Record<string, unknown> = {};
    if (input.productModelId !== undefined) {
      await this.get(input.productModelId, actor);
      patch.productModelId = input.productModelId;
    }
    for (const k of ['listPrice', 'cashPrice', 'vatRate'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = ((input as any)[k] as number | undefined)?.toString() ?? null;
    }
    if (input.notes !== undefined) patch.notes = input.notes ?? null;
    await this.db.update(priceListItems).set(patch).where(eq(priceListItems.id, itemId));
    return this.db.query.priceListItems.findFirst({ where: eq(priceListItems.id, itemId) });
  }

  private async getPriceList(id: string, actor: AuthContext) {
    const row = await this.db.query.priceLists.findFirst({
      where: and(eq(priceLists.id, id), eq(priceLists.tenantId, actor.tenantId), isNull(priceLists.deletedAt)),
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
    const modelCode = cellToText(raw.modelCode);
    const modelName = cellToText(raw.modelName) || undefined;
    const rawFullName = cellToText(raw.fullName);
    const fullName = rawFullName || [brandName, modelCode].filter(Boolean).join(' ');

    if (!brandName) errors.push('Marka zorunlu');
    if (!modelCode) errors.push('Model zorunlu');
    if (!fullName) errors.push('Ürün adı zorunlu');

    const inferredText = [raw.productTypeCode, raw.categoryCode, raw.subcategoryCode, fullName, modelName, raw.description];
    const productGroupCode = this.resolveLookupCode(lookups.productGroups, cellToText(raw.productGroupCode), 'CNC', warnings, 'Ürün grubu');
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
