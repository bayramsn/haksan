import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_OPERATION_GROUP_STEPS,
  operationGroupForStage,
} from "./opportunityProcessGroups";

describe("fırsat operasyon grupları", () => {
  it("C alanını Satış giriş operasyonuyla dolu tutar", () => {
    expect(OPPORTUNITY_OPERATION_GROUP_STEPS.c).toEqual(["sales"]);
  });

  it("WIN alanında yalnız kapanış operasyonunu gösterir", () => {
    expect(OPPORTUNITY_OPERATION_GROUP_STEPS.win).toEqual(["delivered"]);
  });

  it("diğer satış alanlarının operasyon sırasını korur", () => {
    expect(OPPORTUNITY_OPERATION_GROUP_STEPS.b).toEqual(["call", "visit", "quote"]);
    expect(OPPORTUNITY_OPERATION_GROUP_STEPS.a).toEqual(["proforma", "contract", "payment_plan"]);
  });

  it("operasyonların görünür grubunu ortak alan eşlemesine göre çözer", () => {
    expect(operationGroupForStage("sales")).toBe("c");
    expect(operationGroupForStage("visit")).toBe("b");
    expect(operationGroupForStage("delivered")).toBe("win");
  });
});
