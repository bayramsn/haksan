import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { existsSync } from 'node:fs';
import puppeteer, { type Browser } from 'puppeteer-core';
import { ValidationError } from '../utils/errors';

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
      this.browser = puppeteer.launch({
        executablePath,
        headless: true,
        // Konteynerde root/sandbox kısıtı; içerik zaten JS'siz ve ağsız render ediliyor.
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
      }).catch((error) => {
        this.browser = null;
        throw error;
      });
      void this.browser.then((browser) => browser.on('disconnected', () => { this.browser = null; }));
    }
    return this.browser;
  }

  async render(html: string, opts: { timeoutMs?: number } = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        // Yalnızca belge ve gömülü veri; dış URL'ler (SSRF, izleme) engellenir.
        const url = request.url();
        if (request.resourceType() === 'document' || url.startsWith('data:') || url.startsWith('about:')) void request.continue();
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
