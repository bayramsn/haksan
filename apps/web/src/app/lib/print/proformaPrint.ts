// Proforma yazdırma/indirme: sabit sayfa düzeni + ilişkili teklif kaydında
// gerçekten saklanan müşteri, kalem, vergi, şart ve not alanları.

import type { Contact, Customer, DocumentItem, Offer, Product, SalesCase } from "../mock";
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
  contacts?: Contact[];
  /** Belgenin altına basılacak proforma not şablonu (CİF İstanbul / İşletme Teslim). */
  variantKey?: string;
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
      iskonto: Number(it.discountAmount ?? 0),
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
  const { doc, customers, cases, offers, products, contacts = [], variantKey } = input;
  const offer = resolveQuote(doc, offers);
  const sc = cases.find((s) => s.id === (doc.salesCaseId || offer?.salesCaseId)) ?? null;
  const cust =
    customers.find((c) => c.id === (doc.companyId || offer?.companyId || sc?.customerId)) ?? null;
  const contact = contacts.find((item) => item.id === quoteDetail?.contactId);
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

  const enteredVatRates = (quoteDetail?.items ?? []).map((item: { vatRate?: unknown }) => Number(item.vatRate ?? 0));
  const kdvOran = enteredVatRates.length > 0
    ? enteredVatRates.every((rate: number) => rate === enteredVatRates[0])
      ? Math.round(enteredVatRates[0])
      : 0
    : vat.oran;

  return {
    firma: cust?.name ?? "",
    ilgili: contact?.name || cust?.contactPerson,
    mobil: contact?.mobilePhone || cust?.phone2,
    adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : "",
    tel: contact?.phone || cust?.phone,
    faks: cust?.fax,
    vergiDairesi: cust?.taxOffice,
    vergiNo: cust?.taxNumber,
    tarih: trLongDate(doc.uploadedAt) || trLongDate(new Date()),
    belgeNo: doc.fileName,
    items,
    kdvOran,
    kdvTutar: Number(
      quoteDetail?.vatAmount ??
      quoteDetail?.items?.reduce((sum: number, item: { vatAmount?: unknown }) => sum + Number(item.vatAmount ?? 0), 0) ??
      vat.kdv,
    ),
    currency: (offer?.currency ?? sc?.currency ?? "USD") as ProformaPrintData["currency"],
    // Proforma not şablonu seçildiyse onun maddeleri ({{ALICI}}/{{YIL}} doldurularak)
    // belgenin altına basılır; seçilmediyse bağlı teklifin şartlarına düşülür.
    notlar: (() => {
      const variant = variantKey ? PROFORMA_NOTE_VARIANTS.find((v) => v.key === variantKey) : undefined;
      if (variant) {
        return fillNotePlaceholders(variant.notlar, {
          alici: cust?.name,
          yil: new Date(doc.uploadedAt || offer?.date || Date.now()).getFullYear(),
        });
      }
      return [
        quoteDetail?.terms?.paymentTermsText ?? quoteDetail?.paymentTerms,
        quoteDetail?.terms?.deliveryTermsText ?? quoteDetail?.deliveryTerms,
        quoteDetail?.terms?.warrantyTermsText ?? quoteDetail?.warrantyTerms,
        quoteDetail?.notes ?? offer?.note,
      ]
        .flatMap((value) => String(value ?? "").split(/\r?\n/))
        .map((value) => value.trim())
        .filter(Boolean);
    })(),
  };
}

/** İlişkili teklif kalemleri API'den çekilerek proforma verisi üretir. */
export async function loadProformaPrintData(input: ProformaBuildInput): Promise<ProformaPrintData> {
  const offer = resolveQuote(input.doc, input.offers);
  const quoteId = input.doc.quoteId ?? offer?.id;
  if (!quoteId) throw new Error("Proforma için ilişkili teklif bulunamadı.");
  const quoteDetail = await quoteService.get(quoteId);
  return buildProformaPrintData(input, quoteDetail);
}
