import { describe, expect, it } from 'vitest';
import { importChildren, scopeImportTaxonomy, type ImportTaxonomy, type ImportLookupRow } from '../src/modules/products/product-import-scope';
const row = (id: string, code: string, divisionId: string | null, parentId?: string): ImportLookupRow => ({ id, code, name: code, divisionId, parentId });
const all: ImportTaxonomy = {
  productGroups: [row('cnc-group', 'CNC', null), row('sac-group', 'SAC_ISLEME', 'sac'), row('uni-group', 'UNIVERSAL', 'uni')],
  productCategories: [row('cnc-cat', 'TEZGAH', null, 'cnc-group'), row('sac-cat', 'TEZGAH', 'sac', 'sac-group'), row('uni-cat', 'TEZGAH', 'uni', 'uni-group')],
  productSubcategories: [row('cnc-sub', 'TORNA', null, 'cnc-cat'), row('sac-sub', 'SAC_KESME', 'sac', 'sac-cat'), row('uni-sub', 'TORNA', 'uni', 'uni-cat')],
  productTypes: [row('cnc-type', 'CNC_TORNA', null, 'cnc-sub'), row('sac-type', 'FIBER_LAZER_KESIM', 'sac', 'sac-sub'), row('uni-type', 'UNIVERSAL_TORNA', 'uni', 'uni-sub'), row('wrong-parent', 'BROKEN', 'sac', 'cnc-sub')],
  productSpecGroups: [row('common', 'GENEL', null), row('cnc-spec', 'GENEL', 'cnc'), row('sac-spec', 'GENEL', 'sac')],
  equipmentTypes: [], currencies: [],
};

describe('division product import taxonomy', () => {
  it.each([['cnc', 'CNC', 'cnc-type'], ['sac', 'SAC_ISLEME', 'sac-type'], ['uni', 'UNIVERSAL', 'uni-type']])('keeps only %s family including linked legacy records', (division, groupCode, typeId) => {
    const result = scopeImportTaxonomy(all, division, groupCode);
    expect(result.productGroups).toHaveLength(1);
    expect(result.productCategories).toHaveLength(1);
    expect(result.productTypes.map((type) => type.id)).toEqual([typeId]);
    expect(result.productSpecGroups.every((spec) => !spec.divisionId || spec.divisionId === division)).toBe(true);
  });
  it('does not expose unlinked global CNC types to Sac when categories are shared', () => {
    const result = scopeImportTaxonomy({ ...all, productTypes: [row('cnc-unlinked', 'CNC_TORNA', null), row('sac-unlinked', 'ABKANT_PRES', null), row('unknown', 'MYSTERY', null)] }, 'sac', 'SAC_ISLEME');
    expect(result.productTypes.map((type) => type.id)).toEqual(['sac-unlinked']);
  });
  it('rejects a child from another selected parent even in the same division', () => {
    const parentA = row('a', 'TORNA', 'cnc'); const parentB = row('b', 'FREZE', 'cnc');
    expect(importChildren([row('type-a', 'A', 'cnc', 'a'), row('type-b', 'B', 'cnc', 'b')], parentA, [parentA, parentB]).map((type) => type.id)).toEqual(['type-a']);
  });
  it('prefers exact rows over shared copies of the same code', () => {
    const result = scopeImportTaxonomy(all, 'sac', 'SAC_ISLEME');
    expect(result.productSpecGroups.find((spec) => spec.code === 'GENEL')?.id).toBe('sac-spec');
  });
});
