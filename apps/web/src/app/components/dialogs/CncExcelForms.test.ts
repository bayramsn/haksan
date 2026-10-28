import { describe, expect, it } from 'vitest';
import type { Product } from '../../lib/mock';
import { fromProduct, moneyNumber } from './CreateDialogs';

const product = {
  id: 'existing-cnc', brand: 'Manford', model: 'VU-620', type: 'CNC 5 Eksen', productTypeCode: 'CNC_5_EKSEN',
  productGroupCode: 'CNC', categoryCode: 'TEZGAH', subcategoryCode: 'ISLEME_MERKEZI',
  currency: 'USD', listPrice: 0, cashPrice: null, controlPanel: 'Siemens', imageUrl: '', shortDescription: '', description: '',
  standardEquipment: [], optionalEquipment: [], status: 'active',
  specs: [{ key: 'Önceden girilen özel alan', value: '00125', unit: 'mm' }],
} as unknown as Product;

describe('CNC Excel form preservation', () => {
  it('distinguishes blank prices from explicit zero and decimal prices', () => {
    expect(moneyNumber('')).toBeNull();
    expect(moneyNumber('   ')).toBeNull();
    expect(moneyNumber('0')).toBe(0);
    expect(moneyNumber('12,50')).toBe(12.5);
    const form = fromProduct(product);
    expect(form.listPrice).toBe('0');
    expect(form.cashPrice).toBe('');
  });
  it('opens stored technical values without removing custom fields or replacing zero-prefixed text', () => {
    const before = structuredClone(product.specs);
    expect(fromProduct(product).specs).toHaveLength(before.length);
    expect(fromProduct(product).specs[0]).toMatchObject(before[0]);
    expect(product.specs).toEqual(before);
  });
});
