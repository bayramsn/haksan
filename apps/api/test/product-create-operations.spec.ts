import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ProductsController } from '../src/modules/products/products.controller';
import { ProductsService } from '../src/modules/products/products.service';
import { createContextualDatabase } from '../src/db/transaction-context';
import { ForbiddenError, NotFoundError } from '../src/shared/utils/errors';
import type { AuthContext } from '../src/shared/security/auth.types';
const operationId = '11111111-1111-4111-8111-111111111111';
const actor = { tenantId: 'tenant', userId: 'alice', activeDivisionId: 'cnc', activeDepartmentId: 'sales', permissions: new Set(['products.create']) } as unknown as AuthContext;
const input = { modelCode: 'MODEL', fullName: 'Product' } as any;
function fixture() {
  let state: any = { operations: [], products: [] };
  let queue: Promise<unknown> = Promise.resolve();
  const selectRows = (data: any, where: any) => {
    const [tenantId, userId, op] = new PgDialect().sqlToQuery(where).params;
    return data.operations.filter((row: any) => row.tenantId === tenantId && row.userId === userId && row.operationId === op);
  };
  const makeDb = (read: () => any): any => ({
    insert: () => ({ values: (values: any) => ({ onConflictDoNothing: () => ({ returning: async () => {
      if (read().operations.some((row: any) => row.tenantId === values.tenantId && row.userId === values.userId && row.operationId === values.operationId)) return [];
      read().operations.push({ ...values }); return [values];
    } }) }) }),
    select: () => ({ from: () => ({ where: (where: any) => ({ limit: async () => selectRows(read(), where) }) }) }),
    update: () => ({ set: (patch: any) => ({ where: async (where: any) => { Object.assign(selectRows(read(), where)[0], patch); } }) }),
    addProduct: () => { const product = { id: `product-${read().products.length + 1}` }; read().products.push(product); return product; },
    product: (id: string) => read().products.find((row: any) => row.id === id),
    transaction: (work: any) => {
      const run = queue.catch(() => undefined).then(async () => { const pending = structuredClone(state); const result = await work(makeDb(() => pending)); state = pending; return result; });
      queue = run; return run;
    },
  });
  const db = createContextualDatabase(makeDb(() => state));
  const svc = new ProductsService(db as any, {} as any, {} as any);
  vi.spyOn(svc, 'create').mockImplementation(async () => (db as any).addProduct());
  const get = vi.spyOn(svc, 'get').mockImplementation(async id => (db as any).product(id));
  return { svc, get, state: () => state };
}
describe('owner-scoped atomic product create receipts', () => {
  it('serializes concurrent and lost-response retries to one product', async () => {
    const f = fixture();
    const results = await Promise.all([f.svc.createOnce(input, actor, operationId), f.svc.createOnce(input, actor, operationId)]);
    expect(results[0]).toEqual(results[1]); expect(f.state().products).toHaveLength(1); expect(f.svc.create).toHaveBeenCalledTimes(1);
    expect(await f.svc.recoverCreate(operationId, actor)).toEqual(results[0]);
  });
  it('rejects payload changes and changed active scopes for an existing operation', async () => {
    const f = fixture(); await f.svc.createOnce(input, actor, operationId);
    await expect(f.svc.createOnce({ ...input, fullName: 'Changed' }, actor, operationId)).rejects.toThrow('İşlem anahtarı');
    await expect(f.svc.createOnce(input, { ...actor, activeDivisionId: 'sac' }, operationId)).rejects.toThrow('İşlem anahtarı');
    await expect(f.svc.recoverCreate(operationId, { ...actor, activeDepartmentId: 'service' })).rejects.toBeInstanceOf(NotFoundError);
    expect(f.state().products).toHaveLength(1);
  });
  it('does not expose an operation to another user or tenant', async () => {
    const f = fixture(); await f.svc.createOnce(input, actor, operationId);
    await expect(f.svc.recoverCreate(operationId, { ...actor, userId: 'bob' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(f.svc.recoverCreate(operationId, { ...actor, tenantId: 'other' })).rejects.toBeInstanceOf(NotFoundError);
  });
  it('rechecks both create permission and live product visibility on replay', async () => {
    const f = fixture(); await f.svc.createOnce(input, actor, operationId);
    await expect(f.svc.recoverCreate(operationId, { ...actor, permissions: new Set() })).rejects.toBeInstanceOf(ForbiddenError);
    f.get.mockRejectedValue(new NotFoundError('Ürün'));
    await expect(f.svc.createOnce(input, actor, operationId)).rejects.toBeInstanceOf(NotFoundError);
    expect(f.svc.create).toHaveBeenCalledTimes(1);
  });
  it('rolls back receipt and product if final validation fails', async () => {
    const f = fixture(); f.get.mockRejectedValueOnce(new NotFoundError('Ürün'));
    await expect(f.svc.createOnce(input, actor, operationId)).rejects.toBeInstanceOf(NotFoundError);
    expect(f.state().products).toHaveLength(0); expect(f.state().operations).toHaveLength(0);
    await f.svc.createOnce(input, actor, operationId); expect(f.state().products).toHaveLength(1);
  });
});

describe('product create operation input contract', () => {
  it('validates operation UUID and retains legacy calls without a key', async () => {
    const svc = { create: vi.fn().mockResolvedValue({ id: 'legacy' }), createOnce: vi.fn().mockResolvedValue({ id: 'new' }) };
    const controller = new ProductsController(svc as any, {} as any);
    await controller.create(input, actor);
    expect(svc.create).toHaveBeenCalledWith(input, actor);
    await controller.create(input, actor, operationId);
    expect(svc.createOnce).toHaveBeenCalledWith(input, actor, operationId);
    expect(() => controller.create(input, actor, 'invalid')).toThrow('Doğrulama');
    expect(() => controller.create(input, actor, ['one', 'two'] as any)).toThrow('Doğrulama');
  });
});
