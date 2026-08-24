import { describe, expect, it } from 'vitest';
import { technicalImportCommitRequestSchema, technicalImportPreviewRequestSchema } from '@haksan/shared';
import {
  extractTechnicalSourceNames,
  matchTechnicalField,
  normalizeTechnicalLabel,
  prepareTechnicalImportRow,
  rowsToTechnicalRows,
  sameProductTypeCode,
} from '../src/modules/admin/technical-import.service';

describe('technical import', () => {
  it('normalizes Turkish technical labels deterministically', () => {
    expect(normalizeTechnicalLabel('  Fener Mili Ölçüsü / Devri ')).toBe('fener mili olcusu devri');
  });

  it('reads vertical technical sheets and carries merged section labels forward', () => {
    const rows = rowsToTechnicalRows(
      [
        ['Bölüm', 'Teknik Bilgi', 'Değer', 'Birim'],
        ['TABLA', 'Tablo Ölçüsü', '850 × 600', 'mm'],
        ['', 'Tablo Yükleme Kapasitesi', '500', 'kg'],
        ['EKSENLER', 'X Ekseni Hareketi', '650', 'mm'],
      ],
      'VM-2'
    );

    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ section: 'TABLA', sourceKey: 'Tablo Yükleme Kapasitesi', sourceValue: '500', sourceUnit: 'kg' });
    expect(rows[2]).toMatchObject({ section: 'EKSENLER', sourceKey: 'X Ekseni Hareketi' });
  });

  it('reads the MT-415 style sheet as technical data and skips machine metadata rows', () => {
    const source = [
      ['', 'TEZGAH', 'MT-415/4000 MC Plus'],
      ['', 'ÜRÜN GRUBU', 'CNC YATAY TORNA'],
      ['', 'ÜRÜN TİPİ', 'C Axis Box Ways'],
      ['', 'MARKA', 'ECOCA'],
      ['', 'SERİ', 'MT-4 SERİSİ'],
      ['KAPASİTE', 'Ayna Ölçüsü', '15"'],
      ['', 'Maks. Tornalama Çapı', 'Ø 670 mm'],
      ['FENER MİLİ', 'Fener Mili Devri', '2.500 dv/dk'],
      ['EKSENLER', 'X Eksen Hareketi', '410 mm'],
    ];
    const rows = rowsToTechnicalRows(source, 'Sayfa1');

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.sourceKey)).not.toContain('ÜRÜN TİPİ');
    expect(rows[0]).toMatchObject({ section: 'KAPASİTE', sourceKey: 'Ayna Ölçüsü', sourceValue: '15', sourceUnit: '"' });
    expect(rows[1]).toMatchObject({ section: 'KAPASİTE', sourceValue: 'Ø 670', sourceUnit: 'mm' });
    expect(rows[2]).toMatchObject({ section: 'FENER MİLİ', sourceValue: '2.500', sourceUnit: 'dv/dk' });
    expect(extractTechnicalSourceNames(source)).toEqual([
      'MT-415/4000 MC Plus',
      'CNC YATAY TORNA',
      'C Axis Box Ways',
      'ECOCA',
      'MT-4 SERİSİ',
    ]);
  });

  it('offers unmatched Excel fields for explicit template import but not direct machine writes', () => {
    const [source] = rowsToTechnicalRows([['KAPASİTE', 'Yeni Teknik Alan', '125 mm']], 'Sayfa1');
    expect(prepareTechnicalImportRow(source, [], 'template_fields')).toMatchObject({
      targetKey: 'Yeni Teknik Alan',
      targetGroupCode: 'KAPASITE',
      targetUnit: 'mm',
      matchStatus: 'review',
      include: true,
    });
    expect(prepareTechnicalImportRow(source, [], 'machine_data')).toMatchObject({
      targetKey: '',
      matchStatus: 'unmatched',
      include: false,
    });
  });

  it('accepts the first Excel import for an empty CRM technical template', () => {
    const result = technicalImportPreviewRequestSchema.safeParse({
      fileName: 'ilk-teknik-foy.xlsx',
      fileBase64: 'UEs=',
      mode: 'template_fields',
      productTypeCode: 'CNC_YATAY_TORNA_TEZGAHI',
      availableFields: [],
    });
    expect(result.success).toBe(true);
  });

  it('treats legacy and canonical CNC lathe type codes as the same machine type', () => {
    expect(sameProductTypeCode('CNC_TORNA', 'CNC_YATAY_TORNA_TEZGAHI')).toBe(true);
    expect(sameProductTypeCode('CNC_DIK_TORNA_TEZGAHI', 'CNC_YATAY_TORNA_TEZGAHI')).toBe(false);
  });

  it('marks known English aliases for explicit user review', () => {
    const match = matchTechnicalField('Spindle Speed', [
      { key: 'Fener Mili Devri', groupCode: 'FENER_MILI', unit: 'dev/dk' },
    ]);
    expect(match.status).toBe('review');
    expect(match.field?.key).toBe('Fener Mili Devri');
  });

  it('requires a user-confirmed target for machine data commits', () => {
    const result = technicalImportCommitRequestSchema.safeParse({
      mode: 'machine_data',
      productTypeCode: 'CNC_DIK_ISLEME_MERKEZ',
      confirmedTarget: false,
      rows: [
        {
          rowNumber: 1,
          sheetName: 'VM-2',
          section: 'TABLA',
          sourceKey: 'Tablo Ölçüsü',
          sourceValue: '850 × 600',
          sourceUnit: 'mm',
          targetKey: 'Tablo Ölçüsü',
          targetGroupCode: 'TABLA',
          targetUnit: 'mm',
          matchStatus: 'exact',
          include: true,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
