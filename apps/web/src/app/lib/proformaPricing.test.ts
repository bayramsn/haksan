import { describe, expect, it } from "vitest";
import { quoteToProformaPriceRows } from "./proformaPricing";

describe("proforma pricing", () => {
  it("bakes item and header discounts into editable net unit prices", () => {
    const rows = quoteToProformaPriceRows({
      discountTotal: 300,
      items: [
        { id: "1", description: "Makine A", quantity: 1, unitPrice: 1_000, discountAmount: 100, lineTotal: 900, vatRate: 20 },
        { id: "2", description: "Makine B", quantity: 2, unitPrice: 500, discountAmount: 100, lineTotal: 900, vatRate: 20 },
      ],
    });

    expect(rows).toEqual([
      { quoteItemId: "1", description: "Makine A", quantity: 1, unitPrice: 850, vatRate: 20 },
      { quoteItemId: "2", description: "Makine B", quantity: 2, unitPrice: 425, vatRate: 20 },
    ]);
  });
});
