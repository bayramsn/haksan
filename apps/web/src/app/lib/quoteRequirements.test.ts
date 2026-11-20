import { describe, expect, it } from "vitest";
import { quoteRequirementFailure } from "./quoteRequirements";

describe("quote requirement failures", () => {
  it("reads the server list and filters malformed entries", () => {
    expect(quoteRequirementFailure({ details: { reason: "QUOTE_REQUIREMENTS_INCOMPLETE", opportunityId: "opp", blockers: [{ key: "contact", label: "Kontak bağlı", actionKey: "link_contact" }, null, { key: "broken" }] } })).toEqual({ opportunityId: "opp", blockers: [{ key: "contact", label: "Kontak bağlı", actionKey: "link_contact" }] });
  });
  it("does not treat permission and network errors as editable missing information", () => {
    expect(quoteRequirementFailure(new Error("Bağlantı yok"))).toBeNull();
    expect(quoteRequirementFailure({ details: { blockers: [] } })).toBeNull();
  });
});
