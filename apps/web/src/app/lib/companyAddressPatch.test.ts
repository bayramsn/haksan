import { describe, expect, it } from "vitest";
import { buildCompanyAddressPatch } from "./companyAddressPatch";

describe("buildCompanyAddressPatch", () => {
  it("yalnız açık adres değiştiyse sadece onu gönderir", () => {
    expect(buildCompanyAddressPatch({ address: "Yeni Mah. 5. Sok. No:1" })).toEqual({
      fullAddress: "Yeni Mah. 5. Sok. No:1",
    });
  });

  it("yalnız il/ilçe değiştiyse açık adresi göndermez", () => {
    expect(buildCompanyAddressPatch({ city: "İstanbul", district: "Beylikdüzü" })).toEqual({
      province: "İstanbul",
      district: "Beylikdüzü",
    });
  });

  it("bilinçli boşaltmayı taşır", () => {
    expect(buildCompanyAddressPatch({ address: "" })).toEqual({ fullAddress: "" });
  });

  it("hiçbir alan yoksa boş gövde üretir", () => {
    expect(buildCompanyAddressPatch({})).toEqual({});
  });
});
