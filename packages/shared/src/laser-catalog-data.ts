import type { LaserCatalogModel, LaserSourceField, LaserSeries } from './laser';

const DOCUMENT = 'HAKSAN MAKİNA - FİBER LAZER TEKNOLOJİLERİ DİJİTAL ÜRÜN KATALOĞU - 2025';
type Field = [key: string, rawValue: string, unit?: string];
const field = ([key, rawValue, unit]: Field, page: number): LaserSourceField => ({
  key, rawValue, unit,
  groupCode: key.includes('Motor') ? 'MOTORLAR' : key.includes('Tabla') ? 'TABLA' : key.includes('İvme') ? 'EKSENLER' : 'KESME',
  source: { document: DOCUMENT, page, rawValue },
});
const model = (series: LaserSeries, code: string, page: number, area: string, powerMin: number, powerMax: number, cabin: 'open' | 'closed' | null, fields: Field[]): LaserCatalogModel => ({
  code, series, productTypeCode: ['TG', 'TH', 'TS', 'TZ'].includes(series) ? 'BORU_LAZER_KESIM' : 'FIBER_LAZER_KESIM',
  sizeLabel: area, workingArea: ['TG', 'TH', 'TS', 'TZ'].includes(series) ? undefined : area,
  standardCabin: cabin, powerMin, powerMax,
  fields: [['Desteklenen Lazer Gücü', `${powerMin}–${powerMax}`, 'kW'] as Field, ...fields].map((value) => field(value, page)),
  issues: [],
});
const accuracy = (position: string, repeat: string, speed: string, acceleration: string): Field[] => [
  ['Konumlama Hassasiyeti', position, 'mm'], ['Tekrarlama Hassasiyeti', repeat, 'mm'],
  ['Maks. Eksen Hızı', speed, 'm/dk'], ['Maksimum İvme', acceleration, 'G'], ['Vidalı Mil', 'TBI'],
];
const motors = (x: string, y: string, z: string): Field[] => [
  ['X Eksen Motor Gücü', x, 'kW'], ['Y Eksen Motor Gücü', y, 'kW'], ['Z Eksen Motor Gücü', z, 'kW'],
];
const sheet = (area: string, table: string): Field[] => [['Kesme Alanı', area, 'mm'], ['Tabla Tipi', table]];

