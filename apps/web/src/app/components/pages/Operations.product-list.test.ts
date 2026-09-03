import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Operations.tsx", import.meta.url), "utf8");

describe("ürün listesi", () => {
  it("ürün adının altında model kodunu gösterir", () => {
    expect(source).toContain("const productModelCode = (product: Product)");
    // Kod yalnız addan farklıysa yazılır; ad yoksa kod zaten başlıktadır.
    expect(source).toContain('code !== productDisplayModel(product).trim() ? code : ""');
    expect(source).toContain("{productModelCode(p)}");
  });

  it("sıralama ekranda okunan sırayı izler: marka → ad → model kodu", () => {
    const sortBlock = source.slice(source.indexOf("const sortedProducts"), source.indexOf("const grouped"));
    expect(sortBlock).toContain('compareProductText(a.brand ?? "", b.brand ?? "")');
    expect(sortBlock).toContain("compareProductText(productDisplayModel(a), productDisplayModel(b))");
    expect(sortBlock).toContain('compareProductText(a.model ?? "", b.model ?? "")');
    // Ekranda görünmeyen kısa açıklamaya göre sıralamak listeyi rastgele gösteriyordu.
    expect(sortBlock).not.toContain("shortDescription");
  });
});
