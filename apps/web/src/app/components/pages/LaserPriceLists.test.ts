import { describe, expect, it } from "vitest";
import { LASER_PRICE_LIST_PRESETS } from "@haksan/shared";
import { draftToFormula, formulaToDraft } from "./LaserPriceLists";

describe("lazer liste parametreleri", () => {
  it("oranları yüzde gösterir, kaydederken ondalığa çevirir", () => {
    const formula = LASER_PRICE_LIST_PRESETS[1].formula;
    const draft = formulaToDraft(formula);
    expect(draft).toMatchObject({ dutyRate: "25", listMarkup: "30", cashMarkup: "25", fixedUsd: "4000" });
    expect(draftToFormula(draft)).toEqual(formula);
    expect(draftToFormula({ ...draft, freight40Usd: "7.500" })?.freight40Usd).toBe(7500);
    expect(draftToFormula({ ...draft, dutyRate: "" })).toBeNull();
  });
});
