import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { commercialDocumentPdfHtml, commercialPdfFilename, commercialSnapshotPrintData, quoteSnapshotPdfHtml, quoteSnapshotPrintData } from '../src/modules/quotes/commercial-document-pdf';
import { CommercialDocumentsController, proformaGeneratePdfSchema } from '../src/modules/quotes/commercial-documents.controller';
import { CommercialPdfMediaService } from '../src/modules/quotes/commercial-pdf-media.service';
import { PROFORMA_NOTE_OPTIONS, resolveProformaNotes } from '@haksan/shared/dist/commercial-print/notes';
import { HtmlPdfService } from '../src/shared/pdf/html-pdf.service';
import { QuotesService } from '../src/modules/quotes/quotes.service';
import { AuthGuard } from '../src/shared/security/auth.guard';
import { PermissionsGuard, PERMISSIONS_KEY } from '../src/shared/security/permissions.guard';

const snapshot = {
  company: { legalTitle: 'Şahin & Oğulları', taxOffice: 'Nilüfer', taxNumber: '1234567890' },
  companyAddresses: [{ fullAddress: 'Bursa <img src=x onerror=alert(1)>' }],
  contact: { fullName: 'İlker Şen' },
  currency: { code: 'EUR' },
  quote: { subtotal: 1800, discountTotal: 200, vatAmount: 360, grandTotal: 2160, notes: 'Kayıtlı not' },
  terms: { paymentTermsText: '%50 peşin', deliveryTermsText: 'Bursa teslim' },
  items: [{ description: 'Dondurulmuş makine', quantity: 2, unitPrice: 1000, discountAmount: 200, vatRate: 20, lineTotal: 1800, product: { brandName: 'HAKSAN', specs: [{ key: 'Güç', value: '10', unit: 'kW' }], standardEquipment: ['Takım çantası'] } }],
  receivables: [{ amount: 2160, dueDate: '2026-12-01', paymentMethod: 'promissory_note', notes: 'İlk taksit' }],
  signature: { name: 'Kayıtlı İmza', title: 'Satış müdürü' },
};

describe('server commercial document PDFs', () => {
  it('renders persisted prices, buyer, terms and signature while escaping all content', () => {
    const html = commercialDocumentPdfHtml('proforma', { documentNo: 'PF-123', issueDate: '2026-10-26' }, snapshot);
    for (const value of ['PF-123', 'Şahin &amp; Oğulları', 'İlker Şen', 'Dondurulmuş makine', '2.160,00 EUR', '%50 peşin', 'Kayıtlı İmza']) expect(html).toContain(value);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).not.toContain('<script');
  });

  it('includes contract payment plan, technical specifications and standard equipment', () => {
    const html = commercialDocumentPdfHtml('contract', { contractNo: 'SOZ-123' }, snapshot);
    for (const value of ['SATIŞ SÖZLEŞMESİ', 'SOZ-123', 'Senet', 'İlk taksit', 'Güç', '10', 'kW', 'Takım çantası']) expect(html).toContain(value);
  });

  it('sanitizes the download filename including response header control characters', () => {
    expect(commercialPdfFilename('contract', 'SOZ/1\r\n";x')).toBe('sozlesme-SOZ_1____x.pdf');
  });

  it('requires authentication and corresponding document read permissions', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CommercialDocumentsController)).toEqual([AuthGuard, PermissionsGuard]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CommercialDocumentsController.prototype.generateProformaPdf)).toEqual(['proformas.read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CommercialDocumentsController.prototype.generateContractPdf)).toEqual(['contracts.read']);
  });

  it.each(['proforma', 'contract'] as const)('authorizes %s access before invoking the PDF renderer', async (kind) => {
    const denied = new Error('Not found in current scope');
    const service = Object.create(QuotesService.prototype);
    service.getProforma = vi.fn().mockRejectedValue(denied);
    service.getContract = vi.fn().mockRejectedValue(denied);
    service.pdfMedia = { embed: vi.fn(async (input) => input) };
    service.htmlPdf = { render: vi.fn() };
    const actor = { tenantId: 'tenant-one', divisionId: 'division-one' };
    await expect(service.generateCommercialPdf(kind, 'id', actor)).rejects.toBe(denied);
    expect(kind === 'proforma' ? service.getProforma : service.getContract).toHaveBeenCalledWith('id', actor);
    expect(service.htmlPdf.render).not.toHaveBeenCalled();
  });

  it('uses stored snapshot without refreshing customer/catalog data or mutating document', async () => {
    const service = Object.create(QuotesService.prototype);
    service.getProforma = vi.fn().mockResolvedValue({ documentNo: 'PF-123', quoteId: 'linked-quote', documentSnapshot: snapshot });
    service.buildCommercialDocumentSnapshot = vi.fn();
    service.pdfMedia = { embed: vi.fn(async (input) => input) };
    service.htmlPdf = { render: vi.fn().mockResolvedValue(Buffer.from('%PDF-test')) };
    const result = await service.generateCommercialPdf('proforma', 'id', {});
    expect(result.filename).toBe('proforma-PF-123.pdf');
    expect(result.buffer.toString()).toBe('%PDF-test');
    expect(service.buildCommercialDocumentSnapshot).not.toHaveBeenCalled();
    expect(service.htmlPdf.render.mock.calls[0][0]).toContain('Dondurulmuş makine');
  });

  it('fails clearly for a legacy standalone document without a snapshot', async () => {
    const service = Object.create(QuotesService.prototype);
    service.getContract = vi.fn().mockResolvedValue({ contractNo: 'SOZ-1', quoteId: null, documentSnapshot: null });
    service.pdfMedia = { embed: vi.fn(async (input) => input) };
    service.htmlPdf = { render: vi.fn() };
    await expect(service.generateCommercialPdf('contract', 'id', {})).rejects.toThrow('Belge anlık görüntüsü bulunamadı');
    expect(service.htmlPdf.render).not.toHaveBeenCalled();
  });
});


