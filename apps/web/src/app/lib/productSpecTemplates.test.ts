import { describe, expect, it } from "vitest";
import { DIVISION_MACHINE_TYPES, machineSpecTemplateEntries, productSpecDefaults } from "./productSpecTemplates";

describe("productSpecDefaults", () => {
  it("boru lazer tipini yalnız Sac İşleme grubuna bağlar", () => {
    expect(DIVISION_MACHINE_TYPES.find((type) => type.code === "BORU_LAZER_KESIM")?.productGroupCode).toBe("SAC_ISLEME");
  });
  it("sac ve boru lazerlerini Lazer Kesim ailesinde tutar", () => {
    for (const code of ["FIBER_LAZER_KESIM", "BORU_LAZER_KESIM"]) {
      expect(DIVISION_MACHINE_TYPES.find((type) => type.code === code)?.subcategoryCode).toBe("SAC_LAZER_KESIM");
    }
  });
  // Ayarlar > Teknik Bilgi kartı `machineSpecTemplateEntries`, ürün ekleme diyaloğu
  // `productSpecDefaults` okur. İkisi ayrışırsa şablon ayarlarda görünüp ürün
  // eklerken kaybolur.
  it("ayarlardaki her tezgah tipi için ürün diyaloğunda da şablon döner", () => {
    for (const type of DIVISION_MACHINE_TYPES) {
      expect(productSpecDefaults(type.code).length, type.code).toBe(machineSpecTemplateEntries(type.code).length);
    }
  });

  it("eski tip kodları güncel şablona eşlenir", () => {
    expect(productSpecDefaults("CNC_TORNA")).toEqual(productSpecDefaults("CNC_YATAY_TORNA_TEZGAHI"));
    expect(productSpecDefaults("abkant_pres").length).toBeGreaterThan(0);
  });
});
