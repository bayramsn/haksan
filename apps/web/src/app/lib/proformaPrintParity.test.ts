import { describe, expect, it } from "vitest";
import type { DocumentItem } from "./mock";
import { loadProformaPrintData, proformaDoc } from "./print";
import { computeProformaTotals, snapshotToProformaPriceRows } from "./proformaPricing";

/**
 * Proforma dialoglarındaki toplam paneli ile yazdırılan belgenin GENEL TOPLAM'ı aynı
 * anlık görüntüden beslenir. Bu test ikisinin ayrışmadığını sabitler: kullanıcı ekranda
 * gördüğü tutarı imzalayacağı belgede de görmeli.
 */

/** API'nin `buildProformaDocumentSnapshot` çıktısıyla aynı şekle sahip test verisi. */
const buildSnapshot = (options: {
  items: Array<{
    id: string; quantity: number; unitPrice: number; discountAmount: number; vatRate: number;
    /** Gümrük yalnızca millileştirilmiş kalemlere dağıtılır — API de böyle üretir. */
    nationalized?: boolean;
  }>;
  headerDiscount?: number;
  customsTotal?: number;
}) => {
  const lineDiscount = options.items.reduce((sum, item) => sum + item.discountAmount, 0);
  const taxableBeforeHeader = options.items.reduce(
    (sum, item) => sum + (item.quantity * item.unitPrice - item.discountAmount),
    0,
  );
  const headerDiscount = Math.min(options.headerDiscount ?? 0, taxableBeforeHeader);
  const headerRatio = taxableBeforeHeader > 0 ? (taxableBeforeHeader - headerDiscount) / taxableBeforeHeader : 1;
  const vatAmount = options.items.reduce(
    (sum, item) => sum + (item.quantity * item.unitPrice - item.discountAmount) * headerRatio * (item.vatRate / 100),
    0,
  );
  const customsTotal = options.customsTotal ?? 0;
  const subtotal = taxableBeforeHeader - headerDiscount;
  return {
    schemaVersion: 4,
    capturedAt: "2026-01-15T00:00:00.000Z",
    currency: { code: "USD" },
    company: { legalTitle: "TEST MAKİNA SAN. TİC. A.Ş." },
    contact: {},
    companyAddresses: [{ fullAddress: "Organize Sanayi Bölgesi, Bursa" }],
    companyPhones: [],
    terms: {},
    quote: {
      discountTotal: lineDiscount + headerDiscount,
      vatAmount,
      customsTotal,
      subtotal,
      grandTotal: subtotal + vatAmount + customsTotal,
    },
    items: options.items.map((item) => ({
      ...item,
      description: `Kalem ${item.id}`,
      unitCode: "adet",
      lineTotal: item.quantity * item.unitPrice - item.discountAmount,
    })),
  };
};

const asDocument = (snapshot: Record<string, any>): DocumentItem => ({
  id: "proforma-1",
  salesCaseId: "",
  source: "commercial_record",
  quoteId: "quote-1",
  type: "Proforma",
  fileName: "PRF-2026/001",
  uploadedBy: "",
  uploadedAt: "2026-01-15",
  size: "Kayıt",
  documentSnapshot: snapshot,
});

/** Yazdırılan HTML'den "GENEL TOPLAM" satırındaki tutarı sayı olarak okur. */
const printedGrandTotal = (html: string): number => {
  const match = html.match(/GENEL TOPLAM<\/td><td class="tv">([^<]+)<\/td>/);
  if (!match) throw new Error("Yazdırma çıktısında GENEL TOPLAM bulunamadı");
  const numeric = match[1].replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(numeric);
};

/** Her iki yüzey de tutarı iki ondalıkla gösterdiği için karşılaştırma o hassasiyette yapılır. */
const displayed = (value: number) => Number(value.toFixed(2));

const grandTotals = async (snapshot: Record<string, any>) => {
  const data = await loadProformaPrintData({
    doc: asDocument(snapshot),
    customers: [],
    cases: [],
    offers: [],
    products: [],
  });
  // printAssetBase() `window` gerektirir; testte sabit bir kök yeterli.
  const rendered = proformaDoc(data, "/print");
  const panel = computeProformaTotals(snapshotToProformaPriceRows(snapshot), {
    quoteDiscountTotal: Number(snapshot.quote.discountTotal ?? 0),
    customsTotal: Number(snapshot.quote.customsTotal ?? 0),
  }).grand;
  return { printed: printedGrandTotal(rendered.body), panel: displayed(panel) };
};

