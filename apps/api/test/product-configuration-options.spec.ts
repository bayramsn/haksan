import { describe, expect, it, vi } from 'vitest';
import { productOptionValueCreateSchema, productOptionSetCreateSchema } from '@haksan/shared';
import { ProductsService } from '../src/modules/products/products.service';
import type { AuthContext } from '../src/shared/security/auth.types';

const actor = { tenantId: '10000000-0000-4000-8000-000000000001' } as AuthContext;
function serviceFixture() {
  const db = { query: {
    productOptionSets: { findFirst: vi.fn(async () => ({ id: 'set', productModelId: 'model', configurationKind: 'table' })) },
    productOptionValues: { findFirst: vi.fn(async () => ({ id: 'value', optionSetId: 'set' })) },
  }, insert: vi.fn(), update: vi.fn() };
  const service = new ProductsService(db as never, {} as never, {} as never);
  const get = vi.spyOn(service, 'get').mockResolvedValue({ laserBaseConfiguration: { sourceModelCodes: ['F3015'] } } as never);
  return { service, db, get };
}

describe('managed configuration option scope', () => {
  it('checks model visibility before writing to a group', async () => {
    const { service, db, get } = serviceFixture();
    get.mockRejectedValue(new Error('Bölüm erişimi yok'));
    await expect(service.addOptionValue('set', { value: '3000 × 1500', sortOrder: 0 }, actor)).rejects.toThrow('Bölüm erişimi');
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('checks model visibility before updating and archiving values', async () => {
    const { service, db, get } = serviceFixture();
    get.mockRejectedValue(new Error('Bölüm erişimi yok'));
    await expect(service.updateOptionValue('value', { value: 'Ölçü' }, actor)).rejects.toThrow('Bölüm erişimi');
    await expect(service.deleteOptionValue('value', actor)).rejects.toThrow('Bölüm erişimi');
    expect(db.update).not.toHaveBeenCalled();
  });
  it('rejects concrete table mappings outside the base family', async () => {
    const { service, db } = serviceFixture();
    await expect(service.addOptionValue('set', { value: 'H3015', sourceModelCode: 'H3015', sortOrder: 0 }, actor)).rejects.toThrow('baz seriye ait değil');
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('rejects power metadata on a table group', async () => {
    const { service, db } = serviceFixture();
    await expect(service.addOptionValue('set', { value: '3 kW', powerKw: 3, sortOrder: 0 }, actor)).rejects.toThrow('grubuyla uyumsuz');
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('rejects reinterpreting a table group as another configuration kind', async () => {
    const { service, db } = serviceFixture();
    await expect(service.updateOptionSet('set', { configurationKind: 'power' }, actor)).rejects.toThrow('türü değiştirilemez');
    expect(db.update).not.toHaveBeenCalled();
  });
  it('permits custom positive powers and explicit zero prices while rejecting invalid fields', () => {
    expect(productOptionValueCreateSchema.parse({ value: 'Özel 8 kW', powerKw: 8, priceDelta: 0 }).powerKw).toBe(8);
    expect(productOptionValueCreateSchema.safeParse({ value: 'Güç', powerKw: -1 }).success).toBe(false);
    expect(productOptionValueCreateSchema.safeParse({ value: 'Güç', tenantId: 'foreign' }).success).toBe(false);
    expect(productOptionSetCreateSchema.safeParse({ name: 'A'.repeat(129) }).success).toBe(false);
  });
});
