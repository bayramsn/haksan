import { writeFile } from 'node:fs/promises';
import { CommercialPdfService } from '../src/modules/quotes/commercial-pdf.service';
import { afterAll, describe, expect, it } from 'vitest';
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
});
