/**
 * Data migration: sync all lookup rows from seed/_data.ts into the live DB.
 *
 * Lookup additions in `_data.ts` (e.g. new pipeline stages, statuses) are
 * applied by `seed:lookups` in dev, but production's deploy pipeline only
 * runs schema migrations + this data-migrate step. Without this migration,
 * codes added after the initial seed (such as `payment_plan`) are missing
 * from prod and the API throws `Bilinmeyen aşama: <code>`.
 *
 * Idempotent: uses onConflictDoUpdate keyed on the lookup's `code`, so it
 * is safe to re-apply and additive (new rows are inserted, existing rows
 * have their name / sort_order refreshed). It never deletes rows.
 */
import { sql } from 'drizzle-orm';
import type { DbClient } from '../client';
import { schema } from '../client';
import { lookupRows } from '../seed/_data';

const TABLE_MAP = {
  pipeline_stages: schema.pipelineStages,
  quote_statuses: schema.quoteStatuses,
  sales_order_statuses: schema.salesOrderStatuses,
  purchase_order_statuses: schema.purchaseOrderStatuses,
  opportunity_statuses: schema.opportunityStatuses,
  activity_types: schema.activityTypes,
  company_relation_types: schema.companyRelationTypes,
  company_statuses: schema.companyStatuses,
  company_groups: schema.companyGroups,
  contact_sources: schema.contactSources,
  decision_roles: schema.decisionRoles,
  product_groups: schema.productGroups,
  product_categories: schema.productCategories,
  product_subcategories: schema.productSubcategories,
  product_types: schema.productTypes,
  product_spec_groups: schema.productSpecGroups,
  equipment_types: schema.equipmentTypes,
  inventory_statuses: schema.inventoryStatuses,
  stock_location_statuses: schema.stockLocationStatuses,
  file_document_types: schema.fileDocumentTypes,
  storage_providers: schema.storageProviders,
  payment_statuses: schema.paymentStatuses,
  service_ticket_statuses: schema.serviceTicketStatuses,
  installation_statuses: schema.installationStatuses,
  currencies: schema.currencies,
  units: schema.units,
  warranty_statuses: schema.warrantyStatuses,
  shipment_statuses: schema.shipmentStatuses,
  invoice_statuses: schema.invoiceStatuses,
  proforma_statuses: schema.proformaStatuses,
  contract_statuses: schema.contractStatuses,
} as const;

export async function up(db: DbClient): Promise<void> {
  for (const [tableName, rows] of Object.entries(lookupRows)) {
    const table = TABLE_MAP[tableName as keyof typeof TABLE_MAP];
    if (!table || !rows.length) continue;
    // @ts-expect-error Drizzle's insert union is too narrow for the dynamic loop
    await db.insert(table).values(rows).onConflictDoUpdate({
      target: table.code,
      set: {
        name: sql`EXCLUDED.name`,
        sortOrder: sql`EXCLUDED.sort_order`,
      },
    });
    console.log(`[003_sync_lookups] synced ${rows.length} rows into ${tableName}`);
  }
}
