import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { divisions } from '../src/db/schema/tenants';
import { productGroups } from '../src/db/schema/lookup';
import { ProductsService } from '../src/modules/products/products.service';
import type { AuthContext } from '../src/shared/security/auth.types';

const actor = {
  tenantId: '10000000-0000-4000-8000-000000000001', canViewAllDivisions: true,
  activeDivisionId: 'all', accessScopes: [],
} as unknown as AuthContext;

function compatibilityService() {
  const db = { query: { productGroups: { findFirst: vi.fn(async () => ({ divisionId: 'cnc' })) } } };
  const service = new ProductsService(db as never, {} as never, {} as never);
  const maps = {
    productGroups: [{ id: 'g', code: 'CNC', divisionId: 'cnc' }],
    productCategories: [{ id: 'c', code: 'TEZGAH', parentId: 'g' }, { id: 'o', code: 'OPSIYONEL', parentId: 'g' }],
    productSubcategories: [{ id: 's', code: 'TORNA', parentId: 'c' }, { id: 'so', code: 'OTHER', parentId: 'o' }],
    productTypes: [{ id: 't', code: 'CNC_TORNA', parentId: 's' }, { id: 'to', code: 'OTHER_TYPE', parentId: 'so' }],
  };
  vi.spyOn(service as any, 'getImportLookupMaps').mockResolvedValue(maps);
  return service as any;
}

