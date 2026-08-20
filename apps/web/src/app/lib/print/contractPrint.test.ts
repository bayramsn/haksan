import { describe, expect, it } from "vitest";
import { loadContractPrintData } from "./contractPrint";

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
      { label: "1. taksit senet", tutar: 40_000, senet: true },
      { label: "2. taksit", tutar: 60_000, senet: false },
    ]);
  });
});
