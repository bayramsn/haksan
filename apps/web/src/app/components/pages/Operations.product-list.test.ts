import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Operations.tsx", import.meta.url), "utf8");

describe("ürün listesi", () => {
  it("büyük başlıkta gerçek ürün adını, altında stok/model kodunu gösterir", () => {
    // Ürün adı API'nin "fullName" alanı — web tarafında shortDescription'a
    // eşleniyor. `modelName` neredeyse her üründe `model` ile aynı kaldığı
    // için eskiden başlıkta hep kod görünüyordu.
    expect(source).toContain("const productName = (product: Product)");
    expect(source).toContain("product.shortDescription?.trim() || productDisplayModel(product)");
    expect(source).toContain("const productModelCode = (product: Product)");
    expect(source).toContain('code !== productName(product).trim() ? code : ""');
    expect(source).toContain("{productName(p)}");
    expect(source).toContain("{productModelCode(p)}");
  });

  it("liste (tablo) görünümünde de ad üstte, kod altta durur", () => {
    expect(source).toContain("{p.brand} {productName(p)}");
    expect(source).toContain('<span className="font-data">{productModelCode(p)}</span>');
  });

  it("sıralama ekranda okunan sırayı izler: marka → gerçek ad → model kodu", () => {
    const sortBlock = source.slice(source.indexOf("const sortedProducts"), source.indexOf("const grouped"));
    expect(sortBlock).toContain('compareProductText(a.brand ?? "", b.brand ?? "")');
    expect(sortBlock).toContain("compareProductText(productName(a), productName(b))");
    expect(sortBlock).toContain('compareProductText(a.model ?? "", b.model ?? "")');
    // productDisplayModel neredeyse her üründe model koduna eşit kalıyor;
    // sıralama artık ekranda yazılan gerçek adı (productName) izliyor.
    expect(sortBlock).not.toContain("productDisplayModel");
  });
});
