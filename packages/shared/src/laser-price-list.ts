import { HEX2026_SERIES } from './hexlaser-2026';

/**
 * Tedarikçi lazer fiyat listesi (WHALE LASER / AORE "Price List" çalışma kitabı).
 * Fiyatlar FOB USD alış maliyetidir; satış fiyatı CRM'de ayrıca belirlenir.
 * Hücreler düz metin satırları olarak gelir (0 tabanlı satır/sütun).
 */
export interface LaserPriceListSheet { name: string; rows: string[][] }

export interface LaserPriceRow {
  /** Fiyat listesindeki yazım (ör. `F3015+T6`). */
  priceModelCode: string;
  powerKw: number;
  costUsd: number;
  container?: string;
  leadTimeDays?: number;
  sheet: string;
  cell: string;
}

export interface LaserPriceAccessory { name: string; costUsd: number; sheet: string; cell: string }
export interface LaserPriceOptionNote { priceModelCode: string; label: string; rawValue: string; sheet: string; cell: string }

export interface LaserPriceListParseResult {
  prices: LaserPriceRow[];
  accessories: LaserPriceAccessory[];
  optionNotes: LaserPriceOptionNote[];
  issues: string[];
}

const MODEL_CODE = /^(?:[A-Z]{1,3}\d[\w+\-]*|HW)$/;
const POWER_LABEL = /^(\d+(?:[.,]\d+)?)\s*kw$/i;

const columnName = (index: number) => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};
const cellRef = (row: number, col: number) => `${columnName(col)}${row + 1}`;
const numeric = (value: string | undefined) => {
  const text = (value ?? '').trim().replace(/\s/g, '');
  return /^\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : undefined;
};
const powerOf = (label: string | undefined) => {
  const match = (label ?? '').trim().match(POWER_LABEL);
  return match ? Number(match[1]!.replace(',', '.')) : undefined;
};

/** "Üretim Süresi" sayfasındaki seri + kısa model yazımını fiyat listesi koduna çevirir. */
export function leadTimeModelCodes(series: string, model: string): string[] {
  const text = model.trim();
  if (!text) return [];
  if (/^[A-Z]/.test(text)) return [text];
  const prefix = series === 'FT' ? 'F' : series === 'PGT' ? 'PG' : series;
  return text.split('\\').map((part, index, parts) => {
    // GR satırı "2500-6\12" iki kodu tek hücrede taşır.
    const code = index > 0 && /^\d+$/.test(part) ? parts[0]!.replace(/-\d+$/, `-${part}`) : part;
    return `${prefix}${series === 'S' ? code.padStart(4, '0') : code}`;
  });
}

function parseLeadTimes(sheet: LaserPriceListSheet): Map<string, number> {
  const result = new Map<string, number>();
  const headerIndex = sheet.rows.findIndex((row) => row.slice(2).some((cell) => POWER_LABEL.test(cell.trim())));
  if (headerIndex < 0) return result;
  const powers = sheet.rows[headerIndex]!.map(powerOf);
  let series = '';
  for (const row of sheet.rows.slice(headerIndex + 1)) {
    series = row[0]?.trim() || series;
    for (const code of leadTimeModelCodes(series, row[1] ?? '')) {
      powers.forEach((powerKw, col) => {
        const days = powerKw === undefined ? undefined : numeric(row[col]);
        if (powerKw !== undefined && days !== undefined) result.set(`${code}@${powerKw}`, days);
      });
    }
  }
  return result;
}

/** Süre sayfası kısa yazar: `TZ12055` ↔ `TZ12055+Z12`, `V12` ↔ `V12-65`. */
function leadTimeFor(leadTimes: Map<string, number>, code: string, powerKw: number): number | undefined {
  const exact = leadTimes.get(`${code}@${powerKw}`) ?? leadTimes.get(`${code.replace(/\+[A-Z]\d+$/, '')}@${powerKw}`);
  if (exact !== undefined) return exact;
  for (const [key, days] of leadTimes) {
    const [leadCode, leadPower] = key.split('@');
    if (Number(leadPower) === powerKw && code.startsWith(`${leadCode}-`)) return days;
  }
  return undefined;
}

