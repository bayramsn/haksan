import { describe, expect, it } from "vitest";
import type { Customer, Offer, Product } from "../mock";
import { buildQuotePrintData } from "./quotePrint";

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

  it("uses the catalog product name and carries its photo to the offer", () => {
    const product = {
      id: "product-1",
      brand: "HAKSAN",
      model: "VM-2",
      shortDescription: "HAKSAN VM-2 CNC Dik İşleme Merkezi",
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
        stockCode: "VM2-STOK-KODU",
        description: "VM2-STOK-KODU",
        quantity: 1,
        unitPrice: 10_000,
        discountAmount: 0,
        lineTotal: 10_000,
      }],
      terms: {},
    } as never);

    expect(result.items[0].urun).toBe("HAKSAN VM-2 CNC Dik İşleme Merkezi");
    expect(result.items[0].urun).not.toContain("STOK-KODU");
    expect(result.imageUrl).toBe("/api/v1/products/media/photo-1");
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
    expect(result.items[0]).toMatchObject({ fiyat: 10_000, indirim: 1_000, tutar: 9_000 });
    expect(result.items[2]).toMatchObject({ fiyat: 20_000, indirim: 500, tutar: 39_500 });
  });
});
