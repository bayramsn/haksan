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
  contractNo: string;
  documentSnapshot?: Record<string, any>;
};

const asNumber = (value: unknown): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const asOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const contractNetPrice = (quote: any, fallback = 0): number => {
  // API `subtotal` alanını satır ve başlık iskontoları düşülmüş, KDV hariç net
  // bedel olarak hesaplar; burada yeniden iskonto uygulamak tutarı iki kez azaltır.
  return Math.max(0, asNumber(quote?.subtotal ?? fallback));
};

const inferDeliveryBasis = (deliveryTerms: unknown): string | undefined => {
  const value = String(deliveryTerms ?? "");
  if (/millileştiril|millilestiril/i.test(value)) return "Millileştirilmiş";
  if (/c\.?\s*i\.?\s*f|cif|cİf/i.test(value)) return "C.I.F./İstanbul";
  if (/f\.?\s*o\.?\s*b/i.test(value)) return "F.O.B.";
  if (/ihracat.*adrese|dap/i.test(value)) return "İhracat Adrese Teslim";
  if (/işletme teslim|isletme teslim|ex\s*works/i.test(value)) return "İşletme Teslim";
  if (/gümrük|gumruk/i.test(value)) return "Gümrük";
  return undefined;
};

const inferredDeliveryMonth = (
  contractDate: string,
  minimumDays: unknown,
  maximumDays: unknown,
): string | undefined => {
  const days = asOptionalNumber(maximumDays) ?? asOptionalNumber(minimumDays);
  if (days === undefined) return undefined;
  const parsed = new Date(contractDate);
  if (Number.isNaN(parsed.getTime())) return undefined;
  parsed.setDate(parsed.getDate() + days);
  const month = parsed.toLocaleString("tr-TR", { month: "long" }).toLocaleUpperCase("tr-TR");
  return `${parsed.getFullYear()} ${month}`;
};

const inferControlUnitBrand = (
  specs: { key: string; value: string }[],
  warrantyTerms: unknown,
): string | undefined => {
  const controlSpec = specs.find((spec) => /(?:cnc|kontrol)\s*(?:ünite|unite)|kontrol sistemi/i.test(spec.key));
  const source = `${controlSpec?.value ?? ""} ${String(warrantyTerms ?? "")}`;
  return source.match(/MITSUBISHI|FANUC|SIEMENS|HEIDENHAIN|SYNTEC/i)?.[0]?.toUpperCase();
};

