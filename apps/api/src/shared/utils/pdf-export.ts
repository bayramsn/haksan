import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import type { FastifyReply } from 'fastify';
import type { ExportRow } from './excel-export';

const REGULAR_FONT_PATHS = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/Library/Fonts/Arial Unicode.ttf',
];
const BOLD_FONT_PATHS = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
];

const firstExisting = (paths: string[]) => paths.find((path) => existsSync(path));
const asciiFallback = (value: string) => value
  .replace(/ş/g, 's').replace(/Ş/g, 'S')
  .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
  .replace(/ı/g, 'i').replace(/İ/g, 'I')
  .replace(/ö/g, 'o').replace(/Ö/g, 'O')
  .replace(/ü/g, 'u').replace(/Ü/g, 'U')
  .replace(/ç/g, 'c').replace(/Ç/g, 'C');

const cellText = (value: unknown) => {
  if (value == null) return '';
  if (typeof value === 'number') {
    return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(value);
};

const columnWeight = (name: string) => {
  const normalized = name.toLocaleLowerCase('tr-TR');
  if (/açıklama|firma|not|ürün|konu/.test(normalized)) return 2.6;
  if (/tarih|tür|fatura no|para birimi/.test(normalized)) return 1.1;
  if (/borç|alacak|bakiye|tutar|miktar/.test(normalized)) return 1.25;
  return 1.5;
};

export async function rowsToPdfBuffer(opts: {
  title: string;
  subtitle?: string;
  rows: ExportRow[];
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 34, layout: 'landscape', bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const regularPath = firstExisting(REGULAR_FONT_PATHS);
  const boldPath = firstExisting(BOLD_FONT_PATHS);
  const regular = regularPath ? 'ReportRegular' : 'Helvetica';
  const bold = boldPath ? 'ReportBold' : 'Helvetica-Bold';
  if (regularPath) doc.registerFont(regular, regularPath);
  if (boldPath) doc.registerFont(bold, boldPath);
  const safe = (value: string) => regularPath ? value : asciiFallback(value);

  const rows = opts.rows;
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const weights = cols.map(columnWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const widths = weights.map((weight) => pageWidth * (weight / totalWeight));
  const x0 = doc.page.margins.left;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 18;

  const drawTitle = (continued = false) => {
    doc.font(bold).fontSize(continued ? 11 : 16).fillColor('#111827');
    doc.text(safe(continued ? `${opts.title} — devam` : opts.title), x0, doc.page.margins.top, { width: pageWidth });
    if (!continued && opts.subtitle) {
      doc.moveDown(0.25).font(regular).fontSize(9).fillColor('#4b5563').text(safe(opts.subtitle), { width: pageWidth });
    }
    doc.moveDown(continued ? 0.35 : 0.65);
  };

  const drawHeader = () => {
    const y = doc.y;
    const height = 22;
    doc.save().rect(x0, y, pageWidth, height).fill('#e5e7eb').restore();
    doc.font(bold).fontSize(7.4).fillColor('#111827');
    let x = x0;
    cols.forEach((col, index) => {
      doc.text(safe(col), x + 3, y + 6, { width: widths[index] - 6, height: 12, ellipsis: true, lineBreak: false });
      x += widths[index];
    });
    doc.y = y + height;
  };

  const newPage = () => {
    doc.addPage({ size: 'A4', layout: 'landscape', margin: 34 });
    drawTitle(true);
    drawHeader();
  };

  const wrapLines = (value: string, width: number): string[] => {
    doc.font(regular).fontSize(7.2);
    const lines: string[] = [];
    const splitLongToken = (token: string) => {
      const parts: string[] = [];
      let current = '';
      for (const char of token) {
        if (current && doc.widthOfString(current + char) > width) {
          parts.push(current);
          current = char;
        } else {
          current += char;
        }
      }
      if (current) parts.push(current);
      return parts;
    };
    value.replace(/\r\n?/g, '\n').split('\n').forEach((paragraph) => {
      if (!paragraph.trim()) {
        lines.push('');
        return;
      }
      let current = '';
      const tokens = paragraph.trim().split(/\s+/).flatMap((token) =>
        doc.widthOfString(token) <= width ? [token] : splitLongToken(token));
      tokens.forEach((token) => {
        const candidate = current ? `${current} ${token}` : token;
        if (current && doc.widthOfString(candidate) > width) {
          lines.push(current);
          current = token;
        } else {
          current = candidate;
        }
      });
      lines.push(current);
    });
    return lines.length ? lines : [''];
  };

  drawTitle();
  if (!rows.length) {
    doc.font(regular).fontSize(10).fillColor('#374151').text('Kayıt yok.');
  } else {
    drawHeader();
    rows.forEach((row, rowIndex) => {
      doc.font(regular).fontSize(7.2).fillColor('#111827');
      const values = cols.map((col) => safe(cellText(row[col])));
      const wrapped = values.map((value, index) => wrapLines(value, widths[index] - 6));
      const totalLines = Math.max(1, ...wrapped.map((lines) => lines.length));
      const lineHeight = 8.6;
      let lineOffset = 0;
      while (lineOffset < totalLines) {
        const remainingHeight = bottomLimit() - doc.y;
        if (remainingHeight < 18) newPage();
        const maxLinesOnPage = Math.max(1, Math.floor((bottomLimit() - doc.y - 8) / lineHeight));
        const linesOnPage = Math.min(totalLines - lineOffset, maxLinesOnPage);
        const rowHeight = Math.max(18, linesOnPage * lineHeight + 8);
        const y = doc.y;
        if (rowIndex % 2 === 1) doc.save().rect(x0, y, pageWidth, rowHeight).fill('#f9fafb').restore();
        let x = x0;
        wrapped.forEach((lines, index) => {
          const align = typeof row[cols[index]] === 'number' ? 'right' : 'left';
          const fragment = lines.slice(lineOffset, lineOffset + linesOnPage).join('\n');
          doc.font(regular).fontSize(7.2).fillColor('#111827').text(fragment, x + 3, y + 4, {
            width: widths[index] - 6,
            height: rowHeight - 8,
            align,
            lineGap: 0,
          });
          x += widths[index];
        });
        doc.save().moveTo(x0, y + rowHeight).lineTo(x0 + pageWidth, y + rowHeight).lineWidth(0.35).strokeColor('#d1d5db').stroke().restore();
        doc.y = y + rowHeight;
        lineOffset += linesOnPage;
        if (lineOffset < totalLines) newPage();
      }
    });
  }

  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    doc.font(regular).fontSize(7).fillColor('#6b7280').text(
      `Sayfa ${pageIndex - range.start + 1} / ${range.count}`,
      x0,
      doc.page.height - 23,
      { width: pageWidth, align: 'center', lineBreak: false },
    );
  }

  doc.end();
  return done;
}

export function sendPdf(reply: FastifyReply, buffer: Buffer, filename: string): Buffer {
  reply
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .header('Content-Type', 'application/pdf')
    .header('Cache-Control', 'private, no-store');
  return buffer;
}
