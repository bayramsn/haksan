// Haksan CRM yazdırılabilir belge şablonları. Sayfa düzenleri orijinal Word
// çıktılarından (Proforma, Fiyat Teklifi, Satış Sözleşmesi, Kurulum Tutanağı,
// Servis Formu) birebir taşınmıştır; logolar public/print altındaki orijinal
// görsellerdir.

import {
  PrintDocument, CurrencyCode, esc, blank, fmtMoney, tutarYaziyla, trLongDate,
  haksanHeader, drmakHeader, drmakFooter, drmakWatermark, DRMAK_CSS,
} from "./core";
import { QuoteNoteVariant } from "./notes";

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
  mensei?: string;
  gtip?: string;
  birim: string;
  birimFiyati?: number | null;
  tutar: number;
}

export interface ProformaPrintData {
  firma: string;
  ilgili?: string;
  mobil?: string;
  adres?: string;
  tel?: string;
  faks?: string;
  vergiDairesi?: string;
  vergiNo?: string;
  tarih: string;
  belgeNo: string;
  items: ProformaItem[];
  kdvOran: number;
  kdvTutar: number;
  currency: CurrencyCode;
  notlar: string[];
}

const PROFORMA_CSS = `
.pf-top { display: flex; gap: 6mm; margin-top: 4mm; }
.pf-left { flex: 1; }
.pf-right { width: 62mm; }
.pf-title { font-size: 24pt; font-weight: bold; text-align: center; line-height: 1.05; margin-bottom: 5mm; letter-spacing: .5px; }
table.pf-info { width: 100%; }
table.pf-info td { border: 1.4pt solid #000; padding: 1mm 1.8mm; font-size: 10.5pt; }
table.pf-info td.lbl { font-weight: bold; width: 16mm; white-space: nowrap; font-style: normal; }
table.pf-info td.val { font-style: italic; font-weight: bold; }
table.pf-info td.c { text-align: center; }
.pf-gap { height: 4.5mm; }
table.pf-items { width: 100%; margin-top: 4mm; }
table.pf-items th { border: 1.4pt solid #000; font-size: 10.5pt; padding: 1.6mm 1mm; }
table.pf-items td { border: 1.4pt solid #000; vertical-align: top; padding: 2mm; font-size: 10.5pt; }
table.pf-items .desc { width: 50%; }
table.pf-items .d1 { font-weight: bold; font-style: italic; margin-bottom: 1.2mm; }
table.pf-items table.meta { font-size: 9.5pt; font-style: italic; }
table.pf-items table.meta td { border: 0; padding: .2mm 0; }
table.pf-items table.meta td:first-child { width: 22mm; }
table.pf-items .c { text-align: center; font-style: italic; }
table.pf-items .r { text-align: right; font-style: italic; }
table.pf-items tr.itemrow > td { height: 27mm; }
table.pf-items table.meta td { height: auto; }
.pf-sum { display: flex; margin-top: 0; }
.pf-yalniz { flex: 1; font-style: italic; font-weight: bold; font-size: 10.5pt; padding: 2mm 1mm; }
table.pf-tot { width: 84mm; }
table.pf-tot td { font-size: 10.5pt; padding: 1.6mm 1.8mm; }
table.pf-tot td.tl { font-weight: bold; text-align: right; width: 42mm; border: 0; }
table.pf-tot td.tv { border: 1.4pt solid #000; text-align: right; font-style: italic; font-weight: bold; width: 42mm; }
table.pf-tot tr.sp td { border: 0; height: 2.4mm; padding: 0; }
.pf-notes { margin-top: 4mm; font-style: italic; }
.pf-notes .nt { font-weight: bold; text-decoration: underline; font-size: 10.5pt; margin-bottom: 1.2mm; }
.pf-notes ol { margin-left: 6mm; font-size: 9.8pt; }
.pf-notes li { margin-bottom: .5mm; text-align: justify; padding-left: 1mm; font-weight: bold; }
.pf-footer { margin-top: auto; padding-top: 2mm; }
.pf-stamp { height: 22mm; display: block; margin-left: 2mm; margin-bottom: 1mm; }
table.pf-addr { font-size: 8.5pt; }
table.pf-addr td { padding: .3mm 0; vertical-align: top; }
table.pf-addr td:first-child { width: 14mm; }
table.pf-addr .b { font-weight: bold; font-size: 9pt; }
`;

