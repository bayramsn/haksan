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

describe("product technical print equipment", () => {
  it.each([
    { label: "empty lists", standard: [], optional: [], totalPages: 2 },
    { label: "blank rows", standard: ["", " \n "], optional: ["\t"], totalPages: 2 },
    { label: "standard only", standard: ["Fanuc kontrol ünitesi"], optional: [" "], totalPages: 3 },
    { label: "optional only", standard: [" "], optional: ["Takım ölçme probu"], totalPages: 3 },
    { label: "both populated", standard: ["Fanuc kontrol ünitesi"], optional: ["Takım ölçme probu"], totalPages: 3 },
  ])("uses the quote template without quote header and price pages: $label", ({ standard, optional, totalPages }) => {
    const doc = productTechnicalDoc({
      product: {
        ...product,
        specs: [{ key: "X Ekseni", value: "800", unit: "mm" }],
        standardEquipment: standard,
        optionalEquipment: optional,
      },
    }, "https://example.test/print");

    expect(doc.body).toContain("TEKNİK BİLGİLER");
    expect(doc.body.includes("TEZGAH DONANIMI")).toBe(totalPages === 3);
    expect(doc.body.includes("STANDART DONANIM")).toBe(standard.some((row) => row.trim()));
    expect(doc.body.includes("OPSİYONEL DONANIM")).toBe(optional.some((row) => row.trim()));
    for (const hidden of ["FİYAT TEKLİFİ", "FİYAT ve KOŞULLAR", "BELGE NO", "PROJE İLGİLİSİ", "GENEL TOPLAM"]) {
      expect(doc.body).not.toContain(hidden);
    }
    expect(doc.body).toContain("X Ekseni");
    expect(doc.body).toContain("800");
    expect([...doc.body.matchAll(/Sayfa <b>(\d+)<\/b> \/ <b>(\d+)<\/b>/g)].map((match) => [Number(match[1]), Number(match[2])]))
      .toEqual(Array.from({ length: totalPages }, (_, index) => [index + 1, totalPages]));
    for (const row of [...standard, ...optional].filter((value) => value.trim())) {
      expect(doc.body).toContain(row);
    }
  });

  it("honors explicitly empty equipment overrides even when catalog lists are populated", () => {
    const doc = productTechnicalDoc({
      product: { ...product, standardEquipment: ["Standart paket"], optionalEquipment: ["Takım ölçme probu"] },
      standardEquipment: [],
      optionalEquipment: [],
    }, "https://example.test/print");

    expect(doc.body).not.toContain("TEZGAH DONANIMI");
    expect(doc.body).not.toContain("Standart paket");
    expect(doc.body).not.toContain("Takım ölçme probu");
    expect(doc.body).toContain("Sayfa <b>2</b> / <b>2</b>");
  });
});

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
    expect(doc.body).toContain("q-photo-placeholder");
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

describe("base card model table", () => {
  const models = ["F-3015", "F-4020", "F-6020", "F-6520", "F-6025", "F-8025", "F-4015", "F-6015"];
  const modelTable = {
    models,
    groups: [
      { group: "Temel Parametreler", rows: [{ key: "Çalışma Alanı (mm)", values: models.map((model) => `${model}-alan`) }] },
      { group: "Diğer Parametreler", rows: [{ key: "Trafo Kapasitesi", values: models.map((_, index) => (index < 4 ? "" : "1,5 kW: 40 kVA\n3 kW: 50 kVA")) }] },
    ],
  };

  it("prints models as columns, split into blocks of at most four per page", () => {
    const doc = productTechnicalDoc({ product, modelTable }, "https://example.test/print");
    expect(doc.body).toContain("TEKNİK BİLGİLER (1/2)");
    expect(doc.body).toContain("TEKNİK BİLGİLER (2/2)");
    for (const model of models) expect(doc.body).toContain(`<td class="mh">${model}</td>`);
    expect(doc.body).toContain("TEMEL PARAMETRELER");
    // İlk blokta değeri olmayan satır basılmaz; ikinci blokta çok satırlı değer satır sonuyla.
    const [first, second] = doc.body.split("TEKNİK BİLGİLER (2/2)");
    expect(first).not.toContain("Trafo Kapasitesi");
    expect(second).toContain("1,5 kW: 40 kVA<br>3 kW: 50 kVA");
    expect(doc.body).not.toContain("FİYAT TEKLİFİ");
    // Kapak + iki model tablosu sayfası.
    expect(doc.body).toContain("Sayfa <b>3</b> / <b>3</b>");
    expect(doc.body).not.toContain("/ <b>2</b>");
  });

  it("keeps the single-column spec page when no model table is given", () => {
    const doc = productTechnicalDoc({ product: { ...product, specs: [{ key: "X Ekseni", value: "800", unit: "mm" }] }, modelTable: null }, "https://example.test/print");
    expect(doc.body).not.toContain("q-models");
    expect(doc.body).toContain("X Ekseni");
  });
});

