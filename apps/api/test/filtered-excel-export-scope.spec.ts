import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import { tradeFairListQuerySchema } from '@haksan/shared';
import { TradeFairsService } from '../src/modules/trade-fairs/trade-fairs.service';
import { ExportsService } from '../src/modules/exports/exports.service';
import { selectedOpportunityExportSchema } from '../src/modules/exports/exports.controller';
import type { AuthContext } from '../src/shared/security/auth.types';
import type { DbClient } from '../src/db/client';

vi.mock('../src/shared/utils/company-visibility', () => ({
  allowUnlinkedCompanyRecords: (_column: unknown, visibility: SQL) => visibility,
  companyVisibilityExistsFilter: vi.fn().mockResolvedValue(sql`true`),
  companyVisibilityFilter: vi.fn().mockResolvedValue(sql`true`),
}));

const actor = {
  userId: 'user', tenantId: 'tenant', roles: ['sales'], accessScopes: [],
  canViewAllDivisions: false, divisionIds: ['assigned-division'], activeDivisionId: null, activeDepartmentId: null,
} as unknown as AuthContext;
const dialect = new PgDialect();

function database(resultRows: unknown[] = []) {
  const predicates: SQL[] = [];
  const limits: number[] = [];
  const db = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      const result = fields && 'total' in fields ? [{ total: resultRows.length }] : resultRows;
      const chain: any = {
        from: () => chain, leftJoin: () => chain,
        where: (predicate: SQL) => { predicates.push(predicate); return chain; },
        orderBy: () => chain, limit: (limit: number) => { limits.push(limit); return chain; }, offset: () => chain,
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
      };
      return chain;
    }),
  };
  return { db: db as unknown as DbClient, predicates, limits };
}

describe('Filtered Excel exports', () => {
  it('validates selected IDs and city query without dropping the city', () => {
    expect(selectedOpportunityExportSchema.safeParse({ ids: ['invalid'] }).success).toBe(false);
    expect(selectedOpportunityExportSchema.safeParse({ ids: [] }).success).toBe(true);
    expect(selectedOpportunityExportSchema.safeParse({ ids: Array(10_001).fill('00000000-0000-0000-0000-000000000001') }).success).toBe(false);
    expect(tradeFairListQuerySchema.parse({ province: '  İstanbul  ' }).province).toBe('İstanbul');
  });

  it('uses identical tenant, fair, employee, search, and normalized city predicates for list and export', async () => {
    const mock = database();
    const service = new TradeFairsService(mock.db, {} as any);
    const query = tradeFairListQuerySchema.parse({ fairName: 'MAKTEK', q: 'CNC', province: 'İSTANBUL', metByUserId: '00000000-0000-0000-0000-000000000001' });
    await service.list(actor, query);
    await service.exportRows(actor, query);
    const listSql = dialect.sqlToQuery(mock.predicates[0]);
    const exportSql = dialect.sqlToQuery(mock.predicates[2]);
    expect(exportSql).toEqual(listSql);
    expect(exportSql.params).toEqual(expect.arrayContaining(['tenant', 'MAKTEK', 'istanbul', '%CNC%', query.metByUserId]));
    expect(exportSql.sql).toContain('"deleted_at" is null');
    expect(mock.limits).toContain(10_001);
  });

  it('rejects oversized fair exports instead of silently truncating', async () => {
    const mock = database(Array(10_001).fill({}));
    await expect(new TradeFairsService(mock.db, {} as any).exportRows(actor, {})).rejects.toThrow('10000');
  });

  it('intersects selected opportunity IDs with tenant and division access', async () => {
    const mock = database();
    const service = new ExportsService(mock.db, {} as any, {} as any);
    const selectedId = '00000000-0000-0000-0000-000000000002';
    await service.exportOpportunities(actor, { ids: [selectedId] });
    const query = dialect.sqlToQuery(mock.predicates[0]);
    expect(query.params).toEqual(expect.arrayContaining(['tenant', selectedId, 'assigned-division']));
    expect(query.sql).toContain('"tenant_id"');
    expect(query.sql).toContain('"division_id"');
    expect(query.sql).toContain('"deleted_at" is null');
  });

  it('returns no opportunities for an empty selection without querying all records', async () => {
    const mock = database();
    expect(await new ExportsService(mock.db, {} as any, {} as any).exportOpportunities(actor, { ids: [] })).toEqual([]);
    expect(mock.db.select).not.toHaveBeenCalled();
  });
});
