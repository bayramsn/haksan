import type { Contact, Customer, Offer, Product, SalesCase, User } from "../types";
import { isMachiningCenterTypeCode } from "../../index";
import { publicProductLabel, trShortDate } from "./core";
import { snapshotAddressLine } from "./core";
import { applyVatRateToNotes } from "./notes";
import { printSignatureFromDocumentSnapshot } from "./signatureData";
import { fullProductSpecs, printableTechnicalSpecs, quoteMachineModel, snapshotStandardEquipment } from "./technicalSpecs";
import { laserSnapshotPrintSpecs } from "../laserProductSnapshot";
import type { LaserTechnicalConfiguration } from "../../index";
import type { QuoteHeaderLogoMode, QuotePrintData } from "./templates";

export type QuoteDetail = Record<string, any>;

export type QuoteBuildInput = {
  offer: Pick<Offer, "id" | "currency" | "date" | "quoteNo" | "vatTotal" | "note">;
  customer: Pick<Customer, "name" | "contactPerson" | "phone" | "phone2" | "fax" | "email" | "address" | "city" | "district" | "country" | "addresses" | "logoUrl"> | null;
  salesCase: Pick<SalesCase, "requestedModel" | "requestedProduct"> | null;
  users: Pick<User, "id" | "name" | "email" | "phone" | "title" | "department">[];
  contacts: Pick<Contact, "id" | "name" | "phone" | "mobilePhone" | "email">[];
  products: Product[];
  headerLogoMode?: QuoteHeaderLogoMode;
  resolveMediaUrl?: (url: string) => string;
};

