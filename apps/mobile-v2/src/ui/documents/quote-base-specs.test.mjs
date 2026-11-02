import assert from 'node:assert/strict';
import test from 'node:test';
import { HEX2026_REVISION } from '@haksan/shared';
import {
  APPLY_FAILED_NOTICE,
  MANUAL_SPECS_NOTICE,
  applyResolvedLaserProfile,
  baseModelOptionSpecs,
  hexConfigurationQuoteSpecs,
  laserBaseQuoteContext,
  planBaseOptionSpecs,
  sacIslemeDivisionId,
} from './quote-base-specs.ts';

const pick = (optionSetId, optionValueId) => ({ optionSetId, optionValueId, name: optionSetId, value: optionValueId, priceDelta: 0, currencyCode: 'USD' });

test('baseModelOptionSpecs: sabit alanlar korunur, değişkenler tek kaynak konfigürasyondan', () => {
  const base = {
    kind: 'universal', baseModelCode: 'B', sourceModelCodes: ['A1', 'A2'], variableSpecKeys: ['X ekseni'], sourceRevision: 'r',
    configurations: [
      { sourceModelCode: 'A1', sourceProductId: '00000000-0000-4000-8000-000000000001', specs: [{ key: 'X ekseni', value: '1000', unit: 'mm' }, { key: 'Ağırlık', value: '9', unit: 't' }] },
      { sourceModelCode: 'A2', sourceProductId: '00000000-0000-4000-8000-000000000002', specs: [{ key: 'X ekseni', value: '2000', unit: 'mm' }] },
    ],
  };
  const sets = [{ id: 's', name: 'Ölçü', values: [{ id: 'a1', value: '1000', sourceModelCode: 'A1' }, { id: 'a2', value: '2000', sourceModelCode: 'A2' }, { id: 'zz', value: '?', sourceModelCode: 'ZZ' }] }];
  const fixed = [{ key: 'Kontrol', value: 'Fanuc' }, { key: 'X ekseni', value: 'eski', unit: 'mm' }];
  assert.deepEqual(baseModelOptionSpecs(base, sets, [pick('s', 'a2')], fixed), [{ key: 'Kontrol', value: 'Fanuc' }, { key: 'X ekseni', value: '2000 mm' }]);
  assert.deepEqual(baseModelOptionSpecs(base, sets, [], fixed), [{ key: 'Kontrol', value: 'Fanuc' }]);
  assert.throws(() => baseModelOptionSpecs(base, [...sets, { id: 't', name: 'B', values: [{ id: 'b', value: 'b', sourceModelCode: 'A1' }] }], [pick('s', 'a2'), pick('t', 'b')], fixed), /farklı makine/);
  assert.throws(() => baseModelOptionSpecs(base, sets, [pick('s', 'zz')], fixed), /doğrulanamadı/);
});

test('hexConfigurationQuoteSpecs: doğrulanmış alanlar, güce bağlı satır seçilen güce indirgenir', () => {
  const configuration = { fields: [
    { key: 'Lazer Gücü', rawValue: '6-30 kW', verification: 'verified' },
    { key: 'Çalışma Alanı', rawValue: '3060x1550', verification: 'verified' },
    { key: 'Kesme Kafası', rawValue: '6 kW: BM111\n12 kW: BM115', verification: 'aore_excel' },
    { key: 'Trafo', rawValue: '3 kW: 10 kVA', verification: 'verified' },
    { key: 'Taslak', rawValue: 'x', verification: 'needs_review' },
  ] };
  assert.deepEqual(hexConfigurationQuoteSpecs(configuration, 12), [
    { key: 'Çalışma Alanı', value: '3060x1550' },
    { key: 'Kesme Kafası', value: 'BM115' },
    { key: 'Lazer Gücü', value: '12 kW' },
  ]);
  assert.deepEqual(hexConfigurationQuoteSpecs(configuration, 1.5).at(-1), { key: 'Lazer Gücü', value: '1,5 kW' });
  assert.deepEqual(hexConfigurationQuoteSpecs(configuration).map((spec) => spec.key), ['Çalışma Alanı', 'Kesme Kafası', 'Trafo']);
});

const hexBase = { sourceRevision: HEX2026_REVISION, familyCode: 'H', series: 'H', productTypeCode: 'FIBER_LAZER_KESIM', sourceModelCodes: ['H-3015', 'H-4020'] };
const laserSets = [
  { id: 'table', name: 'Tabla', configurationKind: 'table', values: [{ id: 't', value: '3015', sourceModelCode: 'H-3015' }, { id: 'bad', value: '?', sourceModelCode: 'H-9999' }] },
  { id: 'power', name: 'Güç', configurationKind: 'power', values: [{ id: 'p', value: '12 kW', powerKw: '12' }] },
];

