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
  const isLabor = (product?: Product) => product?.categoryCode === "ISCILIK";
  const firstProductId = quote.items?.find(
    (item: { productModelId?: string | null; description?: string | null }) =>
      item.productModelId &&
      !String(item.description ?? "").trimStart().startsWith("↳ Opsiyon:") &&
      !isLabor(products.find((product) => product.id === item.productModelId)),
  )?.productModelId;
  if (firstProductId) {
    const exact = products.find((product) => product.id === firstProductId);
    if (exact) return exact;
  }

  const model = salesCase?.requestedModel?.trim();
  return products.find(
    (product) => !isLabor(product) && product.model && model && (model.includes(product.model) || product.model.includes(model)),
  );
};

const numeric = (value: unknown): number => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};

const quoteItemTechnicalSpecs = (item?: { compatibility?: unknown } | null): Array<{ key: string; value: string; unit?: string; specUnit?: string }> => {
  const specs = (item?.compatibility as { technicalSpecs?: unknown } | null | undefined)?.technicalSpecs;
  if (!Array.isArray(specs)) return [];
  return specs
    .map((spec) => ({
      key: String((spec as { key?: unknown }).key ?? "").trim(),
      value: String((spec as { value?: unknown }).value ?? "").trim(),
      unit: String((spec as { unit?: unknown; specUnit?: unknown }).unit ?? (spec as { specUnit?: unknown }).specUnit ?? "").trim() || undefined,
      specUnit: String((spec as { unit?: unknown; specUnit?: unknown }).unit ?? (spec as { specUnit?: unknown }).specUnit ?? "").trim() || undefined,
    }))
    .filter((spec) => spec.key && spec.value);
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
  const mainProductItem = quoteItems.find((item: { description?: string | null; productModelId?: string | null }) =>
    item.productModelId &&
    !String(item.description ?? "").trimStart().startsWith("↳ Opsiyon:") &&
    products.find((product) => product.id === item.productModelId)?.categoryCode !== "ISCILIK"
  );
  const customSpecs = quoteItemTechnicalSpecs(mainProductItem as { compatibility?: unknown } | undefined);

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
    specs: customSpecs.length ? customSpecs : product?.specs,
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
