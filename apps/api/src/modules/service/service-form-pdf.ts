import { existsSync } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

export type ServiceFormType = 'montaj' | 'ariza' | 'periyodik';
export type ServiceResponsibility = 'ucretli' | 'garanti' | 'bakim';

export interface ServiceFormPdfPart {
  name?: string;
  quantity?: string;
  unitPrice?: number | null;
  amount?: number | null;
}

export interface ServiceFormPdfData {
  company?: string;
  contact?: string;
  address?: string;
  phone?: string;
  fax?: string;
  mobile?: string;
  email?: string;
  taxOffice?: string;
  taxNumber?: string;
  formNo: string;
  date?: string;
  machine?: { brand?: string; type?: string; model?: string; serialNo?: string };
  cnc?: { brand?: string; model?: string; serialNo?: string; mainSw?: string };
  complaint?: string;
  serviceType?: ServiceFormType;
  responsibility?: ServiceResponsibility;
  operations?: string[];
  parts?: ServiceFormPdfPart[];
  serviceFee?: number | null;
  travelFee?: number | null;
  currency?: 'USD' | 'EUR' | 'TRY';
  serviceTechnician?: string;
  companyRepresentative?: string;
}

const PAGE_WIDTH = 595.32;
const PAGE_HEIGHT = 841.92;

const TEMPLATE_CANDIDATES = [
  path.resolve(process.cwd(), 'apps/web/public/print/templates/doktor-makina-servis-form-template.png'),
  path.resolve(process.cwd(), '../web/public/print/templates/doktor-makina-servis-form-template.png'),
  path.resolve(__dirname, '../../../../web/public/print/templates/doktor-makina-servis-form-template.png'),
];

const REGULAR_FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/Library/Fonts/Arial Unicode.ttf',
  '/System/Library/Fonts/ArialHB.ttc',
];

const BOLD_FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
];

const firstExistingPath = (paths: string[]) => paths.find((p) => existsSync(p));

const trFallback = (value: string) =>
  value
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U');

const clean = (value: string | null | undefined, supportsTurkish: boolean) => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return supportsTurkish ? text : trFallback(text);
};

const cleanLines = (value: string | null | undefined, supportsTurkish: boolean) =>
  (value ?? '')
    .split(/\r?\n/)
    .map((line) => clean(line, supportsTurkish))
    .filter(Boolean);

const formatMoney = (value: number | null | undefined, currency: string) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};

