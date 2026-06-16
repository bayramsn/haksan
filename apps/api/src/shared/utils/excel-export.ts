import * as ExcelJS from 'exceljs';
import type { FastifyReply } from 'fastify';

export type ExportRow = Record<string, string | number | boolean | null | undefined>;

export async function rowsToXlsxBuffer(rows: ExportRow[], sheetName = 'Rapor'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  if (rows.length) {
    ws.columns = Object.keys(rows[0]).map((k) => ({ header: k, key: k, width: 22 }));
    ws.addRows(rows);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function sheetsToXlsxBuffer(
  sheets: Array<{ name: string; rows: ExportRow[] }>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    if (s.rows.length) {
      ws.columns = Object.keys(s.rows[0]).map((k) => ({ header: k, key: k, width: 22 }));
      ws.addRows(s.rows);
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
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
