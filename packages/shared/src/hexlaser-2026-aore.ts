import { HEX2026_SUPPLEMENT_DOCUMENT } from './hexlaser-2026-supplement-data';
import { findHex2026Configuration } from './hexlaser-2026';
import { HEX2026_AORE_KEYS, LASER_EXCEL_DOCUMENT, LASER_MODELS, displayLaserSourceValue, hex2026AoreCode, type LaserCatalogModel } from './laser';

const CAPTURED_AT = '2026-09-14';
// 'Kaynakta Desteklenen Güç' ayrı "Lazer Gücü" alanından gelir.
const DROPPED_KEYS = new Set(['Kaynakta Desteklenen Güç', 'Tabla Boyutu']);

export interface Hex2026AoreField { key: string; rawValue: string; verification: string; source: { document: string; page: number; capturedAt: string; sourceModelCode: string; rawValue: string } }

export { hex2026AoreCode } from './laser';

const decimal = (value: number) => String(value).replace('.', ',');

/** AORE kitabındaki modelin alanlarını HEX baz kart alanlarına çevirir (güce bağlı satırlar "3 kW: …"). */
export function hex2026AoreFields(model: LaserCatalogModel, document = HEX2026_SUPPLEMENT_DOCUMENT): Hex2026AoreField[] {
  const source = (rawValue: string) => ({ document, page: 0, capturedAt: CAPTURED_AT, sourceModelCode: model.code, rawValue });
  const fields: Hex2026AoreField[] = [];
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
    const key = HEX2026_AORE_KEYS[field.key] ?? field.key;
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

/** Güncel AORE kitabında (2026) kendi sayfasından alanı olan model. */
export const isAoreWorkbookModel = (model: LaserCatalogModel) =>
  model.fields.some((field) => field.source.document === LASER_EXCEL_DOCUMENT && field.source.sheet !== 'Standart Yapılandırma');

/**
 * Baz kart alt modelinin tam teknik bilgisi: HEX PDF'inde doğrulanmış alanlar önce, AORE kitabında
 * aynı modelin PDF'te doğrulanmış karşılığı olmayan alanları ardından. PDF'te olmayan modelin alanları zaten kitaptandır.
 */
export function hex2026TechnicalFields(series: string, code: string) {
  const configuration = findHex2026Configuration(series, code);
  if (!configuration) return [];
  const model = LASER_MODELS.find((entry) => {
    if (!isAoreWorkbookModel(entry)) return false;
    const hex = hex2026AoreCode(entry);
    return hex.series === series && hex.code.toLowerCase() === code.toLowerCase();
  });
  // İncelenmemiş PDF değeri (ör. motor gücü) gösterilmez; kitapta varsa onun yerini kitap alır.
  const fields = configuration.fields.filter((field) => field.verification === 'verified' || field.verification === 'aore_excel');
  if (!model) return fields;
  return [...fields, ...hex2026AoreFields(model).filter((field) => !fields.some((known) => known.key === field.key))];
}
