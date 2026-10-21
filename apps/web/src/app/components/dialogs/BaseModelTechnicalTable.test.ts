import { describe, expect, it } from "vitest";
import { hex2026TechnicalFields, laserFieldWorkbookGroup } from "@haksan/shared";
import { formatSpecValue, groupBaseModelSpecs } from "./BaseModelTechnicalTable";

describe("baz kart teknik bilgileri AORE kitabının bölümleriyle", () => {
  it("alanları kitaptaki bölüme koyar (PDF adı da eşlenir)", () => {
    expect(laserFieldWorkbookGroup("Pozisyonlama Hassasiyeti")).toBe("Performans");
    expect(laserFieldWorkbookGroup("Çalışma Alanı (mm)")).toBe("Temel Parametreler");
    expect(laserFieldWorkbookGroup("Gövde")).toBe("Mekanik Sistem");
    expect(laserFieldWorkbookGroup("Santrifüj Fan")).toBe("Çevre Birimleri");
    expect(laserFieldWorkbookGroup("Trafo Kapasitesi")).toBe("Diğer Parametreler");
    expect(laserFieldWorkbookGroup("Kesme Kafası")).toBe("Standart Yapılandırma");
    expect(laserFieldWorkbookGroup("Kaynak Hızı")).toBeUndefined();
  });

  it("F serisinde bölümler kitap sırasıyla, modeller sütun, doğrulanmamış alan yok", () => {
    const configurations = ["F-3015", "F-6020"].map((code) => ({ sourceModelCode: code, fields: hex2026TechnicalFields("F", code) }));
    const groups = groupBaseModelSpecs(configurations);
    expect(groups.map((entry) => entry.group)).toEqual(["Temel Parametreler", "Performans", "Mekanik Sistem", "Çevre Birimleri", "Diğer Parametreler", "Standart Yapılandırma"]);
    const area = groups[0]!.rows.find((row) => row.key === "Çalışma Alanı (mm)");
    expect(area?.values).toHaveLength(2);
    expect(area?.values.every(Boolean)).toBe(true);
    // PDF'teki değer önce gelir, kitap yalnız eksik alanı tamamlar.
    expect(groups[1]!.rows.find((row) => row.key === "Pozisyonlama Hassasiyeti")?.values[0]).toBe(hex2026TechnicalFields("F", "F-3015").find((field) => field.key === "Pozisyonlama Hassasiyeti")?.rawValue);
    expect(groups[2]!.rows.find((row) => row.key === "Gövde")?.values.every(Boolean)).toBe(true);
    // PDF'te incelenmemiş motor gücü yerine kitaptaki değer.
    expect(groups[2]!.rows.find((row) => row.key === "X Eksen Motor Gücü")?.values[0]).toMatch(/0[.,]85/);
    const all = groups.flatMap((entry) => entry.rows.map((row) => row.key));
    expect(new Set(all).size).toBe(all.length);
  });

  it("hiçbir modelde değeri olmayan satır ve doğrulanmamış alan gösterilmez", () => {
    const groups = groupBaseModelSpecs([{ sourceModelCode: "X", fields: [
      { key: "Gövde", rawValue: "Kaynaklı", verification: "aore_excel" },
      { key: "Kiriş", rawValue: "Alüminyum", verification: "needs_review" },
      { key: "Kaynak Hızı", rawValue: "  ", verification: "verified" },
    ] }]);
    expect(groups).toEqual([{ group: "Mekanik Sistem", rows: [{ key: "Gövde", values: ["Kaynaklı"] }] }]);
  });

  it("kitap değerlerini Türkçe yazımla gösterir", () => {
    expect(formatSpecValue("115m/min")).toBe("115 m/dk");
    expect(formatSpecValue("±0.05mm/m")).toBe("±0,05 mm/m");
    expect(formatSpecValue("≤6kW：915kg\n12-20kW：1835kg")).toBe("≤6 kW: 915 kg\n12-20 kW: 1835 kg");
    expect(formatSpecValue("4600*2600*2100mm")).toBe("4600 × 2600 × 2100 mm");
    expect(formatSpecValue("4 Sets (8 unit)")).toBe("4 set (8 adet)");
    expect(formatSpecValue("20-30s(ayarlanabilir)")).toBe("20-30 sn (ayarlanabilir)");
    expect(formatSpecValue("1,5 kW: 28.15 kW")).toBe("1,5 kW: 28,15 kW");
    expect(formatSpecValue("BOCHU FSCUT8000A")).toBe("BOCHU FSCUT8000A");
    expect(formatSpecValue("0.8G")).toBe("0,8 G");
  });
});
