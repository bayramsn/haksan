import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { quoteDocumentHtml, quoteRecordForPrint } from './quoteDocumentData';
import { productForPrint } from './productTechnicalDocumentData';
const native = vi.hoisted(() => ({ get: vi.fn(), product: vi.fn(), company: vi.fn(), contact: vi.fn(), lookup: vi.fn(), print: vi.fn(), share: vi.fn() }));
vi.mock('expo-print', () => ({ printToFileAsync: native.print }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: native.share }));
vi.mock('../api/config', () => ({ apiBaseOrigin: () => 'https://crm.example.test' }));
vi.mock('../api/services', () => ({ quoteService: { get: native.get }, productService: { get: native.product }, companyService: { get: native.company }, contactService: { get: native.contact }, lookupService: { byName: native.lookup } }));
import { shareQuoteDocument } from './quoteDocument';
const company = { legalTitle: 'Ankara Makine', addresses: [{ fullAddress: 'Örnek Cad.', province: 'Ankara' }] };
const product = { id: 'p1', fullName: 'CNC M100', modelCode: 'M100', productType: { code: '' }, category: { code: 'TEZGAH' }, currency: { code: 'EUR' }, specs: [] };
const item = { productModelId: 'p1', description: 'CNC M100', quantity: 1, unitPrice: 1234, lineTotal: 1234, vatRate: 20, compatibility: { technicalSpecs: [{ key: 'X Ekseni', value: '812', unit: 'mm', groupCode: 'EKSENLER' }] } };
const quote = { id: 'q1', documentNo: 'TEK-100', quoteDate: '2026-10-22', companyId: 'c1', currencyId: 'eur', items: [item], subtotal: 1234, vatAmount: 246.8, terms: { paymentTermsText: 'Peşin ödeme' } };
beforeEach(() => {
  vi.clearAllMocks();
  native.print.mockResolvedValue({ uri: 'file:///cache/quote.pdf' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer }));
});
afterEach(() => vi.unstubAllGlobals());

describe('quote PDF uses web commercial and technical templates', () => {
  it('preserves CRM line prices, technical categories and terms', () => {
    const html = quoteDocumentHtml(quote, company, null, 'EUR', [productForPrint(product, [], 'https://crm.example.test')], 'https://crm.example.test');
    for (const text of ['TEK-100', 'Ankara Makine', '1.234', 'EKSENLER', '812 mm', 'Peşin ödeme', '/print/haksan-letterhead.jpg']) expect(html).toContain(text);
  });
  it('uses frozen quote lines and terms instead of newer live amounts', async () => {
    const frozen = { ...quote, items: [{ ...item, unitPrice: 9999 }], finalizedAt: '2026-10-22', documentSnapshot: {
      quote: { ...quote, documentNo: 'SAVED-100' }, items: [item], terms: { paymentTermsText: 'Kayıtlı ödeme' }, currency: { code: 'EUR' }, company,
      companyAddresses: company.addresses,
    } };
    expect(quoteRecordForPrint(frozen).items[0].unitPrice).toBe(1234);
    native.get.mockResolvedValue(frozen);
    await shareQuoteDocument('q1');
    expect(native.product).not.toHaveBeenCalled();
    expect(native.company).not.toHaveBeenCalled();
    expect(native.lookup).not.toHaveBeenCalled();
    const html = native.print.mock.calls[0][0].html;
    expect(html).toContain('SAVED-100'); expect(html).toContain('Kayıtlı ödeme'); expect(html).toContain('1.234'); expect(html).not.toContain('9.999');
    expect(native.share).toHaveBeenCalledWith('file:///cache/quote.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
  });
  it('loads current CRM product metadata without replacing the quote price', async () => {
    native.get.mockResolvedValue(quote); native.company.mockResolvedValue(company);
    native.lookup.mockResolvedValue([{ id: 'eur', code: 'EUR' }]); native.product.mockResolvedValue({ ...product, listPrice: 99999 });
    await shareQuoteDocument('q1');
    expect(native.product).toHaveBeenCalledWith('p1');
    expect(native.print.mock.calls[0][0].html).toContain('1.234');
    expect(native.print.mock.calls[0][0].html).not.toContain('99.999');
  });
  it('rejects missing currency or line price without sharing a misleading PDF', () => {
    expect(() => quoteDocumentHtml(quote, company, null, '', [], 'https://crm.example.test')).toThrow('para birimi');
    expect(() => quoteDocumentHtml({ ...quote, items: [{ ...item, unitPrice: null }] }, company, null, 'EUR', [], 'https://crm.example.test')).toThrow('fiyat');
  });
});
