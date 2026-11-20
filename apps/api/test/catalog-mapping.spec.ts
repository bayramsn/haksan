import { describe, expect, it } from 'vitest';
import { matchSourceCard, resolveMatch, type ExistingProduct } from '../src/db/catalog-matching';
import { canonicalSpecs, specTemplateFor } from '../src/db/haksan-spec-templates';
import { templateFieldsFor } from '../src/db/import-haksanmakina-catalog';

const row = (modelCode: string, brand: string, division: string | null = 'CNC'): ExistingProduct =>
  ({ id: modelCode, modelCode, modelName: modelCode, brand, division });
const existing = [row('MT-208/500', 'ECOCA'), row('MT-412/750', 'ECOCA'), row('MT-412/1000', 'ECOCA'),
  row('HM-711', 'LK Machinery'), row('GIY-3000', 'BAYKAL', 'SAC_ISLEME'), row('GIY-3000/6', 'BAYKAL', 'SAC_ISLEME')];

describe('catalog matching', () => {
  it('links by source id first, then by exact model within the same brand', () => {
    expect(matchSourceCard({ sourceId: '711', brand: 'LK MACHINERY', model: 'MV-650' }, existing)).toMatchObject({ status: 'source' });
    expect(matchSourceCard({ sourceId: '1', brand: 'Ecoca', model: 'MT-208/500' }, existing)).toMatchObject({ status: 'model', existing: { modelCode: 'MT-208/500' } });
    expect(matchSourceCard({ sourceId: '2', brand: 'OTHER', model: 'MT-208/500' }, existing)).toEqual({ status: 'none' });
  });
  it('sees the model inside a dotted CRM code and keeps it out of automatic merges', () => {
    const lk = [row('LK.VC-760EZ.12K.DDS.M', 'LK MACHINERY')];
    const match = matchSourceCard({ sourceId: '9', brand: 'LK Machinery', model: 'VC-760 EZ' }, lk);
    expect(match).toMatchObject({ status: 'possible' });
    expect(resolveMatch(match, 'CNC')).toMatchObject({ action: 'blocked' });
  });
  it('never merges a near match: CNC is protected, other divisions block until decided', () => {
    const near = matchSourceCard({ sourceId: '3', brand: 'ECOCA', model: 'MT-412 / MT-412 MC' }, existing);
    expect(near).toMatchObject({ status: 'possible' });
    expect(resolveMatch(near, 'CNC')).toMatchObject({ action: 'blocked' });
    const sac = matchSourceCard({ sourceId: '4', brand: 'BAYKAL', model: 'GIY-3000/6 ' }, existing);
    expect(resolveMatch(matchSourceCard({ sourceId: '5', brand: 'BAYKAL', model: 'GIY' }, existing), 'SAC_ISLEME')).toMatchObject({ action: 'blocked' });
    expect(resolveMatch(sac, 'SAC_ISLEME')).toMatchObject({ action: 'link' });
    expect(resolveMatch(near, 'CNC', 'new')).toEqual({ action: 'create' });
    expect(resolveMatch(near, 'CNC', { modelCode: 'MT-412/750' }, existing)).toMatchObject({ action: 'link', existing: { modelCode: 'MT-412/750' } });
  });
});

describe('Haksan technical templates', () => {
  it('maps scraped spellings to one grouped field and strips the fixed unit', () => {
    const specs = canonicalSpecs('ABKANT_PRES', [
      { key: 'UZUNLUK', value: '1250 MM', unit: '' }, { key: 'BASINÇ', value: '40 TON', unit: '' },
      { key: 'TEKNİK BİLGİLER', value: 'Birim', unit: '' }, { key: 'Motor Gücü', value: '1.5 HP', unit: '' },
      { key: 'APHS PRO', value: 'Geliştirilmiş ergonomi', unit: '' },
    ]);
    expect(specs.map(s => [s.key, s.value, s.unit, s.group, s.layout])).toEqual([
      ['Bükme Uzunluğu', '1250', 'mm', 'BUKME', false], ['Bükme Kuvveti', '40', 'ton', 'BUKME', false],
      ['TEKNİK BİLGİLER', 'Birim', '', 'GENEL', true], ['Motor Gücü', '1.5 HP', '', 'MOTORLAR', false],
      ['APHS PRO', 'Geliştirilmiş ergonomi', '', 'GENEL', false],
    ]);
  });
  it('writes no template for laser types and keeps CNC types out of the definitions', () => {
    expect(templateFieldsFor('fiber_lazer_kesim')).toEqual([]);
    expect(specTemplateFor('CNC_DIK_ISLEME_MERKEZI')).toBeUndefined();
    expect(templateFieldsFor('HM_UNIVERSAL_UNIVERSAL_TORNA_TEZGAHLARI').length).toBeLessThan(40);
  });
  it.each([
    ['HM_SAC_ISLEME_EKSANTRIK_PRESLER', 'Strok Sayısı', 'Vuruş Sayısı'],
    ['ABKANT_PRES', 'Arka Dayama Hızı', 'Arka Dayama Hızı'],
    ['HM_UNIVERSAL_SERIT_TESTERE_TEZGAHLARI_MAFSALLI', 'Kesim Açısı 0-45°', 'Kesim Açısı'],
    ['HM_UNIVERSAL_SUTUNLU_MATKAP_TEZGAHLARI', 'Alt Tabla Ölçüsü', 'Alt Tabla Ölçüsü'],
    ['HM_UNIVERSAL_UNIVERSAL_TORNA_TEZGAHLARI', 'Paket Ağırlığı', 'Paket Ağırlığı'],
    ['HM_UNIVERSAL_KALIPCI_FREZE_TEZGAHLARI', 'İş Parçası Ağırlığı', 'İş Parçası Ağırlığı'],
    ['HM_HAVA_PISTONLU_HAVA_KOMPRESORLERI', 'Depo Basıncı', 'Çalışma Basıncı'],
  ])('%s: "%s" lands on %s, not a look-alike field', (type, key, expected) => {
    expect(canonicalSpecs(type, [{ key, value: '1', unit: '' }])[0]!.key).toBe(expected);
  });
});
