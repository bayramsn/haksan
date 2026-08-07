import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ProcessChecklistPanel.tsx", import.meta.url), "utf8");
const centerSource = readFileSync(new URL("./OpportunityProcessCenter.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("./SalesCaseDetail.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");

describe("ProcessChecklistPanel teklif adımı", () => {
  it("B sürecindeki teklif kontrolünü teklif penceresine bağlar", () => {
    expect(source).toContain('case "quote":');
    expect(source).toContain("<QuoteDialog");
    expect(source).toContain("defaultCaseId={sc.id}");
    expect(source).toContain("Teklif oluştur");
  });

  it("firma ve teklif oluşturma yetkisini doğrular", () => {
    expect(source).toContain('hasPermission("quotes.create")');
    expect(source).toContain("Tekliften önce firma bağlanmalı.");
    expect(source).toContain("Teklif oluşturma yetkiniz bulunmuyor.");
  });
});

describe("ProcessChecklistPanel satış alanı kutusuna taşınması", () => {
  it("içeriğini kutunun yuvasına portal'lar, panel'i üst bileşende bırakır", () => {
    // Panel'i kutu mount etseydi `requestedAction` bağı kopardı; yalnız içerik
    // taşınıyor, bileşen üst ağaçtaki yerinde kalıyor.
    expect(source).toContain('import { createPortal } from "react-dom"');
    expect(source).toContain('import { getChecklistSlot, subscribeChecklistSlot } from "./OpportunityProcessCenter"');
    expect(source).toContain("useSyncExternalStore(");
    expect(source).toContain("() => getChecklistSlot(sc.id)");
    expect(source).toContain("createPortal(body, slot)");
  });

  it("kutu yokken görevleri kendi yerinde göstermeye devam eder", () => {
    // Yükleme, hazırlık verisi olmaması veya kutunun mount edilmemesi görevleri
    // yok etmemeli; taşınamayan panel eski yerinde görünür.
    expect(source).toContain("if (!slot) return body;");
  });

  it("ilerletme düğmesinin yerini söyler ama olmayan bir düğmeye yönlendirmez", () => {
    // Kutu artık kapının dışında ve her zaman mount; "tam süreç haritasını aç"
    // diye bir düğme kalmadı. Metin kullanıcıyı var olmayan bir kontrole
    // gönderirse ölü yönlendirme olur.
    expect(source).toContain("İlerletme satış alanı kutusundaki düğmeden yapılır");
    expect(source).not.toContain("tam süreç haritasını açın");
    expect(workspaceSource).not.toContain("Tam süreç haritasını aç");
  });

  it("taşınınca boş kalan sarmalayıcıyı gizler ve kaydırma çapasını birlikte taşır", () => {
    // Sarmalayıcı bu görevde dokunulmayan dosyalarda; boş bırakılırsa ekranda
    // 2px'lik boş çerçeve kalır. Çapa taşınmazsa "görevlere git" kaydırması
    // gizli kutuya gidip sessizce hiçbir şey yapmaz.
    expect(source).toContain('const PROCESS_ACTIONS_ANCHOR_ID = "opportunity-process-actions"');
    expect(source).toContain('host.style.display = "none"');
    expect(source).toContain("host.removeAttribute(\"id\")");
    expect(source).toContain("slot.id = PROCESS_ACTIONS_ANCHOR_ID");
    // Geri alma: panel taşınmayı bırakırsa sarmalayıcı eski hâline dönmeli.
    expect(source).toContain("host.id = PROCESS_ACTIONS_ANCHOR_ID;");
    expect(source).toContain("host.style.display = previousDisplay;");
    // Çapayı arayan üst bileşenler değişmedi.
    expect(workspaceSource).toContain('getElementById("opportunity-process-actions")');
    expect(detailSource).toContain('getElementById("opportunity-process-actions")');
  });
});

describe("ProcessChecklistPanel alan kimliği", () => {
  it("kutunun dışında kaldığında alanı kısa kod ve açıklamasıyla gösterir", () => {
    // Kutunun içindeyken kimliği kutu söyler; yalnız kaldığında panel söylemeli.
    expect(source).toContain("QUALIFICATION_STAGE_LABELS[grade]} alanı");
    expect(source).toContain("QUALIFICATION_STAGE_DESCRIPTIONS[grade]");
    expect(source).toContain("{!slot && (");
    expect(centerSource).toContain("stageLabel(currentStage)");
    expect(centerSource).toContain("stageDescription(currentStage)");
  });
});

describe("ProcessChecklistPanel ilerletme güvenliği", () => {
  it("ikinci bir ilerletme yolu bırakmaz", () => {
    // Tek düğme kutuda. Buradaki düğme kapalı kartı ve sunucu engellerini
    // bilmediği için ikinci bir kapı açıyordu.
    expect(source).not.toContain("moveQualification");
    expect(source).not.toContain("advancing");
    expect(source).not.toContain('[data-workspace-primary="convert"]');
  });

  it("Lead dönüşümünü kutudaki düğme hâlâ derece PATCH'i yerine dönüşüm akışına yönlendirir", () => {
    // Güvence panelden kutuya taşındı; kaybolmadığı burada da doğrulanır.
    expect(centerSource).toContain('currentStage === "lead"');
    expect(centerSource).toContain('[data-workspace-primary="convert"]');
  });

  it("güncelleme yetkisi olmayan kullanıcı için kayıt işlemlerini kapatır", () => {
    expect(source).toContain('hasPermission("opportunities.update")');
    expect(source).toContain("if (!authorized || busyKey) return;");
    expect(source).toContain("disabled={!canUpdate || busyKey !== null}");
  });
});

describe("ProcessChecklistPanel B aşaması aktiviteleri", () => {
  it("arama ve ziyareti isteğe bağlı notla tiklenebilir aktivite olarak kaydeder", () => {
    expect(source).toContain('import { Checkbox } from "../ui/checkbox"');
    expect(source).toContain('hasPermission("activities.create")');
    expect(source).toContain('activityTypeCode: "outgoing_call"');
    expect(source).toContain('activityTypeCode: "customer_visit"');
    expect(source).toContain("description: draft.trim() || undefined");
    expect(source).toContain("Not yazmak zorunlu değildir. Yazılan not Aktivite bölümünde görünür.");
    expect(source).toContain("props.canCreateActivity,");
  });
});
