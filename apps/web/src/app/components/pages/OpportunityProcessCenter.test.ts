import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./OpportunityProcessCenter.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("./SalesCaseDetail.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");

describe("OpportunityProcessCenter inline hedef paneli", () => {
  it("seçili operasyonun hedef panelini aynı liste öğesinde ve yalnız ortak renderer üzerinden gösterir", () => {
    expect(source).toContain("{isSelected && renderSelectedTargetPanel(target)}");
    expect(source).toContain("data-selected-target-panel");
    expect(source).toContain('aria-label={`Seçili hedef: ${targetLabel}`}');
    expect(source.match(/data-selected-target-panel/g)).toHaveLength(1);
  });

  it("satış alanı hedeflerini ilgili operasyon grubunda erişilebilir tutar", () => {
    expect(source).toContain('selected?.axis === "qualification" && renderSelectedTargetPanel(selected)');
    expect(source).toContain("operationGroupForTarget(target)");
    expect(source).toContain("aria-expanded={isExpanded}");
    expect(source).toContain("aria-controls={groupPanelId}");
  });

  it("operasyonsuz satış alanlarını boş durum mesajıyla korur", () => {
    expect(source).toContain("Bu alanda operasyon adımı yok.");
    expect(source).not.toContain("if (targets.length === 0) return null");
  });

  it("alan görevlerini ayrı merkez yerine etkin operasyon grubunun içinde gösterir", () => {
    expect(source).toContain("processChecklist?: ReactNode");
    expect(source).toContain("activeGroup && processChecklist");
    expect(source).toContain("data-operation-group-tasks");
    expect(source).toContain('id={activeGroup && processChecklist ? "opportunity-process-actions" : undefined}');
    expect(detailSource.match(/processChecklist=\{/g)).toHaveLength(2);
    expect(workspaceSource).not.toContain("{processChecklist}");
    expect(workspaceSource).not.toContain("processChecklist: ReactNode");
  });

  it("gereklilik, detay ve geçmiş sekmelerini klavye desteğiyle sunar", () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('event.key === "ArrowLeft"');
    expect(source).toContain('requirements: "Gereklilikler"');
    expect(source).toContain('history: "Geçmiş"');
    expect(source).toContain('target.axis === "qualification"');
    expect(source).toContain("detail?.history");
    expect(source).toContain("Henüz operasyon geçişi kaydı yok.");
  });
});

describe("OpportunityProcessCenter davranış eşdeğerliği", () => {
  it("blocker eylemlerini ve yetki kontrolünü korur", () => {
    expect(source).toContain("canPerformAction?.(blocker.actionKey) === false");
    expect(source).toContain("openProcessAction(blocker.actionKey)");
    expect(source).toContain("onAction(actionKey)");
    expect(source).toContain("target.blockers.length > 0");
  });

  it("geri geçiş gerekçesini ve geçersizleşecek onayları korur", () => {
    expect(source).toContain("target.requiresReason && !reason.trim()");
    expect(source).toContain("maxLength={1000}");
    expect(source).toContain("target.invalidatedApprovals.map");
  });

  it("iki süreç ekseninin servis çağrılarını ve yenilemeyi korur", () => {
    expect(source).toContain("opportunityService.changeQualificationStage");
    expect(source).toContain("opportunityService.changeStage");
    expect(source).toContain("await onRefresh()");
    expect(source).toContain("await load()");
  });
});
