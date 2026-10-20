import { z } from 'zod';
import { LASER_PDF_MODELS } from './laser-catalog-data';
import { HEX2026_REVISION, HEX2026_SERIES, findHex2026Configuration, hex2026PowerBounds, hex2026PowerBranch, hex2026ProductType } from './hexlaser-2026';
import { AORE_WORKBOOK_SHEETS, AORE_LABEL_ALIASES } from './laser-source-data';
import { AORE_LEGACY_WORKBOOK_SHEETS } from './laser-source-legacy-data';

export const LASER_POWERS = [1.5, 2, 3, 6, 12, 20, 30] as const;
export const LASER_SERIES = ['F', 'FT', 'S', 'FB', 'R', 'GR', 'PG', 'PGT', 'H', 'PB', 'TG', 'TH', 'TA', 'TS', 'TE', 'TZ', 'EG', 'EGT', 'T', 'CELL', 'HW', 'PU', 'V', 'M', 'TC'] as const;
export const LASER_TUBE_SERIES: readonly string[] = ['TG', 'TH', 'TA', 'TS', 'TE', 'TZ', 'T', 'V', 'M', 'TC'];
export const LASER_SOURCE_REVISION = 'aore-original-workbook-haksan-2025-v3';
export const laserSeriesSchema = z.enum(LASER_SERIES);
export const laserCabinTypeSchema = z.enum(['open', 'closed']);
export const laserPowerSchema = z.number().finite().positive().max(1000);
export const laserProductTypeSchema = z.enum(['FIBER_LAZER_KESIM', 'BORU_LAZER_KESIM', 'FIBER_LAZER_3D_KESIM', 'FIBER_LAZER_KAYNAK']);
export const laserSelectionSchema = z.object({
  sourceRevision: z.string().max(128).optional(),
  productTypeCode: laserProductTypeSchema,
  series: laserSeriesSchema,
  cabinType: laserCabinTypeSchema,
  powerKw: laserPowerSchema,
  sourceModelCode: z.string().trim().regex(/^[A-Z0-9][A-Za-z0-9+\/-]{1,63}$/).max(64),
}).superRefine((value, ctx) => {
  if (value.sourceRevision === HEX2026_REVISION) {
    const row = HEX2026_SERIES.find(row => row.series === value.series);
    if (!row || hex2026ProductType(row) !== value.productTypeCode || !findHex2026Configuration(value.series, value.sourceModelCode)) ctx.addIssue({ code: 'custom', message: 'HEX 2026 seri, model ve ürün tipi eşleşmiyor.' });
    return;
  }
  if (!(LASER_POWERS as readonly number[]).includes(value.powerKw)) ctx.addIssue({ code: 'custom', message: 'Eski kaynak revizyonunda güç seçeneği tanımlı değil.' });
  const modelPatterns: Partial<Record<typeof value.series, RegExp>> = {
    FT: /^(?:FT-?\d{4,5}|F\d{4,5}\+T\d+-\d+)$/,
    PGT: /^(?:PGT-?\d{4,5}|PG\d{4,5}\+T\d+-\d+)$/,
    GR: /^(?:GR)?\d{4}(?:Pro)?-\d{1,3}$/i,
    V: /^V\d{2}(?:Pro)?-\d{2,3}$/,
    M: /^M\d{2}-\d{2,3}-\d{2,3}$/,
    TC: /^TC\d{2}-\d{2,3}$/,
  };
  const modelPrefix = modelPatterns[value.series] ?? new RegExp(`^${value.series}-?\\d{4,5}$`);
  if (!modelPrefix.test(value.sourceModelCode) || LASER_TUBE_SERIES.includes(value.series) !== (value.productTypeCode === 'BORU_LAZER_KESIM')) {
    ctx.addIssue({ code: 'custom', message: 'Seri, model ve lazer ürün tipi eşleşmiyor.' });
  }
});
export type LaserSelection = z.infer<typeof laserSelectionSchema>;
export const laserFieldSourceSchema = z.object({
  document: z.string().max(512), sheet: z.string().max(128).optional(), cell: z.string().max(32).optional(),
  capturedAt: z.string().max(64).optional(), sourceModelCode: z.string().max(64).optional(), verification: z.string().max(32).optional(),
  page: z.number().int().positive().optional(), url: z.string().url().max(2048).optional(), rawValue: z.string().max(4000).optional(),
});
export type LaserFieldSource = z.infer<typeof laserFieldSourceSchema>;
export const laserSpecSchema = z.object({
  key: z.string().trim().min(1).max(255), value: z.string().max(2000), unit: z.string().max(64).optional(),
  groupCode: z.string().max(64).optional(), groupName: z.string().max(128).optional(), source: laserFieldSourceSchema.optional(),
  sourceValue: z.string().max(2000).optional(), sourceUnit: z.string().max(64).optional(), sourceGroupCode: z.string().max(64).optional(), isManual: z.boolean().optional(),
});
export type LaserSpec = z.infer<typeof laserSpecSchema>;
export const laserIssueSchema = z.object({
  code: z.string().max(64), field: z.string().max(255).optional(), message: z.string().max(2000),
  sources: z.array(laserFieldSourceSchema).max(10).optional(),
});
export type LaserIssue = z.infer<typeof laserIssueSchema>;
export const laserTechnicalConfigurationSchema = z.object({
  selection: laserSelectionSchema, profileId: z.string().uuid().nullish(), sourceRevision: z.string().min(1).max(128),
  modelLabel: z.string().max(128), sizeLabel: z.string().max(512),
  specs: z.array(laserSpecSchema).max(150), issues: z.array(laserIssueSchema).max(200),
  supportedPower: z.boolean(), standardCabin: z.boolean(),
  hiddenSpecKeys: z.array(z.string().trim().min(1).max(255)).max(150).optional(),
});
export type LaserTechnicalConfiguration = z.infer<typeof laserTechnicalConfigurationSchema>;
export type LaserResolvedProfile = LaserTechnicalConfiguration;
export type LaserSeries = LaserSelection['series'];
export type LaserCabinType = LaserSelection['cabinType'];

/** Commercial series cards deliberately carry no default dimensional/power profile. */
export const laserBaseConfigurationSchema = z.object({
  sourceRevision: z.string().max(128).optional(),
  familyCode: z.string().trim().min(1).max(32),
  series: laserSeriesSchema,
  productTypeCode: laserProductTypeSchema,
  sourceModelCodes: z.array(z.string().trim().min(1).max(64)).min(1).max(150),
}).strict();
export type LaserBaseConfiguration = z.infer<typeof laserBaseConfigurationSchema>;
export const laserBaseFamilyCode = (model: Pick<LaserCatalogModel, 'series' | 'code'>): string =>
  model.series === 'GR' && /Pro/i.test(model.code) ? 'GR_PRO' : model.series;

export interface LaserSourceField { key: string; rawValue: string; groupCode: string; unit?: string; powerKw?: number; source: LaserFieldSource }
export interface LaserCatalogModel {
  code: string; series: LaserSeries; productTypeCode: LaserSelection['productTypeCode']; sizeLabel: string;
  workingArea?: string; standardCabin: LaserCabinType | null; powerMin: number; powerMax: number;
  fields: LaserSourceField[]; issues: LaserIssue[];
}
export interface LaserWorkbookSheet {
  name: string; rows: string[][];
  /** Inclusive, one-based Excel coordinates. */
  merges?: Array<{ startRow: number; endRow: number; startColumn: number; endColumn: number }>;
}

export const LASER_EXCEL_DOCUMENT = 'AORE Technical Parameters.xlsx';
const EXCEL_DOCUMENT = LASER_EXCEL_DOCUMENT;
/** Eski kitaptan çözülen (2026'da kaldırılmış) modellerin kaynak belgesi; satılabilir alt model üretilmez. */
export const LASER_LEGACY_EXCEL_DOCUMENT = 'AORE Technical Parameters 2025.03.18.xlsx';
const CATALOG_DOCUMENT = 'HAKSAN MAKİNA - FİBER LAZER TEKNOLOJİLERİ DİJİTAL ÜRÜN KATALOĞU - 2025';
const normalize = (value: string) => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
const columnName = (index: number): string => {
  let value = index + 1; let result = '';
  while (value > 0) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
  return result;
};

