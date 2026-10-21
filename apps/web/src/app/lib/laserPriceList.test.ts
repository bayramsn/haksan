import { describe, expect, it } from "vitest";
import { hexConfigurationForPriceModel, laserOptionCosts, leadTimeModelCodes, parseLaserPriceList } from "@haksan/shared";

const sheets = [
  {
    name: "SAÇ",
    rows: [
      ["Serisi", "F Serisi", "", "FT Serisi", ""],
      ["Model", "F3015", "F6015", "F3015+T6", "① Yukarıdaki fiyatlar FOB bazındadır"],
      ["1.5KW", "14400", "", "", ""],
      ["3KW", "16000", "19000", "27000", ""],
      // ExcelJS birleştirilmiş hücreyi tekrarlar: aynı değer uyarı üretmez.
      ["3KW", "16000", "", "", ""],
      ["Konteyner", "20GP", "40HC", "40HC", ""],
      ["Değişim platformu serisi", "", "", "", "Açıklama"],
      ["Serisi", "Büyük format", "", "", ""],
      ["Model", "GR2500-6", "GR2500-12", "", ""],
      ["12KW", "44000", "48000", "", ""],
    ],
  },
  {
    name: "BORU",
    rows: [
      ["Model", "TG6012", "TZ12055+Z12", "V12-65"],
      ["6KW", "", "227000", "24000"],
      ["Bevel kesim opsiyonu", "TG6020:≤3KW 15000$", "6kw 7200$", "V24 12400$"],
    ],
  },
  { name: "KAYNAK", rows: [["Model", "", "HW"], ["1.5KW", "MAX", "2800"]] },
  { name: "PAERÇALAR", rows: [["", "Fiyatı (usd)"], ["Rezonatör kutusu\n12KW için uygundur", "350"], ["Rezonatör kutusu\n12KW için uygundur", "350"]] },
  {
    name: "Üretim Süresi",
    rows: [
      ["Serisi", "Model", "1.5kw", "3kw", "6kw", "12kw"],
      ["F", "3015", "5", "5", "5", "20"],
      ["FT", "3015+T6", "7", "7", "10", ""],
      ["GR", "2500-6\\12", "", "", "", "30"],
      ["TZ", "12055", "", "", "60", "60"],
      ["V", "V12", "7", "7", "7", ""],
    ],
  },
];

