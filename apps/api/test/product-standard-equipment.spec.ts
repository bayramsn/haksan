import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { productStandardEquipmentUpdateSchema } from '../../../packages/shared/src/schemas/product';
import { ProductsService } from '../src/modules/products/products.service';
import { companies, equipmentTypes, productEquipmentItems, productModels } from '../src/db/schema';
import type { AuthContext } from '../src/shared/security/auth.types';

vi.mock('../src/shared/utils/lookup.helper', () => ({
  lookupIdByCode: vi.fn(async (_db, table, code) => {
    if (table !== equipmentTypes || code !== 'standart') throw new Error('Unexpected lookup');
    return 'standard-type';
  }),
}));

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const supplierId = '33333333-3333-4333-8333-333333333333';
const actor = { tenantId, userId: 'actor' } as AuthContext;
const dialect = new PgDialect();
const query = (condition: SQL) => dialect.sqlToQuery(condition);

type Item = {
  id: string; tenantId: string; productModelId: string; equipmentTypeId: string | null;
  title: string; description: string | null; unitPrice: string | null; currencyId: string | null;
  isPromotion: boolean; sortOrder: number; deletedAt: Date | null;
};

/** Small SQL-aware fixture: exercise the real service and its WHERE predicates without a live DB. */
function fixture(supplierRelation = 'supplier') {
  const item = (id: string, title: string, equipmentTypeId: string | null, sortOrder: number): Item => ({
    id, title, equipmentTypeId, sortOrder, tenantId, productModelId: productId,
    description: `${title} original description`, unitPrice: '1250.00', currencyId: 'usd',
    isPromotion: true, deletedAt: null,
  });
  const items = [
    item('legacy', 'Eski ayna', null, 1),
    item('standard', 'Takım seti', 'standard-type', 2),
    item('optional', 'Çubuk sürücü', 'optional-type', 3),
    { ...item('other-tenant', 'Başka kiracı', 'standard-type', 1), tenantId: 'other-tenant' },
    { ...item('other-product', 'Başka ürün', 'standard-type', 1), productModelId: 'other-product' },
  ];
  const product = { id: productId, tenantId, supplierCompanyId: 'old-supplier', listPrice: '100000.00', cashPrice: '95000.00', vatRate: '20.00', productTypeId: 'cnc-lathe' };
  const specs = [{ id: 'spec', specKey: 'Ayna çapı', specValue: '10', specUnit: 'inç', sortOrder: 4 }];
  const writes: Array<{ table: unknown; patch: Record<string, unknown> }> = [];
  let nextId = 1;

  // Match the limited equality/IN/null SQL used by this operation. Unsupported predicates fail loudly.
  const matches = (row: Record<string, unknown>, condition: SQL) => {
    const compiled = query(condition);
    const columns: Record<string, string> = { id: 'id', tenant_id: 'tenantId', product_model_id: 'productModelId', deleted_at: 'deletedAt' };
    const predicates = [...compiled.sql.matchAll(/"product_(?:equipment_items|models)"\."(\w+)"\s+(=\s*\$\d+|in\s*\([^)]*\)|is null)/g)];
    expect(predicates.length).toBeGreaterThan(0);
    return predicates.every(([, column, expression]) => {
      const key = columns[column];
      if (!key) throw new Error(`Unsupported column ${column}`);
      if (expression === 'is null') return row[key] === null;
      const values = [...expression.matchAll(/\$(\d+)/g)].map((match) => compiled.params[Number(match[1]) - 1]);
      return values.includes(row[key]);
    });
  };

  const tx = {
    execute: vi.fn(async (condition: SQL) => {
      const compiled = query(condition);
      expect(compiled.sql).toContain('for update');
      expect(compiled.params).toEqual([productId, tenantId]);
    }),
    select: vi.fn(() => {
      let condition: SQL;
      const chain = {
        from: (table: unknown) => { expect(table).toBe(productEquipmentItems); return chain; },
        leftJoin: () => chain,
        where: (value: SQL) => { condition = value; return chain; },
        orderBy: async () => items.filter((row) => matches(row, condition)).map((row) => ({
          item: { ...row }, typeCode: row.equipmentTypeId === 'optional-type' ? 'opsiyonel' : row.equipmentTypeId === null ? null : 'standart',
        })),
      };
      return chain;
    }),
    update: vi.fn((table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (condition: SQL) => {
          writes.push({ table, patch });
          const target = table === productEquipmentItems ? items : table === productModels ? [product] : null;
          if (!target) throw new Error('Unexpected table write: specs/prices must remain untouched');
          for (const row of target) if (matches(row, condition)) Object.assign(row, patch);
        },
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: async (value: Partial<Item>) => {
        expect(table).toBe(productEquipmentItems);
        items.push({ id: `new-${nextId++}`, description: null, unitPrice: null, currencyId: null, deletedAt: null, ...value } as Item);
      },
    })),
  };
  const db = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    select: vi.fn(() => {
      const chain = {
        from: (table: unknown) => { expect(table).toBe(companies); return chain; },
        leftJoin: () => chain,
        where: (condition: SQL) => {
          const compiled = query(condition);
          expect(compiled.params).toEqual([supplierId, tenantId]);
          expect(compiled.sql).toContain('"companies"."deleted_at" is null');
          return chain;
        },
        limit: async () => [{ id: supplierId, relationCode: supplierRelation }],
      };
      return chain;
    }),
  };
  const service = new ProductsService(db as any, {} as any, {} as any);
  vi.spyOn(service, 'get').mockImplementation(async (id, context) => {
    expect(id).toBe(productId);
    expect(context).toBe(actor);
    return { ...product, specs } as any;
  });
  const activeStandard = () => items.filter((row) => row.tenantId === tenantId && row.productModelId === productId && !row.deletedAt && row.equipmentTypeId !== 'optional-type');
  return { service, db, tx, product, specs, items, writes, activeStandard };
}

