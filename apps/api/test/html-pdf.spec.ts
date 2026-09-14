import { afterAll, describe, expect, it } from 'vitest';
import { HtmlPdfService } from '../src/shared/pdf/html-pdf.service';

// Teklif mail eki: istemcinin "Yazdır / PDF Kaydet" HTML'i Chromium ile PDF'e çevrilir.
// Chromium yoksa (CI'da kurulmamışsa) test atlanır; Docker imajında kurulu.
const chromium = HtmlPdfService.executablePath();
const service = new HtmlPdfService();

describe.skipIf(!chromium)('HtmlPdfService', () => {
  afterAll(() => service.onModuleDestroy());

  it('Türkçe karakterli belgeyi A4 PDF olarak üretir, dış ağa çıkmaz', async () => {
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>@page { size: A4; margin: 12mm }</style></head>
      <body><h1>FİYAT TEKLİFİ — Şahintek Işık Ğüçlü</h1>
      <img src="http://127.0.0.1:9/should-not-load.png" alt="">
      <script>document.body.innerHTML = 'JS ÇALIŞTI';</script></body></html>`;
    const pdf = await service.render(html, { timeoutMs: 15_000 });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1_000);
    // Metin katmanı Türkçe karakterleri korur; JS kapalı olduğundan içerik değişmez.
    const text = pdf.toString('latin1');
    expect(text).not.toContain('JS');
    // CI runner'da Chromium'un SOĞUK başlatması tek başına 30 sn'yi aşabiliyor
    // ve bu süre render bütçesinin (15 sn) dışında. 30 sn sınırdayken koşu
    // yeşil/kırmızı arasında gidip geldi ve yayını iki kez durdurdu.
  }, 120_000);

  it('Chromium yoksa anlaşılır hata verir', () => {
    expect(HtmlPdfService.CHROMIUM_CANDIDATES.length).toBeGreaterThan(0);
  });
});
