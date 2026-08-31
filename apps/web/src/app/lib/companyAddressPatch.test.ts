import { describe, expect, it } from "vitest";
import { buildCompanyAddressPatch } from "./companyAddressPatch";

const current = { country: "Türkiye", city: "Bursa", district: "Nilüfer", address: "OSB 10. Cad. No:4" };

describe("buildCompanyAddressPatch", () => {
  it("yalnız açık adres güncellenirken il ve ilçeyi korur", () => {
    expect(buildCompanyAddressPatch(current, { address: "Yeni Mah. 5. Sok. No:1" })).toEqual({
      country: "Türkiye",
      province: "Bursa",
      district: "Nilüfer",
      fullAddress: "Yeni Mah. 5. Sok. No:1",
    });
  });

  it("yalnız il/ilçe güncellenirken açık adresi korur", () => {
    expect(buildCompanyAddressPatch(current, { city: "İstanbul", district: "Beylikdüzü" })).toEqual({
      country: "Türkiye",
      province: "İstanbul",
      district: "Beylikdüzü",
      fullAddress: "OSB 10. Cad. No:4",
    });
  });

  it("alan bilinçli boşaltıldığında temizler", () => {
    expect(buildCompanyAddressPatch(current, { address: "" }).fullAddress).toBe("");
    expect(buildCompanyAddressPatch(current, { city: "" }).province).toBe("");
  });

  it("kayıt yokken yalnız gönderilen alanları taşır", () => {
    expect(buildCompanyAddressPatch(undefined, { city: "Ankara" })).toEqual({
      country: undefined,
      province: "Ankara",
      district: undefined,
      fullAddress: undefined,
    });
  });
});
