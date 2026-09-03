import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./TargetDialog.tsx", import.meta.url), "utf8");

describe("hedef kalemi ölçüm eşlemesi", () => {
  it("eylem türü konudan önce gelir", () => {
    // "Teklif takip ziyareti" bir ziyarettir: ZİYARET/ARAMA kontrolleri
    // TEKLİF'ten önce olmalı, yoksa bu kalemler teklif sayısıyla ölçülür.
    const visit = source.indexOf('text.includes("ZİYARET")');
    const call = source.indexOf('text.includes("ARAMA")');
    const quote = source.indexOf('text.includes("TEKLİF")');
    expect(visit).toBeGreaterThan(0);
    expect(visit).toBeLessThan(quote);
    expect(call).toBeLessThan(quote);
  });

  it("tutar bazlı kalan kalemler manuel kalmaz", () => {
    // Yedek parça & aksesuar satışı gibi tutar hedefleri satış cirosundan ölçülür.
    expect(source).toContain('if (row.unit === "amount") return "salesAmount";');
  });
});
