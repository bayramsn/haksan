import { describe, expect, it } from "vitest";
import { PROVINCE_NAMES } from "./geo";
import { districtsForCountry, provincesForCountry } from "./geoByCountry";
import { matchesTr } from "./trSearch";

/** Combobox'ın yaptığı arama: yazılan metne göre listeyi süzer. */
const search = (options: readonly string[], query: string) =>
  options.filter((option) => matchesTr(option, query));

describe("Türkiye il/ilçe verisi", () => {
  it("81 ilin tamamını kapsar", () => {
    expect(provincesForCountry("Türkiye")).toHaveLength(81);
    expect(PROVINCE_NAMES).toHaveLength(81);
  });

  it("973 ilçenin tamamını kapsar ve her ilin ilçe listesi doludur", () => {
    const total = PROVINCE_NAMES.reduce(
      (sum, province) => sum + districtsForCountry("Türkiye", province).length,
      0,
    );
    expect(total).toBe(973);
    for (const province of PROVINCE_NAMES) {
      expect(districtsForCountry("Türkiye", province).length).toBeGreaterThan(0);
    }
  });

  it("ilçe listesi seçilen ile bağlıdır", () => {
    expect(districtsForCountry("Türkiye", "İstanbul")).toContain("Beşiktaş");
    expect(districtsForCountry("Türkiye", "Ankara")).not.toContain("Beşiktaş");
    expect(districtsForCountry("Türkiye", "")).toHaveLength(0);
  });
});

describe("il/ilçe yazarken liste süzme", () => {
  const provinces = provincesForCountry("Türkiye");
  const istanbulDistricts = districtsForCountry("Türkiye", "İstanbul");

  it("'ist' yazınca İstanbul çıkar", () => {
    expect(search(provinces, "ist")).toContain("İstanbul");
  });

  it("'beş' yazınca Beşiktaş çıkar", () => {
    expect(search(istanbulDistricts, "beş")).toContain("Beşiktaş");
  });

  it("Türkçe karakter yazılmadan da bulunur", () => {
    expect(search(provinces, "Istanbul")).toContain("İstanbul");
    expect(search(provinces, "kahramanmaras")).toContain("Kahramanmaraş");
    expect(search(provinces, "AGRI")).toContain("Ağrı");
    expect(search(istanbulDistricts, "besiktas")).toContain("Beşiktaş");
    expect(search(istanbulDistricts, "sisli")).toContain("Şişli");
    expect(search(istanbulDistricts, "uskudar")).toContain("Üsküdar");
  });

  it("alakasız arama sonuç döndürmez", () => {
    expect(search(provinces, "zzz")).toHaveLength(0);
  });
});
