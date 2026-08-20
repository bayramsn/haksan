import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rail = readFileSync(new URL("./LeadWorkspaceControls.tsx", import.meta.url), "utf8");
const web = ["./SalesCases.tsx", "./SalesCaseDetail.tsx", "./OpportunityWorkspace.tsx", "./LeadWorkspaceControls.tsx"]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");

describe("fırsattaki havada kalan alanlar", () => {
  it("tahmini kapanış tarihini yeniden düzenlenebilir yapar", () => {
    // "Ticari alanları kaydet" formu kaldırılınca alanın tek yazarı Trello içe
    // aktarımı kalmıştı; oradan gelen termin tarihi kullanıcıya hiç görünmüyordu.
    expect(rail).toContain('aria-label="Tahmini kapanış tarihi"');
    expect(rail).toContain("expectedCloseDate: next || null");
    expect(rail).toContain("salesCase.expectedCloseDate ?? \"\"");
  });

  it("olasılık ve ticari alanları fırsat kartında düzenlenebilir yapar", () => {
    expect(web).toContain('id="opportunity-probability"');
    expect(web).toContain('id="opportunity-close-date"');
    expect(web).toContain('id="opportunity-machine"');
    expect(web).toContain('id="opportunity-description"');
    expect(web).toContain("probability,");
  });
});
