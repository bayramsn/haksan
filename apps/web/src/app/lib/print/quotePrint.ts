import type { Contact, Customer, Offer, Product, SalesCase, User, ProductSpec } from "../mock";
import { isMachiningCenterTypeCode } from "@haksan/shared";
import { quoteService } from "../../../lib/services";
import { specsForProductTypeStrict } from "../productSpecTemplates";
import { publicProductLabel, trShortDate } from "./core";
import { applyVatRateToNotes } from "./notes";
import { printSignatureFromDocumentSnapshot } from "./signature";
import { printableTechnicalSpecs } from "./technicalSpecs";
import type { QuoteHeaderLogoMode, QuotePrintData } from "./templates";

// Seçilen tezgahın TAM teknik özellik listesi (tip şablonu + üründe girilen
// değerler), teklifte kalem bazında girilen (customSpecs) değerlerle üzerine
// yazılır. Böylece teklif PDF'i eksik değil tam özellik tablosu basar.
const fullProductSpecs = (
  product: Product | undefined,
  customSpecs: Array<{ key: string; value: string; unit?: string; specUnit?: string; groupCode?: string; groupName?: string }>,
): QuotePrintData["specs"] => {
  const base = product ? specsForProductTypeStrict(product.productTypeCode, (product.specs ?? []) as ProductSpec[]) : [];
  if (!base.length) return printableTechnicalSpecs(customSpecs.length ? customSpecs : product?.specs);
  const overrides = new Map(customSpecs.map((s) => [s.key.trim().toLocaleLowerCase("tr-TR"), s]));
  return printableTechnicalSpecs(base.map((s) => {
    const ov = overrides.get(s.key.trim().toLocaleLowerCase("tr-TR"));
    return ov && ov.value.trim() ? { ...s, value: ov.value } : s;
  }));
};

type QuoteDetail = Awaited<ReturnType<typeof quoteService.get>>;

export type QuoteBuildInput = {
  offer: Offer;
  customer: Customer | null;
  salesCase: SalesCase | null;
  users: User[];
  contacts: Contact[];
  products: Product[];
  headerLogoMode?: QuoteHeaderLogoMode;
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

/**
 * Saklanan gümrük toplamını belge satırlarına dağıtır. CRM fiyatlarını değiştirmez;
 * yalnızca PDF için üretilen birim fiyat ve tutarlara eklenecek payları döndürür.
 */
export const allocateCustomsTotal = <T,>(
  rows: T[],
  customsTotal: number,
  isEligible: (row: T) => boolean,
  grossOf: (row: T) => number,
): number[] => {
  const allocations = rows.map(() => 0);
  const total = Number.isFinite(customsTotal) ? Math.max(0, customsTotal) : 0;
  if (total <= 0) return allocations;

  const eligibleIndexes = rows
    .map((row, index) => (isEligible(row) ? index : -1))
    .filter((index) => index >= 0);
  if (!eligibleIndexes.length) return allocations;

  const grossTotal = eligibleIndexes.reduce(
    (sum, index) => sum + Math.max(0, grossOf(rows[index])),
    0,
  );
  let distributed = 0;
  eligibleIndexes.forEach((index, eligibleIndex) => {
    const isLast = eligibleIndex === eligibleIndexes.length - 1;
    const weight = grossTotal > 0
      ? Math.max(0, grossOf(rows[index])) / grossTotal
      : 1 / eligibleIndexes.length;
    const allocation = isLast
      ? total - distributed
      : Math.round(total * weight * 10_000) / 10_000;
    allocations[index] = allocation;
    distributed += allocation;
  });
  return allocations;
};

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
    .filter((spec) => printableTechnicalSpecs([spec]).length > 0);
};

const quoteItemLineGroupKey = (item?: { compatibility?: unknown } | null): string => {
  const value = (item?.compatibility as { lineGroupKey?: unknown } | null | undefined)?.lineGroupKey;
  return typeof value === "string" ? value.trim() : "";
};

