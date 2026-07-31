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

describe("QualificationKanban firma odaklı kart", () => {
  it("firma ünvanını kısaltmadan gösterir ve kartı klavyeyle açılabilir yapar", () => {
    expect(source).toContain('aria-label={`${partyName} fırsat detayını aç`}');
    expect(source).toContain("whitespace-normal break-words [overflow-wrap:anywhere]");
    expect(source).toContain('event.key !== "Enter" && event.key !== " "');
  });

  it("fırsat detaylarını kart yüzeyinde göstermez", () => {
    expect(source).not.toContain("Konu / Makine");
    expect(source).not.toContain("Sonraki aksiyon");
    expect(source).not.toContain("Operasyon:");
    expect(source).not.toContain("Kontak bekleniyor");
  });
});
