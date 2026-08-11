import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const listSource = readFileSync(new URL("./LeadsPage.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");

describe("Lead fırsata dönüşüm erişimi", () => {
  it("masaüstü ve mobil Lead kartlarında dönüşüm komutunu gösterir", () => {
    expect(listSource.match(/Fırsata çevir/g)?.length).toBeGreaterThanOrEqual(2);
    expect(listSource).toContain('onClick={() => void convert(lead)}');
  });

  it("detay ekranında eksik bilgi olsa da dönüşüm komutunu birincil tutar", () => {
    expect(workspaceSource).toContain(
      "const useLeadConversionAsPrimary = !terminal && canUpdate && isLead;",
    );
    expect(workspaceSource).not.toContain("isLead && leadBlockers.length > 0");
  });
});