describe('canonical commercial PDF data and media', () => {
  it('maps contractual delivery, freight, import and VAT flags without recalculating the signed price', () => {
    const data = commercialSnapshotPrintData('contract', { contractNo: 'SOZ-2' }, { ...snapshot, terms: { ...snapshot.terms, vatIncluded: true, freightPaidBySeller: true, importCostsExcluded: false, deliveryLocation: 'Bursa OSB', estimatedDeliveryDaysMin: 30, estimatedDeliveryDaysMax: 45 }, quote: { ...snapshot.quote, customsTotal: 50 } });
    expect(data).toMatchObject({ kdvDahil: true, nakliyeSaticiya: true, ithalatMasraflariDahil: true, teslimYeri: 'Bursa OSB', teslimGunMin: 30, teslimGunMax: 45, fiyat: 1850 });
  });

  it('uses canonical quote sections and preserves line, header discount and VAT totals', () => {
    const data = quoteSnapshotPrintData({ documentNo: 'CNC-1', validityDays: 30 }, snapshot);
    expect(data).toMatchObject({ firma: 'Şahin & Oğulları', gecerlilik: '30 İş Günü', iskonto: 0, kdvTutar: 360, items: [{ fiyat: 1000, brutTutar: 2000, tutar: 1800, indirim: 200 }] });
    const html = quoteSnapshotPdfHtml({ documentNo: 'CNC-1' }, snapshot);
    expect(html.includes('FİYAT TEKLİFİ')).toBe(true);
    expect(html.includes('q-cover-page')).toBe(true);
    expect(html.includes('Dondurulmuş makine')).toBe(true);
    expect(html.includes('src="haksan-print')).toBe(false);
  });

  it('accepts only web proforma variants and uses the selected print notes without changing stored terms', () => {
    const variantKey = PROFORMA_NOTE_OPTIONS[0].key;
    expect(proformaGeneratePdfSchema.parse(undefined)).toEqual({});
    expect(proformaGeneratePdfSchema.safeParse({ variantKey: 'unknown' }).success).toBe(false);
    expect(proformaGeneratePdfSchema.safeParse({ variantKey, html: '<h1>unsafe</h1>' }).success).toBe(false);
    const data = commercialSnapshotPrintData('proforma', { documentNo: 'PF-1' }, snapshot, { variantKey });
    expect(data).toMatchObject({ notlar: resolveProformaNotes(variantKey, { alici: snapshot.company.legalTitle, kdvOrani: 20 }) });
    expect(snapshot.terms.paymentTermsText).toBe('%50 peşin');
  });

  it('keeps selected option prices with their machine in the contract', () => {
    const main = { ...snapshot.items[0], compatibility: { lineGroupKey: 'group-a' } };
    const option = { description: '↳ Opsiyon: Soğutma', quantity: 1, unitPrice: 100, lineTotal: 100, compatibility: { lineGroupKey: 'group-a' } };
    const data = commercialSnapshotPrintData('contract', { contractNo: 'SOZ-2' }, { ...snapshot, items: [main, option], quote: { ...snapshot.quote, subtotal: 1900 } });
    expect(data).toMatchObject({ machines: [{ adet: 2, fiyat: 1900, aksesuarlar: ['Takım çantası', 'Soğutma'] }] });
  });

  it('resolves media IDs from absolute and relative URLs without fetching those URLs', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const image = { body: Buffer.from('image'), mimeType: 'image/png', sizeBytes: 5 };
    const signatures = { resolvePublicSignature: vi.fn().mockResolvedValue(image) };
    const products = { resolvePublicMedia: vi.fn().mockResolvedValue(image) };
    const brands = { resolvePublicLogo: vi.fn().mockResolvedValue(image) };
    const service = new CommercialPdfMediaService(signatures as never, products as never, brands as never);
    const result = await service.embed({ signature: { fileId: id }, items: [{ product: { imageUrl: `https://metadata.invalid/products/media/${id}`, brandLogoFileId: id } }, { product: { imageUrl: `/products/media/${id}` } }, { product: { imageUrl: `/products/media/${id}` } }] });
    expect(signatures.resolvePublicSignature).toHaveBeenCalledWith(id);
    expect(products.resolvePublicMedia).toHaveBeenCalledTimes(1);
    expect(brands.resolvePublicLogo).toHaveBeenCalledTimes(1);
    expect(result.items[0].product.imageDataUrl).toBe('data:image/png;base64,aW1hZ2U=');
    expect(result.items[1].product.imageDataUrl).toBe('data:image/png;base64,aW1hZ2U=');
  });
});

