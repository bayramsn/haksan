import { describe, expect, it } from "vitest";
import { foldTermsToNotes } from "./DocumentTermsTemplateEditor";

describe("proforma notları", () => {
  it("eski üç alanlı şartı tek not metnine katlar", () => {
    expect(foldTermsToNotes({ paymentTerms: "Peşin\n", deliveryTerms: " 30 gün ", warrantyTerms: "" }))
      .toEqual({ paymentTerms: "Peşin\n30 gün", deliveryTerms: "", warrantyTerms: "" });
  });

  it("yazarken sondaki satır sonunu kırpmaz", () => {
    expect(foldTermsToNotes({ paymentTerms: "Not 1\n", deliveryTerms: "", warrantyTerms: "" }).paymentTerms)
      .toBe("Not 1\n");
  });
});
