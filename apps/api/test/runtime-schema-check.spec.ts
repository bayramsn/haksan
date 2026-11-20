import { describe, expect, it } from 'vitest';
import { runtimeSchemaIsCurrent, expectedRuntimeTables, type RuntimeCatalogRow, type RuntimeCatalogQuery } from '../src/db/runtime-schema-check';

const expected = [{ schema: 'public', name: 'commercial_pdfs', columns: ['id', 'document_id'] }];
const complete: RuntimeCatalogRow[] = [
  { kind: 'table', schema_name: 'public', table_name: 'commercial_pdfs', object_name: 'commercial_pdfs', is_unique: null, index_columns: null },
  ...['id', 'document_id'].map((column): RuntimeCatalogRow => ({ kind: 'column', schema_name: 'public', table_name: 'commercial_pdfs', object_name: column, is_unique: null, index_columns: null })),
  { kind: 'index', schema_name: 'public', table_name: 'commercial_pdfs', object_name: 'commercial_pdfs_version_unique', is_unique: true, index_columns: ['tenant_id', 'kind', 'document_id', 'source_hash', 'template_version'] },
  { kind: 'index', schema_name: 'public', table_name: 'commercial_pdfs', object_name: 'commercial_pdfs_document_idx', is_unique: false, index_columns: ['tenant_id', 'kind', 'document_id', 'generated_at'] },
];
const check = (rows: RuntimeCatalogRow[]) => runtimeSchemaIsCurrent(async () => ({ rows }), expected);

describe('runtime schema readiness', () => {
  it('derives PDF columns from the deployed Drizzle schema', () => {
    expect(expectedRuntimeTables().find((table) => table.name === 'commercial_pdfs')?.columns).toContain('document_id');
  });
  it('accepts complete schema and sends a parameterized bounded read-only query', async () => {
    let config: RuntimeCatalogQuery | undefined;
    expect(await runtimeSchemaIsCurrent(async (query) => { config = query; return { rows: complete }; }, expected)).toBe(true);
    expect(config?.query_timeout).toBe(5000);
    expect(config?.values).toEqual([['public']]);
    expect(config?.text).not.toMatch(/\b(?:CREATE|ALTER|DROP|DELETE|INSERT|UPDATE)\b/);
  });
  it('rejects a missing table even when columns/indexes appear in a stale catalog result', async () => {
    expect(await check(complete.filter((row) => row.kind !== 'table'))).toBe(false);
  });
  it('rejects a missing column', async () => {
    expect(await check(complete.filter((row) => row.object_name !== 'document_id'))).toBe(false);
  });
  it('rejects a missing, incorrectly unique, or differently ordered critical PDF index', async () => {
    expect(await check(complete.filter((row) => row.object_name !== 'commercial_pdfs_version_unique'))).toBe(false);
    expect(await check(complete.map((row) => row.kind === 'index' ? { ...row, is_unique: false } : row))).toBe(false);
    expect(await check(complete.map((row) => row.kind === 'index' ? { ...row, index_columns: [...row.index_columns!].reverse() } : row))).toBe(false);
  });
  it('fails closed with an empty expected manifest and propagates unavailable DB errors', async () => {
    expect(await runtimeSchemaIsCurrent(async () => ({ rows: [] }), [])).toBe(false);
    await expect(runtimeSchemaIsCurrent(async () => { throw new Error('timeout'); }, expected)).rejects.toThrow('timeout');
  });
});
