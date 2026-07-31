import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./QualificationKanban.tsx", import.meta.url), "utf8");

describe("QualificationKanban LOST yeniden açma akışı", () => {
  it("LOST kart sürüklemesini bırakılan hedef dereceyle geri geçiş akışına yönlendirir", () => {
    expect(source).toContain('if (from === "lost")');
    expect(source).toContain("setPendingBackMove({ salesCase, to })");
    expect(source).toContain("await moveQualification(pendingBackMove.salesCase.id, pendingBackMove.to");
  });

  it("hedefi açıkça gösterir ve kayıt bilgilerinin korunacağını bildirir", () => {
    expect(source).toContain("LOST kaydını hedef dereceye taşı");
    expect(source).toContain("firma, makine, aktiviteler ve kayıp bilgileri korunur");
    expect(source).toContain('const allowed = stage === "lost" || target === "lost" || adjacent');
    expect(source).not.toContain("await reopenCase(salesCase.id)");
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

  it("konu, makina ve aksiyonu kart detayları bölümünde gösterir", () => {
    expect(source).toContain("Kart detayları");
    expect(source).toContain("Konu");
    expect(source).toContain("Makina");
    expect(source).toContain("Aksiyon");
    expect(source).toContain("salesCase.requestedProduct?.trim()");
    expect(source).toContain("salesCase.requestedMachine?.trim()");
    expect(source).toContain("salesCase.nextAction?.trim()");
    expect(source).toContain("actionDateLabel(salesCase.nextActionAt)");
  });
});
