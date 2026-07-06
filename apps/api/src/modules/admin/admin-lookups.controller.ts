import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import * as schema from '../../db/schema';
import { productSpecTemplates } from '../../db/schema/products';
import { DB } from '../../shared/database/database.module';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { LOOKUP_TABLE_MAP } from '../lookups/lookups.controller';
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
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  province: z.string().trim().max(64).optional(),
});
type LookupCreateInput = z.infer<typeof lookupCreateSchema>;

const lookupUpdateSchema = lookupCreateSchema.partial();
type LookupUpdateInput = z.infer<typeof lookupUpdateSchema>;

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

@UseGuards(AuthGuard)
@Controller('admin')
export class AdminLookupsController {
  constructor(@Inject(DB) private readonly db: DbClient) {}

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
    return values;
  }

  @Get('lookups')
  listAvailable(@CurrentUser() user: AuthContext) {
    this.requireSuperAdmin(user);
    return { available: Object.keys(LOOKUP_TABLE_MAP) };
  }

  @Get('lookups/:name')
  async listLookup(@Param('name') name: string, @Query('city') city: string | undefined, @CurrentUser() user: AuthContext) {
    this.requireSuperAdmin(user);
    const table = this.lookupTable(name);
    const filters = [];
    if (name === 'tax-offices' && city?.trim()) filters.push(eq(table.province, city.trim()));
    return this.db
      .select()
      .from(table)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(table.sortOrder), asc(table.name));
  }

  @Post('lookups/:name')
  async createLookup(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(lookupCreateSchema)) body: LookupCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    const table = this.lookupTable(name);
    const values = this.lookupValues(name, body);
    if (!values.code) values.code = toLookupCode(body.name);
    try {
      const rows = (await this.db.insert(table).values(values as any).returning()) as any[];
      return rows[0];
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictError('Bu lookup kodu zaten kullanılıyor');
      throw error;
    }
  }

  @Patch('lookups/:name/:id')
  async updateLookup(
    @Param('name') name: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(lookupUpdateSchema)) body: LookupUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    const table = this.lookupTable(name);
    const [existing] = await this.db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!existing) throw new NotFoundError('Lookup');
    const values = this.lookupValues(name, body, existing);
    try {
      const [row] = await this.db.update(table).set(values as any).where(eq(table.id, id)).returning();
      return row;
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictError('Bu lookup kodu zaten kullanılıyor');
      throw error;
    }
  }

  @Delete('lookups/:name/:id')
  async deleteLookup(@Param('name') name: string, @Param('id') id: string, @CurrentUser() user: AuthContext) {
    this.requireSuperAdmin(user);
    const table = this.lookupTable(name);
    const [existing] = await this.db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!existing) throw new NotFoundError('Lookup');
    try {
      await this.db.delete(table).where(eq(table.id, id));
      return { ok: true, deleted: true, deactivated: false };
    } catch (error: any) {
      if (error?.code !== '23503') throw error;
      const [row] = await this.db.update(table).set({ isActive: false }).where(eq(table.id, id)).returning();
      return { ok: true, deleted: false, deactivated: true, row };
    }
  }

  @Get('product-spec-templates')
  async listProductSpecTemplates(@Query('productTypeCode') productTypeCode: string | undefined, @CurrentUser() user: AuthContext) {
    this.requireSuperAdmin(user);
    const filters = productTypeCode?.trim() ? [eq(productSpecTemplates.productTypeCode, productTypeCode.trim())] : [];
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
      if (error?.code === '23505') throw new ConflictError('Bu ürün tipi için aynı teknik alan zaten var');
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
    const rows = await this.db
      .insert(productSpecTemplates)
      .values(body.items)
      .onConflictDoNothing({
        target: [productSpecTemplates.productTypeCode, productSpecTemplates.specKey],
      })
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
      if (error?.code === '23505') throw new ConflictError('Bu ürün tipi için aynı teknik alan zaten var');
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
