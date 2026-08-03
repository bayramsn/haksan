import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, inArray, isNull, max, notInArray, or } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import * as schema from '../../db/schema';
import { productSpecTemplates } from '../../db/schema/products';
import { DB } from '../../shared/database/database.module';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuditService } from '../../shared/database/audit.service';
import { availableLookupNames, BRAND_LOOKUP_NAME, DIVISION_SCOPED_LOOKUPS, LOOKUP_PARENT_COLUMNS, LOOKUP_TABLE_MAP } from '../lookups/lookups.controller';
import {
  machineTemplateCreateSchema,
  productSpecTemplateBulkCreateSchema,
  productSpecTemplateBatchSchema,
  productSpecTemplateCreateSchema,
  productSpecTemplateUpdateSchema,
  technicalImportCommitRequestSchema,
  technicalImportPreviewRequestSchema,
  technicalImportTemplateRequestSchema,
  type MachineTemplateCreateInput,
  type ProductSpecTemplateBatchInput,
  type ProductSpecTemplateBulkCreateInput,
  type ProductSpecTemplateCreateInput,
  type ProductSpecTemplateUpdateInput,
  type TechnicalImportCommitRequest,
  type TechnicalImportPreviewRequest,
  type TechnicalImportTemplateRequest,
} from '@haksan/shared';
import { rowsToCsvBuffer, rowsToXlsxBuffer, sendCsv, sendXlsx } from '../../shared/utils/excel-export';
import { TechnicalImportService, productTypeCodeVariants } from './technical-import.service';
import { brandLogoPath } from '../products/brand-media.service';

const lookupCreateSchema = z.object({
  code: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().default(true),
  province: z.string().trim().max(64).optional(),
  // Yalnızca bölüm-kapsamlı listelerde kullanılır; boş/null → "Tümü".
  divisionId: z.string().uuid().nullish(),
  // Ürün taksonomi zincirindeki üst kayıt (kategori→grup, alt kategori→kategori,
  // tip→alt kategori). Boş/null → tüm üstlerde ("Tümü") geçerli.
  parentId: z.string().uuid().nullish(),
  // Yalnızca teknik bilgi gruplarında: grubun atandığı ürün tipleri.
  // Boş dizi → atama yok, grup tüm tiplerde ("Tümü") geçerli.
  productTypeIds: z.array(z.string().uuid()).max(200).optional(),
  // Yalnızca ürün markalarında: Haksan'a ait marka veya bağlı müşteri firma.
  companyId: z.string().uuid().nullish(),
  isOwned: z.boolean().optional(),
  logoFileId: z.string().uuid().nullish(),
});
type LookupCreateInput = z.infer<typeof lookupCreateSchema>;

const lookupUpdateSchema = lookupCreateSchema.partial();
type LookupUpdateInput = z.infer<typeof lookupUpdateSchema>;

const lookupReorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.coerce.number().int().min(0).max(1_000_000_000),
      })
    )
    .min(1)
    .max(1000)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Aynı kayıt birden fazla kez gönderilemez'),
});
type LookupReorderInput = z.infer<typeof lookupReorderSchema>;

function toLookupCode(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

/** Drizzle wraps PostgreSQL errors in `cause`; keep SQLSTATE handling stable. */
function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    code?: unknown;
    cause?: { code?: unknown };
    originalError?: { code?: unknown };
  };
  const code = candidate.code ?? candidate.cause?.code ?? candidate.originalError?.code;
  return typeof code === 'string' ? code : undefined;
}

