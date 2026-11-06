import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareProductColumn } from "./Operations";
import type { Product } from "../../lib/mock";

const p = (fields: Partial<Product>) => ({ model: "", brand: "", ...fields }) as Product;
const order = (items: Product[], col: Parameters<typeof compareProductColumn>[2], dir: 1 | -1) =>
  [...items].sort((a, b) => compareProductColumn(a, b, col, dir));

describe("kolon başlığı sıralaması", () => {
  it("metni A-Z / Z-A sıralar, boşu her iki yönde sona atar", () => {
    const items = [p({ id: "t", type: "Torna" }), p({ id: "x", type: "  " }), p({ id: "d", type: "Dik İşleme" })];
    expect(order(items, "type", 1).map((i) => i.id)).toEqual(["d", "t", "x"]);
    expect(order(items, "type", -1).map((i) => i.id)).toEqual(["t", "d", "x"]);
  });

  it("fiyatı sayısal sıralar (9.000 < 85.000), fiyatsız ürün sonda kalır", () => {
    const items = [p({ id: "b", listPrice: 85000 }), p({ id: "z" }), p({ id: "a", listPrice: 9000 })];
    expect(order(items, "list", 1).map((i) => i.id)).toEqual(["a", "b", "z"]);
    expect(order(items, "list", -1).map((i) => i.id)).toEqual(["b", "a", "z"]);
  });
});

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
    const sortBlock = source.slice(source.indexOf("const defaultCompare"), source.indexOf("const sortedProducts"));
    expect(sortBlock).toContain('compareProductText(a.brand ?? "", b.brand ?? "")');
    expect(sortBlock).toContain("compareProductText(productName(a), productName(b))");
    expect(sortBlock).toContain('compareProductText(a.model ?? "", b.model ?? "")');
    // productDisplayModel neredeyse her üründe model koduna eşit kalıyor;
    // sıralama artık ekranda yazılan gerçek adı (productName) izliyor.
    expect(sortBlock).not.toContain("productDisplayModel");
  });
});
