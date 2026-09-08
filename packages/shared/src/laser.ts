import { z } from 'zod';
import { AORE_WORKBOOK_SHEETS, AORE_LABEL_ALIASES } from './laser-source-data';

export const LASER_POWERS = [3, 6, 12, 20, 30] as const;
export const LASER_SERIES = ['F', 'PG', 'TG'] as const;
export const LASER_SOURCE_REVISION = 'aore-excel-haksan-2025-v1';
export const laserSeriesSchema = z.enum(LASER_SERIES);
export const laserCabinTypeSchema = z.enum(['open', 'closed']);
export const laserPowerSchema = z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(20), z.literal(30)]);
export const laserProductTypeSchema = z.enum(['FIBER_LAZER_KESIM', 'BORU_LAZER_KESIM']);
export const laserSelectionSchema = z.object({
  productTypeCode: laserProductTypeSchema,
  series: laserSeriesSchema,
  cabinType: laserCabinTypeSchema,
  powerKw: laserPowerSchema,
  sourceModelCode: z.string().trim().regex(/^(?:F|PG|TG)\d{4}$/).max(32),
}).superRefine((value, ctx) => {
  if (!value.sourceModelCode.startsWith(value.series) || (value.series === 'TG') !== (value.productTypeCode === 'BORU_LAZER_KESIM')) {
    ctx.addIssue({ code: 'custom', message: 'Seri, model ve lazer ürün tipi eşleşmiyor.' });
  }
});
export type LaserSelection = z.infer<typeof laserSelectionSchema>;
export const laserFieldSourceSchema = z.object({
  document: z.string().max(512), sheet: z.string().max(128).optional(), cell: z.string().max(32).optional(),
  page: z.number().int().positive().optional(), url: z.string().url().max(2048).optional(), rawValue: z.string().max(4000).optional(),
});
export type LaserFieldSource = z.infer<typeof laserFieldSourceSchema>;
export const laserSpecSchema = z.object({
  key: z.string().trim().min(1).max(255), value: z.string().max(2000), unit: z.string().max(64).optional(),
  groupCode: z.string().max(64).optional(), groupName: z.string().max(128).optional(), source: laserFieldSourceSchema.optional(),
  sourceValue: z.string().max(2000).optional(), sourceUnit: z.string().max(64).optional(), isManual: z.boolean().optional(),
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
});
export type LaserTechnicalConfiguration = z.infer<typeof laserTechnicalConfigurationSchema>;
export type LaserResolvedProfile = LaserTechnicalConfiguration;
export type LaserSeries = LaserSelection['series'];
export type LaserCabinType = LaserSelection['cabinType'];

export interface LaserSourceField { key: string; rawValue: string; groupCode: string; unit?: string; powerKw?: number; source: LaserFieldSource }
export interface LaserCatalogModel {
  code: string; series: LaserSeries; productTypeCode: LaserSelection['productTypeCode']; sizeLabel: string;
  workingArea?: string; standardCabin: LaserCabinType; powerMin: number; powerMax: number;
  fields: LaserSourceField[]; issues: LaserIssue[];
}
export interface LaserWorkbookSheet {
  name: string; rows: string[][];
  /** Inclusive, one-based Excel coordinates. */
  merges?: Array<{ startRow: number; endRow: number; startColumn: number; endColumn: number }>;
}

const EXCEL_DOCUMENT = 'AORE_Teknik_Parametreler_Turkce(1).xlsx';
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
const DEFINITIONS = new Map(FIELD_DEFINITIONS.map(([label, key, groupCode, unit]) => [normalize(label), { key, groupCode, unit }]));
const canonicalLabel = (label: string) => (AORE_LABEL_ALIASES as Record<string, string>)[label.trim()] ?? label;