test('laserBaseQuoteContext: HEX 2026 standart kabini ve kaynak model eşleşmesi', () => {
  const context = laserBaseQuoteContext(hexBase, laserSets, [pick('table', 't'), pick('power', 'p')]);
  assert.equal(context.cabinType, 'closed'); // kabin grubu yok → seri standardı
  assert.equal(context.configuration.sourceModelCode, 'H-3015');
  assert.throws(() => laserBaseQuoteContext(hexBase, laserSets, [pick('table', 'bad')]), /HEX 2026/);
  const withCabin = [...laserSets, { id: 'cabin', name: 'Kabin', configurationKind: 'cabin', values: [{ id: 'o', value: 'Açık', cabinType: 'open' }] }];
  assert.equal(laserBaseQuoteContext(hexBase, withCabin, [pick('table', 't')]).cabinType, null);
  assert.equal(laserBaseQuoteContext(hexBase, withCabin, [pick('cabin', 'o')]).cabinType, 'open');
});

test('planBaseOptionSpecs: model + güç + kabin tamsa profil çözümü istenir', () => {
  const plan = planBaseOptionSpecs({ laserBase: hexBase, brandId: 'brand', sets: laserSets, selected: [pick('table', 't'), pick('power', 'p')], hasMatrix: true });
  assert.deepEqual(plan, {
    kind: 'resolve',
    selection: { productTypeCode: 'FIBER_LAZER_KESIM', series: 'H', sourceRevision: HEX2026_REVISION, sourceModelCode: 'H-3015', powerKw: 12, cabinType: 'closed' },
  });
});

test('planBaseOptionSpecs: eksik seçimde HEX alanları + elle tamamlama uyarısı; matrisli kartta seçim listesi basılmaz', () => {
  const partial = [pick('table', 't')];
  const noBrand = planBaseOptionSpecs({ laserBase: hexBase, brandId: null, sets: laserSets, selected: partial, hasMatrix: true });
  assert.equal(noBrand.kind, 'specs');
  assert.equal(noBrand.notice, MANUAL_SPECS_NOTICE);
  assert.ok(noBrand.technicalSpecs.some((spec) => spec.key.startsWith('Çalışma Alanı')));
  assert.ok(!noBrand.technicalSpecs.some((spec) => spec.key === 'Tabla'));
  const noMatrix = planBaseOptionSpecs({ laserBase: hexBase, brandId: null, sets: laserSets, selected: partial, hasMatrix: false });
  assert.deepEqual(noMatrix.technicalSpecs[0], { key: 'Tabla', value: '3015' });
  // HEX dışı lazer baz kart: yalnız seçim listesi
  const plain = planBaseOptionSpecs({ laserBase: { ...hexBase, sourceRevision: undefined }, brandId: null, sets: laserSets, selected: partial, hasMatrix: true });
  assert.deepEqual(plain, { kind: 'specs', technicalSpecs: [{ key: 'Tabla', value: '3015' }], notice: MANUAL_SPECS_NOTICE });
  assert.equal(planBaseOptionSpecs({ laserBase: hexBase, brandId: null, sets: laserSets, selected: [], hasMatrix: true }).notice, undefined);
});

test('planBaseOptionSpecs: baz kart olmayan ürün teknik bilgiye dokunmaz; hatalı seçim fırlatır', () => {
  assert.deepEqual(planBaseOptionSpecs({ sets: laserSets, selected: [pick('table', 't')], hasMatrix: false }), { kind: 'unchanged' });
  assert.throws(() => planBaseOptionSpecs({ laserBase: hexBase, sets: laserSets, selected: [pick('table', 'bad')], hasMatrix: false }));
  assert.match(APPLY_FAILED_NOTICE, /^Seçenekler uygulanamadı/);
});

test('applyResolvedLaserProfile + Sac İşleme bölümü', () => {
  const resolved = { specs: [{ key: ' Ağırlık ', value: ' 9 ', unit: ' t ' }, { key: ' ', value: 'x' }, { key: 'Güç', value: '12', unit: '' }] };
  assert.deepEqual(applyResolvedLaserProfile(resolved), {
    technicalConfiguration: resolved,
    technicalSpecs: [{ key: 'Ağırlık', value: '9', unit: 't' }, { key: 'Güç', value: '12', unit: undefined }],
  });
  assert.equal(sacIslemeDivisionId([{ id: 'c', code: 'cnc' }, { id: 's', code: 'SAC_ISLEME' }]), 's');
  assert.equal(sacIslemeDivisionId(undefined), null);
});