export function proformaDoc(d: ProformaPrintData, assetBase: string): PrintDocument {
  const araToplam = d.items.reduce((a, i) => a + i.tutar, 0);
  const genelToplam = araToplam + d.kdvTutar;
  const meta = (i: ProformaItem) => {
    const rows: string[] = [];
    if (i.marka) rows.push(`<tr><td>Markası</td><td>${esc(i.marka)}</td></tr>`);
    if (i.mensei) rows.push(`<tr><td>Menşei</td><td>${esc(i.mensei)}</td></tr>`);
    if (i.gtip) rows.push(`<tr><td>G.T.İ.P.</td><td>${esc(i.gtip)}</td></tr>`);
    return rows.length ? `<table class="meta">${rows.join("")}</table>` : "";
  };
  const yalniz = tutarYaziyla(araToplam + d.kdvTutar, d.currency);

  const body = `
<div class="page">
  ${haksanHeader(assetBase)}
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
      </table>
    </div>
    <div class="pf-right">
      <div class="pf-title">PROFORMA<br>FATURA</div>
      <table class="pf-info">
        <tr><td class="lbl" style="width:22mm">Tarih</td><td class="val c">${blank(d.tarih)}</td></tr>
        <tr><td class="lbl" style="width:22mm">Belge No</td><td class="val c">${blank(d.belgeNo)}</td></tr>
      </table>
    </div>
  </div>

  <table class="pf-items">
    <thead>
      <tr><th>ÜRÜN AÇIKLAMASI</th><th style="width:18mm">BİRİM</th><th style="width:34mm">BİRİM FİYATI</th><th style="width:38mm">TUTARI</th></tr>
    </thead>
    <tbody>
      ${d.items.map((i) => `
      <tr class="itemrow">
        <td class="desc"><div class="d1">${esc(i.aciklama)}</div>${meta(i)}</td>
        <td class="c">${esc(i.birim)}</td>
        <td class="c">${i.birimFiyati ? fmtMoney(i.birimFiyati, d.currency) : ""}</td>
        <td class="r">${fmtMoney(i.tutar, d.currency)}</td>
      </tr>`).join("")}
    </tbody>
  </table>

  <div class="pf-sum">
    <div class="pf-yalniz">${esc(yalniz)}</div>
    <table class="pf-tot">
      <tr><td class="tl">ARA TOPLAM</td><td class="tv">${fmtMoney(araToplam, d.currency)}</td></tr>
      <tr class="sp"><td colspan="2"></td></tr>
      <tr><td class="tl">K.D.V. (%${esc(d.kdvOran)})</td><td class="tv">${fmtMoney(d.kdvTutar, d.currency)}</td></tr>
      <tr class="sp"><td colspan="2"></td></tr>
      <tr><td class="tl">GENEL TOPLAM</td><td class="tv">${fmtMoney(genelToplam, d.currency)}</td></tr>
    </table>
  </div>

  <div class="pf-notes">
    <div class="nt">NOTLAR:</div>
    <ol>${d.notlar.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>
  </div>

  <div class="pf-footer">
    <img class="pf-stamp" src="${assetBase}/haksan-stamp.png" alt="">
    <table class="pf-addr">
      <tr><td colspan="2" class="b">${esc(HAKSAN.unvan)}</td></tr>
      <tr><td>Adres</td><td>${esc(HAKSAN.adres1)}<br>${esc(HAKSAN.adres2)}</td></tr>
      <tr><td>Tel.</td><td>${esc(HAKSAN.tel)}</td></tr>
      <tr><td>Faks</td><td>${esc(HAKSAN.faks)}</td></tr>
      <tr><td>E-Posta</td><td><span class="link">${esc(HAKSAN.eposta)}</span></td></tr>
    </table>
  </div>
</div>`;

  return { title: `Proforma Fatura ${d.belgeNo}`, css: PROFORMA_CSS, body };
}

// ── 2) FİYAT TEKLİFİ ────────────────────────────────────────────────────────

