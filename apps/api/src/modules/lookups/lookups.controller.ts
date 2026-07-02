import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import * as schema from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import { AuthGuard } from '../../shared/security/auth.guard';
import { NotFoundError } from '../../shared/utils/errors';

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

@UseGuards(AuthGuard)
@Controller('lookups')
export class LookupsController {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  @Get()
  list() {
    return { available: Object.keys(LOOKUP_TABLE_MAP) };
  }

  @Get(':name')
  async byName(@Param('name') name: string, @Query('city') city?: string) {
    const tableKey = LOOKUP_TABLE_MAP[name];
    if (!tableKey) throw new NotFoundError('Lookup');
    const table = (schema as any)[tableKey];
    const filters = [eq(table.isActive, true)];
    if (name === 'tax-offices' && city?.trim()) filters.push(eq(table.province, city.trim()));
    return this.db
      .select()
      .from(table)
      .where(and(...filters))
      .orderBy(asc(table.sortOrder), asc(table.name));
  }
}
