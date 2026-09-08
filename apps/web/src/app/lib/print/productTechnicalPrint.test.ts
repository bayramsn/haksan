import { describe, expect, it, vi } from "vitest";
import type { Product } from "../mock";
import { embedProductImageForPrint, productTechnicalDoc } from "./productTechnicalPrint";

const product = {
  id: "mmt-1170",
  brand: "HAXAN",
  model: "MMT-1170",
  modelName: "MMT-1170 CNC Dik İşleme Merkezi",
  shortDescription: "MMT-1170 CNC Dik İşleme Merkezi",
  specs: [],
  standardEquipment: [],
  optionalEquipment: [],
} as unknown as Product;

describe("product technical print image", () => {
  it('includes the saved laser configuration and exact units without filling unknown fields', () => {
    const doc = productTechnicalDoc({ product: { ...product, technicalConfiguration: {
      selection: { productTypeCode: 'BORU_LAZER_KESIM', series: 'TG', cabinType: 'closed', powerKw: 30, sourceModelCode: 'TG6012' },
      sourceRevision: 'test', modelLabel: 'TG6012', sizeLabel: 'Ø10–120 mm', supportedPower: false, standardCabin: true, issues: [],
      specs: [{ key: 'Konumlama Hassasiyeti', value: '0.03', unit: 'mm/m' }, { key: 'Makine Ağırlığı', value: '', unit: 'kg' }],
    } } }, '/brand');
    expect(doc.body).toContain('Kesim Bölgesi Koruması');
    expect(doc.body).toContain('Kapalı');
    expect(doc.body).toContain('TG6012');
    expect(doc.body).toContain('mm/m');
    expect(doc.body).not.toContain('Makine Ağırlığı');
  });
  it("embeds a validated product image as a data URL", async () => {
    const fetcher = vi.fn(async () => new Response(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      { status: 200, headers: { "content-type": "image/jpeg", "content-length": "4" } },
    ));

    const embedded = await embedProductImageForPrint(
      "https://example.test/products/mmt-1170.jpg",
      fetcher as typeof fetch,
    );

    expect(embedded).toBe("data:image/jpeg;base64,/9j/2Q==");
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.test/products/mmt-1170.jpg",
      { credentials: "include" },
    );
    expect(productTechnicalDoc(
      { product: { ...product, imageUrl: embedded } },
      "https://example.test/print",
    ).body).toContain(`src="${embedded}"`);
  });

  it("rejects unsafe image schemes in generated print HTML", () => {
    const doc = productTechnicalDoc(
      { product: { ...product, imageUrl: "javascript:alert(1)" } },
      "https://example.test/print",
    );

    expect(doc.body).not.toContain("javascript:");
    expect(doc.body).toContain("Ürün görseli bulunmuyor");
  });

  it("never renders the internal stock code", () => {
    const stockCode = "HAXAN.MMT-1170.15K.DDS.M.30T";
    const doc = productTechnicalDoc(
      {
        product: {
          ...product,
          stockCode,
          model: stockCode,
          modelName: "MMT-1170 CNC Dik İşleme Merkezi",
          shortDescription: `MMT-1170 CNC Dik İşleme Merkezi ${stockCode}`,
        },
      },
      "https://example.test/print",
    );

    expect(doc.title).not.toContain(stockCode);
    expect(doc.body).not.toContain(stockCode);
    expect(doc.body).toContain("MMT-1170 CNC Dik İşleme Merkezi");
  });

  it("omits unused dash-valued CRM specification rows", () => {
    const doc = productTechnicalDoc(
      {
        product: {
          ...product,
          specs: [
            { key: "Karşı Ayna Devri", value: "-" },
            { key: "Canlı Takım Devri", value: "4500", unit: "dev/dk" },
          ],
        },
      },
      "https://example.test/print",
    );

    expect(doc.body).not.toContain("Karşı Ayna Devri");
    expect(doc.body).toContain("Canlı Takım Devri");
  });
});