// Source labels are mapped explicitly: dimensions, capacity and power are never fuzzy-matched.
const FIELD_DEFINITIONS: Array<[string, string, string, string?]> = [
  ['Çalışma alanı', 'Kesme Alanı', 'KESME', 'mm'],
  ['Standart düz kesim çalışma alanı', 'Kesme Alanı', 'KESME', 'mm'],
  ['Maksimum hareket hızı', 'Maks. Eksen Hızı', 'KESME', 'm/dk'],
  ['Konumlandırma hassasiyeti', 'Konumlama Hassasiyeti', 'KESME'],
  ['Tekrarlama hassasiyeti', 'Tekrarlama Hassasiyeti', 'KESME'],
  ['Maksimum ivme (X/Y eksenleri eşzamanlı)', 'Maksimum İvme', 'EKSENLER', 'G'],
  ['Z ekseni hareket mesafesi', 'Z Ekseni Hareketi', 'EKSENLER', 'mm'],
  ['Tabla taşıma kapasitesi', 'Tabla Yük Kapasitesi', 'TABLA', 'kg'],
  ['Dış ölçüler', 'Makine Ölçüleri', 'GENEL', 'mm'],
  ['Dış ölçüler (ihracat)', 'Makine Ölçüleri', 'GENEL', 'mm'],
  ['Toplam ağırlık', 'Makine Ağırlığı', 'GENEL', 'kg'],
  ['Toplam ağırlık (ihracat)', 'Makine Ağırlığı', 'GENEL', 'kg'],
  ['Gövde', 'Gövde', 'GENEL'], ['Kiriş', 'Kiriş', 'GENEL'],
  ['X ekseni motor gücü', 'X Eksen Motor Gücü', 'MOTORLAR', 'kW'],
  ['Y ekseni motor gücü', 'Y Eksen Motor Gücü', 'MOTORLAR', 'kW'],
  ['Z ekseni motor gücü', 'Z Eksen Motor Gücü', 'MOTORLAR', 'kW'],
  ['B ekseni motor gücü', 'B Eksen Motor Gücü', 'MOTORLAR', 'kW'],
  ['Tabla değişim motor gücü', 'Tabla Değişim Motor Gücü', 'MOTORLAR', 'kW'],
  ['Tabla değişim süresi', 'Tabla Değişim Süresi', 'TABLA', 'sn'],
  ['Y ekseni lineer kızak modeli', 'Y Ekseni Lineer Kızak', 'EKSENLER'],
  ['X ekseni lineer kızak modeli', 'X Ekseni Lineer Kızak', 'EKSENLER'],
  ['Z ekseni lineer kızak modeli', 'Z Ekseni Lineer Kızak', 'EKSENLER'],
  ['Vidalı mil', 'Vidalı Mil', 'GENEL'], ['Santrifüj fan', 'Santrifüj Fan', 'GENEL'],
  ['Atık toplama arabası adedi', 'Atık Toplama Arabası', 'GENEL'],
  ['Kesim sisteminin tanıdığı dosya formatları', 'Desteklenen Dosya Formatları', 'GENEL'],
  ['Sistemin tanıdığı dosya formatı', 'Desteklenen Dosya Formatları', 'GENEL'],
  ['Giriş güç parametreleri', 'Giriş Güç Parametreleri', 'GENEL'],
  ['Boru kesit şekli', 'Boru Kesit Şekli', 'KESME'],
  ['Boru ölçü aralığı', 'Boru Ölçü Aralığı', 'KESME'],
  ['Boru gereksinimleri', 'Boru Gereksinimleri', 'KESME'],
  ['Maksimum işlenebilir boru uzunluğu', 'Maksimum Boru İşleme Uzunluğu', 'KESME', 'mm'],
  ['Tek boru için maksimum ağırlık', 'Maksimum Boru Ağırlığı', 'KESME', 'kg'],
  ['En kısa artık malzeme', 'En Kısa Artık Malzeme', 'KESME', 'mm'],
  ['Maksimum ayna dönüş hızı', 'Maksimum Ayna Dönüş Hızı', 'KESME', 'dev/dk'],
  ['Ayna besleme ekseni maksimum hızı', 'Ayna Besleme Hızı', 'EKSENLER', 'm/dk'],
  ['Ayna besleme ekseni maksimum ivmesi', 'Maksimum İvme', 'EKSENLER', 'G'],
  ['Kontrol sistemi tipi', 'Kontrol Sistemi Tipi', 'GENEL'],
  ['Bağımsız elektrik kontrol kabini', 'Bağımsız Elektrik Kontrol Kabini', 'GENEL'],
  ['Boru nestleme yazılımı', 'Boru Nestleme Yazılımı', 'GENEL'],
  ['Ekran boyutu', 'Ekran Boyutu', 'GENEL'], ['Su soğutucu', 'Su Soğutucu', 'GENEL'],
  ['Toz emiş fanı gücü', 'Toz Emiş Fanı Gücü', 'MOTORLAR', 'kW'],
  ['Servo motor', 'Servo Motor Markası', 'MOTORLAR'], ['Lineer kızak', 'Lineer Kızak Markası', 'EKSENLER'],
  ['Kremayer', 'Kremayer', 'GENEL'], ['Redüktör', 'Redüktör', 'GENEL'],
  ['Elektrik bileşenleri', 'Elektrik Bileşenleri', 'GENEL'], ['Oransal valf', 'Oransal Valf', 'GENEL'],
  ['Kontrol sistemi', 'Kontrol Ünitesi', 'GENEL'], ['Lazer kesim kafası', 'Kesme Kafası', 'GENEL'],
  ['Lazer kaynağı', 'Rezonatör Seçenekleri', 'GENEL'],
];
// Additional workbook labels remain explicit, including option-specific dimensions.
const EXTRA_FIELDS: Array<[string, string, string, string?]> = [
  ['Maximum tube length', 'Maksimum Boru İşleme Uzunluğu', 'KESME', 'mm'],
  ['Maximum load of chuck', 'Maksimum Ayna Yükü', 'KESME', 'kg'],
  ['Min. tube material surplus', 'En Kısa Artık Malzeme', 'KESME', 'mm'],
  ['W-axis maximum rotation speed', 'W Ekseni Dönüş Hızı', 'EKSENLER', 'dev/dk'],
  ['U-axis maximum propulsion speed', 'U Ekseni İlerleme Hızı', 'EKSENLER', 'm/dk'],
  ['Chuck rotation accuracy', 'Ayna Dönüş Hassasiyeti', 'KESME'],
  ['Chuck repeat positioning accuracy', 'Ayna Tekrarlama Hassasiyeti', 'KESME'],
  ['Chuck rotation angle', 'Ayna Dönüş Açısı', 'KESME'],
  ['Max. acceleration（X/U axis linkage)', 'X/U Eksen İvmesi', 'EKSENLER', 'G'],
  ['W-axis motor power', 'W Eksen Motor Gücü', 'MOTORLAR', 'kW'],
  ['U-axis motor power', 'U Eksen Motor Gücü', 'MOTORLAR', 'kW'],
  ['U-axis guide rail model', 'U Ekseni Lineer Kızak', 'EKSENLER'],
  ['Chuck power mode', 'Ayna Tahrik Tipi', 'KESME'],
  ['Chuck air pressure', 'Ayna Hava Basıncı', 'KESME', 'MPa'],
  ['L-shaped steel Cutting function', 'L Profil Kesimi', 'KESME'],
  ['H-shaped steel Cutting function', 'H Profil Kesimi', 'KESME'],
  ['Vertical working area', 'Düz Kesim Çalışma Alanı', 'KESME', 'mm'],
  ['45°Bevel working area', '45° Pah Kesim Alanı', 'KESME', 'mm'],
  ['Totally enclosed protection', 'Tam Kapalı Koruma', 'GENEL'],
  ['Refractory materials on the bed', 'Gövde Isı Koruma Malzemesi', 'GENEL'],
  ['Cast iron material on table top', 'Tabla Dökme Demir Koruması', 'TABLA'],
  ['Max. running speed（X/Y axis linkage)', 'X/Y Eşzamanlı Eksen Hızı', 'EKSENLER', 'm/dk'],
  ['Receiving blet motor', 'Malzeme Alma Bandı Motoru', 'MOTORLAR', 'kW'],
  ['Rotating feeding motor', 'Döner Besleme Motoru', 'MOTORLAR', 'kW'],
  ['Material width', 'Rulo Malzeme Genişliği', 'KESME', 'mm'],
  ['Feeding length', 'Besleme Uzunluğu', 'KESME', 'mm'],
  ['Material thickness', 'Rulo Malzeme Kalınlığı', 'KESME', 'mm'],
  ['Coil weight', 'Rulo Ağırlığı', 'KESME', 't'],
  ['Material Inner diameter', 'Rulo İç Çapı', 'KESME', 'mm'],
  ['Material outer diameter', 'Rulo Dış Çapı', 'KESME', 'mm'],
  ['Unwinding maximum feed speed', 'Rulo Açma Besleme Hızı', 'KESME', 'm/dk'],
  ['Feeding accuracy', 'Besleme Hassasiyeti', 'KESME'],
  ['Flatness after leveling', 'Düzleştirme Sonrası Düzlemsellik', 'KESME'],
  ['Weight of loading trolley', 'Yükleme Arabası Ağırlığı', 'GENEL', 't'],
  ['Professional flat nesting software', 'Sac Nestleme Yazılımı', 'GENEL'],
  ['Standard weight of the whole machine', 'Standart Makine Ağırlığı', 'GENEL', 't'],
  ['Add weight when you choose a countertop', 'Opsiyonel Tabla Ek Ağırlığı', 'TABLA', 't'],
  ['Increase the weight when selecting the material cart', 'Opsiyonel Malzeme Arabası Ek Ağırlığı', 'GENEL', 't'],
  ['Optional crosshead wrap-around (GR Pro) for added weight', 'GR Pro Kiriş Koruması Ek Ağırlığı', 'GENEL', 't'],
  ['Professional nesting software', 'Nestleme Yazılımı', 'GENEL'],
  ['Y maximum acceleration', 'Maksimum İvme', 'EKSENLER', 'G'],
  ['Automatic feeding device', 'Otomatik Besleme Ünitesi', 'GENEL'],
  ['Dust removal', 'Toz Emiş Sistemi', 'GENEL'],
  ['Standard unloading platform (follow-up version)', 'Takipli Standart Boşaltma Platformu', 'GENEL'],
  ['Recommended maximum range for cutting pipes', 'Önerilen Maksimum Boru Ölçüsü', 'KESME', 'mm'],
  ['security light curtains', 'Güvenlik Işık Perdesi', 'GENEL'],
  // 2026.9.14 çalışma kitabının yeni etiketleri
  ['Bed layout', 'Gövde Yerleşimi', 'GENEL'],
  ['Chuck', 'Ayna Tipi', 'KESME'],
  ['Unloading platform', 'Boşaltma Platformu', 'GENEL'],
  ['Waste Trolley', 'Atık Toplama Arabası', 'GENEL'],
  ['Rack', 'Kremayer', 'GENEL'],
  ['Optional dust removal increases Weight', 'Opsiyonel Toz Emiş Ek Ağırlığı', 'GENEL'],
  ['Servo follow-up support function', 'Servo Takipli Destek', 'GENEL'],
  ['Overall Weight', 'Makine Ağırlığı', 'GENEL', 'kg'],
  ['tube size range-suggest', 'Önerilen Boru Ölçü Aralığı', 'KESME'],
  ['Bevel 45°cut Width', '45° Pah Kesim Alanı', 'KESME', 'mm'],
  ['Non-standard Groove straight cut Width', 'Opsiyonel Pah Düz Kesim Alanı', 'KESME', 'mm'],
  ['Underdraught fan', 'Alttan Emiş Fanı', 'GENEL'],
  ['Bed Windscreen and bed', 'Gövde Rüzgârlığı', 'GENEL'],
  ['凹轮支撑', 'İçbükey Makara Desteği', 'KESME'],
  ['凹轮支撑适用范围', 'İçbükey Makara Destek Aralığı', 'KESME'],
  ['凹轮支撑范围', 'İçbükey Makara Destek Aralığı', 'KESME'],
  ['零尾料触发条件', 'Sıfır Artık Tetikleme Koşulu', 'KESME', 'mm'],
  ['冷水机', 'Su Soğutucu', 'GENEL'],
];
const DEFINITIONS = new Map(FIELD_DEFINITIONS.map(([label, key, groupCode, unit]) => [normalize(label), { key, groupCode, unit }]));
// 2026 çalışma kitabı aynı etiketleri farklı büyük/küçük harf ve boşlukla yazıyor (ör. "poWer").
const ALIAS_BY_NORMALIZED = new Map(Object.entries(AORE_LABEL_ALIASES as Record<string, string>).map(([label, alias]) => [normalize(label), alias]));
const canonicalLabel = (label: string) => ALIAS_BY_NORMALIZED.get(normalize(label)) ?? label;

