import { describe, expect, it } from 'vitest';
import { technicalImportCommitRequestSchema } from '@haksan/shared';
import {
  matchTechnicalField,
  normalizeTechnicalLabel,
  rowsToTechnicalRows,
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
