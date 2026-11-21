import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { ValidationError } from '../utils/errors';

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
  evaluate<T>(fn: (...args: any[]) => T | Promise<T>, ...args: unknown[]): Promise<T>;
  close(): Promise<void>;
}
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
  // ponytail: süreç içi küçük önbellek (aynı ürün fotoğrafı her PDF'te yeniden işlenmesin); 40 görsel ≈ 10 MB.
  private readonly shrunk = new Map<string, string>();

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

  /** Büyük gömülü fotoğraflar (ör. 5616 px CMYK JPEG) Chromium'da ham piksel olarak PDF'e girip
   * 17 MB / 13 sn'lik çıktı üretiyordu. Baskıya yetecek boyuta küçültülüp sRGB JPEG'e çevrilir;
   * küçük görseller (logolar, saydam PNG'ler) olduğu gibi kalır. Hata olursa özgün görsel basılır. */
  private async shrinkImages(browser: Browser, html: string): Promise<string> {
    // Düzenli ifade çok büyük (MB'lık) özniteliklerde yığın taşırıyor; düz tarama kullanılır.
    const large = new Set<string>();
    for (let at = html.indexOf('src="data:image/'); at >= 0; at = html.indexOf('src="data:image/', at + 5)) {
      const src = html.slice(at + 5, html.indexOf('"', at + 5));
      if (src.length > 400_000 && /^data:image\/(?:jpeg|png|webp);base64,/.test(src.slice(0, 40))) large.add(src);
    }
    if (!large.size) return html;
    const page = await browser.newPage();
    try {
      await page.setRequestInterception(true);
      page.on('request', (request) => void (request.url().startsWith('data:') || request.url().startsWith('about:') ? request.continue() : request.abort()));
      for (const src of large) {
        const key = createHash('sha1').update(src).digest('hex');
        const cached = this.shrunk.get(key);
        if (cached) { html = html.split(src).join(cached); continue; }
        const small = await page.evaluate(async (source: string, max: number) => {
          const img = new Image();
          img.src = source;
          await img.decode();
          const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.naturalWidth * k);
          canvas.height = Math.round(img.naturalHeight * k);
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.85);
        }, src, 1800).catch(() => null);
            if (!small || small.length >= src.length) continue;
        if (this.shrunk.size >= 40) this.shrunk.delete(this.shrunk.keys().next().value!);
        this.shrunk.set(key, small);
        html = html.split(src).join(small);
      }
      return html;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async render(html: string, opts: { timeoutMs?: number } = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    html = await this.shrinkImages(browser, html);
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