const EXTRA_DEFINITIONS = new Map(EXTRA_FIELDS.map(([label, key, groupCode, unit]) => [normalize(label), { key, groupCode, unit }]));
function sourceCell(sheet: LaserWorkbookSheet, row: number, col: number) {
  const merge = sheet.merges?.find((m) => row + 1 >= m.startRow && row + 1 <= m.endRow && col + 1 >= m.startColumn && col + 1 <= m.endColumn);
  const r = merge ? merge.startRow - 1 : row;
  const c = merge ? merge.startColumn - 1 : col;
  return { value: (sheet.rows[r]?.[c] ?? '').trim(), cell: `${columnName(c)}${r + 1}` };
}
function fieldDefinition(label: string, section: string) {
  const option = label.match(/^(外形尺寸|总重)[（(]([^）)]+)[）)]/);
  if (option && !['外贸', 'ihracat', '以最大功率计算'].includes(option[2])) {
    const suffix = option[2] === '含3米卸料台' ? '3 m boşaltma tablası dahil' : option[2];
    return { key: `${option[1] === '外形尺寸' ? 'Makine Ölçüleri' : 'Makine Ağırlığı'} (${suffix})`, groupCode: 'GENEL', unit: option[1] === '外形尺寸' ? 'mm' : 'kg' };
  }
  if (/^[XY]轴\n[XY]-axis$/.test(label)) {
    const axis = label[0];
    const prefix = /45°/.test(section) ? '45° Pah Kesim' : /Non-standard Groove/.test(section) ? 'Opsiyonel Pah Düz Kesim' : 'Düz Kesim';
    return { key: `${prefix} ${axis} Alanı`, groupCode: 'KESME', unit: 'mm' };
  }
  if (label.includes('台面承重（选配）')) return { key: 'Opsiyonel Tabla Yük Kapasitesi', groupCode: 'TABLA', unit: 't' };
  return DEFINITIONS.get(normalize(canonicalLabel(label))) ?? label.split('\n').map((part) => EXTRA_DEFINITIONS.get(normalize(part))).find(Boolean);
}
const SOURCE_CABINS: Partial<Record<LaserSeries, LaserCabinType>> = { F: 'open', FT: 'open', FB: 'open', PG: 'closed', PB: 'closed', H: 'closed', S: 'closed', TG: 'closed' };
const TABLE_CATALOG: Partial<Record<LaserSeries, { value: string; page: number }>> = {
  F: { value: 'Tek tabla', page: 10 }, FT: { value: 'Tek tabla', page: 22 }, FB: { value: 'Tek tabla', page: 13 },
  PG: { value: 'Değişimli çift tabla', page: 8 }, PB: { value: 'Değişimli çift tabla', page: 7 }, S: { value: 'Tek tabla', page: 14 },
};
const formatArea = (raw: string) => raw.replace(/mm/gi, '').replace(/[x×*]/g, ' × ').trim().replace(/\s+/g, ' ');
function modelCodes(cell: string, series: LaserSeries): string[] {
  // TS6020+S6 / TZ12070+Z12: "+S6" standart yükleme ünitesidir, model kodunun parçası değildir.
  const text = cell.replace(/[（(].*?[）)]/g, '').trim().replace(/^([A-Z]+)-(\d{4,5})$/, '$1$2').replace(/^((?:TS|TZ)\d{4,5})\+[A-Z]\d+$/, '$1');
  const codes = series === 'GR' ? text.split('/') : [text];
  return codes.filter((code) => laserSelectionSchema.safeParse({ sourceModelCode: code, series, productTypeCode: LASER_TUBE_SERIES.includes(series) ? 'BORU_LAZER_KESIM' : 'FIBER_LAZER_KESIM', cabinType: 'open', powerKw: 3 }).success);
}

