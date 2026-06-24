import type { Contact, Customer, Offer, Product, SalesCase, User } from "../mock";
import { quoteService } from "../../../lib/services";
import { trShortDate } from "./core";
import type { QuotePrintData } from "./templates";

type QuoteDetail = Awaited<ReturnType<typeof quoteService.get>>;

export type QuoteBuildInput = {
  offer: Offer;
  customer: Customer | null;
  salesCase: SalesCase | null;
  users: User[];
  contacts: Contact[];
  products: Product[];
};

const enteredLines = (value?: string | null): string[] =>
  String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const findProduct = (
  products: Product[],
  quote: QuoteDetail,
  salesCase: SalesCase | null,
): Product | undefined => {
  const firstProductId = quote.items?.find(
    (item: { productModelId?: string | null; description?: string | null }) =>
      item.productModelId && !String(item.description ?? "").trimStart().startsWith("↳ Opsiyon:"),
  )?.productModelId;
  if (firstProductId) {
    const exact = products.find((product) => product.id === firstProductId);
    if (exact) return exact;
  }

  const model = salesCase?.requestedModel?.trim();
  return products.find(
    (product) => product.model && model && (model.includes(product.model) || product.model.includes(model)),
  );
};

const numeric = (value: unknown): number => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};

export function buildQuotePrintData(input: QuoteBuildInput, quote: QuoteDetail): QuotePrintData {
  const { offer, customer, salesCase, users, contacts, products } = input;
  const contact = contacts.find((item) => item.id === quote.contactId);
  const owner = users.find((item) => item.id === quote.projectOwnerUserId);
  const product = findProduct(products, quote, salesCase);
  const quoteItems = (quote.items ?? []).filter((item: { description?: string | null }) =>
    String(item.description ?? "").trim(),
  );
  const vatRates = quoteItems.map((item: { vatRate?: unknown }) => numeric(item.vatRate));
  const commonVatRate = vatRates.length > 0 && vatRates.every((rate: number) => rate === vatRates[0])
    ? vatRates[0]
    : 0;
  const terms = quote.terms ?? {};
  const selectedOptions = quoteItems
    .map((item: { description?: string | null }) => String(item.description ?? "").trim())
    .filter((description: string) => description.startsWith("↳ Opsiyon:"))
    .map((description: string) => description.replace(/^↳\s*Opsiyon:\s*/, ""));

  return {
    firma: customer?.name ?? "",
    ilgili: contact?.name || customer?.contactPerson,
    mobil: contact?.mobilePhone || customer?.phone2,
    adres: customer ? [customer.address, customer.district, customer.city].filter(Boolean).join(" ") : "",
    tel: contact?.phone || customer?.phone,
    faks: customer?.fax,
    email: contact?.email || customer?.email,
    tarih: trShortDate(quote.quoteDate || offer.date),
    belgeNo: quote.documentNo || offer.quoteNo,
    gecerlilik: quote.validityDays ? `${quote.validityDays} Gün` : "",
    projeIlgilisi: owner?.name,
    projeIlgilisiUnvan: owner?.department,
    projeIlgilisiEmail: owner?.email,
    marka: product?.brand,
    model: product?.model ?? salesCase?.requestedModel,
    tip: product?.type ?? salesCase?.requestedProduct,
    imageUrl: product?.imageUrl || undefined,
    specs: product?.specs,
    standartDonanim: product?.standardEquipment ?? [],
    opsiyonelDonanim: selectedOptions,
    items: quoteItems.map((item: {
      description?: string | null;
      quantity?: unknown;
      unitCode?: string | null;
      unitPrice?: unknown;
      lineTotal?: unknown;
      discountAmount?: unknown;
    }) => {
      const quantity = numeric(item.quantity) || 1;
      const unitPrice = numeric(item.unitPrice);
      const lineTotal = item.lineTotal == null
        ? quantity * unitPrice - numeric(item.discountAmount)
        : numeric(item.lineTotal);
      return {
        urun: String(item.description ?? "").trim(),
        birim: `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(quantity)} ${item.unitCode || "Adet"}`,
        fiyat: unitPrice,
        indirim: numeric(item.discountAmount),
        tutar: lineTotal,
      };
    }),
    kdvOran: commonVatRate,
    kdvTutar: numeric(quote.vatAmount ?? offer.vatTotal),
    currency: offer.currency,
    notes: {
      key: "entered",
      label: "Girilen şartlar",
      odeme: enteredLines(terms.paymentTermsText ?? quote.paymentTerms),
      teslimat: enteredLines(terms.deliveryTermsText ?? quote.deliveryTerms),
      garanti: enteredLines(terms.warrantyTermsText ?? quote.warrantyTerms),
    },
    genelNotlar: enteredLines(quote.notes ?? offer.note),
  };
}

export async function loadQuotePrintData(input: QuoteBuildInput): Promise<QuotePrintData> {
  const quote = await quoteService.get(input.offer.id);
  return buildQuotePrintData(input, quote);
}