export async function buildServiceFormPdf(data: ServiceFormPdfData): Promise<Buffer> {
  const templatePath = firstExistingPath(TEMPLATE_CANDIDATES);
  if (!templatePath) {
    throw new Error('Doktor Makina servis formu şablonu bulunamadı');
  }

  const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const regularFontPath = firstExistingPath(REGULAR_FONT_CANDIDATES);
  const boldFontPath = firstExistingPath(BOLD_FONT_CANDIDATES);
  const regularFont = regularFontPath ? 'ServiceFormRegular' : 'Helvetica';
  const boldFont = boldFontPath ? 'ServiceFormBold' : 'Helvetica-Bold';
  if (regularFontPath) doc.registerFont(regularFont, regularFontPath);
  if (boldFontPath) doc.registerFont(boldFont, boldFontPath);
  const supportsTurkish = Boolean(regularFontPath);

  const font = (bold = false) => (bold ? boldFont : regularFont);

  const truncateToWidth = (value: string, width: number, size: number, bold = false) => {
    doc.font(font(bold)).fontSize(size);
    if (doc.widthOfString(value) <= width) return value;
    let next = value;
    while (next.length > 1 && doc.widthOfString(`${next}...`) > width) {
      next = next.slice(0, -1);
    }
    return `${next.trimEnd()}...`;
  };

  const wrapText = (value: string, width: number, size: number, bold = false, maxLines = 1) => {
    doc.font(font(bold)).fontSize(size);
    const sourceLines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const output: string[] = [];
    for (const source of sourceLines.length ? sourceLines : ['']) {
      const words = source.split(/\s+/).filter(Boolean);
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (doc.widthOfString(candidate) <= width) {
          current = candidate;
          continue;
        }
        if (current) output.push(current);
        current = doc.widthOfString(word) <= width ? word : truncateToWidth(word, width, size, bold);
        if (output.length >= maxLines) break;
      }
      if (output.length >= maxLines) break;
      if (current) output.push(current);
    }
    if (output.length > maxLines) output.length = maxLines;
    return output.slice(0, maxLines);
  };

  const text = (
    value: string | null | undefined,
    x: number,
    y: number,
    width: number,
    opts: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; maxLines?: number; lineHeight?: number } = {},
  ) => {
    const size = opts.size ?? 8.5;
    const bold = opts.bold ?? false;
    const valueText = clean(value, supportsTurkish);
    if (!valueText) return;
    doc.font(font(bold)).fontSize(size).fillColor('#111111');
    const lines = wrapText(valueText, width, size, bold, opts.maxLines ?? 1);
    const lineHeight = opts.lineHeight ?? size + 2;
    lines.forEach((line, index) => {
      doc.text(line, x, y + index * lineHeight, {
        width,
        align: opts.align ?? 'left',
        lineBreak: false,
      });
    });
  };

  const fittedText = (
    value: string | null | undefined,
    x: number,
    y: number,
    width: number,
    opts: { size?: number; minSize?: number; bold?: boolean; align?: 'left' | 'center' | 'right' } = {},
  ) => {
    const valueText = clean(value, supportsTurkish);
    if (!valueText) return;
    const bold = opts.bold ?? false;
    let size = opts.size ?? 8;
    const minSize = opts.minSize ?? 5.4;
    doc.font(font(bold)).fontSize(size).fillColor('#111111');
    while (size > minSize && doc.widthOfString(valueText) > width) {
      size -= 0.2;
      doc.fontSize(size);
    }
    const shown = truncateToWidth(valueText, width, size, bold);
    doc.font(font(bold)).fontSize(size).text(shown, x, y, {
      width,
      align: opts.align ?? 'left',
      lineBreak: false,
    });
  };

  const cover = (x: number, y: number, width: number, height: number) => {
    doc.save().rect(x, y, width, height).fill('#ffffff').restore();
  };

  const check = (x: number, y: number) => {
    doc.save()
      .lineWidth(1.2)
      .strokeColor('#111111')
      .moveTo(x + 1.2, y + 4.7)
      .lineTo(x + 3.7, y + 7.2)
      .lineTo(x + 8.4, y + 1.5)
      .stroke()
      .restore();
  };

  const currency = data.currency ?? 'TRY';
  const complaintLines = wrapText(clean(data.complaint, supportsTurkish), 315, 8.2, false, Number.MAX_SAFE_INTEGER);
  const operationInput = (data.operations ?? []).flatMap((line) => cleanLines(line, supportsTurkish));
  const operationLines = wrapText(operationInput.join('\n'), 520, 8.0, false, Number.MAX_SAFE_INTEGER);
  const numberValue = (value: string | null | undefined) => {
    const parsed = Number(String(value ?? '').trim().replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const normalizedParts = (data.parts ?? []).map((part) => {
    const calculatedAmount = (part.unitPrice ?? 0) * numberValue(part.quantity);
    return {
      ...part,
      amount: part.amount != null && Number.isFinite(part.amount) ? part.amount : calculatedAmount,
    };
  });
  const totalPages = Math.max(
    1,
    Math.ceil(complaintLines.length / 4),
    Math.ceil(operationLines.length / 10),
    Math.ceil(normalizedParts.length / 6),
  );
  const serviceFee = data.serviceFee ?? null;
  const travelFee = data.travelFee ?? null;
  const partsTotal = normalizedParts.reduce((sum, part) => sum + (part.amount ?? 0), 0);
  const grandTotal = partsTotal + (serviceFee ?? 0) + (travelFee ?? 0);
  const serviceTypeY: Record<ServiceFormType, number> = { montaj: 283.5, ariza: 298.7, periyodik: 314.0 };
  const responsibilityY: Record<ServiceResponsibility, number> = { ucretli: 283.5, garanti: 298.7, bakim: 314.0 };

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    if (pageIndex > 0) doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
    doc.image(templatePath, 0, 0, { width: PAGE_WIDTH, height: PAGE_HEIGHT });
    const isFinalPage = pageIndex === totalPages - 1;

    // Kimlik, makine ve işaretler her sayfada tekrar edilir; belge tek başına
    // ayrıldığında da hangi servis kaydına ait olduğu anlaşılır.
    fittedText(data.company, 92, 80.5, 170, { size: 8.2, minSize: 5.6, bold: true });
    fittedText(data.contact, 323, 80.5, 176, { size: 8.2, minSize: 5.6, bold: true });
    text(data.address, 92, 96, 405, { size: 7.8, maxLines: 3, lineHeight: 8.7 });
    text(data.phone, 92, 126.3, 171, { size: 8.1 });
    text(data.fax, 323, 126.3, 176, { size: 8.1 });
    text(data.mobile, 92, 141.3, 171, { size: 8.1 });
    text(data.email, 323, 141.3, 176, { size: 8.1 });
    text(data.taxOffice, 92, 156.4, 171, { size: 8.1 });
    text(data.taxNumber, 323, 156.4, 176, { size: 8.1 });
    cover(506, 100.5, 54, 21);
    fittedText(data.formNo, 504, 106.2, 58, { size: 8.2, minSize: 5.2, bold: true, align: 'center' });
    text(data.date, 507, 148.5, 52, { size: 8.2, align: 'center' });
    text(`Sayfa ${pageIndex + 1}/${totalPages}`, 504, 174.5, 58, { size: 6.6, bold: true, align: 'center' });

    text(data.machine?.brand, 129, 202.2, 166, { size: 8.4 });
    text(data.machine?.type, 129, 217.3, 166, { size: 8.4 });
    text(data.machine?.model, 129, 232.4, 166, { size: 8.4 });
    text(data.machine?.serialNo, 129, 247.5, 166, { size: 8.4 });
    text(data.cnc?.brand, 405, 202.2, 160, { size: 8.4 });
    text(data.cnc?.model, 405, 217.3, 160, { size: 8.4 });
    text(data.cnc?.serialNo, 405, 232.4, 160, { size: 8.4 });
    text(data.cnc?.mainSw, 405, 247.5, 160, { size: 8.4 });

    complaintLines.slice(pageIndex * 4, pageIndex * 4 + 4).forEach((line, index) => {
      text(line, 43, 283.5 + index * 14.8, 315, { size: 8.2 });
    });
    if (data.serviceType) check(379, serviceTypeY[data.serviceType]);
    if (data.responsibility) check(482.5, responsibilityY[data.responsibility]);

    operationLines.slice(pageIndex * 10, pageIndex * 10 + 10).forEach((line, index) => {
      text(line, 42, 367.6 + index * 14.35, 520, { size: 8.0 });
    });

    const pageParts: ServiceFormPdfPart[] = normalizedParts.slice(pageIndex * 6, pageIndex * 6 + 6);
    while (pageParts.length < 6) pageParts.push({});
    pageParts.forEach((part, index) => {
      const y = 537.5 + index * 15.2;
      const globalRowNo = pageIndex * 6 + index + 1;
      if (part.name || part.quantity || part.unitPrice != null || part.amount != null) {
        cover(47, y - 1, 16, 10);
        text(String(globalRowNo), 47, y, 16, { size: 7.7, align: 'center' });
      }
      text(part.name, 72, y, 236, { size: 7.7 });
      text(part.quantity, 313, y, 54, { size: 7.7, align: 'center' });
      text(formatMoney(part.unitPrice, currency), 370, y, 88, { size: 7.2, align: 'right' });
      text(formatMoney(part.amount, currency), 464, y, 98, { size: 7.2, align: 'right' });
    });

    // Ara sayfalarda toplam alanı boş kalır. Son sayfadaki genel toplam, artık
    // önceki sayfalarda görünür olan kalemlerin tamamıyla birebir uyuşur.
    if (isFinalPage) {
      text(serviceFee ? formatMoney(serviceFee, currency) : '', 464, 630.0, 98, { size: 7.4, align: 'right' });
      text(travelFee ? formatMoney(travelFee, currency) : '', 464, 645.2, 98, { size: 7.4, align: 'right' });
      text(grandTotal > 0 ? formatMoney(grandTotal, currency) : '', 464, 672.0, 98, { size: 7.5, bold: true, align: 'right' });
      text(data.serviceTechnician, 126, 724.8, 160, { size: 8.2, bold: true });
      text(data.companyRepresentative, 390, 724.8, 160, { size: 8.2, bold: true });
    }
  }

  doc.end();
  return done;
}
