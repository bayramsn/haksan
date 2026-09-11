import { describe, expect, it } from "vitest";
import { snapshotAddressLine } from "./core";

describe("snapshotAddressLine", () => {
  it("fullAddress yalnız sokak olsa da ilçe, il ve ülkeyi ekler", () => {
    expect(snapshotAddressLine({ fullAddress: "Akçeşme Mah. Ertuğrul Gazi Cad. No:11", district: "Nilüfer", province: "Bursa", country: "Türkiye" }))
      .toBe("Akçeşme Mah. Ertuğrul Gazi Cad. No:11 Nilüfer Bursa Türkiye");
  });
  it("sokak metninde zaten geçen il/ilçeyi tekrarlamaz, snake_case anahtarları okur", () => {
    expect(snapshotAddressLine({ full_address: "Nilüfer OSB, Bursa", district: "Nilüfer", province: "Bursa", country: "Türkiye" }))
      .toBe("Nilüfer OSB, Bursa Türkiye");
  });
  it("fullAddress yoksa sokak + kapı numarasından kurar; sözleşme biçiminde Türkiye atlanır", () => {
    expect(snapshotAddressLine({ street: "Sanayi Cad.", building_number: "12", district: "Çankaya", city: "Ankara", country: "Türkiye" }, { separator: ", ", omitCountry: "Türkiye" }))
      .toBe("Sanayi Cad. 12, Çankaya, Ankara");
    expect(snapshotAddressLine(undefined)).toBe("");
  });
});
