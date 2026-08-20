import { describe, expect, it } from "vitest";
import { lineMarker, markedLineCount } from "./NumberedLinesTextarea";

/**
 * Ekrandaki madde işareti basılan belgedekiyle birebir aynı olmak zorunda:
 * satışçı "3. maddeyi çıkaralım" dediğinde PDF'de aynı madde durmalı.
 */
describe("lineMarker", () => {
  it("teklif çıktısının lower-alpha sayacıyla aynı eki kullanır", () => {
    // print/templates.ts `ol.alpha { list-style-type: lower-alpha }` — CSS
    // sayacının standart eki noktadır, parantez değil.
    expect(lineMarker("alpha", 0)).toBe("a.");
    expect(lineMarker("alpha", 2)).toBe("c.");
  });

  it("alfabe tükenince lower-alpha gibi iki harfe geçer", () => {
    expect(lineMarker("alpha", 25)).toBe("z.");
    expect(lineMarker("alpha", 26)).toBe("aa.");
  });

  it("proformada düz sayı basar", () => {
    expect(lineMarker("decimal", 0)).toBe("1.");
    expect(lineMarker("decimal", 9)).toBe("10.");
  });
});

describe("markedLineCount", () => {
  it("boş satırları saymaz — belgeye de basılmazlar", () => {
    // print/notes.ts#enteredLines ile aynı davranış.
    expect(markedLineCount("bir\n\n  \niki")).toBe(2);
    expect(markedLineCount("")).toBe(0);
  });

  it("proformada ikinci kutunun başlangıç sırasını verir", () => {
    // Ödeme 3 madde ise teslimatın ilk maddesi belgede 4. sıradadır.
    const payment = "a\nb\nc";
    expect(lineMarker("decimal", markedLineCount(payment))).toBe("4.");
  });
});
