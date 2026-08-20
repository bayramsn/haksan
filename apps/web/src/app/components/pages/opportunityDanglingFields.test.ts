import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rail = readFileSync(new URL("./LeadWorkspaceControls.tsx", import.meta.url), "utf8");
const createDialog = readFileSync(new URL("../dialogs/CreateDialogs.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("./SalesCaseDetail.tsx", import.meta.url), "utf8");
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

  it("eski yerel taslakları yeni fırsat alanlarıyla kayıpsız tamamlar", () => {
    expect(createDialog).toContain("...current,");
    expect(createDialog).toContain('description: current.description ?? ""');
    expect(createDialog).toContain("probability: current.probability ?? 50");
    expect(createDialog).toContain('expectedCloseDate: current.expectedCloseDate ?? ""');
    expect(createDialog).toContain("await addCase(form as any)");
  });

  it("ödeme planını son sözleşme bedeline bağlar ve yöntemi alacağa taşır", () => {
    expect(detail).toContain('document.type === "Contract" && document.salesCaseId === sc.id');
    expect(detail).toContain("latestContract?.documentSnapshot?.quote?.subtotal");
    expect(detail).toContain("contractAmount > 0 ? contractAmount : initialQuote.amount");
    expect(detail).toContain("Ödeme planı toplamı sözleşme bedeliyle eşleşmiyor");
    expect(detail).toContain("await financeService.createReceivable({");
    expect(detail).toContain("paymentMethod,");
  });
});
