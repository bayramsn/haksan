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
  /** Geriye dönük: ilk satır. Yeni çağıranlar `lines` kullanmalı. */
  line: CarriedQuoteLine;
  /** Fırsattaki her makine için bir satır; liste boşsa tek elemanlıdır. */
  lines: CarriedQuoteLine[];
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

  const lineFor = (product: Product | null, fallbackDescription: string, lineQuantity: number): CarriedQuoteLine => ({
    categoryCode: product?.categoryCode || "TEZGAH",
    productId: product?.id ?? "",
    stockCode: product?.stockCode || product?.model || "",
    description: product?.shortDescription?.trim() || fallbackDescription,
    quantity: String(lineQuantity),
    unitPrice: product?.listPrice ? String(product.listPrice) : "",
    vatRate: String(product?.vatRate ?? 20),
  });

  // Fırsat firma bazlı: kartta birden çok makine varsa her biri ayrı satır olur.
  const machineLines = (sc.machines ?? [])
    .filter((machine) => machine?.name?.trim())
    .map((machine) => {
      const product =
        (machine.productModelId ? products.find((item) => item.id === machine.productModelId) : null)
        ?? matchCatalogProduct(machine.name, "", products);
      return lineFor(product ?? null, machine.name.trim(), Number(machine.quantity) || 1);
    });

  const fallbackLine = lineFor(matched, description, quantity);
  const lines = machineLines.length ? machineLines : [fallbackLine];

  return {
    // Eşleşen ürün varsa birim fiyat ondan geldiği için para birimini de üründen al; yoksa kart.
    currency: (matched?.currency as Currency) ?? caseCurrency,
    matchedProduct: matched,
    line: lines[0],
    lines,
  };
}
