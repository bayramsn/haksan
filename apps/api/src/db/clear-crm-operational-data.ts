/**
 * Production-safe CRM operational data reset.
 *
 * Preserves tenant/user/role configuration, lookups, product catalogue,
 * price lists, warehouses, inventory items and note templates. Customer,
 * contact, sales, document, finance, service, logistics and communication
 * records are deleted in foreign-key-safe order.
 *
 * Required confirmation:
 *   CRM_RESET_CONFIRM=RESET_CRM_OPERATIONAL_DATA
 * Dry-run is the default:
 *   CRM_RESET_DRY_RUN=false   # required for actual deletion
 */
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from './client';
import { loadEnv } from '../config/env';
import { S3StorageProvider } from '../shared/storage/s3-storage.provider';

const CONFIRMATION = 'RESET_CRM_OPERATIONAL_DATA';

const OPERATIONAL_TABLES = [
  'chat_message_reactions',
  'chat_messages',
  'conversation_members',
  'conversations',
  'calendar_device_links',
  'calendar_events',
  'call_assistant_suggestions',
  'call_events',
  'phone_number_index',
  'service_warranty_parts',
  'service_warranty_claims',
  'service_complaint_intakes',
  'service_complaint_links',
  'maintenance_plans',
  'installation_jobs',
  'service_tickets',
  'shipment_items',
  'shipment_package_units',
  'deliveries',
  'shipments',
  'invoice_installments',
  'accounting_invoice_lines',
  'payments',
  'payables',
  'receivables',
  'accounting_invoices',
  'sales_order_items',
  'sales_orders',
  'purchase_order_items',
  'purchase_orders',
  'commercial_invoices',
  'contracts',
  'proformas',
  'quote_files',
  'quote_terms',
  'quote_items',
  'quotes',
  'opportunity_stage_history',
  'sales_activities',
  'visits',
  'calls',
  'leads',
  'opportunities',
  'customer_devices',
  'inventory_movements',
  'competitor_products',
  'competitors',
  'assistant_inbox_items',
  'assistant_logs',
  'assistant_daily_token_budgets',
  'notifications',
  'company_access_requests',
  'contact_notes',
  'contact_phones',
  'contact_emails',
  'contact_companies',
  'contacts',
  'company_group_assignments',
  'company_divisions',
  'company_phones',
  'company_emails',
  'company_addresses',
  'companies',
  'file_links',
  'document_sequences',
  'audit_logs',
] as const;

const PRESERVED_TABLES = [
  'tenants',
  'users',
  'roles',
  'permissions',
  'departments',
  'divisions',
  'product_models',
  'product_media',
  'price_lists',
  'price_list_items',
  'warehouses',
  'inventory_items',
  'note_templates',
] as const;

type FileRow = { id: string; bucket: string; object_key: string };

const rowCount = (result: unknown) => {
  const queryResult = result as { rows?: Array<{ count?: string | number }> };
  const rows = Array.isArray(result) ? result as Array<{ count?: string | number }> : queryResult.rows ?? [];
  return Number(rows?.[0]?.count ?? 0);
};

const resultRows = <T>(result: unknown): T[] => {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []);
};