export function parseLaserPriceList(sheets: LaserPriceListSheet[]): LaserPriceListParseResult {
  const prices: LaserPriceRow[] = [];
  const accessories: LaserPriceAccessory[] = [];
  const optionNotes: LaserPriceOptionNote[] = [];
  const issues: string[] = [];
  const leadSheet = sheets.find((sheet) => /üretim|teslim/i.test(sheet.name));
  const leadTimes = leadSheet ? parseLeadTimes(leadSheet) : new Map<string, number>();

  for (const sheet of sheets) {
    if (sheet === leadSheet) continue;
    if (/par[cç]a|parts/i.test(sheet.name) || /PAERÇA/i.test(sheet.name)) {
      sheet.rows.forEach((row, index) => {
        const costUsd = numeric(row[1]);
        const name = (row[0] ?? '').replace(/\s*\n\s*/g, ' ').trim();
        if (name && costUsd !== undefined) accessories.push({ name, costUsd, sheet: sheet.name, cell: cellRef(index, 1) });
      });
      continue;
    }
    let models: Array<{ col: number; code: string }> = [];
    const blockStart = prices.length;
    sheet.rows.forEach((row, index) => {
      const label = (row[0] ?? '').trim();
      if (/^seri/i.test(label) || /serisi$/i.test(label)) { models = []; return; }
      if (/^model$/i.test(label)) {
        models = row.map((cell, col) => ({ col, code: cell.trim() })).filter(({ col, code }) => col > 0 && MODEL_CODE.test(code));
        return;
      }
      if (!models.length) return;
      const powerKw = powerOf(label);
      if (powerKw !== undefined) {
        for (const { col, code } of models) {
          const costUsd = numeric(row[col]);
          if (costUsd === undefined) continue;
          prices.push({ priceModelCode: code, powerKw, costUsd, leadTimeDays: leadTimeFor(leadTimes, code, powerKw), sheet: sheet.name, cell: cellRef(index, col) });
        }
        return;
      }
      if (/^konteyner|container/i.test(label)) {
        for (const { col, code } of models) {
          const container = row[col]?.trim();
          if (!container) continue;
          for (const price of prices.slice(blockStart)) if (price.priceModelCode === code) price.container = container;
        }
        return;
      }
      if (/opsiyon|option/i.test(label)) {
        // Seri grubunun ilk sütununa yazılmış opsiyon notu (ör. Bevel kesim) grubun modellerine aittir.
        row.forEach((cell, col) => {
          const rawValue = cell.trim();
          if (col === 0 || !rawValue) return;
          const model = models.find((m) => m.col === col);
          if (model) optionNotes.push({ priceModelCode: model.code, label, rawValue, sheet: sheet.name, cell: cellRef(index, col) });
        });
      }
    });
  }
  // ExcelJS birleştirilmiş hücrenin değerini her hücrede tekrarlar; yalnız gerçek çelişki raporlanır.
  const firstPrice = new Map<string, LaserPriceRow>();
  for (const price of prices) {
    const key = `${price.priceModelCode}@${price.powerKw}`;
    const first = firstPrice.get(key);
    if (!first) firstPrice.set(key, price);
    else if (first.costUsd !== price.costUsd) issues.push(`${key} fiyat listesinde farklı değerlerle iki kez geçiyor (${first.cell}, ${price.cell}); ilk değer kullanılır.`);
  }
  const unique = <T,>(rows: T[], keyOf: (row: T) => string) => rows.filter((row, index) => rows.findIndex((other) => keyOf(other) === keyOf(row)) === index);
  return {
    prices: [...firstPrice.values()],
    accessories: unique(accessories, (row) => `${row.name}|${row.costUsd}`),
    optionNotes: unique(optionNotes, (row) => `${row.label}|${row.rawValue}`),
    issues,
  };
}

/**
 * Fiyat listesi kodunu HEX LASER baz kartının alt model koduna eşler.
 * Eşleşme yoksa `null` döner; uydurma kod üretilmez.
 */
export function hexConfigurationForPriceModel(priceModelCode: string, powerKw: number): { series: string; sourceModelCode: string } | null {
  const code = priceModelCode.trim().toUpperCase();
  const candidates: Array<{ series: string; codes: string[] }> = [];
  let match: RegExpMatchArray | null;
  if ((match = code.match(/^(F|PG)(\d{4})\+T\d+$/))) {
    const series = match[1] === 'F' ? 'FT' : 'PGT';
    candidates.push({ series, codes: [`${series}-${match[2]}`, `${series}${match[2]}`] });
  } else if ((match = code.match(/^GR(\d{4}(?:PRO)?-\d+)$/))) {
    candidates.push({ series: 'GR', codes: [match[1]!.toLowerCase()] });
  } else if ((match = code.match(/^(TS|TZ)(\d{4,5})\+[A-Z]\d+$/))) {
    candidates.push({ series: match[1]!, codes: [`${match[1]}-${match[2]}`, `${match[1]}${match[2]}`] });
  } else if (/^HW$/.test(code)) {
    candidates.push({ series: 'HW', codes: [`HW-${Math.round(powerKw * 1000)}W`] });
  } else if ((match = code.match(/^([A-Z]{1,3})(\d{4,5})$/))) {
    candidates.push({ series: match[1]!, codes: [`${match[1]}-${match[2]}`, `${match[1]}${match[2]}`] });
  }
  for (const candidate of candidates) {
    const series = HEX2026_SERIES.find((row) => row.series === candidate.series);
    const configuration = series?.configurations.find((row) => candidate.codes.some((c) => row.sourceModelCode.toLowerCase() === c.toLowerCase()));
    if (series && configuration) return { series: series.series, sourceModelCode: configuration.sourceModelCode };
  }
  return null;
}
