import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./apiClient', () => ({ api, API_BASE_URL: '/api/v1', getAccessToken: () => 'session',
  getActiveDivision: () => 'division-a', getActiveDepartment: () => 'department-a', refreshSession: vi.fn(async () => 'fresh-session') }));
import { commercialPdfService } from './commercialPdf';
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ status: 'ready' }); });
describe('canonical web PDF', () => {
  it('prepares only by record identity and saved logo option, then downloads actual PDF bytes', async () => {
    api.post.mockResolvedValue({ status: 'ready' });
    const click = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response('%PDF-canonical', { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="PF-1.pdf"' } }));
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('document', { createElement: () => ({ click }) });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf');
    vi.useFakeTimers();
    await commercialPdfService.present('quote', 'record-a', 'download', true, { headerLogoMode: 'company' });
    expect(api.post).toHaveBeenCalledWith('/quotes/record-a/pdf', { headerLogoMode: 'company' });
    expect(fetcher).toHaveBeenCalledWith('/api/v1/quotes/record-a/pdf', expect.objectContaining({ credentials: 'include' }));
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({ 'X-Active-Division': 'division-a', 'X-Active-Department': 'department-a' });
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledOnce();
    vi.runAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); create.mockRestore();
  });
  it('reports preparation failure and never downloads a fallback HTML document', async () => {
    api.post.mockRejectedValueOnce(new Error('PDF üretici kullanılamıyor'));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(commercialPdfService.present('contract', 'record-a', 'download', true)).rejects.toThrow('PDF üretici');
    expect(fetcher).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
  it('downloads a prepared PDF for a read-only user without a preparation request', async () => {
    const click = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('%PDF-ready', { headers: { 'content-type': 'application/pdf' } })));
    vi.stubGlobal('document', { createElement: () => ({ click }) });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ready');
    vi.useFakeTimers();
    await commercialPdfService.present('proforma', 'read-record', 'download');
    expect(api.get).toHaveBeenCalledWith('/proformas/read-record/pdf/status');
    expect(api.post).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
    vi.runAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); create.mockRestore();
  });
  it.each(['missing', 'outdated'])('makes %s PDF actionable without trying to mutate or download', async (status) => {
    api.get.mockResolvedValueOnce({ status });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(commercialPdfService.present('quote', 'read-record', 'download')).rejects.toThrow('PDF Hazırla / Yenile');
    expect(api.post).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('does not download when read access to PDF status is denied', async () => {
    api.get.mockRejectedValueOnce(new Error('Bu belgeye erişim yetkiniz yok.'));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(commercialPdfService.present('contract', 'restricted', 'download')).rejects.toThrow('erişim yetkiniz yok');
    expect(api.post).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('opens the preview tab during the tap (tablet popup blockers) and loads the PDF into it', async () => {
    const tab = { opener: {}, document: { title: '', body: { textContent: '' } }, location: { href: '' }, close: vi.fn() };
    const open = vi.fn(() => tab);
    vi.stubGlobal('window', { open });
    let openedBeforeFetch = false;
    vi.stubGlobal('fetch', vi.fn(async () => { openedBeforeFetch = open.mock.calls.length === 1; return new Response('%PDF-ok', { headers: { 'content-type': 'application/pdf' } }); }));
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.useFakeTimers();
    const pending = commercialPdfService.present('quote', 'record-a', 'open');
    expect(open).toHaveBeenCalledWith('', '_blank');
    await pending;
    expect(openedBeforeFetch).toBe(true);
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe('blob:preview');
    vi.runAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); create.mockRestore();
  });
  it('closes the pre-opened tab when the PDF cannot be shown', async () => {
    api.get.mockResolvedValueOnce({ status: 'missing' });
    const tab = { opener: {}, document: { title: '', body: null }, location: { href: '' }, close: vi.fn() };
    vi.stubGlobal('window', { open: vi.fn(() => tab) });
    await expect(commercialPdfService.present('quote', 'record-a', 'open')).rejects.toThrow('PDF Hazırla / Yenile');
    expect(tab.close).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
  it('rejects an HTML success response instead of presenting it as PDF', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(commercialPdfService.present('quote', 'record-a', 'download', false)).rejects.toThrow('geçerli bir PDF');
    vi.unstubAllGlobals();
  });
});
