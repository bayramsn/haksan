import { describe, expect, it } from "vitest";
import type { Customer, Offer, Product } from "../mock";
import { loadContractPrintData } from "./contractPrint";
import { buildProformaPrintData } from "./proformaPrint";
import { buildQuotePrintData } from "./quotePrint";
import { proformaDoc, quoteDoc } from "./templates";

const offer = {
  id: "quote-1",
  date: "2026-07-16",
  quoteNo: "CNC-2026/001",
  currency: "USD",
} as Offer;

const customer = {
  id: "company-1",
  name: "Örnek Firma",
  addresses: [
    {
      id: "billing-address",
      addressType: "billing",
      address: "Fatura Mah. No:1",
      city: "İstanbul",
      country: "Türkiye",
      isBilling: true,
    },
    {
      id: "selected-address",
      addressType: "shipping",
      address: "Seçilen Cad. No:42",
      district: "Nilüfer",
      city: "Bursa",
      country: "Türkiye",
    },
  ],
} as Customer;

const build = (quote: Record<string, unknown>) => buildQuotePrintData({
  offer,
  customer,
  salesCase: null,
  users: [],
  contacts: [],
  products: [],
}, quote as never);

describe("quote print address", () => {
  it("prints the assigned personal title below the selected sender", () => {
    const result = buildQuotePrintData({
      offer,
      customer,
      salesCase: null,
      users: [{
        id: "sender-1",
        name: "Ayşe Yılmaz",
        email: "ayse@example.test",
        department: "Satış",
        title: "Kıdemli Satış Uzmanı",
      }] as never,
      contacts: [],
      products: [],
    }, {
      quoteDate: "2026-07-16",
      documentNo: "CNC-2026/001",
      projectOwnerUserId: "sender-1",
      items: [],
      terms: {},
    } as never);

    expect(result.projeIlgilisi).toBe("Ayşe Yılmaz");
    expect(result.projeIlgilisiUnvan).toBe("Kıdemli Satış Uzmanı");
    expect(quoteDoc(result, "/brand").body).toContain("Kıdemli Satış Uzmanı");
  });

  it("carries the selected company logo into the PDF data", () => {
    const result = buildQuotePrintData({
      offer,
      customer: {
        ...customer,
        logoUrl: "/api/v1/companies/media/logo-file-1",
      },
      salesCase: null,
      users: [],
      contacts: [],
      products: [],
      headerLogoMode: "company",
    }, {
      quoteDate: "2026-07-16",
      documentNo: "CNC-2026/001",
      items: [],
      terms: {},
    } as never);

    expect(result.headerLogo).toEqual({
      mode: "company",
      imageUrl: "/api/v1/companies/media/logo-file-1",
      alt: "Örnek Firma logosu",
    });
  });

  it("writes the address selected on the quote", () => {
    const result = build({
      companyAddressId: "selected-address",
      quoteDate: "2026-07-16",
      documentNo: "CNC-2026/001",
      validityDays: 15,
      items: [],
      terms: {},
    });

    expect(result.adres).toBe("Seçilen Cad. No:42 Nilüfer Bursa Türkiye");
  });

  it("keeps using the frozen snapshot address after finalization", () => {
    const result = build({
      companyAddressId: "billing-address",
      quoteDate: "2026-07-16",
      documentNo: "CNC-2026/001",
      validityDays: 15,
      items: [],
      terms: {},
      documentSnapshot: {
        companyAddresses: [{ fullAddress: "Belgeye Sabitlenen Adres Ankara" }],
      },
    });

    expect(result.adres).toBe("Belgeye Sabitlenen Adres Ankara");
  });

  it("uses the catalog name and removes an internal stock code from the machine heading", () => {
    const product = {
      id: "product-1",
      brand: "HAXAN",
      brandLogoUrl: "/api/v1/brands/media/brand-logo-1",
      model: "HAXAN.MMT-1170.15K.DDS.M.30T",
      modelName: "MMT-1170 CNC Dik İşleme Merkezi",
      type: "CNC Dik İşleme Merkezi",
      stockCode: "HAXAN.MMT-1170.15K.DDS.M.30T",
      shortDescription: "HAXAN MMT-1170 CNC Dik İşleme Merkezi",
      imageUrl: "/api/v1/products/media/photo-1",
    } as Product;
    const result = buildQuotePrintData({
      offer,
      customer,
      salesCase: null,
      users: [],
      contacts: [],
      products: [product],
    }, {
      companyAddressId: "selected-address",
      quoteDate: "2026-07-16",
      documentNo: "CNC-2026/001",
      validityDays: 15,
      items: [{
        productModelId: product.id,
        stockCode: "HAXAN.MMT-1170.15K.DDS.M.30T",
        description: "HAXAN.MMT-1170.15K.DDS.M.30T",
        quantity: 1,
        unitPrice: 10_000,
        discountAmount: 0,
        lineTotal: 10_000,
      }],
      terms: {},
    } as never);

    expect(result.items[0].urun).toBe("HAXAN MMT-1170 CNC Dik İşleme Merkezi");
    expect(result.machines?.[0].model).toBe("MMT-1170");
    expect(result.machines?.[0].model).not.toContain("15K.DDS.M.30T");
    expect(result.imageUrl).toBe("/api/v1/products/media/photo-1");
    expect(result.brandLogoUrl).toBe("/api/v1/brands/media/brand-logo-1");
    expect(result.machines?.[0].brandLogoUrl).toBe("/api/v1/brands/media/brand-logo-1");
    expect(JSON.stringify(result)).not.toContain("HAXAN.MMT-1170.15K.DDS.M.30T");
  });

  it("keeps every selected machine, its own specs, options and line discount", () => {
    const first = {
      id: "machine-1",
      categoryCode: "TEZGAH",
      brand: "ECOCA",
      model: "MT-208",
      type: "CNC Torna",
      shortDescription: "ECOCA MT-208 CNC Torna",
      imageUrl: "/api/v1/products/media/machine-1-photo",
      standardEquipment: ["MT-208 standart paket"],
      specs: [{ key: "Çevirme Çapı", value: "520", unit: "mm" }],
    } as Product;
    const second = {
      id: "machine-2",
      categoryCode: "TEZGAH",
      brand: "LK",
      model: "VM-2",
      type: "CNC Dik İşleme Merkezi",
      shortDescription: "LK VM-2 CNC Dik İşleme Merkezi",
      imageUrl: "/api/v1/products/media/machine-2-photo",
      standardEquipment: ["VM-2 standart paket"],
      specs: [{ key: "X Ekseni", value: "762", unit: "mm" }],
    } as Product;
    const result = buildQuotePrintData({
      offer,
      customer,
      salesCase: null,
      users: [],
      contacts: [],
      products: [first, second],
    }, {
      quoteDate: "2026-07-21",
      documentNo: "CNC-2026/010",
      validityDays: 15,
      discountTotal: 1_500,
      vatAmount: 0,
      items: [
        { productModelId: first.id, description: first.shortDescription, quantity: 1, unitPrice: 10_000, discountAmount: 1_000, lineTotal: 9_000, compatibility: { lineGroupKey: "machine-a", technicalSpecs: [{ key: "Çevirme Çapı", value: "550", unit: "mm" }] } },
        { description: "↳ Opsiyon: Talaş konveyörü", quantity: 1, unitPrice: 500, discountAmount: 0, lineTotal: 500, compatibility: { lineGroupKey: "machine-a" } },
        { productModelId: second.id, description: second.shortDescription, quantity: 2, unitPrice: 20_000, discountAmount: 500, lineTotal: 39_500, compatibility: { lineGroupKey: "machine-b", technicalSpecs: [{ key: "X Ekseni", value: "800", unit: "mm" }] } },
        { description: "↳ Opsiyon: Takım ölçme", quantity: 1, unitPrice: 750, discountAmount: 0, lineTotal: 750, compatibility: { lineGroupKey: "machine-b" } },
      ],
      terms: {},
    } as never);

    expect(result.machines).toHaveLength(2);
    expect(result.machines?.[0]).toMatchObject({
      urun: first.shortDescription,
      imageUrl: first.imageUrl,
      opsiyonelDonanim: ["Talaş konveyörü"],
    });
    expect(result.machines?.[0].specs).toContainEqual(expect.objectContaining({ key: "Çevirme Çapı", value: "550" }));
    expect(result.machines?.[1]).toMatchObject({
      urun: second.shortDescription,
      imageUrl: second.imageUrl,
      opsiyonelDonanim: ["Takım ölçme"],
    });
    expect(result.machines?.[1].specs).toContainEqual(expect.objectContaining({ key: "X Ekseni", value: "800" }));
    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toMatchObject({ fiyat: 10_000, indirim: 1_000, brutTutar: 10_000, tutar: 9_000 });
    expect(result.items[2]).toMatchObject({ fiyat: 20_000, indirim: 500, brutTutar: 40_000, tutar: 39_500 });
  });

  it("silently includes nationalization charges in the PDF product price and total", () => {
    const product = {
      id: "machine-nationalized",
      categoryCode: "TEZGAH",
      productTypeCode: "DIK_ISLEME_MERKEZI",
      brand: "LK",
      model: "VM-2",
      type: "CNC Dik İşleme Merkezi",
      shortDescription: "LK VM-2 CNC Dik İşleme Merkezi",
      imageUrl: "",
    } as Product;
    const result = buildQuotePrintData({
      offer,
      customer,
      salesCase: null,
      users: [],
      contacts: [],
      products: [product],
    }, {
      quoteDate: "2026-08-03",
      documentNo: "CNC-2026/020",
      customsTotal: 15_570,
      vatAmount: 0,
      items: [{
        productModelId: product.id,
        description: product.shortDescription,
        quantity: 1,
        unitPrice: 100_000,
        discountAmount: 0,
        lineTotal: 100_000,
        nationalized: true,
      }],
      terms: {},
    } as never);

    expect(result.items[0]).toMatchObject({
      fiyat: 115_570,
      brutTutar: 115_570,
      tutar: 115_570,
    });
    const document = quoteDoc(result, "/brand");
    expect(document.body).toContain("115.570,00 USD");
    expect(document.body).not.toContain("Millileştirme / Gümrük");
  });

  it("keeps the same silent nationalization price in proforma, invoice and contract data", async () => {
    const product = {
      id: "machine-nationalized",
      categoryCode: "TEZGAH",
      productTypeCode: "DIK_ISLEME_MERKEZI",
      brand: "LK",
      model: "VM-2",
      type: "CNC Dik İşleme Merkezi",
      shortDescription: "LK VM-2 CNC Dik İşleme Merkezi",
      imageUrl: "",
      standardEquipment: [],
      specs: [],
    } as unknown as Product;
    const documentSnapshot = {
      capturedAt: "2026-08-03T08:00:00.000Z",
      quote: {
        subtotal: 100_000,
        customsTotal: 15_570,
        discountTotal: 0,
        vatAmount: 0,
        grandTotal: 115_570,
      },
      company: { legalTitle: customer.name },
      companyAddresses: [],
      companyPhones: [],
      contact: {},
      currency: { code: "USD" },
      items: [{
        productModelId: product.id,
        description: product.shortDescription,
        quantity: 1,
        unitCode: "adet",
        unitPrice: 100_000,
        discountAmount: 0,
        lineTotal: 100_000,
        vatRate: 0,
        nationalized: true,
      }],
      terms: {},
    };
    const doc = {
      fileName: "CNC-PRF-2026/001",
      uploadedAt: "2026-08-03",
      documentSnapshot,
    } as never;
    const proforma = buildProformaPrintData({
      doc,
      customers: [customer],
      cases: [],
      offers: [offer],
      products: [product],
    });

    expect(proforma.items[0]).toMatchObject({ birimFiyati: 115_570, tutar: 115_570 });
    const proformaDocument = proformaDoc(proforma, "/brand");
    expect(proformaDocument.body).toContain("115.570,00 USD");
    expect(proformaDocument.body).not.toContain("Millileştirme / Gümrük");

    const contract = await loadContractPrintData({
      customer,
      salesCase: { id: "case-1", currency: "USD" },
      products: [product],
      payments: [],
      contractDate: "2026-08-03",
      contractNo: "CNC-SOZ-2026/001",
      documentSnapshot,
    } as never);
    expect(contract.fiyat).toBe(115_570);
    expect(contract.machines?.[0]?.fiyat).toBe(115_570);
  });
});
