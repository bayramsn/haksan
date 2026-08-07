import { describe, expect, it } from "vitest";
import { applyOpportunityUrlState, parseOpportunityUrlState } from "./opportunityUrlState";

describe("parseOpportunityUrlState", () => {
  it("fırsat yokken diğer alanların hiçbirini taşımaz", () => {
    // A kartının bölümü B'nin URL'ine sızıyordu; kural tek yerde.
    expect(parseOpportunityUrlState("?section=commercial&record=files&activity=a1")).toEqual({
      opportunity: null,
      section: null,
      record: null,
      activity: null,
    });
  });

  it("geçerli durumu olduğu gibi okur", () => {
    expect(parseOpportunityUrlState("?opportunity=o1&section=records&record=audit")).toEqual({
      opportunity: "o1",
      section: "records",
      record: "audit",
      activity: null,
    });
  });

  it("geçersiz bölüm ve kayıt değerlerini düşürür", () => {
    const state = parseOpportunityUrlState("?opportunity=o1&section=hurda&record=hurda");
    expect(state.section).toBeNull();
    expect(state.record).toBeNull();
  });

  it("aktivite varsa kayıt bölümüne düşer", () => {
    // Aktivite yalnız kayıt bölümünde gösteriliyor; bölüm verilmemişse
    // zorlanır, yoksa derin bağlantı boş bir sekmeye açılırdı.
    const state = parseOpportunityUrlState("?opportunity=o1&activity=a1");
    expect(state.section).toBe("records");
    expect(state.activity).toBe("a1");
  });

  it("kaldırılan hızlı özet yüzeyini sessizce yok sayar", () => {
    // İki katmanlı yüzey (önce hızlı özet, sonra tam sayfa) kaldırıldı. Eski
    // bağlantılardaki `surface` bir hataya değil, yalnız temizlenen bir
    // parametreye dönüşmeli.
    expect(parseOpportunityUrlState("?opportunity=o1&surface=quick")).toEqual({
      opportunity: "o1",
      section: null,
      record: null,
      activity: null,
    });
    expect(parseOpportunityUrlState("?opportunity=o1&surface=hurda").opportunity).toBe("o1");
  });

  it("record yalnız section=records iken korunur", () => {
    expect(parseOpportunityUrlState("?opportunity=o1&section=commercial&record=files").record).toBeNull();
    expect(parseOpportunityUrlState("?opportunity=o1&section=records&record=files").record).toBe("files");
  });
});

describe("applyOpportunityUrlState", () => {
  it("fırsat kapatılınca ilgili tüm parametreleri siler", () => {
    const result = applyOpportunityUrlState(
      "?opportunity=o1&section=records&record=audit&activity=a1",
      { opportunity: null },
    );
    expect(result).toBe("");
  });

  it("fırsatla ilgisi olmayan parametreleri korur", () => {
    const result = applyOpportunityUrlState("?tab=stok&opportunity=o1", { section: "commercial" });
    expect(result).toContain("tab=stok");
    expect(result).toContain("section=commercial");
  });

  it("eski surface parametresini her yazımda temizler", () => {
    const result = applyOpportunityUrlState("?tab=stok&opportunity=o1&surface=quick", { opportunity: "o1" });
    expect(result).not.toContain("surface");
    expect(result).toContain("tab=stok");
    expect(result).toContain("opportunity=o1");
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
    const before = "?opportunity=o1&section=commercial";
    const after = applyOpportunityUrlState(before, { opportunity: "o2", section: null, record: null });
    const state = parseOpportunityUrlState(after);
    expect(state.opportunity).toBe("o2");
    expect(state.section).toBeNull();
  });

  it("aktiviteli derin bağlantıyı kayıt bölümüne bağlar", () => {
    const result = applyOpportunityUrlState("?opportunity=o1", { opportunity: "o1", activity: "a1" });
    expect(result).toContain("activity=a1");
    expect(result).toContain("section=records");
  });

  it("boş sonuçta soru işareti bırakmaz", () => {
    expect(applyOpportunityUrlState("?opportunity=o1", { opportunity: null })).toBe("");
  });
});
