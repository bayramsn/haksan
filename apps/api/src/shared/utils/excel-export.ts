import * as ExcelJS from 'exceljs';
import type { FastifyReply } from 'fastify';

export type ExportRow = Record<string, string | number | boolean | null | undefined>;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function safeCellValue(value: ExportRow[string]): ExportRow[string] {
  if (typeof value !== 'string') return value;
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function safeSheetName(name: string): string {
  return name.replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31) || 'Rapor';
}

function safeRows(rows: ExportRow[]): ExportRow[] {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safeCellValue(value)]))
  );
}

export async function rowsToXlsxBuffer(rows: ExportRow[], sheetName = 'Rapor'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(safeSheetName(sheetName));
  if (rows.length) {
    ws.columns = Object.keys(rows[0]).map((k) => ({ header: k, key: k, width: 22 }));
    ws.addRows(safeRows(rows));
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function sheetsToXlsxBuffer(
  sheets: Array<{ name: string; rows: ExportRow[] }>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(safeSheetName(s.name));
    if (s.rows.length) {
      ws.columns = Object.keys(s.rows[0]).map((k) => ({ header: k, key: k, width: 22 }));
      ws.addRows(safeRows(s.rows));
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Türkçe Excel uyumlu CSV üretir: UTF-8 BOM + noktalı virgül ayracı. Ondalık ayracı
 * virgül olan değerler (1.250,5) bu sayede tek hücrede kalır.
 */
export function rowsToCsvBuffer(rows: ExportRow[], delimiter = ';'): Buffer {
  if (!rows.length) return Buffer.from('﻿', 'utf8');
  const headers = Object.keys(rows[0]);
  const cell = (value: ExportRow[string]) => {
    const text = value === null || value === undefined ? '' : String(safeCellValue(value));
    return /["\n\r]|[;,\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    headers.join(delimiter),
    ...rows.map((row) => headers.map((header) => cell(row[header])).join(delimiter)),
  ];
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

export async function sendCsv(reply: FastifyReply, buffer: Buffer, filename: string): Promise<Buffer> {
  reply
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .header('Content-Type', 'text/csv; charset=utf-8');
  return buffer;
}

export async function sendXlsx(reply: FastifyReply, buffer: Buffer, filename: string): Promise<Buffer> {
  reply
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return buffer;
}

export function isoDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
