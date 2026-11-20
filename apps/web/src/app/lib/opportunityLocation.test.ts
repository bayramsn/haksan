import { describe, expect, it } from "vitest";
import { PROVINCE_NAMES } from "./geo";
import { matchesOpportunityLocation, opportunityCity, opportunityRegion, OPPORTUNITY_REGIONS } from "./opportunityLocation";

describe("opportunity location filters", () => {
  it("assigns every Turkish province to exactly one region", () => {
    const cities = Object.values(OPPORTUNITY_REGIONS).flat();
    expect(cities).toHaveLength(81);
    expect(new Set(cities).size).toBe(81);
    expect([...cities].sort()).toEqual([...PROVINCE_NAMES].sort());
  });
  it("prefers company city and falls back to lead city for unresolved or empty companies", () => {
    expect(opportunityCity({ leadCity: "Ankara" }, { city: " ISTANBUL " })).toBe("İstanbul");
    expect(opportunityCity({ leadCity: " izmir " }, { city: " " })).toBe("İzmir");
    expect(opportunityCity({ leadCity: "Bursa" })).toBe("Bursa");
    expect(opportunityCity({})).toBe("");
  });
  it("combines city and region filters, including unknown and missing locations", () => {
    expect(matchesOpportunityLocation("İSTANBUL", "istanbul", "Marmara")).toBe(true);
    expect(matchesOpportunityLocation("Ankara", "all", "Marmara")).toBe(false);
    expect(matchesOpportunityLocation("Bursa", "İstanbul", "Marmara")).toBe(false);
    expect(matchesOpportunityLocation("Berlin", "Berlin", "all")).toBe(true);
    expect(matchesOpportunityLocation("", "all", "all")).toBe(true);
    expect(matchesOpportunityLocation("", "all", "Ege")).toBe(false);
    expect(opportunityRegion("Berlin")).toBe("");
  });
});
