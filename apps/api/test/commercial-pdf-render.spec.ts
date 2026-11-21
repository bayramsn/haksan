import { writeFile } from 'node:fs/promises';
import { CommercialPdfService } from '../src/modules/quotes/commercial-pdf.service';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { crc32, deflateSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
// Gerçek ağa çıkmadan: indirici yalnız bilinen ürün fotoğrafını "alır".
vi.mock('../src/shared/pdf/remote-image', () => ({
  inlineRemoteImages: vi.fn(async (html: string) => html.split('https://www.haksanmakina.com.tr/a.png').join('data:image/png;base64,QQ==')),
}));
import { renderCommercialHtml } from '../src/modules/quotes/commercial-pdf-render';
import { HtmlPdfService } from '../src/shared/pdf/html-pdf.service';
const snapshot = {
  company: { legalTitle: 'Şahintek Işık Makina', taxOffice: 'Nilüfer', taxNumber: '1234567890' },
  companyAddresses: [{ fullAddress: 'Organize Sanayi', district: 'Nilüfer', province: 'Bursa' }],
  companyPhones: [{ phone: '02240000000' }], companyEmails: [{ email: 'info@example.test' }],
  currency: { code: 'USD' }, contact: {},
  quote: { documentNo: 'CNC-2026-001', quoteDate: '2026-10-22', subtotal: 100, grandTotal: 120, vatAmount: 20, discountTotal: 0 },
  terms: { paymentTermsText: 'Peşin ödeme', deliveryTermsText: 'İşletme teslim' },
  items: [{ id: 'line-1', description: 'İşleme Merkezi', productModelId: 'product-1', quantity: 1, unitPrice: 100, lineTotal: 100, vatRate: 20, discountAmount: 0, unitCode: 'adet', product: { id: 'product-1', fullName: 'MV-850', modelCode: 'MV-850' } }],
};
const record = { id: 'record-1', documentNo: 'CNC-2026-001', contractNo: 'CNC-2026-001', quoteDate: '2026-10-22', issueDate: '2026-10-22', signedDate: '2026-10-22' };
describe('canonical commercial layout', () => {
  it.each(['quote', 'proforma', 'contract'] as const)('%s uses server snapshot with Turkish characters, saved amount and no scripts', async (kind) => {
    const html = await renderCommercialHtml(kind, record, snapshot);
    expect(html).toContain('Şahintek Işık Makina');
    expect(html).toContain('MV-850');
    expect(html).not.toContain('<script');
    expect(html).toContain('100,00');
  });
  it('quote logo mode is reflected in the canonical output', async () => {
    const withLogo = await renderCommercialHtml('quote', record, snapshot, 'haksan');
    const without = await renderCommercialHtml('quote', record, snapshot, 'none');
    expect(withLogo).not.toBe(without);
    expect(withLogo).toContain('/print/haksan-letterhead');
  });
  it("dış ürün fotoğrafını gömer, alınamayan dış görseli Chromium'a ulaştırmadan boş basar", async () => {
    const service = new CommercialPdfService({} as any, {} as any, {} as any, {} as any, {} as any);
    const html = await (service as any).images('<img alt="a" src="https://www.haksanmakina.com.tr/a.png"><img src="https://unreachable.test/b.png">', {});
    expect(html).toContain('src="data:image/png;base64,QQ=="');
    expect(html).not.toContain('https://');
  });
  it('eski kayıtta eksik ürün fotoğrafını katalogdan doldurur, mevcut fotoğrafa dokunmaz', async () => {
    const where = vi.fn(async () => [{ id: 'p1', imageUrl: '/api/v1/products/media/11111111-1111-1111-1111-111111111111' }]);
    const db = { select: () => ({ from: () => ({ where }) }) };
    const service = new CommercialPdfService(db as any, {} as any, {} as any, {} as any, {} as any);
    const out = await (service as any).withCatalogImages({ items: [
      { productModelId: 'p1', product: { modelCode: 'VM-2' } },
      { productModelId: 'p2', product: { modelCode: 'X', imageUrl: '/print/x.png' } },
      { description: 'serbest satır' },
    ] }, { tenantId: 't' });
    expect(out.items[0].product.imageUrl).toBe('/api/v1/products/media/11111111-1111-1111-1111-111111111111');
    expect(out.items[1].product.imageUrl).toBe('/print/x.png');
    expect(out.items[2]).toEqual({ description: 'serbest satır' });
    expect(where).toHaveBeenCalledTimes(1);
  });
  it('incomplete contracts return an actionable validation error', async () => {
    await expect(renderCommercialHtml('contract', record, { ...snapshot, company: {}, companyAddresses: [] }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 422 });
  });
});
const pdf = new HtmlPdfService();
describe.skipIf(!HtmlPdfService.executablePath())('actual commercial PDF bytes', () => {
  afterAll(() => pdf.onModuleDestroy());
  it.each(['quote', 'proforma', 'contract'] as const)('Chromium renders canonical %s as a real PDF', async (kind) => {
    const service = new CommercialPdfService({} as any, {} as any, {} as any, pdf, {} as any);
    const html = await (service as any).images(await renderCommercialHtml(kind, record, snapshot), {});
    const buffer = await pdf.render(html);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
    await writeFile(`/private/tmp/haksan-commercial-${kind}.pdf`, buffer);
  }, 60_000);
  it('büyük fotoğrafı küçültüp JPEG olarak basar', async () => {
    // 2400x1200 rastgele gürültü PNG (~8,6 MB, sıkıştırılamaz): eşiğin üstünde; 1800 px'e iner.
    const [w, h] = [2400, 1200];
    const raw = randomBytes((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
      return Buffer.concat([len, Buffer.from(type), data, crc]);
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    const src = `data:image/png;base64,${png.toString('base64')}`;
    const out = await (pdf as any).shrinkImages(await (pdf as any).getBrowser(), `<img src="${src}">`);
    expect(out).toContain('src="data:image/jpeg;base64,');
    expect(out.length).toBeLessThan(src.length);
  }, 60_000);
});
