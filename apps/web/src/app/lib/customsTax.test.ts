import { describe, expect, it } from "vitest";
import { computeCustomsCharges, isMachiningCenterTypeCode } from "@haksan/shared";

describe("computeCustomsCharges", () => {
  it("USD teklifte tek adet için tüm kalemleri hesaplar", () => {
    // 100.000 USD'lik tek işleme merkezi
    const r = computeCustomsCharges({ lineTotal: 100_000, quantity: 1 });
    expect(r.customsDuty).toBe(2700); // %2.7
    expect(r.additionalCustomsDuty).toBe(10_000); // %10
    expect(r.tseFee).toBe(1600); // adet başına 1600 USD
    expect(r.fixedCustomsFee).toBe(1000); // adet başına 1000 USD
    expect(r.total).toBe(15_300);
  });

  it("sabit ücretleri adet başına uygular", () => {
    const r = computeCustomsCharges({ lineTotal: 200_000, quantity: 2 });
    expect(r.tseFee).toBe(3200); // 1600 × 2
    expect(r.fixedCustomsFee).toBe(2000); // 1000 × 2
    expect(r.customsDuty).toBe(5400); // 200.000 × %2.7
    expect(r.additionalCustomsDuty).toBe(20_000); // 200.000 × %10
  });

  it("USD dışı teklifte sabit ücretleri kur ile çevirir", () => {
    // 1 USD = 33 TRY; yüzdeler satır tutarı (TRY) üzerinden, sabitler USD→TRY
    const r = computeCustomsCharges({ lineTotal: 3_300_000, quantity: 1, usdToQuoteRate: 33 });
    expect(r.customsDuty).toBe(89_100); // 3.300.000 × %2.7
    expect(r.tseFee).toBe(52_800); // 1600 × 33
    expect(r.fixedCustomsFee).toBe(33_000); // 1000 × 33
  });

  it("geçersiz/negatif girdide 0 döner", () => {
    const r = computeCustomsCharges({ lineTotal: -5, quantity: -2 });
    expect(r.total).toBe(0);
  });
});

describe("isMachiningCenterTypeCode", () => {
  it("işleme merkezi tiplerini tanır", () => {
    expect(isMachiningCenterTypeCode("ISLEME_MERKEZI")).toBe(true);
    expect(isMachiningCenterTypeCode("CNC_5_EKSEN_ISLEME_MERKEZI")).toBe(true);
    expect(isMachiningCenterTypeCode("dik_isleme_merkezi")).toBe(true);
  });
  it("diğer tipleri ve boş değeri reddeder", () => {
    expect(isMachiningCenterTypeCode("SAC_ISLEME")).toBe(false);
    expect(isMachiningCenterTypeCode("KAYIK")).toBe(false);
    expect(isMachiningCenterTypeCode(null)).toBe(false);
  });
});
