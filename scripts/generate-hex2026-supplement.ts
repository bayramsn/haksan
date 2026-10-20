/**
 * HEX 2026 PDF'inde olmayan ama AORE teknik çalışma kitabında bulunan modelleri
 * HEX LASER baz kartlarına alt model olarak ekleyen veri dosyasını üretir.
 *
 *   cd apps/api && node --import tsx ../../scripts/generate-hex2026-supplement.ts
 *
 * PDF modelleri asla değiştirilmez; yalnız eksik kodlar ve PDF'te hiç olmayan seriler eklenir.
 * Excel değişince önce generate-aore-workbook-source.py, sonra bu betik çalıştırılır.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { HEXLASER_2026_MANIFEST } from '../packages/shared/src/hexlaser-2026-data';
import { LASER_EXCEL_DOCUMENT, LASER_MODELS, displayLaserSourceValue, type LaserCatalogModel } from '../packages/shared/src/laser';

const SOURCE_DOCUMENT = 'Technical Parameters 2026.9.14.xlsx';
const CAPTURED_AT = '2026-09-14';
// AORE 2026 kitabından çıkan (R, TE) ya da yalnız PDF kataloğundan gelen (EG, EGT) seriler eklenmez.
const SKIPPED_SERIES = new Set(['R', 'TE', 'EG', 'EGT']);
const NEW_SERIES_KIND: Record<string, string> = { FB: 'sheet', TA: 'tube', V: 'tube', M: 'tube' };
const HEX_KEYS: Record<string, string> = {
  'Kesme Alanı': 'Çalışma Alanı (mm)',
  'Konumlama Hassasiyeti': 'Pozisyonlama Hassasiyeti',
  'Maks. Eksen Hızı': 'Maksimum Hareket Hızı',
  'Maksimum İvme': 'Maksimum Hızlanma',
};
const DROPPED_KEYS = new Set(['Kaynakta Desteklenen Güç', 'Tabla Boyutu']);

type Manifest = { series: Array<{ series: string; configurations: Array<{ sourceModelCode: string }> }> };
const manifest = HEXLASER_2026_MANIFEST as unknown as Manifest;

/** AORE kodunu ilgili HEX serisinin yazım biçimine çevirir (F6015 → F-6015, PG6020+T6-230 → PGT6020). */
function hexSeriesAndCode(model: LaserCatalogModel): { series: string; code: string } {
  let match: RegExpMatchArray | null;
  if (model.series === 'FT' && (match = model.code.match(/^F(\d{4})\+T/))) return { series: 'FT', code: `FT-${match[1]}` };
  if (model.series === 'PGT' && (match = model.code.match(/^PG(\d{4})\+T/))) return { series: 'PGT', code: `PGT${match[1]}` };
  if (model.series === 'GR' && (match = model.code.match(/^GR(\d{4})(Pro)?-(\d+)$/i))) return { series: 'GR', code: `${match[1]}${match[2] ? 'pro' : ''}-${match[3]}` };
  const existing = manifest.series.find((row) => row.series === model.series);
  const dashed = existing?.configurations.some((row) => /^[A-Z]+-\d/.test(row.sourceModelCode));
  return { series: model.series, code: dashed ? model.code.replace(/^([A-Z]+)(\d)/, '$1-$2') : model.code };
}

const decimal = (value: number) => String(value).replace('.', ',');