/** Catalog values are supplements only. The model-specific source workbook takes numeric precedence. */
export const LASER_PDF_MODELS: LaserCatalogModel[] = [
  ...[['H3015', '3060 × 1550', '4'], ['H4020', '4060 × 2050', '2,8'], ['H6020', '6060 × 2050', '2,8']].map(([code, area, acceleration]) =>
    model('H', code, 6, area, 6, 30, 'closed', [...sheet(area, 'Çift yataklı şase'), ...accuracy('0,03', '0,02', '200', acceleration), ...motors('2,0', '4,5 × 2', '0,75')])),
  ...[['PB3015', '3100 × 1550', '3850 × 2200'], ['PB6020', '6100 × 2050', '6850 × 2700'], ['PB8025', '8100 × 2550', '8850 × 3200']].map(([code, bevel, area]) =>
    model('PB', code, 7, area, 8, 40, 'closed', [...sheet(area, 'Çift tabla'), ['Eğimli Kesim Çalışma Alanı', bevel, 'mm'], ...accuracy('0,03', '0,02', '115', '1,2'), ...motors('1,3', '2,9 × 2', '0,75')])),
  ...(['PG', 'EG'] as const).flatMap((series) => [['3015', '3050 × 1530'], ['4020', '4050 × 2030'], ['6020', '6050 × 2030'], ['8025', '8050 × 2530']].map(([suffix, area]) =>
    model(series, `${series}${suffix}`, series === 'PG' ? 8 : 12, area, 1.5, 40, series === 'PG' ? 'closed' : 'open', [
      ...sheet(area, 'Değişimli çift tabla'), ...accuracy('0,03', '0,02', '120', '1,5'),
      ...motors(suffix === '3015' ? '0,85' : '1,3', suffix === '3015' ? '≤6 kW: 1,3 × 2; ≥8 kW: 1,8 × 2' : '6 kW: 1,8 × 2; ≥8 kW: 2,9 × 2', suffix === '3015' ? '≤6 kW: 0,4; ≥8 kW: 0,75' : '0,75'),
    ]))),
  ...[['F3015', '3050 × 1530'], ['F4020', '4050 × 2030'], ['F6020', '6050 × 2030'], ['F6520', '6550 × 2030'], ['F6025', '6050 × 2530'], ['F8025', '8050 × 2530']].map(([code, area]) => {
    const large = code === 'F8025';
    return model('F', code, 10, area, 1.5, 20, 'open', [...sheet(area, 'Tek tabla'), ...accuracy(large ? '0,03' : '0,05', large ? '0,02' : '0,03', large ? '150' : '115', large ? '1,5' : '0,8'), ...motors(
      large ? '6 kW: 0,85; >6 kW: 1,3' : '≤6 kW: 0,85; 8–20 kW: 1,3',
      large ? '6 kW: 1,8 × 2; >6 kW: 2,9 × 2' : '≤6 kW: 0,85 × 2; 8–20 kW: 1,8 × 2',
      large ? '6 kW: 0,4; >6 kW: 0,75' : '≤6 kW: 0,4; 8–20 kW: 0,75')]);
  }),
  ...[['FB3015', '3100 × 1550', '3850 × 2200'], ['FB6020', '6100 × 2050', '6850 × 2700']].map(([code, bevel, area]) =>
    model('FB', code, 13, area, 6, 40, 'open', [...sheet(area, 'Tek tabla'), ['45° Eğimli Kesim Çalışma Alanı', bevel, 'mm'], ...accuracy('0,03', '0,02', '115', '1,2'), ...motors('1,3', '2,9 × 2', '0,75')])),
  ...[['S1530', '1,5–8 kW: 3060 × 1530; 12 kW: 2960 × 1430'], ['S1325', '1,5–8 kW: 2560 × 1330; 12 kW: 2460 × 1230'], ['S1313', '1330 × 1350'], ['S1309', '1330 × 950'], ['S1510', '1530 × 1050'], ['S0604', '650 × 450']].map(([code, area], index) =>
    model('S', code, 14, area, 1.5, index < 2 ? 12 : 6, 'closed', [...sheet(area, 'Tek tabla'), ...accuracy('0,03', '0,02', index < 2 ? '115' : '60', index < 2 ? '0,8' : '0,6').filter(([key]) => key !== 'Vidalı Mil'), ['Vidalı Mil', 'TBI/PMI'], ...motors(index < 2 ? '≤6 kW: 0,85; 8–12 kW: 1,3' : '0,75', index < 2 ? '≤6 kW: 1,3 × 2; 8–12 kW: 1,8 × 2' : '0,75 × 2', index < 2 ? '≤6 kW: 0,4; 8–12 kW: 0,75' : '0,4')])),
  // Katalog GR etiketleri “GR” önekini yazmaz (“2500-6”, “2500pro-12”); X genişlikleri ve uzunluk
  // kodları Excel GR sayfasıyla birebir örtüştüğü için Excel kodlarına bağlandı. Y ölçüleri iki belgede
  // 400 mm farklı; birleştirme bunu source_comparison olarak kaydeder, Excel değeri esas kalır.
  ...[
    ['GR2500-6', '6100 × 2550', '5700 × 2450', '5350 × 1750'], ['GR3200-6', '6100 × 3250', '5700 × 3150', '5350 × 2450'],
    ['GR2500-8', '8100 × 2550', '7700 × 2450', '7350 × 1750'], ['GR3200-8', '8100 × 3250', '7700 × 3150', '7350 × 2450'],
    ['GR2500-12', '12100 × 2550', '11700 × 2450', '11350 × 1750'], ['GR3200-12', '12100 × 3250', '11700 × 3150', '11350 × 2450'],
    ['GR2500Pro-12', '12100 × 2550', '11700 × 2450', '11350 × 1750'], ['GR3200Pro-12', '12100 × 3250', '11700 × 3150', '11350 × 2450'],
  ].map(([code, area, conical, bevel]) => model('GR', code, 15, area, 6, 60, null, [
    ...sheet(area, 'Zemin raylı, bağımsız modüler tabla'), ['Konik Düz Kesim Alanı', conical, 'mm'], ['Konik 45° Kesim Alanı', bevel, 'mm'],
    // Excel, standart ve Pro modelleri tek sütunda birleştirdiği için Y motorunu ayıramıyor; katalog ayırıyor.
    ...accuracy('0,1', '0,05', '80', '0,8'), ...motors('1,8', /pro/i.test(code) ? '5,5 × 2' : '4,4 × 2', '0,75'),
  ])),
  ...(['TG', 'TH'] as const).flatMap((series) => [
    ['6012', '10', '120', '200', '1,5', '1,8', '1,8 + 1,3'],
    ['6016', '15', '160', '120', '1,5', '2,9', '2,9 + 1,8'],
    ['6020', '15', '230', '120', '1,5', '2,9', '2,9 + 1,8'],
    ['6035', '15', '350', '80', '0,8', series === 'TG' ? '2,9' : '4,4', series === 'TG' ? '2,9 + 2,9' : '4,4 + 2,9'],
  ].map(([suffix, minimum, maximum, speed, acceleration, yMotor, bMotor], index) => model(series, `${series}${suffix}`, series === 'TG' ? 18 : 19, `6300 mm · Ø${minimum}–${maximum} mm`, index === 3 ? 3 : 1.5, index < 2 ? 3 : index === 2 ? 6 : 12, series === 'TG' ? 'closed' : null, [
    ['Maksimum Boru İşleme Uzunluğu', '6300', 'mm'], ['Yuvarlak Boru Çapı', `Ø${minimum}–Ø${maximum}`, 'mm'],
    ['Kare Boru Kenar Uzunluğu', `${minimum} × ${minimum} – ${maximum} × ${maximum}`, 'mm'], ['Maksimum Ayna Dönüş Hızı', speed, 'dev/dk'], ['Maksimum İvme', acceleration, 'G'],
    ...motors('0,75', yMotor, '0,75'), ['B Eksen Motor Gücü', bMotor, 'kW'], ['Vidalı Mil', 'TBI'],
  ]))),
  model('TS', 'TS6020', 20, '6300 mm · Ø15–230 mm', 3, 12, null, [
    ['Maksimum Boru İşleme Uzunluğu', '6300', 'mm'], ['Yuvarlak Boru Çapı', 'Ø15–Ø230', 'mm'], ['Kare Boru Kenar Uzunluğu', '15 × 15 – 230 × 230', 'mm'], ['Maksimum Ayna Dönüş Hızı', '120', 'dev/dk'], ['Maksimum İvme', '1,5', 'G'], ...motors('0,75', '2,9 × 3', '0,75'), ['B Eksen Motor Gücü', '2,9 × 2 + 1,8 × 1', 'kW'], ['Vidalı Mil', 'TBI'], ['Ayna Sayısı', '3'],
  ]),
  // Katalog TS sayfasındaki ikinci modeli “TG-12035” diye basmış; ölçü, ayna hızı, ivme ve X/Z/B motorları
  // Excel TS12035 ile birebir aynı, TG sayfasında böyle bir model yok. Dizgi hatası kabul edilip TS'e bağlandı.
  model('TS', 'TS12035', 20, '12500 mm · Ø15–350 mm', 3, 12, null, [
    ['Maksimum Boru İşleme Uzunluğu', '12500', 'mm'], ['Yuvarlak Boru Çapı', 'Ø15–Ø350', 'mm'], ['Kare Boru Kenar Uzunluğu', '15 × 15 – 350 × 350', 'mm'], ['Maksimum Ayna Dönüş Hızı', '80', 'dev/dk'], ['Maksimum İvme', '0,8', 'G'], ...motors('0,75', '4,4 × 3', '0,75'), ['B Eksen Motor Gücü', '5,5 × 2 + 4,4 × 1', 'kW'], ['Vidalı Mil', 'TBI'], ['Ayna Sayısı', '3'],
  ]),
  model('TZ', 'TZ12055', 21, '12500 mm · Ø30–550 mm', 3, 12, null, [
    ['Maksimum Boru İşleme Uzunluğu', '12500', 'mm'], ['Yuvarlak Boru Çapı', 'Ø30–Ø550', 'mm'], ['Kare Boru Kenar Uzunluğu', '30 × 30 – 550 × 550', 'mm'], ['Maksimum Ayna Dönüş Hızı', '50', 'dev/dk'], ['Maksimum İvme', '0,3', 'G'], ...motors('1,0', '5,5 × 4', '1,0'), ['B Eksen Motor Gücü', '5,5 × 4', 'kW'], ['Vidalı Mil', 'TBI'], ['Ayna Sayısı', '4'],
  ]),
  // Katalog FT-3015'in üç eksen motor değeri Excel FT sayfasındaki F3015+T6-230 ile birebir aynı: aynı makine,
  // kısa kod. EGT ise PGT ile aynı motorları taşısa da açık kabin/tek tabla olduğu için (EG–PG ayrımı gibi)
  // ayrı ürün kaydı kalır.
  ...(['FT', 'EGT'] as const).flatMap((series) => [['3015', '3050 × 1530'], ['4020', '4050 × 2030'], ['6015', '6050 × 1530'], ['6020', '6050 × 2030']].map(([suffix, area]) => model(series, series === 'FT' ? `F${suffix}+T6-230` : `EGT${suffix}`, series === 'FT' ? 22 : 23, area, 1.5, 12, 'open', [
    ...sheet(area, 'Tek tabla'), ['Boru Kesim Hattı', '6000', 'mm'], ...accuracy('0,05', '0,03', '115', '0,8'),
    ...motors(series === 'FT' ? '≤6 kW: 0,85; 8–12 kW: 1,3' : suffix === '3015' ? '0,85' : '1,3',
      series === 'FT' ? '≤6 kW: 0,85 × 2; 8–12 kW: 1,8 × 2' : suffix === '3015' ? '≤6 kW: 1,3 × 2; ≥8 kW: 1,8 × 2' : '6 kW: 1,8 × 2; ≥8 kW: 2,9 × 2',
      series === 'FT' ? '≤6 kW: 0,4; 8–12 kW: 0,75' : suffix === '3015' ? '≤6 kW: 0,4; ≥8 kW: 0,75' : '0,75'),
  ]))),
];
