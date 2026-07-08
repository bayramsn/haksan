import { index, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { lookupColumns } from './_helpers';
import { divisions } from './tenants';

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

/** "Tümü" (tüm bölümlerde geçerli) kayıtlarda `division_id` NULL olur. NULL'ları
 *  benzersizlik açısından tek bir değere indirgemek için coalesce sentinel'i. */
const ALL_DIVISIONS_SENTINEL = sql`coalesce(division_id, '00000000-0000-0000-0000-000000000000'::uuid)`;

/**
 * Bölüme (CNC / Üniversal / Sac İşleme) göre ayrılabilen lookup tablosu.
 * `division_id` NULL ise kayıt tüm bölümlerde ("Tümü") geçerlidir. Kod tekliği
 * (division, code) bazındadır; NULL bölümler de coalesce sentinel'i ile tekildir.
 */
function makeDivisionLookup(name: string) {
  return pgTable(
    name,
    {
      ...lookupColumns,
      divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    },
    (t) => ({
      codeUnique: uniqueIndex(`${name}_division_code_unique`).on(ALL_DIVISIONS_SENTINEL, t.code),
    })
  );
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
export const companySectors = makeLookup('company_sectors');
export const contactSources = makeLookup('contact_sources');
export const decisionRoles = makeLookup('decision_roles');
export const productGroups = makeDivisionLookup('product_groups');
export const productCategories = makeDivisionLookup('product_categories');
export const productSubcategories = makeDivisionLookup('product_subcategories');
export const productTypes = makeDivisionLookup('product_types');
export const productSpecGroups = makeDivisionLookup('product_spec_groups');
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

export const taxOffices = pgTable(
  'tax_offices',
  {
    ...lookupColumns,
    province: varchar('province', { length: 64 }).notNull().default(''),
  },
  (t) => ({
    codeUnique: uniqueIndex('tax_offices_code_unique').on(t.code),
    provinceIdx: index('tax_offices_province_idx').on(t.province),
  })
);
