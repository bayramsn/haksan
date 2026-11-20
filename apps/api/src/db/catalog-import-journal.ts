/** Transaction-local reversible catalog writes. Raw PostgreSQL rows preserve timestamp precision. */
import { guardCatalogReferences } from './catalog-reference-guard';
import { sql } from 'drizzle-orm';
import type { DbClient } from './client';
const tables = ['product_groups','product_categories','product_subcategories','product_types','product_spec_groups','brands','product_models','product_spec_templates','product_specs'] as const;
type Rows = Record<string, Array<Record<string, unknown>>>;
type Change = { table: string; id: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null };
export async function beginCatalogJournal(db: DbClient) {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS public.__catalog_import_journal (tenant_id uuid PRIMARY KEY, changes jsonb NOT NULL, rolled_back_at timestamptz)`);
  for (const table of tables) await db.execute(sql`LOCK TABLE ${sql.identifier(table)} IN SHARE ROW EXCLUSIVE MODE`);
  return readRows(db);
}
async function readRows(db: DbClient): Promise<Rows> {
  const result: Rows = {};
  for (const table of tables) result[table] = (await db.execute(sql`SELECT to_jsonb(t) AS row FROM ${sql.identifier(table)} t ORDER BY id`)).rows.map(row => row.row as Record<string, unknown>);
  return result;
}
export async function finishCatalogJournal(db: DbClient, tenantId: string, before: Rows) {
  const after = await readRows(db);
  const prior = await db.execute(sql`SELECT changes FROM public.__catalog_import_journal WHERE tenant_id=${tenantId} AND rolled_back_at IS NULL`);
  const changes = (prior.rows[0]?.changes ?? []) as Change[];
  for (const table of tables) {
    const old = new Map(before[table].map(row => [String(row.id),row]));
    const next = new Map(after[table].map(row => [String(row.id),row]));
    for (const id of new Set([...old.keys(),...next.keys()])) {
      const left = old.get(id) ?? null; const right = next.get(id) ?? null;
      if (JSON.stringify(left) === JSON.stringify(right)) continue;
      const known = changes.find(change => change.table === table && change.id === id);
      if (known) known.after = right; else changes.push({ table,id,before:left,after:right });
    }
  }
  await db.execute(sql`INSERT INTO public.__catalog_import_journal (tenant_id,changes) VALUES (${tenantId},${JSON.stringify(changes)}::jsonb) ON CONFLICT (tenant_id) DO UPDATE SET changes=excluded.changes,rolled_back_at=NULL`);
}
export async function rollbackCatalogImport(db: DbClient, tenantId: string, apply = false) {
  if (!(await db.execute(sql`SELECT to_regclass('public.__catalog_import_journal') AS name`)).rows[0]?.name) return { mode:'preview',changes:0 };
  if (!apply) { const result = await db.execute(sql`SELECT jsonb_array_length(changes) AS n FROM public.__catalog_import_journal WHERE tenant_id=${tenantId} AND rolled_back_at IS NULL`); return { mode:'preview',changes:Number(result.rows[0]?.n ?? 0) }; }
  return db.transaction(async tx => {
    const client = tx as unknown as DbClient;
    const current = await beginCatalogJournal(client);
    const result = await tx.execute(sql`SELECT changes FROM public.__catalog_import_journal WHERE tenant_id=${tenantId} AND rolled_back_at IS NULL FOR UPDATE`);
    const changes = (result.rows[0]?.changes ?? []) as Change[];
    if (!apply) return { mode:'preview',changes:changes.length };
    for (const change of changes) {
      if (!tables.includes(change.table as typeof tables[number])) throw new Error('Invalid catalog rollback table');
      const row = current[change.table].find(row => row.id === change.id) ?? null;
      if (JSON.stringify(row) !== JSON.stringify(change.after)) throw new Error(`Rollback blocked by subsequent edit: ${change.table}/${change.id}`);
    }
    for (const change of changes.filter(change => !change.before)) await guardCatalogReferences(client, change.table, change.id, changes);
    // Restore parents first; remove newly created children before their parents.
    for (const change of changes.filter(change => change.before)) {
      const columns = Object.keys(change.before!).filter(key => key !== 'id');
      const assignments = sql.join(columns.map(key => sql`${sql.identifier(key)} = restored.${sql.identifier(key)}`),sql`, `);
      await tx.execute(sql`UPDATE ${sql.identifier(change.table)} t SET ${assignments} FROM jsonb_populate_record(NULL::${sql.identifier(change.table)},${JSON.stringify(change.before)}::jsonb) restored WHERE t.id=${change.id}::uuid`);
    }
    for (const table of [...tables].reverse()) for (const change of changes.filter(change => change.table===table && !change.before)) await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE id=${change.id}::uuid`);
    await tx.execute(sql`UPDATE public.__catalog_import_journal SET rolled_back_at=now() WHERE tenant_id=${tenantId}`);
    return { mode:'rolled_back',changes:changes.length };
  });
}