function hexFields(model: LaserCatalogModel) {
  const source = (rawValue: string) => ({ document: SOURCE_DOCUMENT, page: 0, capturedAt: CAPTURED_AT, sourceModelCode: model.code, rawValue });
  const fields: Array<{ key: string; rawValue: string; verification: string; source: ReturnType<typeof source> }> = [];
  const add = (key: string, rawValue: string, raw = rawValue) => {
    const known = fields.find((field) => field.key === key);
    if (known) { if (!known.rawValue.split('\n').includes(rawValue)) known.rawValue += `\n${rawValue}`; return; }
    fields.push({ key, rawValue, verification: 'aore_excel', source: source(raw) });
  };
  if (model.powerMax) add('Lazer Gücü', `${decimal(model.powerMin)}${model.powerMin !== model.powerMax ? `-${decimal(model.powerMax)}` : ''} kW`);
  for (const field of model.fields) {
    if (DROPPED_KEYS.has(field.key) || !field.rawValue.trim() || /^[/\\-]+$/.test(field.rawValue.trim())) continue;
    const value = displayLaserSourceValue(field.rawValue).trim();
    if (!value) continue;
    const key = HEX_KEYS[field.key] ?? field.key;
    if (key === 'Çalışma Alanı (mm)') add(key, value.replace(/\s*mm$/i, '').replace(/\s*[×x*]\s*/g, 'x'), field.rawValue);
    else if (field.powerKw !== undefined) {
      // Kaynak hücre "26.8kW/40kVA": toplam güç kW, trafo kVA olarak ayrılır.
      const electrical = value.match(/([\d.,]+)\s*kw\s*\/\s*([\d.,]+)\s*kva/i);
      const single = electrical ? (key === 'Trafo Kapasitesi' ? `${electrical[2]} kVA` : `${electrical[1]} kW`) : value;
      add(key, `${decimal(field.powerKw)} kW: ${single}`, field.rawValue);
    } else add(key, value, field.rawValue);
  }
  return fields;
}

const additions: Array<{ series: string; configuration: { sourceModelCode: string; fields: ReturnType<typeof hexFields> } }> = [];
const newSeries = new Map<string, { series: string; brand: string; kind: string; page: number; standardCabin: 'open' | 'closed' | null; powerOptions: number[]; powerPolicy: string; saleStatus: string; configurations: Array<{ sourceModelCode: string; fields: ReturnType<typeof hexFields> }> }>();
for (const model of LASER_MODELS) {
  if (SKIPPED_SERIES.has(model.series) || !model.fields.some((field) => field.source.document === LASER_EXCEL_DOCUMENT && field.source.sheet !== 'Standart Yapılandırma')) continue;
  const { series, code } = hexSeriesAndCode(model);
  const pdfSeries = manifest.series.find((row) => row.series === series);
  const configuration = { sourceModelCode: code, fields: hexFields(model) };
  if (pdfSeries) {
    if (!pdfSeries.configurations.some((row) => row.sourceModelCode.toLowerCase() === code.toLowerCase())) additions.push({ series, configuration });
    continue;
  }
  const kind = NEW_SERIES_KIND[series];
  if (!kind) throw new Error(`${series} serisi için HEX türü tanımlı değil`);
  const row = newSeries.get(series) ?? { series, brand: 'HEXLASER', kind, page: 0, standardCabin: model.standardCabin, powerOptions: [], powerPolicy: 'range_is_not_discrete_options', saleStatus: 'requires_configuration_review', configurations: [] };
  row.configurations.push(configuration);
  newSeries.set(series, row);
}

const target = path.join(__dirname, '..', 'packages', 'shared', 'src', 'hexlaser-2026-supplement-data.ts');
writeFileSync(target, [
  `// Generated by scripts/generate-hex2026-supplement.ts from ${SOURCE_DOCUMENT}. Do not edit by hand.`,
  '// Models absent from the HEX 2026 PDF; PDF configurations are never overridden.',
  "import type { Hex2026Configuration, Hex2026Series } from './hexlaser-2026';",
  `export const HEX2026_SUPPLEMENT_DOCUMENT = ${JSON.stringify(SOURCE_DOCUMENT)};`,
  'export const HEX2026_SUPPLEMENT_ADDITIONS: Array<{ series: string; configuration: Hex2026Configuration }> = [',
  ...additions.map((row) => `${JSON.stringify(row)},`),
  '];',
  'export const HEX2026_SUPPLEMENT_SERIES: Hex2026Series[] = [',
  ...[...newSeries.values()].map((row) => `${JSON.stringify(row)},`),
  '];',
  '',
].join('\n'));
console.log('eklenen alt model:', additions.map((row) => `${row.series}/${row.configuration.sourceModelCode}`).join(', '));
console.log('yeni seri:', [...newSeries.values()].map((row) => `${row.series}(${row.configurations.map((c) => c.sourceModelCode).join(',')})`).join(' '));