const chromium = HtmlPdfService.executablePath();
const pdfService = new HtmlPdfService();
afterAll(() => pdfService.onModuleDestroy());
it.skipIf(!chromium)('embeds a recovered legacy machine photo into the real quote PDF', async () => {
  const productId = '11111111-1111-4111-8111-111111111111';
  const fileId = '22222222-2222-4222-8222-222222222222';
  const products = {
    resolveSnapshotImageUrl: vi.fn().mockResolvedValue(`/products/media/${fileId}`),
    resolvePublicMedia: vi.fn().mockResolvedValue({
      body: readFileSync(new URL('../../web/public/print/haxan-product-logo.webp', import.meta.url)),
      mimeType: 'image/webp',
    }),
  };
  const media = new CommercialPdfMediaService({ resolvePublicSignature: async () => null } as never, products as never, { resolvePublicLogo: async () => null } as never);
  const legacy = { ...snapshot, items: [{ ...snapshot.items[0], productModelId: productId }] };
  const embedded = await media.embed(legacy, '33333333-3333-4333-8333-333333333333');
  const document = { documentNo: 'PHOTO-TEST' };
  const html = quoteSnapshotPdfHtml(document, embedded);
  expect(html).toMatch(/class="q-photo" src="data:image\/webp;base64,/);
  const without = await pdfService.render(quoteSnapshotPdfHtml(document, legacy));
  const withPhoto = await pdfService.render(html);
  const imageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Subtype\s*\/Image\b/g) ?? []).length;
  expect(imageCount(withPhoto)).toBeGreaterThan(imageCount(without));
}, 120000);
it.skipIf(!chromium).each(['proforma', 'contract', 'quote'] as const)('renders canonical stored-snapshot %s as a real PDF', async (kind) => {
  const document = { documentNo: 'PF-1', contractNo: 'SOZ-1' };
  const html = kind === 'quote' ? quoteSnapshotPdfHtml(document, snapshot) : commercialDocumentPdfHtml(kind, document, snapshot);
  const buffer = await pdfService.render(html);
  expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  expect(buffer.length).toBeGreaterThan(1000);
}, 120000);
