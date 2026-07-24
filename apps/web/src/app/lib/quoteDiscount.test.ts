import { describe, expect, it } from "vitest";
import { calculateProductDiscountAmount, isProductDiscountValid } from "./quoteDiscount";

describe("product-specific quote discounts", () => {
  it("calculates percentage discounts from the full quantity", () => {
    expect(calculateProductDiscountAmount({
      quantity: 2,
      unitPrice: 1_000,
      discountValue: 10,
      discountType: "percent",
    })).toBe(200);
  });

  it("keeps amount discounts as entered", () => {
    expect(calculateProductDiscountAmount({
      quantity: 3,
      unitPrice: 1_000,
      discountValue: 450,
      discountType: "amount",
    })).toBe(450);
  });

  it("rejects percentages over 100 and amounts over the gross line total", () => {
    expect(isProductDiscountValid({ quantity: 1, unitPrice: 1_000, discountValue: 101, discountType: "percent" })).toBe(false);
    expect(isProductDiscountValid({ quantity: 1, unitPrice: 1_000, discountValue: 1_001, discountType: "amount" })).toBe(false);
  });
});
