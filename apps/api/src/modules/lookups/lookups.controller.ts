import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import * as schema from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { resourceDivisionFilter, resourceDivisionFilterWithShared } from '../../shared/utils/division-scope';
import { NotFoundError } from '../../shared/utils/errors';

/**
 * Bölüme (CNC / Üniversal / Sac İşleme) göre ayrılabilen lookup listeleri.
 * Bu listeler `division_id` kolonu taşır; aktif bölüm kendi + paylaşılan ("Tümü")
 * kayıtlarını görür. Diğer listeler global kalır.
 */
export const DIVISION_SCOPED_LOOKUPS = new Set([
  'product-groups',
  'product-categories',
  'product-subcategories',
  'product-types',
  'product-spec-groups',
]);

export const LOOKUP_TABLE_MAP: Record<string, keyof typeof schema> = {
  'pipeline-stages': 'pipelineStages',
  'quote-statuses': 'quoteStatuses',
  'opportunity-statuses': 'opportunityStatuses',
  'activity-types': 'activityTypes',
  'company-relation-types': 'companyRelationTypes',
  'company-statuses': 'companyStatuses',
  'company-groups': 'companyGroups',
  'company-sectors': 'companySectors',
  'contact-sources': 'contactSources',
  'tax-offices': 'taxOffices',
  'decision-roles': 'decisionRoles',
  'product-groups': 'productGroups',
  'product-categories': 'productCategories',
  'product-subcategories': 'productSubcategories',
  'product-types': 'productTypes',
  'product-spec-groups': 'productSpecGroups',
  'equipment-types': 'equipmentTypes',
  'inventory-statuses': 'inventoryStatuses',
  'stock-location-statuses': 'stockLocationStatuses',
  'file-document-types': 'fileDocumentTypes',
  'storage-providers': 'storageProviders',
  'payment-statuses': 'paymentStatuses',
  'service-ticket-statuses': 'serviceTicketStatuses',
  'installation-statuses': 'installationStatuses',
  currencies: 'currencies',
  units: 'units',
  'warranty-statuses': 'warrantyStatuses',
  'shipment-statuses': 'shipmentStatuses',
  'invoice-statuses': 'invoiceStatuses',
  'proforma-statuses': 'proformaStatuses',
  'contract-statuses': 'contractStatuses',
};

export const BRAND_LOOKUP_NAME = 'brands';
export const availableLookupNames = () => [...Object.keys(LOOKUP_TABLE_MAP), BRAND_LOOKUP_NAME];

@UseGuards(AuthGuard)
@Controller('lookups')
export class LookupsController {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  @Get()
  list() {
    return { available: availableLookupNames() };
  }

  @Get(':name')
  async byName(
    @Param('name') name: string,
    @CurrentUser() user: AuthContext,
    @Query('city') city?: string,
    @Query('divisionId') _divisionId?: string,
    @Query('scope') scope?: string
  ) {
    if (name === BRAND_LOOKUP_NAME) {
      return this.db
        .select({
          id: schema.brands.id,
          code: schema.brands.name,
          name: schema.brands.name,
          description: schema.brands.notes,
          sortOrder: sql<number>`0`,
          isActive: sql<boolean>`true`,
        })
        .from(schema.brands)
        .where(and(eq(schema.brands.tenantId, user.tenantId), isNull(schema.brands.deletedAt)))
        .orderBy(asc(schema.brands.name));
    }
    const tableKey = LOOKUP_TABLE_MAP[name];
    if (!tableKey) throw new NotFoundError('Lookup');
    const table = (schema as any)[tableKey];
    const filters = [eq(table.isActive, true)];
    if (name === 'tax-offices' && city?.trim()) filters.push(eq(table.province, city.trim()));
    // Bölüm-kapsamlı listelerde aktif/seçili bölüm kendi + paylaşılan
    // ("Tümü") kayıtları görür. `scope=exact`, ayar/kurulum akışlarında
    // yalnızca seçili bölüme atanmış kayıtları istemek için kullanılır.
    if (DIVISION_SCOPED_LOOKUPS.has(name)) {
      const divFilter =
        scope === 'exact'
          ? resourceDivisionFilter(user, 'products', table.divisionId)
          : resourceDivisionFilterWithShared(user, 'products', table.divisionId);
      if (divFilter) filters.push(divFilter);
    }
    return this.db
      .select()
      .from(table)
      .where(and(...filters))
      .orderBy(asc(table.sortOrder), asc(table.name));
  }
}
