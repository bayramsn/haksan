// Proforma yazdırma/indirme: sabit şablon (layout + standart not metinleri) +
// her işlem için CRM/teklif verisinden doldurulan alanlar.

import type { Customer, DocumentItem, Offer, Product, SalesCase } from "../mock";
import { quoteService } from "../../../lib/services";
import { splitVat } from "../pageHelpers";
import { trLongDate } from "./core";
import { PROFORMA_NOTE_VARIANTS, fillNotePlaceholders } from "./notes";
import type { ProformaItem, ProformaPrintData } from "./templates";

export type ProformaBuildInput = {
  doc: DocumentItem;
  customers: Customer[];
  cases: SalesCase[];
  offers: Offer[];
  products: Product[];
  variantKey: string;
};

type QuoteDetail = Awaited<ReturnType<typeof quoteService.get>>;

const findProduct = (
  products: Product[],
  opts: { productModelId?: string; modelHint?: string; description?: string },
): Product | undefined => {
  if (opts.productModelId) {
    const byId = products.find((p) => p.id === opts.productModelId);
    if (byId) return byId;
  }
  const hint = opts.modelHint?.trim() || "";
  if (hint) {
    return products.find(
      (p) =>
        (p.model && (hint.includes(p.model) || p.model.includes(hint))) ||
        (p.modelName && hint.includes(p.modelName)),
    );
  }
  const desc = opts.description?.toLowerCase() ?? "";
  if (desc) {
    return products.find(
      (p) =>
        (p.model && desc.includes(p.model.toLowerCase())) ||
        (p.brand && desc.includes(p.brand.toLowerCase())),
    );
  }
  return undefined;
};

const formatBirim = (quantity: number, unitCode?: string | null): string => {
  const q = Number(quantity);
  const unit = (unitCode ?? "adet").toLowerCase();
  if (unit === "adet") return `${q} Adet`;
  return `${q} ${unitCode ?? "Adet"}`;
};

const resolveQuote = (doc: DocumentItem, offers: Offer[]): Offer | null => {
  if (doc.quoteId) return offers.find((o) => o.id === doc.quoteId) ?? null;
  if (doc.salesCaseId) {
    const byCase = offers
      .filter((o) => o.salesCaseId === doc.salesCaseId)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (byCase.length) return byCase[0];
  }
  if (doc.companyId) {
    const byCo = offers
      .filter((o) => o.companyId === doc.companyId)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (byCo.length) return byCo[0];
  }
  return null;
};

const itemsFromQuote = (quote: QuoteDetail, products: Product[], sc: SalesCase | null): ProformaItem[] => {
  const rows = (quote.items ?? []).filter((it: any) => String(it?.description ?? "").trim());
  if (!rows.length) return [];

  return rows.map((it: any) => {
    const qty = Number(it.quantity ?? 1);
    const unitPrice = Number(it.unitPrice ?? 0);
    const lineTotal = Number(it.lineTotal ?? qty * unitPrice - Number(it.discountAmount ?? 0));
    const product = findProduct(products, {
      productModelId: it.productModelId ?? undefined,
      description: it.description,
      modelHint: sc?.requestedModel,
    });
    return {
      aciklama: String(it.description ?? "").trim(),
      marka: product?.brand,
      mensei: product?.originCountry,
      gtip: product?.hsCode,
      birim: formatBirim(qty, it.unit?.code ?? it.unitCode),
      birimFiyati: unitPrice,
      tutar: lineTotal,
    };
  });
};

const fallbackItem = (
  ctx: {
    urunAdi: string;
    product?: Product;
    qty: number;
    net: number;
  },
): ProformaItem[] => [
  {
    aciklama: ctx.urunAdi,
    marka: ctx.product?.brand,
    mensei: ctx.product?.originCountry,
    gtip: ctx.product?.hsCode,
    birim: `${ctx.qty} Adet`,
    birimFiyati: ctx.net,
    tutar: ctx.net,
  },
];

/** Teklif detayı çekilmeden senkron önizleme / hızlı doldurma. */
export function buildProformaPrintData(
  input: ProformaBuildInput,
  quoteDetail?: QuoteDetail | null,
): ProformaPrintData {
  const { doc, customers, cases, offers, products, variantKey } = input;
  const variant = PROFORMA_NOTE_VARIANTS.find((v) => v.key === variantKey) ?? PROFORMA_NOTE_VARIANTS[0];
  const offer = resolveQuote(doc, offers);
  const sc = cases.find((s) => s.id === (doc.salesCaseId || offer?.salesCaseId)) ?? null;
  const cust =
    customers.find((c) => c.id === (doc.companyId || offer?.companyId || sc?.customerId)) ?? null;
  const model = sc?.requestedModel ?? "";
  const product = findProduct(products, { modelHint: model, description: sc?.requestedProduct });
  const amount = Number(offer?.amount ?? sc?.estimatedAmount ?? 0);
  const vat = splitVat(amount, { subtotal: offer?.subtotal, vatTotal: offer?.vatTotal });
  const qty = sc?.quantity ?? 1;
  const urunAdi =
    product?.shortDescription ||
    [sc?.requestedProduct, sc?.requestedModel].filter(Boolean).join(" ") ||
    doc.fileName;

  const items =
    quoteDetail && (quoteDetail.items?.length ?? 0) > 0
      ? itemsFromQuote(quoteDetail, products, sc)
      : fallbackItem({ urunAdi, product, qty, net: vat.net });

  const araToplam = items.reduce((a, i) => a + i.tutar, 0);
  const kdvOran =
    quoteDetail?.items?.[0]?.vatRate != null
      ? Math.round(Number(quoteDetail.items[0].vatRate))
      : vat.oran;

  return {
    firma: cust?.name ?? "",
    ilgili: cust?.contactPerson,
    mobil: cust?.phone2,
    adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : "",
    tel: cust?.phone,
    faks: cust?.fax,
    vergiDairesi: cust?.taxOffice,
    vergiNo: cust?.taxNumber,
    tarih: trLongDate(doc.uploadedAt) || trLongDate(new Date()),
    belgeNo: doc.fileName,
    items,
    kdvOran,
    kdvTutar: 0,
    currency: (offer?.currency ?? sc?.currency ?? "USD") as ProformaPrintData["currency"],
    notlar: fillNotePlaceholders(variant.notlar, {
      alici: cust?.name,
      yil: new Date(doc.uploadedAt || offer?.date || Date.now()).getFullYear(),
    }),
  };
}

/** İlişkili teklif kalemleri API'den çekilerek proforma verisi üretir. */
export async function loadProformaPrintData(input: ProformaBuildInput): Promise<ProformaPrintData> {
  const offer = resolveQuote(input.doc, input.offers);
  const quoteId = input.doc.quoteId ?? offer?.id;
  let quoteDetail: QuoteDetail | null = null;
  if (quoteId) {
    try {
      quoteDetail = await quoteService.get(quoteId);
    } catch {
      quoteDetail = null;
    }
  }
  return buildProformaPrintData(input, quoteDetail);
}