@UseGuards(AuthGuard)
@Controller('admin')
export class AdminLookupsController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService,
    private readonly technicalImport: TechnicalImportService
  ) {}

  private requireSuperAdmin(user: AuthContext) {
    if (!user.roles.includes('super_admin')) {
      throw new ForbiddenError('Ayar lookup yönetimi yalnızca Süper Admin tarafından yapılabilir');
    }
  }

  private lookupTable(name: string) {
    const tableKey = LOOKUP_TABLE_MAP[name];
    if (!tableKey) throw new NotFoundError('Lookup');
    return (schema as any)[tableKey];
  }

  private async assertLookupDivision(name: string, divisionId: string | null | undefined, user: AuthContext) {
    if (divisionId === undefined) return;
    if (!DIVISION_SCOPED_LOOKUPS.has(name)) {
      throw new ValidationError('Bu alan listesi bölüm bağlantısını desteklemiyor');
    }
    // null, kaydın tüm bölümlerde ortak kullanılacağı anlamına gelir.
    if (divisionId === null) return;
    const [division] = await this.db
      .select({ id: schema.divisions.id })
      .from(schema.divisions)
      .where(
        and(
          eq(schema.divisions.id, divisionId),
          eq(schema.divisions.tenantId, user.tenantId),
          eq(schema.divisions.isActive, true)
        )
      )
      .limit(1);
    if (!division) throw new AppError('INVALID_DIVISION', 'Seçilen bölüm bulunamadı veya aktif değil', 400);
  }

  private brandToLookupRow(
    row: typeof schema.brands.$inferSelect,
    company?: { id: string; legalTitle: string; externalCompanyNo: string | null } | null,
  ) {
    return {
      id: row.id,
      code: row.name,
      name: row.name,
      description: row.notes,
      sortOrder: row.sortOrder,
      isActive: !row.deletedAt,
      divisionId: row.divisionId ?? null,
      companyId: row.companyId ?? null,
      companyName: row.isOwned ? 'Haksan Makina' : company?.legalTitle ?? null,
      companyNo: company?.externalCompanyNo ?? null,
      isOwned: row.isOwned,
      logoFileId: row.logoFileId ?? null,
      logoUrl: row.logoFileId ? brandLogoPath(row.logoFileId) : null,
    };
  }

  private async assertBrandCompany(companyId: string | null, isOwned: boolean, user: AuthContext) {
    if (isOwned) {
      if (companyId) throw new ValidationError('Kendi markamız seçiliyken ayrıca firma seçilemez');
      return;
    }
    if (!companyId) throw new ValidationError('Markanın bağlı olduğu firma zorunludur', { field: 'companyId' });
    const [company] = await this.db
      .select({ id: schema.companies.id, relationCode: schema.companyRelationTypes.code })
      .from(schema.companies)
      .leftJoin(schema.companyRelationTypes, eq(schema.companies.relationTypeId, schema.companyRelationTypes.id))
      .where(
        and(
          eq(schema.companies.id, companyId),
          eq(schema.companies.tenantId, user.tenantId),
          isNull(schema.companies.deletedAt),
        ),
      )
      .limit(1);
    if (!company || !['supplier', 'supplier_customer'].includes(company.relationCode ?? '')) {
      throw new ValidationError('Yalnızca Tedarikçi veya Müşteri + Tedarikçi firması seçilebilir', { field: 'companyId' });
    }
  }

  private async assertBrandLogoFile(fileId: string, brandId: string, user: AuthContext) {
    const [logo] = await this.db
      .select({
        mimeType: schema.files.mimeType,
        extension: schema.files.extension,
        sizeBytes: schema.files.sizeBytes,
      })
      .from(schema.files)
      .innerJoin(schema.fileLinks, eq(schema.fileLinks.fileId, schema.files.id))
      .innerJoin(schema.fileDocumentTypes, eq(schema.fileLinks.documentTypeId, schema.fileDocumentTypes.id))
      .where(
        and(
          eq(schema.files.id, fileId),
          eq(schema.files.tenantId, user.tenantId),
          eq(schema.files.bucket, 'erp-brand-logos'),
          eq(schema.files.visibility, 'public'),
          eq(schema.files.uploadStatus, 'linked'),
          isNull(schema.files.deletedAt),
          eq(schema.fileLinks.tenantId, user.tenantId),
          eq(schema.fileLinks.entityType, 'brand'),
          eq(schema.fileLinks.entityId, brandId),
          eq(schema.fileDocumentTypes.code, 'brand_logo'),
        ),
      )
      .limit(1);
    const extension = logo?.extension.toLocaleLowerCase('en-US');
    if (
      !logo
      || !['image/png', 'image/jpeg', 'image/webp'].includes(logo.mimeType)
      || !extension
      || !['png', 'jpg', 'jpeg', 'webp'].includes(extension)
      || logo.sizeBytes <= 0
      || logo.sizeBytes > 5 * 1024 * 1024
    ) {
      throw new ValidationError('Marka logosu geçersiz veya bu markaya bağlı değil', { field: 'logoFileId' });
    }
  }

  private async getBrandLookupRow(id: string, user: AuthContext) {
    const [row] = await this.db
      .select({
        brand: schema.brands,
        company: {
          id: schema.companies.id,
          legalTitle: schema.companies.legalTitle,
          externalCompanyNo: schema.companies.externalCompanyNo,
        },
      })
      .from(schema.brands)
      .leftJoin(schema.companies, eq(schema.brands.companyId, schema.companies.id))
      .where(and(eq(schema.brands.id, id), eq(schema.brands.tenantId, user.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Lookup');
    return this.brandToLookupRow(row.brand, row.company);
  }

  private async listBrandLookups(user: AuthContext, divisionId?: string, scope?: string) {
    const filters = [eq(schema.brands.tenantId, user.tenantId), isNull(schema.brands.deletedAt)];
    // Belirli bölüm seçiliyse o bölümün markaları; `scope=exact` değilse
    // paylaşılan ("Tümü") markalar da listelenir.
    if (divisionId?.trim() && divisionId !== 'all') {
      filters.push(
        scope === 'exact'
          ? eq(schema.brands.divisionId, divisionId.trim())
          : or(eq(schema.brands.divisionId, divisionId.trim()), isNull(schema.brands.divisionId))!
      );
    }
    const rows = await this.db
      .select({
        brand: schema.brands,
        company: {
          id: schema.companies.id,
          legalTitle: schema.companies.legalTitle,
          externalCompanyNo: schema.companies.externalCompanyNo,
        },
      })
      .from(schema.brands)
      .leftJoin(schema.companies, eq(schema.brands.companyId, schema.companies.id))
      .where(and(...filters))
      .orderBy(asc(schema.brands.sortOrder), asc(schema.brands.name));
    return rows.map((row) => this.brandToLookupRow(row.brand, row.company));
  }

  private async nextLookupSortOrder(
    name: string,
    table: any,
    body: Pick<LookupCreateInput, 'divisionId' | 'parentId'>,
    user: AuthContext
  ) {
    const filters = [];
    if (name === BRAND_LOOKUP_NAME) {
      filters.push(eq(schema.brands.tenantId, user.tenantId), isNull(schema.brands.deletedAt));
    }
    if (DIVISION_SCOPED_LOOKUPS.has(name)) {
      filters.push(body.divisionId ? eq(table.divisionId, body.divisionId) : isNull(table.divisionId));
    }
    const parentColumn = LOOKUP_PARENT_COLUMNS[name];
    if (parentColumn) {
      filters.push(body.parentId ? eq(table[parentColumn], body.parentId) : isNull(table[parentColumn]));
    }
    const [row] = await this.db
      .select({ value: max(table.sortOrder) })
      .from(table)
      .where(filters.length ? and(...filters) : undefined);
    return Number(row?.value ?? 0) + 10;
  }

  private async createBrandLookup(body: LookupCreateInput, user: AuthContext) {
    const name = body.name.trim();
    const isOwned = body.isOwned === true;
    const companyId = isOwned ? null : body.companyId ?? null;
    await this.assertBrandCompany(companyId, isOwned, user);
    const existing = await this.db.query.brands.findFirst({
      where: and(eq(schema.brands.tenantId, user.tenantId), eq(schema.brands.name, name)),
    });
    if (existing && !existing.deletedAt) throw new ConflictError('Bu marka adı zaten kayıtlı');
    const values = {
      tenantId: user.tenantId,
      name,
      notes: body.description?.trim() || null,
      divisionId: body.divisionId || null,
      companyId,
      isOwned,
      logoFileId: null,
      sortOrder: body.sortOrder ?? (await this.nextLookupSortOrder(BRAND_LOOKUP_NAME, schema.brands, body, user)),
      deletedAt: null,
    };
    const [row] = existing
      ? await this.db.update(schema.brands).set(values).where(eq(schema.brands.id, existing.id)).returning()
      : await this.db.insert(schema.brands).values(values).returning();
    const lookupRow = await this.getBrandLookupRow(row.id, user);
    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'lookup.created',
      resourceType: `lookup:${BRAND_LOOKUP_NAME}`,
      resourceId: row.id,
      oldValues: existing ? this.brandToLookupRow(existing) : null,
      newValues: lookupRow,
    });
    return lookupRow;
  }

  private async updateBrandLookup(id: string, body: LookupUpdateInput, user: AuthContext) {
    const [existing] = await this.db
      .select()
      .from(schema.brands)
      .where(and(eq(schema.brands.id, id), eq(schema.brands.tenantId, user.tenantId), isNull(schema.brands.deletedAt)))
      .limit(1);
    if (!existing) throw new NotFoundError('Lookup');
    const isOwned = body.isOwned ?? existing.isOwned;
    const companyId = isOwned ? null : body.companyId !== undefined ? body.companyId ?? null : existing.companyId;
    if (body.isOwned !== undefined || body.companyId !== undefined) {
      await this.assertBrandCompany(companyId, isOwned, user);
    }
    if (body.logoFileId) await this.assertBrandLogoFile(body.logoFileId, id, user);
    const values: Record<string, unknown> = {};
    if (body.name != null) values.name = body.name.trim();
    if (body.description !== undefined) values.notes = body.description?.trim() || null;
    if (body.divisionId !== undefined) values.divisionId = body.divisionId || null;
    if (body.sortOrder !== undefined) values.sortOrder = body.sortOrder;
    if (body.isOwned !== undefined || body.companyId !== undefined) {
      values.isOwned = isOwned;
      values.companyId = companyId;
    }
    if (body.logoFileId !== undefined) values.logoFileId = body.logoFileId ?? null;
    if (!Object.keys(values).length) return this.brandToLookupRow(existing);
    try {
      await this.db.update(schema.brands).set(values).where(eq(schema.brands.id, id));
      const oldValues = this.brandToLookupRow(existing);
      const newValues = await this.getBrandLookupRow(id, user);
      await this.audit.write({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'lookup.updated',
        resourceType: `lookup:${BRAND_LOOKUP_NAME}`,
        resourceId: id,
        oldValues,
        newValues,
      });
      return newValues;
    } catch (error: any) {
      if (databaseErrorCode(error) === '23505') throw new ConflictError('Bu marka adı zaten kayıtlı');
      throw error;
    }
  }

  private async deleteBrandLookup(id: string, user: AuthContext) {
    const [existing] = await this.db
      .select()
      .from(schema.brands)
      .where(and(eq(schema.brands.id, id), eq(schema.brands.tenantId, user.tenantId), isNull(schema.brands.deletedAt)))
      .limit(1);
    if (!existing) throw new NotFoundError('Lookup');
    const deletedAt = new Date();
    const [row] = await this.db.update(schema.brands).set({ deletedAt }).where(eq(schema.brands.id, id)).returning();
    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'lookup.deleted',
      resourceType: `lookup:${BRAND_LOOKUP_NAME}`,
      resourceId: id,
      oldValues: this.brandToLookupRow(existing),
      newValues: this.brandToLookupRow(row),
    });
    return { ok: true, deleted: true, deactivated: false };
  }

  private lookupValues(name: string, body: LookupCreateInput | LookupUpdateInput, existing?: any) {
    const code = body.code ? toLookupCode(body.code) : body.name ? toLookupCode(body.name) : undefined;
    if (body.code && !code) throw new ValidationError('Lookup kodu geçersiz');
    if (name === 'tax-offices' && body.province != null && !body.province.trim()) {
      throw new ValidationError('Vergi dairesi için il bilgisi boş olamaz');
    }

    const values: Record<string, unknown> = {};
    if (code) values.code = code;
    if (body.name != null) values.name = body.name.trim();
    if (body.description !== undefined) values.description = body.description?.trim() || null;
    if (body.sortOrder !== undefined) values.sortOrder = body.sortOrder;
    if (body.isActive !== undefined) values.isActive = body.isActive;
    if (name === 'tax-offices') {
      const province = body.province ?? existing?.province;
      if (!province?.trim()) throw new ValidationError('Vergi dairesi için il bilgisi zorunlu');
      values.province = province.trim();
    }
    if (DIVISION_SCOPED_LOOKUPS.has(name) && body.divisionId !== undefined) {
      values.divisionId = body.divisionId || null;
    }
    // Taksonomi zincirindeki üst bağlantı (boş → "Tümü").
    const parentColumn = LOOKUP_PARENT_COLUMNS[name];
    if (parentColumn && body.parentId !== undefined) {
      values[parentColumn] = body.parentId || null;
    }
    return values;
  }

  /** Teknik bilgi gruplarının ürün tipi atamalarını (grup id → tip id listesi) getirir. */
  private async specGroupTypeAssignments(specGroupIds?: string[]) {
    if (specGroupIds && specGroupIds.length === 0) return new Map<string, string[]>();
    const links = await this.db
      .select()
      .from(schema.productSpecGroupTypes)
      .where(specGroupIds ? inArray(schema.productSpecGroupTypes.specGroupId, specGroupIds) : undefined);
    const byGroup = new Map<string, string[]>();
    for (const link of links) {
      byGroup.set(link.specGroupId, [...(byGroup.get(link.specGroupId) ?? []), link.productTypeId]);
    }
    return byGroup;
  }

  /** Teknik bilgi grubunun ürün tipi atamalarını verilen listeyle eşitler. */
  private async syncSpecGroupTypes(specGroupId: string, productTypeIds: string[]) {
    const unique = Array.from(new Set(productTypeIds));
    await this.db.delete(schema.productSpecGroupTypes).where(eq(schema.productSpecGroupTypes.specGroupId, specGroupId));
    if (unique.length) {
      await this.db
        .insert(schema.productSpecGroupTypes)
        .values(unique.map((productTypeId) => ({ specGroupId, productTypeId })))
        .onConflictDoNothing();
    }
    return unique;
  }

  @Get('lookups')
  listAvailable(@CurrentUser() user: AuthContext) {
    this.requireSuperAdmin(user);
    return { available: availableLookupNames() };
  }

  @Get('lookups/:name')
  async listLookup(
    @Param('name') name: string,
    @Query('city') city: string | undefined,
    @Query('divisionId') divisionId: string | undefined,
    @Query('scope') scope: string | undefined,
    @Query('parentId') parentId: string | undefined,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    if (name === BRAND_LOOKUP_NAME) return this.listBrandLookups(user, divisionId, scope);
    const table = this.lookupTable(name);
    const filters = [];
    if (name === 'tax-offices' && city?.trim()) filters.push(eq(table.province, city.trim()));
    // CRM ürün akışında belirli bölüm seçildiyse yalnızca o bölüme ait
    // kayıtları gösterebiliriz; ortak ("Tümü") kayıtlar Tümü görünümünden
    // düzenlenir. Diğer kullanımlarda eski bölüm + ortak davranışı korunur.
    if (DIVISION_SCOPED_LOOKUPS.has(name) && divisionId?.trim() && divisionId !== 'all') {
      filters.push(scope === 'exact' ? eq(table.divisionId, divisionId.trim()) : or(eq(table.divisionId, divisionId.trim()), isNull(table.divisionId)));
    }
    // Üst bağlantı filtresi: seçilen üste bağlı kayıtlar + paylaşılan ("Tümü").
    const parentColumn = LOOKUP_PARENT_COLUMNS[name];
    if (parentColumn && parentId?.trim() && parentId !== 'all') {
      filters.push(or(eq(table[parentColumn], parentId.trim()), isNull(table[parentColumn])));
    }
    const rows = await this.db
      .select()
      .from(table)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(table.sortOrder), asc(table.name));
    // Teknik bilgi gruplarında atanmış ürün tipleri de döner.
    if (name === 'product-spec-groups') {
      const assignments = await this.specGroupTypeAssignments(rows.map((row: any) => row.id));
      return rows.map((row: any) => ({ ...row, productTypeIds: assignments.get(row.id) ?? [] }));
    }
    return rows;
  }

  @Post('lookups/:name')
  async createLookup(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(lookupCreateSchema)) body: LookupCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    await this.assertLookupDivision(name, body.divisionId, user);
    if (name === BRAND_LOOKUP_NAME) return this.createBrandLookup(body, user);
    const table = this.lookupTable(name);
    const values = this.lookupValues(name, body);
    if (!values.code) values.code = toLookupCode(body.name);
    if (values.sortOrder === undefined) {
      values.sortOrder = await this.nextLookupSortOrder(name, table, body, user);
    }
    try {
      const rows = (await this.db.insert(table).values(values as any).returning()) as any[];
      let created = rows[0];
      if (name === 'product-spec-groups' && created?.id && body.productTypeIds !== undefined) {
        const productTypeIds = await this.syncSpecGroupTypes(created.id, body.productTypeIds);
        created = { ...created, productTypeIds };
      }
      await this.audit.write({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'lookup.created',
        resourceType: `lookup:${name}`,
        resourceId: created?.id ?? null,
        newValues: created ?? values,
      });
      return created;
    } catch (error: any) {
      if (databaseErrorCode(error) === '23505') throw new ConflictError('Bu lookup kodu zaten kullanılıyor');
      throw error;
    }
  }

  @Patch('lookups/:name/reorder')
  async reorderLookup(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(lookupReorderSchema)) body: LookupReorderInput,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    const table = name === BRAND_LOOKUP_NAME ? schema.brands : this.lookupTable(name);
    const ids = body.items.map((item) => item.id);
    const filters = [inArray(table.id, ids)];
    if (name === BRAND_LOOKUP_NAME) {
      filters.push(eq(schema.brands.tenantId, user.tenantId), isNull(schema.brands.deletedAt));
    }
    const existingRows = await this.db
      .select({ id: table.id, sortOrder: table.sortOrder })
      .from(table)
      .where(and(...filters));
    if (existingRows.length !== ids.length) {
      throw new ValidationError('Sıralanacak kayıtlardan biri bulunamadı');
    }

    await this.db.transaction(async (tx) => {
      for (const item of body.items) {
        await tx.update(table).set({ sortOrder: item.sortOrder }).where(eq(table.id, item.id));
      }
    });
    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'lookup.reordered',
      resourceType: `lookup:${name}`,
      oldValues: existingRows,
      newValues: body.items,
    });
    return { ok: true, items: body.items };
  }

  @Patch('lookups/:name/:id')
  async updateLookup(
    @Param('name') name: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(lookupUpdateSchema)) body: LookupUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    await this.assertLookupDivision(name, body.divisionId, user);
    if (name === BRAND_LOOKUP_NAME) return this.updateBrandLookup(id, body, user);
    const table = this.lookupTable(name);
    const [existing] = await this.db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!existing) throw new NotFoundError('Lookup');
    const values = this.lookupValues(name, body, existing);
    try {
      // Yalnızca tip ataması değişiyorsa güncellenecek kolon olmayabilir.
      let row = existing;
      if (Object.keys(values).length) {
        [row] = await this.db.update(table).set(values as any).where(eq(table.id, id)).returning();
      }
      if (name === 'product-spec-groups' && body.productTypeIds !== undefined) {
        const productTypeIds = await this.syncSpecGroupTypes(id, body.productTypeIds);
        row = { ...row, productTypeIds };
      }
      await this.audit.write({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'lookup.updated',
        resourceType: `lookup:${name}`,
        resourceId: id,
        oldValues: existing,
        newValues: row,
      });
      return row;
    } catch (error: any) {
      if (databaseErrorCode(error) === '23505') throw new ConflictError('Bu lookup kodu zaten kullanılıyor');
      throw error;
    }
  }

  @Delete('lookups/:name/:id')
  async deleteLookup(@Param('name') name: string, @Param('id') id: string, @CurrentUser() user: AuthContext) {
    this.requireSuperAdmin(user);
    if (name === BRAND_LOOKUP_NAME) return this.deleteBrandLookup(id, user);
    const table = this.lookupTable(name);
    const [existing] = await this.db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!existing) throw new NotFoundError('Lookup');
    try {
      await this.db.delete(table).where(eq(table.id, id));
      await this.audit.write({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'lookup.deleted',
        resourceType: `lookup:${name}`,
        resourceId: id,
        oldValues: existing,
        newValues: { deleted: true },
      });
      return { ok: true, deleted: true, deactivated: false };
    } catch (error: any) {
      // Kullanımdaki lookup kayıtları FK nedeniyle fiziksel olarak silinemez.
      // Drizzle SQLSTATE'i `cause.code` altında döndürebildiği için sarmalı da oku.
      if (databaseErrorCode(error) !== '23503') throw error;
      const [row] = await this.db.update(table).set({ isActive: false }).where(eq(table.id, id)).returning();
      await this.audit.write({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'lookup.deactivated',
        resourceType: `lookup:${name}`,
        resourceId: id,
        oldValues: existing,
        newValues: row,
      });
      return { ok: true, deleted: false, deactivated: true, row };
    }
  }

  @Get('product-spec-templates')
  async listProductSpecTemplates(
    @Query('productTypeCode') productTypeCode: string | undefined,
    @Query('divisionId') divisionId: string | undefined,
    @Query('scope') scope: string | undefined,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    const filters = [];
    if (productTypeCode?.trim()) filters.push(eq(productSpecTemplates.productTypeCode, productTypeCode.trim()));
    // Belirli bölüm → o bölüm + paylaşılan ("Tümü"); `scope=exact` → sadece o bölüm.
    if (divisionId?.trim() && divisionId !== 'all') {
      filters.push(scope === 'exact' ? eq(productSpecTemplates.divisionId, divisionId.trim()) : or(eq(productSpecTemplates.divisionId, divisionId.trim()), isNull(productSpecTemplates.divisionId)));
    }
    return this.db
      .select()
      .from(productSpecTemplates)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(productSpecTemplates.productTypeCode), asc(productSpecTemplates.sortOrder), asc(productSpecTemplates.specKey));
  }

  /**
   * Ürün tipi ile ilk teknik alanlarını aynı transaction içinde oluşturur.
   * Böylece kopyalama sırasında alan kaydı başarısız olursa sahipsiz/yarım bir
   * ürün tipi bırakılmaz.
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('machine-templates')
  async createMachineTemplate(
    @Body(new ZodValidationPipe(machineTemplateCreateSchema)) body: MachineTemplateCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    await this.assertLookupDivision('product-types', body.divisionId, user);

    const [subcategory] = await this.db
      .select({
        id: schema.productSubcategories.id,
        subcategoryDivisionId: schema.productSubcategories.divisionId,
        categoryCode: schema.productCategories.code,
        categoryDivisionId: schema.productCategories.divisionId,
        groupDivisionId: schema.productGroups.divisionId,
      })
      .from(schema.productSubcategories)
      .leftJoin(
        schema.productCategories,
        eq(schema.productSubcategories.categoryId, schema.productCategories.id)
      )
      .leftJoin(
        schema.productGroups,
        eq(schema.productCategories.productGroupId, schema.productGroups.id)
      )
      .where(eq(schema.productSubcategories.id, body.subcategoryId))
      .limit(1);
    if (!subcategory) throw new NotFoundError('Ürün alt kategorisi');
    const taxonomyDivisionIds = [
      subcategory.subcategoryDivisionId,
      subcategory.categoryDivisionId,
      subcategory.groupDivisionId,
    ].filter((divisionId): divisionId is string => Boolean(divisionId));
    if (taxonomyDivisionIds.some((divisionId) => divisionId !== body.divisionId)) {
      throw new ValidationError('Ürün alt kategorisi seçilen bölüme ait değil', { field: 'subcategoryId' });
    }
    if (!subcategory.categoryCode) {
      throw new ValidationError('Ürün alt kategorisi bir ürün kategorisine bağlı olmalıdır', {
        field: 'subcategoryId',
      });
    }

    const code = toLookupCode(body.code);
    if (!code) throw new ValidationError('Ürün şablonu kodu geçersiz', { field: 'code' });
    const sortOrder = await this.nextLookupSortOrder(
      'product-types',
      schema.productTypes,
      { divisionId: body.divisionId, parentId: body.subcategoryId },
      user
    );

    try {
      const result = await this.db.transaction(async (tx) => {
        const [type] = await tx
          .insert(schema.productTypes)
          .values({
            code,
            name: body.name,
            divisionId: body.divisionId,
            subcategoryId: body.subcategoryId,
            sortOrder,
            isActive: true,
          })
          .returning();
        const specs = body.fields.length
          ? await tx
              .insert(productSpecTemplates)
              .values(
                body.fields.map((field, index) => ({
                  ...field,
                  specKey: field.specKey.trim(),
                  specGroupCode: field.specGroupCode?.trim() || undefined,
                  specUnit: field.specUnit?.trim() || undefined,
                  productTypeCode: code,
                  divisionId: body.divisionId,
                  sortOrder: index,
                }))
              )
              .returning()
          : [];
        return { type, specs };
      });
      await this.audit.write({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'machine_template.created',
        resourceType: 'machine_template',
        resourceId: result.type.id,
        newValues: {
          productTypeCode: result.type.code,
          productTypeName: result.type.name,
          divisionId: body.divisionId,
          subcategoryId: body.subcategoryId,
          fieldCount: result.specs.length,
        },
      });
      return result;
    } catch (error: any) {
      if (databaseErrorCode(error) === '23505') {
        throw new ConflictError('Bu ürün şablonu kodu seçilen bölümde zaten kullanılıyor');
      }
      throw error;
    }
  }

  @Post('product-spec-templates')
  async createProductSpecTemplate(
    @Body(new ZodValidationPipe(productSpecTemplateCreateSchema)) body: ProductSpecTemplateCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    try {
      const [row] = await this.db.insert(productSpecTemplates).values(body).returning();
      return row;
    } catch (error: any) {
      if (databaseErrorCode(error) === '23505') throw new ConflictError('Bu ürün tipi için aynı teknik alan zaten var');
      throw error;
    }
  }

  // Katalog şablonundaki eksik alanları toplu ekler. Aynı (ürün tipi + alan)
  // zaten varsa dokunmaz — admin'in düzenlediği değer/birim ve pasifleştirdiği
  // satırlar korunur.
  @Post('product-spec-templates/bulk')
  async bulkCreateProductSpecTemplates(
    @Body(new ZodValidationPipe(productSpecTemplateBulkCreateSchema)) body: ProductSpecTemplateBulkCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    // Unique index artık (bölüm, tip, alan) ifade indeksi olduğundan hedefsiz
    // ON CONFLICT DO NOTHING kullanılır (herhangi bir teklik çakışmasını atlar).
    const rows = await this.db
      .insert(productSpecTemplates)
      .values(body.items)
      .onConflictDoNothing()
      .returning();
    return { ok: true, created: rows.length, skipped: body.items.length - rows.length, rows };
  }

  @Put('product-spec-templates/batch')
  async batchSaveProductSpecTemplates(
    @Body(new ZodValidationPipe(productSpecTemplateBatchSchema)) body: ProductSpecTemplateBatchInput,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    try {
      const { rows, prunedIds } = await this.db.transaction(async (tx) => {
        const saved = [];
        for (const item of body.items) {
          const { id, ...values } = item;
          if (id) {
            const [row] = await tx.update(productSpecTemplates).set(values).where(eq(productSpecTemplates.id, id)).returning();
            if (!row) throw new NotFoundError('Teknik bilgi şablonu');
            saved.push(row);
          } else {
            const [row] = await tx.insert(productSpecTemplates).values(values).returning();
            saved.push(row);
          }
        }
        // Çalışma sayfasından çıkarılan alanlar: gönderilen liste kapsamın
        // tamamıdır, dolayısıyla aynı (ürün tipi + bölüm) kapsamında olup
        // burada bulunmayan kayıtlar silinmiş sayılır. Katalog varsayılanları
        // koddan yeniden üretilebildiği için fiziksel silme yerine tombstone
        // bırakılır (bkz. deleteProductSpecTemplate). Aynı transaction içinde
        // yapılır ki yarım kalan kayıtta şablon tutarsız kalmasın.
        let prunedIds: string[] = [];
        if (body.pruneMissing && body.productTypeCode) {
          const keptIds = saved.map((row) => row.id);
          const scope = [
            inArray(productSpecTemplates.productTypeCode, productTypeCodeVariants(body.productTypeCode)),
            body.divisionId
              ? eq(productSpecTemplates.divisionId, body.divisionId)
              : isNull(productSpecTemplates.divisionId),
            eq(productSpecTemplates.isDeleted, false),
          ];
          if (keptIds.length) scope.push(notInArray(productSpecTemplates.id, keptIds));
          const removed = await tx
            .update(productSpecTemplates)
            .set({ isDeleted: true, isActive: false })
            .where(and(...scope))
            .returning({ id: productSpecTemplates.id });
          prunedIds = removed.map((row) => row.id);
        }
        return { rows: saved, prunedIds };
      });
      await this.audit.write({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'product_spec_template.batch_updated',
        resourceType: 'product_spec_template',
        resourceId: body.productTypeCode ?? body.items[0]?.productTypeCode ?? 'batch',
        newValues: { count: rows.length, pruned: prunedIds.length },
      });
      return { ok: true, rows, prunedIds };
    } catch (error: any) {
      if (databaseErrorCode(error) === '23505') throw new ConflictError('Bu ürün tipi için aynı teknik alan birden fazla kez kullanılamaz');
      throw error;
    }
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('technical-import/preview')
  previewTechnicalImport(
    @Body(new ZodValidationPipe(technicalImportPreviewRequestSchema)) body: TechnicalImportPreviewRequest,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    return this.technicalImport.preview(body, user);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('technical-import/commit')
  commitTechnicalImport(
    @Body(new ZodValidationPipe(technicalImportCommitRequestSchema)) body: TechnicalImportCommitRequest,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    return this.technicalImport.commit(body, user);
  }

  /**
   * Seçili makine tipinin kendi alanlarından doldurulmaya hazır şablon üretir.
   * Alanlar istemciden gelir: çalışma sayfasındaki liste katalog şablonu ile kayıtlı
   * satırların birleşimidir, dolayısıyla dosya kullanıcının gördüğüyle birebir aynı olur.
   * Alan gönderilmezse genel örnek satırlara düşer.
   */
  @Post('technical-import/template')
  async technicalImportTemplate(
    @Body(new ZodValidationPipe(technicalImportTemplateRequestSchema)) body: TechnicalImportTemplateRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    const rows = body.fields.length
      ? body.fields.map((field) => ({
          Bölüm: field.section || field.groupCode || 'GENEL',
          'Teknik Bilgi': field.key,
          Değer: body.includeValues ? field.value ?? '' : '',
          Birim: field.unit ?? '',
        }))
      : [
          { Bölüm: 'TABLA', 'Teknik Bilgi': 'Tablo Ölçüsü', Değer: '850 × 600', Birim: 'mm' },
          { Bölüm: 'TABLA', 'Teknik Bilgi': 'Tablo Yükleme Kapasitesi', Değer: '500', Birim: 'kg' },
          { Bölüm: 'EKSENLER', 'Teknik Bilgi': 'X Ekseni Hareketi', Değer: '650', Birim: 'mm' },
          { Bölüm: 'FENER MİLİ', 'Teknik Bilgi': 'Fener Mili Devri', Değer: '12.000', Birim: 'dev/dk' },
        ];
    // Dosya adı header'a yazıldığı için yalnız güvenli karakterlere indirgenir.
    const slug = (body.productTypeLabel || body.productTypeCode)
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'teknik-bilgi';
    if (body.format === 'csv') {
      return sendCsv(reply, rowsToCsvBuffer(rows), `${slug}-teknik-sablon.csv`);
    }
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Teknik Bilgiler'), `${slug}-teknik-sablon.xlsx`);
  }

  @Patch('product-spec-templates/:id')
  async updateProductSpecTemplate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productSpecTemplateUpdateSchema)) body: ProductSpecTemplateUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    try {
      const [row] = await this.db.update(productSpecTemplates).set(body).where(eq(productSpecTemplates.id, id)).returning();
      if (!row) throw new NotFoundError('Teknik bilgi şablonu');
      return row;
    } catch (error: any) {
      if (databaseErrorCode(error) === '23505') throw new ConflictError('Bu ürün tipi için aynı teknik alan zaten var');
      throw error;
    }
  }

  /**
   * Şablon alanını görünür şablondan kalıcı olarak çıkarır. Katalog varsayılanları
   * koddan yeniden kurulabildiği için kayıt fiziksel silinmez; tombstone bırakılır.
   * Ürünlerin kendi teknik değerleri bu kayıttan bağımsızdır ve korunur.
   */
  @Delete('product-spec-templates/:id')
  async deleteProductSpecTemplate(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    this.requireSuperAdmin(user);
    const [row] = await this.db
      .update(productSpecTemplates)
      .set({ isDeleted: true, isActive: false })
      .where(eq(productSpecTemplates.id, id))
      .returning();
    if (!row) throw new NotFoundError('Teknik bilgi şablonu');
    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'product_spec_template.deleted',
      resourceType: 'product_spec_template',
      resourceId: row.id,
      oldValues: { productTypeCode: row.productTypeCode, specKey: row.specKey },
    });
    return { ok: true, deleted: true, row };
  }
}
