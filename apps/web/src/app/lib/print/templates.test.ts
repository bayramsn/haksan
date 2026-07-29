import { describe, expect, it } from "vitest";
import {
  cargoLabelDoc,
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
    expect(document.body).toContain("66.825,00 USD");
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
    expect(document.body).not.toContain("ÖZEL İSKONTO");
    expect(document.body).not.toContain(">İskonto<");
    expect(document.body).toContain("1.020,00");
    expect(document.body).not.toContain("<script>");
    expect(document.body).toContain("&lt;script&gt;");
    expect(document.body).not.toContain("DEVAM");
    expect(document.body).not.toContain("class=\"pageno\"");
    const scale = Number(document.body.match(/transform:scale\(([\d.]+)\)/)?.[1]);
    expect(scale).toBeLessThan(1);
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
    expect(document.body).toContain("Ürüne özel iskonto: 10.000,00 USD");
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
    expect(totalPages).toBeGreaterThan(3);
    expect(document.body).toContain(`toplam ${totalPages}`);
    expect(document.body).toContain("CT-SPEC-41");
    expect(document.body).toContain("CT-AKS-25");
    expect(document.body).not.toContain("Sözleşme No:");
    expect(document.body).toContain(`Sayfa <b>${totalPages}</b> / <b>${totalPages}</b>`);
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
    expect(document.body).toContain("3.9.");
    expect(document.body).toContain("TARAFLAR");
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

    expect(pages(document.body)).toBeGreaterThanOrEqual(4);
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
});
