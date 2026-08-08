import { describe, expect, it } from "vitest";
import { companyTemperature, companyTemperatureCounts } from "./companyTemperature";

type Case = Parameters<typeof companyTemperature>[1][number];

const card = (extra: Partial<Case> & { customerId: string }): Case => ({
  leadTemperature: undefined,
  closedAt: undefined,
  isLost: false,
  ...extra,
});

describe("companyTemperature", () => {
  it("firmanın en sıcak açık kartını seçer", () => {
    const cases = [
      card({ customerId: "c1", leadTemperature: "cold" }),
      card({ customerId: "c1", leadTemperature: "hot" }),
      card({ customerId: "c1", leadTemperature: "waiting" }),
    ];
    expect(companyTemperature("c1", cases)).toBe("hot");
  });

  it("kapanmış ve kaybedilmiş kartları saymaz", () => {
    const cases = [
      card({ customerId: "c1", leadTemperature: "hot", closedAt: "2026-01-01" }),
      card({ customerId: "c1", leadTemperature: "hot", isLost: true }),
      card({ customerId: "c1", leadTemperature: "cold" }),
    ];
    // Kapanmış işin sıcaklığı firmanın bugünkü niyetini anlatmaz.
    expect(companyTemperature("c1", cases)).toBe("cold");
  });

  it("sıcaklığı yazılmamış kartı belirsiz sayar", () => {
    expect(companyTemperature("c1", [card({ customerId: "c1" })])).toBe("unknown");
  });

  it("açık kartı olmayan firmada değer üretmez", () => {
    expect(companyTemperature("c1", [card({ customerId: "c1", closedAt: "2026-01-01" })])).toBeNull();
    expect(companyTemperature("c1", [])).toBeNull();
    expect(companyTemperature(undefined, [card({ customerId: "c1" })])).toBeNull();
  });

  it("başka firmanın kartını karıştırmaz", () => {
    const cases = [card({ customerId: "c2", leadTemperature: "hot" })];
    expect(companyTemperature("c1", cases)).toBeNull();
  });
});

describe("companyTemperatureCounts", () => {
  it("kart değil FİRMA sayar", () => {
    // Aynı firmanın üç sıcak kartı olması onu üç kat sıcak yapmaz.
    const cases = [
      card({ customerId: "c1", leadTemperature: "hot" }),
      card({ customerId: "c1", leadTemperature: "hot" }),
      card({ customerId: "c1", leadTemperature: "hot" }),
      card({ customerId: "c2", leadTemperature: "cold" }),
    ];
    expect(companyTemperatureCounts(cases)).toEqual({ hot: 1, waiting: 0, cold: 1, unknown: 0 });
  });

  it("firmayı yalnız en sıcak kovada sayar", () => {
    const cases = [
      card({ customerId: "c1", leadTemperature: "hot" }),
      card({ customerId: "c1", leadTemperature: "cold" }),
    ];
    const counts = companyTemperatureCounts(cases);
    expect(counts.hot).toBe(1);
    expect(counts.cold).toBe(0);
  });

  it("firması olmayan kartları yok sayar", () => {
    const cases = [card({ customerId: "", leadTemperature: "hot" })];
    expect(companyTemperatureCounts(cases)).toEqual({ hot: 0, waiting: 0, cold: 0, unknown: 0 });
  });
});