export function parseLaserWorkbookSheets(sheets: LaserWorkbookSheet[], fileName: string): { models: LaserCatalogModel[]; issues: LaserIssue[] } {
  const models: LaserCatalogModel[] = [];
  const issues: LaserIssue[] = [];
  const standards = sheets.find((s) => s.rows.some((row) => row.includes('F') && row.includes('PG') && row.includes('TG')));
  for (const sheet of sheets) {
    const headerIndex = sheet.rows.findIndex((row) => row.filter((cell) => /^(?:F|PG|TG)-?\d{4}$/.test(cell.trim())).length > 0);
    if (headerIndex < 0) continue;
    const header = sheet.rows[headerIndex];
    for (let col = 0; col < header.length; col++) {
      const code = header[col].trim().replace('-', '');
      const match = code.match(/^(F|PG|TG)\d{4}$/);
      if (!match) continue;
      const series = match[1] as LaserSeries;
      const fields: LaserSourceField[] = [];
      let powerMin = 0; let powerMax = 0; let workingArea: string | undefined; let sizeLabel = '';
      for (let index = headerIndex + 1; index < sheet.rows.length; index++) {
        const row = sheet.rows[index];
        const label = canonicalLabel(row[3] ?? '');
        const merge = sheet.merges?.find((m) => index + 1 >= m.startRow && index + 1 <= m.endRow && col + 1 >= m.startColumn && col + 1 <= m.endColumn);
        const sourceRow = merge ? merge.startRow - 1 : index;
        const sourceCol = merge ? merge.startColumn - 1 : col;
        const rawValue = (sheet.rows[sourceRow]?.[sourceCol] ?? '').trim();
        if (normalize(label) === normalize('Modelin desteklediği güç')) {
          const powers = rawValue.replace(/,/g, '.').match(/\d+(?:\.\d+)?/g);
          if (powers?.length === 2) [powerMin, powerMax] = powers.map(Number);
          continue;
        }
        const source: LaserFieldSource = { document: fileName, sheet: sheet.name, cell: `${columnName(sourceCol)}${sourceRow + 1}`, rawValue };
        const powerLabel = label.match(/^(\d+(?:[.,]\d+)?)\s*kW lazer kaynağı/i) ?? label.match(/with\s*(\d+(?:[.,]\d+)?)\s*kw\s*source/i);
        if (powerLabel) {
          const powerKw = Number(powerLabel[1].replace(',', '.'));
          fields.push({ key: 'Toplam Güç Gereksinimi', groupCode: 'GENEL', unit: 'kW', rawValue, source, powerKw });
          fields.push({ key: 'Trafo Kapasitesi', groupCode: 'GENEL', unit: 'kVA', rawValue, source, powerKw });
          continue;
        }
        const definition = DEFINITIONS.get(normalize(label));
        if (!definition) continue;
        fields.push({ ...definition, rawValue, source });
        if (definition.key === 'Kesme Alanı') {
          workingArea = rawValue.replace(/mm/gi, '').replace(/[x×*]/g, ' × ').trim().replace(/\s+/g, ' ');
          sizeLabel = `${workingArea} mm`;
          fields.push({ ...definition, key: 'Tabla Boyutu', groupCode: 'TABLA', rawValue, source });
        }
        if (definition.key === 'Boru Ölçü Aralığı') sizeLabel = rawValue.split('\n').slice(0, 2).join(' / ');
      }
      if (standards) {
        const seriesRow = standards.rows.findIndex((row) => row.includes('F') && row.includes('PG') && row.includes('TG'));
        const seriesCol = standards.rows[seriesRow].indexOf(series);
        for (let index = seriesRow + 1; index < standards.rows.length; index++) {
          const row = standards.rows[index];
          const definition = DEFINITIONS.get(normalize(canonicalLabel(row[0] ?? '')));
          if (!definition) continue;
          const rawValue = (row[seriesCol] ?? '').trim();
          const source = { document: fileName, sheet: standards.name, cell: `${columnName(seriesCol)}${index + 1}`, rawValue };
          // Model-specific details remain primary; series-wide defaults only fill absent fields.
          if (!fields.some((f) => f.key === definition.key)) fields.push({ ...definition, rawValue, source });
        }
      }
      const modelIssues: LaserIssue[] = [];
      if (!sizeLabel || !powerMax) modelIssues.push({ code: 'missing_model_metadata', message: `${code}: çalışma kapasitesi veya desteklenen güç bilgisi eksik.` });
      const existing = models.find((m) => m.code === code);
      if (existing) {
        if (JSON.stringify(existing.fields.map((f) => [f.key, f.rawValue])) !== JSON.stringify(fields.map((f) => [f.key, f.rawValue]))) {
          issues.push({ code: 'duplicate_model_conflict', message: `${code} birden fazla sayfada farklı değerler içeriyor; ilk sayfa korundu.` });
        }
        continue;
      }
      models.push({ code, series, productTypeCode: series === 'TG' ? 'BORU_LAZER_KESIM' : 'FIBER_LAZER_KESIM', standardCabin: series === 'F' ? 'open' : 'closed', powerMin, powerMax, workingArea, sizeLabel, fields, issues: modelIssues });
    }
  }
  if (!models.length) issues.push({ code: 'no_laser_models', message: 'F, PG veya TG model sütunları bulunamadı.' });
  return { models, issues };
}

