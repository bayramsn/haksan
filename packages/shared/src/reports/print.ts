// Yazdırılabilir belge çekirdeği: web'deki "Yazdır / PDF" penceresi ile sunucudaki
// (cron eki) Chromium aynı HTML'i üretsin diye ortak pakette durur. Saf string —
// window/DOM yok, node'da test edilir.

export interface PrintDocument {
  title: string;
  css: string;
  body: string;
}

export const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A4 sayfa iskeleti: `.page` beyaz kâğıt, ekranda gri zemin üstünde durur. */
export const PRINT_BASE_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Calibri, Carlito, "Segoe UI", Tahoma, Arial, sans-serif;
  color: #000; margin: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
table { border-collapse: collapse; }
.page {
  width: 210mm; min-height: 296mm; padding: 8mm 11mm 9mm;
  margin: 0 auto; position: relative; background: #fff;
  display: flex; flex-direction: column; overflow: visible;
  page-break-after: always;
}
.page:last-child { page-break-after: auto; }
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
tr, img, .avoid-break { break-inside: avoid; page-break-inside: avoid; }
img.letterhead { width: 100%; display: block; }
.link { color: #0563c1; text-decoration: underline; }
.pageno { text-align: center; font-size: 10pt; margin-top: auto; padding-top: 4mm; }
.pageno b { font-weight: bold; }
@media screen {
  body { background: #4a4d52; padding: 18px 0; }
  .page { box-shadow: 0 3px 14px rgba(0,0,0,.4); margin-bottom: 18px; }
}
`;

/** Otomatik yazdırma betiği olmadan tam HTML; sunucu PDF'i ve önizleme bunu kullanır. */
export const printDocumentHtml = (doc: PrintDocument): string =>
  `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>${PRINT_BASE_CSS}${doc.css}</style></head>
<body>${doc.body}
</body></html>`;