export function parseLaserWorkbookSheets(sheets: LaserWorkbookSheet[], fileName: string): { models: LaserCatalogModel[]; issues: LaserIssue[] } {
  const models: LaserCatalogModel[] = [];
  const issues: LaserIssue[] = [];
  const standards = sheets.find((s) => s.rows.some((row) => row.includes('F') && row.includes('PG') && row.includes('TG')));
  for (const sheet of sheets) {
    if (sheet === standards) continue;
    const sheetSeries = LASER_SERIES.find((series) => new RegExp(`^${series}(?:系列|\\s+Serisi)$`, 'i').test(sheet.name.trim()));
    // Legacy separate workbooks may use an arbitrary sheet name, so infer only unambiguous standard codes.
    const series = sheetSeries ?? LASER_SERIES.find((candidate) => sheet.rows.slice(0, 5).some((row) => row.some((cell) => new RegExp(`^${candidate}-?\\d{4,5}$`).test(cell.trim()))));
    if (!series) continue;
    // Model sütunları A–C'de olmaz; etiket sütunu kitaba göre C (2026) ya da D (2025).
    const headerIndex = sheet.rows.findIndex((row) => row.some((cell, col) => col >= 3 && modelCodes(cell, series).length > 0));
    if (headerIndex < 0) continue;
    const header = sheet.rows[headerIndex];
    const subItemCol = sheet.rows.slice(0, headerIndex + 1).map((row) => row.findIndex((cell) => /^子项/.test(cell.trim()))).find((col) => col >= 2);
    const labelCol = subItemCol ?? header.findIndex((cell, col) => col >= 3 && modelCodes(cell, series).length > 0) - 1;
    for (let col = labelCol + 1; col < header.length; col++) for (const code of modelCodes(header[col], series)) {
      const fields: LaserSourceField[] = [];
      const modelIssues: LaserIssue[] = [];
      let powerMin = 0; let powerMax = 0; let workingArea: string | undefined; let sizeLabel = '';
      const add = (definition: { key: string; groupCode: string; unit?: string }, rawValue: string, source: LaserFieldSource) => fields.push({ ...definition, rawValue, source });
      for (let index = headerIndex + 1; index < sheet.rows.length; index++) {
        const rawLabel = sourceCell(sheet, index, labelCol).value || sourceCell(sheet, index, labelCol - 1).value;
        const label = canonicalLabel(rawLabel);
        if (/^子项/.test(rawLabel)) continue;
        const cell = sourceCell(sheet, index, col);
        const rawValue = cell.value;
        const source: LaserFieldSource = { document: fileName, sheet: sheet.name, cell: cell.cell, rawValue };
        if (normalize(label) === normalize('Modelin desteklediği güç')) {
          const powers = rawValue.replace(/,/g, '.').match(/\d+(?:\.\d+)?/g);
          // Aralık ("1.5-20kW") ya da liste ("3kW、6kW、12kW"): sınırlar en küçük ve en büyük değerdir.
          if (powers && powers.length >= 2) [powerMin, powerMax] = [Math.min(...powers.map(Number)), Math.max(...powers.map(Number))];
          add({ key: 'Kaynakta Desteklenen Güç', groupCode: 'KESME' }, rawValue, source);
          continue;
        }
        const powerLabel = label.match(/^(\d+(?:[.,]\d+)?)\s*kW lazer kaynağı/i) ?? label.match(/with\s*(\d+(?:[.,]\d+)?)\s*kw\s*source/i) ?? rawLabel.match(/配(\d+(?:[.,]\d+)?)\s*kw激光器/i);
        if (powerLabel) {
          const powerKw = Number(powerLabel[1].replace(',', '.'));
          fields.push({ key: 'Toplam Güç Gereksinimi', groupCode: 'GENEL', unit: 'kW', rawValue, source, powerKw });
          fields.push({ key: 'Trafo Kapasitesi', groupCode: 'GENEL', unit: 'kVA', rawValue, source, powerKw });
          continue;
        }
        const definition = fieldDefinition(rawLabel, sourceCell(sheet, index, labelCol - 1).value);
        if (!definition) {
          if (rawLabel && rawValue && !/^[/\\-]+$/.test(rawValue)) {
            const key = rawLabel.split('\n').find((part) => /^[A-Za-z]/.test(part.trim()))?.trim() ?? rawLabel.replace(/\n/g, ' ');
            add({ key: key.slice(0, 255), groupCode: 'GENEL' }, rawValue, source);
            modelIssues.push({ code: 'unmapped_source_label', field: key, message: 'Kaynak alanı özgün adıyla korundu; alan adı düzenlenebilir.', sources: [source] });
          }
          continue;
        }
        if (definition.key === 'Kesme Alanı' && (series === 'FT' || series === 'PGT')) {
          const area = rawValue.match(/(?:板切幅面|(?:Plate|Sheet) cutting area)\s*[：:]\s*([^\n]+)/i)?.[1]?.replace(/mm$/i, '');
          if (area) {
            add(definition, area, source); add({ key: 'Tabla Boyutu', groupCode: 'TABLA', unit: 'mm' }, area, source);
            add({ key: 'Boru Ölçü Aralığı', groupCode: 'KESME' }, rawValue.split('\n').slice(1).join('\n'), source);
            workingArea = formatArea(area); sizeLabel = `${workingArea} mm · boru/profil ünitesi`;
          } else add(definition, rawValue, source);
        } else {
          add(definition, rawValue, source);
          if (definition.key === 'Kesme Alanı') {
            workingArea = /kw/i.test(rawValue) ? undefined : formatArea(rawValue);
            sizeLabel = workingArea ? `${workingArea} mm` : rawValue.replace(/\n/g, ' / ');
            add({ ...definition, key: 'Tabla Boyutu', groupCode: 'TABLA' }, rawValue, source);
          }
          if (definition.key === '45° Pah Kesim Alanı') sizeLabel = `${formatArea(rawValue)} mm (45° pah)`;
          if (definition.key === 'Boru Ölçü Aralığı') sizeLabel = displayLaserSourceValue(rawValue).split('\n').slice(0, 2).join(' / ');
        }
      }
      if (series === 'GR') {
        const x = fields.find((f) => f.key === 'Düz Kesim X Alanı'); const y = fields.find((f) => f.key === 'Düz Kesim Y Alanı');
        if (x && y) { workingArea = `${formatArea(x.rawValue)} × ${formatArea(y.rawValue)}`; sizeLabel = `${workingArea} mm`; }
      }
      if (series === 'S') {
        const rawValue = header[col].includes('推拉台面') || /Sliding table/i.test(header[col]) ? 'Sürgülü tek tabla' : header[col].includes('固定台面') || /Fixed table/i.test(header[col]) ? 'Sabit tek tabla' : '';
        if (rawValue) add({ key: 'Tabla Değişim Tipi', groupCode: 'TABLA' }, rawValue, { document: fileName, sheet: sheet.name, cell: `${columnName(col)}${headerIndex + 1}`, rawValue: header[col] });
      }
      if (standards) {
        const seriesRow = standards.rows.findIndex((row) => row.includes('F') && row.includes('PG') && row.includes('TG'));
        // The GR-Pro column does not authorize assigning Pro components to standard GR models.
        // 2026 S sayfası modelleri tahrik grubuna ayırır; vidalı mil grubu kendi standart sütununu kullanır.
        const driveGroup = series === 'S' && headerIndex > 0 ? sourceCell(sheet, headerIndex - 1, col).value : '';
        const standardSeries = series === 'GR' && /Pro/i.test(code) ? 'GR-Pro' : /Ball screw/i.test(driveGroup) ? 'S (Vidalı mil)' : series;
        // 2026 kitabında GR-Pro sütunu yok; tek GR sütunu iki varyantı da kapsar.
        const exactCol = standards.rows[seriesRow].indexOf(standardSeries);
        const seriesCol = exactCol >= 0 || standardSeries !== 'GR-Pro' || standards.rows[seriesRow].includes('GR-Pro') ? exactCol : standards.rows[seriesRow].indexOf('GR');
        if (seriesCol >= 0) for (let index = seriesRow + 1; index < standards.rows.length; index++) {
          const definition = fieldDefinition(standards.rows[index][0] ?? '', '');
          if (!definition) continue;
          const cell = sourceCell(standards, index, seriesCol);
          const source = { document: fileName, sheet: standards.name, cell: cell.cell, rawValue: cell.value };
          if (!fields.some((f) => f.key === definition.key)) add(definition, cell.value, source);
        }
      }
      const protection = fields.find((field) => field.key === 'Tam Kapalı Koruma')?.rawValue;
      const standardCabin = protection === '●' ? 'closed' : protection === '×' ? 'open' : SOURCE_CABINS[series] ?? null;
      if (!standardCabin) modelIssues.push({ code: 'unknown_standard_cabin', message: 'Kaynakta modelin açık/kapalı kabin eşlemesi doğrulanmıyor. Kabine bağlı değerler seçim için elle tamamlanır.' });
      if (!sizeLabel || !powerMax) modelIssues.push({ code: 'missing_model_metadata', message: `${code}: çalışma kapasitesi veya desteklenen güç bilgisi eksik.` });
      const existing = models.find((m) => m.code === code && m.series === series);
      if (existing) {
        if (JSON.stringify(existing.fields.map((f) => [f.key, f.rawValue])) !== JSON.stringify(fields.map((f) => [f.key, f.rawValue]))) issues.push({ code: 'duplicate_model_conflict', message: `${code} birden fazla sayfada farklı değerler içeriyor; ilk sayfa korundu.` });
        continue;
      }
      models.push({ code, series, productTypeCode: LASER_TUBE_SERIES.includes(series) ? 'BORU_LAZER_KESIM' : 'FIBER_LAZER_KESIM', standardCabin, powerMin, powerMax, workingArea, sizeLabel, fields, issues: modelIssues });
    }
  }
  if (!models.length) issues.push({ code: 'no_laser_models', message: 'Desteklenen kesim serilerinin model sütunları bulunamadı.' });
  return { models, issues };
}

