import ExcelJS from 'exceljs';
import { ValidationError } from './errors';

/** Başlık eşleştirme için: küçük harf, aksansız, yalnız harf-rakam. */
export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** ExcelJS hücre değerini düz metne indirger (zengin metin, formül, tarih, köprü). */
export function cellToText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as any;
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text ?? '').join('').trim();
    if (v.text) return String(v.text).trim();
    if (v.result != null) return cellToText(v.result);
    if (v.hyperlink && v.text) return String(v.text).trim();
  }
  return String(value).trim();
}

export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

/**
 * Base64 .xlsx/.csv dosyasını satır matrisine çevirir. `pickSheet` verilirse ona uyan
 * çalışma sayfası, yoksa ilk sayfa okunur. CSV'de ayırıcı ilk satırdan sezilir.
 */
export async function readSpreadsheetMatrix(
  fileName: string,
  fileBase64: string,
  opts: { pickSheet?: (normalizedSheetName: string) => boolean; maxBytes?: number } = {},
): Promise<{ sheetName: string; matrix: string[][] }> {
  const cleanBase64 = fileBase64.includes(',') ? fileBase64.split(',').pop()! : fileBase64;
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (!buffer.length) throw new ValidationError('Dosya okunamadı');
  if (opts.maxBytes && buffer.length > opts.maxBytes) throw new ValidationError('Dosya boyutu sınırı aşıyor');

  const lower = fileName.toLocaleLowerCase('tr-TR');
  if (lower.endsWith('.csv')) {
    const text = buffer.toString('utf8').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
    return { sheetName: 'CSV', matrix: parseCsv(text, delimiter) };
  }
  if (!lower.endsWith('.xlsx')) throw new ValidationError('Sadece .xlsx ve .csv dosyaları destekleniyor');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = (opts.pickSheet && workbook.worksheets.find((ws) => opts.pickSheet!(normalizeText(ws.name)))) ?? workbook.worksheets[0];
  if (!worksheet) throw new ValidationError('Excel dosyasında çalışma sayfası bulunamadı');
  const matrix: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values: string[] = [];
    for (let col = 1; col <= row.cellCount; col += 1) values.push(cellToText(row.getCell(col).value));
    matrix[rowNumber - 1] = values;
  });
  return { sheetName: worksheet.name, matrix };
}

/** Başlık satırını, bilinen başlıklara en çok uyan ilk 20 satır içinden seçer. */
export function detectHeaderRow(matrix: string[][], isKnownHeader: (normalized: string) => boolean): number {
  let bestIndex = -1;
  let bestScore = 0;
  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 20); rowIndex += 1) {
    const score = (matrix[rowIndex] ?? []).reduce((total, cell) => total + (isKnownHeader(normalizeText(cell)) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; bestIndex = rowIndex; }
  }
  return bestIndex;
}
