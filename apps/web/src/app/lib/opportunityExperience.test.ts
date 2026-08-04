import { describe, expect, it } from "vitest";
import { shouldUseSimpleOpportunityExperience } from "./opportunityExperience";

describe("opportunity experience rollout", () => {
  it("legacy modunda yeni renderer'ı kapalı tutar", () => {
    expect(shouldUseSimpleOpportunityExperience({ mode: "legacy", userId: "user-1" })).toBe(false);
    expect(shouldUseSimpleOpportunityExperience({ mode: undefined, userId: "user-1" })).toBe(false);
  });

  it("on modunda tüm kullanıcılar için yeni renderer'ı açar", () => {
    expect(shouldUseSimpleOpportunityExperience({ mode: "on" })).toBe(true);
  });

  it("pilot modunda yalnız allowlist kullanıcılarını açar", () => {
    expect(shouldUseSimpleOpportunityExperience({
      mode: "pilot",
      pilotUserIds: "user-1, user-2",
      userId: "user-2",
    })).toBe(true);
    expect(shouldUseSimpleOpportunityExperience({
      mode: "pilot",
      pilotUserIds: "user-1, user-2",
      userId: "user-3",
    })).toBe(false);
  });
});
