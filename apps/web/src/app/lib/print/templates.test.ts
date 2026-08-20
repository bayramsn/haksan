import { describe, expect, it } from "vitest";
import {
  cargoLabelDoc,
  commercialInvoiceDoc,
  contractDoc,
  deliveryReceiptDoc,
  dispatchNoteDoc,
  installationFormDoc,
  proformaDoc,
  quoteDoc,
  serviceCompletionFormDoc,
  serviceFormDoc,
  serviceQuoteDoc,
} from "./templates";
import { SERVICE_NOTE_VARIANTS } from "./notes";

const pages = (body: string) => (body.match(/class="page(?:\s|\")/g) ?? []).length;
const assetBase = "https://example.test/print";

describe("print templates", () => {
  it("renders the standard Haksan proforma in the reference one-page layout", () => {
    const document = proformaDoc({
      firma: "BARTIN OTOMOTİV PAZARLAMA VE TİC.LTD.ŞTİ.",
      adres: "Gecen köyü aşağı düz mevk.No:47/1 Bartın",
      tel: "0 378 227 46 96",
      faks: "0 378 227 81 05",
      email: "firma@bartinotomotiv.test",
      vergiDairesi: "Bartın",
      vergiNo: "142 006 63 99",
      tarih: "25 Şubat 2026",
      belgeNo: "2026/005",
      items: [{
        aciklama: "L.K. MACHINERY VM-2 Cnc Dik İşleme Merkezi",
        marka: "L.K. MACHINERY",
        mensei: "Tayvan",
        gtip: "8457.1090.0011",
        birim: "1 Adet",
        birimFiyati: null,
        tutar: 66_825,
      }],
      kdvOran: 20,
      kdvTutar: 0,
      currency: "USD",
      notlar: [
        "Proforma fatura peşin/leasing ödemeye göre düzenlenmiştir,",
        "Proforma fatura toplam bedeline tezgâhın cari orandaki K.D.V.’si dahil edilmemiştir.",
        "Proforma fatura C.I.F./İstanbul teslim şeklinde düzenlenmiş olup, fiyatımıza tezgâhın ithalatı ile ilgili masraf ve vergiler (Gümrük Vergisi, Liman Masrafları, Ardiye Giderleri, Gümrükleme Ücreti, İlave Gümrük Vergisi) dahil edilmemiştir. Tezgâh Gümrük Yönetmeliği’nin 333. Maddesine istinaden Antrepodan devredilecektir.",
        "Tezgâhın teslimi kesin siparişten 90 (±15) gün sonra gerçekleştirilecektir,",
        "Tezgâh HAKSAN MAKİNA/Hadımköy antreposundan teslim edilecek olup, Tezgâhın karayolu taşıma ve sigortası alıcı firma tarafından karşılanacaktır,",
        "Tezgâh uluslararası CE standartlarına uygundur.",
        "Tezgâhın üretim yılı 2026 olup, yeni ve kullanılmamıştır,",
        "Tezgâh ile birlikte çalışması için zorunlu olanlar dışında aksam ve aksesuar bulunmamaktadır,",
        "Tezgâh tüm üretim hatalarına karşı 1 (bir) yıl üretici firma garantisi kapsamındadır, kontrol ünitesi 2 (iki) yıl Uluslararası üretici firma garantisi kapsamındadır,",
        "Tezgâh yol şartlarına uygun ambalajlanmış olarak sevk edilecektir.",
      ],
    }, assetBase);

    expect(pages(document.body)).toBe(1);
    expect(document.body).toContain("BARTIN OTOMOTİV PAZARLAMA");
    expect(document.body).toContain("L.K. MACHINERY VM-2");
    expect(document.body).toContain("8457.1090.0011");
    expect(document.body).toContain("firma@bartinotomotiv.test");
    expect(document.body).toContain("66.825,00 USD");
    expect(document.body).toContain("K.D.V. (%20)");
    expect(document.body).toContain("Yalnız #Altmışaltıbinsekizyüzyirmibeş# Amerikan doları");
    expect(document.body).toContain("transform:scale(1.0000)");
    expect(document.body).not.toContain("DEVAM");
    expect(document.body).not.toContain("class=\"pageno\"");
  });

  it("fills the same one-page design from another customer's data", () => {
    const document = proformaDoc({
      firma: "Alişler makina",
      adres: "Karacabey Bursa",
      vergiDairesi: "Bursa - Osmangazi",
      tarih: "23 Haziran 2026",
      belgeNo: "2026/001",
      items: [{
        aciklama: "MT-520/2000 CNC Torna",
        marka: "ECOCA",
        birim: "1 Adet",
        birimFiyati: 66_666.67,
        tutar: 66_666.67,
      }],
      kdvOran: 20,
      kdvTutar: 0,
      currency: "USD",
      notlar: [
        "Proforma fatura peşin/leasing ödemeye göre düzenlenmiştir,",
        "Proforma fatura toplam bedeline tezgâhın cari orandaki K.D.V.'si dahil edilmemiştir.",
        "Proforma fatura C.I.F./İstanbul teslim şeklinde düzenlenmiş olup, fiyatımıza tezgâhın ithalatı ile ilgili masraf ve vergiler (Gümrük Vergisi, Liman Masrafları, Ardiye Giderleri, Gümrükleme Ücreti, İlave Gümrük Vergisi) dahil edilmemiştir. Tezgâh Gümrük Yönetmeliği'nin 333. Maddesine istinaden Antrepodan devredilecektir.",
        "Tezgâhın teslimi kesin siparişten 90 (±15) gün sonra gerçekleştirilecektir,",
        "Tezgâh HAKSAN MAKİNA/Hadımköy antreposundan teslim edilecek olup, Tezgâhın karayolu taşıma ve sigortası alıcı firma tarafından karşılanacaktır,",
        "Tezgâh uluslararası CE standartlarına uygundur.",
        "Tezgâhın üretim yılı 2026 olup, yeni ve kullanılmamıştır,",
        "Tezgâh ile birlikte çalışması için zorunlu olanlar dışında aksam ve aksesuar bulunmamaktadır,",
        "Tezgâh tüm üretim hatalarına karşı 1 (bir) yıl üretici firma garantisi kapsamındadır, kontrol ünitesi 2 (iki) yıl Uluslararası üretici firma garantisi kapsamındadır,",
        "Tezgâh yol şartlarına uygun ambalajlanmış olarak sevk edilecektir.",
      ],
    }, assetBase);

    expect(pages(document.body)).toBe(1);
    expect(document.body).toContain("Alişler makina");
    expect(document.body).toContain("MT-520/2000 CNC Torna");
    expect(document.body).toContain("66.666,67 USD");
    expect(document.body).toContain("transform:scale(1.0000)");
    expect(document.body).not.toContain("DEVAM");
    expect(document.body).not.toContain("class=\"pageno\"");
  });

  it("keeps long proformas on one page without losing rows, totals or escaping", () => {
    const document = proformaDoc({
      firma: `<script>alert("x")</script> Müşteri`,
      tarih: "14 Temmuz 2026",
      belgeNo: "CNC-PRF-2026/001",
      items: Array.from({ length: 9 }, (_, index) => ({
        aciklama: `PROFORMA-KALEM-${index + 1}`,
        birim: "1 Adet",
        birimFiyati: 100,
        tutar: 100,
      })),
      headerDiscount: 50,
      kdvOran: 20,
      kdvTutar: 170,
      currency: "TRY",
      notlar: Array.from({ length: 9 }, (_, index) => `PROFORMA-NOT-${index + 1}`),
    }, assetBase);

    expect(pages(document.body)).toBe(1);
    expect(document.body).toContain("PROFORMA-KALEM-9");
    expect(document.body).toContain("PROFORMA-NOT-9");
    expect(document.body).toContain("ÖZEL İSKONTO");
    expect(document.body).toContain("-50,00 TRY");
    expect(document.body).toContain("1.020,00");
    expect(document.body).not.toContain("<script>");
    expect(document.body).toContain("&lt;script&gt;");
    expect(document.body).not.toContain("DEVAM");
    expect(document.body).not.toContain("class=\"pageno\"");
    const scale = Number(document.body.match(/transform:scale\(([\d.]+)\)/)?.[1]);
    expect(scale).toBeLessThan(1);
  });

  it.each([
    ["proforma", proformaDoc],
    ["commercial invoice", commercialInvoiceDoc],
  ])("shows gross row amount and applies each discount once in %s totals", (_label, render) => {
    const document = render({
      firma: "İskontolu Belge Müşterisi",
      tarih: "31 Temmuz 2026",
      belgeNo: "CNC-PRF-2026/013",
      items: [{
        aciklama: "ECOCA SL-8 CNC Torna Tezgahı",
        birim: "1 Adet",
        birimFiyati: 59_400,
        iskonto: 30_000,
        tutar: 59_400,
      }],
      headerDiscount: 0,
      kdvOran: 0,
      kdvTutar: 0,
      currency: "USD",
      notlar: [],
    }, assetBase);

    expect(document.body).not.toContain("Ürüne özel iskonto");
    expect(document.body).toContain("59.400,00 USD");
    expect(document.body).toMatch(/<td class="r">59\.400,00 USD<\/td>/);
    expect(document.body).toContain("-30.000,00 USD");
    expect(document.body).toContain("29.400,00 USD");
    expect(document.body.match(/30\.000,00 USD/g) ?? []).toHaveLength(1);
  });

  it("paginates offer specifications, equipment, items and conditions", () => {
    const document = quoteDoc({
      firma: "Uzun Teklif Müşterisi",
      tarih: "14.07.2026",
      belgeNo: "CNC-2026/001",
      specs: Array.from({ length: 41 }, (_, index) => ({ key: `SPEC-${index + 1}`, value: `${index + 1}` })),
      standartDonanim: Array.from({ length: 25 }, (_, index) => `STD-${index + 1}`),
      opsiyonelDonanim: Array.from({ length: 25 }, (_, index) => `OPT-${index + 1}`),
      items: Array.from({ length: 17 }, (_, index) => ({ urun: `TEKLIF-KALEM-${index + 1}`, birim: "Adet", fiyat: 100, tutar: 100 })),
      iskonto: 100,
      kdvOran: 20,
      kdvTutar: 320,
      currency: "TRY",
      notes: {
        key: "entered",
        label: "Girilen şartlar",
        odeme: Array.from({ length: 9 }, (_, index) => `ODEME-${index + 1}`),
        teslimat: [],
        garanti: [],
      },
    }, assetBase);

    const totalPages = pages(document.body);
    expect(totalPages).toBeGreaterThan(4);
    expect(document.body).toContain("SPEC-41");
    expect(document.body).toContain("STD-25");
    expect(document.body).toContain("OPT-25");
    expect(document.body).toContain("TEKLIF-KALEM-17");
    expect(document.body).toContain("ODEME-9");
    expect(document.body).toContain(`Sayfa <b>${totalPages}</b> / <b>${totalPages}</b>`);
  });

  it("keeps all offer technical specifications on one compact page without a continuation", () => {
    const document = quoteDoc({
      firma: "Tek Sayfa Teknik Müşterisi",
      tarih: "13.08.2026",
      belgeNo: "CNC-2026/902",
      specs: Array.from({ length: 82 }, (_, index) => ({
        key: `TEKNİK ALAN ${index + 1}`,
        value: `${index + 1}`,
      })),
      items: [{ urun: "CNC Torna", birim: "1 Adet", fiyat: 100, tutar: 100 }],
      kdvOran: 20,
      kdvTutar: 20,
      currency: "USD",
      notes: { key: "entered", label: "Girilen şartlar", odeme: [], teslimat: [], garanti: [] },
    }, assetBase);

    expect(document.body.match(/<div class="q-h1">TEKNİK BİLGİLER<\/div>/g) ?? []).toHaveLength(1);
    expect(document.body).not.toContain("TEKNİK BİLGİLER — DEVAM");
    expect(document.body).toContain("q-spec-page-ultra");
    expect(document.body).toContain("q-spec-page");
    expect(document.body).toMatch(/--q-spec-scale:0\.[0-9]+/);
    expect(document.body).toContain("TEKNİK ALAN 82");
    expect(document.css).toContain("height: 296mm");
    expect(document.css).toContain("zoom: var(--q-spec-scale, 1)");
  });

  it("omits unused dash-valued CRM specification rows from the offer PDF", () => {
    const document = quoteDoc({
      firma: "Teknik Alan Testi",
      tarih: "13.08.2026",
      belgeNo: "CNC-2026/901",
      specs: [
        { key: "Karşı Ayna Devri", value: "-", groupName: "Karşı Ayna" },
        { key: "Canlı Takım Devri", value: "4500", unit: "dev/dk", groupName: "Canlı Takım" },
      ],
      items: [{ urun: "CNC Torna", birim: "1 Adet", fiyat: 100, tutar: 100 }],
      kdvOran: 20,
      kdvTutar: 20,
      currency: "USD",
      notes: { key: "entered", label: "Girilen şartlar", odeme: [], teslimat: [], garanti: [] },
    }, assetBase);

    expect(document.body).not.toContain("Karşı Ayna Devri");
    expect(document.body).not.toContain("KARŞI AYNA");
    expect(document.body).toContain("Canlı Takım Devri");
    expect(document.body).toContain("4500 dev/dk");
  });

  it("keeps a long condition whole and continues the lettering across pages", () => {
    // Bir madde cümle ortasından ikiye bölünürse ikinci parça, yarım bir
    // cümleyle başlayan ayrı bir maddeymiş gibi basılıyordu.
    const longClause =
      "Tezgahın teslimi, akreditifin açılmasını takip eden 90 gün içinde gerçekleştirilecektir. " +
      "Gecikme hâlinde taraflar yeni bir teslim takvimi üzerinde yazılı olarak mutabık kalır. " +
      "Bu madde, mücbir sebep hâllerinde uygulanmaz.";
    const document = quoteDoc({
      firma: "Uzun Şart Müşterisi",
      tarih: "10.08.2026",
      belgeNo: "CNC-2026/900",
      // Referans tek-sayfa düzeni yerine sayfalanan düzeni zorlar; şartlar
      // ancak orada kendi sayfalarına taşar.
      specs: Array.from({ length: 41 }, (_, index) => ({ key: `SPEC-${index + 1}`, value: `${index + 1}` })),
      items: Array.from({ length: 17 }, (_, index) => ({ urun: `KALEM-${index + 1}`, birim: "Adet", fiyat: 100, tutar: 100 })),
      kdvOran: 20,
      kdvTutar: 20,
      currency: "USD",
      notes: {
        key: "entered",
        label: "Girilen şartlar",
        odeme: [longClause, ...Array.from({ length: 11 }, (_, index) => `ODEME-${index + 1}`)],
        teslimat: [],
        garanti: [],
      },
    }, assetBase);

    // Uzun madde tek parça kalır: cümlenin tamamı tek bir <li> içinde.
    expect(document.body).toContain(`<li>${longClause}</li>`);
    // Bölüm ikinci sayfaya taştıysa harfler `a.`dan değil, kaldığı yerden devam eder.
    const starts = [...document.body.matchAll(/<ol class="alpha" start="(\d+)"/g)].map((m) => Number(m[1]));
    expect(starts.length).toBeGreaterThan(1);
    expect(starts[0]).toBe(1);
    expect(starts[1]).toBeGreaterThan(1);
    expect(document.body).toContain("ÖDEME ŞARTLARI (devam)");
    expect(document.body).toContain("ODEME-11");
  });

  it("keeps the reference-shaped sales offer on four A4 pages", () => {
    const document = quoteDoc({
      firma: "SUDEN MAKİNE SAN. VE TİC. LTD. ŞTİ.",
      ilgili: "Abdussamed HOLOĞLU",
      mobil: "0 (530) 124 36 61",
      adres: "Terazidere Mah. Karaman Sk. No:14 İç Kapı No:1 Bayrampaşa, İstanbul",
      tel: "0 (212) 000 00 00",
      email: "satinalma@sudenmakine.com",
      tarih: "25.06.2026",
      belgeNo: "2026/074",
      gecerlilik: "5 İş Günü",
      projeIlgilisi: "Raif ŞENTÜRK",
      projeIlgilisiUnvan: "Koordinatör",
      projeIlgilisiTelefon: "+90 534 234 11 68",
      projeIlgilisiEmail: "raif@haksancnc.com.tr",
      marka: "LK",
      model: "VM-6",
      tip: "CNC DİK İŞLEME MERKEZİ",
      imageUrl: "https://example.test/products/vm-6.png",
      specs: Array.from({ length: 35 }, (_, index) => ({
        key: `TEKNİK BİLGİ ${index + 1}`,
        value: `${index + 1} mm`,
        groupName: index < 4 ? "TABLA" : index < 14 ? "EKSENLER" : "GENEL",
      })),
      standartDonanim: Array.from({ length: 29 }, (_, index) => `STANDART DONANIM ${index + 1}`),
      opsiyonelDonanim: [],
      items: [
        { urun: "LK VM-6 Cnc Dik İşleme Merkezi", birim: "1 Adet", fiyat: 116_900, tutar: 116_900 },
        { urun: "Takım ve Takım Tutucu Paketi", birim: "1 Paket", fiyat: 5_000, tutar: 5_000 },
      ],
      iskonto: 12_900,
      kdvOran: 20,
      kdvTutar: 0,
      currency: "USD",
      notes: {
        key: "entered",
        label: "Girilen şartlar",
        odeme: Array.from({ length: 4 }, (_, index) => `Ödeme koşulu ${index + 1}`),
        teslimat: Array.from({ length: 3 }, (_, index) => `Teslimat koşulu ${index + 1}`),
        garanti: Array.from({ length: 6 }, (_, index) => `Garanti koşulu ${index + 1}`),
      },
    }, assetBase);

    expect(pages(document.body)).toBe(4);
    expect(document.body).toContain("FİYAT ve KOŞULLAR");
    expect(document.body).toContain("ÖZEL İSKONTO");
    expect(document.body).toContain("109.000,00 USD");
    expect(document.body).toContain("ÖDEME ŞARTLARI");
    expect(document.body).toContain("TESLİMAT ŞARTLARI");
    expect(document.body).toContain("GARANTİ ŞARTLARI");
    expect(document.body).toContain("+90 534 234 11 68");
    expect(document.body).not.toContain("TOPLAM ÖZETİ");
    expect(document.body).toContain("Sayfa <b>4</b> / <b>4</b>");
  });

  it("renders the reference HAXAN product logo instead of a bold text brand", () => {
    const document = quoteDoc({
      firma: "Logo Kontrol Müşterisi",
      tarih: "30.07.2026",
      belgeNo: "CNC-2026/005",
      marka: "HAXAN",
      model: "MMT-1170",
      tip: "CNC Dik İşleme Merkezi",
      items: [{ urun: "HAXAN MMT-1170 CNC Dik İşleme Merkezi", birim: "1 Adet", fiyat: 100_000, tutar: 100_000 }],
      kdvOran: 0,
      kdvTutar: 0,
      currency: "USD",
      notes: { key: "entered", label: "Girilen şartlar", odeme: [], teslimat: [], garanti: [] },
    }, assetBase);

    expect(document.body).toContain('class="q-brand-logo"');
    expect(document.body).toContain(`${assetBase}/haxan-product-logo.webp`);
    expect(document.body).not.toContain('<div class="q-brand">HAXAN</div>');
    expect(document.body).toContain('<div class="q-model">MMT-1170</div>');
  });

  it("uses the configured brand logo in the offer and rejects unsafe logo URLs", () => {
    const base = {
      firma: "Marka Logolu Müşteri",
      tarih: "30.07.2026",
      belgeNo: "CNC-2026/005-B",
      marka: "ECOCA",
      model: "MT-208",
      items: [{ urun: "ECOCA MT-208", birim: "1 Adet", fiyat: 100_000, tutar: 100_000 }],
      kdvOran: 0,
      kdvTutar: 0,
      currency: "USD" as const,
      notes: { key: "entered" as const, label: "Girilen şartlar", odeme: [], teslimat: [], garanti: [] },
    };
    const configured = quoteDoc({
      ...base,
      brandLogoUrl: "data:image/webp;base64,YnJhbmQtbG9nbw==",
    }, assetBase);
    const unsafe = quoteDoc({
      ...base,
      brandLogoUrl: "javascript:alert(1)",
    }, assetBase);

    expect(configured.body).toContain('src="data:image/webp;base64,YnJhbmQtbG9nbw=="');
    expect(configured.body).not.toContain('<div class="q-brand">ECOCA</div>');
    expect(unsafe.body).not.toContain("javascript:alert(1)");
    expect(unsafe.body).toContain('<div class="q-brand">ECOCA</div>');
  });

  it("uses the selected company logo as the offer letterhead", () => {
    const document = quoteDoc({
      firma: "Örnek & Firma",
      tarih: "30.07.2026",
      belgeNo: "CNC-2026/006",
      headerLogo: {
        mode: "company",
        imageUrl: "data:image/webp;base64,Y29tcGFueS1sb2dv",
        alt: "Örnek & Firma logosu",
      },
      items: [{ urun: "MMT-1170", birim: "1 Adet", fiyat: 100_000, tutar: 100_000 }],
      kdvOran: 0,
      kdvTutar: 0,
      currency: "USD",
      notes: { key: "entered", label: "Girilen şartlar", odeme: [], teslimat: [], garanti: [] },
    }, assetBase);

    expect(document.body).toContain('class="q-company-letterhead"');
    expect(document.body).toContain('src="data:image/webp;base64,Y29tcGFueS1sb2dv"');
    expect(document.body).toContain('alt="Örnek &amp; Firma logosu"');
    expect(document.body).not.toContain(`${assetBase}/haksan-letterhead.jpg`);
  });

  it("supports a logo-free offer and rejects unsafe company logo URLs", () => {
    const base = {
      firma: "Logo Güvenlik Müşterisi",
      tarih: "30.07.2026",
      belgeNo: "CNC-2026/007",
      items: [{ urun: "MMT-1170", birim: "1 Adet", fiyat: 100_000, tutar: 100_000 }],
      kdvOran: 0,
      kdvTutar: 0,
      currency: "USD" as const,
      notes: { key: "entered" as const, label: "Girilen şartlar", odeme: [], teslimat: [], garanti: [] },
    };
    const withoutLogo = quoteDoc({ ...base, headerLogo: { mode: "none" } }, assetBase);
    const unsafe = quoteDoc({
      ...base,
      headerLogo: { mode: "company", imageUrl: "javascript:alert(1)" },
    }, assetBase);

    expect(withoutLogo.body).toContain('class="q-empty-letterhead"');
    expect(withoutLogo.body).not.toContain(`${assetBase}/haksan-letterhead.jpg`);
    expect(unsafe.body).not.toContain("javascript:alert(1)");
    expect(unsafe.body).toContain(`${assetBase}/haksan-letterhead.jpg`);
  });

  it("always reserves the special-discount row in the offer price box", () => {
    const document = quoteDoc({
      firma: "İskontosuz Müşteri",
      tarih: "20.07.2026",
      belgeNo: "CNC-2026/002",
      items: [{ urun: "VM-2 CNC Dik İşleme Merkezi", birim: "1 Adet", fiyat: 10_000, tutar: 10_000 }],
      iskonto: 0,
      kdvOran: 0,
      kdvTutar: 0,
      currency: "USD",
      notes: { key: "entered", label: "Girilen şartlar", odeme: [], teslimat: [], garanti: [] },
    }, assetBase);

    expect(document.body).toContain("ÖZEL İSKONTO");
    expect(document.body).toContain("0,00 USD");
    expect(document.body.indexOf("ÖZEL İSKONTO")).toBeLessThan(document.body.indexOf("GENEL TOPLAM"));
  });

  it("shows quantity times unit price in the offer row while keeping totals discounted", () => {
    const document = quoteDoc({
      firma: "İskontolu Teklif Müşterisi",
      tarih: "31.07.2026",
      belgeNo: "CNC-2026/013",
      items: [{
        urun: "ECOCA SL-8 CNC Torna Tezgahı",
        birim: "1 Adet",
        fiyat: 59_400,
        indirim: 30_000,
        brutTutar: 59_400,
        tutar: 29_400,
      }],
      iskonto: 0,
      kdvOran: 0,
      kdvTutar: 0,
      currency: "USD",
      notes: { key: "entered", label: "Girilen şartlar", odeme: [], teslimat: [], garanti: [] },
    }, assetBase);

    expect(document.body).not.toContain("Ürüne özel iskonto");
    expect(document.body).toContain("-30.000,00 USD");
    expect(document.body).toContain("59.400,00 USD");
    expect(document.body).toMatch(/<td class="r" style="width:33mm">59\.400,00 USD<\/td>/);
    expect(document.body).toContain("29.400,00 USD");
    expect(document.body.match(/30\.000,00 USD/g) ?? []).toHaveLength(1);
    expect(document.body.indexOf("59.400,00 USD")).toBeLessThan(document.body.indexOf("GENEL TOPLAM"));
  });

  it("embeds a raster product photo and rejects executable image URLs", () => {
    const base = {
      firma: "Görselli Teklif",
      tarih: "20.07.2026",
      belgeNo: "CNC-2026/003",
      items: [{ urun: "VM-2 CNC Dik İşleme Merkezi", birim: "1 Adet", fiyat: 10_000, tutar: 10_000 }],
      kdvOran: 0,
      kdvTutar: 0,
      currency: "USD" as const,
      notes: { key: "entered", label: "Girilen şartlar", odeme: [], teslimat: [], garanti: [] },
    };
    const embedded = quoteDoc({ ...base, imageUrl: "data:image/png;base64,aW1hZ2U=" }, assetBase);
    const unsafe = quoteDoc({ ...base, imageUrl: "javascript:alert(1)" }, assetBase);

    expect(embedded.body).toContain('src="data:image/png;base64,aW1hZ2U="');
    expect(unsafe.body).not.toContain("javascript:alert(1)");
    expect(unsafe.body).toContain("q-photo-placeholder");
  });

  it("keeps the offer template intact while rendering every selected machine", () => {
    const document = quoteDoc({
      firma: "İki Makineli Teklif",
      tarih: "21.07.2026",
      belgeNo: "CNC-2026/010",
      machines: [
        {
          lineGroupKey: "a",
          urun: "ECOCA MT-208 CNC Torna",
          marka: "ECOCA",
          model: "MT-208",
          tip: "CNC Torna",
          imageUrl: "data:image/png;base64,bWFjaGluZTE=",
          specs: [{ key: "Çevirme Çapı", value: "550", unit: "mm" }],
          standartDonanim: ["Torna standart paketi"],
          opsiyonelDonanim: ["Talaş konveyörü"],
        },
        {
          lineGroupKey: "b",
          urun: "LK VM-2 CNC Dik İşleme Merkezi",
          marka: "LK",
          model: "VM-2",
          tip: "CNC Dik İşleme Merkezi",
          imageUrl: "data:image/png;base64,bWFjaGluZTI=",
          specs: [{ key: "X Ekseni", value: "800", unit: "mm" }],
          standartDonanim: ["İşleme merkezi standart paketi"],
          opsiyonelDonanim: ["Takım ölçme"],
        },
      ],
      items: [
        { urun: "ECOCA MT-208 CNC Torna", birim: "1 Adet", fiyat: 100_000, indirim: 10_000, tutar: 90_000 },
        { urun: "LK VM-2 CNC Dik İşleme Merkezi", birim: "2 Adet", fiyat: 75_000, indirim: 5_000, tutar: 145_000 },
      ],
      iskonto: 0,
      kdvOran: 0,
      kdvTutar: 0,
      currency: "USD",
      notes: { key: "entered", label: "Girilen şartlar", odeme: [], teslimat: [], garanti: [] },
    }, assetBase);

    expect(pages(document.body)).toBe(7);
    expect(document.body).toContain("MAKİNE 1 / 2");
    expect(document.body).toContain("MAKİNE 2 / 2");
    expect(document.body).toContain("MT-208");
    expect(document.body).toContain("VM-2");
    expect(document.body).toContain("Çevirme Çapı");
    expect(document.body).toContain("X Ekseni");
    expect(document.body).toContain("Talaş konveyörü");
    expect(document.body).toContain("Takım ölçme");
    expect(document.body).not.toContain("Ürüne özel iskonto");
    const firstPageStart = document.body.indexOf('<div class="page">');
    const secondPageStart = document.body.indexOf('<div class="page">', firstPageStart + 1);
    const customerMetaBlock = document.body.indexOf('class="q-top"');
    expect(customerMetaBlock).toBeGreaterThan(firstPageStart);
    expect(customerMetaBlock).toBeLessThan(secondPageStart);
    expect(document.body.slice(secondPageStart)).not.toContain('class="q-top"');
    expect(document.body.match(/class="q-top"/g) ?? []).toHaveLength(1);
    expect(document.body.match(/CNC-2026\/010/g) ?? []).toHaveLength(1);
    expect(document.body).toContain("-15.000,00 USD");
    expect(document.body).toContain("235.000,00 USD");
    expect(document.body).toContain("Sayfa <b>7</b> / <b>7</b>");
  });

  it("keeps all service quote rows and notes", () => {
    const document = serviceQuoteDoc({
      firma: "Servis Müşterisi",
      tarih: "14.07.2026",
      belgeNo: "CNC-SRV-2026/001",
      gecerlilik: "15 Gün",
      teklifiYazan: "Teknisyen",
      konu: "Bakım",
      items: Array.from({ length: 25 }, (_, index) => ({ urun: `SERVIS-KALEM-${index + 1}`, miktar: 1, birim: "Adet", fiyat: 100, tutar: 100 })),
      kdvOran: 20,
      kdvTutar: 500,
      currency: "TRY",
      notlar: Array.from({ length: 9 }, (_, index) => `SERVIS-NOT-${index + 1}`),
    }, assetBase);

    expect(pages(document.body)).toBe(5);
    expect(document.body).toContain("SERVIS-KALEM-25");
    expect(document.body).toContain("SERVIS-NOT-9");
    expect(document.body).toContain("3.000 TRY");
  });

  it("keeps the reference-shaped service quote on one A4 page", () => {
    const document = serviceQuoteDoc({
      firma: "Şahintek Makina",
      ilgili: "Adem Şahin",
      mobil: "0 (533) 357 01 19",
      adres: "Nilüfer OSB. 75. Yıl Cad. Demirciler San. Sit. E Bl. No:13 Nilüfer, Bursa",
      email: "info@sahintek.com",
      tarih: "6 Mayıs 2026",
      belgeNo: "SRV-2026/008",
      gecerlilik: "5 İş Günü",
      teklifiYazan: "Raif Şentürk",
      teklifiYazanUnvan: "Koordinatör",
      teklifiYazanEmail: "servis@haksancnc.com.tr",
      konu: "Teklifimiz 2048015201 Seri Numaralı LK VM-2 Cnc Dik İşleme Merkezi ATC arızasını kapsamaktadır.",
      items: [{ urun: "ATC Tool Gripper", miktar: 1, birim: "Ad.", fiyat: 150, tutar: 150 }],
      kdvOran: 20,
      kdvTutar: 0,
      currency: "USD",
      notlar: SERVICE_NOTE_VARIANTS[0].notlar,
    }, assetBase);

    expect(pages(document.body)).toBe(1);
    expect(document.body).not.toContain("— DEVAM");
    expect(document.body).toContain("150 USD");
    expect(document.body).toContain("0,00 USD");
    expect(document.body).toContain("MÜŞTERİ ONAYI");
  });

  it("never hides service operations or parts included in the total", () => {
    const document = serviceFormDoc({
      firma: "Servis Form Müşterisi",
      formNo: "SRV-001",
      islemler: Array.from({ length: 13 }, (_, index) => `ISLEM-${index + 1}`),
      parcalar: Array.from({ length: 7 }, (_, index) => ({ ad: `PARCA-${index + 1}`, miktar: "2", birimFiyat: 50 })),
      servisUcreti: 50,
      ulasimUcreti: 25,
      currency: "TRY",
      notlar: Array.from({ length: 9 }, (_, index) => `FORM-NOT-${index + 1}`),
    }, assetBase);

    expect(pages(document.body)).toBe(6);
    expect(document.body).toContain("ISLEM-13");
    expect(document.body).toContain("PARCA-7");
    expect(document.body).toContain("775,00");
    expect(document.body).toContain("FORM-NOT-9");
  });

  it("uses the real dynamic page count in long contracts", () => {
    const document = contractDoc({
      alici: { unvan: "Sözleşme Müşterisi" },
      sozlesmeNo: "UNI-SOZ-2026/001",
      sozlesmeTarihi: "2026-07-14",
      model: "MODEL-X",
      adet: 1,
      ozellikler: Array.from({ length: 41 }, (_, index) => ({ key: `CT-SPEC-${index + 1}`, value: "Değer" })),
      aksesuarlar: Array.from({ length: 25 }, (_, index) => `CT-AKS-${index + 1}`),
      fiyat: 100_000,
      currency: "EUR",
      kdvOran: 20,
      odemePlani: [],
    }, assetBase);

    const totalPages = pages(document.body);
    expect(totalPages).toBeGreaterThanOrEqual(3);
    expect(document.body).toContain(`toplam ${totalPages}`);
    expect(document.body).toContain("CT-SPEC-41");
    expect(document.body).toContain("CT-AKS-25");
    expect(document.body).not.toContain("Sözleşme No:");
    expect(document.body).toContain(`Sayfa <b>${totalPages}</b> / <b>${totalPages}</b>`);
  });

  it("prints the SL-8 shape: VAT included in the total and freight on the seller", () => {
    const base = {
      alici: { unvan: "NORM İNOX METAL ENDÜSTRİ LAZER SAN. İTH. İHR. LTD. ŞTİ." },
      sozlesmeNo: "CNC-SOZ-2026/030",
      sozlesmeTarihi: "2026-08-18",
      model: "ECOCA SL-8 Cnc Torna Tezgahı",
      adet: 1,
      ozellikler: [{ key: "Maks. Tornalama Kapasitesi", value: "Ø 320 mm" }],
      aksesuarlar: ["FANUC Oi-TF Plus Kontrol Ünitesi"],
      fiyat: 50_000,
      currency: "USD" as const,
      kdvOran: 20,
      // Bedel ve plan satırları kullanıcının girdiği nihai sözleşme tutarlarıdır.
      odemePlani: [{ label: "Siparişte peşin", tutar: 8_333.33, yontem: "Nakit" }],
      teslimYeri: "NORM İNOX METAL/Başakşehir tesisleri",
    };

    const sl8 = contractDoc({ ...base, kdvDahil: true, nakliyeSaticiya: true }, assetBase);
    expect(sl8.body).toContain("K.D.V.</span> dahildir");
    // Referans sözleşmedeki 50.000 USD KDV dahil nihai bedeldir; tekrar %20 eklenmez.
    expect(sl8.body).toContain("50.000,00 USD");
    expect(sl8.body).not.toContain("60.000,00 USD");
    expect(sl8.body).toContain("8.333,33 USD");
    // Ödeme planının üçüncü sütunu tahsilat yöntemi (referans sözleşmelerdeki tablo).
    expect(sl8.body).toContain('<td class="mtd">Nakit</td>');
    expect(sl8.body).toContain("NORM İNOX METAL/Başakşehir tesisleri adresine teslim");
    expect(sl8.body).toContain("nakliye ve sigorta giderleri HAKSAN MAKİNA'ya aittir");

    const defaults = contractDoc(base, assetBase);
    expect(defaults.body).toContain("K.D.V.</span> dahil değildir");
    expect(defaults.body).toContain("50.000,00 USD");
    expect(defaults.body).not.toContain("60.000,00 USD");
    expect(defaults.body).toContain("8.333,33 USD");
    expect(defaults.body).toContain("adresinden teslim");
  });

  it("drops contradictory legacy clauses when structural contract terms are set", () => {
    const document = contractDoc({
      alici: { unvan: "NORM İNOX METAL", kisaUnvan: "NORM İNOX METAL" },
      sozlesmeNo: "CNC-SOZ-2026/032",
      sozlesmeTarihi: "2026-08-18",
      model: "ECOCA SL-8",
      adet: 1,
      ozellikler: [],
      aksesuarlar: [],
      fiyat: 50_000,
      currency: "USD",
      kdvOran: 20,
      kdvDahil: true,
      ithalatMasraflariDahil: true,
      nakliyeSaticiya: true,
      teslimGunMin: 90,
      teslimGunMax: 90,
      teslimYeri: "NORM İNOX METAL/Başakşehir tesisleri",
      teslimKosullari: [
        "ESKI-KDV: Fiyatımıza K.D.V. dahil değildir.",
        "ESKI-TESLIM: Tezgah teslimi 10 gün içinde yapılacaktır.",
        "ESKI-NAVLUN: Tezgahın nakliye ve sigorta giderleri NORM İNOX METAL firmasına aittir.",
      ].join("\n"),
      odemePlani: [],
    }, assetBase);

    expect(document.body).not.toContain("ESKI-KDV");
    expect(document.body).not.toContain("ESKI-TESLIM");
    expect(document.body).not.toContain("ESKI-NAVLUN");
    expect(document.body).toContain("90 gün");
    expect(document.body).toContain("nakliye ve sigorta giderleri HAKSAN MAKİNA'ya aittir");
    expect(document.body).toContain("K.D.V.</span> dahildir");
  });

  it("keeps the complete SL-8 agreement on the signed two-page shape", () => {
    const document = contractDoc({
      alici: {
        unvan: "NORM İNOX METAL ENDÜSTRİ LAZER SAN. İTH. İHR. LTD. ŞTİ.",
        kisaUnvan: "NORM İNOX METAL",
        yetkili: "Eyüp KÖKLÜ",
        adres: "İkitelli O.S.B. Dersan Koop. Trios 2023 A Blk. No:57, Başakşehir, İstanbul",
        vergiDairesi: "İkitelli V.D.",
        vergiNo: "6221661606",
        tel: "0 212 801 81 91",
        mobil: "0 532 587 67 36",
      },
      sozlesmeNo: "CNC-SOZ-2026/005",
      sozlesmeTarihi: "2026-08-18",
      model: "ECOCA SL-8 CNC Torna Tezgahı",
      adet: 1,
      ozellikler: Array.from({ length: 12 }, (_, index) => ({ key: `Teknik özellik ${index + 1}`, value: `Değer ${index + 1}` })),
      aksesuarlar: Array.from({ length: 23 }, (_, index) => `Standart aksesuar ${index + 1}`),
      fiyat: 50_000,
      currency: "USD",
      kdvOran: 20,
      kdvDahil: true,
      nakliyeSaticiya: true,
      ithalatMasraflariDahil: true,
      teslimSekli: "İşletme Teslim",
      teslimGunMin: 90,
      teslimGunMax: 90,
      teslimYeri: "NORM İNOX METAL/Başakşehir tesisleri",
      odemeKosullari: "Siparişte 10.000 USD peşin, kalan bakiye 30 – 60 – 90 – 120 – 150 – 180 gün vadeli USD çekleri ile tahsil edilecektir.",
      garantiKosullari: "Kontrol ünitesi 2 yıl FANUC/Türkiye garantisi kapsamındadır.",
      odemePlani: [{ label: "Siparişte peşin", tutar: 10_000, yontem: "Nakit" }],
    }, assetBase);

    expect(pages(document.body)).toBe(2);
    expect(document.body).toContain("50.000,00 USD");
    expect(document.body).not.toContain("60.000,00 USD");
    expect(document.body).toContain("0 212 801 81 91");
    expect(document.body).toContain("0 532 587 67 36");
    expect(document.body).toContain("teknik destek, bilgi, belge, doküman ve yedek parça");
    expect(document.body).not.toContain("{{");
  });

  it("keeps final-price machine rows summing to the printed grand total", () => {
    // Satırlar tek tek yuvarlanınca 3×33.333,33 = 99.999,99 çıkıyor; kuruş
    // farkını son satır yutar, KDV dahil işareti tutarı yeniden büyütmez.
    const document = contractDoc({
      alici: { unvan: "Çok Tezgahlı Alıcı" },
      sozlesmeNo: "CNC-SOZ-2026/031",
      sozlesmeTarihi: "2026-08-18",
      model: "ÜÇLÜ SET",
      adet: 3,
      ozellikler: [],
      aksesuarlar: [],
      machines: [1, 2, 3].map((index) => ({
        model: `TEZGAH-${index}`,
        adet: 1,
        ozellikler: [],
        aksesuarlar: [],
        fiyat: 100_000 / 3,
      })),
      fiyat: 100_000,
      currency: "USD" as const,
      kdvOran: 18,
      kdvDahil: true,
      odemePlani: [],
    }, assetBase);

    const amounts = [...document.body.matchAll(/33\.333,3(\d) USD/g)].map((match) => match[1]);
    expect(amounts).toEqual(["3", "3", "4"]);
    expect(document.body).toContain("100.000,00 USD");
  });

  it("keeps the reference contract structure on three pages", () => {
    const document = contractDoc({
      alici: {
        unvan: "ZORKAYA MAKİNE METAL SAN. ve TİC. LTD. ŞTİ.",
        yetkili: "Halil ZORKAYA",
        adres: "Topçular Mah. Rami Kışla Cad. Gündoğar 1 İş Merkezi No:68 İç Kapı No:234 Eyüp, İstanbul",
        vergiDairesi: "Bayrampaşa",
        vergiNo: "9991413459",
        tel: "0 (532) 581 75 92",
        eposta: "firma@zorkaya.test",
      },
      sozlesmeNo: "CNC-SOZ-2024/001",
      sozlesmeTarihi: "2024-01-19",
      model: "LK MACHINERY VC-1000 Cnc İşleme Merkezi",
      adet: 1,
      ozellikler: Array.from({ length: 11 }, (_, index) => ({ key: `Özellik ${index + 1}`, value: "Değer" })),
      aksesuarlar: Array.from({ length: 20 }, (_, index) => `Standart aksesuar ${index + 1}`),
      teslimAyi: "2024 OCAK",
      teslimSekli: "Millileştirilmiş",
      ithalatMasraflariDahil: true,
      fiyat: 64_400,
      currency: "USD",
      kdvOran: 20,
      odemePlani: [
        { label: "Peşin", tutar: 30_000 },
        ...Array.from({ length: 10 }, (_, index) => ({
          label: `Teslimden ${(index + 1) * 30} Gün Sonra`,
          tutar: 3_440,
          senet: true,
        })),
      ],
    }, assetBase);

    expect(pages(document.body)).toBe(3);
    expect(document.body).toContain("1.1.1.");
    expect(document.body).toContain("Özellik 11");
    expect(document.body).toContain("1.1.2.");
    expect(document.body).toContain("Standart aksesuar 20");
    expect(document.body).toContain("2.6.");
    expect(document.body).toContain("4.4.");
    expect(document.body).toContain("TARAFLAR");
    expect(document.body).toContain("firma@zorkaya.test");
    expect(document.body).not.toContain("SÖZLEŞME TEKNİK EKİ");
    expect(document.body).not.toContain("Sözleşme No:");
  });

  it("renders each contracted machine in its own numbered technical section and price row", () => {
    const document = contractDoc({
      alici: { unvan: "ÇOKLU MAKİNE A.Ş." },
      sozlesmeNo: "CNC-SOZ-2026/010",
      sozlesmeTarihi: "2026-07-21",
      model: "ECOCA MT-208 / LK VM-2",
      adet: 3,
      ozellikler: [],
      aksesuarlar: [],
      fiyat: 235_000,
      currency: "USD",
      kdvOran: 20,
      odemePlani: [],
      machines: [
        { model: "ECOCA MT-208 CNC Torna", adet: 1, ozellikler: [{ key: "Çevirme Çapı", value: "550 mm" }], aksesuarlar: ["Talaş konveyörü"], fiyat: 90_000 },
        { model: "LK VM-2 CNC Dik İşleme Merkezi", adet: 2, ozellikler: [{ key: "X Ekseni", value: "800 mm" }], aksesuarlar: ["Takım ölçme"], fiyat: 145_000 },
      ],
    }, assetBase);

    expect(pages(document.body)).toBeGreaterThanOrEqual(3);
    expect(document.body).toContain("Sözleşmeye Konu Olan Tezgahlar ve Özellikleri");
    expect(document.body).toContain("1.1.1.");
    expect(document.body).toContain("1.2.1.");
    expect(document.body).toContain("ECOCA MT-208 CNC Torna");
    expect(document.body).toContain("LK VM-2 CNC Dik İşleme Merkezi");
    expect(document.body).toContain("90.000,00 USD");
    expect(document.body).toContain("145.000,00 USD");
    expect(document.body).toContain("235.000,00 USD");
  });

  it("paginates dispatch and delivery rows with continuous numbering", () => {
    const items = Array.from({ length: 25 }, (_, index) => ({ description: `SEVKIYAT-${index + 1}`, quantity: 1 }));
    const dispatch = dispatchNoteDoc({ irsaliyeNo: "IRS-001", items }, assetBase);
    const delivery = deliveryReceiptDoc({ formNo: "TES-001", items }, assetBase);

    expect(pages(dispatch.body)).toBe(3);
    expect(pages(delivery.body)).toBe(3);
    expect(dispatch.body).toContain("SEVKIYAT-25");
    expect(delivery.body).toContain("SEVKIYAT-25");
    expect(dispatch.body).toContain("Sayfa <b>3</b> / <b>3</b>");
    expect(delivery.body).toContain("Sayfa <b>3</b> / <b>3</b>");
  });

  it("keeps every installation check and long note on numbered pages", () => {
    const tail = "KURULUM-NOT-SON";
    const document = installationFormDoc({
      formNo: "KRL-001",
      firma: "Kurulum Müşterisi",
      checks: Array.from({ length: 25 }, (_, index) => ({ label: `KONTROL-${index + 1}`, status: "done" as const, note: `NOT-${index + 1}` })),
      problem: { hasProblem: true, note: `${"Problem açıklaması ".repeat(90)}PROBLEM-SON`, actionNote: "Parça değiştirildi" },
      notlar: `${"Kurulum ayrıntısı ".repeat(100)}${tail}`,
      kurulumuYapan: "Teknisyen",
      teslimAlan: "Yetkili",
    }, assetBase);

    expect(pages(document.body)).toBeGreaterThanOrEqual(7);
    expect(document.body).toContain("KONTROL-25");
    expect(document.body).toContain("PROBLEM-SON");
    expect(document.body).toContain(tail);
    expect(document.body).toContain(`Sayfa <b>${pages(document.body)}</b> / <b>${pages(document.body)}</b>`);
  });

  it("paginates service completion checks and notes without truncation", () => {
    const tail = "SERVIS-TAMAMLAMA-SON";
    const document = serviceCompletionFormDoc({
      formNo: "ST-001",
      firma: "Servis Müşterisi",
      checks: Array.from({ length: 25 }, (_, index) => ({ label: `SERVIS-KONTROL-${index + 1}`, status: "done" as const, note: `Açıklama ${index + 1}` })),
      yapilanIsler: `${"Yapılan işlem ayrıntısı ".repeat(100)}YAPILAN-IS-SON`,
      notlar: `${"Servis notu ".repeat(120)}${tail}`,
      kurulumuYapan: "Teknisyen",
      teslimAlan: "Yetkili",
    }, assetBase);

    expect(pages(document.body)).toBeGreaterThanOrEqual(7);
    expect(document.body).toContain("SERVIS-KONTROL-25");
    expect(document.body).toContain("YAPILAN-IS-SON");
    expect(document.body).toContain(tail);
    expect(document.body).toContain(`Sayfa <b>${pages(document.body)}</b> / <b>${pages(document.body)}</b>`);
  });

  it("fits long cargo label fields and escapes customer content", () => {
    const document = cargoLabelDoc({
      firma: `<img src=x onerror=alert(1)> ${"Uzun Firma ".repeat(12)}`,
      adres: "Çok uzun adres ".repeat(60),
      ilce: "Bayrampaşa",
      sehir: "İstanbul",
      tel: "0212 000 00 00",
    }, assetBase);

    expect(document.body).not.toContain("<img src=x");
    expect(document.body).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(document.css).toContain("font-size: 7.5pt");
    expect(document.css).toContain("overflow-wrap: anywhere");
  });

  it("keeps cargo recipient lines compact and prints the brand slogan at most once", () => {
    const document = cargoLabelDoc({
      firma: "Örnek Makina Sanayi A.Ş.",
      adres: "Organize Sanayi Bölgesi 10. Cadde No:4",
      ilce: "Nilüfer",
      sehir: "Bursa",
      tel: "0 (224) 000 00 00",
    }, assetBase);

    expect(document.body).toContain("Organize Sanayi Bölgesi 10. Cadde No:4<br>Nilüfer / Bursa");
    expect(document.body).toContain("Tel: 0 (224) 000 00 00");
    expect(document.body).not.toContain("Makina Marketiniz");
    expect(document.css).toContain("gap: 1.5mm");
    expect(document.css).not.toContain("white-space: pre-wrap");
  });

  it("moves long contract and transport text to numbered continuation pages", () => {
    const contract = contractDoc({
      alici: { unvan: "Uzun Sözleşme Müşterisi" },
      sozlesmeNo: "SACISLE-SOZ-2026/001",
      sozlesmeTarihi: "2026-07-14",
      model: "MODEL-X",
      adet: 1,
      ozellikler: [{ key: "Kapasite", value: "Teknik değer ".repeat(80) }],
      aksesuarlar: ["Aksesuar ayrıntısı ".repeat(70)],
      fiyat: 100_000,
      currency: "EUR",
      kdvOran: 20,
      odemePlani: [],
      teslimKosullari: `${"Teslimat koşulu ".repeat(120)}TESLIMAT-SON`,
      garantiKosullari: `${"Garanti koşulu ".repeat(120)}GARANTI-SON`,
      odemeKosullari: `${"Ödeme koşulu ".repeat(120)}ODEME-SON`,
      notlar: `${"Sözleşme notu ".repeat(120)}SOZLESME-NOT-SON`,
    }, assetBase);
    const items = Array.from({ length: 4 }, (_, index) => ({ description: `Cihaz ${index + 1} ${"ayrıntı ".repeat(80)}`, quantity: 1 }));
    const dispatch = dispatchNoteDoc({ irsaliyeNo: "IRS-UZUN", items, notlar: `${"Sevkiyat notu ".repeat(150)}SEVKIYAT-NOT-SON` }, assetBase);
    const delivery = deliveryReceiptDoc({ formNo: "TES-UZUN", items, notlar: `${"Teslimat notu ".repeat(150)}TESLIMAT-NOT-SON` }, assetBase);

    expect(pages(contract.body)).toBeGreaterThan(3);
    expect(contract.body).toContain("TESLIMAT-SON");
    expect(contract.body).toContain("GARANTI-SON");
    expect(contract.body).toContain("ODEME-SON");
    expect(contract.body).toContain("SOZLESME-NOT-SON");
    expect(dispatch.body).toContain("SEVKIYAT-NOT-SON");
    expect(delivery.body).toContain("TESLIMAT-NOT-SON");
    expect(dispatch.body).toContain(`Sayfa <b>${pages(dispatch.body)}</b> / <b>${pages(dispatch.body)}</b>`);
    expect(delivery.body).toContain(`Sayfa <b>${pages(delivery.body)}</b> / <b>${pages(delivery.body)}</b>`);
  });

  // ── Sözleşme sayfa bölünmesi ──────────────────────────────────────────────

  const contractBreakBase = {
    alici: { unvan: "Bölünme Müşterisi" },
    sozlesmeNo: "CNC-SOZ-2026/020",
    sozlesmeTarihi: "2026-07-14",
    model: "MODEL-X",
    adet: 1,
    ozellikler: [],
    aksesuarlar: [],
    fiyat: 100_000,
    currency: "USD" as const,
    kdvOran: 20,
    odemePlani: [],
  };

  it("keeps normal-length contract clauses from splitting across a page break", () => {
    const document = contractDoc(contractBreakBase, assetBase);

    // Şablonun sabit maddeleri (2.2., 2.3., 3.6. …) kısa; hepsi bütün kalmalı.
    const clauses = document.body.match(/<div class="ct-clause[^"]*"/g) ?? [];
    expect(clauses.length).toBeGreaterThan(5);
    expect(clauses.every((clause) => clause.includes("avoid-break"))).toBe(true);
    expect(document.css).toContain("orphans: 2; widows: 2");
  });

  it("lets a clause longer than a page split instead of clipping it", () => {
    const tail = "COK-UZUN-MADDE-SON";
    const document = contractDoc({
      ...contractBreakBase,
      // ~48 satırlık tek madde: bir sayfaya sığmaz. Bölünmez ilan edilirse
      // taşar/kırpılır; bu yüzden koruma sınıfı almamalı.
      teslimKosullari: `${"Teslimat koşulu ayrıntısı ".repeat(180)}${tail}`,
    }, assetBase);

    const longClause = [...document.body.matchAll(/<div class="ct-clause[^"]*">[^]*?<\/div>/g)]
      .find((match) => match[0].includes(tail))?.[0];
    expect(longClause).toBeDefined();
    expect(longClause).not.toContain("avoid-break");
    expect(document.body).toContain(tail);
  });

  it("does not strand a section heading at the bottom of a legal page", () => {
    const document = contractDoc({
      ...contractBreakBase,
      // "3. Fiyat ve Ödeme Şartları" başlığını sayfa sınırına itecek uzunluk.
      teslimKosullari: `${"Teslimat koşulu ".repeat(120)}TESLIMAT-SON`,
      garantiKosullari: `${"Garanti koşulu ".repeat(60)}GARANTI-SON`,
    }, assetBase);

    const legalPages = document.body.split('<div class="page ct">').slice(1);
    for (const page of legalPages) {
      const blocks = page.match(/<div class="ct-(?:h2|clause)[^"]*"/g) ?? [];
      if (blocks.length === 0) continue;
      // Bir sayfanın son bloğu başlık olmamalı: metni bir sonraki sayfada kalır.
      expect(blocks[blocks.length - 1]).not.toContain("ct-h2");
    }
  });

  it("keeps headings and machine lines with the content that follows them", () => {
    const document = contractDoc(contractBreakBase, assetBase);
    const headingRule = (document.css.match(/\.ct-h2[^{]*\{[^}]*\}/g) ?? [])
      .find((rule) => rule.includes("break-after")) ?? "";

    expect(headingRule).toContain(".ct-section-title");
    expect(headingRule).toContain(".ct-tech-heading");
    expect(headingRule).toContain(".ct-machine");
    expect(headingRule).toContain("break-after: avoid");
    expect(headingRule).toContain("page-break-after: avoid");
  });
});

describe("belge imzası", () => {
  const signature = { ad: "Ayşe Yılmaz", unvan: "Satış Müdürü", gorselUrl: "/signatures/media/sig-1" };
  const quoteBase = {
    firma: "İmza Testi",
    tarih: "01.08.2026",
    specs: [],
    standartDonanim: [],
    opsiyonelDonanim: [],
    items: [{ urun: "TEST", birim: "Adet", fiyat: 100, tutar: 100 }],
    iskonto: 0,
    kdvOran: 20,
    kdvTutar: 20,
    currency: "TRY" as const,
    notes: { key: "entered", label: "Girilen şartlar", odeme: [], teslimat: [], garanti: [] },
  };

  it("seçilen imzayı teklifte görsel ve adla basar", () => {
    const document = quoteDoc({ ...quoteBase, belgeNo: "CNC-2026/900", imza: signature }, assetBase);
    expect(document.body).toContain('src="/signatures/media/sig-1"');
    expect(document.body).toContain("Ayşe Yılmaz");
    expect(document.body).toContain("Satış Müdürü");
  });

  it("koda gömülü tek kişilik imza kontrolünü geri getirmez", () => {
    // Eskiden imza yalnız `projeIlgilisi` normalize edilip "raifşentürk"
    // içeriyorsa basılıyordu: başka hiç kimse için çalışmıyor, yeni imza
    // eklemek kod değişikliği + deploy gerektiriyordu.
    const document = quoteDoc(
      { ...quoteBase, belgeNo: "CNC-2026/901", projeIlgilisi: "Raif Şentürk" },
      assetBase,
    );
    expect(document.body).not.toContain("raif-signature.jpg");
    // İmza seçilmemişse satır proje ilgilisine düşer, görsel çıkmaz.
    expect(document.body).toContain("Raif Şentürk");
  });

  it("proformada da aynı imzayı görselle basar", () => {
    const proforma = proformaDoc(
      {
        firma: "İmza Testi",
        tarih: "01.08.2026",
        belgeNo: "PRF-900",
        items: [{ aciklama: "TEST", birim: "1 Adet", birimFiyati: 100, tutar: 100 }],
        kdvOran: 20,
        kdvTutar: 20,
        currency: "USD" as const,
        notlar: [],
        imza: signature,
      },
      assetBase,
    );
    expect(proforma.body).toContain('class="pf-signature"');
    expect(proforma.body).toContain("Ayşe Yılmaz");
    expect(proforma.css).toContain(".pf-signature");
  });

  const serviceQuoteBase = {
    firma: "İmza Testi",
    tarih: "01.08.2026",
    belgeNo: "SRV-2026/900",
    gecerlilik: "5 İş Günü",
    teklifiYazan: "Raif Şentürk",
    teklifiYazanUnvan: "Koordinatör",
    teklifiYazanEmail: "servis@haksancnc.com.tr",
    konu: "ATC arızası",
    items: [{ urun: "ATC Tool Gripper", miktar: 1, birim: "Ad.", fiyat: 150, tutar: 150 }],
    kdvOran: 20,
    kdvTutar: 30,
    currency: "USD" as const,
    notlar: [],
  };

  it("servis teklifinde seçilen imzayı basar", () => {
    const document = serviceQuoteDoc({ ...serviceQuoteBase, imza: signature }, assetBase);
    expect(document.body).toContain('src="/signatures/media/sig-1"');
    expect(document.body).toContain("Ayşe Yılmaz");
    expect(document.body).toContain("Satış Müdürü");
  });

  it("servis teklifinde koda gömülü imza kontrolüne geri dönmez", () => {
    // Bu şablon en son geçirilendi: `teklifiYazan === "raif şentürk"` kontrolü
    // ve sabit raif-signature.jpg burada duruyordu.
    const document = serviceQuoteDoc(serviceQuoteBase, assetBase);
    expect(document.body).not.toContain("raif-signature.jpg");
    expect(document.body).toContain("Raif Şentürk");
    expect(document.body).toContain("Koordinatör");
  });

  it("sözleşmede imza satırını hazırlayan yerine imzaya çevirir", () => {
    const withSignature = contractDoc(
      {
        alici: { unvan: "İmza Testi A.Ş." },
        sozlesmeNo: "UNI-SOZ-2026/900",
        sozlesmeTarihi: "2026-08-01",
        model: "MODEL-X",
        adet: 1,
        ozellikler: [],
        aksesuarlar: [],
        fiyat: 100_000,
        currency: "EUR" as const,
        kdvOran: 20,
        odemePlani: [],
        hazirlayan: "Hazırlayan Kişi",
        imza: signature,
      },
      assetBase,
    );
    expect(withSignature.body).toContain('class="ct-signature"');
    expect(withSignature.body).toContain("Ayşe Yılmaz");
    // İmza seçildiğinde satır "Hazırlayan" değil "İmza" olarak etiketlenir.
    expect(withSignature.body).toContain("İmza:");
    expect(withSignature.body).not.toContain("Hazırlayan Kişi");
  });
});
