import { describe, expect, it } from "vitest";
import type { Customer, SalesCase } from "./mock";
import { matchesOpportunitySearch } from "./opportunitySearch";
import { normalizeCompany } from "./companyNormalizer";
import { opportunityCity, matchesOpportunityLocation } from "./opportunityLocation";

const opportunity = { id: "opportunity", customerId: "company", requestedProduct: "CNC Tezgah" } as SalesCase;
const company = normalizeCompany({ id: "company", legalTitle: "Örnek Makina", addresses: [
  { id: "address", province: "Ankara", district: "Çankaya", fullAddress: "İvedik OSB", isDefault: true },
] } as Parameters<typeof normalizeCompany>[0]);

describe("opportunity address search", () => {
  it("uses the saved company address when the opportunity itself has no lead city", () => {
    expect(matchesOpportunitySearch(opportunity, company, " ankara ")).toBe(true);
    expect(matchesOpportunitySearch(opportunity, company, "cankaya")).toBe(true);
    expect(matchesOpportunitySearch(opportunity, company, "ivedik")).toBe(true);
    expect(matchesOpportunitySearch(opportunity, company, "İstanbul")).toBe(false);
    expect(matchesOpportunityLocation(opportunityCity(opportunity, company), "Ankara", "İç Anadolu")).toBe(true);
  });
  it("preserves lead location and other search fields while company data loads", () => {
    expect(matchesOpportunitySearch({ ...opportunity, leadCity: "Ankara" }, undefined, "ANKARA")).toBe(true);
    expect(matchesOpportunitySearch(opportunity, undefined, "CNC")).toBe(true);
    expect(matchesOpportunitySearch(opportunity, company, "")).toBe(true);
    expect(matchesOpportunitySearch(opportunity, { name: "Referans firma" } as Customer, "Ankara")).toBe(false);
  });
});