export async function loadContractPrintData(input: ContractBuildInput): Promise<ContractPrintData> {
  const { customer, salesCase, offer, products, payments, contractDate, contractNo, documentSnapshot } = input;
  if (documentSnapshot) {
    const value = (record: any, ...keys: string[]) => {
      for (const key of keys) if (record?.[key] !== undefined && record?.[key] !== null) return record[key];
      return undefined;
    };
    const quote = documentSnapshot.quote ?? {};
    const company = documentSnapshot.company ?? {};
    const contact = documentSnapshot.contact ?? {};
    const address = (documentSnapshot.companyAddresses ?? [])[0] ?? {};
    const phones = Array.isArray(documentSnapshot.companyPhones) ? documentSnapshot.companyPhones : [];
    const items = Array.isArray(documentSnapshot.items) ? documentSnapshot.items : [];
    const primaryItems = items.filter((item: any) => !String(value(item, "description") ?? "").trimStart().startsWith("↳ Opsiyon:"));
    const mainItem = primaryItems[0] ?? {};
    const product = products.find((item) => item.id === value(mainItem, "productModelId", "product_model_id"));
    const technicalSpecs = (value(mainItem, "compatibility") as { technicalSpecs?: any[] } | undefined)?.technicalSpecs ?? [];
    const terms = documentSnapshot.terms ?? {};
    const currency = String(value(documentSnapshot.currency, "code") ?? "USD") as ContractPrintData["currency"];
    const fullAddress = String(value(address, "fullAddress", "full_address") ?? [
      value(address, "street"), value(address, "buildingNumber", "building_number"), value(address, "district"), value(address, "province"), value(address, "country"),
    ].filter(Boolean).join(" "));
    const receivables = Array.isArray(documentSnapshot.receivables) ? documentSnapshot.receivables : [];
    const snapshotSpecs = technicalSpecs.map((spec: any) => ({
      key: String(value(spec, "key", "specKey", "spec_key") ?? ""),
      value: [value(spec, "value", "specValue", "spec_value"), value(spec, "unit", "specUnit", "spec_unit")].filter(Boolean).join(" "),
    })).filter((spec: { key: string }) => spec.key);
    const mappedSpecs = snapshotSpecs.length ? snapshotSpecs : contractSpecs(product);
    const deliveryTerms = value(terms, "deliveryTermsText", "delivery_terms_text") ?? value(quote, "deliveryTerms", "delivery_terms");
    const warrantyTerms = value(terms, "warrantyTermsText", "warranty_terms_text") ?? value(quote, "warrantyTerms", "warranty_terms");
    const companyPhone = phones.find((phone: any) => !/fax/i.test(String(value(phone, "phoneType", "phone_type") ?? ""))) ?? phones[0];
    const companyFax = phones.find((phone: any) => /fax/i.test(String(value(phone, "phoneType", "phone_type") ?? "")));
    return {
      alici: {
        unvan: String(value(company, "legalTitle", "legal_title", "shortName", "short_name") ?? ""),
        yetkili: value(contact, "fullName", "full_name"),
        adres: fullAddress,
        vergiDairesi: value(company, "taxOffice", "tax_office"),
        vergiNo: value(company, "taxNumber", "tax_number"),
        tel: value(contact, "workPhone", "work_phone", "mobilePhone", "mobile_phone") ?? value(companyPhone, "phone"),
        faks: value(companyFax, "phone"),
      },
      sozlesmeNo: contractNo,
      sozlesmeTarihi: contractDate,
      model: primaryItems.map((item: any) => String(value(item, "description") ?? "").trim()).filter(Boolean).join(" / "),
      adet: primaryItems.reduce((sum: number, item: any) => sum + asNumber(value(item, "quantity")), 0) || 1,
      ozellikler: mappedSpecs,
      aksesuarlar: [
        ...(product?.standardEquipment ?? []),
        ...items.map((item: any) => String(value(item, "description") ?? "").trim())
          .filter((description: string) => description.startsWith("↳ Opsiyon:"))
          .map((description: string) => description.replace(/^↳\s*Opsiyon:\s*/, "")),
      ],
      muadiller: [],
      fiyat: contractNetPrice(quote),
      currency,
      teslimAyi: inferredDeliveryMonth(
        contractDate,
        value(terms, "estimatedDeliveryDaysMin", "estimated_delivery_days_min"),
        value(terms, "estimatedDeliveryDaysMax", "estimated_delivery_days_max"),
      ),
      teslimSekli: inferDeliveryBasis(deliveryTerms),
      teslimYeri: value(terms, "deliveryLocation", "delivery_location"),
      teslimKosullari: deliveryTerms,
      odemeKosullari: value(terms, "paymentTermsText", "payment_terms_text") ?? value(quote, "paymentTerms", "payment_terms"),
      garantiKosullari: warrantyTerms,
      ithalatMasraflariDahil: value(terms, "importCostsExcluded", "import_costs_excluded") === undefined
        ? undefined
        : !Boolean(value(terms, "importCostsExcluded", "import_costs_excluded")),
      notlar: value(quote, "notes"),
      kdvOran: (() => {
        const rates = items.map((item: any) => asNumber(value(item, "vatRate", "vat_rate")));
        return rates.length && rates.every((rate: number) => rate === rates[0]) ? rates[0] : 0;
      })(),
      odemePlani: receivables.map((receivable: any) => ({
        label: String(value(receivable, "notes") ?? `Vade ${trShortDate(value(receivable, "dueDate", "due_date"))}`),
        tutar: asNumber(value(receivable, "amount")),
        senet: /senet/i.test(String(value(receivable, "notes") ?? "")),
      })),
      kontrolUnitesiMarka: inferControlUnitBrand(mappedSpecs, warrantyTerms),
    };
  }
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
  const deliveryTerms = terms.deliveryTermsText ?? quote?.deliveryTerms ?? undefined;
  const warrantyTerms = terms.warrantyTermsText ?? quote?.warrantyTerms ?? undefined;
  const address = customer ? [customer.address, customer.district, customer.city].filter(Boolean).join(" ") : "";
  // Ürünün muadil (eşdeğer) ürünleri — sözleşmede ayrı madde olarak listelenir.
  const muadiller = (product?.muadilProductIds ?? [])
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p))
    .map((p) => [p.brand, p.model].filter(Boolean).join(" ") || p.shortDescription)
    .filter(Boolean);

  const specs = contractSpecs(product);
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
    sozlesmeNo: contractNo,
    sozlesmeTarihi: contractDate,
    model,
    adet: quantity,
    ozellikler: specs,
    aksesuarlar: [...(product?.standardEquipment ?? []), ...selectedOptions],
    muadiller,
    fiyat: contractNetPrice(quote, subtotal),
    currency: offer?.currency ?? salesCase.currency,
    teslimAyi: inferredDeliveryMonth(contractDate, terms.estimatedDeliveryDaysMin, terms.estimatedDeliveryDaysMax),
    teslimSekli: inferDeliveryBasis(deliveryTerms),
    teslimYeri: terms.deliveryLocation ?? undefined,
    teslimKosullari: deliveryTerms,
    odemeKosullari: terms.paymentTermsText ?? quote?.paymentTerms ?? undefined,
    garantiKosullari: warrantyTerms,
    ithalatMasraflariDahil: terms.importCostsExcluded === undefined ? undefined : !Boolean(terms.importCostsExcluded),
    notlar: quote?.notes ?? offer?.note ?? undefined,
    kdvOran: vatRate,
    odemePlani: expectedPayments.map((payment) => ({
      label: payment.note?.trim() || `Vade ${trShortDate(payment.dueDate)}`,
      tutar: payment.amount,
      senet: /senet/i.test(payment.note ?? ""),
    })),
    kontrolUnitesiMarka: inferControlUnitBrand(specs, warrantyTerms),
  };
}