const enteredLines = (value?: string | null): string[] =>
  String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const findProduct = (
  products: Product[],
  quote: QuoteDetail,
  salesCase: QuoteBuildInput["salesCase"],
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

export { allocateCustomsTotal } from "./customsAllocation";
import { allocateCustomsTotal } from "./customsAllocation";

const quoteItemTechnicalSpecs = (item?: { compatibility?: unknown } | null): Array<{ key: string; value: string; unit?: string; specUnit?: string; groupCode?: string; groupName?: string; group?: string }> => {
  const specs = (item?.compatibility as { technicalSpecs?: unknown } | null | undefined)?.technicalSpecs;
  if (!Array.isArray(specs)) return [];
  return specs
    .map((spec) => ({
      key: String((spec as { key?: unknown }).key ?? "").trim(),
      value: String((spec as { value?: unknown }).value ?? "").trim(),
      unit: String((spec as { unit?: unknown; specUnit?: unknown }).unit ?? (spec as { specUnit?: unknown }).specUnit ?? "").trim() || undefined,
      specUnit: String((spec as { unit?: unknown; specUnit?: unknown }).unit ?? (spec as { specUnit?: unknown }).specUnit ?? "").trim() || undefined,
      groupCode: String((spec as { groupCode?: unknown }).groupCode ?? "").trim() || undefined,
      groupName: String((spec as { groupName?: unknown }).groupName ?? "").trim() || undefined,
      group: String((spec as { group?: unknown; groupName?: unknown; groupCode?: unknown }).group ?? (spec as { groupName?: unknown }).groupName ?? (spec as { groupCode?: unknown }).groupCode ?? "").trim() || undefined,
    }))
    .filter((spec) => Boolean(spec.key));
};

const quoteItemLineGroupKey = (item?: { compatibility?: unknown } | null): string => {
  const value = (item?.compatibility as { lineGroupKey?: unknown } | null | undefined)?.lineGroupKey;
  return typeof value === "string" ? value.trim() : "";
};

export function buildQuotePrintData(input: QuoteBuildInput, quote: QuoteDetail): QuotePrintData {
  const { offer, customer, salesCase, users, contacts, products, headerLogoMode = "haksan" } = input;
  const contact = contacts.find((item) => item.id === quote.contactId);
  // Teklif sahibi API'den güncel ünvanıyla gelir. Böylece yönetim ekranında
  // yapılan değişiklikten sonra açık kalmış global kullanıcı listesi PDF'e eski
  // departman adını taşımaz. Eski API/snapshot kayıtlarında store yedektir.
  const serverOwner = quote.projectOwner ?? (quote as any).documentSnapshot?.projectOwner;
  const owner = serverOwner?.id
    ? {
        id: String(serverOwner.id),
        name: String(serverOwner.name ?? ""),
        email: String(serverOwner.email ?? ""),
        phone: serverOwner.phone ? String(serverOwner.phone) : undefined,
        title: serverOwner.title ? String(serverOwner.title) : undefined,
        department: serverOwner.department ? String(serverOwner.department) : undefined,
      }
    : users.find((item) => item.id === quote.projectOwnerUserId);
  const product = findProduct(products, quote, salesCase);
  const quoteItems = (quote.items ?? []).filter((item: { description?: string | null }) =>
    String(item.description ?? "").trim(),
  );
  const vatRates = quoteItems.map((item: { vatRate?: unknown }) => numeric(item.vatRate));
  const commonVatRate = vatRates.length > 0 && vatRates.every((rate: number) => rate === vatRates[0])
    ? vatRates[0]
    : 0;
  const terms = quote.terms ?? {};
  type PrintableQuoteItem = (typeof quoteItems)[number];
  type GroupedItem = { item: PrintableQuoteItem; index: number; lineGroupKey: string; isOption: boolean };
  let currentLineGroupKey = "";
  const groupedItems: GroupedItem[] = quoteItems.map((item: PrintableQuoteItem, index: number) => {
    const enteredDescription = String(item.description ?? "").trim();
    const isOption = enteredDescription.startsWith("↳ Opsiyon:");
    const storedLineGroupKey = quoteItemLineGroupKey(item as { compatibility?: unknown });
    if (!isOption) currentLineGroupKey = storedLineGroupKey || `legacy-line-${index + 1}`;
    return {
      item,
      index,
      lineGroupKey: storedLineGroupKey || currentLineGroupKey || `legacy-line-${index + 1}`,
      isOption,
    };
  });
  const primaryRows = groupedItems.filter(({ item, isOption }) => {
    if (isOption || !item.productModelId) return false;
    return products.find((candidate) => candidate.id === item.productModelId)?.categoryCode !== "ISCILIK";
  });
  const termsVatRate = numeric(primaryRows[0]?.item.vatRate) || commonVatRate;
  const machineRows = primaryRows.some(({ item }) =>
    products.find((candidate) => candidate.id === item.productModelId)?.categoryCode === "TEZGAH")
    ? primaryRows.filter(({ item }) =>
        products.find((candidate) => candidate.id === item.productModelId)?.categoryCode === "TEZGAH")
    : primaryRows;
  const machines: NonNullable<QuotePrintData["machines"]> = machineRows.map(({ item, lineGroupKey }) => {
    const catalogProduct = products.find((candidate) => candidate.id === item.productModelId);
    const savedConfiguration = (item.compatibility as { technicalConfiguration?: LaserTechnicalConfiguration | null } | null)?.technicalConfiguration;
    const savedSpecs = quoteItemTechnicalSpecs(item as { compatibility?: unknown });
    const selectedOptions = groupedItems
      .filter((grouped) => grouped.isOption && grouped.lineGroupKey === lineGroupKey)
      .map((grouped) => String(grouped.item.description ?? "").trim().replace(/^↳\s*Opsiyon:\s*/, ""))
      .filter(Boolean);
    return {
      lineGroupKey,
      urun: publicProductLabel({
        catalogName: catalogProduct?.shortDescription,
        description: item.description,
        stockCode: item.stockCode ?? catalogProduct?.stockCode,
      }),
      marka: catalogProduct?.brand,
      brandLogoUrl: catalogProduct?.brandLogoUrl,
      model: quoteMachineModel(catalogProduct, item.stockCode),
      tip: catalogProduct?.type,
      imageUrl: catalogProduct?.imageUrl || undefined,
      specs: savedConfiguration
        ? printableTechnicalSpecs(laserSnapshotPrintSpecs(savedConfiguration, savedSpecs))
        : fullProductSpecs(catalogProduct, savedSpecs),
      standartDonanim: snapshotStandardEquipment(savedSpecs) ?? catalogProduct?.standardEquipment ?? [],
      opsiyonelDonanim: selectedOptions.length ? selectedOptions : (catalogProduct?.optionalEquipment ?? []),
    };
  });
  const firstMachine = machines[0];
  const lineDiscountTotal = quoteItems.reduce(
    (sum: number, item: { discountAmount?: unknown }) => sum + numeric(item.discountAmount),
    0,
  );
  const headerDiscount = Math.max(numeric(quote.discountTotal) - lineDiscountTotal, 0);
  const customsAllocations = allocateCustomsTotal(
    quoteItems,
    numeric(quote.customsTotal),
    (item) => {
      if (!(item as { nationalized?: boolean | null }).nationalized) return false;
      const product = (item as { productModelId?: string | null }).productModelId
        ? products.find((candidate) => candidate.id === (item as { productModelId?: string | null }).productModelId)
        : undefined;
      return !product?.productTypeCode || isMachiningCenterTypeCode(product.productTypeCode);
    },
    (item) => numeric((item as { quantity?: unknown }).quantity) * numeric((item as { unitPrice?: unknown }).unitPrice),
  );
  const snapshotAddress = (quote as any).documentSnapshot?.companyAddresses?.[0];
  const snapshotEmails = Array.isArray((quote as any).documentSnapshot?.companyEmails)
    ? (quote as any).documentSnapshot.companyEmails
    : [];
  const snapshotCompanyEmail = snapshotEmails.find((email: any) =>
    String(email?.emailType ?? email?.email_type ?? "").toLocaleLowerCase("tr-TR") === "main",
  ) ?? snapshotEmails.find((email: any) => Boolean(email?.isDefault ?? email?.is_default)) ?? snapshotEmails[0];
  const snapshotContact = (quote as any).documentSnapshot?.contact;
  const pdfAddress = customer?.addresses?.find((address) => address.id === quote.companyAddressId)
    ?? customer?.addresses?.find((address) => address.isBilling)
    ?? customer?.addresses?.find((address) => address.isDefault)
    ?? customer?.addresses?.[0];
  // Anlık görüntüde fullAddress yalnız sokak; ilçe/il/ülke ayrı alanlardan eklenir.
  const printableAddress = snapshotAddress
    ? snapshotAddressLine(snapshotAddress)
    : pdfAddress
    ? [pdfAddress.address, pdfAddress.district, pdfAddress.city, pdfAddress.country].filter(Boolean).join(" ")
    : customer ? [customer.address, customer.district, customer.city, customer.country].filter(Boolean).join(" ") : "";

  return {
    firma: customer?.name ?? "",
    ilgili: contact?.name || customer?.contactPerson,
    mobil: contact?.mobilePhone || customer?.phone2,
    adres: printableAddress,
    tel: contact?.phone || customer?.phone,
    faks: customer?.fax,
    email: snapshotCompanyEmail?.email
      || customer?.email
      || snapshotContact?.workEmail
      || snapshotContact?.work_email
      || snapshotContact?.email
      || contact?.email,
    tarih: trShortDate(quote.quoteDate || offer.date),
    belgeNo: quote.documentNo || offer.quoteNo,
    gecerlilik: quote.validityDays ? `${quote.validityDays} İş Günü` : "",
    // İmza seçilmişse imza satırı ondan basılır; seçilmemiş tekliflerde eski
    // davranış korunur ve satır proje ilgilisine düşer (yalnız görsel çıkmaz).
    imza: printSignatureFromDocumentSnapshot((quote as any).documentSnapshot, input.resolveMediaUrl),
    projeIlgilisi: owner?.name,
    // Ünvan atanmışsa o yazar; atanmamışsa eski davranışla departman adına düşer.
    projeIlgilisiUnvan: owner?.title || owner?.department,
    projeIlgilisiTelefon: owner?.phone || undefined,
    projeIlgilisiEmail: owner?.email,
    marka: firstMachine?.marka ?? product?.brand,
    brandLogoUrl: firstMachine?.brandLogoUrl ?? product?.brandLogoUrl,
    model: firstMachine?.model ?? product?.model ?? salesCase?.requestedModel,
    tip: firstMachine?.tip ?? product?.type ?? salesCase?.requestedProduct,
    imageUrl: firstMachine?.imageUrl ?? product?.imageUrl ?? undefined,
    specs: firstMachine?.specs ?? fullProductSpecs(product, []),
    standartDonanim: firstMachine?.standartDonanim ?? product?.standardEquipment ?? [],
    opsiyonelDonanim: firstMachine?.opsiyonelDonanim ?? product?.optionalEquipment ?? [],
    machines,
    headerLogo: {
      mode: headerLogoMode,
      imageUrl: headerLogoMode === "company" ? customer?.logoUrl : undefined,
      alt: headerLogoMode === "company" ? `${customer?.name ?? "Firma"} logosu` : undefined,
    },
    items: quoteItems.map((item: {
      productModelId?: string | null;
      description?: string | null;
      quantity?: unknown;
      unitCode?: string | null;
      unitPrice?: unknown;
      lineTotal?: unknown;
      discountAmount?: unknown;
      nationalized?: boolean | null;
    }, index: number) => {
      const quantity = numeric(item.quantity) || 1;
      const unitPrice = numeric(item.unitPrice);
      const customsAllocation = customsAllocations[index] ?? 0;
      const catalogProduct = item.productModelId
        ? products.find((candidate) => candidate.id === item.productModelId)
        : undefined;
      const enteredDescription = String(item.description ?? "").trim();
      const isOption = enteredDescription.startsWith("↳ Opsiyon:");
      const lineTotal = item.lineTotal == null
        ? quantity * unitPrice - numeric(item.discountAmount)
        : numeric(item.lineTotal);
      return {
        urun: isOption
          ? enteredDescription
          : publicProductLabel({
              catalogName: catalogProduct?.shortDescription,
              description: enteredDescription,
              stockCode: (item as { stockCode?: string | null }).stockCode ?? catalogProduct?.stockCode,
            }),
        birim: `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(quantity)} ${item.unitCode || "Adet"}`,
        fiyat: quantity > 0 ? unitPrice + customsAllocation / quantity : unitPrice,
        indirim: numeric(item.discountAmount),
        brutTutar: quantity * unitPrice + customsAllocation,
        tutar: lineTotal + customsAllocation,
      };
    }),
    iskonto: headerDiscount,
    kdvOran: commonVatRate,
    kdvTutar: numeric(quote.vatAmount ?? offer.vatTotal),
    currency: offer.currency,
    notes: {
      key: "entered",
      label: "Girilen şartlar",
      odeme: applyVatRateToNotes(enteredLines(terms.paymentTermsText ?? quote.paymentTerms), termsVatRate),
      teslimat: applyVatRateToNotes(enteredLines(terms.deliveryTermsText ?? quote.deliveryTerms), termsVatRate),
      garanti: applyVatRateToNotes(enteredLines(terms.warrantyTermsText ?? quote.warrantyTerms), termsVatRate),
    },
    genelNotlar: enteredLines(quote.notes ?? offer.note),
  };
}

