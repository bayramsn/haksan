/**
 * Seed all lookup tables + permission catalog.
 * Idempotent: uses INSERT … ON CONFLICT (code) DO NOTHING semantics via
 * Drizzle's onConflictDoNothing.
 */
import { getDb, closeDb, schema } from '../client';
import { lookupRows } from './_data';
import { PERMISSION_ACTIONS, PERMISSION_RESOURCES } from '@haksan/shared';

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

export async function seedLookups(): Promise<void> {
  const db = getDb();

  for (const [tableName, rows] of Object.entries(lookupRows)) {
    const table = TABLE_MAP[tableName as keyof typeof TABLE_MAP];
    if (!table) {
      console.warn(`[lookups] no Drizzle table mapped for ${tableName}, skipping`);
      continue;
    }
    if (!rows.length) continue;
    // @ts-expect-error Drizzle's union of insert types is too narrow for our dynamic seeding loop
    await db.insert(table).values(rows).onConflictDoNothing({ target: table.code });
    console.log(`[lookups] seeded ${rows.length} rows into ${tableName}`);
  }

  // Permission catalog
  const permRows: { code: string; name: string; resource: string; action: string }[] = [];
  for (const resource of PERMISSION_RESOURCES) {
    for (const action of PERMISSION_ACTIONS) {
      permRows.push({
        code: `${resource}.${action}`,
        name: `${resource} — ${action}`,
        resource,
        action,
      });
    }
  }
  if (permRows.length) {
    await db.insert(schema.permissions).values(permRows).onConflictDoNothing({ target: schema.permissions.code });
    console.log(`[lookups] seeded ${permRows.length} permissions`);
  }
}

if (require.main === module) {
  seedLookups()
    .then(() => closeDb())
    .then(() => console.log('[lookups] done'))
    .catch((err) => {
      console.error('[lookups] failed:', err);
      process.exit(1);
    });
}