/** Resolve one source rule without evaluating source text as executable code. */
export function resolveLaserPowerRule(raw: string, power: number): string | undefined {
  const text = raw.replace(/：/g, ':').replace(/；/g, ';').replace(/[＜]/g, '<').replace(/[＞]/g, '>').replace(/(\d),(\d)/g, '$1.$2').replace(/[–—]/g, '-').replace(/12--40/g, '12-40');
  // "12kW/20kW: X" iki ayrı güç koşuludur.
  const lines = text.split(/[\n;]/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    const list = line.match(/^((?:\d+(?:\.\d+)?\s*kw\s*\/\s*)+\d+(?:\.\d+)?\s*kw)\s*:\s*(.+)$/i);
    return list ? list[1].split('/').map((power) => `${power.trim()}: ${list[2]}`) : [line];
  });
  let hasCondition = false;
  for (const line of lines) {
    const match = line.match(/^(≤|>=|≥|<=|<|>)?\s*(\d+(?:\.\d+)?)\s*(?:kw)?\s*(?:-\s*(\d+(?:\.\d+)?)\s*)?kw(?:\s*:\s*|\s+)(.+)$/i);
    if (!match) continue;
    hasCondition = true;
    const [, op, startText, endText, value] = match;
    const start = Number(startText); const end = endText ? Number(endText) : undefined;
    const matches = end !== undefined ? power >= start && power <= end : op === '≤' || op === '<=' ? power <= start : op === '≥' || op === '>=' ? power >= start : op === '<' ? power < start : op === '>' ? power > start : power === start;
    if (matches) return value.trim();
  }
  return hasCondition ? undefined : text.trim();
}

const isMissing = (value: string | undefined) => !value || /^[\/\\\-]+$/.test(value.trim());
const CABIN_SENSITIVE = new Set(['Makine Ağırlığı', 'Makine Ölçüleri', 'Toplam Güç Gereksinimi', 'Trafo Kapasitesi']);
const POWER_SENSITIVE = new Set(['Tabla Yük Kapasitesi', 'Makine Ağırlığı', 'Makine Ölçüleri', 'Toplam Güç Gereksinimi', 'Trafo Kapasitesi', 'Kesme Kafası', 'Kontrol Ünitesi', 'X Eksen Motor Gücü', 'Y Eksen Motor Gücü', 'Z Eksen Motor Gücü', 'B Eksen Motor Gücü', 'Tabla Değişim Motor Gücü']);

