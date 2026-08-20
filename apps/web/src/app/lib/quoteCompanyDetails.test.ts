import { describe, expect, it } from "vitest";
import type { Customer } from "./mock";
import {
  buildQuoteCompanyDetailsDraft,
  buildQuoteCompanyDetailsPatch,
} from "./quoteCompanyDetails";

const company = {
  id: "company-1",
  name: "Eski Firma",
  country: "Türkiye",
  city: "İstanbul",
  district: "Ümraniye",
  address: "Eski merkez adresi",
  addresses: [
    {
      id: "billing-address",
      addressType: "billing",
      country: "Türkiye",
      city: "İstanbul",
      district: "Ümraniye",
      address: "Eski fatura adresi",
      isBilling: true,
      isDefault: true,
      latitude: 41.01,
      longitude: 29.12,
    },
    {
      id: "shipping-address",
      addressType: "shipping",
      country: "Türkiye",
      city: "Bursa",
      address: "Sevkiyat adresi",
      isShipping: true,
    },
  ],
} as Customer;

describe("teklif içinden firma bilgisi düzenleme", () => {
  it("seçili PDF adresini taslağa taşır", () => {
    expect(buildQuoteCompanyDetailsDraft(company, company.addresses?.[0])).toEqual({
      name: "Eski Firma",
      country: "Türkiye",
      city: "İstanbul",
      district: "Ümraniye",
      address: "Eski fatura adresi",
    });
  });

  it("firma adını ve yalnız seçili adresi günceller, diğer adresleri korur", () => {
    const patch = buildQuoteCompanyDetailsPatch(company, "billing-address", {
      name: "Yeni Firma A.Ş.",
      country: "Türkiye",
      city: "Ankara",
      district: "Çankaya",
      address: "Yeni fatura adresi No: 10",
    });

    expect(patch.name).toBe("Yeni Firma A.Ş.");
    expect(patch.addresses?.[0]).toMatchObject({
      id: "billing-address",
      city: "Ankara",
      district: "Çankaya",
      address: "Yeni fatura adresi No: 10",
      latitude: 41.01,
      longitude: 29.12,
      isBilling: true,
    });
    expect(patch.addresses?.[1]).toEqual(company.addresses?.[1]);
  });

  it("adresi olmayan firmaya teklif ekranından ilk adresi ekler", () => {
    const noAddressCompany = { ...company, addresses: [], address: "", city: "", district: "" };
    const patch = buildQuoteCompanyDetailsPatch(noAddressCompany, "", {
      name: "Yeni Firma",
      country: "Türkiye",
      city: "İzmir",
      district: "Bornova",
      address: "Sanayi Cad. No: 1",
    });

    expect(patch.addresses).toEqual([
      expect.objectContaining({
        addressType: "office",
        isDefault: true,
        isBilling: true,
        city: "İzmir",
        district: "Bornova",
        address: "Sanayi Cad. No: 1",
      }),
    ]);
  });

  it("boş firma adını reddeder", () => {
    expect(() => buildQuoteCompanyDetailsPatch(company, "billing-address", {
      name: "   ",
      country: "Türkiye",
      city: "İstanbul",
      district: "",
      address: "Adres",
    })).toThrow("Firma adı boş bırakılamaz.");
  });
});
