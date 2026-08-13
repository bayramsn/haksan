// Haksan CRM yazdırılabilir belge şablonları. Sayfa düzenleri orijinal Word
// çıktılarından (Proforma, Fiyat Teklifi, Satış Sözleşmesi, Kurulum Tutanağı,
// Servis Formu) birebir taşınmıştır; logolar public/print altındaki orijinal
// görsellerdir.

import {
  PrintDocument, CurrencyCode, esc, blank, fmtMoney, tutarYaziyla, tutarYaziylaProforma, trLongDate,
  haksanHeader, drmakHeader, drmakFooter, drmakWatermark, DRMAK_CSS,
} from "./core";
import { printableTechnicalSpecs } from "./technicalSpecs";
import { QuoteNoteVariant } from "./notes";

const chunkByWeight = <T,>(items: readonly T[], capacity: number, weightOf: (item: T) => number): T[][] => {
  if (!items.length) return [[]];
  const pages: T[][] = [];
  let page: T[] = [];
  let used = 0;
  for (const item of items) {
    const weight = Math.max(1, Math.ceil(weightOf(item)));
    if (page.length && used + weight > capacity) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(item);
    used += Math.min(weight, capacity);
  }
  if (page.length) pages.push(page);
  return pages;
};

const pageNo = (current: number, total: number) =>
  `<div class="pageno">Sayfa <b>${current}</b> / <b>${total}</b></div>`;

/** Cümle sonu sayılan işaretler — bölme noktası öncelikle burada aranır. */
const SENTENCE_ENDINGS = [". ", "; ", "! ", "? ", ".\n", ";\n"];

/** Bir şart sayfasının taşıyabildiği ağırlık ve bir satırın karakter karşılığı. */
const NOTE_PAGE_CAPACITY = 8;
const NOTE_LINE_CHARS = 280;
const noteWeightOf = (note: string) => Math.max(1, note.length / NOTE_LINE_CHARS);

