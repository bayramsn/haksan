import { describe, expect, it } from "vitest";
import type { DocumentItem, Product } from "../mock";
import { buildProformaPrintData } from "./proformaPrint";

const baseDoc = (documentSnapshot: Record<string, unknown>): DocumentItem => ({
  id: "proforma-1",
  salesCaseId: "",
  quoteId: "quote-1",
  companyId: "company-1",
  type: "Proforma",
  fileName: "CNC-PRF-2026/005",
  uploadedBy: "user-1",
  uploadedAt: "2026-02-25",
  size: "Kayıt",
  documentSnapshot,
});

const build = (doc: DocumentItem, products: Product[] = []) =>
  buildProformaPrintData({ doc, customers: [], cases: [], offers: [], products, contacts: [] });

describe("proforma print data", () => {
  it("maps every filled reference field from a schema v2 document snapshot", () => {
    const result = build(baseDoc({
      schemaVersion: 2,
      company: {
        legalTitle: "BARTIN OTOMOTİV PAZARLAMA VE TİC.LTD.ŞTİ.",
        taxOffice: "Bartın",
        taxNumber: "142 006 63 99",
      },
      contact: { fullName: "Satın Alma", mobilePhone: "0532 000 00 00", workPhone: "0 378 227 46 96" },
      companyAddresses: [{ fullAddress: "Gecen köyü aşağı düz mevk.No:47/1 Bartın" }],
      companyPhones: [
        { phoneType: "main", phone: "0 378 227 46 96", isDefault: true },
        { phoneType: "fax", phone: "0 378 227 81 05" },
      ],
      quote: { vatAmount: 0, discountTotal: 0 },
      currency: { code: "USD" },
      items: [{
        description: "L.K. MACHINERY VM-2 Cnc Dik İşleme Merkezi",
        productModelId: "product-1",
        product: {
          brandName: "L.K. MACHINERY",
          originCountry: "Tayvan",
          hsCode: "8457.1090.0011",
        },
        quantity: 1,
        unitCode: "adet",
        unitPrice: 66_825,
        discountAmount: 0,
        vatRate: 20,
        lineTotal: 66_825,
      }],
      terms: { paymentTermsText: "Peşin ödeme" },
    }));

    expect(result).toMatchObject({
      firma: "BARTIN OTOMOTİV PAZARLAMA VE TİC.LTD.ŞTİ.",
      ilgili: "Satın Alma",
      mobil: "0532 000 00 00",
      adres: "Gecen köyü aşağı düz mevk.No:47/1 Bartın",
      tel: "0 378 227 46 96",
      faks: "0 378 227 81 05",
      vergiDairesi: "Bartın",
      vergiNo: "142 006 63 99",
      tarih: "25 Şubat 2026",
      belgeNo: "CNC-PRF-2026/005",
      currency: "USD",
    });
    expect(result.items[0]).toMatchObject({
      aciklama: "L.K. MACHINERY VM-2 Cnc Dik İşleme Merkezi",
      marka: "L.K. MACHINERY",
      mensei: "Tayvan",
      gtip: "8457.1090.0011",
      birim: "1 Adet",
      birimFiyati: 66_825,
      tutar: 66_825,
    });
  });

  it("fills missing product metadata for legacy snapshots from the catalog", () => {
    const catalogProduct = {
      id: "product-legacy",
      brand: "ECOCA",
      originCountry: "Tayvan",
      hsCode: "8458.11",
      shortDescription: "ECOCA MT-208",
    } as Product;
    const result = build(baseDoc({
      schemaVersion: 1,
      company: { legalTitle: "Eski Belge Müşterisi" },
      quote: { vatAmount: 0 },
      currency: { code: "EUR" },
      items: [{
        description: "ECOCA MT-208 CNC Torna",
        productModelId: "product-legacy",
        quantity: 2,
        unitPrice: 10_000,
        discountAmount: 0,
        vatRate: 20,
        lineTotal: 20_000,
      }],
    }), [catalogProduct]);

    expect(result.items[0]).toMatchObject({ marka: "ECOCA", mensei: "Tayvan", gtip: "8458.11" });
  });

  it("hızlı proformada elle girilen modeli PDF satırına taşır", () => {
    // Katalog bağı olmayan kalemlerde model yalnız snapshot'tan gelebilir;
    // açıklamaya gömülmesi `publicProductLabel` onu ezdiği için doğru değil.
    const result = build(baseDoc({
      items: [{
        description: "Cnc Dik İşleme Merkezi",
        product: { brandName: "ECOCA", modelName: "MT-210/1000", originCountry: "Tayvan" },
        quantity: 1,
        unitCode: "adet",
        unitPrice: 1_000,
        discountAmount: 0,
        vatRate: 20,
        lineTotal: 1_000,
      }],
    }));

    expect(result.items[0]).toMatchObject({ marka: "ECOCA", model: "MT-210/1000", mensei: "Tayvan" });
  });

  it("model girilmediğinde satırı hiç üretmez", () => {
    const result = build(baseDoc({
      items: [{
        description: "Danışmanlık",
        product: { brandName: "ECOCA" },
        quantity: 1,
        unitCode: "adet",
        unitPrice: 500,
        discountAmount: 0,
        vatRate: 20,
        lineTotal: 500,
      }],
    }));

    expect(result.items[0].model).toBeUndefined();
  });

  it("keeps gross item prices and exposes line and special discounts separately", () => {
    const result = build(baseDoc({
      schemaVersion: 2,
      company: { legalTitle: "İskontolu Müşteri" },
      quote: { vatAmount: 0, discountTotal: 300 },
      currency: { code: "USD" },
      items: [{
        description: "VM-2 CNC Dik İşleme Merkezi",
        quantity: 2,
        unitPrice: 1_000,
        discountAmount: 200,
        vatRate: 0,
        lineTotal: 1_800,
      }],
    }));

    expect(result.headerDiscount).toBe(100);
    expect(result.items[0]).toMatchObject({ birimFiyati: 1_000, iskonto: 200, tutar: 2_000 });
  });

  it("prints every machine as a separate gross-priced proforma row", () => {
    const result = build(baseDoc({
      schemaVersion: 2,
      company: { legalTitle: "Çoklu Makine Müşterisi" },
      quote: { vatAmount: 0, discountTotal: 300 },
      currency: { code: "USD" },
      items: [
        { description: "ECOCA MT-208 CNC Torna", quantity: 1, unitPrice: 1_000, discountAmount: 100, vatRate: 0, lineTotal: 900 },
        { description: "LK VM-2 CNC Dik İşleme Merkezi", quantity: 2, unitPrice: 500, discountAmount: 100, vatRate: 0, lineTotal: 900 },
      ],
    }));

    expect(result.items).toHaveLength(2);
    expect(result.headerDiscount).toBe(100);
    expect(result.items[0]).toMatchObject({ aciklama: "ECOCA MT-208 CNC Torna", birimFiyati: 1_000, iskonto: 100, tutar: 1_000 });
    expect(result.items[1]).toMatchObject({ aciklama: "LK VM-2 CNC Dik İşleme Merkezi", birimFiyati: 500, iskonto: 100, tutar: 1_000 });
    expect(result.items.reduce((sum, item) => sum + item.tutar, 0)).toBe(2_000);
  });

  it("uses the catalog product name and removes the internal stock code", () => {
    const stockCode = "HAXAN.MMT-1170.15K.DDS.M.30T";
    const product = {
      id: "machine-with-code",
      stockCode,
      shortDescription: "HAXAN MMT-1170 CNC Dik İşleme Merkezi",
    } as Product;
    const result = build(baseDoc({
      schemaVersion: 2,
      company: { legalTitle: "PDF Müşterisi" },
      quote: { vatAmount: 0 },
      currency: { code: "USD" },
      items: [{
        productModelId: product.id,
        stockCode,
        description: `${stockCode} - HAXAN MMT-1170 CNC Dik İşleme Merkezi`,
        quantity: 1,
        unitPrice: 1,
        lineTotal: 1,
      }],
    }), [product]);

    expect(result.items[0].aciklama).toBe("HAXAN MMT-1170 CNC Dik İşleme Merkezi");
    expect(JSON.stringify(result)).not.toContain(stockCode);
  });
});
