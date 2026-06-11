import { pgTable, uniqueIndex } from 'drizzle-orm/pg-core';
import { lookupColumns } from './_helpers';

/**
 * Lookup / reference tables.
 *
 * The mega prompt forbids PostgreSQL enums for database portability — every
 * status/type lives in a lookup table with `code` (machine), `name` (human),
 * `description`, `sort_order`, `is_active`, audit columns.
 *
 * Helper factory: each table shares the same column shape.
 */
function makeLookup(name: string) {
  return pgTable(name, lookupColumns, (t) => ({
    codeUnique: uniqueIndex(`${name}_code_unique`).on(t.code),
  }));
}

export const pipelineStages = makeLookup('pipeline_stages');
export const quoteStatuses = makeLookup('quote_statuses');
export const salesOrderStatuses = makeLookup('sales_order_statuses');
export const purchaseOrderStatuses = makeLookup('purchase_order_statuses');
export const opportunityStatuses = makeLookup('opportunity_statuses');
export const activityTypes = makeLookup('activity_types');
export const companyRelationTypes = makeLookup('company_relation_types');
export const companyStatuses = makeLookup('company_statuses');
export const companyGroups = makeLookup('company_groups');
export const contactSources = makeLookup('contact_sources');
export const decisionRoles = makeLookup('decision_roles');
export const productGroups = makeLookup('product_groups');
export const productCategories = makeLookup('product_categories');
export const productSubcategories = makeLookup('product_subcategories');
export const productTypes = makeLookup('product_types');
export const productSpecGroups = makeLookup('product_spec_groups');
export const equipmentTypes = makeLookup('equipment_types');
export const inventoryStatuses = makeLookup('inventory_statuses');
export const stockLocationStatuses = makeLookup('stock_location_statuses');
export const fileDocumentTypes = makeLookup('file_document_types');
export const storageProviders = makeLookup('storage_providers');
export const paymentStatuses = makeLookup('payment_statuses');
export const serviceTicketStatuses = makeLookup('service_ticket_statuses');
export const installationStatuses = makeLookup('installation_statuses');
export const currencies = makeLookup('currencies');
export const units = makeLookup('units');
export const warrantyStatuses = makeLookup('warranty_statuses');
export const shipmentStatuses = makeLookup('shipment_statuses');
export const invoiceStatuses = makeLookup('invoice_statuses');
export const proformaStatuses = makeLookup('proforma_statuses');
export const contractStatuses = makeLookup('contract_statuses');
