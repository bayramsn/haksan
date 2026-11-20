import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ProductsService } from '../src/modules/products/products.service';
import type { AuthContext } from '../src/shared/security/auth.types';

describe('product list pagination', () => {
  it('uses a unique tie-breaker for products imported with identical timestamps', async () => {
    const query = vi.fn(async (request: { text: string }) => ({
      rows: request.text.includes('count(*)') ? [[0]] : [],
    }));
    const db = drizzle({ query } as never);
    const service = new ProductsService(db as never, {} as never, {} as never);
    const actor = {
      tenantId: '10000000-0000-4000-8000-000000000001',
      canViewAllDivisions: true,
      activeDivisionId: 'all',
      accessScopes: [],
    } as unknown as AuthContext;

    const result = await service.list(actor, {}, { page: 2, pageSize: 200 });

    const listQuery = query.mock.calls.find(([request]) => !request.text.includes('count(*)'))?.[0];
    expect(listQuery?.text).toMatch(/order by "product_models"\."created_at" desc, "product_models"\."id" desc limit \$\d+ offset \$\d+/);
    expect(result).toMatchObject({ data: [], meta: { page: 2, pageSize: 200 } });
  });
});
