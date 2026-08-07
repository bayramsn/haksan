import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./OpportunityProcessCenter.tsx", import.meta.url), "utf8");
const checklistSource = readFileSync(new URL("./ProcessChecklistPanel.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("./SalesCaseDetail.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");

describe("OpportunityProcessCenter tek kutu sözleşmesi", () => {
  it("yalnız kartın şu anki satış alanını ve bir sonraki alanı okur", () => {
    expect(source).toContain("readiness?.currentQualificationStage");
    // Sıradaki alan = doğrusal sıradaki ilk "forward" nitelik hedefi.
    expect(source).toContain('target.axis === "qualification" && target.direction === "forward"');
  });

  it("satış alanı rayını, operasyon akordeonunu ve hedef seçim panelini içermez", () => {
    // Ray + akordeon + sekmeli hedef paneli katmanları kaldırıldı; kutudan
    // alan değiştirme (hedef seçme, ileri/geri atlama) artık mümkün değil.
    expect(source).not.toContain("renderSelectedTargetPanel");
    expect(source).not.toContain("data-selected-target-panel");
    expect(source).not.toContain("renderOperationGroups");
    expect(source).not.toContain("OPERATION_GROUPS");
    expect(source).not.toContain('role="tablist"');
    expect(source).not.toContain('role="tabpanel"');
    expect(source).not.toContain("process-target-");
  });

  it("operasyon eksenini ve alan→operasyon eşlemesini hiç kullanmaz", () => {
    expect(source).not.toContain("opportunityProcessGroups");
    expect(source).not.toContain("OPPORTUNITY_OPERATION_GROUP_STEPS");
    expect(source).not.toContain("operationGroupForStage");
    expect(source).not.toContain('axis === "operation"');
    expect(source).not.toContain("salesStageLabel");
  });

  it("geri geçiş yolunu tamamen kapatır", () => {
    expect(source).not.toContain("requiresReason");
    expect(source).not.toContain("invalidatedApprovals");
    expect(source).not.toContain('direction === "backward"');
    expect(source).not.toContain("opportunityService.changeStage");
  });
});

describe("OpportunityProcessCenter davranış eşdeğerliği", () => {
  it("eksik gereklilikleri alan görev listesine yönlendiren düğmelerle sunar", () => {
    expect(source).toContain("canPerformAction?.(blocker.actionKey) === false");
    expect(source).toContain("onAction(blocker.actionKey)");
    expect(source).toContain("Bu işlem için gerekli yetkiniz bulunmuyor.");
  });

  it("ilerletmeyi yalnız bütün gereklilikler tamamken ve ileri yönde açar", () => {
    expect(source).toContain("!canUpdate || advancing || !nextTarget || closed || blockers.length > 0");
    expect(source).toContain("opportunityService.changeQualificationStage");
    expect(source).toContain("await onRefresh()");
    expect(source).toContain("await load()");
  });

  it("Lead ilerletmesini genel derece PATCH'i yerine dönüştürme akışına yönlendirir", () => {
    expect(source).toContain('currentStage === "lead"');
    expect(source).toContain('[data-workspace-primary="convert"]');
  });

  it("durum değişimini kalıcı canlı bölgeden duyurur", () => {
    // Kaldırılan tablist'in canlı bölgesi de gitti; tek kutuda durum
    // değişimi ekran okuyucuya duyurulmaya devam etmeli. Bölge kart kökünde
    // ve KALICI: AT'ler yalnız var olan bölgenin sonraki değişimlerini okur.
    expect(source).toContain('<div aria-live="polite" className="sr-only">{liveAnnouncement}</div>');
    expect(source).toContain("Şu anki satış alanı:");
  });

  it("canlı bölgeyi yükleme ve veri yok dallarında da DOM'da tutar", () => {
    // Bölge içerikle BİRLİKTE eklenirse ilk durum duyurulmaz. Bu yüzden metin
    // erken dönüşlerin üstünde hesaplanır ve her dal bölgeyi render eder.
    expect(source.indexOf("const liveAnnouncement")).toBeLessThan(
      source.indexOf("if (loading && !readiness)"),
    );
    expect(source).toContain('if (!readiness) return "";');
    expect(source).toContain("if (!readiness) return liveRegion;");
    // Yükleme dalı da bölgeyi taşımalı; yoksa hazırlık geldiğinde bölge
    // "yeni eklenmiş" olur ve ilk alan duyurusu sessizce kaçar.
    const loadingBranch = source.slice(
      source.indexOf("if (loading && !readiness)"),
      source.indexOf("if (!readiness) return liveRegion;"),
    );
    expect(loadingBranch).toContain("{liveRegion}");
  });
});

describe("OpportunityProcessCenter tek ilerletme düğmesi", () => {
  it("ilerletmeyi yalnız kutu yürütür; görev listesinde ikinci düğme kalmaz", () => {
    // İki düğme vardı: biri kutuda, biri görev listesinde. Liste düğmesi kapalı
    // kartı ve sunucunun ürettiği engelleri bilmiyordu; tek düğme kutuda kaldı.
    expect(source).toContain("opportunityService.changeQualificationStage");
    expect(checklistSource).not.toContain("moveQualification");
    expect(checklistSource).not.toContain("opportunityTransitionErrorMessage");
    expect(checklistSource).not.toContain("İlerletiliyor…");
    expect(checklistSource).not.toContain("alanına geç`");
    expect(checklistSource).not.toContain("Fırsata dönüştür");
  });

  it("kalan düğme kapalı kartı ve engelleri kontrol eder", () => {
    expect(source).toContain("const advanceDisabled = !canUpdate || advancing || closed || blockers.length > 0");
    expect(source).toContain("disabled={advanceDisabled}");
  });
});

describe("OpportunityProcessCenter alan görev listesiyle ilişkisi", () => {
  it("alan görevlerini kendi kutusunda barındıracak yuvayı yayımlar", () => {
    // Görevler kutunun İÇİNDE görünür; ama panel'i kutu mount etmez, yalnız
    // içeriğinin taşınacağı DOM yuvasını yayımlar.
    expect(source).toContain("export function subscribeChecklistSlot");
    expect(source).toContain("export function getChecklistSlot");
    expect(source).toContain("ref={checklistSlotRef}");
    expect(source).toContain("publishChecklistSlot(salesCase.id, node)");
    // Yuva fırsat kimliğine göre: sayfa ve dialog aynı anda açıkken paneller
    // birbirinin kutusuna düşmemeli.
    expect(source).toContain("const checklistSlots = new Map<string, HTMLElement>()");
    // Panel boşken yuva ne çerçeve ne boşluk bırakmalı.
    expect(source).toContain("empty:hidden");
  });

  it("paneli kendisi mount etmez; üst bileşenin prop bağını korur", () => {
    // Kutu paneli kendi render etseydi `requestedAction`/`onActionHandled`
    // bağı kopar, engel düğmeleri yine sessizce hiçbir şey yapmazdı.
    expect(source).not.toContain('from "./ProcessChecklistPanel"');
    expect(source).not.toContain("<ProcessChecklistPanel");
    expect(workspaceSource).toContain("processChecklist?: ReactNode");
    expect(workspaceSource).toContain('<div id="opportunity-process-actions"');
  });

  it("süreç merkezinin render edildiği her yolda görev listesini de mount eder", () => {
    // Kutunun engel düğmeleri isteği `requestedProcessAction`'a yazar; onu
    // tüketen liste mount değilse istek sessizce kaybolur. Sayı değil,
    // "merkez varsa liste de var" değişmezi bağlayıcıdır.
    const checklistMounts = detailSource.match(/<ProcessChecklistPanel/g)?.length ?? 0;
    const centerMounts = detailSource.match(/<OpportunityProcessCenter/g)?.length ?? 0;
    expect(checklistMounts).toBeGreaterThanOrEqual(1);
    expect(checklistMounts).toBeGreaterThanOrEqual(centerMounts);
    expect(detailSource).toContain("requestedAction={requestedProcessAction}");
  });

  it("SalesCaseDetail'in beklediği prop sözleşmesini korur", () => {
    expect(source).toContain("canPerformAction?: (actionKey: OpportunityProcessActionKey) => boolean");
    expect(source).toContain("onRefresh: () => Promise<unknown>");
    expect(source).toContain("onAction: (actionKey: OpportunityProcessActionKey) => void");
    expect(source).toContain("detail?: OpportunityProcessDetail | null");
    expect(source).toContain("onReload?: () => Promise<void>");
  });
});
