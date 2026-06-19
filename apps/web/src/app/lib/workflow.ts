import { pickStageCarryover } from "@haksan/shared";
import type { Product, SalesCase } from "./mock";

// Departmanlar arası "bir sonraki adım önceki adıma bağlı" mantığının web tarafındaki
// uygulama katmanı. Hangi alanların taşınacağını @haksan/shared > STAGE_CARRYOVER belirler;
// bu dosya o alanları her departmanın form şekline (ör. teklif satırı) dönüştürür.

type Currency = "USD" | "EUR" | "TRY";

// Bir teklif satırının carry-over ile ön-doldurulabilen alanları (QuoteDialog LineState alt kümesi).
export type CarriedQuoteLine = {
  categoryCode: string;
  productId: string;
  stockCode: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
};

export type CaseQuoteDefaults = {
  currency: Currency;
  line: CarriedQuoteLine;
  matchedProduct: Product | null;
};

const norm = (s?: string | null) =>
  (s ?? "").toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();

// Talep edilen ürün/model metnini katalogdaki bir ürünle eşler.
// Sıra: tam model eşleşmesi → model alt dize → "marka model" alt dize → talep metni alt dize.
function matchCatalogProduct(
  requestedProduct: string,
  requestedModel: string,
  products: Product[],
): Product | null {
  const model = norm(requestedModel);
  const product = norm(requestedProduct);
  if (!model && !product) return null;

  const exact = products.find(
    (p) => (model && norm(p.model) === model) || (model && norm(p.modelName) === model),
  );
  if (exact) return exact;

  if (model) {
    const partial = products.find(
      (p) => norm(p.model).includes(model) || norm(`${p.brand} ${p.model}`).includes(model),
    );
    if (partial) return partial;
  }

  if (product) {
    const byRequest = products.find((p) => norm(`${p.brand} ${p.model}`).includes(product));
    if (byRequest) return byRequest;
  }

  return null;
}

// Faz 1 · Satış kartı → Teklif: kartın talep alanlarından bir teklif satırı + para birimi türetir.
// STAGE_CARRYOVER.quote.carries dışındaki alanlar taşınmaz (sözleşme tek kaynak).
export function quoteDefaultsFromCase(sc: SalesCase, products: Product[]): CaseQuoteDefaults {
  const carried = pickStageCarryover(sc as unknown as Record<string, unknown>, "quote");
  const requestedProduct = String(carried.requestedProduct ?? "");
  const requestedModel = String(carried.requestedModel ?? "");
  const quantity = Number(carried.quantity ?? 1) || 1;
  const caseCurrency = (carried.currency as Currency) ?? sc.currency ?? "USD";

  const matched = matchCatalogProduct(requestedProduct, requestedModel, products);
  const description =
    matched?.shortDescription?.trim() ||
    [requestedProduct, requestedModel].filter(Boolean).join(" ").trim();

  return {
    // Eşleşen ürün varsa birim fiyat ondan geldiği için para birimini de üründen al; yoksa kart.
    currency: (matched?.currency as Currency) ?? caseCurrency,
    matchedProduct: matched,
    line: {
      categoryCode: matched?.categoryCode || "TEZGAH",
      productId: matched?.id ?? "",
      stockCode: matched?.stockCode || matched?.model || "",
      description,
      quantity: String(quantity),
      unitPrice: matched?.listPrice ? String(matched.listPrice) : "",
      vatRate: String(matched?.vatRate ?? 20),
    },
  };
}
