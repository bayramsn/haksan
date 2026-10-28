import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { AppError, RateLimitedError, ValidationError } from '../utils/errors';

// puppeteer-core 25+ yalnız ESM; CommonJS API'den tipleri bile içe aktarılamıyor (TS1479).
// Kullandığımız yüzey küçük: yapısal tiplerle tanımlanır, paket dinamik import ile yüklenir.
interface PdfRequest { url(): string; resourceType(): string; continue(): Promise<void>; abort(): Promise<void> }
interface PdfPage {
  setJavaScriptEnabled(enabled: boolean): Promise<void>;
  setRequestInterception(enabled: boolean): Promise<void>;
  on(event: 'request', handler: (request: PdfRequest) => void): unknown;
  setContent(html: string, options: { waitUntil: 'load'; timeout: number }): Promise<void>;
  emulateMediaType(type: 'print'): Promise<void>;
  pdf(options: { format: 'A4'; printBackground: boolean; preferCSSPageSize: boolean; timeout: number }): Promise<Uint8Array>;
  close(): Promise<void>;
}
interface Browser { newPage(): Promise<PdfPage>; close(): Promise<void>; on(event: 'disconnected', handler: () => void): unknown; process?(): { kill(signal: string): boolean } | null }

/**
 * İstemcinin ürettiği yazdırma HTML'ini headless Chromium ile PDF'e çevirir; çıktı,
 * tarayıcıdaki "Yazdır / PDF Kaydet" ile birebir aynıdır.
 *
 * Girdi kullanıcı tarafından üretilen HTML olduğu için sayfa kapalı kutu çalışır:
 * JavaScript kapalı, ağ erişimi yok (yalnızca gömülü data: görseller), zaman sınırı var.
 */
@Injectable()
export class HtmlPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(HtmlPdfService.name);
  private browser: Promise<Browser> | null = null;
  private activeRenders = 0;
  static readonly MAX_CONCURRENT_RENDERS = 2;
  // Matches the existing web/mail HTML contract, including embedded image data.
  static readonly MAX_HTML_BYTES = 8_000_000;

  static readonly CHROMIUM_CANDIDATES = [
    process.env.CHROMIUM_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter((p): p is string => Boolean(p));

  static executablePath(): string | null {
    return HtmlPdfService.CHROMIUM_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
  }

  isAvailable(): boolean {
    return HtmlPdfService.executablePath() !== null;
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const executablePath = HtmlPdfService.executablePath();
      if (!executablePath) throw new ValidationError('Sunucuda PDF üretici (Chromium) bulunamadı');
      // puppeteer-core 25+ yalnız ESM; CommonJS API'den dinamik import ile yüklenir.
      this.browser = import('puppeteer-core').then(({ default: puppeteer }) => puppeteer.launch({
        executablePath,
        headless: true,
        // Konteynerde root/sandbox kısıtı; içerik zaten JS'siz ve ağsız render ediliyor.
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
      }) as unknown as Promise<Browser>).catch((error) => {
        this.browser = null;
        throw error;
      });
      void this.browser.then((browser) => browser.on('disconnected', () => { this.browser = null; })).catch(() => undefined);
    }
    return this.browser;
  }

  async render(html: string, opts: { timeoutMs?: number } = {}): Promise<Buffer> {
    if (Buffer.byteLength(html, 'utf8') > HtmlPdfService.MAX_HTML_BYTES) {
      throw new ValidationError('PDF içeriği izin verilen boyutu aşıyor');
    }
    if (this.activeRenders >= HtmlPdfService.MAX_CONCURRENT_RENDERS) {
      throw new RateLimitedError('PDF üretici meşgul, lütfen kısa süre sonra tekrar deneyin');
    }
    this.activeRenders += 1;
    const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 30_000, 1), 60_000);
    let page: PdfPage | undefined;
    let renderBrowser: Browser | undefined;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutError = () => new AppError('PDF_TIMEOUT', 'PDF üretimi zaman aşımına uğradı, lütfen tekrar deneyin', 503);
    const work = async (): Promise<Buffer> => {
      const browser = await this.getBrowser();
      renderBrowser = browser;
      if (expired) throw timeoutError();
      page = await browser.newPage();
      // newPage itself may finish after the deadline; never leave that page alive.
      if (expired) {
        void page.close().catch(() => undefined);
        try { browser.process?.()?.kill('SIGKILL'); } catch { /* already exited */ }
        this.browser = null;
        throw timeoutError();
      }
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        // Only embedded data: block iframe navigation, file reads and SSRF too.
        const url = request.url();
        const action = url.startsWith('data:') || url.startsWith('about:') ? request.continue() : request.abort();
        void action.catch(() => undefined);
      });
      await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });
      await page.emulateMediaType('print');
      const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, timeout: timeoutMs });
      return Buffer.from(pdf);
    };
    try {
      return await Promise.race([work(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(timeoutError()); }, timeoutMs);
      })]);
    } finally {
      if (timer) clearTimeout(timer);
      expired = true;
      // Cleanup cannot keep the caller/slot hanging if Chromium stops responding.
      if (page) {
        let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
        const discardBrowser = () => {
          try { renderBrowser?.process?.()?.kill('SIGKILL'); } catch { /* already exited */ }
          this.browser = null;
        };
        await Promise.race([page.close().catch(discardBrowser), new Promise<void>((resolve) => {
          cleanupTimer = setTimeout(() => {
            // A hung renderer must not survive slot release and accumulate pages.
            // This process belongs to our launch (never an external browser).
            discardBrowser();
            resolve();
          }, 1000);
        })]);
        if (cleanupTimer) clearTimeout(cleanupTimer);
      }
      this.activeRenders -= 1;
    }
  }

  async onModuleDestroy() {
    const browser = await this.browser?.catch(() => null);
    await browser?.close().catch((error) => this.logger.warn(`Chromium kapatılamadı: ${String(error)}`));
  }
}
