import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("LOST ayrıntı sunumu", () => {
  it("kayıp nedeni ve ticari bağlamı ortak okuma alanında gösterir", () => {
    const source = readFileSync(new URL("./LostOpportunityDetails.tsx", import.meta.url), "utf8");

    expect(source).toContain("Kayıp nedeni");
    expect(source).toContain("Kaybedilen ürün");
    expect(source).toContain("Rakip");
    expect(source).toContain("Uymayan şartlarımız");
    expect(source).toContain("export function LostOpportunityDetailsDialog");
  });

  it("LOST kaydını aktivite akışına tam ayrıntıyla taşır", () => {
    const workspace = readFileSync(new URL("../pages/OpportunityWorkspace.tsx", import.meta.url), "utf8");

    expect(workspace).toContain('history.toStage === "lost"');
    expect(workspace).toContain("lostTimelineDetail(sc)");
    expect(workspace).toContain('<LostOpportunityDetails salesCase={sc}');
  });
});
