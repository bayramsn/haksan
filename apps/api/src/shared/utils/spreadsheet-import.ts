import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { ValidationError } from './errors';

/** Bir .xlsx'in açılmış hâlinin tavanı; meşru içe aktarma dosyaları (görselli ürün listesi dahil) bunun çok altında. */
export const XLSX_MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

const tooLarge = () => new ValidationError('Excel dosyası açıldığında izin verilen boyutu aşıyor');
const broken = () => new ValidationError('Excel dosyası okunamadı');

/**
 * Zip bombasına karşı: merkez dizindeki her girdi gerçekten açılarak (beyan edilen boyuta güvenmeden)
 * toplam açık boyut sınırlanır; `maxOutputLength` belleği tavanın üstüne çıkmadan keser. ZIP64 desteklenmez.
 */
export function assertXlsxWithinLimit(buffer: Buffer, maxUncompressedBytes = XLSX_MAX_UNCOMPRESSED_BYTES): void {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > buffer.length) throw broken();
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  // Gerçek .xlsx birkaç yüz girdiyi geçmez; binlerce girdi aynı veriye işaret edip CPU'yu kilitleyebilir.
  if (count === 0xffff || offset === 0xffffffff || count > 2_000) throw broken();

  // 1. geçiş: merkez dizini oku, hiçbir şey açmadan önce girdilerin örtüşmediğini doğrula.
  const entries: Array<{ method: number; start: number; dataStart: number; end: number }> = [];
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw broken();
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const localOffset = buffer.readUInt32LE(offset + 42);
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw broken();
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > buffer.length) throw broken();
    if (method !== 0 && method !== 8) throw broken();
    entries.push({ method, start: localOffset, dataStart, end: dataStart + compressedSize });
  }
  const sorted = [...entries].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) if (sorted[i].start < sorted[i - 1].end) throw broken();

  // 2. geçiş: her girdiyi gerçekten aç; beyan edilen boyuta güvenilmez, bellek tavanda kesilir.
  let remaining = maxUncompressedBytes;
  for (const entry of entries) {
    const data = buffer.subarray(entry.dataStart, entry.end);
    let size = data.length;
    if (entry.method === 8) {
      if (remaining <= 0) throw tooLarge();
      try {
        size = inflateRawSync(data, { maxOutputLength: remaining }).length;
      } catch (error) {
        throw (error as NodeJS.ErrnoException)?.code === 'ERR_BUFFER_TOO_LARGE' ? tooLarge() : broken();
      }
    }
    remaining -= size;
    if (remaining < 0) throw tooLarge();
  }
}

/** Bütün .xlsx yüklemeleri buradan geçer: imza + açılma tavanı, sonra ExcelJS. */
export async function loadXlsxWorkbook(buffer: Buffer, maxUncompressedBytes = XLSX_MAX_UNCOMPRESSED_BYTES): Promise<ExcelJS.Workbook> {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new ValidationError('XLSX dosya imzası geçersiz');
  assertXlsxWithinLimit(buffer, maxUncompressedBytes);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw broken();
  }
  return workbook;
}

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
  opts: { pickSheet?: (normalizedSheetName: string) => boolean; maxBytes?: number; maxUncompressedBytes?: number; maxRows?: number; maxColumns?: number } = {},
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

  const workbook = await loadXlsxWorkbook(buffer, opts.maxUncompressedBytes);
  const worksheet = (opts.pickSheet && workbook.worksheets.find((ws) => opts.pickSheet!(normalizeText(ws.name)))) ?? workbook.worksheets[0];
  if (!worksheet) throw new ValidationError('Excel dosyasında çalışma sayfası bulunamadı');
  const matrix: string[][] = [];
  const maxRows = opts.maxRows ?? 50_000;
  const maxColumns = opts.maxColumns ?? 256;
  if (worksheet.rowCount > maxRows) throw new ValidationError(`Excel sayfasında en fazla ${maxRows.toLocaleString('tr-TR')} satır olabilir`);
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values: string[] = [];
    // Çok sağa taşan tek hücre (ör. XFD sütunu) satır başına dev dizi açmasın.
    for (let col = 1; col <= Math.min(row.cellCount, maxColumns); col += 1) values.push(cellToText(row.getCell(col).value));
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