/** Resolve one source rule without evaluating source text as executable code. */
export function resolveLaserPowerRule(raw: string, power: number): string | undefined {
  const text = raw.replace(/：/g, ':').replace(/(\d),(\d)/g, '$1.$2').replace(/[–—]/g, '-').replace(/12--40/g, '12-40');
  const lines = text.split(/[\n;]/).map((line) => line.trim()).filter(Boolean);
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
  let value = raw.trim();
  if (value === '●') return { value: 'Standart' };
  if (value === '○') return { value: 'Opsiyonel' };
  if (value === '×') return { value: 'Yok' };
  const match = value.match(/^(.*?)(mm\/m|m\/min|r\/min|kg|mm|kw|kva|G)\s*$/i);
  if (match) {
    const found = match[2].toLowerCase();
    const unit = ({ 'm/min': 'm/dk', 'r/min': 'dev/dk', kw: 'kW', kva: 'kVA', g: 'G' } as Record<string, string>)[found] ?? found;
    value = match[1].trim();
    return { value: value.replace(/kw(?=\s*[*+])/gi, ''), unit };
  }
  if (defaultUnit === 'kW') value = value.replace(/kw/gi, '').trim();
  if (defaultUnit === 'sn') value = value.replace(/s(?=\s*\()/i, '');
  return { value, unit: defaultUnit };
}

function resolveField(field: LaserSourceField, selection: LaserSelection): string | undefined {
  if (field.powerKw !== undefined) {
    if (field.powerKw !== selection.powerKw || isMissing(field.rawValue)) return undefined;
    const split = field.rawValue.match(/^\s*([\d.,]+)\s*kw\s*\/\s*([\d.,]+)\s*kva\s*$/i);
    return split ? split[field.key === 'Trafo Kapasitesi' ? 2 : 1].replace(',', '.') : undefined;
  }
  if (selection.series === 'TG' && field.key === 'Kontrol Ünitesi') {
    // Source rules use chuck size, not laser power. Never assume an unspecified TG6016 controller.
    const diameter = ({ TG6012: 120, TG6020: 230, TG6035: 350 } as Record<string, number>)[selection.sourceModelCode];
    const flat = field.rawValue.replace(/\n/g, ' ').replace(/：/g, ':');
    const entries = [...flat.matchAll(/(\d+)(?:-(\d+))?\s*(?:ayna|卡盘)\s*:\s*(FSCUT[\w-]+)/gi)];
    return entries.find((entry) => diameter >= Number(entry[1]) && diameter <= Number(entry[2] ?? entry[1]))?.[3];
  }
  if (selection.series === 'TG' && field.key === 'Kesme Kafası' && selection.sourceModelCode === 'TG6012') {
    const special = field.rawValue.match(/TG6012\s*[:：]\s*([\w-]+)/i);
    if (special) return special[1];
  }
  return resolveLaserPowerRule(field.rawValue, selection.powerKw);
}

export function resolveLaserProfile(selectionInput: LaserSelection, models: readonly LaserCatalogModel[] = LASER_MODELS): LaserResolvedProfile {
  const selection = laserSelectionSchema.parse(selectionInput);
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
    const blocked = (!standardCabin && CABIN_SENSITIVE.has(field.key)) || (!supportedPower && POWER_SENSITIVE.has(field.key));
    const resolved = blocked ? undefined : resolveField(field, selection);
    const split = isMissing(resolved) ? { value: '', unit: field.unit } : splitUnit(resolved!, field.unit);
    const prior = specs.get(field.key);
    if (prior?.value && !split.value) continue;
    specs.set(field.key, { key: field.key, groupCode: field.groupCode, ...split, source: field.source, sourceValue: split.value, isManual: false });
  }
  if (selection.series !== 'TG') {
    specs.set('Tabla Değişim Tipi', { key: 'Tabla Değişim Tipi', value: selection.series === 'F' ? 'Tek tabla' : 'Değişimli çift tabla', sourceValue: selection.series === 'F' ? 'Tek tabla' : 'Değişimli çift tabla', groupCode: 'TABLA', source: { document: CATALOG_DOCUMENT, page: selection.series === 'F' ? 10 : 8 } });
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
  return { selection, profileId: null, sourceRevision: LASER_SOURCE_REVISION, modelLabel: model.code, sizeLabel: model.sizeLabel, supportedPower, standardCabin, specs: [...specs.values()], issues };
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

const importedModels = parseLaserWorkbookSheets(AORE_WORKBOOK_SHEETS, EXCEL_DOCUMENT).models;
export const LASER_MODELS: readonly LaserCatalogModel[] = [...importedModels, ...catalogExtras(importedModels)];

function noteConflict(code: string, field: string, message: string, page: number, cell?: string) {
  const model = LASER_MODELS.find((model) => model.code === code);
  if (!model) return;
  model.issues.push({ code: 'source_conflict', field, message, sources: [{ document: EXCEL_DOCUMENT, sheet: `${model.series} Serisi`, cell }, { document: CATALOG_DOCUMENT, page }] });
}
noteConflict('PG3015', 'Desteklenen Güç', 'Katalog 1,5–40 kW; model Excel’i 1,5–20 kW. Excel esas alındı.', 8, 'E13');
noteConflict('PG3015', 'Maks. Eksen Hızı', 'Katalog 120 m/dk; Excel 115 m/dk. Excel esas alındı.', 8, 'E4');
noteConflict('TG6035', 'Boru Ölçü Aralığı', 'Katalog alt sınır 15 mm; Excel 20 mm. Excel esas alındı.', 18, 'G5');
noteConflict('TG6035', 'Y Eksen Motor Gücü', 'Katalog 2,9 kW; Excel 4,4 kW. Excel esas alındı.', 18, 'G17');
noteConflict('TG6035', 'B Eksen Motor Gücü', 'Katalog 2,9+2,9 kW; Excel 4,4+2,9 kW. Excel esas alındı.', 18, 'G20');

export const isLaserProductType = (code?: string | null) => code === 'FIBER_LAZER_KESIM' || code === 'BORU_LAZER_KESIM';
export const laserSelectionKey = (selection: LaserSelection) => [selection.productTypeCode, selection.series, selection.sourceModelCode, selection.cabinType, selection.powerKw].join(':');
