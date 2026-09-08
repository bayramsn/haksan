import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { PgDialect } from 'drizzle-orm/pg-core';
import { resolveLaserProfile, type LaserTechnicalConfiguration } from '@haksan/shared';
import { LaserProfilesService, applyLaserSpecEdits, mergeLaserReimport } from '../src/modules/products/laser-profiles.service';
import { LaserImportPreviewStore, TechnicalImportService } from '../src/modules/admin/technical-import.service';
import { ProductsService } from '../src/modules/products/products.service';
import { productEquipmentItems, productModels, productSpecs } from '../src/db/schema/products';
import type { AuthContext } from '../src/shared/security/auth.types';
import { quoteLaserSnapshot } from '../src/modules/quotes/quote-laser-snapshot';

const actor: AuthContext = {
  tenantId: '10000000-0000-4000-8000-000000000001', userId: '10000000-0000-4000-8000-000000000002',
  email: 'laser-test@example.test', roles: ['super_admin'], permissions: new Set(['products.read', 'products.update']),
  divisionIds: ['10000000-0000-4000-8000-000000000003'], primaryDivisionId: '10000000-0000-4000-8000-000000000003',
  departmentIds: [], primaryDepartmentId: null, canViewAllDivisions: true, activeDivisionId: null, activeDepartmentId: null, accessScopes: [],
};
const scope = { divisionId: actor.divisionIds[0], brandId: '10000000-0000-4000-8000-000000000004' };
const selection = { productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', sourceModelCode: 'F3015', cabinType: 'open', powerKw: 6 } as const;
const base = () => resolveLaserProfile(selection);
const audit = { write: vi.fn().mockResolvedValue(undefined) };

describe('laser source provenance and imports', () => {
  it('accepts manual values but never adopts client provenance', () => {
    const original = base();
    const result = applyLaserSpecEdits(original, [{ key: 'Makine Ağırlığı', value: '2222', unit: 'kg', source: { document: 'forged.pdf' }, sourceValue: 'forged', isManual: false }]);
    const spec = result.specs.find((field) => field.key === 'Makine Ağırlığı')!;
    expect(spec).toMatchObject({ value: '2222', sourceValue: '2150', isManual: true });
    expect(spec.source).toEqual(original.specs.find((field) => field.key === spec.key)!.source);
    expect(() => applyLaserSpecEdits(original, [{ key: 'Lazer Gücü', value: '30', unit: 'kW' }])).toThrow('seçim');
  });

  it('preserves manual blanks and values while refreshing source values on reimport', () => {
    const edited = applyLaserSpecEdits(base(), [
      { key: 'Makine Ağırlığı', value: '', unit: 'kg' },
      { key: 'Kontrol Ünitesi', value: 'Özel kontrol' },
    ]);
    const incoming = base();
    incoming.specs.find((field) => field.key === 'Makine Ağırlığı')!.value = '2200';
    const result = mergeLaserReimport(incoming, edited);
    expect(result.specs.find((field) => field.key === 'Makine Ağırlığı')).toMatchObject({ value: '', sourceValue: '2200', isManual: true });
    expect(result.specs.find((field) => field.key === 'Kontrol Ünitesi')?.value).toBe('Özel kontrol');
    expect(mergeLaserReimport(incoming, result)).toEqual(result);
  });

  it('restores source ownership after resetting a manual value and unit', () => {
    const edited = applyLaserSpecEdits(base(), [{ key: 'Makine Ağırlığı', value: '2.2', unit: 't' }]);
    const reset = applyLaserSpecEdits(edited, [{ key: 'Makine Ağırlığı', value: '2150', unit: 'kg', isManual: true }]);
    expect(reset.specs.find((field) => field.key === 'Makine Ağırlığı')).toMatchObject({ value: '2150', unit: 'kg', isManual: false });
    const incoming = base();
    incoming.specs.find((field) => field.key === 'Makine Ağırlığı')!.value = '2200';
    expect(mergeLaserReimport(incoming, reset).specs.find((field) => field.key === 'Makine Ağırlığı')?.value).toBe('2200');
    const nowMatchingSource = mergeLaserReimport(incoming, applyLaserSpecEdits(base(), [{ key: 'Makine Ağırlığı', value: '2200', unit: 'kg' }]));
    expect(applyLaserSpecEdits(nowMatchingSource, [{ key: 'Makine Ağırlığı', value: '2200', unit: 'kg' }]).specs.find((field) => field.key === 'Makine Ağırlığı')?.isManual).toBe(false);
  });

  it('supports full field editing and retains deletions across repeated source imports', () => {
    const original = base();
    const specs = original.specs.filter((spec) => spec.key !== 'Makine Ağırlığı').map((spec) => spec.key === 'Kontrol Ünitesi' ? { ...spec, groupCode: 'OZEL' } : spec);
    specs.push({ key: 'Özel Alan', value: 'Elle', groupCode: 'OZEL' });
    const saved = applyLaserSpecEdits(original, specs, { replaceAll: true });
    expect(saved.hiddenSpecKeys).toContain('Makine Ağırlığı');
    expect(saved.specs.find((spec) => spec.key === 'Kontrol Ünitesi')).toMatchObject({ groupCode: 'OZEL', isManual: true });
    const reimport = mergeLaserReimport(base(), saved);
    expect(reimport.specs.some((spec) => spec.key === 'Makine Ağırlığı')).toBe(false);
    expect(reimport.specs.find((spec) => spec.key === 'Özel Alan')?.value).toBe('Elle');
    expect(reimport.specs.find((spec) => spec.key === 'Kontrol Ünitesi')?.groupCode).toBe('OZEL');
    expect(() => applyLaserSpecEdits(original, [], { replaceAll: true })).toThrow('silinemez');
  });

  it('binds preview tokens to tenant, user, division, brand and expiry', () => {
    const store = new LaserImportPreviewStore();
    const token = store.put({ tenantId: actor.tenantId, userId: actor.userId, scope, profiles: [base()] }, 100);
    expect(store.read(token, scope, actor, 101)).toHaveLength(1);
    expect(() => store.read(token, scope, { ...actor, tenantId: 'other' }, 101)).toThrow();
    expect(() => store.read(token, scope, { ...actor, userId: 'other' }, 101)).toThrow();
    expect(() => store.read(token, { ...scope, brandId: 'other' }, actor, 101)).toThrow();
    expect(() => store.read(token, scope, actor, 900_101)).toThrow();
    for (let i = 0; i < 20; i++) store.put({ tenantId: actor.tenantId, userId: actor.userId, scope, profiles: [] }, 101);
    expect(() => store.read(token, scope, actor, 102)).toThrow();
  });

  it('reads merged horizontal model cells and commits only the server preview', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('F Serisi');
    sheet.addRow(['', '', '', 'Model', 'F3015', 'F4015']);
    sheet.addRow(['', '', '', 'Modelin desteklediği güç', '1.5-20kW', '1.5-20kW']);
    sheet.addRow(['', '', '', 'Çalışma alanı', '3050*1530mm', '4050*1530mm']);
    sheet.addRow(['', '', '', 'Toplam ağırlık', '≤6kW:2150kg\n12-20kW:3150kg', '']);
    sheet.mergeCells('E4:F4');
    const profiles = { assertScope: vi.fn().mockResolvedValue(undefined), importProfiles: vi.fn().mockResolvedValue({ ok: true, imported: 1 }) };
    const service = new TechnicalImportService({} as never, audit as never, profiles as never);
    const preview = await service.preview({ ...scope, mode: 'laser_profiles', fileName: 'f.xlsx', productTypeCode: selection.productTypeCode, fileBase64: Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'), availableFields: [] }, actor);
    expect(preview.laserProfiles).toHaveLength(20);
    const model = preview.laserProfiles!.find((profile) => profile.selection.sourceModelCode === 'F4015' && profile.selection.powerKw === 6 && profile.selection.cabinType === 'open')!;
    expect(model.specs.find((field) => field.key === 'Makine Ağırlığı')).toMatchObject({ value: '2150', source: { cell: 'E4' } });
    expect(model.specs.find((field) => field.key === 'Kontrol Ünitesi')?.value).toBeTruthy();
    expect(model.specs.find((field) => field.key === 'Kontrol Ünitesi')?.source?.sheet).toBe(base().specs.find((field) => field.key === 'Kontrol Ünitesi')?.source?.sheet);
    expect(model.specs.find((field) => field.key === 'Tabla Yük Kapasitesi')).toBeUndefined();
    const forged = structuredClone(model);
    forged.specs.find((field) => field.key === 'Makine Ağırlığı')!.value = '99999';
    await service.commit({ ...scope, mode: 'laser_profiles', productTypeCode: selection.productTypeCode, importToken: preview.importToken!, laserProfiles: [forged], rows: [], confirmedTarget: false }, actor);
    expect(profiles.importProfiles.mock.calls[0][1][0].specs.find((field: { key: string }) => field.key === 'Makine Ağırlığı').value).toBe('2150');
  });
});

describe('laser profile persistence scope', () => {
  function fixture() {
    let stored: { id: string; configuration: LaserTechnicalConfiguration } | undefined;
    const filters: unknown[][] = [];
    const inserts = vi.fn((values) => { stored = { id: '10000000-0000-4000-8000-000000000005', configuration: values.configuration }; return Promise.resolve(); });
    const db = {
      query: {
        divisions: { findFirst: vi.fn().mockResolvedValue({ code: 'sac_isleme' }) },
        brands: { findFirst: vi.fn().mockResolvedValue({ name: 'AORE', divisionId: scope.divisionId }) },
        laserTechnicalProfiles: { findFirst: vi.fn(({ where }) => { filters.push(new PgDialect().sqlToQuery(where).params); return Promise.resolve(stored); }) },
      },
      execute: vi.fn().mockResolvedValue([]),
      insert: () => ({ values: inserts }),
      update: () => ({ set: (values: { configuration: LaserTechnicalConfiguration }) => ({ where: () => { stored!.configuration = values.configuration; return Promise.resolve(); } }) }),
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db),
    };
    return { db, filters, inserts, stored: () => stored };
  }

  it('repeated imports update one scoped combination and preserve manual fields', async () => {
    const test = fixture();
    const service = new LaserProfilesService(test.db as never, audit as never);
    expect(await service.importProfiles(scope, [base()], actor)).toMatchObject({ created: 1, updated: 0 });
    test.stored()!.configuration = applyLaserSpecEdits(base(), [{ key: 'Makine Ağırlığı', value: '2222', unit: 'kg' }]);
    expect(await service.importProfiles(scope, [base()], actor)).toMatchObject({ created: 0, updated: 1 });
    expect(test.inserts).toHaveBeenCalledTimes(1);
    expect(test.stored()!.configuration.specs.find((field) => field.key === 'Makine Ağırlığı')?.value).toBe('2222');
    for (const filter of test.filters) expect(filter).toEqual(expect.arrayContaining([actor.tenantId, scope.divisionId, scope.brandId, selection.productTypeCode, 'F3015', 'open', 6]));
  });

  it('accepts HEXLASER, legacy AORE and an explicitly assigned catalog independently of brand ownership', async () => {
    for (const brand of [{ name: 'HEXLASER' }, { name: 'AORE' }, { name: 'Private Label', technicalCatalogCode: 'AORE_LASER' }]) {
      const test = fixture();
      test.db.query.brands.findFirst.mockResolvedValueOnce({ ...brand, divisionId: scope.divisionId });
      const service = new LaserProfilesService(test.db as never, audit as never);
      await expect(service.resolve(scope, selection, actor)).resolves.toMatchObject({ selection });
    }
  });

  it('rejects non-admin writes, wrong brand, inactive or non-sheet divisions', async () => {
    const test = fixture();
    const service = new LaserProfilesService(test.db as never, audit as never);
    await expect(service.save(scope, selection, [], { ...actor, roles: [] })).rejects.toThrow();
    test.db.query.brands.findFirst.mockResolvedValueOnce({ name: 'Other', divisionId: scope.divisionId });
    await expect(service.resolve(scope, selection, actor)).rejects.toThrow('AORE');
    test.db.query.divisions.findFirst.mockResolvedValueOnce({ code: 'cnc' });
    await expect(service.resolve(scope, selection, actor)).rejects.toThrow('Sac İşleme');
    expect(test.inserts).not.toHaveBeenCalled();
  });
});

describe('product details atomic replacement', () => {
  it('writes technical selection and both detail tables in the same locked transaction', async () => {
    const writes: unknown[] = [];
    const tx = { execute: vi.fn().mockResolvedValue([]), update: (table: unknown) => ({ set: (value: unknown) => ({ where: async () => { writes.push({ table, value }); } }) }), insert: vi.fn() };
    const db = { transaction: vi.fn(async (callback) => callback(tx)) };
    const service = new ProductsService(db as never, audit as never, {} as never);
    vi.spyOn(service, 'get').mockResolvedValue({ technicalConfiguration: null } as never);
    await service.replaceDetails('10000000-0000-4000-8000-000000000006', { technicalConfiguration: null, specs: [], equipment: [] }, actor);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(writes).toEqual([{ table: productSpecs, value: expect.objectContaining({ deletedAt: expect.any(Date) }) }, { table: productEquipmentItems, value: expect.objectContaining({ deletedAt: expect.any(Date) }) }, { table: productModels, value: { technicalConfiguration: null } }]);
  });

  it('leaves configuration untouched for a legacy non-laser request', async () => {
    const tables: unknown[] = [];
    const tx = { execute: vi.fn(), update: (table: unknown) => ({ set: () => ({ where: async () => { tables.push(table); } }) }) };
    const service = new ProductsService({ transaction: async (callback: (tx: unknown) => unknown) => callback(tx) } as never, audit as never, {} as never);
    vi.spyOn(service, 'get').mockResolvedValue({ technicalConfiguration: null } as never);
    await service.replaceDetails('product', { specs: [], equipment: [] }, actor);
    expect(tables).toEqual([productSpecs, productEquipmentItems]);
  });
});

describe('quote laser snapshots', () => {
  it('captures product configuration even when a legacy client sends no compatibility', () => {
    const product = base();
    const snapshot = quoteLaserSnapshot(undefined, product)!;
    expect(snapshot.technicalConfiguration).toEqual(product);
    expect(snapshot.technicalSpecs).toHaveLength(product.specs.length);
    product.specs.find((field) => field.key === 'Makine Ağırlığı')!.value = '9999';
    expect(snapshot.technicalConfiguration?.specs.find((field) => field.key === 'Makine Ağırlığı')?.value).toBe('2150');
  });

  it('retains an explicit historic snapshot after the live product profile changes', () => {
    const original = quoteLaserSnapshot(undefined, base())!;
    const current = base();
    current.specs.find((field) => field.key === 'Makine Ağırlığı')!.value = '9999';
    const saved = quoteLaserSnapshot(original, current)!;
    expect(saved).toEqual(original);
    expect(saved.technicalSpecs.find((field) => field.key === 'Makine Ağırlığı')?.value).toBe('2150');
  });

  it('keeps manual per-quote edits synchronized with the saved configuration', () => {
    const snapshot = quoteLaserSnapshot({ machineIds: [], brands: [], controlUnits: [], supplierIds: [], technicalSpecs: [{ key: 'Makine Ağırlığı', value: '2200', unit: 'kg' }] }, base())!;
    expect(snapshot.technicalConfiguration?.specs.find((field) => field.key === 'Makine Ağırlığı')).toMatchObject({ value: '2200', sourceValue: '2150', isManual: true });
    expect(snapshot.technicalSpecs.find((field) => field.key === 'Makine Ağırlığı')?.value).toBe('2200');
    expect(quoteLaserSnapshot(null, null)).toBeNull();
  });

  it('rejects an explicit quote snapshot whose power field disagrees with its selection', () => {
    const forged = quoteLaserSnapshot(undefined, base())!;
    forged.technicalConfiguration!.specs.find((field) => field.key === 'Lazer Gücü')!.value = '30';
    expect(() => quoteLaserSnapshot(forged, null)).toThrow('rezonatör gücü');
  });
});
