import { describe, expect, it } from "vitest";
import { applyOpportunityUrlState, parseOpportunityUrlState } from "./opportunityUrlState";

describe("parseOpportunityUrlState", () => {
  it("fırsat yokken diğer alanların hiçbirini taşımaz", () => {
    // A kartının bölümü B'nin URL'ine sızıyordu; kural tek yerde.
    expect(parseOpportunityUrlState("?surface=workspace&section=commercial&record=files&activity=a1")).toEqual({
      opportunity: null,
      surface: null,
      section: null,
      record: null,
      activity: null,
    });
  });

  it("geçerli durumu olduğu gibi okur", () => {
    expect(parseOpportunityUrlState("?opportunity=o1&surface=workspace&section=records&record=audit")).toEqual({
      opportunity: "o1",
      surface: "workspace",
      section: "records",
      record: "audit",
      activity: null,
    });
  });

  it("geçersiz bölüm, kayıt ve yüzey değerlerini düşürür", () => {
    const state = parseOpportunityUrlState("?opportunity=o1&surface=hurda&section=hurda&record=hurda");
    expect(state.surface).toBeNull();
    expect(state.section).toBeNull();
    expect(state.record).toBeNull();
  });

  it("aktivite varsa yüzeyi çalışma alanına zorlar", () => {
    // Aktivite hızlı panelde gösterilemiyor; surface=quick ile gelen derin
    // bağlantı kullanıcıyı boş bir panele düşürürdü.
    const state = parseOpportunityUrlState("?opportunity=o1&surface=quick&activity=a1");
    expect(state.surface).toBe("workspace");
    expect(state.section).toBe("records");
  });

  it("record yalnız section=records iken korunur", () => {
    expect(parseOpportunityUrlState("?opportunity=o1&section=commercial&record=files").record).toBeNull();
    expect(parseOpportunityUrlState("?opportunity=o1&section=records&record=files").record).toBe("files");
  });
});

describe("applyOpportunityUrlState", () => {
  it("fırsat kapatılınca ilgili tüm parametreleri siler", () => {
    const result = applyOpportunityUrlState(
      "?opportunity=o1&surface=workspace&section=records&record=audit&activity=a1",
      { opportunity: null },
    );
    expect(result).toBe("");
  });

  it("fırsatla ilgisi olmayan parametreleri korur", () => {
    const result = applyOpportunityUrlState("?tab=stok&opportunity=o1", { surface: "workspace" });
    expect(result).toContain("tab=stok");
    expect(result).toContain("surface=workspace");
  });

  it("bölüm records'tan çıkınca record'u düşürür", () => {
    const result = applyOpportunityUrlState(
      "?opportunity=o1&section=records&record=audit",
      { section: "commercial" },
    );
    expect(result).toContain("section=commercial");
    expect(result).not.toContain("record=");
  });

  it("başka bir fırsata geçerken eski bölüm bilgisi taşınmaz", () => {
    const before = "?opportunity=o1&surface=workspace&section=commercial";
    const after = applyOpportunityUrlState(before, { opportunity: "o2", section: null, record: null });
    const state = parseOpportunityUrlState(after);
    expect(state.opportunity).toBe("o2");
    expect(state.section).toBeNull();
  });

  it("yüzey korunarak fırsat değiştirilebilir", () => {
    // Çalışma alanında ileri/geri okları hızlı panele düşürüyordu.
    const after = applyOpportunityUrlState("?opportunity=o1&surface=workspace", { opportunity: "o2" });
    expect(parseOpportunityUrlState(after).surface).toBe("workspace");
  });

  it("boş sonuçta soru işareti bırakmaz", () => {
    expect(applyOpportunityUrlState("?opportunity=o1", { opportunity: null })).toBe("");
  });
});
