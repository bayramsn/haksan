import { describe, expect, it } from "vitest";
import { assertContractReady, contractReadinessErrors, loadContractPrintData } from "./contractPrint";

describe("contract print data", () => {
  it("maps the finalized snapshot without applying the header discount twice", async () => {
    const data = await loadContractPrintData({
      customer: null,
      salesCase: {} as never,
      products: [],
      payments: [],
      contractDate: "2024-01-19",
      contractNo: "CNC-SOZ-2024/001",
      documentSnapshot: {
        quote: {
          subtotal: "90000",
          headerDiscountAmount: "10000",
        },
        company: {
          legalTitle: "ÖRNEK MAKİNE SAN. ve TİC. LTD. ŞTİ.",
          taxOffice: "Bayrampaşa",
          taxNumber: "1234567890",
        },
        companyAddresses: [{ fullAddress: "Örnek Mah. No:1 İstanbul" }],
        companyPhones: [{ phoneType: "main", phone: "0 212 000 00 00" }],
        companyEmails: [{ emailType: "main", email: "firma@ornek.test", isDefault: true }],
        contact: {},
        currency: { code: "USD" },
        items: [{
          description: "LK VC-1000 Cnc İşleme Merkezi",
          quantity: "1",
          vatRate: "20",
          compatibility: {
            technicalSpecs: [{ key: "Cnc Kontrol Ünitesi", value: "Mitsubishi M80" }],
          },
        }],
        terms: {
          deliveryTermsText: "Tezgah Millileştirilmiş teslim edilecektir.",
          deliveryLocation: "Hadımköy tesisleri",
          estimatedDeliveryDaysMax: 90,
          importCostsExcluded: false,
        },
        receivables: [],
      },
    });

    expect(data.fiyat).toBe(90_000);
    expect(data.teslimSekli).toBe("Millileştirilmiş");
    expect(data.ithalatMasraflariDahil).toBe(true);
    expect(data.teslimYeri).toBe("Hadımköy tesisleri");
    expect(data.teslimAyi).toBe("2024 NİSAN");
    expect(data.kontrolUnitesiMarka).toBe("MITSUBISHI");
    expect(data.alici.tel).toBe("0 212 000 00 00");
    expect(data.alici.eposta).toBe("firma@ornek.test");
  });

  it("maps multiple machines with separate specs, options and allocated net prices", async () => {
    const data = await loadContractPrintData({
      customer: null,
      salesCase: {} as never,
      products: [
        { id: "machine-1", standardEquipment: ["Torna standart paketi"] },
        { id: "machine-2", standardEquipment: ["İşleme merkezi standart paketi"] },
      ] as never,
      payments: [],
      contractDate: "2026-07-21",
      contractNo: "CNC-SOZ-2026/010",
      documentSnapshot: {
        quote: { subtotal: "2600", discountTotal: "300" },
        company: { legalTitle: "ÇOKLU MAKİNE A.Ş." },
        currency: { code: "USD" },
        items: [
          { productModelId: "machine-1", description: "ECOCA MT-208 CNC Torna", quantity: 1, unitPrice: 1500, discountAmount: 100, lineTotal: 1400, compatibility: { lineGroupKey: "a", technicalSpecs: [{ key: "Çevirme Çapı", value: "550", unit: "mm" }] } },
          { description: "↳ Opsiyon: Talaş konveyörü", quantity: 1, unitPrice: 200, discountAmount: 0, lineTotal: 200, compatibility: { lineGroupKey: "a" } },
          { productModelId: "machine-2", description: "LK VM-2 CNC Dik İşleme Merkezi", quantity: 2, unitPrice: 600, discountAmount: 100, lineTotal: 1100, compatibility: { lineGroupKey: "b", technicalSpecs: [{ key: "X Ekseni", value: "800", unit: "mm" }] } },
        ],
        terms: {},
        receivables: [],
      },
    });

    expect(data.machines).toHaveLength(2);
    expect(data.machines?.[0]).toMatchObject({
      model: "ECOCA MT-208 CNC Torna",
      adet: 1,
      aksesuarlar: ["Torna standart paketi", "Talaş konveyörü"],
    });
    expect(data.machines?.[0].ozellikler).toContainEqual({ key: "Çevirme Çapı", value: "550 mm" });
    expect(data.machines?.[1]).toMatchObject({
      model: "LK VM-2 CNC Dik İşleme Merkezi",
      adet: 2,
      aksesuarlar: ["İşleme merkezi standart paketi"],
    });
    expect(data.machines?.[1].ozellikler).toContainEqual({ key: "X Ekseni", value: "800 mm" });
    expect(data.machines?.reduce((sum, machine) => sum + machine.fiyat, 0)).toBeCloseTo(2_600, 6);
    expect(data.fiyat).toBe(2_600);
  });

  it("omits dash-valued technical fields from the contract PDF projection", async () => {
    const data = await loadContractPrintData({
      customer: null,
      salesCase: {} as never,
      products: [],
      payments: [],
      contractDate: "2026-08-13",
      contractNo: "CNC-SOZ-2026/020",
      documentSnapshot: {
        quote: { subtotal: "1000" },
        company: { legalTitle: "TEKNİK ALAN TEST A.Ş." },
        currency: { code: "USD" },
        items: [{
          description: "CNC Torna",
          quantity: 1,
          unitPrice: 1000,
          lineTotal: 1000,
          compatibility: {
            technicalSpecs: [
              { key: "Karşı Ayna Devri", value: "-", unit: "dev/dk" },
              { key: "Canlı Takım Devri", value: "4500", unit: "dev/dk" },
            ],
          },
        }],
        terms: {},
        receivables: [],
      },
    });

    expect(data.ozellikler).not.toContainEqual(expect.objectContaining({ key: "Karşı Ayna Devri" }));
    expect(data.ozellikler).toContainEqual({ key: "Canlı Takım Devri", value: "4500 dev/dk" });
  });

  it("removes the internal stock code from machine labels", async () => {
    const stockCode = "HAXAN.MMT-1170.15K.DDS.M.30T";
    const data = await loadContractPrintData({
      customer: null,
      salesCase: {} as never,
      products: [{
        id: "machine-1",
        stockCode,
        shortDescription: "HAXAN MMT-1170 CNC Dik İşleme Merkezi",
      }] as never,
      payments: [],
      contractDate: "2026-07-31",
      contractNo: "CNC-SOZ-2026/011",
      documentSnapshot: {
        quote: { subtotal: "1000" },
        company: { legalTitle: "PDF Müşterisi" },
        currency: { code: "USD" },
        items: [{
          productModelId: "machine-1",
          stockCode,
          description: `${stockCode} - HAXAN MMT-1170 CNC Dik İşleme Merkezi`,
          quantity: 1,
          unitPrice: 1000,
          lineTotal: 1000,
        }],
        terms: {},
        receivables: [],
      },
    });

    expect(data.machines?.[0].model).toBe("HAXAN MMT-1170 CNC Dik İşleme Merkezi");
    expect(JSON.stringify(data)).not.toContain(stockCode);
  });

  it("falls back to the live payment plan when a draft snapshot froze before installments existed", async () => {
    const data = await loadContractPrintData({
      customer: null,
      salesCase: { id: "case-payment-plan" } as never,
      products: [],
      payments: [
        {
          id: "second",
          salesCaseId: "case-payment-plan",
          customerId: "company-1",
          paymentType: "expected",
          direction: "in",
          amount: 60_000,
          currency: "USD",
          dueDate: "2026-10-01",
          status: "Pending",
          note: "2. taksit",
        },
        {
          id: "first",
          salesCaseId: "case-payment-plan",
          customerId: "company-1",
          paymentType: "expected",
          direction: "in",
          amount: 40_000,
          currency: "USD",
          dueDate: "2026-09-01",
          status: "Pending",
          note: "1. taksit senet",
        },
        {
          id: "other-case",
          salesCaseId: "other-case",
          customerId: "company-2",
          paymentType: "expected",
          direction: "in",
          amount: 999_999,
          currency: "USD",
          dueDate: "2026-08-01",
          status: "Pending",
          note: "Başka kart",
        },
      ],
      contractDate: "2026-08-10",
      contractNo: "CNC-SOZ-2026/012",
      documentSnapshot: {
        quote: { subtotal: 100_000 },
        company: { legalTitle: "ÖDEME PLANI TEST A.Ş." },
        currency: { code: "USD" },
        items: [{ description: "Test CNC", quantity: 1, unitPrice: 100_000, lineTotal: 100_000 }],
        terms: {},
        // Sözleşme payment_plan aşamasından önce oluşturulduğu için boş.
        receivables: [],
      },
    });

    expect(data.odemePlani).toEqual([
      { label: "1. taksit senet", tutar: 40_000, senet: true, yontem: "Senet" },
      { label: "2. taksit", tutar: 60_000, senet: false, yontem: undefined },
    ]);
  });

  it("projects the signed NORMINOX SL-8 agreement without price, party or template drift", async () => {
    const accessories = [
      "FANUC 0i-TF Plus Kontrol Ünitesi, LCD Renkli Ekran",
      "Flash Memory Tip Kart Girişi, USB Arayüzü",
      "Hidrolik 10 İstasyonlu Taret",
      "8” (200 mm) 3 Ayaklı Hidrolik Ayna Seti",
      "RENISHAW Tam Otomatik Takım Boyu Ölçme Kolu",
      "Tam Kapalı Kabin, Çalışma Lambası",
      "3 Renkli Alarm Lambası",
      "Programlanabilir Karşı Punta Pinolü",
      "Talaş Konveyörü & Talaş Arabası",
      "Yüksek Basınçlı Soğutma Sıvısı Sistemi",
      "Otomatik Tezgah Yağlama Sistemi",
      "Transformatör, Takımlar & Takım Çantası",
      "Kullanma ve Bakım Kılavuzları",
      "Dengeye Alma Ayakları ve Vidaları",
      "CE Normlarına Uygun Elektrik ve Güvenlik Donanımı",
      "Dış Çap Bağlama Aparatı (6 Adet)",
      "Alın Kater Tutucu (2 Adet)",
      "İç Çap Kater Tutucu (6 Adet)",
      "Mors Konik Tutucu (2 Adet)",
      "İç Çap Redüksiyon Kovanları (1 Set)",
      "Ayna İçin Sert Ayak Takımı (1 Set)",
      "Ayna İçin Yumuşak Ayak Takımı (5 Set)",
      "Döner Punta Seti (1 Set)",
    ];
    const technicalSpecs = [
      { key: "Maks. Tornalama Kapasitesi", value: "Ø 320 mm" },
      { key: "Maks. Tornalama Boyu", value: "480 mm" },
      { key: "Çubuk İşleme Kapasitesi", value: "Ø 52 mm" },
      { key: "İş Mili Devri", value: "4.500 dv/dk" },
      { key: "İş Mili Motor Gücü", value: "15 kW" },
      { key: "Hidrolik Ayna Çapı", value: "8” (Ø 200 mm)" },
      { key: "Kızak Tipi", value: "Hassas Lineer Kızak" },
      { key: "X, Z Eksen Motor Gücü", value: "2,5 kW / 2,5 kW" },
      { key: "Taret Tipi", value: "Hidrolik, 10 İstasyon" },
      { key: "Karşı Punta Pinol Hareketi", value: "88 mm" },
      { key: "Karşı Punta Pinol Çapı", value: "Ø 58 mm" },
      { key: "Tezgah Ağırlığı", value: "3.350 kg" },
    ];
    const data = await loadContractPrintData({
      customer: null,
      salesCase: { id: "norminox-sl8" } as never,
      products: [{
        id: "ecoca-sl8",
        shortDescription: "ECOCA SL-8 CNC Torna Tezgahı",
        productionYear: 2026,
        controlPanel: "FANUC 0i-TF Plus",
        standardEquipment: ["CANLI-KATALOG-SONRADAN-DEGISTI"],
      }] as never,
      payments: [],
      contractDate: "2026-08-18",
      contractNo: "CNC-SOZ-2026/005",
      documentSnapshot: {
        document: { finalizedAt: "2026-08-18T12:00:00+03:00" },
        quote: { subtotal: 50_000, discountTotal: 0, vatAmount: 10_000, grandTotal: 60_000 },
        company: {
          legalTitle: "NORM İNOX METAL ENDÜSTRİ LAZER SAN. İTH. İHR. LTD. ŞTİ.",
          shortName: "NORM İNOX METAL",
          taxOffice: "İkitelli V.D.",
          taxNumber: "6221661606",
        },
        companyAddresses: [{
          fullAddress: "İkitelli O.S.B. Dersan Koop. Trios 2023 A Blk. No:57",
          district: "Başakşehir",
          province: "İstanbul",
          country: "Türkiye",
        }],
        companyPhones: [{ phoneType: "main", phone: "02128018191" }],
        contact: { fullName: "Eyüp KÖKLÜ", mobilePhone: "05325876736" },
        currency: { code: "USD" },
        items: [{
          productModelId: "ecoca-sl8",
          description: "ECOCA SL-8 CNC Torna Tezgahı",
          quantity: 1,
          unitPrice: 50_000,
          lineTotal: 50_000,
          vatRate: 20,
          product: { standardEquipment: accessories },
          compatibility: { technicalSpecs },
        }],
        terms: {
          paymentTermsText: "Sözleşmeye konu tezgah İŞLETME TESLİM şeklinde fiyatlandırılmıştır.\nÖdeme tarihinde {{ALICI}}, HAKSAN MAKİNA'dan kur bilgisi alacaktır.",
          deliveryTermsText: "Tezgahın teslimi sözleşme tarihinden itibaren 90 gün sonra gerçekleştirilecektir.",
          warrantyTermsText: "Kontrol ünitesi 2 yıl {{KONTROL_MARKA}}/Türkiye garantisi kapsamındadır.",
          deliveryLocation: "NORM İNOX METAL/Başakşehir tesisleri",
          estimatedDeliveryDaysMin: 90,
          estimatedDeliveryDaysMax: 90,
          importCostsExcluded: false,
          vatIncluded: true,
          freightPaidBySeller: true,
        },
        receivables: [{ amount: 10_000, dueDate: "2026-08-18", notes: "Siparişte peşin", paymentMethod: "cash" }],
      },
    });

    expect(data.fiyat).toBe(50_000);
    expect(data.currency).toBe("USD");
    expect(data.alici).toMatchObject({
      kisaUnvan: "NORM İNOX METAL",
      tel: "0 212 801 81 91",
      mobil: "0 532 587 67 36",
      vergiNo: "6221661606",
    });
    expect(data.alici.unvan).toContain("İTH. İHR.");
    expect(data.alici.adres).toContain("Başakşehir, İstanbul");
    expect(data.machines?.[0].ozellikler).toHaveLength(12);
    expect(data.machines?.[0].aksesuarlar).toHaveLength(23);
    expect(data.machines?.[0].ozellikler).toContainEqual({ key: "Hidrolik Ayna Çapı", value: "8” (Ø 200 mm)" });
    expect(data.teslimSekli).toBe("İşletme Teslim");
    expect(data.teslimAyi).toBe("2026 KASIM");
    expect(data.ithalatMasraflariDahil).toBe(true);
    expect(data.kdvDahil).toBe(true);
    expect(data.nakliyeSaticiya).toBe(true);
    expect(data.odemePlani).toEqual([{ label: "Siparişte peşin", tutar: 10_000, senet: false, yontem: "Nakit" }]);
    expect(JSON.stringify(data)).not.toContain("{{");
    expect(contractReadinessErrors(data)).toEqual([]);
  });

  it("blocks printing when party, price, item or template data is incomplete", () => {
    const incomplete = {
      alici: { unvan: "", adres: "", vergiDairesi: "", vergiNo: "" },
      sozlesmeNo: "CNC-SOZ-2026/999",
      sozlesmeTarihi: "2026-08-20",
      model: "{{MODEL}}",
      adet: 0,
      ozellikler: [],
      aksesuarlar: [],
      machines: [],
      fiyat: 0,
      currency: "USD" as const,
      kdvOran: 20,
      odemePlani: [],
    };

    expect(contractReadinessErrors(incomplete)).toEqual([
      "firma unvanı",
      "firma adresi",
      "vergi dairesi",
      "vergi numarası",
      "telefon",
      "sözleşme kalemi",
      "sözleşme bedeli",
      "doldurulmamış şablon alanı",
    ]);
    expect(() => assertContractReady(incomplete)).toThrow(/Sözleşme tamamlanmadan basılamaz/);
  });
});
