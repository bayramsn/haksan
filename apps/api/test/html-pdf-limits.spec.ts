import { describe, expect, it, vi } from 'vitest';
import { HtmlPdfService } from '../src/shared/pdf/html-pdf.service';

function mockPage() {
  return {
    setJavaScriptEnabled: vi.fn().mockResolvedValue(undefined),
    setRequestInterception: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(), setContent: vi.fn().mockResolvedValue(undefined),
    emulateMediaType: vi.fn().mockResolvedValue(undefined),
    pdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-test')),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('PDF resource boundaries', () => {
  it('rejects oversized UTF-8 HTML before launching Chromium', async () => {
    const service = new HtmlPdfService();
    const launch = vi.spyOn(service as any, 'getBrowser');
    await expect(service.render('ş'.repeat(4_000_001))).rejects.toMatchObject({ statusCode: 422 });
    expect(launch).not.toHaveBeenCalled();
  });

  it('allows two renders, rejects excess calls and releases capacity after completion', async () => {
    const service = new HtmlPdfService();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const page = mockPage();
    page.setContent.mockImplementation(() => blocked);
    const browser = { newPage: vi.fn().mockResolvedValue(page) };
    vi.spyOn(service as any, 'getBrowser').mockResolvedValue(browser);
    const first = service.render('one');
    const second = service.render('two');
    await expect(service.render('excess')).rejects.toMatchObject({ statusCode: 429 });
    release();
    await Promise.all([first, second]);
    await expect(service.render('next')).resolves.toEqual(Buffer.from('%PDF-test'));
    expect(browser.newPage).toHaveBeenCalledTimes(3);
  });

  it('bounds the entire operation and closes a page that arrives after the deadline', async () => {
    const service = new HtmlPdfService();
    const page = mockPage();
    let release!: (page: unknown) => void;
    const pending = new Promise((resolve) => { release = resolve; });
    vi.spyOn(service as any, 'getBrowser').mockResolvedValue({ newPage: () => pending });
    await expect(service.render('slow', { timeoutMs: 5 })).rejects.toMatchObject({ code: 'PDF_TIMEOUT', statusCode: 503 });
    release(page);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(page.close).toHaveBeenCalled();
    expect(page.pdf).not.toHaveBeenCalled();
  });

  it('closes failed pages and keeps JS/network isolation', async () => {
    const service = new HtmlPdfService();
    const page = mockPage();
    page.pdf.mockRejectedValue(new Error('renderer failed'));
    vi.spyOn(service as any, 'getBrowser').mockResolvedValue({ newPage: async () => page });
    await expect(service.render('test')).rejects.toThrow('renderer failed');
    expect(page.close).toHaveBeenCalled();
    expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    const intercept = page.on.mock.calls[0][1];
    for (const url of ['http://169.254.169.254/', 'https://example.com', 'file:///etc/passwd']) {
      const request = { url: () => url, continue: vi.fn().mockResolvedValue(undefined), abort: vi.fn().mockResolvedValue(undefined) };
      intercept(request);
      expect(request.abort).toHaveBeenCalled();
      expect(request.continue).not.toHaveBeenCalled();
    }
  });

  it('terminates its Chromium process when page cleanup hangs', async () => {
    const service = new HtmlPdfService();
    const page = mockPage();
    page.close.mockImplementation(() => new Promise(() => {}));
    const kill = vi.fn();
    vi.spyOn(service as any, 'getBrowser').mockResolvedValue({ newPage: async () => page, process: () => ({ kill }) });
    await service.render('test');
    expect(kill).toHaveBeenCalledWith('SIGKILL');
  });
});
