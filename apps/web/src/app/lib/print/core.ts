// Yazdırılabilir belge altyapısı: A4 sayfa iskeleti, Haksan / DR.MAK antetleri,
// para ve tarih biçimleme, sayıyı yazıya çevirme ve blob-URL yazdırma penceresi.
// Şablonlar saf fonksiyondur (window'a dokunmaz); pencereyi yalnızca
// openPrintWindow açar — böylece şablonlar test için node tarafında da çalışır.

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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Yazdırılan belgeler müşteriye açıktır. Katalog adını tercih eder ve eski
 * kayıtların açıklamasına taşınmış iç stok kodunu çıktıdan temizler.
 */
export const publicProductLabel = (input: {
  description?: unknown;
  stockCode?: unknown;
  catalogName?: unknown;
  fallback?: string;
}): string => {
  const stockCode = String(input.stockCode ?? "").trim();
  const catalogName = String(input.catalogName ?? "").trim();
  const description = String(input.description ?? "").trim();
  let label = catalogName || description;

  if (stockCode) {
    label = label
      .replace(new RegExp(escapeRegExp(stockCode), "giu"), " ")
      .replace(/^[\s./|:;,_–—-]+|[\s./|:;,_–—-]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return label || input.fallback || "Ürün";
};

/** Boş değerleri yazdırırken alan boş kalsın (— değil). */
export const blank = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return s && s !== "—" ? esc(s) : "";
};

export type CurrencyCode = "USD" | "EUR" | "TRY" | (string & {});

const CURRENCY_WORDS: Record<string, string> = {
  USD: "Amerikan Doları",
  EUR: "Euro",
  TRY: "Türk Lirası",
};

export const currencyWord = (code: CurrencyCode): string => CURRENCY_WORDS[code] ?? String(code);

/** 66825 → "66.825,00 USD" */
export const fmtMoney = (n: number, code: CurrencyCode = "USD"): string =>
  `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${code}`;

const ONES = ["", "Bir", "İki", "Üç", "Dört", "Beş", "Altı", "Yedi", "Sekiz", "Dokuz"];
const TENS = ["", "On", "Yirmi", "Otuz", "Kırk", "Elli", "Altmış", "Yetmiş", "Seksen", "Doksan"];
const SCALES = ["", "Bin", "Milyon", "Milyar", "Trilyon"];

const threeDigitsToWords = (n: number): string => {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  let s = "";
  if (h === 1) s += "Yüz";
  else if (h > 1) s += `${ONES[h]}Yüz`;
  s += TENS[t];
  s += ONES[o];
  return s;
};

/** 66825 → "AltmışAltıBinSekizYüzYirmiBeş" (proformadaki "Yalnız #...#" satırı için). */
export const sayiYaziyla = (n: number): string => {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Sıfır";
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  let out = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    // "BirBin" değil "Bin"
    if (i === 1 && g === 1) out += "Bin";
    else out += threeDigitsToWords(g) + SCALES[i];
  }
  return out;
};

/** "Yalnız #AltmışDörtBinDörtYüz# Amerikan Doları" gövdesi. */
export const tutarYaziyla = (amount: number, code: CurrencyCode): string => {
  const tam = Math.floor(amount);
  const kurus = Math.round((amount - tam) * 100);
  let words = sayiYaziyla(tam);
  if (kurus > 0) words += `Virgül${sayiYaziyla(kurus)}`;
  return `Yalnız #${words}# ${currencyWord(code)}`;
};

