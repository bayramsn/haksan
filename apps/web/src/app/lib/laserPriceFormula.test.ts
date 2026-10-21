import { describe, expect, it } from "vitest";
import { LASER_PRICE_LIST_PRESETS, isLaserCuttingConfiguration, laserContainerFreight, laserListPrice } from "@haksan/shared";

const [cif, milli] = LASER_PRICE_LIST_PRESETS.map((preset) => preset.formula);

describe("lazer fiyat listesi formülü", () => {
  it("CIF: FOB + görünüm + navlun + kurulum + antrepo + ek 1.000; liste %30, son %25", () => {
    expect(laserListPrice(16000, "20GP", cif!)).toEqual({ freight: 4000, duty: 0, cost: 23600, listPrice: 30680, cashPrice: 29500 });
  });

  it("Millileştirilmiş: gümrük %25 FOB + görünüm + navlun üzerinden, sonra TSE + kurulum + antrepo + ek 1.000", () => {
    expect(laserListPrice(53000, "40HC", milli!)).toEqual({ freight: 7000, duty: 15150, cost: 79750, listPrice: 103675, cashPrice: 99688 });
  });

  it("çoklu konteyner navlunu toplanır, tanınmayan ya da boş konteyner fiyatlanmaz", () => {
    expect(laserContainerFreight("40HC+40HC", cif!)).toBe(14000);
    expect(laserContainerFreight("3*40HC+1*20GP", cif!)).toBe(25000);
    expect(laserContainerFreight("40HC+20GP", cif!)).toBe(11000);
    expect(laserContainerFreight(null, cif!)).toBeNull();
    expect(laserContainerFreight("LCL", cif!)).toBeNull();
    expect(laserListPrice(null, "20GP", cif!)).toBeNull();
  });

  it("HW el kaynağı kesim listesine girmez", () => {
    expect(isLaserCuttingConfiguration("HW-1500W")).toBe(false);
    expect(isLaserCuttingConfiguration("F-3015")).toBe(true);
  });
});