async function main() {
  const env = loadEnv();
  if (process.env.CRM_RESET_CONFIRM !== CONFIRMATION) {
    throw new Error(`CRM reset confirmation missing. Set CRM_RESET_CONFIRM=${CONFIRMATION}.`);
  }
  const dryRun = process.env.CRM_RESET_DRY_RUN !== 'false';
  const db = getDb();

  const counts: Record<string, number> = {};
  for (const table of OPERATIONAL_TABLES) {
    const result = await db.execute(sql.raw(`SELECT count(*)::int AS count FROM "${table}"`));
    counts[table] = rowCount(result);
  }
  const removableFilesResult = await db.execute(sql.raw(`
    SELECT f.id, f.bucket, f.object_key
    FROM files f
    WHERE NOT EXISTS (
      SELECT 1 FROM product_media pm WHERE pm.file_id = f.id
    )
  `));
  const removableFiles = resultRows<FileRow>(removableFilesResult);
  counts.files = removableFiles.length;
  const preservedCounts: Record<string, number> = {};
  for (const table of PRESERVED_TABLES) {
    const result = await db.execute(sql.raw(`SELECT count(*)::int AS count FROM "${table}"`));
    preservedCounts[table] = rowCount(result);
  }

  console.log(JSON.stringify({
    event: 'crm_reset_plan',
    environment: env.NODE_ENV,
    dryRun,
    preserved: [
      'tenants/users/roles/permissions',
      'departments/divisions',
      'lookups',
      'products/product media/price lists',
      'warehouses/inventory items',
      'note templates',
      'auth sessions',
    ],
    counts,
    preservedCounts,
  }));

  if (dryRun) {
    console.log('[crm-reset] dry-run complete; no rows or objects were deleted.');
    await closeDb();
    return;
  }
  if (env.NODE_ENV !== 'production') {
    throw new Error('Live CRM reset is allowed only with NODE_ENV=production.');
  }

  const storage = new S3StorageProvider();
  const objectDeleteFailures: Array<{ bucket: string; objectKey: string }> = [];
  for (const file of removableFiles) {
    try {
      await storage.deleteFile(file.bucket, file.object_key);
    } catch {
      objectDeleteFailures.push({ bucket: file.bucket, objectKey: file.object_key });
    }
  }
  if (objectDeleteFailures.length) {
    console.error(JSON.stringify({
      event: 'crm_reset_storage_cleanup_incomplete',
      failureCount: objectDeleteFailures.length,
      failures: objectDeleteFailures,
    }));
    throw new Error(`${objectDeleteFailures.length} CRM dosyası depolamadan silinemedi.`);
  }

  await db.transaction(async (tx) => {
    for (const table of OPERATIONAL_TABLES) {
      await tx.execute(sql.raw(`DELETE FROM "${table}"`));
    }
    await tx.execute(sql.raw(`
      DELETE FROM files f
      WHERE NOT EXISTS (
        SELECT 1 FROM product_media pm WHERE pm.file_id = f.id
      )
    `));
  });

  const remaining: Record<string, number> = {};
  for (const table of [...OPERATIONAL_TABLES, 'files'] as const) {
    const result = await db.execute(sql.raw(
      table === 'files'
        ? 'SELECT count(*)::int AS count FROM files f WHERE NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.file_id = f.id)'
        : `SELECT count(*)::int AS count FROM "${table}"`
    ));
    remaining[table] = rowCount(result);
  }
  const nonEmpty = Object.entries(remaining).filter(([, count]) => count !== 0);
  if (nonEmpty.length) {
    throw new Error(`CRM reset verification failed: ${JSON.stringify(nonEmpty)}`);
  }
  const preservedAfter: Record<string, number> = {};
  for (const table of PRESERVED_TABLES) {
    const result = await db.execute(sql.raw(`SELECT count(*)::int AS count FROM "${table}"`));
    preservedAfter[table] = rowCount(result);
  }
  const changedPreservedTables = PRESERVED_TABLES.filter(
    (table) => preservedAfter[table] !== preservedCounts[table]
  );
  if (changedPreservedTables.length) {
    throw new Error(`Preserved CRM configuration changed unexpectedly: ${JSON.stringify(changedPreservedTables)}`);
  }

  console.log(JSON.stringify({
    event: 'crm_reset_complete',
    deletedRows: counts,
    deletedStorageObjects: removableFiles.length,
    preservedProductMediaFiles: true,
    preservedCounts: preservedAfter,
  }));
  await closeDb();
}

main().catch(async (error) => {
  console.error('[crm-reset] failed:', error instanceof Error ? error.message : error);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