const chunkText = (value: string | undefined, maxChars = 1400): string[] => {
  const source = value?.replace(/\r\n?/g, "\n").trim();
  if (!source) return [];
  const chunks: string[] = [];
  let remaining = source;
  while (remaining.length > maxChars) {
    const searchStart = Math.max(1, Math.floor(maxChars * 0.65));
    // Bölme noktası önce satır/cümle sonunda aranır. Yalnız boşluğa bakmak,
    // uzun bir şart maddesini cümlenin ortasından kesiyordu; ikinci parça
    // ayrı bir maddeymiş gibi, yarım bir cümleyle başlayarak basılıyordu.
    const lineEnd = remaining.lastIndexOf("\n", maxChars);
    const sentenceEnd = Math.max(
      ...SENTENCE_ENDINGS.map((mark) => {
        const at = remaining.lastIndexOf(mark, maxChars - 1);
        return at >= 0 ? at + 1 : -1;
      })
    );
    const wordEnd = remaining.lastIndexOf(" ", maxChars);
    const semantic = Math.max(lineEnd, sentenceEnd);
    const cutAt = semantic >= searchStart ? semantic : wordEnd >= searchStart ? wordEnd : maxChars;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
};

// Satıcı (Haksan) sabit kimlik bilgileri — proforma altbilgisi ve sözleşme
// TARAFLAR sayfasında kullanılır.
export const HAKSAN = {
  unvan: "HAKSAN TAKIM TEZGAHLARI MAK.SAN. ve TİC. LTD. ŞTİ.",
  unvanUzun: "HAKSAN TAKIM TEZGAHLARI MAKİNA SAN. Ve TİC. LTD. ŞTİ.",
  unvanKisa: "HAKSAN TAKIM TEZG. MAK. SAN. TİC. LTD. ŞTİ.",
  yetkili: "İsmail SOMALI",
  adres1: "Yenidoğan  Mah.  Eyüp Sultan  Cad.   No: 24",
  adres2: "Bayrampaşa, İstanbul",
  adresSozlesme: "Yenidoğan Mah. Eyüp Sultan Caddesi No:24 Bayrampaşa İstanbul",
  vergiDairesi: "Bayrampaşa",
  vergiNo: "455 001 1269",
  tel: "0 (212) 567 33 31",
  telSade: "0 212 567 33 31",
  faks: "0 (212) 565 70 58",
  faksSade: "0 212 565 70 58",
  eposta: "ismailsomali@haksanmakina.com.tr",
};

// ── 1) PROFORMA FATURA ──────────────────────────────────────────────────────

export interface ProformaItem {
  aciklama: string;
  marka?: string;
  /** Tezgah modeli; katalog bağı olmayan hızlı proformalarda elle girilir. */
  model?: string;
  mensei?: string;
  gtip?: string;
  birim: string;
  birimFiyati?: number | null;
  iskonto?: number | null;
  tutar: number;
}

/**
 * Belgeye kaydedilen imza. Ad ve ünvan belge anlık görüntüsünden gelir, bu
 * yüzden imza kaydı sonradan değişse veya silinse bile geçmiş belge kendi
 * imzasıyla basılmaya devam eder.
 *
 * `gorselUrl` auth GEREKTİRMEYEN bir uçtan servis edilmeli: yazdırma penceresi
 * oturum çerezi taşımıyor, korumalı bir URL sessizce boş görsel olarak çıkar.
 */
export type PrintSignature = {
  ad: string;
  unvan?: string;
  gorselUrl?: string;
};

export interface ProformaPrintData {
  firma: string;
  ilgili?: string;
  mobil?: string;
  adres?: string;
  tel?: string;
  faks?: string;
  email?: string;
  vergiDairesi?: string;
  vergiNo?: string;
  tarih: string;
  belgeNo: string;
  items: ProformaItem[];
  headerDiscount?: number;
  kdvOran: number;
  kdvTutar: number;
  currency: CurrencyCode;
  notlar: string[];
  /** Belgeyi hazırlayan CRM kullanıcısı ve ünvanı (imza satırı). */
  hazirlayan?: string;
  hazirlayanUnvan?: string;
  /** Belgeye kaydedilen imza; verilmezse satır hazırlayana düşer, görsel çıkmaz. */
  imza?: PrintSignature;
}

const PROFORMA_CSS = `
.page { padding: 5.5mm 9.8mm 9mm 14.7mm; }
.page.pf-one-page { height: 296mm; min-height: 296mm; max-height: 296mm; overflow: hidden; }
img.letterhead { width: 188mm; max-width: none; margin-left: -2mm; }
.pf-top { display: flex; gap: 7.4mm; margin-top: 2.9mm; }
.pf-left { flex: 1; }
.pf-right { width: 60.3mm; padding-top: 1.5mm; }
.pf-title { font-size: 24pt; font-weight: bold; text-align: center; line-height: 1.05; margin-bottom: 6.7mm; letter-spacing: .5px; }
table.pf-info { width: 100%; }
table.pf-info td { border: 1.4pt solid #000; padding: 1mm .45mm; font-size: 10.5pt; }
table.pf-info td.lbl { font-weight: bold; width: 16mm; white-space: nowrap; font-style: normal; font-size: 9pt; }
table.pf-info td.val { font-style: italic; font-weight: normal; }
table.pf-info td.c { text-align: center; }
.pf-gap { height: 6.5mm; }
table.pf-items { width: 100%; margin-top: 0; table-layout: fixed; }
table.pf-items-head { margin-top: 4mm; }
table.pf-items-body { margin-top: 2mm; }
table.pf-items th { border: 1.4pt solid #000; font-size: 10.5pt; padding: 2.05mm 1mm; }
table.pf-items td { border: 1.4pt solid #000; vertical-align: top; padding: 6mm 2mm 2mm; font-size: 10.5pt; }
table.pf-items .desc { width: 56.5%; }
table.pf-items .d1 { font-weight: normal; font-style: italic; margin-bottom: 1.2mm; }
table.pf-items table.meta { font-size: 9.5pt; font-style: italic; }
table.pf-items table.meta td { border: 0; padding: .2mm 0; }
table.pf-items table.meta td:first-child { width: 22mm; }
table.pf-items .c { text-align: center; font-style: italic; }
table.pf-items .r { text-align: right; font-style: italic; }
table.pf-items tr.itemrow > td { height: var(--pf-item-min, 36.4mm); }
table.pf-items table.meta td { height: auto; }
.pf-main { flex: 1 1 auto; min-height: 0; overflow: hidden; position: relative; }
.pf-main-inner { transform-origin: top left; }
.pf-sum { display: flex; margin-top: 0; }
.pf-yalniz { flex: 1; font-style: italic; font-weight: normal; font-size: 10.5pt; padding: 2mm 1mm; }
table.pf-tot { width: 84mm; }
table.pf-tot td { font-size: 10.5pt; padding: 1.35mm 1.8mm; }
table.pf-tot td.tl { font-weight: bold; text-align: right; width: 49mm; border: 0; }
table.pf-tot td.tv { border: 1.4pt solid #000; text-align: right; font-style: italic; font-weight: normal; width: 35mm; }
table.pf-tot tr.sp td { border: 0; height: 1.6mm; padding: 0; }
.pf-notes { margin: 5.7mm 0 0 .25mm; font-style: italic; }
.pf-notes .nt { font-weight: bold; text-decoration: underline; font-size: 10.5pt; margin-bottom: 1mm; }
.pf-notes ol { margin-left: 6.55mm; font-size: 10.5pt; line-height: 1.26; letter-spacing: .45pt; }
/* Hazırlayan imza satırı — notların altında, sağa yaslı. */
.pf-prepared { margin-top: 6mm; text-align: right; font-size: 10.5pt; line-height: 1.3; }
.pf-prepared .nm { font-weight: bold; }
/* İmza görseli adın üstünde; yükseklik sabit ki farklı boyuttaki taramalar
   satır yüksekliğini bozmasın, oran korunur. */
.pf-signature { display: inline-block; height: 14mm; max-width: 45mm; object-fit: contain; object-position: right bottom; margin-bottom: -1.5mm; }
.pf-notes li { margin-bottom: .75mm; text-align: justify; padding-left: 1mm; font-weight: normal; }
.pf-notes li::marker { font-weight: bold; }
.pf-footer { margin-top: auto; padding-top: 2mm; }
.pf-one-page .pf-footer { flex: 0 0 auto; margin-top: 0; }
.pf-stamp { height: 19.2mm; display: block; position: relative; top: -1.7mm; margin-left: 3mm; margin-bottom: -.85mm; }
table.pf-addr { width: 100mm; margin-left: 3mm; font-size: 8.5pt; line-height: 1.05; }
table.pf-addr td { padding: .15mm 0; vertical-align: top; }
table.pf-addr td:first-child { width: 14mm; }
table.pf-addr .b { font-weight: bold; font-size: 9pt; white-space: nowrap; }
`;

export function proformaDoc(
  d: ProformaPrintData,
  assetBase: string,
  opts?: { title?: string; headingHtml?: string },
): PrintDocument {
  const printableItems = d.items;
  const brutKalemlerToplami = printableItems.reduce((a, i) => a + i.tutar, 0);
  const satirIskontoToplami = printableItems.reduce((sum, item) => {
    const iskonto = Number(item.iskonto ?? 0);
    return sum + (Number.isFinite(iskonto) ? Math.max(0, iskonto) : 0);
  }, 0);
  const teklifGeneliIskonto = Number.isFinite(d.headerDiscount)
    ? Math.max(0, d.headerDiscount ?? 0)
    : 0;
  const toplamIskonto = Math.min(brutKalemlerToplami, satirIskontoToplami + teklifGeneliIskonto);
  const netKalemlerToplami = Math.max(0, brutKalemlerToplami - toplamIskonto);
  const kdvTutar = d.kdvTutar != null ? d.kdvTutar : netKalemlerToplami * (d.kdvOran / 100);
  const genelToplam = netKalemlerToplami + kdvTutar;
  const meta = (i: ProformaItem) => {
    const rows: string[] = [];
    if (i.marka) rows.push(`<tr><td>Markası</td><td>${esc(i.marka)}</td></tr>`);
    if (i.model) rows.push(`<tr><td>Modeli</td><td>${esc(i.model)}</td></tr>`);
    if (i.mensei) rows.push(`<tr><td>Menşei</td><td>${esc(i.mensei)}</td></tr>`);
    if (i.gtip) rows.push(`<tr><td>G.T.İ.P.</td><td>${esc(i.gtip)}</td></tr>`);
    return rows.length ? `<table class="meta">${rows.join("")}</table>` : "";
  };
  const yalniz = tutarYaziylaProforma(genelToplam, d.currency);
  const metaRowCount = (item: ProformaItem) =>
    [item.marka, item.model, item.mensei, item.gtip]
      .filter((value) => value !== undefined && value !== null && value !== "").length;
  const itemMinHeightMm = Math.max(7, 34.4 / Math.max(1, printableItems.length));
  const estimatedItemHeightMm = printableItems.reduce((total, item) => {
    const descriptionLines = Math.max(1, Math.ceil(item.aciklama.length / 65));
    const contentHeight = descriptionLines * 4.3 + metaRowCount(item) * 3.7 + 12;
    return total + Math.max(itemMinHeightMm, contentHeight);
  }, 0);
  const estimatedNoteHeightMm = d.notlar.reduce((total, note) => {
    const lines = Math.max(1, Math.ceil(note.length / 95));
    return total + lines * 4.4 + 0.5;
  }, 0);
  const estimatedInfoOverflowMm =
    Math.max(0, Math.ceil(d.firma.length / 70) - 1) * 4.3 +
    Math.max(0, Math.ceil((d.adres?.length ?? 0) / 72) - 1) * 4.3;
  const estimatedTotalsHeightMm = (toplamIskonto > 0 ? 16 : 10) + (d.kdvOran > 0 ? 5.5 : 0);
  const estimatedNotesBlockHeightMm = d.notlar.length > 0 ? 10.5 + estimatedNoteHeightMm : 0;
  const estimatedMainHeightMm = 12.5 + estimatedItemHeightMm + estimatedTotalsHeightMm + estimatedNotesBlockHeightMm;
  const availableMainHeightMm = Math.max(42, 155 - estimatedInfoOverflowMm);
  // Proforma daima tek A4'tür. Normal içerik referans ölçüsünde kalır; yalnızca
  // ürün/not bölümü uzadığında antet ve altbilgi sabit tutularak orantılı küçülür.
  const calculatedScale = (availableMainHeightMm / estimatedMainHeightMm) * 0.97;
  const contentScale = calculatedScale >= 0.96 ? 1 : Math.min(1, Math.max(0.12, calculatedScale));
  const contentWidthPercent = 100 / contentScale;
  const top = () => `
  <div class="pf-top">
    <div class="pf-left">
      <table class="pf-info">
        <tr><td class="lbl">Firma</td><td class="val" colspan="3">${blank(d.firma)}</td></tr>
        <tr>
          <td class="lbl">İlgili</td><td class="val">${blank(d.ilgili)}</td>
          <td class="lbl">Mobil</td><td class="val">${blank(d.mobil)}</td>
        </tr>
        <tr><td class="lbl">Adres</td><td class="val" colspan="3">${blank(d.adres)}</td></tr>
      </table>
      <div class="pf-gap"></div>
      <table class="pf-info">
        <tr>
          <td class="lbl">Tel.</td><td class="val">${blank(d.tel)}</td>
          <td class="lbl">Faks</td><td class="val">${blank(d.faks)}</td>
        </tr>
        <tr>
          <td class="lbl">Vergi D.</td><td class="val">${blank(d.vergiDairesi)}</td>
          <td class="lbl">Vergi No</td><td class="val">${blank(d.vergiNo)}</td>
        </tr>
        <tr><td class="lbl">E-Posta</td><td class="val" colspan="3">${blank(d.email)}</td></tr>
      </table>
    </div>
    <div class="pf-right">
      <div class="pf-title">${opts?.headingHtml ?? "PROFORMA<br>FATURA"}</div>
      <table class="pf-info">
        <tr><td class="lbl" style="width:22mm">Tarih</td><td class="val c">${blank(d.tarih)}</td></tr>
        <tr><td class="lbl" style="width:22mm">Belge No</td><td class="val c">${blank(d.belgeNo)}</td></tr>
      </table>
    </div>
  </div>`;
  const footer = `
  <div class="pf-footer">
    <img class="pf-stamp" src="${assetBase}/haksan-stamp.png" alt="">
    <table class="pf-addr">
      <tr><td colspan="2" class="b">${esc(HAKSAN.unvan)}</td></tr>
      <tr><td>Adres</td><td>${esc(HAKSAN.adres1)}<br>${esc(HAKSAN.adres2)}</td></tr>
      <tr><td>Tel.</td><td>${esc(HAKSAN.tel)}</td></tr>
      <tr><td>Faks</td><td>${esc(HAKSAN.faks)}</td></tr>
      <tr><td>E-Posta</td><td><span class="link">${esc(HAKSAN.eposta)}</span></td></tr>
    </table>
  </div>`;
  const totals = `
  <div class="pf-sum">
    <div class="pf-yalniz">${esc(yalniz)}</div>
    <table class="pf-tot">
      ${toplamIskonto > 0 ? `
      <tr><td class="tl">ARA TOPLAM</td><td class="tv">${fmtMoney(brutKalemlerToplami, d.currency)}</td></tr>
      <tr><td class="tl">ÖZEL İSKONTO</td><td class="tv">-${fmtMoney(toplamIskonto, d.currency)}</td></tr>` : ""}
      ${d.kdvOran > 0 ? `<tr><td class="tl">K.D.V. (%${esc(d.kdvOran)})</td><td class="tv">${fmtMoney(kdvTutar, d.currency)}</td></tr>` : ""}
      <tr><td class="tl">GENEL TOPLAM</td><td class="tv">${fmtMoney(genelToplam, d.currency)}</td></tr>
    </table>
  </div>`;
  const itemColumns = `<colgroup><col><col style="width:15mm"><col style="width:30mm"><col style="width:35mm"></colgroup>`;

  const body = `
<div class="page q-price-page pf-one-page" style="--pf-item-min:${itemMinHeightMm.toFixed(2)}mm">
  ${haksanHeader(assetBase)}
  ${top()}
  <div class="pf-main">
    <div class="pf-main-inner" style="width:${contentWidthPercent.toFixed(3)}%;transform:scale(${contentScale.toFixed(4)})">
      <table class="pf-items pf-items-head">
        ${itemColumns}
        <thead>
          <tr><th>ÜRÜN AÇIKLAMASI</th><th>BİRİM</th><th>BİRİM FİYATI</th><th>TUTARI</th></tr>
        </thead>
      </table>
      <table class="pf-items pf-items-body">
        ${itemColumns}
        <tbody>
          ${printableItems.map((item) => `
          <tr class="itemrow">
            <td class="desc"><div class="d1">${esc(item.aciklama)}</div>${meta(item)}</td>
            <td class="c">${esc(item.birim)}</td>
            <td class="c">${item.birimFiyati != null ? fmtMoney(item.birimFiyati, d.currency) : ""}</td>
            <td class="r">${fmtMoney(item.tutar, d.currency)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${totals}
      ${d.notlar.length > 0 ? `
      <div class="pf-notes">
        <div class="nt">NOTLAR:</div>
        <ol>${d.notlar.map((note) => `<li>${esc(note)}</li>`).join("")}</ol>
      </div>` : ""}
      ${d.imza || d.hazirlayan ? `
      <div class="pf-prepared">
        ${d.imza?.gorselUrl ? `<img class="pf-signature" src="${esc(d.imza.gorselUrl)}" alt="">` : ""}
        <div class="nm">${esc(d.imza?.ad ?? d.hazirlayan ?? "")}</div>
        ${(d.imza?.unvan ?? d.hazirlayanUnvan) ? `<div>${esc(d.imza?.unvan ?? d.hazirlayanUnvan ?? "")}</div>` : ""}
      </div>` : ""}
    </div>
  </div>
  ${footer}
</div>`;
  return { title: `${opts?.title ?? "Proforma Fatura"} ${d.belgeNo}`, css: PROFORMA_CSS, body };
}

export function commercialInvoiceDoc(d: ProformaPrintData, assetBase: string): PrintDocument {
  return proformaDoc(d, assetBase, { title: "Ticari Fatura", headingHtml: "TİCARİ<br>FATURA" });
}

// ── 2) FİYAT TEKLİFİ ────────────────────────────────────────────────────────

export interface QuoteItem {
  urun: string;
  birim?: string;
  fiyat?: number | null;
  indirim?: number | null;
  brutTutar?: number | null;
  tutar?: number | null;
}

export type QuoteTechnicalSpec = { key: string; value: string; unit?: string; specUnit?: string; groupCode?: string; groupName?: string; group?: string };

export interface QuoteMachinePrintData {
  lineGroupKey?: string;
  urun: string;
  marka?: string;
  brandLogoUrl?: string;
  model?: string;
  tip?: string;
  imageUrl?: string;
  specs?: QuoteTechnicalSpec[];
  standartDonanim?: string[];
  opsiyonelDonanim?: string[];
}

export type QuoteHeaderLogoMode = "haksan" | "company" | "none";

export interface QuoteHeaderLogo {
  mode: QuoteHeaderLogoMode;
  imageUrl?: string;
  alt?: string;
}

export interface QuotePrintData {
  firma: string;
  ilgili?: string;
  mobil?: string;
  adres?: string;
  tel?: string;
  faks?: string;
  email?: string;
  tarih: string;
  belgeNo: string;
  gecerlilik?: string;
  projeIlgilisi?: string;
  projeIlgilisiUnvan?: string;
  projeIlgilisiTelefon?: string;
  projeIlgilisiEmail?: string;
  /** Belgeye kaydedilen imza; verilmezse imza satırı proje ilgilisine düşer. */
  imza?: PrintSignature;
  marka?: string;
  brandLogoUrl?: string;
  model?: string;
  tip?: string;
  imageUrl?: string;
  specs?: QuoteTechnicalSpec[];
  standartDonanim?: string[];
  opsiyonelDonanim?: string[];
  machines?: QuoteMachinePrintData[];
  headerLogo?: QuoteHeaderLogo;
  items: QuoteItem[];
  iskonto?: number;
  kdvOran: number;
  kdvTutar: number;
  currency: CurrencyCode;
  notes: QuoteNoteVariant;
  genelNotlar?: string[];
}

const QUOTE_CSS = `
.q-title { text-align: center; font-size: 14pt; font-weight: bold; margin: 5mm 0 4mm; }
.q-top { display: flex; gap: 5mm; align-items: stretch; }
.q-cust { flex: 1; border: 1.4pt solid #000; padding: 2mm 2.5mm; font-size: 10.5pt; font-style: italic; line-height: 1.5; }
.q-cust .b { font-weight: bold; }
.q-cust .row { display: flex; justify-content: space-between; padding-right: 18mm; }
table.q-meta { width: 64mm; }
table.q-meta td { border: 1.4pt solid #000; font-size: 9.5pt; padding: 1.4mm 1.8mm; }
table.q-meta td.lbl { font-weight: bold; white-space: nowrap; }
table.q-meta td.val { text-align: center; font-style: italic; font-weight: bold; }
.q-machine { text-align: center; margin-top: 7mm; }
.q-machine-index { margin-top: 1mm; font-size: 9pt; font-weight: bold; letter-spacing: .35px; }
.q-machine-ref { margin: -4mm 0 4mm; text-align: center; font-size: 9pt; font-weight: bold; font-style: italic; }
.q-brand { font-size: 30pt; font-weight: 900; letter-spacing: 1px; }
.q-brand-logo { display: block; width: 67mm; height: auto; margin: 0 auto; object-fit: contain; }
.q-model { font-size: 24pt; font-weight: bold; margin-top: 3mm; }
.q-type { font-size: 16pt; margin-top: 1mm; }
.q-photo { max-width: 150mm; max-height: 130mm; margin-top: 6mm; }
.q-h1 { text-align: center; font-size: 14pt; font-weight: bold; margin: 5mm 0 5mm; }
table.q-specs { width: 100%; }
table.q-specs td { border: 1pt solid #000; font-size: 8.4pt; padding: .75mm 1.5mm; }
table.q-specs td.g { width: 17mm; text-align: center; vertical-align: middle; font-weight: bold; writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: .2px; }
table.q-specs td.k { width: 45%; text-align: center; }
table.q-specs td.v { text-align: center; }
.q-eq-h { font-weight: bold; text-decoration: underline; font-size: 11pt; margin: 4mm 0 2mm; }
ul.q-eq { list-style: none; margin-left: 4mm; font-size: 10.5pt; }
ul.q-eq li { margin-bottom: .8mm; }
ul.q-eq li::before { content: "\\2713\\00a0\\00a0"; }
ul.q-eq.opt li::before { content: "\\2022\\00a0\\00a0"; }
table.q-items { width: 100%; margin-top: 2mm; }
table.q-items th, table.q-items td { border: 1.4pt solid #000; font-size: 10.5pt; padding: 2mm 1.5mm; }
table.q-items th { font-weight: bold; }
table.q-items td.no { width: 7mm; text-align: center; }
table.q-items td.urun { font-weight: bold; font-style: italic; }
table.q-items td.c { text-align: center; font-style: italic; }
table.q-items td.r { text-align: right; font-style: italic; font-weight: bold; }
table.q-items .disc { color: #c00000; font-weight: bold; }
table.q-tot { width: 100%; margin-top: 1mm; }
table.q-tot td { font-size: 10.5pt; padding: 1.4mm 1.8mm; }
table.q-tot td.tl { font-weight: bold; text-align: right; }
table.q-tot td.tv { border: 1.4pt solid #000; text-align: right; font-style: italic; font-weight: bold; width: 38mm; }
.q-notes { margin-top: 4mm; font-size: 10pt; }
.q-notes .sec { font-weight: bold; margin: 2.5mm 0 1mm; }
.q-notes ol.outer { margin-left: 5mm; }
.q-notes ol.outer > li { font-weight: bold; }
.q-notes ol.alpha { list-style-type: lower-alpha; margin-left: 6mm; font-weight: normal; }
.q-notes ol.alpha li { margin-bottom: .6mm; text-align: justify; padding-left: 1mm; }
.q-sign { margin-top: 6mm; font-size: 10.5pt; }
.q-sign .nm { font-weight: bold; font-style: italic; }

/* Satış teklifi, kurumun Word/PDF referansındaki sıkı dört sayfalı ölçülere göre kalibre edilmiştir. */
.page { padding: 7.5mm 10mm 7mm; }
img.letterhead { width: 190mm; max-width: none; }
.q-title { margin: 2.8mm 0 4.5mm; }
.q-top { gap: 0; }
.q-cust { border-width: 1pt; padding: 1.2mm 2mm; font-size: 10.2pt; line-height: 1.45; min-height: 31mm; }
.q-cust .row { padding-right: 15mm; gap: 4mm; }
table.q-meta { width: 68.5mm; }
table.q-meta td { border-width: 1pt; font-size: 9.3pt; padding: 1.15mm 1.8mm; }
table.q-meta td.lbl, table.q-meta td.val { font-weight: normal; }
.q-machine { margin-top: 5.5mm; }
.q-brand { font-size: 31pt; letter-spacing: -1px; line-height: 1; }
.q-model { font-size: 21pt; margin-top: 4mm; }
.q-type { margin-top: 1.2mm; }
.q-photo { display: block; max-width: 155mm; max-height: 138mm; object-fit: contain; margin: 9mm auto 0; }
.q-photo-placeholder { height: 120mm; }
.q-h1 { margin: 2.8mm 0 6mm; }
table.q-specs td { border-width: .75pt; font-size: 9.5pt; padding: .92mm 1.5mm; line-height: 1.08; }
table.q-specs td.g { width: 19mm; }
table.q-specs td.k { width: 55%; }
.q-spec-page-compact .q-h1 { margin: 1.8mm 0 3mm; }
.q-spec-page-compact table.q-specs td { font-size: 8pt; padding: .48mm 1.1mm; line-height: 1.02; }
.q-spec-page-dense .q-h1 { margin: 1mm 0 2mm; }
.q-spec-page-dense table.q-specs td { font-size: 6.8pt; padding: .25mm .8mm; line-height: 1; }
.q-spec-page-ultra .q-h1 { margin: .6mm 0 1.2mm; font-size: 11pt; }
.q-spec-page-ultra table.q-specs td { font-size: 5.8pt; padding: .12mm .55mm; line-height: .96; }
.q-spec-page { height: 296mm; min-height: 296mm; max-height: 296mm; overflow: hidden; }
.q-spec-fit { zoom: var(--q-spec-scale, 1); }
.q-empty { text-align: center; color: #555; font-style: italic; padding: 8mm !important; }
.q-eq-h { font-size: 10.5pt; margin: 5mm 0 1.5mm 1mm; }
ul.q-eq { margin-left: 7mm; font-size: 10.35pt; line-height: 1.22; }
ul.q-eq li { margin-bottom: .68mm; }
table.q-items { margin-top: 1mm; }
table.q-items th, table.q-items td { border-width: .9pt; font-size: 9.7pt; padding: 1.6mm 1.5mm; height: 8mm; }
table.q-items .disc { color: #ed1c24; }
table.q-tot { width: 70mm; margin: 0 0 0 auto; }
table.q-tot td { font-size: 9.8pt; padding: 1.35mm 1.8mm; }
table.q-tot td.tv { border-width: .9pt; width: 33mm; }
table.q-tot tr.kdv td { font-weight: normal; }
.q-notes { margin-top: 1.2mm; font-size: 9.45pt; line-height: 1.17; }
.q-notes .sec { margin: 2mm 0 .65mm; }
.q-notes ol.outer { margin-left: 4.5mm; }
.q-notes ol.alpha { margin-left: 6mm; }
.q-notes ol.alpha li { margin-bottom: .58mm; }
.q-sign { margin: 2.5mm 0 0 10mm; font-size: 9.4pt; line-height: 1.35; }
.q-signature { display: block; height: 14mm; max-width: 35mm; object-fit: contain; object-position: left bottom; margin-bottom: -1.5mm; }
.q-price-page .q-h1 { margin-bottom: 3mm; }
.q-price-page .pageno { padding-top: 1.5mm; }
.q-company-letterhead {
  height: 31.4mm;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: .6pt solid #d7dce2;
  padding: 2.5mm 8mm 3mm;
}
.q-company-letterhead img {
  display: block;
  max-width: 92mm;
  max-height: 24mm;
  object-fit: contain;
}
.q-empty-letterhead { height: 11mm; }
`;

export function quoteDoc(d: QuotePrintData, assetBase: string): PrintDocument {
  const pages: string[] = [];
  const safeImageUrl = (value?: string) => {
    const imageUrl = value?.trim();
    return imageUrl && (
      imageUrl.startsWith("/")
      || /^https?:\/\//i.test(imageUrl)
      || /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(imageUrl)
    ) ? esc(imageUrl) : "";
  };
  // Chromium bazı sürümlerde tekrarlanan büyük PNG'yi PDF'e gömerken siyah
  // raster üretebildiği için satış teklifinde baskıya özel JPEG antet kullanılır.
  const quoteHeader = () => {
    const selection = d.headerLogo;
    if (selection?.mode === "none") return `<div class="q-empty-letterhead" aria-hidden="true"></div>`;
    if (selection?.mode === "company") {
      const companyLogoUrl = safeImageUrl(selection.imageUrl);
      if (companyLogoUrl) {
        return `<div class="q-company-letterhead"><img src="${companyLogoUrl}" alt="${esc(selection.alt || d.firma || "Firma logosu")}"></div>`;
      }
    }
    return `<img class="letterhead" src="${assetBase}/haksan-letterhead.jpg" alt="HAKSAN MAKİNA">`;
  };
  const machineBrand = (brand?: string, brandLogoUrl?: string) => {
    if (!brand) return "";
    const customLogoUrl = safeImageUrl(brandLogoUrl);
    if (customLogoUrl) {
      return `<img class="q-brand-logo" src="${customLogoUrl}" alt="${esc(brand)}">`;
    }
    return brand.trim().toLocaleUpperCase("tr-TR") === "HAXAN"
      ? `<img class="q-brand-logo" src="${assetBase}/haxan-product-logo.webp" alt="HAXAN">`
      : `<div class="q-brand">${esc(brand)}</div>`;
  };
  const machines: QuoteMachinePrintData[] = d.machines?.length
    ? d.machines
    : [{
        urun: [d.marka, d.model, d.tip].filter(Boolean).join(" "),
        marka: d.marka,
        brandLogoUrl: d.brandLogoUrl,
        model: d.model,
        tip: d.tip,
        imageUrl: d.imageUrl,
        specs: d.specs,
        standartDonanim: d.standartDonanim,
        opsiyonelDonanim: d.opsiyonelDonanim,
      }];
  const specValue = (spec: QuoteTechnicalSpec) => {
    const value = spec.value?.trim() || "-";
    const unit = (spec.unit ?? spec.specUnit ?? "").trim();
    if (!unit || value === "-" || value.toLocaleLowerCase("tr-TR").includes(unit.toLocaleLowerCase("tr-TR"))) return value;
    return `${value} ${unit}`;
  };
  const specGroupLabel = (spec: QuoteTechnicalSpec) =>
    (spec.groupName || spec.group || spec.groupCode || "").trim();
  const renderSpecs = (specs: QuoteTechnicalSpec[]) => {
    const visibleSpecs = printableTechnicalSpecs(specs);
    const hasGroups = visibleSpecs.some((spec) => specGroupLabel(spec));
    if (!hasGroups) {
      return visibleSpecs.map((s) => `<tr><td class="k">${esc(s.key)}</td><td class="v">${esc(specValue(s))}</td></tr>`).join("");
    }
    const rows: string[] = [];
    for (let i = 0; i < visibleSpecs.length;) {
      const label = specGroupLabel(visibleSpecs[i]) || "GENEL";
      let end = i + 1;
      while (end < visibleSpecs.length && (specGroupLabel(visibleSpecs[end]) || "GENEL") === label) end += 1;
      const groupSpecs = visibleSpecs.slice(i, end);
      for (let j = 0; j < groupSpecs.length; j++) {
        const spec = groupSpecs[j];
        rows.push(`<tr>${j === 0 ? `<td class="g" rowspan="${groupSpecs.length}">${esc(label.toLocaleUpperCase("tr-TR"))}</td>` : ""}<td class="k">${esc(spec.key)}</td><td class="v">${esc(specValue(spec))}</td></tr>`);
      }
      i = end;
    }
    return rows.join("");
  };
  const specPageLayout = (specs: QuoteTechnicalSpec[]) => {
    const estimatedRows = specs.reduce(
      (total, spec) => total + Math.max(1, Math.ceil(`${spec.key} ${specValue(spec)}`.length / 90)),
      0,
    );
    const className = estimatedRows > 70
      ? "q-spec-page-ultra"
      : estimatedRows > 48
        ? "q-spec-page-dense"
        : estimatedRows > 32
          ? "q-spec-page-compact"
          : "";
    // Chromium yazdırma motorunda tablo yüksekliğini gerçek A4 içerik alanına
    // sığdırır. 64 tahmini satır referans yoğunluğudur; yalnız daha uzun
    // tablolarda tüm blok oransal küçülür ve fiziksel ikinci sayfa açılmaz.
    const scale = Math.min(1, 64 / Math.max(estimatedRows, 1));
    return { className, scale: Number(scale.toFixed(4)) };
  };
  const machineSections = machines.map((machine) => {
    const printableSpecs = printableTechnicalSpecs(machine.specs);
    // Teknik bilgiler teklif PDF'inde hiçbir zaman "DEVAM" sayfasına bölünmez.
    // Satır yoğunluğuna göre CSS sıkılığı değişir ve gerçek değerlerin tamamı
    // her makine için tek teknik bilgi sayfasında kalır.
    const specChunks = [printableSpecs];
    const equipmentRows = [
      ...(machine.standartDonanim ?? []).map((value) => ({ kind: "standard" as const, value })),
      ...(machine.opsiyonelDonanim ?? []).map((value) => ({ kind: "optional" as const, value })),
    ];
    const equipmentChunks = equipmentRows.length
      ? chunkByWeight(equipmentRows, 32, (entry) => Math.max(1, entry.value.length / 115))
      : [[]];
    return { machine, specChunks, equipmentChunks };
  });
  // Beş satırlık fiyat kutusunda 4. satır daima özel iskonto, son satır boş kalır.
  const itemChunks = chunkByWeight(d.items, 3, (item) => Math.max(1, item.urun.length / 180));
  const addressChunks = chunkText(d.adres, 420);
  /**
   * Bir şart maddesi TEK bir madde olarak basılır. Eskiden 1200 karakterde
   * kesiliyordu; uzun bir madde ikiye bölünüp ikinci parça, cümle ortasından
   * başlayan ayrı bir maddeymiş gibi görünüyordu. Artık yalnız tek başına bir
   * sayfayı taşıran madde bölünür, o da cümle sonundan (bkz. `chunkText`).
   */
  const splitNotes = (notes: string[]) =>
    notes.flatMap((note) => chunkText(note, NOTE_PAGE_CAPACITY * NOTE_LINE_CHARS));
  /**
   * Bir şart bölümü birden çok sayfaya taşarsa madde harfleri DEVAM etmeli:
   * her sayfa kendi `<ol>`'unu açtığı için ikinci sayfa yeniden `a.`den
   * başlıyor, ekranda `i.` görünen madde çıktıda `a.` oluyordu.
   */
  const notesSection = (title: string, notes: string[]) => {
    if (!notes.length) return [];
    let start = 0;
    return chunkByWeight(splitNotes(notes), NOTE_PAGE_CAPACITY, noteWeightOf).map((list) => {
      const page = { title, list, start };
      start += list.length;
      return page;
    });
  };
  const notePages = [
    ...notesSection("ÖDEME ŞARTLARI", d.notes.odeme),
    ...notesSection("TESLİMAT ŞARTLARI", d.notes.teslimat),
    ...notesSection("GARANTİ ŞARTLARI", d.notes.garanti),
    ...notesSection("NOTLAR", d.genelNotlar ?? []),
    ...notesSection("MÜŞTERİ ADRESİ — DEVAM", addressChunks.slice(1)),
  ];
  const referenceNoteWeight = [
    ...d.notes.odeme,
    ...d.notes.teslimat,
    ...d.notes.garanti,
    ...(d.genelNotlar ?? []),
    ...addressChunks.slice(1),
  ].reduce((total, note) => total + Math.max(1, note.length / 110), 0)
    + [d.notes.odeme, d.notes.teslimat, d.notes.garanti, d.genelNotlar ?? [], addressChunks.slice(1)]
      .filter((section) => section.length > 0).length * 1.25;
  const referencePricePage = itemChunks.length === 1
    && (itemChunks[0]?.length ?? 0) <= 3
    && referenceNoteWeight <= 27;
  const pricePageCount = referencePricePage ? 1 : itemChunks.length + 1 + notePages.length;
  const machinePageCount = machineSections.reduce(
    (total, section) => total + 1 + section.specChunks.length + section.equipmentChunks.length,
    0,
  );
  const pageCount = machinePageCount + pricePageCount;
  let pageNo = 0;
  const pn = () => `<div class="pageno">Sayfa <b>${++pageNo}</b> / <b>${pageCount}</b></div>`;
  const customerMetaBlock = `<div class="q-top">
    <div class="q-cust">
      <div class="b">${blank(d.firma)}</div>
      <div class="row"><span class="b">${blank(d.ilgili)}</span><span class="b">${blank(d.mobil)}</span></div>
      <div>${blank(addressChunks[0])}${addressChunks.length > 1 ? " <b>(devamı ek sayfada)</b>" : ""}</div>
      <div>Tel.&nbsp;&nbsp;&nbsp;&nbsp;${blank(d.tel)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Faks.&nbsp;&nbsp;&nbsp;${blank(d.faks)}</div>
      <div>E-Posta&nbsp;&nbsp;<span class="link">${blank(d.email)}</span></div>
    </div>
    <table class="q-meta">
      <tr><td class="lbl">TARİH</td><td class="val">${blank(d.tarih)}</td></tr>
      <tr><td class="lbl">BELGE NO</td><td class="val">${blank(d.belgeNo)}</td></tr>
      <tr><td class="lbl">GEÇERLİLİK SÜRESİ</td><td class="val">${blank(d.gecerlilik)}</td></tr>
      <tr><td class="lbl">PROJE İLGİLİSİ</td><td class="val">${blank(d.projeIlgilisi)}</td></tr>
    </table>
  </div>`;

  // Her seçili makine, mevcut kapak + teknik bilgiler + donanım üçlüsünü
  // aynen kullanır. Böylece ikinci ürün ilk makinenin altında sıkışmaz ve
  // referans PDF şablonunun ölçüleri korunur.
  machineSections.forEach(({ machine, specChunks, equipmentChunks }, machineIndex) => {
    const machineImageUrl = safeImageUrl(machine.imageUrl);
    const machineLabel = machine.urun || [machine.marka, machine.model, machine.tip].filter(Boolean).join(" ");
    pages.push(`
<div class="page">
  ${quoteHeader()}
  <div class="q-title">FİYAT TEKLİFİ${machines.length > 1 ? `<div class="q-machine-index">MAKİNE ${machineIndex + 1} / ${machines.length}</div>` : ""}</div>
  ${machineIndex === 0 ? customerMetaBlock : ""}
  <div class="q-machine">
    ${machineBrand(machine.marka, machine.brandLogoUrl)}
    ${machine.model ? `<div class="q-model">${esc(machine.model)}</div>` : ""}
    ${machine.tip ? `<div class="q-type">${esc(machine.tip)}</div>` : ""}
    ${machineImageUrl ? `<img class="q-photo" src="${machineImageUrl}" alt="${esc(machineLabel)}">` : `<div class="q-photo-placeholder"></div>`}
  </div>
  ${pn()}
</div>`);

    specChunks.forEach((specChunk) => {
      const specLayout = specPageLayout(specChunk);
      pages.push(`
<div class="page q-spec-page ${specLayout.className}" style="--q-spec-scale:${specLayout.scale}">
  ${quoteHeader()}
  <div class="q-spec-fit">
  <div class="q-h1">TEKNİK BİLGİLER</div>
  ${machines.length > 1 ? `<div class="q-machine-ref">${esc(machineLabel)}</div>` : ""}
  <table class="q-specs">
    ${specChunk.length ? renderSpecs(specChunk) : `<tr><td class="q-empty">Bu ürün için teknik bilgi girilmemiştir.</td></tr>`}
  </table>
  </div>
  ${pn()}
</div>`);
    });

    equipmentChunks.forEach((equipmentChunk, chunkIndex) => {
      const standard = equipmentChunk.filter((entry) => entry.kind === "standard");
      const optional = equipmentChunk.filter((entry) => entry.kind === "optional");
      pages.push(`
<div class="page">
  ${quoteHeader()}
  <div class="q-h1">TEZGAH DONANIMI${chunkIndex > 0 ? " — DEVAM" : ""}</div>
  ${machines.length > 1 ? `<div class="q-machine-ref">${esc(machineLabel)}</div>` : ""}
  ${standard.length > 0 ? `
  <div class="q-eq-h">STANDART DONANIM</div>
  <ul class="q-eq">${standard.map((entry) => `<li>${esc(entry.value)}</li>`).join("")}</ul>` : chunkIndex === 0 ? `<div class="q-eq-h">STANDART DONANIM</div>` : ""}
  ${optional.length > 0 ? `
  <div class="q-eq-h">OPSİYONEL DONANIM</div>
  <ul class="q-eq opt">${optional.map((entry) => `<li>${esc(entry.value)}</li>`).join("")}</ul>` : chunkIndex === equipmentChunks.length - 1 ? `<div class="q-eq-h">OPSİYONEL DONANIM</div>` : ""}
  ${pn()}
</div>`);
    });
  });

  // Referans hacimde tablo, toplamlar ve koşullar aynı dördüncü sayfadadır;
  // yalnızca gerçek taşma halinde devam ve toplam özeti sayfaları açılır.
  const items = [...d.items];
  const satirIskontoToplami = items.reduce((sum, item) => {
    const indirim = item.indirim ?? 0;
    return sum + (Number.isFinite(indirim) ? Math.max(0, indirim) : 0);
  }, 0);
  const teklifGeneliIskonto = Number.isFinite(d.iskonto) ? Math.max(0, d.iskonto ?? 0) : 0;
  const ozelIskontoToplami = satirIskontoToplami + teklifGeneliIskonto;
  const iskontoTutar = ozelIskontoToplami > 0
    ? `-${fmtMoney(ozelIskontoToplami, d.currency)}`
    : fmtMoney(0, d.currency);
  const kalemToplami = items.reduce((a, i) => a + (i.tutar ?? 0), 0);
  // Satır tutarları makine iskontoları düşülmüş olarak gelir. Bu nedenle
  // toplamdan yalnız teklif geneli iskontosu bir kez daha düşülür.
  const toplam = Math.max(0, kalemToplami - teklifGeneliIskonto);
  // KDV tutarı açıkça verilmediyse toplam × oran üzerinden hesapla.
  const kdvTutar = Number.isFinite(d.kdvTutar) ? d.kdvTutar : toplam * (d.kdvOran / 100);
  const genel = toplam + kdvTutar;

  // İmza artık belgeye kaydedilen seçimden gelir. Eskiden burada tek bir kişinin
  // adı koda gömülüydü (`projeIlgilisi` normalize edilip "raifşentürk" içeriyor
  // mu): başka hiç kimse için çalışmıyordu ve yeni imza eklemek kod değişikliği
  // + deploy gerektiriyordu. İmza seçilmemiş belgelerde eski davranış korunur —
  // satır proje ilgilisinin adına düşer, yalnız görsel çıkmaz.
  const signatureHtml = () => `<div class="q-sign">
    ${d.imza?.gorselUrl ? `<img class="q-signature" src="${esc(d.imza.gorselUrl)}" alt="">` : ""}
    <div class="nm">${blank(d.imza?.ad ?? d.projeIlgilisi)}</div>
    <div>${blank(d.imza?.unvan ?? d.projeIlgilisiUnvan)}</div>
    ${d.projeIlgilisiTelefon ? `<div>${esc(d.projeIlgilisiTelefon)}</div>` : ""}
    <div><span class="link">${blank(d.projeIlgilisiEmail)}</span></div>
  </div>`;
  const referenceSections = [
    { title: "ÖDEME ŞARTLARI", list: d.notes.odeme },
    { title: "TESLİMAT ŞARTLARI", list: d.notes.teslimat },
    { title: "GARANTİ ŞARTLARI", list: d.notes.garanti },
    { title: "NOTLAR", list: d.genelNotlar ?? [] },
    { title: "MÜŞTERİ ADRESİ — DEVAM", list: addressChunks.slice(1) },
  ].filter((section) => section.list.length > 0);

  if (referencePricePage) {
    const rows = itemChunks[0].map((item) => `<tr>
      <td class="no">${d.items.indexOf(item) + 1}</td>
      <td class="urun">${esc(item.urun)}</td>
      <td class="c" style="width:20mm">${item.birim ? esc(item.birim) : ""}</td>
      <td class="c" style="width:31mm">${item.fiyat != null ? fmtMoney(item.fiyat, d.currency) : ""}</td>
      <td class="r" style="width:33mm">${item.brutTutar != null ? fmtMoney(item.brutTutar, d.currency) : item.tutar != null ? fmtMoney(item.tutar, d.currency) : ""}</td>
    </tr>`);
    while (rows.length < 3) rows.push(`<tr><td class="no"></td><td></td><td></td><td></td><td></td></tr>`);
    rows.push(`<tr><td class="no"></td><td></td><td></td><td class="r disc">ÖZEL İSKONTO</td><td class="r disc">${iskontoTutar}</td></tr>`);
    while (rows.length < 5) rows.push(`<tr><td class="no"></td><td></td><td></td><td></td><td></td></tr>`);
    pages.push(`
<div class="page q-price-page">
  ${quoteHeader()}
  <div class="q-h1">FİYAT ve KOŞULLAR</div>
  <table class="q-items">
    <tr><th style="width:7mm"></th><th>ÜRÜN</th><th>BİRİM</th><th>FİYAT</th><th>TUTAR</th></tr>
    ${rows.join("")}
  </table>
  <table class="q-tot">
    <tr><td class="tl">TOPLAM</td><td class="tv">${fmtMoney(toplam, d.currency)}</td></tr>
    <tr class="kdv"><td class="tl">K.D.V.${d.kdvOran > 0 ? ` (%${esc(d.kdvOran)})` : ""}</td><td class="tv">${fmtMoney(kdvTutar, d.currency)}</td></tr>
    <tr><td class="tl">GENEL TOPLAM</td><td class="tv">${fmtMoney(genel, d.currency)}</td></tr>
  </table>
  ${referenceSections.length ? `<div class="q-notes"><ol class="outer">${referenceSections.map((section) => `<li><div class="sec">${esc(section.title)}</div><ol class="alpha">${section.list.map((note) => `<li>${esc(note)}</li>`).join("")}</ol></li>`).join("")}</ol></div>` : ""}
  ${signatureHtml()}
  ${pn()}
</div>`);
  } else {
  itemChunks.forEach((itemChunk, chunkIndex) => {
    const rows = itemChunk.map((it) => `<tr>
      <td class="no">${d.items.indexOf(it) + 1}</td>
      <td class="urun">${esc(it.urun)}</td>
      <td class="c" style="width:18mm">${it.birim ? esc(it.birim) : ""}</td>
      <td class="c" style="width:32mm">${it.fiyat != null ? fmtMoney(it.fiyat, d.currency) : ""}</td>
      <td class="r" style="width:36mm">${it.brutTutar != null ? fmtMoney(it.brutTutar, d.currency) : it.tutar != null ? fmtMoney(it.tutar, d.currency) : ""}</td>
    </tr>`);
    if (chunkIndex === itemChunks.length - 1) {
      while (rows.length < 3) rows.push(`<tr><td class="no"></td><td></td><td></td><td></td><td></td></tr>`);
      rows.push(`<tr><td class="no"></td><td></td><td></td><td class="r disc">ÖZEL İSKONTO</td><td class="r disc">${iskontoTutar}</td></tr>`);
    }
    while (rows.length < 5) rows.push(`<tr><td class="no"></td><td></td><td></td><td></td><td></td></tr>`);
    pages.push(`
<div class="page">
  ${quoteHeader()}
  <div class="q-h1">FİYAT ve KOŞULLAR${chunkIndex > 0 ? " — DEVAM" : ""}</div>
  <table class="q-items">
    <tr><th style="width:7mm"></th><th>ÜRÜN</th><th>BİRİM</th><th>FİYAT</th><th>TUTAR</th></tr>
    ${rows.join("")}
  </table>
  ${pn()}
</div>`);
  });

  pages.push(`
<div class="page">
  ${quoteHeader()}
  <div class="q-h1">FİYAT ve KOŞULLAR — TOPLAM ÖZETİ</div>
  <table class="q-tot" style="margin-top:6mm">
    <tr><td class="tl">NET ARA TOPLAM</td><td class="tv">${fmtMoney(toplam, d.currency)}</td></tr>
    <tr><td class="tl">K.D.V.${d.kdvOran > 0 ? ` (%${esc(d.kdvOran)})` : ""}</td><td class="tv">${fmtMoney(kdvTutar, d.currency)}</td></tr>
    <tr><td class="tl">GENEL TOPLAM</td><td class="tv">${fmtMoney(genel, d.currency)}</td></tr>
  </table>
  ${notePages.length === 0 ? signatureHtml() : ""}
  ${pn()}
</div>`);

  notePages.forEach((notePage, noteIndex) => {
    const isFinalPage = noteIndex === notePages.length - 1;
    pages.push(`
<div class="page q-price-page">
  ${quoteHeader()}
  <div class="q-h1">FİYAT ve KOŞULLAR — ${esc(notePage.title)}${notePage.start ? " (devam)" : ""}</div>
  <div class="q-notes">
    <ol class="outer"><li><div class="sec">${esc(notePage.title)}${notePage.start ? " (devam)" : ""}</div>
      <ol class="alpha" start="${notePage.start + 1}">${notePage.list.map((note) => `<li>${esc(note)}</li>`).join("")}</ol>
    </li></ol>
  </div>
  ${isFinalPage ? signatureHtml() : ""}
  ${pn()}
</div>`);
  });
  }

  return { title: `Fiyat Teklifi ${d.belgeNo}`, css: QUOTE_CSS, body: pages.join("\n") };
}

// ── 3) TEKNİK SERVİS TEKLİFİ ────────────────────────────────────────────────

export interface ServiceQuotePrintData {
  firma: string;
  ilgili?: string;
  mobil?: string;
  adres?: string;
  tel?: string;
  email?: string;
  tarih: string;
  belgeNo: string;
  gecerlilik: string;
  teklifiYazan: string;
  teklifiYazanUnvan?: string;
  teklifiYazanEmail?: string;
  /** Belgeye kaydedilen imza; verilmezse satır teklifi yazana düşer, görsel çıkmaz. */
  imza?: PrintSignature;
  konu: string;
  items: Array<QuoteItem & { miktar: number }>;
  kdvOran: number;
  kdvTutar: number;
  currency: CurrencyCode;
  notlar: string[];
}

const SERVICE_QUOTE_CSS = `
.sq-page { padding: 7mm 10mm 6mm 13mm; font-family: Arial, Helvetica, sans-serif; }
.sq-header, .sq-footer { width: 100%; display: block; position: relative; z-index: 2; }
.sq-title { margin-top: 2.5mm; background: #dbe7f3; text-align: center; font-size: 16pt; font-weight: 800; line-height: 1.2; }
.sq-top { display: grid; grid-template-columns: minmax(0, 1fr) 58mm; gap: 8mm; margin: 2.5mm 3mm 0; font-size: 10.5pt; line-height: 1.45; position: relative; z-index: 2; }
.sq-customer, .sq-meta { display: grid; grid-template-columns: 18mm minmax(0, 1fr); align-content: start; column-gap: 2mm; }
.sq-meta { grid-template-columns: 30mm minmax(0, 1fr); }
.sq-customer .wide { grid-column: 2; }
.sq-customer .contact-row { grid-column: 1 / -1; display: grid; grid-template-columns: 18mm minmax(0, 1fr) 14mm 35mm; column-gap: 2mm; }
.sq-label { font-weight: 700; }
.sq-value { min-width: 0; overflow-wrap: anywhere; }
.sq-subject { margin: 4mm 8mm 3.5mm; text-align: center; font-size: 10.5pt; line-height: 1.35; position: relative; z-index: 2; }
.sq-watermark { position: absolute; left: 50%; top: 49%; width: 85mm; transform: translate(-50%, -50%); opacity: .12; z-index: 0; }
table.sq-items { width: 100%; table-layout: fixed; position: relative; z-index: 2; }
table.sq-items th, table.sq-items td { border-top: .7pt solid #222; border-bottom: .7pt solid #222; padding: .55mm 1.4mm; font-size: 9.5pt; }
table.sq-items th { font-weight: 800; text-align: center; }
table.sq-items th:nth-child(1), table.sq-items td:nth-child(1) { width: 8mm; text-align: center; }
table.sq-items th:nth-child(3), table.sq-items td:nth-child(3) { width: 25mm; text-align: center; }
table.sq-items th:nth-child(4), table.sq-items td:nth-child(4) { width: 31mm; text-align: right; }
table.sq-items th:nth-child(5), table.sq-items td:nth-child(5) { width: 31mm; text-align: right; }
table.sq-items td { height: 4.8mm; }
.sq-total-wrap { display: flex; justify-content: flex-end; position: relative; z-index: 2; }
table.sq-total { width: 53mm; }
table.sq-total td { border-bottom: .7pt solid #222; padding: .25mm 1.4mm; font-size: 9.5pt; }
table.sq-total td:first-child { font-weight: 700; }
table.sq-total td:last-child { text-align: right; font-weight: 700; }
.sq-notes { margin-top: 4mm; font-size: 10pt; line-height: 1.28; position: relative; z-index: 2; }
.sq-notes-title { font-weight: 800; margin-bottom: 1mm; }
.sq-notes ol { margin-left: 5mm; }
.sq-notes li { padding-left: 1.5mm; margin-bottom: .7mm; text-align: left; }
.sq-signatures { margin: 10mm 10mm 3mm 35mm; display: grid; grid-template-columns: 47mm 1fr; gap: 28mm; min-height: 45mm; position: relative; z-index: 2; }
.sq-writer { position: relative; padding-top: 2mm; text-align: center; font-size: 9.5pt; line-height: 1.3; }
.sq-writer > div { position: relative; z-index: 1; }
.sq-sign-title { font-weight: 800; text-decoration: underline; margin-bottom: 1mm; }
.sq-signature-img { position: absolute; top: 7mm; left: 50%; height: 24mm; transform: translateX(-50%); mix-blend-mode: multiply; opacity: .92; }
.sq-approval { border: .8pt solid #222; text-align: center; font-size: 10pt; min-height: 44mm; padding-top: 2mm; }
.sq-approval .stamp { color: #c6c6c6; margin-top: 16mm; }
.sq-footer { margin-top: auto; }
`;

export function serviceQuoteDoc(d: ServiceQuotePrintData, assetBase: string): PrintDocument {
  const toplam = d.items.reduce((a, i) => a + (i.tutar ?? 0), 0);
  const kdvTutar = Number.isFinite(d.kdvTutar) ? d.kdvTutar : toplam * (d.kdvOran / 100);
  const money = (value: number, forceDecimals = false) => {
    const normalized = Number.isFinite(value) ? value : 0;
    const decimals = forceDecimals || !Number.isInteger(normalized) ? 2 : 0;
    return `${new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: 2,
    }).format(normalized)} ${d.currency}`;
  };
  const addressChunks = chunkText(d.adres, 360);
  const printableNotes = [
    ...addressChunks.slice(1).map((value) => `Adres devamı: ${value}`),
    ...d.notlar.flatMap((note) => chunkText(note, 1000)),
  ];
  const itemWeight = (item: ServiceQuotePrintData["items"][number]) => Math.max(1, item.urun.length / 100);
  const noteWeight = (note: string) => Math.max(1, note.length / 125);
  const compactWeight = d.items.reduce((sum, item) => sum + Math.ceil(itemWeight(item)), 0)
    + printableNotes.reduce((sum, note) => sum + Math.ceil(noteWeight(note)), 0);
  const compact = addressChunks.length <= 1 && d.konu.length <= 360 && compactWeight <= 13;
  const itemChunks = compact ? [d.items] : chunkByWeight(d.items, 10, itemWeight);
  const noteChunks = compact
    ? (printableNotes.length ? [printableNotes] : [])
    : (printableNotes.length ? chunkByWeight(printableNotes, 8, noteWeight) : []);
  const totalPages = compact ? 1 : itemChunks.length + noteChunks.length;
  const pages: string[] = [];
  const top = `
  <div class="sq-top">
    <div class="sq-customer">
      <div class="sq-label">Firma</div><div class="sq-value">${blank(d.firma)}</div>
      <div class="contact-row"><span class="sq-label">İlgili</span><span>${blank(d.ilgili)}</span><span class="sq-label">Mobil</span><span>${blank(d.mobil)}</span></div>
      <div class="sq-label">Telefon</div><div class="sq-value">${blank(d.tel)}</div>
      <div class="sq-label">Adres</div><div class="sq-value">${blank(addressChunks[0])}${addressChunks.length > 1 ? " <b>(devamı ek sayfada)</b>" : ""}</div>
      <div class="sq-label">E-Posta</div><div class="sq-value link">${blank(d.email)}</div>
    </div>
    <div class="sq-meta">
      <div class="sq-label">Teklif No.</div><div class="sq-value">${blank(d.belgeNo)}</div>
      <div class="sq-label">Tarih</div><div class="sq-value">${blank(d.tarih)}</div>
      <div class="sq-label">Teklifi Yazan</div><div class="sq-value">${blank(d.teklifiYazan)}</div>
      <div class="sq-label">Geçerlilik Süresi</div><div class="sq-value">${blank(d.gecerlilik)}</div>
    </div>
  </div>`;
  // İmza belgeye kaydedilen seçimden gelir (bkz. quoteDoc'taki gerekçe). Seçim
  // yoksa eski davranış korunur: satır teklifi yazanın adına düşer, görsel çıkmaz.
  const signatures = `
  <div class="sq-signatures">
    <div class="sq-writer">
      <div class="sq-sign-title">İLGİLİ KİŞİ</div>
      <div>${blank(d.imza?.ad ?? d.teklifiYazan)}</div>
      <div>${blank(d.imza?.unvan ?? d.teklifiYazanUnvan)}</div>
      ${d.imza?.gorselUrl ? `<img class="sq-signature-img" src="${esc(d.imza.gorselUrl)}" alt="">` : ""}
      <div>${blank(d.teklifiYazanEmail)}</div>
    </div>
    <div class="sq-approval"><div class="sq-sign-title">MÜŞTERİ ONAYI</div><div class="stamp">KAŞE + İMZA</div></div>
  </div>`;
  const totals = `
  <div class="sq-total-wrap"><table class="sq-total">
    <tr><td>ARA TOPLAM</td><td>${money(toplam)}</td></tr>
    <tr><td>K.D.V. (%${esc(d.kdvOran)})</td><td>${money(kdvTutar, true)}</td></tr>
    <tr><td>TOPLAM</td><td>${money(toplam + kdvTutar)}</td></tr>
  </table></div>`;
  const notes = (values: string[]) => values.length ? `
  <div class="sq-notes">
    <div class="sq-notes-title">NOTLAR:</div>
    <ol>${values.map((note) => `<li>${esc(note)}</li>`).join("")}</ol>
  </div>` : "";
  const rows = (chunk: ServiceQuotePrintData["items"], padToThree = false) => {
    const padded: Array<ServiceQuotePrintData["items"][number] | undefined> = [...chunk];
    if (padToThree) while (padded.length < 3) padded.push(undefined);
    return padded.map((item) => `<tr>
      <td>${item ? d.items.indexOf(item) + 1 : ""}</td>
      <td>${item ? esc(item.urun) : ""}</td>
      <td>${item ? `${esc(new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(item.miktar))} ${blank(item.birim)}` : ""}</td>
      <td>${item ? money(item.fiyat ?? 0) : ""}</td>
      <td>${item ? money(item.tutar ?? 0) : ""}</td>
    </tr>`).join("");
  };
  const pageCounter = (current: number) => totalPages > 1 ? pageNo(current, totalPages) : "";

  if (compact) {
    pages.push(`
<div class="page sq-page">
  <img class="sq-header" src="${assetBase}/drmak-quote-header.png" alt="Dr.Mak Doktor Makina">
  <img class="sq-watermark" src="${assetBase}/drmak-technician.jpg" alt="">
  <div class="sq-title">FİYAT TEKLİFİ</div>
  ${top}
  <div class="sq-subject">${blank(d.konu)}</div>
  <table class="sq-items">
    <tr><th>NO</th><th>ÜRÜN / HİZMET AÇIKLAMASI</th><th>MİKTAR</th><th>BİRİM FİYAT</th><th>TUTAR</th></tr>
    ${rows(d.items, true)}
  </table>
  ${totals}
  ${notes(printableNotes)}
  ${signatures}
  <img class="sq-footer" src="${assetBase}/drmak-quote-footer.png" alt="">
</div>`);
  } else {
    itemChunks.forEach((chunk, chunkIndex) => {
      const isFinalItemPage = chunkIndex === itemChunks.length - 1;
      const currentPage = pages.length + 1;
      pages.push(`
<div class="page sq-page">
  <img class="sq-header" src="${assetBase}/drmak-quote-header.png" alt="Dr.Mak Doktor Makina">
  <img class="sq-watermark" src="${assetBase}/drmak-technician.jpg" alt="">
  <div class="sq-title">FİYAT TEKLİFİ${chunkIndex > 0 ? " — DEVAM" : ""}</div>
  ${top}
  <div class="sq-subject">${blank(d.konu)}</div>
  <table class="sq-items">
    <tr><th>NO</th><th>ÜRÜN / HİZMET AÇIKLAMASI</th><th>MİKTAR</th><th>BİRİM FİYAT</th><th>TUTAR</th></tr>
    ${rows(chunk, chunk.length < 3)}
  </table>
  ${isFinalItemPage ? totals : ""}
  ${isFinalItemPage && noteChunks.length === 0 ? signatures : ""}
  ${pageCounter(currentPage)}
  <img class="sq-footer" src="${assetBase}/drmak-quote-footer.png" alt="">
</div>`);
    });

    noteChunks.forEach((chunk, chunkIndex) => {
      const isFinalPage = chunkIndex === noteChunks.length - 1;
      const currentPage = pages.length + 1;
      pages.push(`
<div class="page sq-page">
  <img class="sq-header" src="${assetBase}/drmak-quote-header.png" alt="Dr.Mak Doktor Makina">
  <img class="sq-watermark" src="${assetBase}/drmak-technician.jpg" alt="">
  <div class="sq-title">FİYAT TEKLİFİ — NOTLAR</div>
  ${top}
  ${notes(chunk)}
  ${isFinalPage ? signatures : ""}
  ${pageCounter(currentPage)}
  <img class="sq-footer" src="${assetBase}/drmak-quote-footer.png" alt="">
</div>`);
    });
  }

  return {
    title: `Fiyat Teklifi ${d.belgeNo}`,
    css: SERVICE_QUOTE_CSS,
    body: pages.join("\n"),
  };
}

// ── 4) SATIŞ SÖZLEŞMESİ ─────────────────────────────────────────────────────

export interface ContractMachinePrintData {
  model: string;
  adet: number;
  ozellikler: { key: string; value: string }[];
  aksesuarlar: string[];
  muadiller?: string[];
  fiyat: number;
  kontrolUnitesiMarka?: string;
}

export interface ContractPrintData {
  alici: {
    unvan: string;
    yetkili?: string;
    adres?: string;
    vergiDairesi?: string;
    vergiNo?: string;
    tel?: string;
    faks?: string;
    eposta?: string;
  };
  sozlesmeNo: string;
  sozlesmeTarihi: string; // ISO ya da hazır metin
  model: string;
  adet: number;
  ozellikler: { key: string; value: string }[];
  aksesuarlar: string[];
  muadiller?: string[];
  teslimAyi?: string; // ör. "2026 TEMMUZ"
  teslimYeri?: string;
  fiyat: number;
  currency: CurrencyCode;
  teslimSekli?: string; // ör. "Millileştirilmiş"
  ithalatMasraflariDahil?: boolean;
  teslimKosullari?: string;
  odemeKosullari?: string;
  garantiKosullari?: string;
  notlar?: string;
  kdvOran: number;
  odemePlani: { label: string; tutar: number; senet?: boolean }[];
  kontrolUnitesiMarka?: string;
  machines?: ContractMachinePrintData[];
  /** Sözleşmeyi hazırlayan CRM kullanıcısı ve ünvanı (TARAFLAR sayfası altı). */
  hazirlayan?: string;
  hazirlayanUnvan?: string;
  /** Belgeye kaydedilen imza; verilmezse satır hazırlayana düşer, görsel çıkmaz. */
  imza?: PrintSignature;
}

const CONTRACT_CSS = `
/* Hazırlayan bilgisi — taraf imzalarından ayrı, küçük ve gri. */
.ct-prepared { margin-top: 8mm; font-size: 9pt; color: #444; }
/* İmza görseli metnin solunda; taraf imza kutularıyla karışmasın diye küçük. */
.ct-signature { display: block; height: 12mm; max-width: 40mm; object-fit: contain; object-position: left bottom; margin-bottom: 1mm; }
.ct.page { padding-top: 5mm; }
.ct { font-family: Cambria, "Times New Roman", Georgia, serif; font-size: 11pt; line-height: 1.11; }
.ct-body { padding: 0 0 0 4mm; }
.ct-title { text-align: center; font-weight: bold; font-size: 12pt; margin: .7mm 0 3.5mm; }
.ct-continuation-title { text-align: center; font-weight: bold; font-size: 11pt; margin: 2.5mm 0 3mm; }
.ct p { margin-bottom: .7mm; text-align: justify; }
.ct .ind { text-indent: 11mm; }
.ct .ctr { text-align: center; }
.ct .b { font-weight: bold; }
.ct-section-title { display: grid; grid-template-columns: 7mm 1fr; font-weight: bold; margin-top: 3.5mm; }
.ct-machine { display: grid; grid-template-columns: 8mm minmax(0, 1fr) 42mm; column-gap: 1mm; margin: .3mm 0 0 5mm; font-weight: bold; }
.ct-machine .qty { text-align: left; white-space: nowrap; }
.ct-tech-group { margin: 4mm 0 0 15mm; }
.ct-tech-group + .ct-tech-group { margin-top: 4mm; }
.ct-tech-heading { display: grid; grid-template-columns: 10mm 1fr; font-weight: bold; }
table.ct-kv { width: calc(100% - 10mm); margin: .4mm 0 0 10mm; font-size: 11pt; line-height: 1.1; }
table.ct-kv td { padding: .15mm 0; vertical-align: top; overflow-wrap: anywhere; }
table.ct-kv td:first-child { width: 65mm; padding-right: 2mm; }
.ct-acc { margin: .4mm 0 0 10mm; line-height: 1.1; }
.ct-acc div { margin-bottom: .15mm; overflow-wrap: anywhere; }
.ct-h2 { display: grid; grid-template-columns: 7mm 1fr; font-weight: bold; margin: 4.8mm 0 .5mm; }
.ct-body > .ct-h2:first-child { margin-top: 0; }
.ct-clause { display: grid; grid-template-columns: 8mm minmax(0, 1fr); margin: 0 0 .45mm 5mm; text-align: justify; }
.ct-clause .no { font-weight: bold; }
/* Sayfa bölünmesi.
   - Madde bloklarına .avoid-break (BASE_CSS) yalnızca
     CLAUSE_KEEP_TOGETHER_MAX_LINES sınırının altındaki maddelerde eklenir; bir
     sayfaya sığmayan bir maddeyi bölünmez ilan etmek onu taşırıp kırpar,
     kırpmaktansa bölmek yeğdir.
   - Sınırın üstündeki uzun maddeler bölünebilir kalır; orphans/widows tek
     satırlık sarkmayı engeller.
   - Başlıklar sayfanın en altında tek başına kalmasın diye break-after: avoid. */
.ct-clause .text { overflow-wrap: anywhere; orphans: 2; widows: 2; }
.ct-h2, .ct-section-title, .ct-tech-heading, .ct-machine, .ct-continuation-title {
  break-inside: avoid; page-break-inside: avoid;
  break-after: avoid; page-break-after: avoid;
}
.ct-price { margin: .7mm 0 3.8mm 25mm; }
table.ct-price-table { width: calc(100% - 4mm); font-weight: bold; }
table.ct-price-table td { padding: .15mm 0; vertical-align: top; text-align: left; }
table.ct-price-table td.qty { width: 25mm; }
table.ct-price-table td.amount { width: 36mm; text-align: right; white-space: nowrap; }
table.ct-price-table td.total-label { text-align: right; padding-right: 14mm; }
.ct-price-words { margin-top: .4mm; font-weight: bold; }
table.ct-pay { margin: 3.7mm 0 .6mm 20mm; font-size: 10.7pt; line-height: 1.15; }
table.ct-pay td { padding: .2mm 3mm .2mm 0; }
table.ct-pay td.amt { text-align: right; min-width: 36mm; white-space: nowrap; }
table.ct-parties { width: 100%; margin-top: 0; font-size: 11pt; line-height: 1.12; }
table.ct-parties td { vertical-align: top; padding: .2mm 2mm .2mm 0; overflow-wrap: anywhere; }
table.ct-parties td:first-child { width: 54%; }
table.ct-parties td:last-child { width: 46%; }
table.ct-parties .hd { font-weight: bold; font-size: 10.7pt; border-top: .8pt solid #000; padding-top: .2mm; }
table.ct-parties .kv { display: grid; grid-template-columns: 38mm 1fr; }
.ct .pageno { font-family: Calibri, Carlito, Arial, sans-serif; font-size: 10.5pt; padding-top: 1mm; }
`;

type ContractTechnicalEntry = {
  kind: "spec" | "standard" | "equivalent";
  key?: string;
  value: string;
  weight: number;
};

type ContractLegalEntry = { html: string; weight: number; isHeading?: boolean };

const contractLineCount = (value: string, charsPerLine = 96): number => {
  const lines = value.replace(/\r/g, "").split("\n");
  return lines.reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
};

const contractMachines = (d: ContractPrintData): ContractMachinePrintData[] => d.machines?.length
  ? d.machines.map((machine) => ({ ...machine, ozellikler: printableTechnicalSpecs(machine.ozellikler) }))
  : [{
      model: d.model,
      adet: d.adet,
      ozellikler: printableTechnicalSpecs(d.ozellikler),
      aksesuarlar: d.aksesuarlar,
      muadiller: d.muadiller,
      fiyat: d.fiyat,
      kontrolUnitesiMarka: d.kontrolUnitesiMarka,
    }];

const contractTechnicalChunks = (machine: ContractMachinePrintData): ContractTechnicalEntry[][] => {
  const entries: ContractTechnicalEntry[] = [
    ...machine.ozellikler.map((feature) => ({
      kind: "spec" as const,
      key: feature.key,
      value: feature.value,
      weight: Math.max(contractLineCount(feature.key, 44), contractLineCount(feature.value, 60)),
    })),
    ...machine.aksesuarlar.map((value) => ({
      kind: "standard" as const,
      value,
      weight: contractLineCount(value, 90),
    })),
    ...(machine.muadiller ?? []).map((value) => ({
      kind: "equivalent" as const,
      value,
      weight: contractLineCount(value, 90),
    })),
  ];
  if (!entries.length) return [[]];

  const chunks: ContractTechnicalEntry[][] = [];
  let page: ContractTechnicalEntry[] = [];
  let used = 0;
  for (const entry of entries) {
    const capacity = chunks.length === 0 ? 35 : 45;
    const headingWeight = page.length === 0 || page[page.length - 1].kind !== entry.kind ? 1 : 0;
    if (page.length && used + headingWeight + entry.weight > capacity) {
      chunks.push(page);
      page = [];
      used = 0;
    }
    const pageHeadingWeight = page.length === 0 || page[page.length - 1].kind !== entry.kind ? 1 : 0;
    page.push(entry);
    used += pageHeadingWeight + entry.weight;
  }
  if (page.length) chunks.push(page);
  return chunks;
};

/**
 * Bir maddenin bütün kalabilmesi için üst sınır (tahmini satır sayısı).
 *
 * `chunkContractLegalEntries` bir sayfaya 53 satır yerleştirir. Bunun büyük bir
 * bölümünü kaplayan bir maddeyi `break-inside: avoid` ile korumak, madde sayfaya
 * sığmadığında metnin taşmasına/kırpılmasına yol açar — böyle bir maddeyi
 * kırpmaktansa bölmek yeğdir. Bu yüzden koruma yalnızca sayfanın ~%40'ından
 * kısa maddelere uygulanır; daha uzunları CSS'teki orphans/widows ile yumuşar.
 */
const CLAUSE_KEEP_TOGETHER_MAX_LINES = 20;

/** Madde bloğunun sayfa ortasından bölünmesini engelleyen sınıf (yalnız kısa maddelerde). */
const keepTogetherClass = (weight: number): string =>
  weight <= CLAUSE_KEEP_TOGETHER_MAX_LINES ? " avoid-break" : "";

const chunkContractLegalEntries = (entries: ContractLegalEntry[]): ContractLegalEntry[][] => {
  const pages: ContractLegalEntry[][] = [];
  let page: ContractLegalEntry[] = [];
  let used = 0;
  for (const entry of entries) {
    if (page.length && used + entry.weight > 53) {
      // Sayfa sonunda tek başına kalan başlığı bir sonraki sayfaya taşır.
      // Sayfalar ayrı `.page` blokları olduğu için CSS'teki `break-after: avoid`
      // bu sınırı geçemez; taşımanın burada yapılması gerekir.
      const trailingHeading = page.length > 1 && page[page.length - 1].isHeading ? page.pop() : undefined;
      pages.push(page);
      page = trailingHeading ? [trailingHeading] : [];
      used = trailingHeading?.weight ?? 0;
    }
    page.push(entry);
    used += entry.weight;
  }
  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
};

const contractText = (value: string): string => esc(value).replace(/\r?\n/g, "<br>");

export function contractDoc(d: ContractPrintData, assetBase: string): PrintDocument {
  const tarihUzun = trLongDate(d.sozlesmeTarihi) || d.sozlesmeTarihi;
  const aliciKisaRaw = shortFirmName(d.alici.unvan);
  const aliciKisa = esc(aliciKisaRaw);
  const A = `<span class="b">${aliciKisa}</span>`;
  const machines = contractMachines(d);
  const technicalSections = machines.flatMap((machine, machineIndex) =>
    contractTechnicalChunks(machine).map((chunk, chunkIndex) => ({ machine, machineIndex, chunk, chunkIndex }))
  );
  const machineNumber = (machineIndex: number) => `1.${machineIndex + 1}.`;
  const machineHeading = (machine: ContractMachinePrintData, machineIndex: number) =>
    `<div class="ct-machine"><span>${machineNumber(machineIndex)}</span><span>${esc(machine.model)}</span><span class="qty">${esc(machine.adet)} (${esc(sayiAdet(machine.adet))}) Set</span></div>`;

  const renderTechnicalChunk = (
    machineIndex: number,
    chunkIndex: number,
    chunk: ContractTechnicalEntry[],
  ) => {
    const groups: ContractTechnicalEntry[][] = [];
    for (const entry of chunk) {
      const last = groups[groups.length - 1];
      if (!last || last[0].kind !== entry.kind) groups.push([entry]);
      else last.push(entry);
    }
    return groups.map((group) => {
      const kind = group[0].kind;
      const continuation = chunkIndex > 0 ? " — DEVAM" : "";
      if (kind === "spec") {
        return `<div class="ct-tech-group">
          <div class="ct-tech-heading"><span>${machineNumber(machineIndex)}1.</span><span>Tezgahın Karakteristik Özellikleri;${continuation}</span></div>
          <table class="ct-kv">${group.map((entry) => `<tr><td>${esc(entry.key)}</td><td>${esc(entry.value)}</td></tr>`).join("")}</table>
        </div>`;
      }
      const number = `${machineNumber(machineIndex)}${kind === "standard" ? "2" : "3"}.`;
      const title = kind === "standard" ? "Tezgahın Standart Aksesuarları;" : "Muadil Ürünler;";
      return `<div class="ct-tech-group">
        <div class="ct-tech-heading"><span>${number}</span><span>${title}${continuation}</span></div>
        <div class="ct-acc">${group.map((entry) => `<div>${esc(entry.value)}</div>`).join("")}</div>
      </div>`;
    }).join("");
  };

  const clause = (number: string, plainText: string, html = contractText(plainText)): ContractLegalEntry => {
    const weight = contractLineCount(plainText);
    return {
      html: `<div class="ct-clause${keepTogetherClass(weight)}"><span class="no">${esc(number)}</span><span class="text">${html}</span></div>`,
      weight,
    };
  };
  const heading = (number: string, title: string): ContractLegalEntry => ({
    html: `<div class="ct-h2"><span>${esc(number)}</span><span>${esc(title)}</span></div>`,
    weight: 1,
    isHeading: true,
  });

  const deliveryDefault = d.teslimAyi
    ? `Tezgahın teslimi sözleşme şartlarının yerine getirilmesi ve gümrük işlemlerinin tamamlanmasıyla ${d.teslimAyi} ayı içerisinde gerçekleştirilecektir;`
    : "Tezgahın teslimi sözleşme şartlarının yerine getirilmesi ve gümrük işlemlerinin tamamlanmasını takiben gerçekleştirilecektir;";
  const warrantyDefault = `Tezgahın mekanik garantisi ${aliciKisaRaw} firmasına teslimiyle başlayacak olup, mekanik garanti tüm üretim hatalarına karşı 1 (bir) yıldır;`;
  const controlBrand = d.kontrolUnitesiMarka?.trim();
  const deliveryLocation = d.teslimYeri?.trim() || "HAKSAN MAKİNA/Hadımköy tesisleri";
  const sectionTwo = [
    heading("2.", "Nakliye, Ambalaj ve Teslimat;"),
    clause("2.1.", d.teslimKosullari?.trim() || deliveryDefault),
    clause(
      "2.2.",
      `Tezgahın ${aliciKisaRaw} firmasına teslim olmasını müteakip 2 (iki) gün içerisinde HAKSAN MAKİNA personeli tarafından tezgahın kurulumu ve ilk çalıştırması gerçekleştirilecektir;`,
      `Tezgahın ${A} firmasına teslim olmasını müteakip 2 (iki) gün içerisinde <span class="b">HAKSAN MAKİNA</span> personeli tarafından tezgahın kurulumu ve ilk çalıştırması gerçekleştirilecektir;`,
    ),
    clause(
      "2.3.",
      `Tezgahın kurulmasından sonra HAKSAN MAKİNA, ${aliciKisaRaw} firmasına 2 (iki) gün süre ile eğitim ve demo çalışması yapacaktır. Eğitim ve demo çalışması ${aliciKisaRaw} tesislerinde gerçekleştirilecektir.`,
      `Tezgahın kurulmasından sonra <span class="b">HAKSAN MAKİNA</span>, ${A} firmasına 2 (iki) gün süre ile eğitim ve demo çalışması yapacaktır. Eğitim ve demo çalışması ${A} tesislerinde gerçekleştirilecektir.`,
    ),
    clause("2.4.", d.garantiKosullari?.trim() || warrantyDefault),
    clause(
      "2.5.",
      `Tezgahın kontrol ünitesi garantisi ${aliciKisaRaw} firmasına teslimiyle başlayacak olup, ${controlBrand ? `uluslararası ${controlBrand} garantisi` : "kontrol ünitesi garantisi"} 2 (iki) yıldır;`,
      `Tezgahın kontrol ünitesi garantisi ${A} firmasına teslimiyle başlayacak olup, ${controlBrand ? `uluslararası <span class="b">${esc(controlBrand)}</span> garantisi` : "kontrol ünitesi garantisi"} 2 (iki) yıldır;`,
    ),
    clause(
      "2.6.",
      `Tezgah ${deliveryLocation} adresinden teslim edilecek olup, tezgahın nakliye ve sigorta giderleri ${aliciKisaRaw} firmasına aittir.`,
      `Tezgah ${esc(deliveryLocation)} adresinden teslim edilecek olup, tezgahın nakliye ve sigorta giderleri ${A} firmasına aittir.`,
    ),
  ];

  const hasImportCostStatement = Boolean(d.teslimSekli) || d.ithalatMasraflariDahil !== undefined;
  const importCostsIncluded = d.ithalatMasraflariDahil ?? /millileştiril/i.test(d.teslimSekli ?? "");
  const modelSummary = machines.map((machine) => machine.model).filter(Boolean).join(" / ") || d.model;
  const priceBasisPlain = `Sözleşmeye konu ${modelSummary} ${d.teslimSekli ? `${d.teslimSekli} şeklinde` : "yukarıdaki şekilde"} fiyatlandırılmıştır.${hasImportCostStatement ? ` Tezgahın fiyatına, tezgahın ithalatı ile ilgili masraf ve vergiler (Gümrük Vergisi, Liman Masrafları, Ardiye Giderleri, Gümrükleme Ücreti, İlave Gümrük Vergisi) ${importCostsIncluded ? "dahildir" : "dahil değildir"}.` : ""}`;
  const priceBasisHtml = `Sözleşmeye konu <span class="b">${esc(modelSummary)}</span> ${d.teslimSekli ? `<span class="b">${esc(d.teslimSekli)}</span> şeklinde` : "yukarıdaki şekilde"} fiyatlandırılmıştır.${hasImportCostStatement ? ` Tezgahın fiyatına, tezgahın ithalatı ile ilgili masraf ve vergiler (Gümrük Vergisi, Liman Masrafları, Ardiye Giderleri, Gümrükleme Ücreti, İlave Gümrük Vergisi) ${importCostsIncluded ? "dahildir" : "dahil değildir"}.` : ""}`;
  const machinePriceRows = machines.map((machine) =>
    `<tr><td class="qty">${esc(machine.adet)} Adet</td><td>${esc(machine.model)}</td><td class="amount">${esc(fmtMoney(machine.fiyat, d.currency))}</td></tr>`
  ).join("");
  const priceIntro = machines.length > 1
    ? "1. bölümde belirtilen tezgahların ilgili maddelerde belirtilmiş olan karakteristik özellikleri ve donanımları ile birlikte fiyatları aşağıdaki gibidir,"
    : "1.1. no'lu maddede belirtilen tezgahın karakteristik özellikleri ve donanımları ile birlikte fiyatı aşağıdaki gibidir,";
  const priceWeight = 4 + machines.length;
  const priceBlock: ContractLegalEntry = {
    html: `<div class="ct-clause${keepTogetherClass(priceWeight)}"><span class="no">3.1.</span><span class="text">${esc(priceIntro)}
      <div class="ct-price">
        <table class="ct-price-table">
          ${machinePriceRows}
          <tr><td colspan="2" class="total-label">TOPLAM</td><td class="amount">${esc(fmtMoney(d.fiyat, d.currency))}</td></tr>
        </table>
        <div class="ct-price-words">${esc(tutarYaziyla(d.fiyat, d.currency))}</div>
      </div>
    </span></div>`,
    weight: priceWeight,
  };
  const paymentPlanHtml = d.odemePlani.length ? `<table class="ct-pay">${d.odemePlani.map((payment) =>
    `<tr><td>${esc(payment.label)}</td><td class="amt">${esc(fmtMoney(payment.tutar, d.currency))}${payment.senet ? " (Senet)" : ""}</td></tr>`
  ).join("")}</table>` : "";
  const paymentWeight = 2 + (d.odemeKosullari ? contractLineCount(d.odemeKosullari) : 0) + d.odemePlani.length;
  const paymentBlock: ContractLegalEntry = {
    html: `<div class="ct-clause${keepTogetherClass(paymentWeight)}"><span class="no">3.4.</span><span class="text">Sözleşmeye konu tezgahın bedelinin tamamı ${A} firmasından aşağıdaki şekilde tahsil edilecektir;
      ${d.odemeKosullari ? `<div style="margin-top:.7mm">${contractText(d.odemeKosullari)}</div>` : ""}
      ${paymentPlanHtml}
    </span></div>`,
    weight: paymentWeight,
  };
  const sectionThree = [
    heading("3.", "Fiyat ve Ödeme Şartları;"),
    priceBlock,
    clause("3.2.", priceBasisPlain, priceBasisHtml),
    clause(
      "3.3.",
      `Sözleşmeye konu tezgahın fiyatına ${d.kdvOran > 0 ? `%${d.kdvOran} oranındaki ` : ""}K.D.V. dahil değildir;`,
      `Sözleşmeye konu tezgahın fiyatına ${d.kdvOran > 0 ? `<span class="b">%${esc(d.kdvOran)}</span> oranındaki ` : ""}<span class="b">K.D.V.</span> dahil değildir;`,
    ),
    paymentBlock,
    heading("", "Diğer Hususlar;"),
    clause(
      "3.5.",
      `İş bu sözleşme ${HAKSAN.unvan} ve ${d.alici.unvan} tarafından, her iki firmanın iradesi altında imza altına alınmıştır;`,
      `İş bu sözleşme <span class="b">${esc(HAKSAN.unvan)}</span> ve <span class="b">${esc(d.alici.unvan)}</span> tarafından, her iki firmanın iradesi altında imza altına alınmıştır;`,
    ),
    clause("3.6.", "İş bu sözleşmenin maddesi veya maddeleri her iki taraf mutabakatı ile değiştirilebilir, tek taraflı değiştirilemez ve sözleşme feshedilemez;"),
    clause("3.7.", "İş bu sözleşmenin karşılıklı feshedilmesi veya şartlarının değiştirilmesi halinde sözleşmeye istinaden alınan kaparo veya teminatlar taraflara iade edilecektir;"),
    clause("3.8.", "Taraflar arasında bu sözleşmeden doğabilecek uyuşmazlıkların çözümünde İstanbul Merkez Adliyesi Mahkemeleri ve İcra Müdürlükleri yetkilidir;"),
    clause("3.9.", `İş bu sözleşme ${tarihUzun} tarihinde imza altına alınmış ve yürürlüğe girmiştir.`),
    ...(d.notlar?.trim() ? [clause("3.10.", d.notlar.trim())] : []),
  ];
  const legalChunks = chunkContractLegalEntries([...sectionTwo, ...sectionThree]);
  const totalPages = technicalSections.length + legalChunks.length + 1;
  const pn = (page: number) => pageNo(page, totalPages);
  const firstTechnicalSection = technicalSections[0];
  const subjectTitle = machines.length > 1
    ? "Sözleşmeye Konu Olan Tezgahlar ve Özellikleri"
    : "Sözleşmeye Konu Olan Tezgah ve Özellikleri";

  const firstPage = `<div class="page ct">
    ${haksanHeader(assetBase)}
    <div class="ct-body">
      <div class="ct-title">SATIŞ SÖZLEŞMESİ</div>
      <p>İş bu satış sözleşmesi satıcı firma sıfatıyla;</p>
      <p class="ctr">${esc(HAKSAN.adresSozlesme)} adresinde sabit,</p>
      <p class="ctr b">${esc(HAKSAN.unvanUzun)}</p>
      <p class="ctr">İle</p>
      <p>Alıcı firma sıfatıyla;</p>
      <p class="ctr">${blank(d.alici.adres)} adresinde sabit,</p>
      <p class="ctr b">${esc(d.alici.unvan)}</p>
      <p class="ind" style="margin-top:3mm">arasında ${esc(tarihUzun)} tarihinde kaleme alınmış toplam ${totalPages} (${esc(sayiAdet(totalPages))}) sayfadan oluşan satış sözleşmesidir.</p>
      <div class="ct-section-title"><span>1.</span><span>${subjectTitle}</span></div>
      ${machineHeading(firstTechnicalSection.machine, firstTechnicalSection.machineIndex)}
      ${renderTechnicalChunk(firstTechnicalSection.machineIndex, firstTechnicalSection.chunkIndex, firstTechnicalSection.chunk)}
    </div>
    ${pn(1)}
  </div>`;

  const technicalPages = technicalSections.slice(1).map((section, index) => {
    const page = index + 2;
    return `<div class="page ct">
      ${haksanHeader(assetBase)}
      <div class="ct-body">
        <div class="ct-continuation-title">SATIŞ SÖZLEŞMESİ — DEVAM</div>
        <div class="ct-section-title"><span>1.</span><span>${subjectTitle}</span></div>
        ${machineHeading(section.machine, section.machineIndex)}
        ${renderTechnicalChunk(section.machineIndex, section.chunkIndex, section.chunk)}
      </div>
      ${pn(page)}
    </div>`;
  });

  const legalPages = legalChunks.map((chunk, index) => {
    const page = technicalSections.length + index + 1;
    return `<div class="page ct">
      ${haksanHeader(assetBase)}
      <div class="ct-body">
        ${index > 0 ? `<div class="ct-continuation-title">SATIŞ SÖZLEŞMESİ — DEVAM</div>` : ""}
        ${chunk.map((entry) => entry.html).join("")}
      </div>
      ${pn(page)}
    </div>`;
  });

  const kv = (key: string, value?: string) => `<div class="kv"><span>${esc(key)}</span><span>${blank(value)}</span></div>`;
  const partiesPageNumber = totalPages;
  const partiesPage = `<div class="page ct">
    ${haksanHeader(assetBase)}
    <div class="ct-body">
      <div class="ct-title" style="margin-bottom:0">TARAFLAR</div>
      <table class="ct-parties">
        <tr>
          <td class="hd">${esc(HAKSAN.unvanKisa)}<br>${esc(HAKSAN.yetkili)}</td>
          <td class="hd">${esc(d.alici.unvan)}<br>${blank(d.alici.yetkili)}</td>
        </tr>
        <tr>
          <td>${esc(HAKSAN.adres1.replace(/\s+/g, " "))}<br>${esc(HAKSAN.adres2)}</td>
          <td>${blank(d.alici.adres)}</td>
        </tr>
        <tr>
          <td>${kv("Vergi Dairesi", HAKSAN.vergiDairesi)}${kv("Vergi Numarası", HAKSAN.vergiNo)}${kv("Tel.", HAKSAN.telSade)}${kv("Faks", HAKSAN.faksSade)}</td>
          <td>${kv("Vergi Dairesi", d.alici.vergiDairesi)}${kv("Vergi Numarası", d.alici.vergiNo)}${kv("Tel.", d.alici.tel)}${kv("Faks", d.alici.faks)}${kv("E-Posta", d.alici.eposta)}</td>
        </tr>
      </table>
      ${d.imza || d.hazirlayan ? `
      <div class="ct-prepared">
        ${d.imza?.gorselUrl ? `<img class="ct-signature" src="${esc(d.imza.gorselUrl)}" alt="">` : ""}
        <span>${d.imza ? "İmza:" : "Hazırlayan:"}</span>
        <b>${esc(d.imza?.ad ?? d.hazirlayan ?? "")}</b>${(d.imza?.unvan ?? d.hazirlayanUnvan) ? ` · ${esc(d.imza?.unvan ?? d.hazirlayanUnvan ?? "")}` : ""}
      </div>` : ""}
    </div>
    ${pn(partiesPageNumber)}
  </div>`;

  return {
    title: `Satış Sözleşmesi ${d.sozlesmeNo} - ${aliciKisaRaw}`,
    css: CONTRACT_CSS,
    body: [firstPage, ...technicalPages, ...legalPages, partiesPage].join("\n"),
  };
}

const ADET_YAZI: Record<number, string> = {
  1: "bir", 2: "iki", 3: "üç", 4: "dört", 5: "beş", 6: "altı", 7: "yedi", 8: "sekiz", 9: "dokuz", 10: "on",
};
const sayiAdet = (n: number) => ADET_YAZI[n] ?? String(n);
const shortFirmName = (s: string) => s.split(" ").slice(0, 2).join(" ");

// ── 5) KUTU ADRES ETİKETİ ───────────────────────────────────────────────────

export interface CargoLabelPrintData {
  firma: string;
  adres?: string;
  ilce?: string;
  sehir?: string;
  tel?: string;
}

export function cargoLabelDoc(d: CargoLabelPrintData, assetBase: string): PrintDocument {
  const brandAssetBase = assetBase.replace(/\/print\/?$/, "/brand");
  const customerNameSize = d.firma.length > 90 ? 14 : d.firma.length > 55 ? 18 : 26;
  const addressLength = [d.adres, d.ilce, d.sehir].filter(Boolean).join(" ").length;
  const customerAddressSize = addressLength > 700 ? 7.5 : addressLength > 400 ? 9 : addressLength > 220 ? 12 : addressLength > 120 ? 15 : 20;
  const customerAddress = [d.adres, [d.ilce, d.sehir].filter(Boolean).join(" / ")]
    .map((line) => line?.trim())
    .filter(Boolean)
    .map((line) => esc(line))
    .join("<br>");
  const css = `
    @page { size: A4 landscape; margin: 0; }
    .lbl-page { 
      width: 297mm; height: 210mm; 
      padding: 15mm; 
      font-family: Calibri, "Segoe UI", Arial, sans-serif; 
      background: #fff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }
    .lbl-haksan {
      position: absolute;
      top: 15mm;
      left: 15mm;
      width: 120mm;
    }
    .lbl-logo {
      width: 90mm;
      display: block;
      margin-bottom: 2mm;
    }
    .lbl-haksan-address {
      font-size: 14pt;
      line-height: 1.4;
    }
    .lbl-haksan-tel {
      margin-top: 1mm;
      font-size: 14pt;
    }
    .lbl-customer {
      position: absolute;
      bottom: 15mm;
      right: 15mm;
      width: 160mm;
      max-height: 145mm;
      text-align: center;
      overflow-wrap: anywhere;
      word-break: break-word;
      display: flex;
      flex-direction: column;
      gap: 1.5mm;
    }
    .lbl-customer-name {
      font-size: ${customerNameSize}pt;
      font-weight: 900;
      line-height: 1.2;
      margin: 0;
    }
    .lbl-customer-address {
      font-size: ${customerAddressSize}pt;
      line-height: 1.25;
      margin: 0;
    }
    .lbl-customer-tel {
      font-size: ${Math.max(9, Math.min(18, customerAddressSize + 2))}pt;
    }
  `;

  const body = `
<div class="lbl-page">
  <div class="lbl-haksan">
    <img class="lbl-logo" src="${brandAssetBase}/haksan-logo.png" alt="HAKSAN MAKİNA">
    <div class="lbl-haksan-address">Yenidoğan Mah. Eyüp Sultan Cad. No:24<br>Bayrampaşa, İstanbul</div>
    <div class="lbl-haksan-tel"><span style="text-decoration: underline;">Tel. :</span> 0(212) 567 33 31</div>
  </div>
  
  <div class="lbl-customer">
    <div class="lbl-customer-name">${esc(d.firma)}</div>
    ${customerAddress ? `<div class="lbl-customer-address">${customerAddress}</div>` : ''}
    ${d.tel ? `<div class="lbl-customer-tel">Tel: ${esc(d.tel)}</div>` : ''}
  </div>
</div>`;

  return { title: `Kargo Etiketi - ${d.firma}`, css, body };
}

// ── 6) KURULUM TUTANAĞI (DR.MAK) ────────────────────────────────────────────

export interface MachineInfo {
  marka?: string;
  tip?: string;
  model?: string;
  seriNo?: string;
}

export interface CncInfo {
  marka?: string;
  model?: string;
  seriNo?: string;
  mainSw?: string;
}

export interface InstallationPrintData {
  teslimTarihi?: string;
  kurulumTarihi?: string;
  formNo: string;
  tezgah?: MachineInfo;
  cnc?: CncInfo;
  firma?: string;
  ilgili?: string;
  adres?: string;
  telefon?: string;
  faks?: string;
  gsm?: string;
  eposta?: string;
  kurulumuYapan?: string;
  teslimAlan?: string;
  kurulumYeri?: string;
  sure?: string;
  checks?: Array<{ label: string; status?: "done" | "not_done"; note?: string }>;
  problem?: { hasProblem?: boolean; note?: string; actionNote?: string };
  notlar?: string;
}

const INSTALL_CHECKS = [
  "Tezgah Montajı",
  "Tezgahın Dengeye Alınması",
  "Elektrik Bağlantısı",
  "Yağlama Sistemi Kontrolü",
  "Soğutma Sistemi Kontrolü",
  "Hidrolik Sistemi Kontrolü",
  "Cnc Parametreleri Kontrolü",
  "Tezgahın İlk Çalıştırılması",
  "Parametrelerin Yedeklenmesi",
];

const FORM_CSS = `
.page { padding: 6mm 10mm 7mm; }
.dm-logo { width: 58mm; margin-top: 1mm; }
.dm-title { font-size: 15pt; padding: 1.2mm 2mm; }
.dm-contact { font-size: 7.1pt; margin-top: 1mm; line-height: 1.35; }
.f-sec { text-align: center; font-weight: bold; font-size: 10pt; margin: 1.1mm 0 .45mm; }
table.f { width: 100%; }
table.f td, table.f th { border: 1pt solid #000; font-size: 9.2pt; padding: .55mm 1mm; background: transparent; }
table.f td { overflow-wrap: anywhere; word-break: break-word; }
table.f td.lbl { width: 28mm; }
table.f td.val { font-style: italic; }
.f-cols { display: flex; gap: 4mm; }
.f-cols > div { flex: 1; }
.f-boxes { display: flex; gap: 7mm; margin-top: 3.5mm; }
.f-box { flex: 1; }
.f-box .cap { border: 1pt solid #000; text-align: center; font-weight: bold; font-size: 9pt; padding: .8mm; }
.f-box .bod { border: 1pt solid #000; border-top: 0; height: 6.5mm; text-align: center; font-size: 10.2pt; padding-top: .9mm; }
.f-box .red { color: #c00000; font-family: "Courier New", monospace; font-weight: bold; letter-spacing: 1px; }
.cb { font-family: "Segoe UI Symbol", "Arial Unicode MS", sans-serif; font-size: 9.8pt; }
table.f-check th { font-weight: bold; }
table.f-check td.c { text-align: center; width: 23mm; }
table.f-check td.n { width: 58mm; }
.f-problem td.lbl { width: 34mm; }
.f-problem td { font-size: 8.8pt; padding: .45mm 1mm; }
.f-choice { display: inline-block; margin-right: 8mm; white-space: nowrap; }
.f-sign { display: flex; gap: 4mm; margin-top: 1.5mm; }
.f-sign > div { flex: 1; border: 1.4pt solid #000; padding: 1mm 1.5mm 1.8mm; }
.f-sign .cap { font-weight: bold; font-size: 9.8pt; border-bottom: 1pt solid #000; margin: -1.2mm -1.5mm 1.2mm; padding: .8mm 1.5mm; }
.f-sign .ln { display: grid; grid-template-columns: 23mm 4mm 1fr; font-size: 9.2pt; font-weight: bold; margin-top: 1.2mm; }
.f-sign .ln .v { font-weight: normal; font-style: italic; }
.form-page-no { position: absolute; right: 10mm; bottom: 7mm; z-index: 2; font-size: 8pt; }
.f-long-text { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
`;

export function installationFormDoc(d: InstallationPrintData, assetBase: string): PrintDocument {
  const t = d.tezgah ?? {};
  const c = d.cnc ?? {};
  const cb = (on: boolean) => `<span class="cb">${on ? "&#9745;" : "&#9744;"}</span>`;
  const checks: NonNullable<InstallationPrintData["checks"]> = d.checks?.length ? d.checks : INSTALL_CHECKS.map((label) => ({ label }));
  const addressChunks = chunkText(d.adres, 450);
  const checkPages = chunkByWeight(checks, 12, (check) => Math.max(1, `${check.label} ${check.note ?? ""}`.length / 80)).map((pageChecks) => `
    <div class="f-sec" style="margin-top:3mm">TEZGAH KONTROL ÇİZELGESİ</div>
    <table class="f f-check">
      <tr><th>Açıklama</th><th style="width:26mm">Tamamlandı</th><th style="width:30mm">Tamamlanmadı</th><th class="n">Not</th></tr>
      ${pageChecks.map((row) => `<tr><td>${esc(row.label)}</td><td class="c">${cb(row.status === "done")}</td><td class="c">${cb(row.status === "not_done")}</td><td class="n">${esc(row.note ?? "")}</td></tr>`).join("")}
    </table>`);
  const problemText = d.problem ? [
    `Problem var mı?: ${d.problem.hasProblem === true ? "Evet" : d.problem.hasProblem === false ? "Hayır" : "Belirtilmedi"}`,
    d.problem.note ? `Açıklama: ${d.problem.note}` : "",
    d.problem.actionNote ? `Yapılan İşlem: ${d.problem.actionNote}` : "",
  ].filter(Boolean).join("\n\n") : "";
  const detailPages = [
    ...addressChunks.slice(1).map((text) => `<div class="f-sec" style="margin-top:3mm">MÜŞTERİ ADRESİ — DEVAM</div><table class="f"><tr><td class="f-long-text">${esc(text).replace(/\n/g, "<br>")}</td></tr></table>`),
    ...checkPages,
    ...chunkText(problemText).map((text) => `<div class="f-sec" style="margin-top:3mm">KURULUMDA PROBLEM KONTROLÜ</div><table class="f"><tr><td class="f-long-text">${esc(text).replace(/\n/g, "<br>")}</td></tr></table>`),
    ...chunkText(d.notlar).map((text) => `<div class="f-sec" style="margin-top:3mm">KURULUM NOTLARI</div><table class="f"><tr><td class="f-long-text">${esc(text).replace(/\n/g, "<br>")}</td></tr></table>`),
  ];
  const totalPages = 1 + detailPages.length;
  const pageFrame = (content: string, page: number) => `<div class="page">${drmakHeader(assetBase, "KURULUM TUTANAĞI")}${drmakWatermark(assetBase)}<div class="z">${content}</div>${drmakFooter(assetBase)}<div class="form-page-no">Sayfa <b>${page}</b> / <b>${totalPages}</b></div></div>`;
  const identityPage = pageFrame(`
    <div class="f-boxes">
      <div class="f-box"><div class="cap">TEZGAH TESLİM TARİHİ</div><div class="bod val" style="font-style:italic">${blank(d.teslimTarihi)}</div></div>
      <div class="f-box"><div class="cap">TEZGAH KURULUM TARİHİ</div><div class="bod" style="font-style:italic">${blank(d.kurulumTarihi)}</div></div>
      <div class="f-box"><div class="cap">FORM NO</div><div class="bod red">${blank(d.formNo)}</div></div>
    </div>
    <div class="f-cols" style="margin-top:3mm">
      <div><div class="f-sec">TEZGAH BİLGİLERİ</div><table class="f"><tr><td class="lbl">Tezgah Markası</td><td class="val">${blank(t.marka)}</td></tr><tr><td class="lbl">Tezgah Tipi</td><td class="val">${blank(t.tip)}</td></tr><tr><td class="lbl">Tezgah Modeli</td><td class="val">${blank(t.model)}</td></tr><tr><td class="lbl">Tezgah Seri No</td><td class="val">${blank(t.seriNo)}</td></tr></table></div>
      <div><div class="f-sec">KONTROL ÜNİTESİ BİLGİLERİ</div><table class="f"><tr><td class="lbl">Cnc Markası</td><td class="val">${blank(c.marka)}</td></tr><tr><td class="lbl">Cnc Modeli</td><td class="val">${blank(c.model)}</td></tr><tr><td class="lbl">Cnc Seri No</td><td class="val">${blank(c.seriNo)}</td></tr><tr><td class="lbl">Cnc Main S/W</td><td class="val">${blank(c.mainSw)}</td></tr></table></div>
    </div>
    <div class="f-sec" style="margin-top:2mm">KULLANICI BİLGİLERİ</div>
    <table class="f"><tr><td class="lbl">Firma</td><td class="val">${blank(d.firma)}</td></tr><tr><td class="lbl">İlgili</td><td class="val">${blank(d.ilgili)}</td></tr><tr><td class="lbl">Adres</td><td class="val">${blank(addressChunks[0])}${addressChunks.length > 1 ? " <b>(devamı ek sayfada)</b>" : ""}</td></tr><tr><td class="lbl">Telefon</td><td class="val">${blank(d.telefon)}</td></tr><tr><td class="lbl">Faks</td><td class="val">${blank(d.faks)}</td></tr><tr><td class="lbl">Gsm</td><td class="val">${blank(d.gsm)}</td></tr><tr><td class="lbl">E-Posta</td><td class="val">${blank(d.eposta)}</td></tr></table>
    ${(d.kurulumYeri || d.sure) ? `<div class="f-sec" style="margin-top:2mm">KURULUM PLANI</div><table class="f">${d.kurulumYeri ? `<tr><td class="lbl">Kurulum Yeri</td><td class="val">${blank(d.kurulumYeri)}</td></tr>` : ""}${d.sure ? `<tr><td class="lbl">Süre</td><td class="val">${blank(d.sure)}</td></tr>` : ""}</table>` : ""}
  `, 1);
  const body = identityPage + detailPages.map((content, index) => {
    const isLast = index === detailPages.length - 1;
    const signatures = isLast ? `<div class="f-sign"><div><div class="cap">KURULUMU YAPAN</div><div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.kurulumuYapan)}</span></div><div class="ln" style="margin-top:3mm"><span>İmza</span><span>:</span><span class="v"></span></div></div><div><div class="cap">TEZGAHI TESLİM ALAN</div><div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.teslimAlan)}</span></div><div class="ln" style="margin-top:3mm"><span>İmza</span><span>:</span><span class="v"></span></div></div></div>` : "";
    return pageFrame(`${content}${signatures}`, index + 2);
  }).join("");
  return { title: `Kurulum Tutanağı ${d.formNo}`, css: DRMAK_CSS + FORM_CSS, body };
}

// ── 5b) SERVİS TAMAMLANDI FORMU (Kurulum Tutanağı tabanlı) ──────────────────

export interface ServiceCompletionCheck {
  label: string;
  status: "done" | "not_done" | "na";
  note?: string;
}

export interface ServiceCompletionPrintData {
  teslimTarihi?: string;
  kurulumTarihi?: string;
  formNo: string;
  tezgah?: MachineInfo;
  cnc?: CncInfo;
  firma?: string;
  ilgili?: string;
  adres?: string;
  telefon?: string;
  faks?: string;
  gsm?: string;
  eposta?: string;
  checks: ServiceCompletionCheck[];
  yapilanIsler?: string;
  notlar?: string;
  kurulumuYapan?: string;
  teslimAlan?: string;
}

export function serviceCompletionFormDoc(
  d: ServiceCompletionPrintData,
  assetBase: string
): PrintDocument {
  const t = d.tezgah ?? {};
  const c = d.cnc ?? {};
  const cb = (on: boolean) => `<span class="cb">${on ? "&#9745;" : "&#9744;"}</span>`;
  const checks = d.checks?.length ? d.checks : [];
  const addressChunks = chunkText(d.adres, 450);
  const detailPages = [
    ...addressChunks.slice(1).map((text) => `<div class="f-sec" style="margin-top:3mm">MÜŞTERİ ADRESİ — DEVAM</div><table class="f"><tr><td class="f-long-text">${esc(text).replace(/\n/g, "<br>")}</td></tr></table>`),
    ...chunkByWeight(checks, 12, (check) => Math.max(1, `${check.label} ${check.note ?? ""}`.length / 80)).map((pageChecks) => `<div class="f-sec" style="margin-top:3mm">SERVİS KONTROL ÇİZELGESİ</div><table class="f f-check"><tr><th>Açıklama</th><th style="width:22mm">Tamamlandı</th><th style="width:26mm">Tamamlanmadı</th><th style="width:18mm">N/A</th><th class="n">Not</th></tr>${pageChecks.map((row) => `<tr><td>${esc(row.label)}</td><td class="c">${cb(row.status === "done")}</td><td class="c">${cb(row.status === "not_done")}</td><td class="c">${cb(row.status === "na")}</td><td class="n">${esc(row.note ?? "")}</td></tr>`).join("")}</table>`),
    ...chunkText(d.yapilanIsler).map((text) => `<div class="f-sec" style="margin-top:3mm">YAPILAN İŞLER</div><table class="f"><tr><td class="f-long-text">${esc(text).replace(/\n/g, "<br>")}</td></tr></table>`),
    ...chunkText(d.notlar).map((text) => `<div class="f-sec" style="margin-top:3mm">NOTLAR</div><table class="f"><tr><td class="f-long-text">${esc(text).replace(/\n/g, "<br>")}</td></tr></table>`),
  ];
  const totalPages = 1 + detailPages.length;
  const pageFrame = (content: string, page: number) => `<div class="page">${drmakHeader(assetBase, "SERVİS TAMAMLAMA TUTANAĞI")}${drmakWatermark(assetBase)}<div class="z">${content}</div>${drmakFooter(assetBase)}<div class="form-page-no">Sayfa <b>${page}</b> / <b>${totalPages}</b></div></div>`;
  const identityPage = pageFrame(`
    <div class="f-boxes"><div class="f-box"><div class="cap">TEZGAH TESLİM TARİHİ</div><div class="bod val" style="font-style:italic">${blank(d.teslimTarihi)}</div></div><div class="f-box"><div class="cap">SERVİS / KURULUM TARİHİ</div><div class="bod" style="font-style:italic">${blank(d.kurulumTarihi)}</div></div><div class="f-box"><div class="cap">FORM NO</div><div class="bod red">${blank(d.formNo)}</div></div></div>
    <div class="f-cols" style="margin-top:6mm">
      <div><div class="f-sec">TEZGAH BİLGİLERİ</div><table class="f"><tr><td class="lbl">Tezgah Markası</td><td class="val">${blank(t.marka)}</td></tr><tr><td class="lbl">Tezgah Tipi</td><td class="val">${blank(t.tip)}</td></tr><tr><td class="lbl">Tezgah Modeli</td><td class="val">${blank(t.model)}</td></tr><tr><td class="lbl">Tezgah Seri No</td><td class="val">${blank(t.seriNo)}</td></tr></table></div>
      <div><div class="f-sec">KONTROL ÜNİTESİ BİLGİLERİ</div><table class="f"><tr><td class="lbl">Cnc Markası</td><td class="val">${blank(c.marka)}</td></tr><tr><td class="lbl">Cnc Modeli</td><td class="val">${blank(c.model)}</td></tr><tr><td class="lbl">Cnc Seri No</td><td class="val">${blank(c.seriNo)}</td></tr><tr><td class="lbl">Cnc Main S/W</td><td class="val">${blank(c.mainSw)}</td></tr></table></div>
    </div>
    <div class="f-sec" style="margin-top:4mm">KULLANICI BİLGİLERİ</div>
    <table class="f"><tr><td class="lbl">Firma</td><td class="val">${blank(d.firma)}</td></tr><tr><td class="lbl">İlgili</td><td class="val">${blank(d.ilgili)}</td></tr><tr><td class="lbl">Adres</td><td class="val">${blank(addressChunks[0])}${addressChunks.length > 1 ? " <b>(devamı ek sayfada)</b>" : ""}</td></tr><tr><td class="lbl">Telefon</td><td class="val">${blank(d.telefon)}</td></tr><tr><td class="lbl">Faks</td><td class="val">${blank(d.faks)}</td></tr><tr><td class="lbl">Gsm</td><td class="val">${blank(d.gsm)}</td></tr><tr><td class="lbl">E-Posta</td><td class="val">${blank(d.eposta)}</td></tr></table>
  `, 1);
  const body = identityPage + detailPages.map((content, index) => {
    const signatures = index === detailPages.length - 1 ? `<div class="f-sign"><div><div class="cap">SERVİSİ YAPAN</div><div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.kurulumuYapan)}</span></div><div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div></div><div><div class="cap">TEZGAHI TESLİM ALAN</div><div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.teslimAlan)}</span></div><div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div></div></div>` : "";
    return pageFrame(`${content}${signatures}`, index + 2);
  }).join("");
  return { title: `Servis Tamamlama Tutanağı ${d.formNo}`, css: DRMAK_CSS + FORM_CSS, body };
}

// ── 6) SERVİS FORMU (DR.MAK) ────────────────────────────────────────────────

export interface ServiceFormPart {
  ad: string;
  miktar?: string;
  birimFiyat?: number | null;
  tutar?: number | null;
}

export interface ServiceFormPrintData {
  firma?: string;
  ilgili?: string;
  adres?: string;
  tel?: string;
  faks?: string;
  gsm?: string;
  eposta?: string;
  vergiDairesi?: string;
  vergiNo?: string;
  formNo: string;
  tarih?: string;
  tezgah?: MachineInfo;
  cnc?: CncInfo;
  sikayet?: string;
  servisTipi?: "montaj" | "ariza" | "periyodik";
  yukumluluk?: "ucretli" | "garanti" | "bakim";
  islemler?: string[];
  parcalar?: ServiceFormPart[];
  servisUcreti?: number | null;
  ulasimUcreti?: number | null;
  currency?: CurrencyCode;
  notlar?: string[];
  servisYetkilisi?: string;
  firmaYetkilisi?: string;
}

const SERVICE_FORM_CSS = `
table.sf-top { width: 100%; margin-top: 1.5mm; }
table.sf-top td { border: 1pt solid #000; font-size: 9pt; padding: .6mm 1.6mm; }
table.sf-top td.lbl { font-weight: bold; width: 16mm; white-space: nowrap; }
table.sf-top td.val { font-style: italic; }
table.sf-top td.formno { width: 24mm; text-align: center; vertical-align: top; }
.sf-complaint { display: flex; gap: 4mm; margin-top: 1.5mm; }
.sf-complaint .box { border: 1pt solid #000; min-height: 14mm; padding: 1.2mm; font-size: 9pt; font-style: italic; }
.sf-chk { font-size: 9pt; }
.sf-chk div { border: 1pt solid #000; border-top: 0; padding: .35mm 1.5mm; }
.sf-chk div:first-of-type { border-top: 1pt solid #000; }
.sf-lines { border: 1pt solid #000; border-bottom: 0; margin-top: .8mm; }
.sf-lines .ln { border-bottom: 1pt solid #000; min-height: 4.7mm; height: auto; line-height: 1.25; font-size: 9pt; font-style: italic; padding: .6mm 1.5mm; overflow: visible; overflow-wrap: anywhere; word-break: break-word; }
table.sf-parts { width: 100%; margin-top: 2mm; }
table.sf-parts th, table.sf-parts td { border: 1pt solid #000; font-size: 9pt; padding: .5mm 1.6mm; }
table.sf-parts td.no { width: 6mm; text-align: center; }
table.sf-parts td.c { text-align: center; }
table.sf-parts td.r { text-align: right; font-style: italic; }
table.sf-parts td.sumlbl { text-align: center; font-weight: bold; border-left: 0; border-bottom: 0; }
table.sf-parts .toplbl { text-align: right; font-weight: bold; border: 0; font-size: 10.5pt; }
table.sf-parts .toplbl small { font-weight: normal; font-size: 8pt; }
`;

export function serviceFormDoc(d: ServiceFormPrintData, assetBase: string): PrintDocument {
  const t = d.tezgah ?? {};
  const c = d.cnc ?? {};
  const cur = d.currency ?? "TRY";
  const cb = (on: boolean) => `<span class="cb">${on ? "&#9745;" : "&#9744;"}</span>`;
  const parts = (d.parcalar ?? []).map((part) => ({ ...part }));
  const quantity = (value?: string) => {
    const parsed = Number(String(value ?? "1").trim().replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  };
  const partAmount = (part: ServiceFormPart) =>
    part.tutar ?? ((part.birimFiyat ?? 0) * quantity(part.miktar));
  const toplam =
    parts.reduce((sum, part) => sum + partAmount(part), 0) +
    (d.servisUcreti ?? 0) +
    (d.ulasimUcreti ?? 0);
  const addressChunks = chunkText(d.adres, 360);
  const complaintChunks = chunkText(d.sikayet, 600);
  const operationChunks = chunkByWeight(d.islemler ?? [], 8, (operation) => Math.max(1, operation.length / 160));
  const partChunks = chunkByWeight(parts, 6, (part) => Math.max(1, part.ad.length / 120));
  const printableNotes = [
    ...addressChunks.slice(1).map((value) => `Müşteri adresi devamı: ${value}`),
    ...complaintChunks.slice(1).map((value) => `Müşteri şikayeti devamı: ${value}`),
    ...(d.notlar ?? []).flatMap((note) => chunkText(note, 1000)),
  ];
  const noteChunks = printableNotes.length ? chunkByWeight(printableNotes, 8, (note) => Math.max(1, note.length / 240)) : [];
  const totalPages = operationChunks.length + partChunks.length + noteChunks.length;
  const pages: string[] = [];

  const identity = (compact = false) => `
    <table class="sf-top">
      <tr>
        <td class="lbl">Firma</td><td class="val" style="width:44mm">${blank(d.firma)}</td>
        <td class="lbl" style="width:12mm">İlgili</td><td class="val">${blank(d.ilgili)}</td>
        <td class="lbl formno" rowspan="2">Form No.<br><br><span style="font-style:italic">${blank(d.formNo)}</span></td>
      </tr>
      <tr><td class="lbl">Adres</td><td class="val" colspan="3">${blank(addressChunks[0])}${addressChunks.length > 1 ? " <b>(devamı notlar sayfasında)</b>" : ""}</td></tr>
      <tr>
        <td class="lbl">Tel.</td><td class="val">${blank(d.tel)}</td>
        <td class="lbl">Faks</td><td class="val">${blank(d.faks)}</td>
        <td class="lbl formno" rowspan="2">Tarih<br><span style="font-style:italic">${blank(d.tarih)}</span></td>
      </tr>
      <tr>
        <td class="lbl">Gsm</td><td class="val">${blank(d.gsm)}</td>
        <td class="lbl">E-Posta</td><td class="val">${blank(d.eposta)}</td>
      </tr>
      <tr>
        <td class="lbl">Vergi D.</td><td class="val">${blank(d.vergiDairesi)}</td>
        <td class="lbl">Vergi N.</td><td class="val">${blank(d.vergiNo)}</td>
        <td style="border:0"></td>
      </tr>
    </table>${compact ? "" : `
    <div class="f-cols" style="margin-top:1.5mm">
      <div>
        <div class="f-sec">TEZGAH BİLGİLERİ</div>
        <table class="f">
          <tr><td class="lbl">Tezgah Markası</td><td class="val">${blank(t.marka)}</td></tr>
          <tr><td class="lbl">Tezgah Tipi</td><td class="val">${blank(t.tip)}</td></tr>
          <tr><td class="lbl">Tezgah Modeli</td><td class="val">${blank(t.model)}</td></tr>
          <tr><td class="lbl">Tezgah Seri No</td><td class="val">${blank(t.seriNo)}</td></tr>
        </table>
      </div>
      <div>
        <div class="f-sec">&nbsp;</div>
        <table class="f">
          <tr><td class="lbl">Cnc Markası</td><td class="val">${blank(c.marka)}</td></tr>
          <tr><td class="lbl">Cnc Modeli</td><td class="val">${blank(c.model)}</td></tr>
          <tr><td class="lbl">Cnc Seri No</td><td class="val">${blank(c.seriNo)}</td></tr>
          <tr><td class="lbl">Cnc Main S/W</td><td class="val">${blank(c.mainSw)}</td></tr>
        </table>
      </div>
    </div>`}`;

  const signatures = `
    <div class="f-sign">
      <div>
        <div class="cap">SERVİS YETKİLİSİ</div>
        <div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.servisYetkilisi)}</span></div>
        <div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div>
      </div>
      <div>
        <div class="cap">FİRMA YETKİLİSİ</div>
        <div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.firmaYetkilisi)}</span></div>
        <div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div>
      </div>
    </div>`;

  operationChunks.forEach((chunk, chunkIndex) => {
    const rows = [...chunk];
    while (rows.length < 3) rows.push("");
    const currentPage = pages.length + 1;
    pages.push(`
<div class="page">
  ${drmakHeader(assetBase, chunkIndex === 0 ? "SERVİS FORMU" : "SERVİS FORMU — İŞLEMLER")}
  ${drmakWatermark(assetBase)}
  <div class="z">
    ${identity(chunkIndex > 0)}
    ${chunkIndex === 0 ? `
    <div class="sf-complaint">
      <div style="flex:1">
        <div class="f-sec">MÜŞTERİ ŞİKAYETİ</div>
        <div class="box">${blank(complaintChunks[0])}${complaintChunks.length > 1 ? " <b>(devamı notlar sayfasında)</b>" : ""}</div>
      </div>
      <div style="width:34mm">
        <div class="f-sec">SERVİS TİPİ</div>
        <div class="sf-chk">
          <div>${cb(d.servisTipi === "montaj")} Montaj</div>
          <div>${cb(d.servisTipi === "ariza")} Arıza</div>
          <div>${cb(d.servisTipi === "periyodik")} Periyodik B.</div>
          <div>${cb(false)}</div>
        </div>
      </div>
      <div style="width:34mm">
        <div class="f-sec">YÜKÜMLÜLÜK</div>
        <div class="sf-chk">
          <div>${cb(d.yukumluluk === "ucretli")} Ücretli</div>
          <div>${cb(d.yukumluluk === "garanti")} Garanti</div>
          <div>${cb(d.yukumluluk === "bakim")} Bakım Anl.</div>
          <div>${cb(false)}</div>
        </div>
      </div>
    </div>` : ""}
    <div class="f-sec">YAPILAN İŞLEMLER</div>
    <div class="sf-lines">
      ${rows.map((x) => `<div class="ln">${blank(x)}</div>`).join("")}
    </div>
  </div>
  ${pageNo(currentPage, totalPages)}
  ${drmakFooter(assetBase)}
</div>`);
  });

  partChunks.forEach((chunk, chunkIndex) => {
    const rows = [...chunk];
    while (rows.length < 3) rows.push({ ad: "" });
    const isLastPartPage = chunkIndex === partChunks.length - 1;
    const isFinalPage = isLastPartPage && noteChunks.length === 0;
    const currentPage = pages.length + 1;
    pages.push(`
<div class="page">
  ${drmakHeader(assetBase, "SERVİS FORMU — PARÇALAR")}
  ${drmakWatermark(assetBase)}
  <div class="z">
    ${identity(true)}
    <table class="sf-parts">
      <tr>
        <th colspan="2">DEĞİŞEN PARÇALAR</th>
        <th style="width:20mm">MİKTAR</th>
        <th style="width:30mm">BİRİM FİYATI</th>
        <th style="width:32mm">TUTARI</th>
      </tr>
      ${rows.map((p) => `
      <tr>
        <td class="no">${p.ad ? parts.indexOf(p) + 1 : ""}</td>
        <td class="val" style="font-style:italic">${blank(p.ad)}</td>
        <td class="c">${blank(p.miktar)}</td>
        <td class="r">${p.birimFiyat != null ? fmtMoney(p.birimFiyat, cur) : ""}</td>
        <td class="r">${p.ad ? fmtMoney(partAmount(p), cur) : ""}</td>
      </tr>`).join("")}
      ${isLastPartPage ? `
      <tr><td class="sumlbl" colspan="4" style="border:1pt solid #000">SERVİS ÜCRETİ (İŞÇİLİK)</td><td class="r">${d.servisUcreti != null ? fmtMoney(d.servisUcreti, cur) : ""}</td></tr>
      <tr><td class="sumlbl" colspan="4" style="border:1pt solid #000">ULAŞIM ÜCRETİ</td><td class="r">${d.ulasimUcreti != null ? fmtMoney(d.ulasimUcreti, cur) : ""}</td></tr>
      <tr>
        <td colspan="4" class="toplbl">TOPLAM<br><small>(K.D.V. Hariç)</small></td>
        <td class="r" style="font-weight:bold">${toplam ? fmtMoney(toplam, cur) : ""}</td>
      </tr>
      ` : ""}
    </table>
    ${isFinalPage ? signatures : ""}
  </div>
  ${pageNo(currentPage, totalPages)}
  ${drmakFooter(assetBase)}
</div>`);
  });

  noteChunks.forEach((chunk, chunkIndex) => {
    const isFinalPage = chunkIndex === noteChunks.length - 1;
    const currentPage = pages.length + 1;
    pages.push(`
<div class="page">
  ${drmakHeader(assetBase, "SERVİS FORMU — NOTLAR")}
  ${drmakWatermark(assetBase)}
  <div class="z">
    ${identity(true)}
    <div style="margin-top:4mm; font-size:9pt;">
      <div style="font-weight:bold; text-decoration:underline; margin-bottom:2mm;">NOTLAR:</div>
      <ol style="margin:0; padding-left:5mm;">
        ${chunk.map((note) => `<li style="margin-bottom:2mm; text-align:justify;">${esc(note)}</li>`).join("")}
      </ol>
    </div>
    ${isFinalPage ? signatures : ""}
  </div>
  ${pageNo(currentPage, totalPages)}
  ${drmakFooter(assetBase)}
</div>`);
  });

  return {
    title: `Servis Formu ${d.formNo}`,
    css: DRMAK_CSS + FORM_CSS + SERVICE_FORM_CSS,
    body: pages.join("\n"),
  };
}

// ── 7) SEVK İRSALİYESİ (HAKSAN antetli) ─────────────────────────────────────

export interface DispatchNoteItem {
  description: string;
  brandModel?: string;
  serialNumber?: string;
  quantity?: number | string;
  unit?: string;
}

export interface DispatchNotePrintData {
  irsaliyeNo: string;
  tarih?: string;
  carrier?: string;
  trackingNo?: string;
  origin?: string;
  destination?: string;
  incoterm?: string;
  eta?: string;
  firma?: string;
  ilgili?: string;
  adres?: string;
  vergiDairesi?: string;
  vergiNo?: string;
  items: DispatchNoteItem[];
  notlar?: string;
}

const DISPATCH_CSS = `
.dn-title { text-align:center; font-size:17pt; font-weight:bold; letter-spacing:1px; margin:5mm 0 3mm; }
.dn-grid { display:flex; gap:6mm; margin-bottom:1mm; }
.dn-grid > div { flex:1; }
table.dn { width:100%; }
table.dn td, table.dn th { border:1pt solid #000; font-size:9.6pt; padding:1.3mm 2mm; vertical-align:top; }
table.dn th { background:#efefef; font-weight:bold; }
table.dn.kv td.k { width:32mm; font-weight:bold; background:#f7f7f7; }
.dn-items th { text-align:center; }
.dn-items td.c { text-align:center; }
.dn-sec { font-weight:bold; font-size:10pt; margin:3mm 0 1mm; }
.dn-foot { display:flex; gap:10mm; margin-top:8mm; }
.dn-foot > div { flex:1; border-top:1pt solid #000; padding-top:2mm; font-size:9.5pt; font-weight:bold; min-height:20mm; }
.dn-foot .v { font-weight:normal; font-style:italic; }
.dn-company { margin-top:auto; border-top:1.5pt solid #c00000; padding-top:1.6mm; font-size:8.2pt; line-height:1.5; color:#222; }
.dn-company b { color:#000; }
`;

export function dispatchNoteDoc(d: DispatchNotePrintData, assetBase: string): PrintDocument {
  const rota = [blank(d.origin), blank(d.destination)].filter(Boolean).join(" → ");
  const vergi = [blank(d.vergiDairesi), blank(d.vergiNo)].filter(Boolean).join(" / ");
  const chunks = chunkByWeight(d.items, 12, (item) => Math.max(1, `${item.description} ${item.brandModel ?? ""} ${item.serialNumber ?? ""}`.length / 95));
  const noteFragments = chunkText(d.notlar, 1200);
  const totalPages = chunks.length + noteFragments.length;
  const pages = chunks.map((chunk, chunkIndex) => {
    const rows = chunk.length
      ? chunk.map((it) => `
        <tr>
          <td class="c">${d.items.indexOf(it) + 1}</td>
          <td>${blank(it.description)}</td>
          <td>${blank(it.brandModel)}</td>
          <td class="c">${blank(it.serialNumber)}</td>
          <td class="c">${blank(it.quantity ?? 1)} ${blank(it.unit) || "adet"}</td>
        </tr>`).join("")
      : `<tr><td class="c" colspan="5" style="font-style:italic">Kalem yok</td></tr>`;
    const isFinalPage = chunkIndex === chunks.length - 1 && noteFragments.length === 0;
    return `
<div class="page">
  ${haksanHeader(assetBase)}
  <div class="dn-title">SEVK İRSALİYESİ${chunkIndex > 0 ? " — DEVAM" : ""}</div>

  <div class="dn-grid">
    <table class="dn kv">
      <tr><td class="k">İrsaliye No</td><td>${blank(d.irsaliyeNo)}</td></tr>
      <tr><td class="k">Tarih</td><td>${blank(trLongDate(d.tarih))}</td></tr>
      <tr><td class="k">Taşıyıcı</td><td>${blank(d.carrier)}</td></tr>
      <tr><td class="k">Takip No</td><td>${blank(d.trackingNo)}</td></tr>
    </table>
    <table class="dn kv">
      <tr><td class="k">Rota</td><td>${rota}</td></tr>
      <tr><td class="k">Teslim Şekli</td><td>${blank(d.incoterm)}</td></tr>
      <tr><td class="k">Tahmini Varış</td><td>${blank(trLongDate(d.eta))}</td></tr>
      <tr><td class="k">&nbsp;</td><td></td></tr>
    </table>
  </div>

  <div class="dn-sec">ALICI / MÜŞTERİ</div>
  <table class="dn kv">
    <tr><td class="k">Firma</td><td>${blank(d.firma)}</td></tr>
    <tr><td class="k">İlgili</td><td>${blank(d.ilgili)}</td></tr>
    <tr><td class="k">Adres</td><td>${blank(d.adres)}</td></tr>
    <tr><td class="k">Vergi D. / No</td><td>${vergi}</td></tr>
  </table>

  <div class="dn-sec">SEVK EDİLEN KALEMLER</div>
  <table class="dn dn-items">
    <tr><th style="width:10mm">#</th><th>Açıklama</th><th style="width:40mm">Marka / Model</th><th style="width:38mm">Seri No</th><th style="width:26mm">Miktar</th></tr>
    ${rows}
  </table>

  ${isFinalPage ? `<div class="dn-foot">
    <div>TESLİM EDEN<div class="v" style="margin-top:9mm">İmza / Kaşe</div></div>
    <div>TESLİM ALAN<div class="v" style="margin-top:9mm">Ad, Soyad / İmza</div></div>
  </div>` : ""}

  ${pageNo(chunkIndex + 1, totalPages)}
  ${isFinalPage ? `<div class="dn-company">
    <b>${esc(HAKSAN.unvanUzun)}</b><br>
    ${esc(HAKSAN.adres1)} ${esc(HAKSAN.adres2)} &nbsp;·&nbsp; Tel: ${esc(HAKSAN.tel)} &nbsp; Faks: ${esc(HAKSAN.faks)}<br>
    Vergi Dairesi: ${esc(HAKSAN.vergiDairesi)} &nbsp; Vergi No: ${esc(HAKSAN.vergiNo)} &nbsp;·&nbsp; ${esc(HAKSAN.eposta)}
  </div>` : ""}
</div>`;
  });
  noteFragments.forEach((note, noteIndex) => {
    const currentPage = chunks.length + noteIndex + 1;
    const isFinalPage = noteIndex === noteFragments.length - 1;
    pages.push(`
<div class="page">
  ${haksanHeader(assetBase)}
  <div class="dn-title">SEVK İRSALİYESİ — NOTLAR</div>
  <table class="dn kv"><tr><td class="k">İrsaliye No</td><td>${blank(d.irsaliyeNo)}</td></tr><tr><td class="k">Firma</td><td>${blank(d.firma)}</td></tr><tr><td class="k">Adres</td><td>${blank(d.adres)}</td></tr></table>
  <div class="dn-sec">Notlar${noteIndex > 0 ? " — Devam" : ""}</div>
  <div style="font-size:9.5pt;white-space:pre-wrap;overflow-wrap:anywhere">${esc(note)}</div>
  ${isFinalPage ? `<div class="dn-foot"><div>TESLİM EDEN<div class="v" style="margin-top:9mm">İmza / Kaşe</div></div><div>TESLİM ALAN<div class="v" style="margin-top:9mm">Ad, Soyad / İmza</div></div></div>` : ""}
  ${pageNo(currentPage, totalPages)}
  ${isFinalPage ? `<div class="dn-company"><b>${esc(HAKSAN.unvanUzun)}</b><br>${esc(HAKSAN.adres1)} ${esc(HAKSAN.adres2)} &nbsp;·&nbsp; Tel: ${esc(HAKSAN.tel)} &nbsp; Faks: ${esc(HAKSAN.faks)}<br>Vergi Dairesi: ${esc(HAKSAN.vergiDairesi)} &nbsp; Vergi No: ${esc(HAKSAN.vergiNo)} &nbsp;·&nbsp; ${esc(HAKSAN.eposta)}</div>` : ""}
</div>`);
  });
  const body = pages.join("\n");
  return { title: `Sevk İrsaliyesi ${d.irsaliyeNo}`, css: DISPATCH_CSS, body };
}

// ── 8) TESLİM TUTANAĞI (DR.MAK form stili) ──────────────────────────────────

export interface DeliveryReceiptItem {
  description: string;
  brandModel?: string;
  serialNumber?: string;
  quantity?: number | string;
}

export interface DeliveryReceiptPrintData {
  formNo: string;
  teslimTarihi?: string;
  firma?: string;
  ilgili?: string;
  adres?: string;
  telefon?: string;
  gsm?: string;
  eposta?: string;
  items: DeliveryReceiptItem[];
  teslimEden?: string;
  teslimAlan?: string;
  notlar?: string;
}

export function deliveryReceiptDoc(d: DeliveryReceiptPrintData, assetBase: string): PrintDocument {
  const chunks = chunkByWeight(d.items, 12, (item) => Math.max(1, `${item.description} ${item.brandModel ?? ""} ${item.serialNumber ?? ""}`.length / 95));
  const noteFragments = chunkText(d.notlar, 1200);
  const totalPages = chunks.length + noteFragments.length;
  const pages = chunks.map((chunk, chunkIndex) => {
    const rows = chunk.length
      ? chunk.map((it) => `
        <tr>
          <td class="c">${d.items.indexOf(it) + 1}</td>
          <td>${blank(it.description)}</td>
          <td>${blank(it.brandModel)}</td>
          <td class="c">${blank(it.serialNumber)}</td>
          <td class="c">${blank(it.quantity ?? 1)}</td>
        </tr>`).join("")
      : `<tr><td class="c" colspan="5" style="font-style:italic">Teslim edilen cihaz yok</td></tr>`;
    const isFinalPage = chunkIndex === chunks.length - 1 && noteFragments.length === 0;
    return `
<div class="page">
  ${drmakHeader(assetBase, chunkIndex === 0 ? "TESLİM TUTANAĞI" : "TESLİM TUTANAĞI — DEVAM")}
  ${drmakWatermark(assetBase)}
  <div class="z">
    <div class="f-boxes">
      <div class="f-box"><div class="cap">TESLİM TARİHİ</div><div class="bod" style="font-style:italic">${blank(d.teslimTarihi)}</div></div>
      <div class="f-box"><div class="cap">FORM NO</div><div class="bod red">${blank(d.formNo)}</div></div>
    </div>

    <div class="f-sec" style="margin-top:5mm">MÜŞTERİ BİLGİLERİ</div>
    <table class="f">
      <tr><td class="lbl">Firma</td><td class="val">${blank(d.firma)}</td></tr>
      <tr><td class="lbl">İlgili</td><td class="val">${blank(d.ilgili)}</td></tr>
      <tr><td class="lbl">Adres</td><td class="val">${blank(d.adres)}</td></tr>
      <tr><td class="lbl">Telefon</td><td class="val">${blank(d.telefon)}</td></tr>
      <tr><td class="lbl">Gsm</td><td class="val">${blank(d.gsm)}</td></tr>
      <tr><td class="lbl">E-Posta</td><td class="val">${blank(d.eposta)}</td></tr>
    </table>

    <div class="f-sec" style="margin-top:4mm">TESLİM EDİLEN CİHAZLAR</div>
    <table class="f f-check">
      <tr><th style="width:12mm">#</th><th>Açıklama</th><th style="width:44mm">Marka / Model</th><th style="width:40mm">Seri No</th><th style="width:20mm">Adet</th></tr>
      ${rows}
    </table>

    ${isFinalPage ? `<div class="f-sign">
      <div>
        <div class="cap">TESLİM EDEN</div>
        <div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.teslimEden)}</span></div>
        <div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div>
      </div>
      <div>
        <div class="cap">TESLİM ALAN</div>
        <div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.teslimAlan)}</span></div>
        <div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div>
      </div>
    </div>` : ""}
  </div>
  ${pageNo(chunkIndex + 1, totalPages)}
  ${drmakFooter(assetBase)}
</div>`;
  });
  noteFragments.forEach((note, noteIndex) => {
    const currentPage = chunks.length + noteIndex + 1;
    const isFinalPage = noteIndex === noteFragments.length - 1;
    pages.push(`
<div class="page">
  ${drmakHeader(assetBase, "TESLİM TUTANAĞI — NOTLAR")}
  ${drmakWatermark(assetBase)}
  <div class="z">
    <div class="f-boxes"><div class="f-box"><div class="cap">TESLİM TARİHİ</div><div class="bod" style="font-style:italic">${blank(d.teslimTarihi)}</div></div><div class="f-box"><div class="cap">FORM NO</div><div class="bod red">${blank(d.formNo)}</div></div></div>
    <div class="f-sec" style="margin-top:4mm">NOTLAR${noteIndex > 0 ? " — DEVAM" : ""}</div>
    <div class="f-long-text" style="font-size:10pt;border:1pt solid #000;padding:1.6mm">${esc(note)}</div>
    ${isFinalPage ? `<div class="f-sign"><div><div class="cap">TESLİM EDEN</div><div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.teslimEden)}</span></div><div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div></div><div><div class="cap">TESLİM ALAN</div><div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.teslimAlan)}</span></div><div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div></div></div>` : ""}
  </div>
  ${pageNo(currentPage, totalPages)}
  ${drmakFooter(assetBase)}
</div>`);
  });
  const body = pages.join("\n");
  return { title: `Teslim Tutanağı ${d.formNo}`, css: DRMAK_CSS + FORM_CSS, body };
}
