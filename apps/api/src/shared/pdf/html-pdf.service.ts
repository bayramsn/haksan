import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { AppError, ValidationError } from '../utils/errors';

// puppeteer-core 25+ yalnız ESM; CommonJS API'den tipleri bile içe aktarılamıyor (TS1479).
// Kullandığımız yüzey küçük: yapısal tiplerle tanımlanır, paket dinamik import ile yüklenir.
interface PdfRequest { url(): string; resourceType(): string; continue(): Promise<void>; abort(): Promise<void> }
interface PdfPage {
  setJavaScriptEnabled(enabled: boolean): Promise<void>;
  setRequestInterception(enabled: boolean): Promise<void>;
  on(event: 'request', handler: (request: PdfRequest) => void): unknown;
  setContent(html: string, options: { waitUntil: 'load'; timeout: number }): Promise<void>;
  emulateMediaType(type: 'print'): Promise<void>;
  pdf(options: { format: 'A4'; printBackground: boolean; preferCSSPageSize: boolean; timeout: number; pageRanges: string }): Promise<Uint8Array>;
  close(): Promise<void>;
}
/** Aynı anda çizilen belge; fazlası sıraya girer, sıra da doluysa istek reddedilir. */
const MAX_CONCURRENT_RENDERS = 2;
const MAX_QUEUED_RENDERS = 8;
/** Belgelerimizin en uzunu (çok makineli sözleşme) bunun çok altında; tavan Chromium'u korur. */
const MAX_PDF_PAGES = 100;

interface Browser { newPage(): Promise<PdfPage>; close(): Promise<void>; on(event: 'disconnected', handler: () => void): unknown }

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
  private readonly waiting: Array<() => void> = [];

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
        // Proxy: <link rel=prefetch|prerender> gibi istekler sayfa interception'ını
        // atlıyor (kör SSRF); tüm trafik loopback dahil kapalı bir porta yönlenir.
        args: [
          '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none',
          '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>',
        ],
      }) as unknown as Promise<Browser>).catch((error) => {
        this.browser = null;
        throw error;
      });
      void this.browser.then((browser) => browser.on('disconnected', () => { this.browser = null; }));
    }
    return this.browser;
  }

  async render(html: string, opts: { timeoutMs?: number } = {}): Promise<Buffer> {
    await this.acquireSlot();
    try {
      return await this.renderPage(html, opts);
    } finally {
      // Yer sıradakine doğrudan devredilir; sayaç düşüp araya yeni istek girmez.
      const next = this.waiting.shift();
      if (next) next();
      else this.activeRenders -= 1;
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeRenders < MAX_CONCURRENT_RENDERS) {
      this.activeRenders += 1;
      return;
    }
    if (this.waiting.length >= MAX_QUEUED_RENDERS) {
      throw new AppError('PDF_BUSY', 'PDF üretici şu an yoğun; birkaç saniye sonra tekrar deneyin', 503);
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private async renderPage(html: string, opts: { timeoutMs?: number }): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        // Yalnızca gömülü veri; dış URL'ler (SSRF, izleme) engellenir. Ana belge
        // setContent ile CDP üzerinden verilir, ağ isteği üretmez — "document" tipine
        // izin vermek yalnız iframe / meta-refresh gezinmelerini (ör. bulut meta-veri
        // ucu) açıyordu.
        const url = request.url();
        if (url.startsWith('data:') || url.startsWith('about:')) void request.continue();
        else void request.abort();
      });
      await page.setContent(html, { waitUntil: 'load', timeout: opts.timeoutMs ?? 20_000 });
      await page.emulateMediaType('print');
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        timeout: opts.timeoutMs ?? 20_000,
        pageRanges: `1-${MAX_PDF_PAGES}`,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy() {
    const browser = await this.browser?.catch(() => null);
    await browser?.close().catch((error) => this.logger.warn(`Chromium kapatılamadı: ${String(error)}`));
  }
}
