import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PIPELINE_STAGE_FLOW } from "@haksan/shared";
import { SALES_STAGES, opportunityTransitionErrorMessage } from "../../lib/mock";

const source = readFileSync(new URL("./QualificationKanban.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("./SalesCaseDetail.tsx", import.meta.url), "utf8");

describe("QualificationKanban LOST yeniden açma akışı", () => {
  it("LOST hedefini korur fakat Kanban sütunu üretmez", () => {
    expect(source).toContain('const KANBAN_STAGES = QUALIFICATION_STAGES.filter((stage) => stage !== "lost")');
    expect(source).toContain("KANBAN_STAGES.map((stage)");
    expect(source).toContain('if (to === "lost")');
    expect(source).toContain("<LostCaseDialog");
  });

  it("LOST hedefini kart menüsünde erişilebilir tutar", () => {
    expect(source).toContain("QUALIFICATION_STAGES.map((target)");
    expect(source).toContain('target === "lost"');
  });
});

describe("QualificationKanban firma ve kart detayı", () => {
  it("firma ünvanını iki satırda kompakt gösterir ve kartı klavyeyle açılabilir yapar", () => {
    expect(source).toContain('aria-label={`${partyName} fırsat detayını aç`}');
    expect(source).toContain("line-clamp-2 whitespace-normal break-words [overflow-wrap:anywhere]");
    expect(source).toContain('event.key !== "Enter" && event.key !== " "');
  });

  it("firma kimliğini kompakt tutar ve dikey ayraç kullanmaz", () => {
    expect(source).toContain("grid size-8 shrink-0 place-items-center rounded-md");
    expect(source).toContain("text-[15px] font-semibold leading-[1.25]");
    expect(source).not.toContain("border-l-2 border-[#0b2453]/10 pl-3");
    expect(source).not.toContain("group-hover:text-[#2457D6]");
  });

  it("konu, makina ve sıradaki aktiviteyi kart detayları bölümünde gösterir", () => {
    expect(source).toContain("Kart detayları");
    expect(source).toContain("Konu");
    expect(source).toContain("Makina");
    expect(source).toContain("Aktivite</dt>");
    expect(source).toContain("salesCase.requestedProduct?.trim()");
    expect(source).toContain("salesCase.requestedMachine?.trim()");
    expect(source).toContain("activity.salesCaseId === salesCase.id");
    expect(source).not.toContain("salesCase.nextAction?.trim()");
  });

  it("firma ilgilisini ve adresi fırsat kartında görünür tutar", () => {
    expect(source).toContain("useCompanyCardDetails(");
    expect(source).toContain("companyDetailsQuery.data?.[salesCase.customerId] ?? storedCompany");
    expect(source).toContain("Adres yükleniyor…");
    expect(source).toContain("salesCase.primaryContactId");
    expect(source).toContain("İlgili kişi belirlenmedi");
    expect(source).toContain("Adres bilgisi yok");
    expect(source).toContain(">İlgili<");
    expect(source).toContain("<MapPin");
  });

  it("firma adına tıklanınca firma, ilgili kişi ve ortak aktivite geçmişini açar", () => {
    expect(detailSource).toContain("setPartyDialogOpen(true)");
    expect(detailSource).toContain("Firma, ilgili kişi ve bu taraflarla yapılan aktiviteler");
    expect(detailSource).toContain("Firma ve ilgili kişi aktiviteleri");
    expect(detailSource).toContain("activity.customerId === sc.customerId");
    expect(detailSource).toContain("activity.contactId === primaryContact?.id");
    expect(detailSource).toContain("contactId={primaryContact?.id}");
  });

  it("eski alım niyeti sıcaklık alanlarını karttan ve fırsat detayından kaldırır", () => {
    expect(source).not.toContain("LeadTemperatureBadge");
    expect(source).not.toContain("salesCase.leadTemperature");
    expect(workspaceSource).not.toContain('aria-label="Fırsat alım niyeti"');
    expect(workspaceSource).not.toContain("LeadTemperatureSelector");
  });
});

describe("fırsat ilerletme tutarlılığı", () => {
  it("operasyon panosunu backend ile aynı sırada tutar ve iptali terminale koyar", () => {
    expect(SALES_STAGES.slice(0, -1)).toEqual(PIPELINE_STAGE_FLOW);
    expect(SALES_STAGES.at(-1)).toBe("cancelled");
    expect(SALES_STAGES.indexOf("sales")).toBeLessThan(SALES_STAGES.indexOf("call"));
    expect(SALES_STAGES.indexOf("call")).toBeLessThan(SALES_STAGES.indexOf("quote"));
  });

  it("yapılandırılmış geçiş engellerini nesne yerine okunur etiketlerle gösterir", () => {
    const message = opportunityTransitionErrorMessage(
      {
        message: "Hedef operasyon adımı için eksik gereklilikler var",
        details: {
          blockers: [
            { key: "contact", label: "Kontak bağlı" },
            { key: "location", label: "İl ve ilçe girildi" },
          ],
        },
      },
      "İşlem başarısız oldu."
    );

    expect(message).toBe("Kontak bağlı · İl ve ilçe girildi");
    expect(message).not.toContain("[object Object]");
  });

  it("yetkisiz ve devam eden taşımaları yeniden göndermeyi engeller", () => {
    expect(source).toContain('hasPermission("opportunities.update")');
    expect(source).toContain("if (busyId) return");
    expect(source).toContain("disabled={!canUpdate || Boolean(busyId)");
  });
});
