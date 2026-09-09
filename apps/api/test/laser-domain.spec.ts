import { describe, expect, it } from 'vitest';
import {
  LASER_MODELS, LASER_POWERS, LASER_SERIES, isSupportedLaserBrand, laserSelectionSchema, laserTechnicalConfigurationSchema,
  parseLaserWorkbookSheets, resolveLaserPowerRule, resolveLaserProfile,
  quoteItemCompatibilitySchema, productDetailsReplaceSchema,
  type LaserSelection,
} from '@haksan/shared';
import { AORE_WORKBOOK_SHEETS } from '../../../packages/shared/src/laser-source-data';

function profile(code: string, powerKw: LaserSelection['powerKw'], cabinType?: LaserSelection['cabinType']) {
  const model = LASER_MODELS.find((entry) => entry.code === code)!;
  return resolveLaserProfile({ sourceModelCode: code, powerKw, cabinType: cabinType ?? model.standardCabin ?? 'open', series: model.series, productTypeCode: model.productTypeCode });
}
function field(code: string, power: LaserSelection['powerKw'], key: string, cabin?: LaserSelection['cabinType']) {
  return profile(code, power, cabin).specs.find((spec) => spec.key === key);
}

describe('AORE source resolution', () => {
  it('offers every source model/cabin/power combination without creating products', () => {
    expect(LASER_MODELS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(LASER_MODELS.map((model) => model.code)).size).toBe(LASER_MODELS.length);
    expect(new Set(LASER_MODELS.map((model) => model.series))).toEqual(new Set(LASER_SERIES));
    for (const model of LASER_MODELS) for (const power of LASER_POWERS) for (const cabin of ['open', 'closed'] as const) {
      const result = profile(model.code, power, cabin);
      expect(laserTechnicalConfigurationSchema.safeParse(result).success).toBe(true);
      expect(result.modelLabel).toBe(model.code);
      expect(result.specs.find((spec) => spec.key === 'Lazer Gücü')?.value).toBe(String(power));
    }
  });

  it('changes F3015 mechanical and electrical fields independently at 6 and 12 kW', () => {
    for (const [key, six, twelve, unit] of [
      ['Tabla Yük Kapasitesi', '950', '1500', 'kg'],
      ['Makine Ağırlığı', '2150', '3150', 'kg'],
      ['Toplam Güç Gereksinimi', '35.9', '55.9', 'kW'],
      ['Trafo Kapasitesi', '50', '80', 'kVA'],
      ['Y Eksen Motor Gücü', '0.85*2', '1.8*2', 'kW'],
    ]) {
      expect(field('F3015', 6, key)).toMatchObject({ value: six, unit });
      expect(field('F3015', 12, key)).toMatchObject({ value: twelve, unit });
    }
    expect(field('F3015', 6, 'Kontrol Ünitesi')).toMatchObject({ value: 'FSCUT4000E', source: { sheet: 'Standart Yapılandırma' } });
    expect(field('F3015', 12, 'Kontrol Ünitesi')?.value).toBe('FSCUT8000');
  });

  it('keeps PG3015 power and transformer profiles separate at 1.5, 2 and 3 kW', () => {
    for (const [power, totalPower, transformer] of [
      [1.5, '17.5', '30'],
      [2, '18.2', '30'],
      [3, '25', '40'],
    ] as const) {
      expect(field('PG3015', power, 'Lazer Gücü')).toMatchObject({ value: String(power), unit: 'kW' });
      expect(field('PG3015', power, 'Toplam Güç Gereksinimi')).toMatchObject({ value: totalPower, unit: 'kW' });
      expect(field('PG3015', power, 'Trafo Kapasitesi')).toMatchObject({ value: transformer, unit: 'kVA' });
    }
  });

  it('uses PG6020 30 kW source cells and retains PG3015 source conflict', () => {
    expect(field('PG6020', 30, 'Tabla Yük Kapasitesi')?.value).toBe('5760');
    expect(field('PG6020', 30, 'Makine Ağırlığı')?.value).toBe('11600');
    expect(field('PG6020', 30, 'Toplam Güç Gereksinimi')).toMatchObject({ value: '155.8', unit: 'kW', source: { sheet: 'PG系列', cell: 'H34' } });
    expect(field('PG6020', 30, 'Trafo Kapasitesi')?.value).toBe('200');
    expect(profile('PG3015', 30).supportedPower).toBe(false);
    expect(profile('PG3015', 30).issues.some((issue) => issue.code === 'source_conflict')).toBe(true);
    expect(field('PG3015', 30, 'Toplam Güç Gereksinimi')?.value).toBe('');
  });

  it('does not fill unsupported TG power or undocumented cabin values', () => {
    for (const key of ['Makine Ağırlığı', 'Makine Ölçüleri', 'Toplam Güç Gereksinimi', 'Trafo Kapasitesi', 'Kontrol Ünitesi', 'Kesme Kafası', 'Y Eksen Motor Gücü']) {
      expect(field('TG6035', 30, key)?.value).toBe('');
    }
    for (const [code, cabin] of [['F3015', 'closed'], ['PG6020', 'open']] as const) {
      for (const key of ['Makine Ağırlığı', 'Makine Ölçüleri', 'Toplam Güç Gereksinimi', 'Trafo Kapasitesi']) {
        expect(field(code, 12, key, cabin)?.value).toBe('');
      }
      expect(field(code, 12, 'Kesme Alanı', cabin)?.value).not.toBe('');
    }
    const manual = profile('TG6035', 30);
    manual.specs.find((spec) => spec.key === 'Toplam Güç Gereksinimi')!.value = '180';
    expect(laserTechnicalConfigurationSchema.parse(manual).selection.powerKw).toBe(30);
  });

  it('preserves four PDF models, source dimensions and absent power conditions', () => {
    for (const code of ['F6520', 'F8025', 'PG8025', 'TG6016']) {
      expect(profile(code, 3).specs.some((spec) => spec.source?.page)).toBe(true);
    }
    expect(profile('F6520', 6).sizeLabel).toBe('6550 × 2030 mm');
    expect(profile('F6525', 6).sizeLabel).toBe('6550 × 2530 mm');
    expect(profile('F6020', 6).sizeLabel).toBe('6050 × 2030 mm');
    expect(field('PG6020', 3, 'Y Eksen Motor Gücü')?.value).toBe('');
    expect(field('F8025', 3, 'X Eksen Motor Gücü')?.value).toBe('');
    expect(field('TG6016', 3, 'Kontrol Ünitesi')?.value).toBe('');
    expect(field('TG6035', 6, 'B Eksen Motor Gücü')?.value).toBe('4.4+2.9');
  });

  it('keeps positioning units from the actual source and does not invent a resonator or cutting thickness', () => {
    expect(field('PG3015', 6, 'Konumlama Hassasiyeti')?.unit).toBe('mm/m');
    expect(field('F6520', 6, 'Konumlama Hassasiyeti')?.unit).toBe('mm');
    expect(field('F3015', 6, 'Rezonatör Markası')?.value).toBe('');
    expect(field('F3015', 6, 'Maks. Kesme Kalınlığı (Çelik)')?.value).toBe('');
  });

  it('handles power ranges and multiplicative motor ratings without treating ratings as conditions', () => {
    const raw = '≤6 kW: 950kg\n12–20 kW: 1500kg\n≥30 kW: 2000kg';
    expect(resolveLaserPowerRule(raw, 3)).toBe('950kg');
    expect(resolveLaserPowerRule(raw, 12)).toBe('1500kg');
    expect(resolveLaserPowerRule(raw, 30)).toBe('2000kg');
    expect(resolveLaserPowerRule(raw, 8)).toBeUndefined();
    expect(resolveLaserPowerRule('1.8kw+1.3kw', 3)).toBe('1.8kw+1.3kw');
    expect(resolveLaserPowerRule('0.85kw*2', 3)).toBe('0.85kw*2');
    expect(resolveLaserPowerRule('≤6kW 1.5KW\n≥8KW 1.5KW*2', 12)).toBe('1.5KW*2');
  });

  it('imports horizontal sheets once, including the duplicate standalone F sheet', () => {
    const f = AORE_WORKBOOK_SHEETS.find((sheet) => sheet.name === 'F系列')!;
    const result = parseLaserWorkbookSheets([...AORE_WORKBOOK_SHEETS, { ...f, name: 'F duplicate' }], 'uploaded.xlsx');
    expect(result.models).toHaveLength(88);
    expect(result.issues).toEqual([]);
    expect(result.models.find((m) => m.code === 'F3015')?.fields.find((f) => f.key === 'Kesme Alanı')?.source).toMatchObject({ document: 'uploaded.xlsx', sheet: 'F系列', cell: 'E4' });
  });

  it('reads merged values with the top-left cell as provenance and reports conflicting duplicates', () => {
    const sheet = { name: 'models', rows: [
      ['', '', '', 'Model', 'F3015', 'F4015'],
      ['', '', '', 'Çalışma alanı', '3050*1530mm', '4050*1530mm'],
      ['', '', '', 'Modelin desteklediği güç', '1.5-20kW', ''],
      ['', '', '', 'X ekseni motor gücü', '1.3kW', ''],
    ], merges: [
      { startRow: 3, endRow: 3, startColumn: 5, endColumn: 6 },
      { startRow: 4, endRow: 4, startColumn: 5, endColumn: 6 },
    ] };
    const result = parseLaserWorkbookSheets([sheet], 'merged.xlsx');
    expect(result.models[1].powerMax).toBe(20);
    expect(result.models[1].fields.find((f) => f.key === 'X Eksen Motor Gücü')).toMatchObject({ rawValue: '1.3kW', source: { cell: 'E4' } });
    const changed = structuredClone(sheet); changed.rows[3][4] = '2kW';
    expect(parseLaserWorkbookSheets([sheet, changed], 'merged.xlsx').issues[0].code).toBe('duplicate_model_conflict');
  });


  it('retains the original twenty models and every primary workbook cutting column', () => {
    const expected = ['F3015','F4015','F6015','F4020','F6020','F6025','F6520','F6525','F8025','PG3015','PG6015','PG4020','PG6020','PG6025','PG6525','PG8025','TG6012','TG6016','TG6020','TG6035'];
    expect(LASER_MODELS.map((model) => model.code)).toEqual(expect.arrayContaining(expected));
    const workbook = parseLaserWorkbookSheets(AORE_WORKBOOK_SHEETS, 'AORE Technical Parameters.xlsx');
    expect(workbook.models).toHaveLength(88);
    expect(new Set(workbook.models.map((model) => model.series)).size).toBe(16);
    expect(workbook.models.flatMap((model) => model.issues).filter((issue) => issue.code === 'unmapped_source_label')).toEqual([]);
    expect(field('F3015', 12, 'Makine Ağırlığı')?.source).toMatchObject({ document: 'AORE Technical Parameters.xlsx', sheet: 'F系列', cell: 'E12', rawValue: '≤6kw：2150kg\n12-20kw：3150kg' });
  });

  it('uses S power-specific dimensions and the Chinese-only transformer row', () => {
    expect(profile('S1530', 6).sizeLabel).toBe('3060 × 1530 mm');
    expect(profile('S1530', 12).sizeLabel).toBe('2960 × 1430 mm');
    expect(field('S1325', 12, 'Kesme Alanı')?.value).toBe('2460*1230');
    expect(field('S1530', 12, 'Toplam Güç Gereksinimi')).toMatchObject({ value: '56.7', source: { sheet: 'S系列', cell: 'E31' } });
    expect(field('S1530', 30, 'Kesme Alanı')?.value).toBe('');
  });

  it('separates GR and Pro branches and does not infer full cabin from a beam guard', () => {
    expect(field('GR2500-6', 12, 'Y Eksen Motor Gücü')?.value).toBe('4.4*2');
    expect(field('GR2500Pro-6', 12, 'Y Eksen Motor Gücü')?.value).toBe('5.5*2');
    expect(field('GR2500-6', 12, 'Kontrol Ünitesi')?.value).toBe('');
    expect(field('GR2500Pro-6', 12, 'Kontrol Ünitesi')?.value).toBe('FSCUT8000');
    expect(LASER_MODELS.find((model) => model.code === 'GR2500-6')?.standardCabin).toBeNull();
    expect(field('GR2500-6', 12, 'Toplam Güç Gereksinimi')?.value).toBe('');
    expect(field('GR2500-6', 12, 'Düz Kesim X Alanı')?.value).toBe('2550');
    expect(field('GR2500-6', 12, 'Opsiyonel Pah Düz Kesim X Alanı')?.value).toBe('2450');
    expect(field('GR2500-6', 12, '45° Pah Kesim X Alanı')?.value).toBe('1800');
  });

  it('retains compound models and option-specific capacities without copying fields between families', () => {
    expect(profile('F3015+T6-230', 6).selection.series).toBe('FT');
    expect(field('F3015+T6-230', 6, 'Kontrol Ünitesi')?.value).toBe('FSCUT3000DE-M');
    expect(field('F3015+T6-230', 6, 'Toplam Güç Gereksinimi')?.value).toBe('39.8');
    expect(field('TH6035', 12, 'Kontrol Ünitesi')?.value).toBe('FSCUT3000DE-G');
    expect(field('TA6035', 12, 'Kontrol Ünitesi')?.value).toBe('FSCUT5000BH');
    const te = LASER_MODELS.find((model) => model.code === 'TE12028')!;
    expect(te.fields.find((spec) => spec.key === 'Makine Ölçüleri (TE12035+E12)')?.source).toMatchObject({ sheet: 'TE系列', cell: 'E11', rawValue: '28650*2800*3100' });
    expect(te.fields.find((spec) => spec.key === 'Makine Ölçüleri (TE12035+E6)')?.rawValue).toBe('22450*2800*3100');
    expect(field('PB3015', 12, '45° Pah Kesim Alanı')?.value).toBe('3100*1550');
    expect(field('PB3015', 12, 'Düz Kesim Çalışma Alanı')?.value).toBe('3850*2200');
    expect(field('TZ12070', 30, 'Y Eksen Motor Gücü')?.value).toBe('');
  });

  it('accepts selling brand catalog association and legacy names independently of supplier identity', () => {
    expect(isSupportedLaserBrand('HEXLASER')).toBe(true);
    expect(isSupportedLaserBrand('AORE LAZER')).toBe(true);
    expect(isSupportedLaserBrand('Yeniden adlandırılan marka', 'AORE_LASER')).toBe(true);
    expect(isSupportedLaserBrand('AOREX')).toBe(false);
    expect(isSupportedLaserBrand('Başka marka')).toBe(false);
  });

  it('validates model, series, product type, power and complete snapshot roundtrips', () => {
    const config = profile('F3015', 6);
    expect(laserSelectionSchema.safeParse({ ...config.selection, series: 'PG' }).success).toBe(false);
    expect(laserSelectionSchema.safeParse({ ...config.selection, productTypeCode: 'BORU_LAZER_KESIM' }).success).toBe(false);
    expect(laserSelectionSchema.safeParse({ ...config.selection, powerKw: 40 }).success).toBe(false);
    const quote = quoteItemCompatibilitySchema.parse({ technicalConfiguration: config, technicalSpecs: config.specs });
    expect(quote.technicalConfiguration).toEqual(config);
    expect(quote.technicalSpecs.find((s) => s.key === 'Rezonatör Markası')?.value).toBe('');
    expect(productDetailsReplaceSchema.parse({ technicalConfiguration: config }).technicalConfiguration).toEqual(config);
  });
});