/** Proforma şablonundaki yazım: #altmışaltıbin…# Amerikan doları */
export const tutarYaziylaProforma = (amount: number, code: CurrencyCode): string => {
  const tam = Math.floor(amount);
  const kurus = Math.round((amount - tam) * 100);
  let words = sayiYaziyla(tam);
  if (kurus > 0) words += `virgül${sayiYaziyla(kurus).toLocaleLowerCase("tr-TR")}`;
  words = words.charAt(0) + words.slice(1).toLocaleLowerCase("tr-TR");
  const cur = currencyWord(code);
  const curLabel = cur.charAt(0) + cur.slice(1).toLocaleLowerCase("tr-TR");
  return `Yalnız #${words}# ${curLabel}`;
};

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/** "2026-02-25" → "25 Şubat 2026" */
export const trLongDate = (value?: string | Date | null): string => {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return typeof value === "string" ? value : "";
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** "2026-02-25" → "25.02.2026" */
export const trShortDate = (value?: string | Date | null): string => {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return typeof value === "string" ? value : "";
  return new Intl.DateTimeFormat("tr-TR").format(d);
};

// ── Ortak sayfa iskeleti ────────────────────────────────────────────────────

export const BASE_CSS = `
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

/** Haksan antetli kağıt şeridi (logo + kırmızı firma bilgi bloğu). */
export const haksanHeader = (assetBase: string): string =>
  `<img class="letterhead" src="${assetBase}/haksan-letterhead.png" alt="HAKSAN MAKİNA">`;

/** DR.MAK antedi: solda logo, sağda başlık kutusu + iletişim satırları. */
export const drmakHeader = (assetBase: string, title: string): string => `
<div class="dm-head">
  <img class="dm-logo" src="${assetBase}/drmak-logo.png" alt="DR. MAK Doktor Makina">
  <div class="dm-right">
    <div class="dm-title">${esc(title)}</div>
    <div class="dm-contact">
      <div>Adres : Yenidoğan Mah. Cicoz Yolu No:24&nbsp;&nbsp;Bayrampaşa,İstanbul</div>
      <div>Tel.&nbsp;:&nbsp;+90 (212) 493 09 93&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Faks&nbsp;:&nbsp;+90 (212) 493 09 94</div>
      <div><span class="link">www.haksanmakina.com.tr</span>&nbsp;&nbsp;/&nbsp;&nbsp;info@haksanmakina.com.tr</div>
    </div>
  </div>
</div>`;

export const drmakFooter = (assetBase: string): string => `
<div class="dm-foot">
  <span class="b">“DOKTOR MAKİNA”</span>
  <img src="${assetBase}/haksan-mini.png" alt="HAKSAN">
  <span>Servis Hizmetleri Tescilli Markasıdır.</span>
</div>`;

export const drmakWatermark = (assetBase: string): string =>
  `<img class="dm-watermark" src="${assetBase}/drmak-watermark.png" alt="">`;

/** DR.MAK formlarının ortak stilleri (antet, filigran, dipnot). */
export const DRMAK_CSS = `
.dm-head { display: flex; justify-content: space-between; align-items: flex-start; }
.dm-logo { width: 64mm; margin-top: 2mm; }
.dm-right { width: 78mm; }
.dm-title {
  border: 1.6pt solid #000; text-align: center; font-size: 16pt;
  font-weight: bold; padding: 1.6mm 2mm; letter-spacing: .2px;
}
.dm-contact { font-size: 7.6pt; margin-top: 1.4mm; line-height: 1.45; }
.dm-watermark {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 165mm; opacity: .9; z-index: 0; pointer-events: none;
}
.dm-foot {
  margin-top: auto; padding-top: 1.5mm; font-size: 9pt;
  display: flex; align-items: center; gap: 2mm;
}
.dm-foot .b { font-weight: bold; }
.dm-foot img { height: 6mm; }
.z { position: relative; z-index: 1; }
`;

export const buildPrintHtml = (doc: PrintDocument, opts?: { autoPrint?: boolean }): string => {
  const printScript =
    opts?.autoPrint === false
      ? ""
      : `<script>
window.onload=async function(){
  var images=Array.from(document.images);
  await Promise.all(images.map(function(img){
    if(img.complete&&img.naturalWidth>0)return Promise.resolve();
    return new Promise(function(resolve){img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});});
  }));
  if(document.fonts&&document.fonts.ready){try{await document.fonts.ready;}catch(e){}}
  setTimeout(function(){window.print();},150);
};<\/script>`;
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>${BASE_CSS}${doc.css}</style></head>
<body>${doc.body}
${printScript}
</body></html>`;
};

const TR_LETTERS: Record<string, string> = {
  ş: "s", Ş: "S",
  ı: "i", İ: "I",
  ğ: "g", Ğ: "G",
  ü: "u", Ü: "U",
  ö: "o", Ö: "O",
  ç: "c", Ç: "C",
};

/**
 * Türkçe harfleri ve kalan aksanları ASCII'ye indirger. İndirilen dosya adları
 * Windows/zip/e-posta ekleri arasında bozulmasın diye kullanılır.
 * "ı" ve "İ" Unicode ayrıştırmasıyla çözülmediğinden önce elle eşlenir.
 */
export const asciiFold = (value: string): string =>
  value
    .replace(/[şŞıİğĞüÜöÖçÇ]/g, (char) => TR_LETTERS[char] ?? char)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");

/** Dosya sistemi sınırı 255; ".html" uzantısı ve kopya ekleri için pay bırakılır. */
const SAFE_FILENAME_MAX = 150;

/**
 * Dosya adını güvenli hale getirir: ASCII'ye indirger, dosya sistemleri için
 * tehlikeli karakterleri (`/ \ : * ? " < > |` ve kontrol karakterleri) ayıklar,
 * baştaki noktaları (gizli dosya) atar ve aşırı uzun adları keser.
 */
export const safeFilename = (name: string): string => {
  const cleaned = asciiFold(name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return cleaned.slice(0, SAFE_FILENAME_MAX).replace(/[\s._-]+$/, "") || "belge";
};

/** Yazdırılabilir HTML dosyasını indirir (tarayıcıda açılıp PDF olarak kaydedilebilir). */
export const downloadPrintHtml = (doc: PrintDocument, filename: string): void => {
  const html = buildPrintHtml(doc, { autoPrint: false });
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilename(filename)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Varsayılan logo/asset kökü — public/print Vite tarafından kökten servis edilir. */
export const printAssetBase = (): string => `${window.location.origin}/print`;

/**
 * Belgeyi yeni pencerede açıp otomatik yazdırır.
 * false dönerse pop-up engellenmiştir; çağıran taraf kullanıcıyı uyarmalı.
 */
export const openPrintWindow = (doc: PrintDocument): boolean => {
  const url = URL.createObjectURL(new Blob([buildPrintHtml(doc)], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
};

/**
 * Belgeyi otomatik yazdırmadan yeni pencerede açar. Kullanıcı buradan
 * tarayıcı menüsüyle PDF olarak kaydedebilir.
 */
export const openPrintPreviewWindow = (doc: PrintDocument): boolean => {
  const url = URL.createObjectURL(new Blob([buildPrintHtml(doc, { autoPrint: false })], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
};