describe('scoped taxonomy resolution', () => {
  it('category filters use all visible IDs instead of selecting the first duplicate code', async () => {
    const categoryIds = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'];
    const query = vi.fn(async (request: { text: string }, _params?: unknown[]) => ({ rows: request.text.includes('from "product_categories"')
      ? categoryIds.map((id) => [id]) : request.text.includes('count(*)') ? [[0]] : [] }));
    const service = new ProductsService(drizzle({ query } as never) as never, {} as never, {} as never);
    await service.list(actor, { categoryCode: 'TEZGAH' }, { page: 1, pageSize: 20 });
    const requests = query.mock.calls.map(([request]) => request as { text: string; values?: unknown[] });
    expect(requests[0].text).not.toContain('limit');
    expect(requests[0].text).toContain('"product_categories"."is_active"');
    const productQuery = requests.find((request) => request.text.includes('count(*)'))!;
    expect(productQuery.text).toContain('"product_models"."category_id" in');
    const countCall = query.mock.calls.find(([request]) => request.text.includes('count(*)'))!;
    expect(countCall[1]).toEqual(expect.arrayContaining(categoryIds));
  });

  it('resolves compatibility in the equipment division, preserving valid parent chains', async () => {
    const service = compatibilityService();
    const resolved = await service.resolveOptionalCompatibilities('g', actor, {
      optionalCompatibilityCategoryCodes: ['TEZGAH'], optionalCompatibilityTypeCodes: ['CNC_TORNA'],
    });
    expect(service.getImportLookupMaps).toHaveBeenCalledWith(actor, 'cnc');
    expect(resolved).toMatchObject({ categoryIds: ['c'], typeIds: ['t'] });
  });

  it('rejects foreign/unknown codes and types under another selected category', async () => {
    const service = compatibilityService();
    await expect(service.resolveOptionalCompatibilities('g', actor, { optionalCompatibilityTypeCodes: ['FOREIGN'] })).rejects.toThrow();
    await expect(service.resolveOptionalCompatibilities('g', actor, {
      optionalCompatibilityCategoryCodes: ['TEZGAH'], optionalCompatibilityTypeCodes: ['OTHER_TYPE'],
    })).rejects.toThrow();
  });

  it('keeps equivalent shared and division IDs for existing machine compatibility', () => {
    const service = compatibilityService();
    expect(service.compatibilityIds([{ id: 'shared', code: 'TORNA' }, { id: 'cnc', code: 'TORNA' }], ['TORNA', 'TORNA'], 'Alt kategori'))
      .toEqual(['shared', 'cnc']);
  });

  it('prefers the product division spec group over a shared duplicate', async () => {
    const query = vi.fn(async () => ({ rows: [['shared', null], ['cnc-spec', 'cnc']] }));
    const db = drizzle({ query } as never, { schema: { productGroups } });
    vi.spyOn(db.query.productGroups, 'findFirst').mockResolvedValue({ divisionId: 'cnc', code: 'CNC' } as never);
    const service = new ProductsService(db as never, {} as never, {} as never) as any;
    expect(await service.specGroupIdForProduct('g', 'GENEL', actor)).toBe('cnc-spec');
  });

  it('resolves shared canonical groups to the product tenant division, including lowercase spec codes', async () => {
    const query = vi.fn(async (request: { text: string }, _params?: unknown[]) => ({ rows: [['shared', null], ['cnc-spec', 'cnc']] }));
    const db = drizzle({ query } as never, { schema: { productGroups, divisions } });
    vi.spyOn(db.query.productGroups, 'findFirst').mockResolvedValue({ divisionId: null, code: 'CNC' } as never);
    const divisionLookup = vi.spyOn(db.query.divisions, 'findFirst').mockResolvedValue({ id: 'cnc' } as never);
    const service = new ProductsService(db as never, {} as never, {} as never) as any;
    expect(await service.specGroupIdForProduct('g', 'genel', actor)).toBe('cnc-spec');
    expect(divisionLookup).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0].text).toContain('upper("product_spec_groups"."code")');
    expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining(['GENEL', 'cnc']));
  });


  it('resolves raw and display main-category aliases only against approved machine categories', () => {
    const service = compatibilityService();
    const excluded = { id: 'excluded', code: 'HM_KAYNAK_TEZGAH', name: 'Tezgah' };
    const main = { id: 'main', code: 'universal_machine', name: 'Legacy Machine' };
    for (const value of ['TEZGAH', 'Tezgah', 'CNC Tezgahları', 'Üniversal Tezgahlar', 'Sac İşleme Tezgahları']) {
      expect(service.importLookup([excluded, main], value)?.id).toBe('main');
      expect(service.importLookup([excluded], value)).toBeUndefined();
    }
    expect(service.importLookup([excluded], 'HM_KAYNAK_TEZGAH')).toEqual(excluded);
  });

  it.each([
    ['UNIVERSAL', 'RADYAL_MATKAP', 'MATKAP', 'universal_machine'],
    ['SAC_ISLEME', 'FIBER_LAZER_KESIM', 'SAC_LAZER_KESIM', 'sac_machine'],
  ])('infers omitted taxonomy parents from explicit %s type UUID ancestry', async (groupCode, typeCode, subCode, categoryCode) => {
    const service = compatibilityService();
    vi.spyOn(service, 'findProductByModelCode').mockResolvedValue(null);
    const maps = { groupCode, divisionId: 'division',
      productGroups: [{ id: 'g', code: groupCode, name: groupCode }],
      productCategories: [{ id: 'c', code: categoryCode, name: 'Old Tezgah', parentId: 'g' }],
      productSubcategories: [{ id: 's', code: subCode, name: subCode, parentId: 'c' }],
      productTypes: [{ id: 't', code: typeCode, name: typeCode, parentId: 's' }],
      productSpecGroups: [], equipmentTypes: [], currencies: [{ id: 'usd', code: 'USD', name: 'USD' }],
    };
    for (const category of [undefined, 'TEZGAH', 'Üniversal Tezgahlar']) {
      const result = await service.normalizeImportRow({ rowNumber: 1, brandName: 'HAKSAN', modelCode: 'MODEL', productTypeCode: typeCode, categoryCode: category }, maps, actor);
      expect(result.errors).toEqual([]);
      expect(result).toMatchObject({ status: 'create', categoryCode, subcategoryCode: subCode, productTypeCode: typeCode });
    }
  });

  it('decorates main category names without changing IDs/codes or excluded catalogs', () => {
    const service = compatibilityService();
    const main = { id: 'c', code: 'TEZGAH', name: 'Tezgah' };
    expect(service.categoryView(main, 'CNC')).toEqual({ ...main, name: 'CNC Tezgahları' });
    expect(service.categoryView(main, 'OTHER')).toEqual(main);
    const excluded = { ...main, code: 'HM_KAYNAK_TEZGAH' };
    expect(service.categoryView(excluded, 'SAC_ISLEME')).toEqual(excluded);
  });

});