function splitUnit(raw: string, defaultUnit?: string): { value: string; unit?: string } {
  // Kaynak yazım hatası "3kW/6kW12kW": birimin ardından gelen rakam yeni bir değerdir.
  let value = raw.trim().replace(/(\d\s*kw)(?=\d)/gi, '$1/');
  if (value === '●') return { value: 'Standart' };
  if (value === '○') return { value: 'Opsiyonel' };
  if (value === '×') return { value: 'Yok' };
  const match = value.match(/^(.*?)(mm\/m|m\/min|r\/min|mm\/s|m²\/h|kg|mm|kw|kva|mpa|bar|nm|t|G)\s*$/i);
  // Unit suffixes belong to measurements, not equipment codes such as BLT310T.
  const numericPrefix = match?.[1].replace(/(?<=\d)\s*kw/gi, '');
  if (match && defaultUnit === match[2] && /\d\s*$/.test(match[1])) {
    return { value: numericPrefix!.trim(), unit: defaultUnit };
  }
  if (match && numericPrefix && /\d\s*$/.test(numericPrefix) && /^[\s\d.,±+\-–—×*x/()≥≤]+$/i.test(numericPrefix)) {
    const found = match[2].toLowerCase();
    const unit = ({ 'm/min': 'm/dk', 'r/min': 'dev/dk', kw: 'kW', kva: 'kVA', mpa: 'MPa', g: 'G' } as Record<string, string>)[found] ?? found;
    value = numericPrefix.trim();
    return { value, unit };
  }
  if (defaultUnit === 'kW') value = value.replace(/kw/gi, '').trim();
  if (defaultUnit === 'sn') value = value.replace(/s(?=\s*\()/i, '');
  return { value, unit: defaultUnit };
}

function variantRaw(field: LaserSourceField, selection: LaserSelection): string | undefined {
  // 2026 kitabı: ilk satır motor markası ("汇川电機\n40.35kW/50kVA"), GR satırı "GR 52.35kW/80kVA".
  const sections = field.rawValue.replace(/：/g, ':').replace(/^\s*(?:汇川电机|柏楚S9|BOCHU S9)\s*\n/, '').replace(/^GR( Pro)? (?=\d)/gm, 'GR$1: ')
    // "Bevel cutting:" altındaki satırlar pah kesim opsiyonudur, standart yapılandırma değildir.
    .split(/\n\s*Bevel cutting\s*:/i);
  // Model kodu yalnız pah bölümünde geçiyorsa (V12Pro) o bölüm modelin standardıdır.
  const shortCode = selection.sourceModelCode.split('-')[0]!;
  const keyedIn = (text: string) => new RegExp(`(?:^|\\n|[、,]\\s*)${shortCode}\\s*(?:[、,][^:\\n]*)?:`).test(text);
  const raw = sections.length > 1 && !keyedIn(sections[0]!) && keyedIn(sections[1]!) ? sections[1]!.trim() : sections[0]!.trim();
  if (selection.series !== 'GR' || !/^GR(?:[- ]?Pro)?\s*:/im.test(raw)) return raw;
  const entries = raw.split('\n').map((line) => line.match(/^GR([- ]?Pro)?\s*:\s*(.+)$/i)).filter((entry): entry is RegExpMatchArray => Boolean(entry));
  return entries.find((entry) => Boolean(entry[1]) === /Pro/i.test(selection.sourceModelCode))?.[2];
}
function resolveField(field: LaserSourceField, selection: LaserSelection): string | undefined {
  const raw = variantRaw(field, selection);
  if (raw === undefined) return undefined;
  if (field.powerKw !== undefined) {
    if (field.powerKw !== selection.powerKw || isMissing(raw)) return undefined;
    const split = raw.match(/^\s*([\d.,]+)\s*kw\s*\/\s*([\d.,]+)\s*kva(?:\s*[(（][^()（）]*[)）])?\s*$/i);
    return split ? split[field.key === 'Trafo Kapasitesi' ? 2 : 1].replace(',', '.') : undefined;
  }
  if (['TG', 'TH', 'TA'].includes(selection.series) && field.key === 'Kontrol Ünitesi') {
    // These conditions identify chuck size, not laser power. A PDF-only model has no inferred chuck controller.
    const diameter = ({ TG6012: 120, TG6020: 230, TG6035: 350, TH6012: 120, TH6020: 230, TH6035: 350, TA6020: 230, TA6035: 350 } as Record<string, number>)[selection.sourceModelCode];
    const flat = raw.replace(/\n/g, ' ').replace(/[–—]/g, '-');
    const entries = [...flat.matchAll(/(\d+)(?:-(\d+))?\s*(?:ayna|卡盘|chuck)[^:;]*:\s*(FSCUT[\w-]+)/gi)];
    return entries.find((entry) => diameter >= Number(entry[1]) && diameter <= Number(entry[2] ?? entry[1]))?.[3];
  }
  // "V12: FSCUT3000DE-A; V24、V36: FSCUT3000DE-G": her satır model koduyla başlıyorsa modelin satırı seçilir.
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const keyed = lines.map((line) => line.match(/^([A-Z]+\d+(?:Pro)?(?:\s*[、,]\s*[A-Z]+\d+(?:Pro)?)*)\s*:\s*(.+?)\s*[；;]?$/));
  if (lines.length && keyed.every(Boolean)) {
    const shortCode = selection.sourceModelCode.split('-')[0];
    return keyed.find((match) => match![1].split(/\s*[、,]\s*/).includes(shortCode))?.[2];
  }
  if (field.key === 'Kesme Kafası' && ['TG6012', 'TH6012'].includes(selection.sourceModelCode)) {
    const special = raw.match(new RegExp(`${selection.sourceModelCode}\\s*:\\s*([\\w-]+)`, 'i'));
    if (special) return special[1];
  }
  return resolveLaserPowerRule(raw, selection.powerKw);
}

/** Human-readable translations do not alter the original source.rawValue. */
const CJK = /[\u3400-\u9fff]/;
// 2026 kitabında yalnız İngilizce kalan değerlerin Türkçe karşılıkları.
const ENGLISH_SOURCE_VALUES: Record<string, string> = {
  'Standard Configuration': 'Standart yapılandırma', 'MAX': 'MAX', 'kOFON': 'KOFON', 'KOFON': 'KOFON', 'Hanli': 'HANLI',
  'China INOVANCE/BOCHU S9': 'INOVANCE (Çin) / BOCHU S9', 'China INOVANCE': 'INOVANCE (Çin)', 'BOCHO S9': 'BOCHU S9', 'BOCHU S9': 'BOCHU S9',
  'Taiwan HIWIN': 'HIWIN (Tayvan)', 'Taiwan YYC': 'YYC (Tayvan)', 'Italy MOTOR POWER': 'MOTOR POWER (İtalya)', 'Neugart': 'Neugart (Almanya)',
  'Welded bed': 'Kaynaklı gövde', 'Aluminum profiles': 'Havacılık tipi alüminyum profil', 'Welded beams': 'Kaynaklı kiriş',
  'Side hung bed': 'Yandan askılı gövde', 'Plate tube Welding': 'Sac-boru kaynaklı gövde', 'Full stroke precision chuck': 'Tam stroklu hassas ayna',
  'Horizontal type': 'Yatay tip', 'Full pneumatic self centering chuck': 'Tam pnömatik, kendinden merkezlemeli ayna', 'Unlimited ±∞': 'Sınırsız ±∞',
};
export function displayLaserSourceValue(raw: string): string {
  const exact: Record<string, string> = {
    '焊接床身\nWelded bed': 'Kaynaklı gövde', '航空工业用铝材\nAluminum profiles': 'Havacılık tipi alüminyum profil',
    '焊接横梁\nWelded beams': 'Kaynaklı kiriş', '奥锐标配\nAoreStandard Configuration': 'AORE standart yapılandırması',
    '奥锐标配（汉立）\nAore Standard Configuration': 'HANLI (AORE standart yapılandırması)',
    '科峰\nKOFON': 'KOFON', '科峰\nK0FON': 'K0FON', '创鑫/锐科\nMAX/Raycus': 'MAX/Raycus',
    '中国汇川\nChina INOVANCE': 'INOVANCE (Çin)', '意大利摩力\nItaly MOTOR POWER': 'MOTOR POWER (İtalya)',
    '德国力士乐\nGermany Rexroth': 'Rexroth (Almanya)', '台湾YYC\nTaiwan YYC': 'YYC (Tayvan)', '德国纽卡特\nNeugart': 'Neugart (Almanya)',
    '正泰/欧姆龙\nCHNT/OMROM': 'CHNT/OMROM', '施耐德/欧姆龙\nSCHNEIDER/OMROM': 'SCHNEIDER/OMROM',
    '日本SMC\nJapan SMC': 'SMC (Japonya)', '总线控制 EtherCAT bus control': 'EtherCAT haberleşme sistemi',
    '总线控制 EtherCAT Bus control': 'EtherCAT haberleşme sistemi', '无限制±∞\nUnlimited ±∞': 'Sınırsız ±∞',
    '全气动自定心卡盘\nFull pneumatic self centering chuck': 'Tam pnömatik, kendinden merkezlemeli ayna',
    '支持 DXF、LXD、PLT、AI、Gerber等图形数据格式，\n接受 Lantek、CNCkad等软件生成的国际标准 G 代码': 'DXF, LXD, PLT, AI, Gerber; Lantek ve CNCkad tarafından üretilen standart G kodları',
    // Rulo (R) serisi
    '0.5-3.0mm冷轧板、镀锌板\n0.5-2.0mm不锈钢板': '0.5-3.0 mm soğuk haddelenmiş ve galvaniz sac\n0.5-2.0 mm paslanmaz sac',
    '≤20m/min(以技术方案为准)\n≤20m/min(Subject to technical plan )': '≤20 m/dk (teknik plana göre)',
    '≤±2mm/㎡( (以技术方案为准)\n≤±2mm/㎡(Subject to technical plan )': '≤±2 mm/m² (teknik plana göre)',
    // Boru serileri: kesit şekli ve boru gereksinimleri
    '圆管、方管、矩形管、椭圆管、长圆管（跑道圆）、角钢、槽钢等管材\nRound, square, rectangular, oval, rounded rectangular, Angle steel, channel steel and other tubes\n（有其他截面形状请咨询产品经理）\nFor other cross-sectional shapes, please consult the product manager':
      'Yuvarlak, kare, dikdörtgen, oval ve yuvarlatılmış dikdörtgen boru; köşebent, U profil ve diğer profiller\nDiğer kesit şekilleri için ürün yöneticisine danışın.',
    '圆管、方管、矩形管、槽钢、角钢、工字钢等\nRound tube, square tube, rectangular tube，angle steel, channel steel, I-beam, etc.\n（有其他截面形状请咨询产品经理）\nFor other cross-sectional shapes, please consult the product manager':
      'Yuvarlak, kare ve dikdörtgen boru; köşebent, U profil, I profil vb.\nDiğer kesit şekilleri için ürün yöneticisine danışın.',
    '管径Diameter<φ50mm 管材壁厚thickness≥1.2mm;\n管径Diameter≥φ50mm\n薄壁管的管壁与直径的比值不小于1/40\nWall thickness≥2.5% of Diameters of tubes':
      'Çap < φ50 mm: et kalınlığı ≥ 1.2 mm\nÇap ≥ φ50 mm: et kalınlığı çapın en az %2,5\'i (1/40)',
    '管径Diameter<φ50mm 管材壁厚thickness≥2mm;\n管径Diameter≥φ50mm\n薄壁管的管壁与直径的比值不小于1/40\nWall thickness≥2.5% of Diameters of tubes':
      'Çap < φ50 mm: et kalınlığı ≥ 2 mm\nÇap ≥ φ50 mm: et kalınlığı çapın en az %2,5\'i (1/40)',
    '管径Diameter≥φ50mm\n卡盘夹持壁厚 >5mm\n薄壁管的管壁与直径的比值不小于1/40\nWall thickness≥2.5% of Diameters of tubes':
      'Çap ≥ φ50 mm\nAyna bağlama et kalınlığı > 5 mm\nEt kalınlığı çapın en az %2,5\'i (1/40)',
    '离心风机\ncentrifugal fan': 'Santrifüj fan',
    '管径Diameter＜φ50mm 管材壁厚thickness≥1.2mm；\n管径Diameter≥φ50mm\nWall thickness≥2.5% of Diameters of tubes':
      'Çap < φ50 mm: et kalınlığı ≥ 1.2 mm\nÇap ≥ φ50 mm: et kalınlığı çapın en az %2,5\'i (1/40)',
  };
  // Kaynak hücrelerde satır sonu boşlukları tutarsız; eşleşme satırlar kırpılarak da denenir.
  const trimmed = raw.split('\n').map((line) => line.trim()).join('\n');
  if (exact[raw] ?? exact[trimmed]) return exact[raw] ?? exact[trimmed];
  // 2026 kitabı hücreleri "Çince satır\nİngilizce karşılık" yazar: Çince satır, ardından gelen
  // İngilizce karşılığı varsa düşer (ör. "汇川电机\n1.3kW" → "1.3kW", "标配\nStandard Configuration").
  const lines = trimmed.split('\n');
  const bilingual = lines.filter((line, index) => !(CJK.test(line) && lines.slice(index + 1).some((next) => next.trim() && !CJK.test(next))))
    .join('\n')
    // GR hücresi taban ve Pro değerini "GR 52.35kW/80kVA" biçiminde yazar; varyant ayrımı "GR: …" bekler.
    .replace(/^GR( Pro)? (?=\d)/gm, 'GR$1: ');
  const englishValue = ENGLISH_SOURCE_VALUES[bilingual] ?? (/^Supports DXF/.test(bilingual) ? exact['支持 DXF、LXD、PLT、AI、Gerber等图形数据格式，\n接受 Lantek、CNCkad等软件生成的国际标准 G 代码'] : undefined);
  if (englishValue) return englishValue;
  return bilingual.replace(/^BOCHU\n(?=FSCUT)/, 'BOCHU ').replace(/圆管Round tube/gi, 'Yuvarlak boru ').replace(/方管square tube/gi, 'Kare boru ')
    .replace(/其余见卡盘加持示意图\nFor the rest, please refer to the schematic diagram of chuck mounting/g, 'Diğer kesitler için ayna bağlama diyagramına bakın.')
    .replace(/(\d+)组（(\d+)个）/g, '$1 grup ($2 adet)').replace(/（可调）|\(可调\)/g, '(ayarlanabilir)')
    .replace(/^柏楚\n/, '').replace(/-七轴/g, ' (7 eksen)').replace(/●（基础版）/g, 'Standart (temel sürüm)')
    .replace(/●（两卡版）/g, 'Standart (iki ayna sürümü)').replace(/●（专业版）/g, 'Standart (profesyonel sürüm)')
    .replace(/板切[：:]/g, 'Sac kesim: ').replace(/管切[：:]/g, 'Boru kesim: ').replace(/坡口直切[：:]/g, 'Düz kesim: ')
    .replace(/坡口坡口?切[：:]/g, 'Pah kesim: ').replace(/直切[：:]/g, 'Düz kesim: ').replace(/坡口[：:]/g, 'Pah kesim: ')
    .replace(/三相/g, 'Üç faz ').replace(/单相/g, 'Tek faz ').replace(/建议边长或直径/g, 'Önerilen kenar uzunluğu veya çapı ')
    .replace(/(\d+(?:\.\d+)?)寸(?:\*(\d+))?(?:\n[\d.]+ inches(?:\*\d+)?)?/g, (_, size: string, count: string) => `${size} inç${count ? ` × ${count}` : ''}`)
    .replace(/管材夹持范围[:：]?/g, 'Boru bağlama aralığı: ').replace(/圆管φ/g, 'Yuvarlak boru φ').replace(/方管(?=\d)/g, 'Kare boru ')
    .replace(/[（(]小Y[)）]/g, ' (küçük Y)')
    .replace(/[（(]含独立配电柜[)）]/g, ' (bağımsız elektrik panosu dahil)').replace(/[（(]滚柱式[)）]/g, ' (makaralı tip)').replace(/-7 axis\b/gi, ' (7 eksen)').replace(/[（(]不含开卷校平[)）]/g, ' (rulo açma ve düzleştirme hariç)')
    // Tam genişlikli Çince noktalama: ％ 、 ， （ ）
    .replace(/％/g, '%').replace(/[、，]/g, ', ').replace(/（/g, ' (').replace(/）/g, ')');
}

export function resolveLaserProfile(selectionInput: LaserSelection, models: readonly LaserCatalogModel[] = LASER_MODELS): LaserResolvedProfile {
  const selection = laserSelectionSchema.parse(selectionInput);
  if (selection.sourceRevision === HEX2026_REVISION) return resolveHex2026Profile(selection);
  const model = models.find((m) => m.code === selection.sourceModelCode && m.series === selection.series);
  if (!model) throw new Error('Lazer modeli katalogda bulunamadı.');
  const supportedPower = selection.powerKw >= model.powerMin && selection.powerKw <= model.powerMax;
  const standardCabin = selection.cabinType === model.standardCabin;
  const issues: LaserIssue[] = [...model.issues];
  if (!supportedPower) issues.push({ code: 'unsupported_power', message: 'Seçilen güç kaynakta model için doğrulanmıyor. Güce bağlı teknik değerleri elle tamamlayın.' });
  if (!standardCabin) issues.push({ code: 'unverified_cabin', message: 'Bu kabin için ağırlık, dış ölçüler, toplam güç ve trafo kapasitesi kaynağı bulunmuyor.' });
  const specs = new Map<string, LaserSpec>();
  specs.set('Lazer Gücü', { key: 'Lazer Gücü', value: String(selection.powerKw), sourceValue: String(selection.powerKw), unit: 'kW', groupCode: 'KESME' });
  for (const field of model.fields) {
    if (field.powerKw !== undefined && field.powerKw !== selection.powerKw) continue;
    const cabinSensitive = CABIN_SENSITIVE.has(field.key) || /^(?:Makine Ölçüleri|Makine Ağırlığı|Standart Makine Ağırlığı)/.test(field.key);
    const powerSensitive = POWER_SENSITIVE.has(field.key) || /Motor Gücü|Motoru$/.test(field.key) || /(?:≤|≥|<|>)?\d+(?:[.-]\d+)?\s*kw\s*[:：]/i.test(field.rawValue);
    const blocked = (!standardCabin && cabinSensitive) || (!supportedPower && powerSensitive);
    const resolved = blocked ? undefined : resolveField(field, selection);
    const split = isMissing(resolved) ? { value: '', unit: field.unit } : splitUnit(displayLaserSourceValue(resolved!), field.unit);
    const prior = specs.get(field.key);
    if (prior?.value && !split.value) continue;
    specs.set(field.key, { key: field.key, groupCode: field.groupCode, ...split, source: field.source, sourceValue: split.value, isManual: false });
  }
  if (!LASER_TUBE_SERIES.includes(selection.series)) {
    const table = TABLE_CATALOG[selection.series];
    if (table && !specs.has('Tabla Değişim Tipi')) specs.set('Tabla Değişim Tipi', { key: 'Tabla Değişim Tipi', value: table.value, sourceValue: table.value, groupCode: 'TABLA', source: { document: CATALOG_DOCUMENT, page: table.page } });
    for (const material of ['Çelik', 'Paslanmaz', 'Alüminyum']) {
      const key = `Maks. Kesme Kalınlığı (${material})`;
      if (!specs.has(key)) specs.set(key, { key, value: '', sourceValue: '', unit: 'mm', groupCode: 'KESME' });
    }
  }
  for (const [key, unit] of [['Makine Ölçüleri', 'mm'], ['Makine Ağırlığı', 'kg'], ['Toplam Güç Gereksinimi', 'kW'], ['Trafo Kapasitesi', 'kVA'], ['Kontrol Ünitesi', ''], ['Kesme Kafası', ''], ['Rezonatör Markası', '']] as const) {
    if (!specs.has(key)) specs.set(key, { key, value: '', sourceValue: '', unit, groupCode: 'GENEL' });
  }
  const missing = [...specs.values()].filter((spec) => !spec.value);
  if (missing.length) issues.push({ code: 'missing_values', message: `${missing.length} teknik alan için kaynak değeri bulunmuyor veya seçim doğrulanmıyor.` });
  return { selection, profileId: null, sourceRevision: LASER_SOURCE_REVISION, modelLabel: model.code, sizeLabel: specs.get('Kesme Alanı')?.value ? `${formatArea(specs.get('Kesme Alanı')!.value)} mm` : model.sizeLabel, supportedPower, standardCabin, specs: [...specs.values()], issues };
}

function catalogExtras(base: LaserCatalogModel[]): LaserCatalogModel[] {
  const extra: LaserCatalogModel[] = [];
  const configurations = [
    { code: 'F6520', series: 'F', area: '6550*2030mm', max: 20, speed: '115m/min', positioning: '0.05mm', repeat: '0.03mm', acceleration: '0.8G', page: 10 },
    { code: 'F8025', series: 'F', area: '8050*2530mm', max: 20, speed: '150m/min', positioning: '0.03mm', repeat: '0.02mm', acceleration: '1.5G', page: 10 },
    { code: 'PG8025', series: 'PG', area: '8050*2530mm', max: 40, speed: '120m/min', positioning: '0.03mm', repeat: '0.02mm', acceleration: '1.5G', page: 8 },
    { code: 'TG6016', series: 'TG', area: 'Yuvarlak boru φ15-160mm\nKare boru 15*15-160*160mm', max: 3, speed: '', positioning: '', repeat: '', acceleration: '1.5G', page: 18 },
  ] as const;
  for (const item of configurations) {
    const source: LaserFieldSource = { document: CATALOG_DOCUMENT, page: item.page };
    const fields: LaserSourceField[] = [];
    const add = (key: string, rawValue: string, groupCode = 'GENEL', unit?: string) => fields.push({ key, rawValue, groupCode, unit, source: { ...source, rawValue } });
    const workingArea = item.series === 'TG' ? undefined : item.area.replace('mm', '').replace('*', ' × ');
    if (item.series === 'TG') {
      add('Boru Ölçü Aralığı', item.area, 'KESME'); add('Maksimum Boru İşleme Uzunluğu', '6300mm', 'KESME');
      add('Maksimum Ayna Dönüş Hızı', '120r/min', 'KESME');
      add('X Eksen Motor Gücü', '0.75kW', 'MOTORLAR'); add('Y Eksen Motor Gücü', '2.9kW', 'MOTORLAR');
      add('Z Eksen Motor Gücü', '0.75kW', 'MOTORLAR'); add('B Eksen Motor Gücü', '2.9+1.8kW', 'MOTORLAR');
    } else {
      add('Kesme Alanı', item.area, 'KESME'); add('Tabla Boyutu', item.area, 'TABLA');
      add('Maks. Eksen Hızı', item.speed, 'KESME'); add('Konumlama Hassasiyeti', item.positioning, 'KESME');
      add('Tekrarlama Hassasiyeti', item.repeat, 'KESME');
      if (item.code === 'F6520') {
        add('X Eksen Motor Gücü', '≤6kW:0.85kW\n8-20kW:1.3kW', 'MOTORLAR', 'kW');
        add('Y Eksen Motor Gücü', '≤6kW:0.85kW*2\n8-20kW:1.8kW*2', 'MOTORLAR', 'kW');
        add('Z Eksen Motor Gücü', '≤6kW:0.4kW\n8-20kW:0.75kW', 'MOTORLAR', 'kW');
      } else if (item.code === 'F8025') {
        add('X Eksen Motor Gücü', '6kW:0.85kW\n>6kW:1.3kW', 'MOTORLAR', 'kW');
        add('Y Eksen Motor Gücü', '6kW:1.8kW*2\n>6kW:2.9kW*2', 'MOTORLAR', 'kW');
        add('Z Eksen Motor Gücü', '6kW:0.4kW\n>6kW:0.75kW', 'MOTORLAR', 'kW');
      } else {
        add('X Eksen Motor Gücü', '1.3kW', 'MOTORLAR'); add('Y Eksen Motor Gücü', '6kW:1.8kW*2\n≥8kW:2.9kW*2', 'MOTORLAR', 'kW'); add('Z Eksen Motor Gücü', '0.75kW', 'MOTORLAR');
      }
    }
    add('Maksimum İvme', item.acceleration, 'EKSENLER'); add('Vidalı Mil', 'TBI');
    // Only explicitly series-wide standards may complement PDF-only models, never another model's mechanical data.
    const standardFields = base.find((model) => model.series === item.series)?.fields.filter((f) => f.source.sheet === 'Standart Yapılandırma') ?? [];
    fields.push(...standardFields.filter((field) => !fields.some((existing) => existing.key === field.key)));
    extra.push({ code: item.code, series: item.series, productTypeCode: item.series === 'TG' ? 'BORU_LAZER_KESIM' : 'FIBER_LAZER_KESIM', standardCabin: item.series === 'F' ? 'open' : 'closed', powerMin: 1.5, powerMax: item.max, workingArea, sizeLabel: workingArea ? `${workingArea} mm` : item.area.replace('\n', ' / '), fields, issues: [] });
  }
  return extra;
}

// 2026 kitabından çıkarılan modeller (R, TE, F6525, GR 14–20 kW, GR4000, TZ12070) mevcut kart ve
// tekliflerde kalır: bunlar eski kitaptan, kendi standart sayfasıyla ve model bütünüyle çözülür.
const currentModels = parseLaserWorkbookSheets(AORE_WORKBOOK_SHEETS, EXCEL_DOCUMENT).models;
const importedModels = [
  ...currentModels,
  ...parseLaserWorkbookSheets(AORE_LEGACY_WORKBOOK_SHEETS, LASER_LEGACY_EXCEL_DOCUMENT).models.filter((model) => !currentModels.some((current) => current.series === model.series && current.code === model.code)),
];
/** Workbook fields are primary; catalog supplements never resolve a missing power branch with another source. */
export function mergeLaserCatalogModels(primary: readonly LaserCatalogModel[], supplemental: readonly LaserCatalogModel[]): LaserCatalogModel[] {
  const merged = primary.map((model) => ({ ...model, fields: [...model.fields], issues: [...model.issues] }));
  const aliases: Record<string, string> = { 'Tabla Tipi': 'Tabla Değişim Tipi', 'Desteklenen Lazer Gücü': 'Kaynakta Desteklenen Güç', 'Eğimli Kesim Çalışma Alanı': '45° Pah Kesim Alanı', '45° Eğimli Kesim Çalışma Alanı': '45° Pah Kesim Alanı' };
  for (const incoming of supplemental) {
    const fields = incoming.fields.map((field) => ({ ...field, key: aliases[field.key] ?? field.key }));
    const existing = merged.find((model) => model.code === incoming.code && model.series === incoming.series);
    if (!existing) { merged.push({ ...incoming, fields, issues: [...incoming.issues] }); continue; }
    existing.issues.push(...incoming.issues);
    if (existing.powerMin !== incoming.powerMin || existing.powerMax !== incoming.powerMax) existing.issues.push({ code: 'source_conflict', field: 'Kaynakta Desteklenen Güç', message: `Excel ${existing.powerMin}–${existing.powerMax} kW; katalog ${incoming.powerMin}–${incoming.powerMax} kW. Excel esas alındı.`, sources: [existing.fields.find((field) => field.key === 'Kaynakta Desteklenen Güç')?.source, fields.find((field) => field.key === 'Kaynakta Desteklenen Güç')?.source].filter((source): source is LaserFieldSource => Boolean(source)) });
    existing.standardCabin ??= incoming.standardCabin;
    const equivalentValue = (value: string) => value.replace(/(\d),(\d)/g, '$1.$2').replace(/[×*]/g, 'x').replace(/[–—]/g, '-').replace(/\s+/g, '').toLowerCase();
    for (const field of fields) {
      // A second representation of a tube capacity must not contradict the workbook's complete range.
      const prior = existing.fields.find((entry) => entry.key === field.key || (['Yuvarlak Boru Çapı', 'Kare Boru Kenar Uzunluğu'].includes(field.key) && entry.key === 'Boru Ölçü Aralığı'));
      if (!prior) { existing.fields.push(field); continue; }
      if (equivalentValue(prior.rawValue) !== equivalentValue(field.rawValue)) existing.issues.push({ code: 'source_comparison', field: prior.key, message: 'Excel ve katalogda farklı değer veya ifade bulunuyor. Excel değeri korundu.', sources: [prior.source, field.source] });
    }
  }
  return merged;
}
export const LASER_MODELS: readonly LaserCatalogModel[] = mergeLaserCatalogModels([...importedModels, ...catalogExtras(importedModels)], LASER_PDF_MODELS);

function noteConflict(code: string, field: string, message: string, page: number, cell?: string) {
  const model = LASER_MODELS.find((model) => model.code === code);
  if (!model) return;
  model.issues.push({ code: 'source_conflict', field, message, sources: [{ document: EXCEL_DOCUMENT, sheet: `${model.series}系列`, cell }, { document: CATALOG_DOCUMENT, page }] });
}
noteConflict('PG3015', 'Desteklenen Güç', 'Katalog 1,5–40 kW; model Excel’i 1,5–20 kW. Excel esas alındı.', 8, 'E13');
noteConflict('PG3015', 'Maks. Eksen Hızı', 'Katalog 120 m/dk; Excel 115 m/dk. Excel esas alındı.', 8, 'E4');
noteConflict('TG6035', 'Boru Ölçü Aralığı', 'Katalog alt sınır 15 mm; Excel 20 mm. Excel esas alındı.', 18, 'G5');
noteConflict('TG6035', 'Y Eksen Motor Gücü', 'Katalog 2,9 kW; Excel 4,4 kW. Excel esas alındı.', 18, 'G17');
noteConflict('TG6035', 'B Eksen Motor Gücü', 'Katalog 2,9+2,9 kW; Excel 4,4+2,9 kW. Excel esas alındı.', 18, 'G20');

export const isLaserProductType = (code?: string | null) => code === 'FIBER_LAZER_KESIM' || code === 'BORU_LAZER_KESIM';
export const laserSelectionKey = (selection: LaserSelection) => [selection.sourceRevision ?? LASER_SOURCE_REVISION, selection.productTypeCode, selection.series, selection.sourceModelCode, selection.cabinType, selection.powerKw].join(':');

/** Catalog association survives renamed selling brands; names support existing installations. */
export const isSupportedLaserBrand = (name?: string | null, technicalCatalogCode?: string | null) => technicalCatalogCode === 'AORE_LASER' || /\b(?:hex\s*laser|aore)\b/i.test(name ?? '');

/** Resolve the exact 2026 PDF column; never borrow data from a nearby model or old workbook. */
export function resolveHex2026Profile(selection: LaserSelection): LaserResolvedProfile {
  const row = HEX2026_SERIES.find(row => row.series === selection.series)!;
  const configuration = findHex2026Configuration(selection.series, selection.sourceModelCode)!;
  const bounds = hex2026PowerBounds(configuration);
  const supportedPower = Boolean(bounds && selection.powerKw >= bounds.min && selection.powerKw <= bounds.max);
  const standardCabin = row.standardCabin !== null && row.standardCabin === selection.cabinType;
  const issues: LaserIssue[] = [];
  const specs: LaserSpec[] = [{ key: 'Lazer Gücü', value: String(selection.powerKw), unit: 'kW', groupCode: 'KESME', isManual: !row.powerOptions.includes(selection.powerKw) }];
  if (!supportedPower) issues.push({ code: 'unsupported_power', message: 'Seçilen güç HEX 2026 modelinin kaynak aralığı dışında.' });
  if (!standardCabin) issues.push({ code: 'unverified_cabin', message: 'Seçilen kabin bu seride doğrulanmadı; kabine bağlı teknik değerler elle doğrulanmalı.' });
  if (!row.powerOptions.includes(selection.powerKw)) issues.push({ code: 'manual_power_review', message: 'Kaynak yalnız güç aralığı veriyor; bu özel güç konfigürasyonu teknik doğrulama gerektirir.' });
  for (const field of configuration.fields) {
    if (field.key === 'Lazer Gücü') continue;
    const sensitive = /Motor|Güç|Trafo/.test(field.key);
    const cabinSensitive = /Ekipman Boyutu|Ağırlık/.test(field.key);
    const branch = hex2026PowerBranch(field, selection.powerKw);
    const reviewed = field.powerBranches?.length ? Boolean(branch) : field.verification === 'verified';
    const blocked = !reviewed || (!supportedPower && (sensitive || Boolean(field.powerBranches?.length))) || (!standardCabin && cabinSensitive);
    const split = blocked ? { value: '', unit: '' } : branch ? { value: branch.value, unit: branch.unit } : splitUnit(field.rawValue, /Alanı|Uzunluğu|Çapı|Boyutu|Hassasiyeti/.test(field.key) ? 'mm' : undefined);
    specs.push({ key: field.key, ...split, source: { ...field.source, verification: reviewed ? 'verified' : field.verification }, sourceValue: split.value, groupCode: sensitive ? 'MOTORLAR' : 'GENEL', isManual: false });
    if (blocked) issues.push({ code: 'needs_review', field: field.key, message: 'Bu alanın kaynak koşulu doğrulanmadan otomatik değer atanmaz.', sources: [field.source] });
  }
  const area = specs.find(field => /^Çalışma Alanı/.test(field.key));
  return { selection, profileId: null, sourceRevision: HEX2026_REVISION, modelLabel: configuration.sourceModelCode, sizeLabel: area?.value ? `${area.value} ${area.unit ?? ''}`.trim() : configuration.sourceModelCode, supportedPower, standardCabin, specs, issues };
}
