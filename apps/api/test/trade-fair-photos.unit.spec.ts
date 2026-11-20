import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { and } from 'drizzle-orm';
import { TradeFairsService } from '../src/modules/trade-fairs/trade-fairs.service';

const actor = { tenantId: 'tenant-test', userId: 'user-test' } as any;

describe('Trade fair photo boundaries', () => {
  it('only reads linked images attached to active records in the actor tenant', async () => {
    let condition: any;
    const chain: any = { innerJoin: () => chain, leftJoin: () => chain, where: (value: any) => { condition = value; return chain; }, orderBy: () => chain, limit: vi.fn().mockResolvedValue([{ id: 'link', fileId: 'file', record: { id: 'record' }, metByName: 'Staff' }]) };
    const service = new TradeFairsService({ select: () => ({ from: () => chain }) } as any, {} as any);
    const result = await service.photos(actor);
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('"files"."deleted_at" is null');
    expect(query.sql).toContain('"trade_fair_contacts"."deleted_at" is null');
    expect(query.sql).toContain('"file_links"."tenant_id" =');
    expect(query.params).toEqual(expect.arrayContaining(['tenant-test', 'trade_fair_contact', 'linked']));
    expect(query.sql).toContain("like 'image/%'");
    expect(result[0].record.metByName).toBe('Staff');
    expect(result[0]).not.toHaveProperty('objectKey');
  });
  it('filters photos in SQL so pagination and total counts share the same conditions', () => {
    const service = new TradeFairsService({} as any, {} as any);
    const filters = (service as any).listFilters(actor, { photosOnly: true });
    const query = new PgDialect().sqlToQuery(and(...filters)!);
    expect(query.sql).toContain('exists (');
    expect(query.sql).toContain('"file_links"."tenant_id" = "trade_fair_contacts"."tenant_id"');
    expect(query.sql).toContain("'trade_fair_contact'");
    expect(query.sql).toContain("'linked'");
  });
});
