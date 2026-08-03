import { describe, expect, it } from "vitest";
import { OPPORTUNITY_OPERATION_GROUP_STEPS } from "./opportunityProcessGroups";

describe("fırsat operasyon grupları", () => {
  it("Satış adımını C alanından çıkarır", () => {
    expect(OPPORTUNITY_OPERATION_GROUP_STEPS.c).not.toContain("sales");
  });

  it("Satış adımını WIN alanında teslimden önce gösterir", () => {
    expect(OPPORTUNITY_OPERATION_GROUP_STEPS.win).toEqual(["sales", "delivered"]);
  });

  it("diğer satış alanlarının operasyon sırasını korur", () => {
    expect(OPPORTUNITY_OPERATION_GROUP_STEPS.b).toEqual(["call", "visit", "quote"]);
    expect(OPPORTUNITY_OPERATION_GROUP_STEPS.a).toEqual(["proforma", "contract", "payment_plan"]);
  });
});