describe("proforma toplam paneli ↔ yazdırma çıktısı", () => {
  it("satır iskontolu tek kalemde aynı genel toplamı verir", async () => {
    const snapshot = buildSnapshot({
      items: [{ id: "a", quantity: 1, unitPrice: 18_500, discountAmount: 1_300, vatRate: 20 }],
    });
    const { printed, panel } = await grandTotals(snapshot);
    expect(panel).toBe(20_640);
    expect(printed).toBe(panel);
  });

  it("teklif geneli iskonto ve karışık KDV oranlarında örtüşür", async () => {
    const snapshot = buildSnapshot({
      items: [
        { id: "a", quantity: 2, unitPrice: 12_000, discountAmount: 1_000, vatRate: 20 },
        { id: "b", quantity: 3, unitPrice: 900, discountAmount: 0, vatRate: 10 },
      ],
      headerDiscount: 2_500,
    });
    const { printed, panel } = await grandTotals(snapshot);
    expect(printed).toBe(panel);
  });

  /**
   * Teklifsiz ("hızlı") proformanın anlık görüntüsünü API `buildStandaloneProformaSnapshot`
   * üretir. Aşağıdaki veri gerçek bir POST /proformas/standalone yanıtından alınmıştır;
   * yazdırma katmanının teklif olmadan da doğru okuduğunu sabitler.
   */
  it("teklifsiz hızlı proformada firma, kalem ve toplamı doğru basar", async () => {
    const snapshot = {
      schemaVersion: 4,
      standalone: true,
      capturedAt: "2026-08-05T08:44:02.497Z",
      currency: { code: "USD" },
      company: {
        id: null,
        shortName: null,
        legalTitle: "ÖRNEK HIZLI İŞ MAKİNA SAN. LTD. ŞTİ.",
        taxOffice: "Nilüfer",
        taxNumber: "1234567890",
      },
      contact: { fullName: "Ahmet Yılmaz", workPhone: null, mobilePhone: "0532 000 00 00" },
      companyAddresses: [{ fullAddress: "Nilüfer Organize Sanayi Bölgesi, Bursa" }],
      companyPhones: [],
      terms: { paymentTermsText: null, deliveryTermsText: null, warrantyTermsText: null },
      quote: {
        notes: null,
        subtotal: 2_800,
        vatAmount: 560,
        grandTotal: 3_360,
        customsTotal: 0,
        discountTotal: 200,
      },
      items: [
        {
          id: "578a7062-fc27-4b9a-a02d-2b5eb4aa6a3d",
          product: null,
          productModelId: null,
          nationalized: false,
          description: "Fanuc servo motor değişimi ve devreye alma",
          quantity: 2,
          unitCode: "adet",
          unitPrice: 1_500,
          discountAmount: 200,
          vatRate: 20,
          lineTotal: 2_800,
          vatAmount: 560,
        },
      ],
    };

    const data = await loadProformaPrintData({
      doc: asDocument(snapshot),
      customers: [],
      cases: [],
      offers: [],
      products: [],
    });
    const body = proformaDoc(data, "/print").body;

    expect(data.firma).toBe("ÖRNEK HIZLI İŞ MAKİNA SAN. LTD. ŞTİ.");
    expect(data.vergiDairesi).toBe("Nilüfer");
    expect(data.adres).toBe("Nilüfer Organize Sanayi Bölgesi, Bursa");
    expect(data.items[0].aciklama).toBe("Fanuc servo motor değişimi ve devreye alma");
    expect(data.items[0].birim).toBe("2 Adet");
    expect(printedGrandTotal(body)).toBe(3_360);
    const { panel } = await grandTotals(snapshot);
    expect(panel).toBe(3_360);
  });

  it("millileştirme tutarı olan proformada örtüşür", async () => {
    const snapshot = buildSnapshot({
      items: [{ id: "a", quantity: 1, unitPrice: 40_000, discountAmount: 0, vatRate: 20, nationalized: true }],
      customsTotal: 6_250,
    });
    const { printed, panel } = await grandTotals(snapshot);
    expect(panel).toBe(54_250);
    expect(printed).toBe(panel);
  });
});