export interface QuoteItem {
  urun: string;
  birim?: string;
  fiyat?: number | null;
  tutar?: number | null;
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
  projeIlgilisiEmail?: string;
  marka?: string;
  model?: string;
  tip?: string;
  imageUrl?: string;
  specs?: { key: string; value: string }[];
  standartDonanim?: string[];
  opsiyonelDonanim?: string[];
  items: QuoteItem[];
  iskonto?: number;
  kdvOran: number;
  kdvTutar: number;
  currency: CurrencyCode;
  notes: QuoteNoteVariant;
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
.q-brand { font-size: 30pt; font-weight: 900; letter-spacing: 1px; }
.q-model { font-size: 24pt; font-weight: bold; margin-top: 3mm; }
.q-type { font-size: 16pt; margin-top: 1mm; }
.q-photo { max-width: 150mm; max-height: 130mm; margin-top: 6mm; }
.q-h1 { text-align: center; font-size: 14pt; font-weight: bold; margin: 5mm 0 5mm; }
table.q-specs { width: 100%; }
table.q-specs td { border: 1pt solid #000; font-size: 10pt; padding: 1.4mm 2mm; }
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
`;

export function quoteDoc(d: QuotePrintData, assetBase: string): PrintDocument {
  const pages: string[] = [];
  const hasSpecs = (d.specs?.length ?? 0) > 0;
  const hasEquip = (d.standartDonanim?.length ?? 0) + (d.opsiyonelDonanim?.length ?? 0) > 0;
  const pageCount = 2 + (hasSpecs ? 1 : 0) + (hasEquip ? 1 : 0);
  let pageNo = 0;
  const pn = () => `<div class="pageno">Sayfa <b>${++pageNo}</b> / <b>${pageCount}</b></div>`;

  // Sayfa 1 — kapak
  pages.push(`
<div class="page">
  ${haksanHeader(assetBase)}
  <div class="q-title">FİYAT TEKLİFİ</div>
  <div class="q-top">
    <div class="q-cust">
      <div class="b" style="font-style:normal">${blank(d.firma)}</div>
      <div class="row"><span class="b">${blank(d.ilgili)}</span><span class="b">${blank(d.mobil)}</span></div>
      <div>${blank(d.adres)}</div>
      <div>Tel.&nbsp;&nbsp;&nbsp;&nbsp;${blank(d.tel)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Faks.&nbsp;&nbsp;&nbsp;${blank(d.faks)}</div>
      <div>E-Posta&nbsp;&nbsp;<span class="link">${blank(d.email)}</span></div>
    </div>
    <table class="q-meta">
      <tr><td class="lbl">TARİH</td><td class="val">${blank(d.tarih)}</td></tr>
      <tr><td class="lbl">BELGE NO</td><td class="val">${blank(d.belgeNo)}</td></tr>
      <tr><td class="lbl">GEÇERLİLİK SÜRESİ</td><td class="val">${blank(d.gecerlilik)}</td></tr>
      <tr><td class="lbl">PROJE İLGİLİSİ</td><td class="val">${blank(d.projeIlgilisi)}</td></tr>
    </table>
  </div>
  <div class="q-machine">
    ${d.marka ? `<div class="q-brand">${esc(d.marka)}</div>` : ""}
    ${d.model ? `<div class="q-model">${esc(d.model)}</div>` : ""}
    ${d.tip ? `<div class="q-type">${esc(d.tip)}</div>` : ""}
    ${d.imageUrl ? `<img class="q-photo" src="${esc(d.imageUrl)}" alt="">` : ""}
  </div>
  ${pn()}
</div>`);

  // Sayfa 2 — teknik bilgiler (ürün spec'i varsa)
  if (hasSpecs) {
    pages.push(`
<div class="page">
  ${haksanHeader(assetBase)}
  <div class="q-h1">TEKNİK BİLGİLER</div>
  <table class="q-specs">
    ${d.specs!.map((s) => `<tr><td class="k">${esc(s.key)}</td><td class="v">${esc(s.value)}</td></tr>`).join("")}
  </table>
  ${pn()}
</div>`);
  }

  // Sayfa 3 — tezgah donanımı
  if (hasEquip) {
    pages.push(`
<div class="page">
  ${haksanHeader(assetBase)}
  <div class="q-h1">TEZGAH DONANIMI</div>
  ${(d.standartDonanim?.length ?? 0) > 0 ? `
  <div class="q-eq-h">STANDART DONANIM</div>
  <ul class="q-eq">${d.standartDonanim!.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  ${(d.opsiyonelDonanim?.length ?? 0) > 0 ? `
  <div class="q-eq-h">OPSİYONEL DONANIM</div>
  <ul class="q-eq opt">${d.opsiyonelDonanim!.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  ${pn()}
</div>`);
  }

  // Son sayfa — fiyat ve koşullar
  const rows: string[] = [];
  const minRows = 5;
  const items = [...d.items];
  const iskonto = d.iskonto ?? 0;
  for (let i = 0; i < Math.max(minRows, items.length + (iskonto > 0 ? 1 : 0)); i++) {
    const it = items[i];
    // Örnek şablondaki gibi: iskonto satırı 4. sıraya (ya da son ürün satırından
    // sonraya) kırmızı olarak yazılır.
    const discRow = iskonto > 0 && i === Math.max(3, items.length);
    rows.push(`<tr>
      <td class="no">${i + 1}</td>
      <td class="urun">${it ? esc(it.urun) : ""}</td>
      <td class="c" style="width:18mm">${it?.birim ? esc(it.birim) : ""}</td>
      <td class="c disc" style="width:32mm">${discRow ? "ÖZEL İSKONTO" : it?.fiyat ? fmtMoney(it.fiyat, d.currency) : ""}</td>
      <td class="r ${discRow ? "disc" : ""}" style="width:36mm">${discRow ? fmtMoney(iskonto, d.currency) : it?.tutar ? fmtMoney(it.tutar, d.currency) : ""}</td>
    </tr>`);
  }
  const toplam = items.reduce((a, i) => a + (i.tutar ?? 0), 0) - iskonto;
  const genel = toplam + d.kdvTutar;

  const noteSection = (no: number, baslik: string, list: string[]) => `
    <li><div class="sec">${esc(baslik)}</div>
      <ol class="alpha">${list.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>
    </li>`;

  pages.push(`
<div class="page">
  ${haksanHeader(assetBase)}
  <div class="q-h1">FİYAT ve KOŞULLAR</div>
  <table class="q-items">
    <tr><th style="width:7mm"></th><th>ÜRÜN</th><th>BİRİM</th><th>FİYAT</th><th>TUTAR</th></tr>
    ${rows.join("")}
  </table>
  <table class="q-tot">
    <tr><td class="tl">TOPLAM</td><td class="tv">${fmtMoney(toplam, d.currency)}</td></tr>
    <tr><td class="tl">K.D.V. (%${esc(d.kdvOran)})</td><td class="tv">${fmtMoney(d.kdvTutar, d.currency)}</td></tr>
    <tr><td class="tl">GENEL TOPLAM</td><td class="tv">${fmtMoney(genel, d.currency)}</td></tr>
  </table>
  <div class="q-notes">
    <ol class="outer">
      ${noteSection(1, "ÖDEME ŞARTLARI", d.notes.odeme)}
      ${noteSection(2, "TESLİMAT ŞARTLARI", d.notes.teslimat)}
      ${noteSection(3, "GARANTİ ŞARTLARI", d.notes.garanti)}
    </ol>
  </div>
  <div class="q-sign">
    <div class="nm">${blank(d.projeIlgilisi)}</div>
    <div>${blank(d.projeIlgilisiUnvan)}</div>
    <div><span class="link">${blank(d.projeIlgilisiEmail)}</span></div>
  </div>
  ${pn()}
</div>`);

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
  konu?: string;
  items: QuoteItem[];
  kdvOran: number;
  kdvTutar: number;
  currency: CurrencyCode;
  baslik: string; // ör. "PERİYODİK BAKIM"
  notlar: string[];
}

export function serviceQuoteDoc(d: ServiceQuotePrintData, assetBase: string): PrintDocument {
  const toplam = d.items.reduce((a, i) => a + (i.tutar ?? 0), 0);
  const rows: string[] = [];
  for (let i = 0; i < Math.max(5, d.items.length); i++) {
    const it = d.items[i];
    rows.push(`<tr>
      <td class="no">${i + 1}</td>
      <td class="urun">${it ? esc(it.urun) : ""}</td>
      <td class="c" style="width:18mm">${it?.birim ? esc(it.birim) : ""}</td>
      <td class="c" style="width:32mm">${it?.fiyat ? fmtMoney(it.fiyat, d.currency) : ""}</td>
      <td class="r" style="width:36mm">${it?.tutar ? fmtMoney(it.tutar, d.currency) : ""}</td>
    </tr>`);
  }
  const body = `
<div class="page">
  ${haksanHeader(assetBase)}
  <div class="q-title">TEKNİK SERVİS TEKLİFİ</div>
  <div class="q-top">
    <div class="q-cust">
      <div class="b" style="font-style:normal">${blank(d.firma)}</div>
      <div class="row"><span class="b">${blank(d.ilgili)}</span><span class="b">${blank(d.mobil)}</span></div>
      <div>${blank(d.adres)}</div>
      <div>Tel.&nbsp;&nbsp;&nbsp;&nbsp;${blank(d.tel)}</div>
      <div>E-Posta&nbsp;&nbsp;<span class="link">${blank(d.email)}</span></div>
    </div>
    <table class="q-meta">
      <tr><td class="lbl">TARİH</td><td class="val">${blank(d.tarih)}</td></tr>
      <tr><td class="lbl">BELGE NO</td><td class="val">${blank(d.belgeNo)}</td></tr>
      <tr><td class="lbl">KONU</td><td class="val">${blank(d.konu ?? d.baslik)}</td></tr>
    </table>
  </div>
  <div class="q-h1">${esc(d.baslik)}</div>
  <table class="q-items">
    <tr><th style="width:7mm"></th><th>AÇIKLAMA</th><th>BİRİM</th><th>FİYAT</th><th>TUTAR</th></tr>
    ${rows.join("")}
  </table>
  <table class="q-tot">
    <tr><td class="tl">TOPLAM</td><td class="tv">${fmtMoney(toplam, d.currency)}</td></tr>
    <tr><td class="tl">K.D.V. (%${esc(d.kdvOran)})</td><td class="tv">${fmtMoney(d.kdvTutar, d.currency)}</td></tr>
    <tr><td class="tl">GENEL TOPLAM</td><td class="tv">${fmtMoney(toplam + d.kdvTutar, d.currency)}</td></tr>
  </table>
  <div class="pf-notes" style="margin-top:5mm">
    <div class="nt">NOTLAR:</div>
    <ol>${d.notlar.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>
  </div>
</div>`;
  return {
    title: `Teknik Servis Teklifi ${d.belgeNo}`,
    css: QUOTE_CSS + PROFORMA_CSS,
    body,
  };
}

// ── 4) SATIŞ SÖZLEŞMESİ ─────────────────────────────────────────────────────

export interface ContractPrintData {
  alici: {
    unvan: string;
    yetkili?: string;
    adres?: string;
    vergiDairesi?: string;
    vergiNo?: string;
    tel?: string;
    faks?: string;
  };
  sozlesmeTarihi: string; // ISO ya da hazır metin
  model: string;
  adet: number;
  ozellikler: { key: string; value: string }[];
  aksesuarlar: string[];
  teslimAyi?: string; // ör. "2026 TEMMUZ"
  fiyat: number;
  currency: CurrencyCode;
  teslimSekli?: string; // ör. "Millileştirilmiş"
  kdvOran: number;
  odemePlani: { label: string; tutar: number; senet?: boolean }[];
  kontrolUnitesiMarka?: string;
}

const CONTRACT_CSS = `
.ct { font-family: Cambria, "Times New Roman", Georgia, serif; font-size: 10pt; line-height: 1.32; }
.ct-title { text-align: center; font-weight: bold; font-size: 11.5pt; margin: 4mm 0 3mm; }
.ct p { margin-bottom: 1mm; text-align: justify; }
.ct .ind { text-indent: 14mm; }
.ct .ctr { text-align: center; }
.ct .b { font-weight: bold; }
.ct ol.l1 { margin-left: 6mm; }
.ct ol.l1 > li { font-weight: bold; margin-bottom: 2mm; }
.ct .sub { font-weight: normal; margin-left: 2mm; }
table.ct-kv { margin-left: 12mm; font-size: 10pt; }
table.ct-kv td { padding: .2mm 0; vertical-align: top; }
table.ct-kv td:first-child { width: 62mm; }
ul.ct-acc { list-style: none; margin-left: 12mm; }
ul.ct-acc li { margin-bottom: .2mm; }
table.ct-pay { margin: 1mm 0 1mm 14mm; font-size: 10pt; }
table.ct-pay td { padding: .15mm 2mm .15mm 0; }
table.ct-pay td.amt { text-align: right; min-width: 30mm; }
.ct-price { margin-left: 14mm; margin-bottom: 1mm; }
.ct-price .row { display: flex; gap: 10mm; font-weight: bold; }
table.ct-parties { width: 100%; margin-top: 2mm; font-size: 10pt; }
table.ct-parties td { width: 50%; vertical-align: top; padding: .4mm 2mm .4mm 0; }
table.ct-parties .hd { font-weight: bold; border-top: 1pt solid #000; padding-top: 1mm; }
table.ct-parties .kv { display: grid; grid-template-columns: 34mm 1fr; }
.ct-h2 { font-weight: bold; margin: 2mm 0 1mm; }
.ct li { text-align: justify; }
ol.ct-n2 { margin-left: 7mm; font-weight: normal; }
ol.ct-n2 > li { margin-bottom: .5mm; }
.ct .pageno { padding-top: 2mm; }
`;

export function contractDoc(d: ContractPrintData, assetBase: string): PrintDocument {
  const tarihUzun = trLongDate(d.sozlesmeTarihi) || d.sozlesmeTarihi;
  const cu = d.kontrolUnitesiMarka || "FANUC";
  const toplam = d.fiyat;
  const pn = (n: number) => `<div class="pageno">Sayfa <b>${n}</b> / <b>3</b></div>`;
  const aliciKisa = esc(shortFirmName(d.alici.unvan));
  const A = `<span class="b">${aliciKisa}</span>`;

  const page1 = `
<div class="page ct">
  ${haksanHeader(assetBase)}
  <div class="ct-title">SATIŞ SÖZLEŞMESİ</div>
  <p>İş bu satış sözleşmesi satıcı firma sıfatıyla;</p>
  <p class="ctr">${esc(HAKSAN.adresSozlesme)} adresinde sabit,</p>
  <p class="ctr b">${esc(HAKSAN.unvanUzun)}</p>
  <p class="ctr">İle</p>
  <p>Alıcı firma sıfatıyla;</p>
  <p class="ctr">${blank(d.alici.adres)} adresinde sabit,</p>
  <p class="ctr b">${esc(d.alici.unvan)}</p>
  <p class="ind" style="margin-top:2mm">arasında ${esc(tarihUzun)} tarihinde kaleme alınmış toplam 3 (üç) sayfadan oluşan satış sözleşmesidir.</p>
  <ol class="l1" style="margin-top:3mm">
    <li>Sözleşmeye Konu Olan Tezgah ve Özellikleri
      <div class="sub" style="margin-top:1mm">
        <p class="b">1.1. ${esc(d.model)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${d.adet} (${esc(sayiAdet(d.adet))}) Set</p>
        ${d.ozellikler.length ? `
        <p class="b" style="margin-top:1.5mm">1.1.1. Tezgâhın Karakteristik Özellikleri;</p>
        <table class="ct-kv">
          ${d.ozellikler.map((o) => `<tr><td>${esc(o.key)}</td><td>${esc(o.value)}</td></tr>`).join("")}
        </table>` : ""}
        ${d.aksesuarlar.length ? `
        <p class="b" style="margin-top:2mm">1.1.2. Tezgâhın Standart Aksesuarları;</p>
        <ul class="ct-acc">
          ${d.aksesuarlar.map((a) => `<li>${esc(a)}</li>`).join("")}
        </ul>` : ""}
      </div>
    </li>
  </ol>
  ${pn(1)}
</div>`;

  const page2 = `
<div class="page ct">
  ${haksanHeader(assetBase)}
  <div class="ct-h2" style="margin-top:3mm">2.&nbsp;&nbsp;Nakliye, Ambalaj ve Teslimat;</div>
  <ol class="ct-n2" style="list-style:none">
    <li><span class="b">2.1.</span> Tezgahın teslimi sözleşme şartları yerine getirilmesi ve gümrük işlemleri tamamlanmasıyla ${d.teslimAyi ? `<span class="b">${esc(d.teslimAyi)}</span> ayı içerisinde` : "en kısa sürede"} gerçekleştirilecektir;</li>
    <li><span class="b">2.2.</span> Tezgahın ${A} 'ye teslim olmasını müteakip 2 (iki) gün içerisinde <span class="b">HAKSAN MAKİNA</span> personeli tarafından tezgahın kurulumu ve ilk çalıştırması gerçekleştirilecektir,</li>
    <li><span class="b">2.3.</span> Tezgahın kurulmasından sonra <span class="b">HAKSAN MAKİNA</span>, ${A} 'ye 2 (iki) gün süre ile eğitim ve demo çalışması yapacaktır. Eğitim ve demo çalışması ${A} tesislerinde gerçekleştirilecektir.</li>
    <li><span class="b">2.4.</span> Tezgahın mekanik garantisi ${A} 'ye teslimiyle başlayacak olup, mekanik garanti tüm üretim hatalarına karşı 1 (bir) yıldır,</li>
    <li><span class="b">2.5.</span> Tezgahın kontrol ünitesi garantisi ${A} 'ye teslimiyle başlayacak olup, uluslararası ${esc(cu)} garantisi 2 (iki) yıldır,</li>
    <li><span class="b">2.6.</span> Tezgah <span class="b">HAKSAN MAKİNA/Hadımköy</span> tesislerinden teslim edilecek olup, tezgahın nakliye ve sigorta giderleri ${A} 'e aittir.</li>
  </ol>
  <div class="ct-h2" style="margin-top:2.5mm">3.&nbsp;&nbsp;Fiyat ve Ödeme Şartları;</div>
  <ol class="ct-n2" style="list-style:none">
    <li><span class="b">3.1.</span> 1.1. no'lu maddede belirtilen tezgah ilgili maddelerde belirtilmiş olan karakteristik özellikleri ve ilgili maddelerdeki donanımları ile birlikte fiyatı aşağıdaki gibidir,
      <div class="ct-price" style="margin-top:1.5mm">
        <div class="row"><span>${d.adet} Adet</span><span>${esc(d.model)}</span><span>${fmtMoney(d.fiyat, d.currency)}</span></div>
        <div class="row" style="justify-content:flex-end; gap:14mm"><span>TOPLAM</span><span>${fmtMoney(toplam, d.currency)}</span></div>
        <div class="b">${esc(tutarYaziyla(toplam, d.currency))}</div>
      </div>
    </li>
    <li><span class="b">3.2.</span> Sözleşmeye konu <span class="b">${esc(d.model)}</span> ${d.teslimSekli ? `<span class="b">${esc(d.teslimSekli)}</span> şeklinde fiyatlandırılmıştır. Tezgahın fiyatına, tezgahın ithalatı ile ilgili masraf ve vergiler (Gümrük Vergisi, Liman Masrafları, Ardiye Giderleri, Gümrükleme Ücreti, İlave Gümrük Vergisi) dahildir.` : "fiyatlandırılması yukarıdaki gibidir."}</li>
    <li><span class="b">3.3.</span> Sözleşmeye konu tezgahın fiyatına <span class="b">%${esc(d.kdvOran)}</span> oranındaki <span class="b">K.D.V.</span> dahil değildir,</li>
    <li><span class="b">3.4.</span> Sözleşmeye konu tezgahın bedelinin tamamı ${A} firmasından aşağıdaki şekilde tahsil edilecektir;
      <table class="ct-pay">
        ${d.odemePlani.map((p) => `<tr><td>${esc(p.label)}</td><td class="amt">${fmtMoney(p.tutar, d.currency)}${p.senet ? " (Senet)" : ""}</td></tr>`).join("")}
      </table>
    </li>
  </ol>
  <div class="ct-h2" style="margin-top:2mm">&nbsp;Diğer Hususlar;</div>
  <ol class="ct-n2" style="list-style:none">
    <li><span class="b">3.5.</span> İş bu sözleşme <span class="b">${esc(HAKSAN.unvan)}</span> ve ${A} tarafından, her iki firmanın iradesi altında imza altına alınmıştır,</li>
    <li><span class="b">3.6.</span> İş bu sözleşmenin maddesi veya maddeleri her iki taraf mutabakatı ile değiştirilebilir, tek taraflı değiştirilemez ve sözleşme feshedilemez,</li>
    <li><span class="b">3.7.</span> İş bu sözleşmenin karşılıklı feshedilmesi veya şartlarının değiştirilmesi halinde sözleşmeye istinaden alınan kaparo veya teminatlar taraflara iade edilecektir,</li>
    <li><span class="b">3.8.</span> Taraflar arasında bu sözleşmeden doğabilecek uyuşmazlıkların çözümünde İstanbul Merkez Adliyesi Mahkemeleri ve İcra Müdürlükleri yetkilidir,</li>
    <li><span class="b">3.9.</span> İş bu sözleşme ${esc(tarihUzun)} tarihinde imza altına alınmış ve yürürlüğe girmiştir.</li>
  </ol>
  ${pn(2)}
</div>`;

  const kv = (k: string, v?: string) => `<div class="kv"><span>${esc(k)}</span><span>${blank(v)}</span></div>`;
  const page3 = `
<div class="page ct">
  ${haksanHeader(assetBase)}
  <div class="ct-title" style="margin-bottom:1mm">TARAFLAR</div>
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
      <td>
        ${kv("Vergi Dairesi", HAKSAN.vergiDairesi)}
        ${kv("Vergi Numarası", HAKSAN.vergiNo)}
        ${kv("Tel.", HAKSAN.telSade)}
        ${kv("Faks", HAKSAN.faksSade)}
      </td>
      <td>
        ${kv("Vergi Dairesi", d.alici.vergiDairesi)}
        ${kv("Vergi Numarası", d.alici.vergiNo)}
        ${kv("Tel.", d.alici.tel)}
        ${kv("Faks", d.alici.faks)}
      </td>
    </tr>
  </table>
  ${pn(3)}
</div>`;

  return {
    title: `Satış Sözleşmesi - ${aliciKisa}`,
    css: CONTRACT_CSS,
    body: page1 + page2 + page3,
  };
}

const ADET_YAZI: Record<number, string> = {
  1: "bir", 2: "iki", 3: "üç", 4: "dört", 5: "beş", 6: "altı", 7: "yedi", 8: "sekiz", 9: "dokuz", 10: "on",
};
const sayiAdet = (n: number) => ADET_YAZI[n] ?? String(n);
const shortFirmName = (s: string) => s.split(" ").slice(0, 2).join(" ");

// ── 5) KURULUM TUTANAĞI (DR.MAK) ────────────────────────────────────────────

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
.f-sec { text-align: center; font-weight: bold; font-size: 10.5pt; margin: 2mm 0 .8mm; }
table.f { width: 100%; }
table.f td, table.f th { border: 1pt solid #000; font-size: 10pt; padding: 1mm 1.6mm; background: transparent; }
table.f td.lbl { width: 30mm; }
table.f td.val { font-style: italic; }
.f-cols { display: flex; gap: 6mm; }
.f-cols > div { flex: 1; }
.f-boxes { display: flex; gap: 10mm; margin-top: 6mm; }
.f-box { flex: 1; }
.f-box .cap { border: 1pt solid #000; text-align: center; font-weight: bold; font-size: 9.5pt; padding: 1.2mm; }
.f-box .bod { border: 1pt solid #000; border-top: 0; height: 9mm; text-align: center; font-size: 11pt; padding-top: 1.6mm; }
.f-box .red { color: #c00000; font-family: "Courier New", monospace; font-weight: bold; letter-spacing: 1px; }
.cb { font-family: "Segoe UI Symbol", "Arial Unicode MS", sans-serif; font-size: 11pt; }
table.f-check th { font-weight: bold; }
table.f-check td.c { text-align: center; width: 26mm; }
table.f-check td.n { width: 60mm; }
.f-sign { display: flex; gap: 6mm; margin-top: 2.5mm; }
.f-sign > div { flex: 1; border: 1.4pt solid #000; padding: 1.4mm 2mm 3mm; }
.f-sign .cap { font-weight: bold; font-size: 10.5pt; border-bottom: 1pt solid #000; margin: -1.6mm -2mm 2mm; padding: 1.2mm 2mm; }
.f-sign .ln { display: grid; grid-template-columns: 24mm 4mm 1fr; font-size: 10pt; font-weight: bold; margin-top: 2mm; }
.f-sign .ln .v { font-weight: normal; font-style: italic; }
`;

export function installationFormDoc(d: InstallationPrintData, assetBase: string): PrintDocument {
  const t = d.tezgah ?? {};
  const c = d.cnc ?? {};
  const body = `
<div class="page">
  ${drmakHeader(assetBase, "KURULUM TUTANAĞI")}
  ${drmakWatermark(assetBase)}
  <div class="z">
    <div class="f-boxes">
      <div class="f-box"><div class="cap">TEZGAH TESLİM TARİHİ</div><div class="bod val" style="font-style:italic">${blank(d.teslimTarihi)}</div></div>
      <div class="f-box"><div class="cap">TEZGAH KURULUM TARİHİ</div><div class="bod" style="font-style:italic">${blank(d.kurulumTarihi)}</div></div>
      <div class="f-box"><div class="cap">FORM NO</div><div class="bod red">${blank(d.formNo)}</div></div>
    </div>

    <div class="f-cols" style="margin-top:6mm">
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
        <div class="f-sec">KONTROL ÜNİTESİ BİLGİLERİ</div>
        <table class="f">
          <tr><td class="lbl">Cnc Markası</td><td class="val">${blank(c.marka)}</td></tr>
          <tr><td class="lbl">Cnc Modeli</td><td class="val">${blank(c.model)}</td></tr>
          <tr><td class="lbl">Cnc Seri No</td><td class="val">${blank(c.seriNo)}</td></tr>
          <tr><td class="lbl">Cnc Main S/W</td><td class="val">${blank(c.mainSw)}</td></tr>
        </table>
      </div>
    </div>

    <div class="f-sec" style="margin-top:4mm">KULLANICI BİLGİLERİ</div>
    <table class="f">
      <tr><td class="lbl">Firma</td><td class="val">${blank(d.firma)}</td></tr>
      <tr><td class="lbl">İlgili</td><td class="val">${blank(d.ilgili)}</td></tr>
      <tr><td class="lbl">Adres</td><td class="val">${blank(d.adres)}</td></tr>
      <tr><td class="lbl">&nbsp;</td><td class="val"></td></tr>
      <tr><td class="lbl">Telefon</td><td class="val">${blank(d.telefon)}</td></tr>
      <tr><td class="lbl">Faks</td><td class="val">${blank(d.faks)}</td></tr>
      <tr><td class="lbl">Gsm</td><td class="val">${blank(d.gsm)}</td></tr>
      <tr><td class="lbl">E-Posta</td><td class="val">${blank(d.eposta)}</td></tr>
    </table>

    <div class="f-sec" style="margin-top:4mm">TEZGAH KONTROL ÇİZELGESİ</div>
    <table class="f f-check">
      <tr><th>Açıklama</th><th style="width:26mm">Tamamlandı</th><th style="width:30mm">Tamamlanmadı</th><th class="n">Not</th></tr>
      ${INSTALL_CHECKS.map((label) => `
      <tr>
        <td>${esc(label)}</td>
        <td class="c"><span class="cb">&#9744;</span></td>
        <td class="c"><span class="cb">&#9744;</span></td>
        <td class="n"></td>
      </tr>`).join("")}
    </table>

    <div class="f-sign">
      <div>
        <div class="cap">KURULUMU YAPAN</div>
        <div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.kurulumuYapan)}</span></div>
        <div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div>
      </div>
      <div>
        <div class="cap">TEZGAHI TESLİM ALAN</div>
        <div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v">${blank(d.teslimAlan)}</span></div>
        <div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div>
      </div>
    </div>
  </div>
  ${drmakFooter(assetBase)}
</div>`;
  return { title: `Kurulum Tutanağı ${d.formNo}`, css: DRMAK_CSS + FORM_CSS, body };
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
.sf-lines .ln { border-bottom: 1pt solid #000; height: 4.7mm; font-size: 9pt; font-style: italic; padding: 0 1.5mm; overflow: hidden; }
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
  const parts: ServiceFormPart[] = [...(d.parcalar ?? [])];
  while (parts.length < 6) parts.push({ ad: "" });
  const toplam =
    parts.reduce((a, p) => a + (p.tutar ?? 0), 0) + (d.servisUcreti ?? 0) + (d.ulasimUcreti ?? 0);
  const islemler = [...(d.islemler ?? [])];
  while (islemler.length < 11) islemler.push("");

  const body = `
<div class="page">
  ${drmakHeader(assetBase, "SERVİS FORMU")}
  ${drmakWatermark(assetBase)}
  <div class="z">
    <table class="sf-top">
      <tr>
        <td class="lbl">Firma</td><td class="val" style="width:58mm">${blank(d.firma)}</td>
        <td class="lbl">İlgili</td><td class="val">${blank(d.ilgili)}</td>
        <td class="lbl formno" rowspan="2">Form No.<br><br><span style="font-style:italic">${blank(d.formNo)}</span></td>
      </tr>
      <tr><td class="lbl">Adres</td><td class="val" colspan="3">${blank(d.adres)}</td></tr>
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
    </table>

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
    </div>

    <div class="sf-complaint">
      <div style="flex:1">
        <div class="f-sec">MÜŞTERİ ŞİKAYETİ</div>
        <div class="box">${blank(d.sikayet)}</div>
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
    </div>

    <div class="f-sec">YAPILAN İŞLEMLER</div>
    <div class="sf-lines">
      ${islemler.map((x) => `<div class="ln">${blank(x)}</div>`).join("")}
    </div>

    <table class="sf-parts">
      <tr>
        <th colspan="2">DEĞİŞEN PARÇALAR</th>
        <th style="width:20mm">MİKAR</th>
        <th style="width:30mm">BİRİM FİYATI</th>
        <th style="width:32mm">TUTARI</th>
      </tr>
      ${parts.slice(0, 6).map((p, i) => `
      <tr>
        <td class="no">${i + 1}</td>
        <td class="val" style="font-style:italic">${blank(p.ad)}</td>
        <td class="c">${blank(p.miktar)}</td>
        <td class="r">${p.birimFiyat ? fmtMoney(p.birimFiyat, cur) : ""}</td>
        <td class="r">${p.tutar ? fmtMoney(p.tutar, cur) : ""}</td>
      </tr>`).join("")}
      <tr><td class="sumlbl" colspan="4" style="border:1pt solid #000">SERVİS ÜCRETİ (İŞÇİLİK)</td><td class="r">${d.servisUcreti ? fmtMoney(d.servisUcreti, cur) : ""}</td></tr>
      <tr><td class="sumlbl" colspan="4" style="border:1pt solid #000">ULAŞIM ÜCRETİ</td><td class="r">${d.ulasimUcreti ? fmtMoney(d.ulasimUcreti, cur) : ""}</td></tr>
      <tr>
        <td colspan="4" class="toplbl">TOPLAM<br><small>(K.D.V. Hariç)</small></td>
        <td class="r" style="font-weight:bold">${toplam ? fmtMoney(toplam, cur) : ""}</td>
      </tr>
    </table>

    <div class="f-sign">
      <div>
        <div class="cap">SERVİS YETKİLİSİ</div>
        <div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v"></span></div>
        <div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div>
      </div>
      <div>
        <div class="cap">FİRMA YETKİLİSİ</div>
        <div class="ln"><span>Ad, Soyad</span><span>:</span><span class="v"></span></div>
        <div class="ln" style="margin-top:6mm"><span>İmza</span><span>:</span><span class="v"></span></div>
      </div>
    </div>
  </div>
  ${drmakFooter(assetBase)}
</div>`;
  return { title: `Servis Formu ${d.formNo}`, css: DRMAK_CSS + FORM_CSS + SERVICE_FORM_CSS, body };
}
