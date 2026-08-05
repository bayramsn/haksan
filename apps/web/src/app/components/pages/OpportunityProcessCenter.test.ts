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
    // `aria-controls` yalnız panel gerçekten render edilirken verilmeli;
    // koşulsuz hâli kapalı grupta var olmayan bir id'yi işaret ediyordu.
    expect(source).toContain("aria-controls={isExpanded ? groupPanelId : undefined}");
    // Canlı bölge panelle birlikte mount olursa ilk içerik hiç duyurulmaz.
    expect(source).toContain('<div aria-live="polite" className="sr-only">{liveAnnouncement}</div>');
    // `aria-pressed` + `aria-expanded` aynı düğmede çelişiyordu.
    expect(source).not.toContain("aria-pressed={");
  });

  it("operasyonsuz satış alanlarını boş durum mesajıyla korur", () => {
    expect(source).toContain("Bu alanda operasyon adımı yok.");
    expect(source).not.toContain("if (targets.length === 0) return null");
  });

  it("alan görevlerini katlanabilir süreç haritasının dışında tutar", () => {
    // Görevler haritanın içindeyken hem `operationsExpanded` hem de doğru
    // akordeon grubunun açık olmasına bağlıydı; engel düğmeleri çoğu durumda
    // sessizce hiçbir şey yapmıyordu. Kancanın geri gelmemesi için hem
    // konumu hem de her iki render yolunun bağlantısı doğrulanıyor.
    expect(workspaceSource).toContain("processChecklist?: ReactNode");
    expect(workspaceSource).toContain('<div id="opportunity-process-actions"');
    // Süreç merkezi listeyi artık hiç sahiplenmiyor.
    expect(source).not.toContain("processChecklist");
    // Her iki render yolu da listeyi mount etmeli: çalışma alanı prop ile,
    // legacy yol doğrudan. Aksi halde aksiyon istekleri yine yutulur.
    expect(detailSource).toContain("processChecklist={");
    expect(detailSource).toContain('<div id="opportunity-process-actions"');
    expect(detailSource.match(/<ProcessChecklistPanel/g)).toHaveLength(2);
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
