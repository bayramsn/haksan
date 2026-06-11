import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import * as schema from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import { AuthGuard } from '../../shared/security/auth.guard';
import { NotFoundError } from '../../shared/utils/errors';

const TABLE_MAP: Record<string, keyof typeof schema> = {
  'pipeline-stages': 'pipelineStages',
  'quote-statuses': 'quoteStatuses',
  'opportunity-statuses': 'opportunityStatuses',
  'activity-types': 'activityTypes',
  'company-relation-types': 'companyRelationTypes',
  'company-statuses': 'companyStatuses',
  'company-groups': 'companyGroups',
  'contact-sources': 'contactSources',
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
    return { available: Object.keys(TABLE_MAP) };
  }

  @Get(':name')
  async byName(@Param('name') name: string) {
    const tableKey = TABLE_MAP[name];
    if (!tableKey) throw new NotFoundError('Lookup');
    const table = (schema as any)[tableKey];
    return this.db.select().from(table).where(eq(table.isActive, true)).orderBy(asc(table.sortOrder));
  }
}
