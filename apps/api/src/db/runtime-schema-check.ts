import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import type { QueryConfig } from 'pg';
import * as schema from './schema';

export type RuntimeCatalogQuery = QueryConfig & { query_timeout: number };

export type ExpectedRuntimeTable = { schema: string; name: string; columns: string[] };
export type RuntimeCatalogRow = {
  kind: 'table' | 'column' | 'index';
  schema_name: string;
  table_name: string;
  object_name: string;
  is_unique: boolean | null;
  index_columns: string[] | null;
};

/** Derived from the deployed application's schema, not an unrelated checkout. */
export function expectedRuntimeTables(): ExpectedRuntimeTable[] {
  const tables = new Map<string, ExpectedRuntimeTable>();
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const table = getTableConfig(value);
    const entry = { schema: table.schema ?? 'public', name: table.name, columns: table.columns.map((column) => column.name) };
    tables.set(`${entry.schema}.${entry.name}`, entry);
  }
  return [...tables.values()];
}

const criticalIndexes = [
  { name: 'commercial_pdfs_version_unique', unique: true, columns: ['tenant_id', 'kind', 'document_id', 'source_hash', 'template_version'] },
  { name: 'commercial_pdfs_document_idx', unique: false, columns: ['tenant_id', 'kind', 'document_id', 'generated_at'] },
] as const;

const catalogSql = `
SELECT 'table' AS kind, n.nspname AS schema_name, c.relname AS table_name,
       c.relname AS object_name, NULL::boolean AS is_unique, NULL::text[] AS index_columns
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p')
UNION ALL
SELECT 'column', n.nspname, c.relname, a.attname, NULL::boolean, NULL::text[]
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p') AND a.attnum > 0 AND NOT a.attisdropped
UNION ALL
SELECT 'index', n.nspname, t.relname, i.relname, x.indisunique,
       ARRAY(SELECT a.attname::text FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, position)
             JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
             WHERE k.position <= x.indnkeyatts ORDER BY k.position)
FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid
JOIN pg_catalog.pg_class t ON t.oid = x.indrelid JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = ANY($1::text[]) AND x.indisvalid AND x.indisready
  AND x.indpred IS NULL AND x.indexprs IS NULL
`;

/** Read-only, one bounded catalog query; never attempts schema repairs in health. */
export async function runtimeSchemaIsCurrent(
  query: (config: RuntimeCatalogQuery) => Promise<{ rows: RuntimeCatalogRow[] }>,
  expected = expectedRuntimeTables(),
): Promise<boolean> {
  if (!expected.length) return false;
  const { rows } = await query({ text: catalogSql, values: [[...new Set(expected.map((table) => table.schema))]], query_timeout: 5_000 });
  const tables = new Set(rows.filter((row) => row.kind === 'table').map((row) => `${row.schema_name}.${row.table_name}`));
  const columns = new Set(rows.filter((row) => row.kind === 'column').map((row) => `${row.schema_name}.${row.table_name}.${row.object_name}`));
  for (const table of expected) {
    if (!tables.has(`${table.schema}.${table.name}`)) return false;
    if (table.columns.some((column) => !columns.has(`${table.schema}.${table.name}.${column}`))) return false;
  }
  if (expected.some((table) => table.schema === 'public' && table.name === 'commercial_pdfs')) {
    for (const index of criticalIndexes) {
      if (!rows.some((row) => row.kind === 'index' && row.schema_name === 'public' && row.table_name === 'commercial_pdfs'
        && row.object_name === index.name && row.is_unique === index.unique
        && JSON.stringify(row.index_columns) === JSON.stringify(index.columns))) return false;
    }
  }
  return true;
}
