import { describe, expect, it } from 'vitest';
import { buildProductTaxonomyTree } from './productTaxonomyTree';

describe('ürün ağacı', () => {
  const levels = {
    groups: [{ id: 'g1', code: 'CNC', name: 'CNC' }, { id: 'g2', code: 'UNIVERSAL', name: 'Üniversal' }],
    categories: [{ id: 'c1', code: 'TEZGAH', name: 'Tezgah', productGroupId: 'g1' }, { id: 'c2', code: 'AKSESUAR', name: 'Aksesuar', productGroupId: null }],
    subcategories: [{ id: 's1', code: 'ISLEME', name: 'İşleme Merkezi', categoryId: 'c1', isActive: false }],
    types: [{ id: 't1', code: 'FIVE_AXIS', name: '5 Eksen', subcategoryId: 's1' }],
  };
  const products = [
    { productGroupCode: 'CNC', categoryCode: 'TEZGAH', subcategoryCode: 'ISLEME', productTypeCode: 'FIVE_AXIS' },
    { productGroupCode: 'CNC', categoryCode: 'TEZGAH', subcategoryCode: 'ISLEME' },
    { productGroupCode: 'UNIVERSAL', categoryCode: 'AKSESUAR' },
    { categoryCode: 'AKSESUAR' },
  ];

  it('zinciri kodlara göre sayar; ortak kayıt yalnız ürünü olan üstün altında görünür', () => {
    const tree = buildProductTaxonomyTree(levels, products);
    expect(tree.map((n) => [n.name, n.count])).toEqual([['CNC', 2], ['Üniversal', 1], ['Grup atanmamış', 1]]);
    expect(tree[2].children.map((n) => [n.name, n.count])).toEqual([['Aksesuar', 1]]);
    expect(tree[0].children.map((n) => n.name)).toEqual(['Tezgah']);
    expect(tree[1].children.map((n) => [n.name, n.count, n.shared])).toEqual([['Aksesuar', 1, true]]);
    const isleme = tree[0].children[0].children[0];
    expect([isleme.name, isleme.count, isleme.inactive]).toEqual(['İşleme Merkezi', 2, true]);
    expect(isleme.children.map((n) => [n.name, n.count])).toEqual([['5 Eksen', 1]]);
  });
});