describe('standard equipment update preserves unrelated product data', () => {
  it('keeps existing IDs, legacy null-type rows and metadata; adds only missing items and updates the supplier', async () => {
    const f = fixture();
    const before = structuredClone({ items: f.items, product: f.product, specs: f.specs });
    await f.service.updateStandardEquipment(productId, { standardEquipment: ['Eski ayna', 'Takım seti', 'Soğutma'], supplierCompanyId: supplierId }, actor);
    expect(f.activeStandard().map((row) => row.title)).toEqual(['Eski ayna', 'Takım seti', 'Soğutma']);
    expect(f.items.slice(0, 5)).toEqual(before.items);
    expect(f.specs).toEqual(before.specs);
    expect(f.product).toEqual({ ...before.product, supplierCompanyId: supplierId });
    expect(f.tx.insert).toHaveBeenCalledTimes(1);
    expect(f.writes.map((write) => write.patch)).toEqual([{ supplierCompanyId: supplierId }]);

    const afterFirst = structuredClone(f.items);
    f.tx.insert.mockClear();
    await f.service.updateStandardEquipment(productId, { standardEquipment: ['Eski ayna', 'Takım seti', 'Soğutma'] }, actor);
    expect(f.items).toEqual(afterFirst);
    expect(f.tx.insert).not.toHaveBeenCalled();
    expect(f.product.supplierCompanyId).toBe(supplierId);
  });

  it('soft-deletes removed legacy standards and reorders retained rows without touching optional prices or other tenants', async () => {
    const f = fixture();
    const untouched = structuredClone(f.items.slice(2));
    const retained = structuredClone(f.items[1]);
    await f.service.updateStandardEquipment(productId, { standardEquipment: ['Takım seti'] }, actor);
    expect(f.items[0].deletedAt).toBeInstanceOf(Date);
    expect(f.items[1]).toEqual({ ...retained, sortOrder: 1 });
    expect(f.items.slice(2)).toEqual(untouched);
    expect(f.activeStandard().map((row) => row.id)).toEqual(['standard']);
  });

  it('an empty list clears only standards and explicit null clears the supplier', async () => {
    const f = fixture();
    const optional = structuredClone(f.items[2]);
    await f.service.updateStandardEquipment(productId, { standardEquipment: [], supplierCompanyId: null }, actor);
    expect(f.activeStandard()).toEqual([]);
    expect(f.items[2]).toEqual(optional);
    expect(f.product).toMatchObject({ supplierCompanyId: null, listPrice: '100000.00', cashPrice: '95000.00', vatRate: '20.00' });
  });

  it('rejects a non-supplier before starting any write transaction', async () => {
    const f = fixture('customer');
    const before = structuredClone({ items: f.items, product: f.product });
    await expect(f.service.updateStandardEquipment(productId, { standardEquipment: [], supplierCompanyId: supplierId }, actor)).rejects.toThrow('Tedarikçi firma seçiniz');
    expect(f.db.transaction).not.toHaveBeenCalled();
    expect({ items: f.items, product: f.product }).toEqual(before);
  });

  it('stops before any writes when product access validation fails', async () => {
    const f = fixture();
    vi.mocked(f.service.get).mockRejectedValueOnce(new Error('Ürün bulunamadı'));
    await expect(f.service.updateStandardEquipment(productId, { standardEquipment: [] }, actor)).rejects.toThrow('Ürün bulunamadı');
    expect(f.db.select).not.toHaveBeenCalled();
    expect(f.db.transaction).not.toHaveBeenCalled();
  });
});

describe('standard equipment update input boundary', () => {
  it.each(['specs', 'optionalEquipment', 'listPrice', 'cashPrice', 'vatRate'])('rejects unexpected %s instead of allowing an unrelated edit', (field) => {
    expect(productStandardEquipmentUpdateSchema.safeParse({ standardEquipment: ['Ayna'], [field]: [] }).success).toBe(false);
  });
  it('trims titles, preserves omitted supplier semantics and rejects blank titles', () => {
    expect(productStandardEquipmentUpdateSchema.parse({ standardEquipment: [' Ayna '] })).toEqual({ standardEquipment: ['Ayna'] });
    expect(productStandardEquipmentUpdateSchema.safeParse({ standardEquipment: ['   '] }).success).toBe(false);
    expect(productStandardEquipmentUpdateSchema.safeParse({ standardEquipment: ['Ayna'], supplierCompanyId: 'invalid' }).success).toBe(false);
  });
});
