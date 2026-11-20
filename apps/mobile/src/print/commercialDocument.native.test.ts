import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  print: vi.fn(), available: vi.fn(), share: vi.fn(), quote: vi.fn(),
}));
vi.mock('expo-print', () => ({ printToFileAsync: native.print }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: native.available, shareAsync: native.share }));
vi.mock('../api/config', () => ({ apiBaseOrigin: () => 'https://crm.example.test' }));
vi.mock('../api/services', () => ({
  companyService: {}, contactService: {}, lookupService: {}, productService: {}, financeService: {}, quoteService: { get: native.quote },
}));
import { shareCommercialDocument } from './commercialDocument';

const record = { documentNo: 'PF-42', issueDate: '2026-10-22', documentSnapshot: {
  company: { legalTitle: 'Ankara Makine' }, currency: { code: 'EUR' },
  items: [{ description: 'CNC', quantity: 1, unitPrice: 1000, vatRate: 20 }],
  quote: { subtotal: 1000, vatAmount: 200 }, terms: {},
} };

beforeEach(() => {
  vi.clearAllMocks();
  native.available.mockResolvedValue(true);
  native.print.mockResolvedValue({ uri: 'file:///cache/generated.pdf', numberOfPages: 1 });
  native.share.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({ 'content-type': 'image/png' }),
    arrayBuffer: async () => Uint8Array.from([0, 1, 2, 255]).buffer,
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('native commercial PDF sharing', () => {
  it('embeds CRM print assets before generating and sharing the resulting PDF', async () => {
    await shareCommercialDocument('proforma', record);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
      'https://crm.example.test/print/haksan-letterhead.png', 'https://crm.example.test/print/haksan-stamp.png',
    ]));
    expect(native.quote).not.toHaveBeenCalled();
    const printOptions = native.print.mock.calls[0][0];
    expect(printOptions.html).toContain('PF-42');
    expect(printOptions.html).toContain('data:image/png;base64,AAEC/w==');
    expect(printOptions.html).not.toMatch(/<img[^>]+src="https?:/);
    expect(native.share).toHaveBeenCalledWith('file:///cache/generated.pdf', expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }));
  });
  it('does not generate a file when native sharing is unavailable', async () => {
    native.available.mockResolvedValue(false);
    await expect(shareCommercialDocument('proforma', record)).rejects.toThrow('paylaşımı');
    expect(native.print).not.toHaveBeenCalled();
  });
  it('does not share a file when PDF creation fails', async () => {
    native.print.mockRejectedValue(new Error('PDF oluşturulamadı'));
    await expect(shareCommercialDocument('proforma', record)).rejects.toThrow('PDF oluşturulamadı');
    expect(native.share).not.toHaveBeenCalled();
  });
  it('does not generate an incomplete PDF when CRM images fail to load', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, headers: new Headers() } as Response);
    await expect(shareCommercialDocument('proforma', record)).rejects.toThrow('görselleri');
    expect(native.print).not.toHaveBeenCalled();
  });
});
