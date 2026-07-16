import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { and, asc, eq, inArray, isNull, max, or } from 'drizzle-orm';
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
  productSpecTemplateBulkCreateSchema,
  productSpecTemplateCreateSchema,
  productSpecTemplateUpdateSchema,
  type ProductSpecTemplateBulkCreateInput,
  type ProductSpecTemplateCreateInput,
  type ProductSpecTemplateUpdateInput,
} from '@haksan/shared';

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
    private readonly audit: AuditService
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

  private brandToLookupRow(row: typeof schema.brands.$inferSelect) {
    return {
      id: row.id,
      code: row.name,
      name: row.name,
      description: row.notes,
      sortOrder: row.sortOrder,
      isActive: !row.deletedAt,
      divisionId: row.divisionId ?? null,
    };
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
      .select()
      .from(schema.brands)
      .where(and(...filters))
      .orderBy(asc(schema.brands.sortOrder), asc(schema.brands.name));
    return rows.map((row) => this.brandToLookupRow(row));
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
    const existing = await this.db.query.brands.findFirst({
      where: and(eq(schema.brands.tenantId, user.tenantId), eq(schema.brands.name, name)),
    });
    if (existing && !existing.deletedAt) throw new ConflictError('Bu marka adı zaten kayıtlı');
    const values = {
      tenantId: user.tenantId,
      name,
      notes: body.description?.trim() || null,
      divisionId: body.divisionId || null,
      sortOrder: body.sortOrder ?? (await this.nextLookupSortOrder(BRAND_LOOKUP_NAME, schema.brands, body, user)),
      deletedAt: null,
    };
    const [row] = existing
      ? await this.db.update(schema.brands).set(values).where(eq(schema.brands.id, existing.id)).returning()
      : await this.db.insert(schema.brands).values(values).returning();
    const lookupRow = this.brandToLookupRow(row);
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
    const values: Record<string, unknown> = {};
    if (body.name != null) values.name = body.name.trim();
    if (body.description !== undefined) values.notes = body.description?.trim() || null;
    if (body.divisionId !== undefined) values.divisionId = body.divisionId || null;
    if (body.sortOrder !== undefined) values.sortOrder = body.sortOrder;
    if (!Object.keys(values).length) return this.brandToLookupRow(existing);
    try {
      const [row] = await this.db.update(schema.brands).set(values).where(eq(schema.brands.id, id)).returning();
      const oldValues = this.brandToLookupRow(existing);
      const newValues = this.brandToLookupRow(row);
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

  @Delete('product-spec-templates/:id')
  async deleteProductSpecTemplate(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    this.requireSuperAdmin(user);
    const [row] = await this.db.update(productSpecTemplates).set({ isActive: false }).where(eq(productSpecTemplates.id, id)).returning();
    if (!row) throw new NotFoundError('Teknik bilgi şablonu');
    return { ok: true, deactivated: true, row };
  }
}