describe("lazer fiyat listesi", () => {
  const result = parseLaserPriceList(sheets);
  const price = (code: string, powerKw: number) => result.prices.find((row) => row.priceModelCode === code && row.powerKw === powerKw);

  it("model × güç hücrelerini maliyet, konteyner ve üretim süresiyle okur", () => {
    expect(price("F3015", 1.5)).toMatchObject({ costUsd: 14400, container: "20GP", leadTimeDays: 5, cell: "B3" });
    expect(price("F3015+T6", 3)).toMatchObject({ costUsd: 27000, leadTimeDays: 7 });
    expect(price("GR2500-12", 12)).toMatchObject({ costUsd: 48000, leadTimeDays: 30 });
    expect(price("TZ12055+Z12", 6)).toMatchObject({ costUsd: 227000, leadTimeDays: 60 });
    expect(price("V12-65", 6)).toMatchObject({ costUsd: 24000, leadTimeDays: 7 });
    expect(price("HW", 1.5)?.costUsd).toBe(2800);
    expect(result.prices.filter((row) => row.priceModelCode === "F3015" && row.powerKw === 3)).toHaveLength(1);
    expect(result.prices.some((row) => /FOB/.test(row.priceModelCode))).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it("aksesuarları ve opsiyon notlarını makinelerden ayrı tutar", () => {
    expect(result.accessories).toEqual([expect.objectContaining({ name: "Rezonatör kutusu 12KW için uygundur", costUsd: 350 })]);
    expect(result.optionNotes.map((note) => note.priceModelCode)).toEqual(["TG6012", "TZ12055+Z12", "V12-65"]);
  });

  it("çelişen tekrar hücresini raporlar", () => {
    const conflicting = parseLaserPriceList([{ name: "SAÇ", rows: [["Model", "F3015"], ["3KW", "16000"], ["3KW", "17000"]] }]);
    expect(conflicting.prices).toHaveLength(1);
    expect(conflicting.issues[0]).toContain("F3015@3");
  });

  it("süre sayfasının kısa yazımını fiyat koduna çevirir", () => {
    expect(leadTimeModelCodes("S", "604")).toEqual(["S0604"]);
    expect(leadTimeModelCodes("PGT", "3015+T6")).toEqual(["PG3015+T6"]);
    expect(leadTimeModelCodes("GR", "3200-6\\12")).toEqual(["GR3200-6", "GR3200-12"]);
  });

  it("fiyat kodunu HEX baz kartının alt modeline eşler, olmayanı uydurmaz", () => {
    expect(hexConfigurationForPriceModel("F3015", 3)).toEqual({ series: "F", sourceModelCode: "F-3015" });
    expect(hexConfigurationForPriceModel("F3015+T6", 3)).toEqual({ series: "FT", sourceModelCode: "FT-3015" });
    expect(hexConfigurationForPriceModel("PG3015+T6", 3)).toEqual({ series: "PGT", sourceModelCode: "PGT3015" });
    expect(hexConfigurationForPriceModel("GR2500-6", 12)).toEqual({ series: "GR", sourceModelCode: "2500-6" });
    expect(hexConfigurationForPriceModel("TS6020+S6", 3)).toEqual({ series: "TS", sourceModelCode: "TS-6020" });
    expect(hexConfigurationForPriceModel("PU3015", 3)).toEqual({ series: "PU", sourceModelCode: "PU3015" });
    expect(hexConfigurationForPriceModel("HW", 2)).toEqual({ series: "HW", sourceModelCode: "HW-2000W" });
    // AORE 2026 kitabından eklenen alt modeller ve seriler de eşleşir; teknik verisi olmayan TC uydurulmaz.
    expect(hexConfigurationForPriceModel("F6015", 3)).toEqual({ series: "F", sourceModelCode: "F-6015" });
    expect(hexConfigurationForPriceModel("PG6020+T6", 3)).toEqual({ series: "PGT", sourceModelCode: "PGT6020" });
    expect(hexConfigurationForPriceModel("V12-65", 3)).toEqual({ series: "V", sourceModelCode: "V12-65" });
    expect(hexConfigurationForPriceModel("M28-120-65", 6)).toEqual({ series: "M", sourceModelCode: "M28-120-65" });
    expect(hexConfigurationForPriceModel("TC12-65", 3)).toBeNull();
  });
});

describe("lazer opsiyon maliyetleri", () => {
  const optionSheets = [
    {
      name: "BORU",
      rows: [
        ["Model", "TG6020", "TG6035", "M28-65-65", "M36-65-65", "V12-65", "V24-65"],
        ["6KW", "28000", "35300", "76000", "89000", "24000", "41000"],
        ["Bevel kesim opsiyonu", "TG6020:≤3KW 15000$\n   6KW 15800$\nTG6035:≤3KW 15400$", "", "6kw 7200$\n12kw 11000$", "", "", ""],
        ["Açıklama", "①Yukarıdaki fiyatlar FOB bazındadır.\n⑤Yarı otomatik yükleme：V12:900$；V24:1500$\nSıfır fire：V12:600$", "", "", "", "", ""],
      ],
    },
  ];
  const parsed = parseLaserPriceList(optionSheets);
  const { costs, issues } = laserOptionCosts(optionSheets, parsed);
  const find = (label: string, model: string, kw?: number) => costs.find((cost) => cost.label === label && cost.priceModelCode === model && cost.power?.kw === kw);

  it("pah kesim notunu model ve güce, modelsiz notu serinin tüm modellerine dağıtır", () => {
    expect(find("Pah (bevel) kesim", "TG6020", 3)).toMatchObject({ power: { operator: "<=", kw: 3 }, costUsd: 15000 });
    expect(find("Pah (bevel) kesim", "TG6020", 6)).toMatchObject({ power: { operator: "=", kw: 6 }, costUsd: 15800 });
    expect(find("Pah (bevel) kesim", "TG6035", 3)?.costUsd).toBe(15400);
    expect(find("Pah (bevel) kesim", "M28-65-65", 12)?.costUsd).toBe(11000);
    expect(find("Pah (bevel) kesim", "M36-65-65", 6)?.costUsd).toBe(7200);
    expect(costs.some((cost) => cost.label === "Pah (bevel) kesim" && cost.priceModelCode.startsWith("V"))).toBe(false);
  });

  it("yükleme dipnotunu model koduna göre opsiyona çevirir", () => {
    expect(find("Yarı otomatik yükleme", "V12-65")?.costUsd).toBe(900);
    expect(find("Yarı otomatik yükleme", "V12-65")?.power).toBeUndefined();
    expect(find("Yarı otomatik yükleme", "V24-65")?.costUsd).toBe(1500);
    expect(find("Sıfır fire", "V12-65")?.costUsd).toBe(600);
    expect(issues).toEqual([]);
  });
});
