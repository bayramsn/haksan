import { describe, expect, it } from "vitest";
import {
  computeProformaTotals,
  discountAmountFromPercent,
  discountPercentOf,
  parseMoneyInput,
  proformaRowError,
  quoteToProformaPriceRows,
  snapshotToDocumentDiscount,
  type ProformaPriceRow,
} from "./proformaPricing";

const row = (overrides: Partial<ProformaPriceRow> = {}): ProformaPriceRow => ({
  quoteItemId: "item-1",
  description: "MT-210",
  quantity: 1,
  unitCode: "adet",
  unitPrice: 100,
  discountAmount: 0,
  vatRate: 20,
  ...overrides,
});

describe("proforma pricing", () => {
  it("keeps editable proforma unit prices gross instead of hiding discounts in them", () => {
    const rows = quoteToProformaPriceRows({
      discountTotal: 300,
      items: [
        { id: "1", description: "Makine A", quantity: 1, unitPrice: 1_000, discountAmount: 100, lineTotal: 900, vatRate: 20 },
        { id: "2", description: "Makine B", quantity: 2, unitPrice: 500, discountAmount: 100, lineTotal: 900, vatRate: 20 },
      ],
    });

    expect(rows).toEqual([
      { quoteItemId: "1", description: "Makine A", quantity: 1, unitCode: "adet", unitPrice: 1_000, discountAmount: 100, vatRate: 20 },
      { quoteItemId: "2", description: "Makine B", quantity: 2, unitCode: "adet", unitPrice: 500, discountAmount: 100, vatRate: 20 },
    ]);
  });

  it("teklif kaleminin birimini korur ve negatif iskontoyu sıfırlar", () => {
    const [mapped] = quoteToProformaPriceRows({
      items: [{ id: "a", description: " Torna ", quantity: "2", unitCode: "kg", unitPrice: "1500.5", discountAmount: "-40", vatRate: "10" }],
    });
    expect(mapped).toEqual({
      quoteItemId: "a",
      description: "Torna",
      quantity: 2,
      unitCode: "kg",
      unitPrice: 1500.5,
      discountAmount: 0,
      vatRate: 10,
    });
  });
});

describe("computeProformaTotals", () => {
  it("satır iskontosunu düşüp KDV'yi net tutar üzerinden hesaplar", () => {
    const totals = computeProformaTotals([row({ quantity: 2, unitPrice: 1_000, discountAmount: 500, vatRate: 20 })]);
    expect(totals.gross).toBe(2_000);
    expect(totals.lineDiscount).toBe(500);
    expect(totals.headerDiscount).toBe(0);
    expect(totals.subtotal).toBe(1_500);
    expect(totals.vat).toBe(300);
    expect(totals.grand).toBe(1_800);
  });

  it("teklif geneli iskontoyu satır iskontosundan ayırır ve KDV'yi oranlar", () => {
    // Teklifin toplam iskontosu 300; 100'ü satır iskontosu, kalan 200 teklif geneli.
    const totals = computeProformaTotals(
      [row({ quantity: 1, unitPrice: 1_000, discountAmount: 100, vatRate: 20 })],
      { quoteDiscountTotal: 300 },
    );
    expect(totals.lineDiscount).toBe(100);
    expect(totals.headerDiscount).toBe(200);
    expect(totals.subtotal).toBe(700);
    expect(totals.vat).toBe(140);
    expect(totals.grand).toBe(840);
  });

  it("belge satır iskontosu değişse de teklif başlık iskontosunu sabit tutar", () => {
    const totals = computeProformaTotals(
      [row({ quantity: 1, unitPrice: 1_000, discountAmount: 0, vatRate: 20 })],
      { quoteDiscountTotal: 300, headerDiscountAmount: 200 },
    );
    expect(totals.lineDiscount).toBe(0);
    expect(totals.headerDiscount).toBe(200);
    expect(totals.subtotal).toBe(800);
    expect(totals.vat).toBe(160);
    expect(totals.grand).toBe(960);
  });

  it("teklif geneli iskontoyu net toplamla sınırlar", () => {
    const totals = computeProformaTotals([row({ quantity: 1, unitPrice: 100 })], { quoteDiscountTotal: 5_000 });
    expect(totals.headerDiscount).toBe(100);
    expect(totals.subtotal).toBe(0);
    expect(totals.vat).toBe(0);
    expect(totals.grand).toBe(0);
  });

  it("farklı KDV oranlarını satır bazında toplar", () => {
    const totals = computeProformaTotals([
      row({ quoteItemId: "a", quantity: 1, unitPrice: 1_000, vatRate: 20 }),
      row({ quoteItemId: "b", quantity: 1, unitPrice: 1_000, vatRate: 10 }),
    ]);
    expect(totals.subtotal).toBe(2_000);
    expect(totals.vat).toBe(300);
  });

  it("gümrük tutarını KDV matrahına katmadan genel toplama ekler", () => {
    const totals = computeProformaTotals([row({ quantity: 1, unitPrice: 1_000, vatRate: 20 })], { customsTotal: 250 });
    expect(totals.vat).toBe(200);
    expect(totals.customs).toBe(250);
    expect(totals.grand).toBe(1_450);
  });

  it("kalem yokken sıfır döner", () => {
    expect(computeProformaTotals([], { quoteDiscountTotal: 100 })).toEqual({
      gross: 0, lineDiscount: 0, headerDiscount: 0, subtotal: 0, vat: 0, customs: 0, grand: 0,
    });
  });
});

