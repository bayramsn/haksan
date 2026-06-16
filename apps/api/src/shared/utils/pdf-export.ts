import PDFDocument from 'pdfkit';
import type { FastifyReply } from 'fastify';
import type { ExportRow } from './excel-export';

const tr = (s: string | null | undefined): string =>
  (s ?? '')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C');

export async function rowsToPdfBuffer(opts: {
  title: string;
  subtitle?: string;
  rows: ExportRow[];
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fontSize(16).font('Helvetica-Bold').text(tr(opts.title), { align: 'left' });
  if (opts.subtitle) {
    doc.fontSize(10).font('Helvetica').text(tr(opts.subtitle), { align: 'left' });
  }
  doc.moveDown(0.75);

  const rows = opts.rows;
  if (!rows.length) {
    doc.fontSize(10).text('Kayit yok.');
    doc.end();
    return done;
  }

  const cols = Object.keys(rows[0]);
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = pageW / cols.length;
  const x0 = doc.page.margins.left;
  const headerY = doc.y;
  const rowH = 14;

  doc.fontSize(8).font('Helvetica-Bold');
  cols.forEach((col, i) => {
    doc.text(tr(col), x0 + i * colW, headerY, { width: colW - 4, lineBreak: false });
  });
  doc.moveTo(x0, headerY + rowH).lineTo(x0 + pageW, headerY + rowH).stroke();

  doc.font('Helvetica').fontSize(7);
  let y = headerY + rowH + 4;
  for (const row of rows) {
    if (y > doc.page.height - doc.page.margins.bottom - rowH) {
      doc.addPage({ layout: 'landscape' });
      y = doc.page.margins.top;
    }
    cols.forEach((col, i) => {
      const val = row[col];
      const text = val == null ? '' : typeof val === 'number' ? val.toLocaleString('tr-TR') : String(val);
      doc.text(tr(text), x0 + i * colW, y, { width: colW - 4, lineBreak: false });
    });
    y += rowH;
  }

  doc.end();
  return done;
}

export function sendPdf(reply: FastifyReply, buffer: Buffer, filename: string): Buffer {
  reply.header('Content-Disposition', `attachment; filename="${filename}"`).header('Content-Type', 'application/pdf');
  return buffer;
}
