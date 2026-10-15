import { describe, expect, it } from 'vitest';
import type { Product } from './mock';
import { changeSalesPriceFilter, emptySalesPriceFilters, filterSalesPrices, salesPriceFilterOptions, salesPriceFilterValue } from './salesPriceFilters';

const product = (values: Partial<Product>): Product => ({
  id: '1', brand: 'MANFORD', model: 'VU-620', type: '5 Eksen İşleme Merkezi',
  productTypeCode: 'FIVE_AXIS', productGroup: 'CNC', productGroupCode: 'CNC', category: 'CNC Tezgahları', categoryCode: 'TEZGAH',
  subcategory: 'İşleme Merkezi', subcategoryCode: 'ISLEME', stockCode: '0000620', controlPanel: '', imageUrl: '', shortDescription: '',
  description: '', currency: 'USD', listPrice: 0, specs: [], standardEquipment: [], optionalEquipment: [], status: 'active', ...values,
});

describe('sales machine price list filters', () => {
  const cnc = product({});
  const universal = product({ id: '2', brand: 'SAYMAK', productGroup: 'Üniversal', productGroupCode: 'UNIVERSAL', category: 'Üniversal Tezgahlar' });
  it('keeps identical taxonomy codes in different groups separate', () => {
    const options = salesPriceFilterOptions([cnc, universal], 'category');
    expect(options).toHaveLength(2);
    expect(filterSalesPrices([cnc, universal], { category: salesPriceFilterValue(cnc, 'category') })).toEqual([cnc]);
  });
  it('combines hierarchy, brand and Turkish word searches without changing price values', () => {
    const priced = product({ listPrice: 0, cashPrice: undefined });
    const filters = { ...emptySalesPriceFilters(), brand: salesPriceFilterValue(priced, 'brand'), type: salesPriceFilterValue(priced, 'type') };
    expect(filterSalesPrices([priced, universal], filters, 'manford isleme 0000620')).toEqual([priced]);
    expect(priced.listPrice).toBe(0);
    expect(priced.cashPrice).toBeUndefined();
    expect(filterSalesPrices([priced], filters, 'olmayan')).toEqual([]);
  });
  it('clears descendant selections when parent changes and retains independent brand', () => {
    const filters = { group: 'CNC', category: 'category', subcategory: 'subcategory', type: 'type', brand: 'brand' };
    expect(changeSalesPriceFilter(filters, 'group', 'UNIVERSAL')).toEqual({ group: 'UNIVERSAL', category: '', subcategory: '', type: '', brand: 'brand' });
    expect(changeSalesPriceFilter(filters, 'category', 'other')).toEqual({ ...filters, category: 'other', subcategory: '', type: '' });
    expect(changeSalesPriceFilter(filters, 'subcategory', 'other')).toEqual({ ...filters, subcategory: 'other', type: '' });
  });
});
