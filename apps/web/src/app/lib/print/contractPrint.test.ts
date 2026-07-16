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
  });
});