const normalizedLabel = (value?: string | null): string =>
  String(value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");

const quoteMachineModel = (
  product: Product | undefined,
  itemStockCode?: string | null,
): string | undefined => {
  const model = product?.model?.trim() || "";
  const stockCode = String(itemStockCode ?? product?.stockCode ?? "").trim();
  if (model && (!stockCode || normalizedLabel(model) !== normalizedLabel(stockCode))) return model;

  const brand = product?.brand?.trim() || "";
  const type = product?.type?.trim() || "";
  for (const source of [product?.modelName, product?.shortDescription]) {
    let label = source?.trim() || "";
    if (!label) continue;
    if (brand && normalizedLabel(label).startsWith(`${normalizedLabel(brand)} `)) {
      label = label.slice(brand.length).trim();
    }
    if (type && normalizedLabel(label).endsWith(normalizedLabel(type))) {
      label = label.slice(0, Math.max(0, label.length - type.length)).trim();
    }
    if (label && normalizedLabel(label) !== normalizedLabel(stockCode)) return label;
  }

  // Model alanı stok kodu olarak kullanılmış eski ürünlerde iç kodu teklife
  // taşımaktansa model satırını boş bırakmak daha güvenlidir.
  return undefined;
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
      specs: fullProductSpecs(catalogProduct, quoteItemTechnicalSpecs(item as { compatibility?: unknown })),
      standartDonanim: catalogProduct?.standardEquipment ?? [],
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
  const printableAddress = snapshotAddress
    ? String(snapshotAddress.fullAddress ?? [snapshotAddress.street, snapshotAddress.buildingNumber, snapshotAddress.district, snapshotAddress.province, snapshotAddress.country].filter(Boolean).join(" "))
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
    imza: printSignatureFromDocumentSnapshot((quote as any).documentSnapshot),
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

export async function loadQuotePrintData(input: QuoteBuildInput): Promise<QuotePrintData> {
  const quote = await quoteService.get(input.offer.id);
  const data = buildQuotePrintData(input, quote);
  const imageUrls = [...new Set([
    data.headerLogo?.imageUrl,
    data.imageUrl,
    data.brandLogoUrl,
    ...(data.machines ?? []).map((machine) => machine.imageUrl),
    ...(data.machines ?? []).map((machine) => machine.brandLogoUrl),
  ].filter((value): value is string => Boolean(value)))];
  if (!imageUrls.length) return data;

  // Yazdırma penceresi blob: URL ile açıldığı için tüm makine görsellerini
  // belge HTML'ine gömeriz. Tek bir görselin başarısız olması diğer ürünlerin
  // kapaklarını veya belgenin tamamını engellemez.
  const embeddedByUrl = new Map<string, string>();
  await Promise.all(imageUrls.map(async (imageUrl) => {
    if (imageUrl.startsWith("data:image/")) {
      embeddedByUrl.set(imageUrl, imageUrl);
      return;
    }
    try {
      const response = await fetch(imageUrl, { credentials: "include" });
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/") || blob.size > 10 * 1024 * 1024) return;
      const embedded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(reader.error ?? new Error("Ürün görseli okunamadı"));
        reader.readAsDataURL(blob);
      });
      if (embedded) embeddedByUrl.set(imageUrl, embedded);
    } catch {
      // Harici sunucu CORS izni vermiyorsa özgün URL ile devam edilir.
    }
  }));
  const imageUrl = data.imageUrl ? embeddedByUrl.get(data.imageUrl) ?? data.imageUrl : undefined;
  const brandLogoUrl = data.brandLogoUrl
    ? embeddedByUrl.get(data.brandLogoUrl) ?? data.brandLogoUrl
    : undefined;
  const headerLogo = data.headerLogo?.imageUrl
    ? { ...data.headerLogo, imageUrl: embeddedByUrl.get(data.headerLogo.imageUrl) ?? data.headerLogo.imageUrl }
    : data.headerLogo;
  const machines = data.machines?.map((machine) => ({
    ...machine,
    imageUrl: machine.imageUrl ? embeddedByUrl.get(machine.imageUrl) ?? machine.imageUrl : undefined,
    brandLogoUrl: machine.brandLogoUrl
      ? embeddedByUrl.get(machine.brandLogoUrl) ?? machine.brandLogoUrl
      : undefined,
  }));
  return { ...data, headerLogo, imageUrl, brandLogoUrl, machines };
}
