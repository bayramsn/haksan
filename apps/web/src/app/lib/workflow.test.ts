import { describe, expect, it } from "vitest";
import { quoteDefaultsFromCase } from "./workflow";
import type { Product, SalesCase } from "./mock";

const product = (overrides: Partial<Product> = {}): Product =>
  ({
    id: "p1",
    brand: "HAXAN",
    model: "MMT-1170",
    type: "İşleme Merkezi",
    categoryCode: "TEZGAH",
    stockCode: "MMT1170",
    shortDescription: "HAXAN MMT-1170 dik işleme merkezi",
    listPrice: 100000,
    cashPrice: 95000,
    currency: "USD",
    vatRate: 20,
    ...overrides,
  }) as unknown as Product;

const salesCase = (overrides: Partial<SalesCase> = {}): SalesCase =>
  ({
    id: "c1",
    requestedProduct: "HAXAN",
    requestedModel: "MMT-1170",
    quantity: 1,
    currency: "USD",
    ...overrides,
  }) as unknown as SalesCase;

describe("fırsattan teklif satırı türetme", () => {
  it("makine listesi yokken tek satır üretir", () => {
    const defaults = quoteDefaultsFromCase(salesCase(), [product()]);
    expect(defaults.lines).toHaveLength(1);
    expect(defaults.line).toBe(defaults.lines[0]);
    expect(defaults.lines[0]).toMatchObject({ productId: "p1", quantity: "1" });
  });

  it("fırsattaki her makine için ayrı satır üretir ve adedi taşır", () => {
    const products = [product(), product({ id: "p2", model: "VMC-850", stockCode: "VMC850", shortDescription: "HAXAN VMC-850" })];
    const defaults = quoteDefaultsFromCase(
      salesCase({
        machines: [
          { productModelId: "p2", name: "HAXAN VMC-850", quantity: 3 },
          { name: "Katalogda olmayan tezgah", quantity: 1 },
        ],
      }),
      products,
    );

    expect(defaults.lines).toHaveLength(2);
    expect(defaults.lines[0]).toMatchObject({ productId: "p2", quantity: "3", stockCode: "VMC850" });
    // Katalogda karşılığı yoksa satır serbest adla açılır; fiyat boş kalır.
    expect(defaults.lines[1]).toMatchObject({ productId: "", description: "Katalogda olmayan tezgah", unitPrice: "" });
  });

  it("adı boş makineyi satıra çevirmez", () => {
    const defaults = quoteDefaultsFromCase(
      salesCase({ machines: [{ name: "   ", quantity: 1 }] }),
      [product()],
    );
    // Liste tümüyle boşsa eski tek-satır davranışına düşer.
    expect(defaults.lines).toHaveLength(1);
    expect(defaults.lines[0].productId).toBe("p1");
  });
});