describe("proformaRowError", () => {
  it("iskonto brüt tutarı aşarsa uyarır", () => {
    expect(proformaRowError(row({ quantity: 1, unitPrice: 100, discountAmount: 250 }))).toBe(
      "Satır iskontosu brüt tutarı aşıyor",
    );
  });

  it("geçerli satırda hata vermez", () => {
    expect(proformaRowError(row({ quantity: 2, unitPrice: 100, discountAmount: 100 }))).toBeNull();
  });
});

describe("parseMoneyInput", () => {
  it("tr-TR ve düz biçimleri okur", () => {
    expect(parseMoneyInput("1.234,56")).toBe(1_234.56);
    expect(parseMoneyInput("1234.56")).toBe(1_234.56);
    expect(parseMoneyInput("1234,56")).toBe(1_234.56);
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("-50")).toBe(0);
  });
});

describe("belge geneli iskonto", () => {
  it("tutar girildiğinde tekliften devralınan genel iskontonun yerine geçer", () => {
    const totals = computeProformaTotals([row({ quantity: 1, unitPrice: 1_000, vatRate: 20 })], {
      headerDiscountAmount: 400,
      documentDiscount: { amount: 100, percent: 0 },
    });
    expect(totals.headerDiscount).toBe(100);
    expect(totals.subtotal).toBe(900);
    // KDV iskonto oranıyla ölçeklenir: 1.000 × 0,9 × %20.
    expect(totals.vat).toBe(180);
    expect(totals.grand).toBe(1_080);
  });

  it("yüzde girildiğinde tutarı net ara toplamdan türetir", () => {
    const totals = computeProformaTotals(
      [row({ quantity: 2, unitPrice: 1_000, discountAmount: 200, vatRate: 20 })],
      { documentDiscount: { amount: 0, percent: 10 } },
    );
    // Net ara toplam 1.800 → %10 = 180.
    expect(totals.lineDiscount).toBe(200);
    expect(totals.headerDiscount).toBe(180);
    expect(totals.subtotal).toBe(1_620);
  });

  it("net ara toplamı aşan iskontoyu kırpar", () => {
    const totals = computeProformaTotals([row({ quantity: 1, unitPrice: 500 })], {
      documentDiscount: { amount: 9_999, percent: 0 },
    });
    expect(totals.headerDiscount).toBe(500);
    expect(totals.subtotal).toBe(0);
  });

  it("boş iskonto teklifin genel iskontosunu bozmaz", () => {
    const totals = computeProformaTotals([row({ quantity: 1, unitPrice: 1_000 })], {
      headerDiscountAmount: 250,
      documentDiscount: { amount: 0, percent: 0 },
    });
    expect(totals.headerDiscount).toBe(250);
  });

  it("anlık görüntüdeki girdiyi geri okur", () => {
    expect(snapshotToDocumentDiscount({ documentDiscount: { amount: 120, percent: 0 } })).toEqual({ amount: 120, percent: 0 });
    expect(snapshotToDocumentDiscount(undefined)).toEqual({ amount: 0, percent: 0 });
  });
});

describe("satır iskonto yüzdesi", () => {
  it("tutarı yüzdeye ve yüzdeyi tutara çevirir", () => {
    const line = row({ quantity: 2, unitPrice: 500, discountAmount: 100 });
    expect(discountPercentOf(line)).toBe(10);
    expect(discountAmountFromPercent(line, 25)).toBe(250);
  });

  it("brüt tutarı aşan yüzdeyi kırpar ve sıfır brütte çökmez", () => {
    expect(discountAmountFromPercent(row({ quantity: 1, unitPrice: 100 }), 250)).toBe(100);
    expect(discountPercentOf(row({ quantity: 0, unitPrice: 0 }))).toBe(0);
  });
});
