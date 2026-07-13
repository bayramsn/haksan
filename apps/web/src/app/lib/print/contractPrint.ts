import type { Customer, Offer, Payment, Product, SalesCase, ProductSpec } from "../mock";
import { quoteService } from "../../../lib/services";
import { specsForProductTypeStrict } from "../productSpecTemplates";
import { trShortDate } from "./core";
import type { ContractPrintData } from "./templates";

// Tezgahın tam teknik özellik listesi (birim değere gömülür) — sözleşme eksik
// değil bütün özellikleri basar.
const contractSpecs = (product?: Product): { key: string; value: string }[] => {
  if (!product) return [];
  return specsForProductTypeStrict(product.productTypeCode, (product.specs ?? []) as ProductSpec[])
    .map((s) => {
      const unit = (s.unit ?? s.specUnit ?? "").trim();
      const value = (s.value ?? "").trim();
      return { key: s.key, value: unit && value && value !== "-" ? `${value} ${unit}` : value };
    })
    .filter((s) => s.key.trim());
};

export type ContractBuildInput = {
  customer: Customer | null;
  salesCase: SalesCase;
  offer?: Offer | null;
  products: Product[];
  payments: Payment[];
  contractDate: string;
};

const asNumber = (value: unknown): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

export async function loadContractPrintData(input: ContractBuildInput): Promise<ContractPrintData> {
  const { customer, salesCase, offer, products, payments, contractDate } = input;
  if (!offer) throw new Error("Sözleşme için ilişkili teklif bulunamadı.");
  const quote = await quoteService.get(offer.id);
  const quoteItems = (quote?.items ?? []).filter((item: { description?: string | null }) =>
    String(item.description ?? "").trim(),
  );
  const primaryItems = quoteItems.filter((item: { description?: string | null }) =>
    !String(item.description ?? "").trimStart().startsWith("↳ Opsiyon:"),
  );
  const mainItem = primaryItems[0];
  const selectedOptions = quoteItems
    .map((item: { description?: string | null }) => String(item.description ?? "").trim())
    .filter((description: string) => description.startsWith("↳ Opsiyon:"))
    .map((description: string) => description.replace(/^↳\s*Opsiyon:\s*/, ""));
  const product = products.find((item) => item.id === mainItem?.productModelId) ?? products.find(
    (item) => item.model && salesCase.requestedModel &&
      (salesCase.requestedModel.includes(item.model) || item.model.includes(salesCase.requestedModel)),
  );
  const model = primaryItems.length
    ? primaryItems.map((item: { description?: string | null }) => String(item.description ?? "").trim()).join(" / ")
    : product?.shortDescription || [salesCase.requestedProduct, salesCase.requestedModel].filter(Boolean).join(" ");
  const quantity = primaryItems.length
    ? primaryItems.reduce((sum: number, item: { quantity?: unknown }) => sum + asNumber(item.quantity), 0)
    : salesCase.quantity || 1;
  const subtotal = asNumber(quote?.subtotal ?? offer?.subtotal ?? salesCase.estimatedAmount);
  const vatRates = quoteItems.map((item: { vatRate?: unknown }) => asNumber(item.vatRate));
  const vatRate = vatRates.length && vatRates.every((rate: number) => rate === vatRates[0]) ? vatRates[0] : 0;
  const expectedPayments = payments
    .filter((payment) => payment.paymentType === "expected" && payment.salesCaseId === salesCase.id)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  const terms = quote?.terms ?? {};
  const address = customer ? [customer.address, customer.district, customer.city].filter(Boolean).join(" ") : "";
  // Ürünün muadil (eşdeğer) ürünleri — sözleşmede ayrı madde olarak listelenir.
  const muadiller = (product?.muadilProductIds ?? [])
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p))
    .map((p) => [p.brand, p.model].filter(Boolean).join(" ") || p.shortDescription)
    .filter(Boolean);

  return {
    alici: {
      unvan: customer?.name ?? "",
      yetkili: customer?.contactPerson,
      adres: address,
      vergiDairesi: customer?.taxOffice,
      vergiNo: customer?.taxNumber,
      tel: customer?.phone,
      faks: customer?.fax,
    },
    sozlesmeTarihi: contractDate,
    model,
    adet: quantity,
    ozellikler: contractSpecs(product),
    aksesuarlar: [...(product?.standardEquipment ?? []), ...selectedOptions],
    muadiller,
    fiyat: subtotal,
    currency: offer?.currency ?? salesCase.currency,
    teslimSekli: terms.deliveryTermsText ?? quote?.deliveryTerms ?? undefined,
    teslimKosullari: terms.deliveryTermsText ?? quote?.deliveryTerms ?? undefined,
    odemeKosullari: terms.paymentTermsText ?? quote?.paymentTerms ?? undefined,
    garantiKosullari: terms.warrantyTermsText ?? quote?.warrantyTerms ?? undefined,
    notlar: quote?.notes ?? offer?.note ?? undefined,
    kdvOran: vatRate,
    odemePlani: expectedPayments.map((payment) => ({
      label: payment.note?.trim() || `Vade ${trShortDate(payment.dueDate)}`,
      tutar: payment.amount,
      senet: /senet/i.test(payment.note ?? ""),
    })),
  };
}
