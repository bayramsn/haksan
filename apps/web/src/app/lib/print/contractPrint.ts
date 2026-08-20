import type { Customer, Offer, Payment, Product, SalesCase, ProductSpec, User, OpportunityPaymentMethod } from "../mock";
import { PAYMENT_METHOD_PRINT_LABELS } from "../paymentMethod";
import { isMachiningCenterTypeCode } from "@haksan/shared";
import { quoteService } from "../../../lib/services";
import { specsForProductTypeStrict } from "../productSpecTemplates";
import { publicProductLabel, trShortDate } from "./core";
import { allocateCustomsTotal } from "./quotePrint";
import { printSignatureFromDocumentSnapshot } from "./signature";
import { printableTechnicalSpecs } from "./technicalSpecs";
import { fillNotePlaceholders } from "./notes";
import type { ContractMachinePrintData, ContractPrintData } from "./templates";

// Tezgahın tam teknik özellik listesi (birim değere gömülür) — sözleşme eksik
// değil bütün özellikleri basar.
const contractSpecs = (product?: Product): { key: string; value: string }[] => {
  if (!product) return [];
  return printableTechnicalSpecs(specsForProductTypeStrict(product.productTypeCode, (product.specs ?? []) as ProductSpec[]))
    .map((s) => {
      const unit = (s.unit ?? s.specUnit ?? "").trim();
      const value = (s.value ?? "").trim();
      return { key: s.key, value: specValueWithUnit(value, unit) };
    })
    .filter((s) => s.key.trim());
};

export type ContractBuildInput = {
  customer: Customer | null;
  /**
   * Teklifsiz ("hızlı") sözleşmede satış kartı yoktur. Belge anlık görüntüsü
   * verildiğinde çıktı zaten yalnızca ondan üretilir; kart sadece canlı veriden
   * basılan eski yolda ve "Hazırlayan" satırında kullanılır.
   */
  salesCase: SalesCase | null;
  offer?: Offer | null;
  products: Product[];
  payments: Payment[];
  contractDate: string;
  contractNo: string;
  documentSnapshot?: Record<string, any>;
  /** İmza bloğu altındaki "Hazırlayan" satırı için CRM kullanıcıları. */
  users?: User[];
};

/** İmzaya çıkmadan önce alıcı ve ticari içeriğin gerçekten tamam olduğunu doğrular. */
export const contractReadinessErrors = (data: ContractPrintData): string[] => {
  const missing: string[] = [];
  if (!data.alici.unvan?.trim()) missing.push("firma unvanı");
  if (!data.alici.adres?.trim()) missing.push("firma adresi");
  if (!data.alici.vergiDairesi?.trim()) missing.push("vergi dairesi");
  if (!data.alici.vergiNo?.trim()) missing.push("vergi numarası");
  if (!data.alici.tel?.trim() && !data.alici.mobil?.trim()) missing.push("telefon");
  if (!data.machines?.length) missing.push("sözleşme kalemi");
  if (!Number.isFinite(data.fiyat) || data.fiyat <= 0) missing.push("sözleşme bedeli");
  const serialized = JSON.stringify(data);
  if (/\{\{[^}]+\}\}/.test(serialized)) missing.push("doldurulmamış şablon alanı");
  return missing;
};

export const assertContractReady = (data: ContractPrintData) => {
  const errors = contractReadinessErrors(data);
  if (errors.length) throw new Error(`Sözleşme tamamlanmadan basılamaz: ${errors.join(", ")}.`);
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

/** Vade satırının tahsilat yöntemi — çıktıdaki üçüncü sütun. */
const paymentMethodLabel = (method: unknown): string | undefined => {
  const code = String(method ?? "").trim() as OpportunityPaymentMethod;
  if (!code || code === "undecided") return undefined;
  return PAYMENT_METHOD_PRINT_LABELS[code] || undefined;
};

const contractNetPrice = (quote: any, fallback = 0): number => {
  // Sözleşme editöründe girilen satır fiyatı imzalanacak nihai fiyat tabanıdır;
  // KDV dahil işareti bunu yeniden büyütmez. Millileştirme ayrıca saklanır.
  return Math.max(0, asNumber(quote?.subtotal ?? fallback) + asNumber(quote?.customsTotal ?? quote?.customs_total));
};

const inferDeliveryBasis = (deliveryTerms: unknown): string | undefined => {
  const value = String(deliveryTerms ?? "").toLocaleLowerCase("tr-TR");
  if (/millileştiril|millilestiril/.test(value)) return "Millileştirilmiş";
  if (/c\.?\s*i\.?\s*f|cif/.test(value)) return "C.I.F./İstanbul";
  if (/f\.?\s*o\.?\s*b/.test(value)) return "F.O.B.";
  if (/ihracat.*adrese|dap/.test(value)) return "İhracat Adrese Teslim";
  if (/işletme teslim|isletme teslim|ex\s*works/.test(value)) return "İşletme Teslim";
  if (/gümrük|gumruk/.test(value)) return "Gümrük";
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

const specValueWithUnit = (valueInput: unknown, unitInput: unknown): string => {
  const value = String(valueInput ?? "").trim();
  const unit = String(unitInput ?? "").trim();
  if (!unit || !value || value === "-") return value;
  const compactValue = value.replace(/\s+/g, "").toLocaleLowerCase("tr-TR");
  const compactUnit = unit.replace(/\s+/g, "").toLocaleLowerCase("tr-TR");
  return compactValue.endsWith(compactUnit) ? value : `${value} ${unit}`;
};

/** Türk telefonlarını sözleşmedeki okunur 0 212 / 0 532 biçimine getirir. */
const printablePhone = (input: unknown): string | undefined => {
  const raw = String(input ?? "").trim();
  if (!raw) return undefined;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("5")) digits = `0${digits}`;
  if (digits.length !== 11 || !digits.startsWith("0")) return raw;
  return `${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
};

const completeAddress = (address: any): string => {
  const base = String(recordValue(address, "fullAddress", "full_address") ?? [
    recordValue(address, "street"),
    recordValue(address, "buildingNumber", "building_number"),
  ].filter(Boolean).join(" ")).trim();
  const locality = [
    recordValue(address, "district"),
    recordValue(address, "province", "city"),
    recordValue(address, "country"),
  ].map((part) => String(part ?? "").trim()).filter((part) => part && !/^türkiye$/i.test(part));
  return [base, ...locality.filter((part) => !base.toLocaleLowerCase("tr-TR").includes(part.toLocaleLowerCase("tr-TR")))]
    .filter(Boolean)
    .join(", ");
};

const resolveContractTerms = (
  value: unknown,
  context: Parameters<typeof fillNotePlaceholders>[1],
): string | undefined => {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  return fillNotePlaceholders(text.split(/\r?\n/), context)
    .join("\n")
    // Bilinmeyen/eski bir yer tutucu da müşteriye ham şablon olarak sızmasın.
    .replace(/\{\{[^{}]+\}\}/g, "belirtilmemiş");
};

const recordValue = (record: any, ...keys: string[]) => {
  for (const key of keys) if (record?.[key] !== undefined && record?.[key] !== null) return record[key];
  return undefined;
};

/** Sözleşme şart editörlerindeki yer tutucular için tek, ortak veri yolu. */
export const contractTermsFillContext = (
  quoteOrSnapshot: any,
  products: Product[],
  buyerName?: string,
): Parameters<typeof fillNotePlaceholders>[1] => {
  const source = quoteOrSnapshot ?? {};
  const items = Array.isArray(source.items) ? source.items : [];
  const mainItems = items.filter((item: any) => !String(recordValue(item, "description") ?? "").trimStart().startsWith("↳ Opsiyon:"));
  const product = mainItems
    .map((item: any) => products.find((candidate) => candidate.id === String(recordValue(item, "productModelId", "product_model_id") ?? "")))
    .find(Boolean);
  const specs = mainItems.flatMap((item: any) => {
    const compatibility = recordValue(item, "compatibility") as { technicalSpecs?: any[] } | undefined;
    return Array.isArray(compatibility?.technicalSpecs)
      ? compatibility!.technicalSpecs.map((spec) => ({
          key: String(recordValue(spec, "key", "specKey", "spec_key") ?? ""),
          value: specValueWithUnit(
            recordValue(spec, "value", "specValue", "spec_value"),
            recordValue(spec, "unit", "specUnit", "spec_unit"),
          ),
        }))
      : [];
  });
  const terms = source.terms ?? {};
  return {
    alici: buyerName
      || String(recordValue(source.company, "shortName", "short_name", "legalTitle", "legal_title") ?? "").trim()
      || undefined,
    yil: product?.productionYear
      ?? asOptionalNumber(recordValue(mainItems[0]?.product, "productionYear", "production_year")),
    kdvOrani: asOptionalNumber(recordValue(mainItems[0], "vatRate", "vat_rate")) ?? 20,
      kontrolMarka: inferControlUnitBrand(
        specs.length ? specs : contractSpecs(product),
        `${recordValue(terms, "warrantyTermsText", "warranty_terms_text") ?? recordValue(source.quote, "warrantyTerms", "warranty_terms") ?? ""} ${product?.controlPanel ?? ""}`,
    ),
  };
};

const lineGroupKey = (item: any): string => {
  const compatibility = recordValue(item, "compatibility") as { lineGroupKey?: unknown } | undefined;
  return typeof compatibility?.lineGroupKey === "string" ? compatibility.lineGroupKey.trim() : "";
};

const groupContractItems = (items: any[]) => {
  let currentLineGroupKey = "";
  return items.map((item, index) => {
    const description = String(recordValue(item, "description") ?? "").trim();
    const isOption = description.startsWith("↳ Opsiyon:");
    const storedLineGroupKey = lineGroupKey(item);
    if (!isOption) currentLineGroupKey = storedLineGroupKey || `legacy-line-${index + 1}`;
    return {
      item,
      isOption,
      lineGroupKey: storedLineGroupKey || currentLineGroupKey || `legacy-line-${index + 1}`,
    };
  });
};

const rowNetTotal = (item: any): number => {
  const quantity = asNumber(recordValue(item, "quantity") ?? 1);
  const unitPrice = asNumber(recordValue(item, "unitPrice", "unit_price"));
  const discountAmount = asNumber(recordValue(item, "discountAmount", "discount_amount"));
  return Math.max(0, asNumber(recordValue(item, "lineTotal", "line_total") ?? quantity * unitPrice - discountAmount));
};

const quoteHeaderRatio = (quote: any, items: any[]): number => {
  const lineDiscount = items.reduce(
    (sum, item) => sum + asNumber(recordValue(item, "discountAmount", "discount_amount")),
    0,
  );
  const headerDiscount = Math.max(
    asNumber(recordValue(quote, "discountTotal", "discount_total")) - lineDiscount,
    0,
  );
  const beforeHeader = items.reduce((sum, item) => sum + rowNetTotal(item), 0);
  return beforeHeader > 0 ? Math.max(0, beforeHeader - headerDiscount) / beforeHeader : 1;
};

const productEquivalents = (product: Product | undefined, products: Product[]) =>
  (product?.muadilProductIds ?? [])
    .map((id) => products.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Product => Boolean(candidate))
    .map((candidate) => [candidate.brand, candidate.model].filter(Boolean).join(" ") || candidate.shortDescription)
    .filter(Boolean);

const reconcileMachinePrices = (machines: ContractMachinePrintData[], expectedTotal: number) => {
  if (!machines.length) return machines;
  const actualTotal = machines.reduce((sum, machine) => sum + machine.fiyat, 0);
  const difference = expectedTotal - actualTotal;
  if (Math.abs(difference) <= 0.0001) return machines;
  return machines.map((machine, index) => index === machines.length - 1
    ? { ...machine, fiyat: Math.max(0, machine.fiyat + difference) }
    : machine);
};

const buildContractMachines = (
  items: any[],
  products: Product[],
  quote: any,
  preferLiveProduct = false,
): ContractMachinePrintData[] => {
  const grouped = groupContractItems(items);
  const headerRatio = quoteHeaderRatio(quote, items);
  const customsAllocations = allocateCustomsTotal(
    items,
    asNumber(recordValue(quote, "customsTotal", "customs_total")),
    (item) => {
      if (!Boolean(recordValue(item, "nationalized"))) return false;
      const productModelId = String(recordValue(item, "productModelId", "product_model_id") ?? "");
      const product = products.find((candidate) => candidate.id === productModelId);
      return !product?.productTypeCode || isMachiningCenterTypeCode(product.productTypeCode);
    },
    (item) => asNumber(recordValue(item, "quantity")) * asNumber(recordValue(item, "unitPrice", "unit_price")),
  );
  const customsByItem = new Map(items.map((item, index) => [item, customsAllocations[index] ?? 0]));
  const primaryRows = grouped.filter((row) => !row.isOption);
  const machines = primaryRows.map((row) => {
    const productModelId = String(recordValue(row.item, "productModelId", "product_model_id") ?? "");
    const product = products.find((candidate) => candidate.id === productModelId);
    const compatibility = recordValue(row.item, "compatibility") as { technicalSpecs?: any[] } | undefined;
    const snapshotSpecs = printableTechnicalSpecs((compatibility?.technicalSpecs ?? []).map((spec: any) => ({
      key: String(recordValue(spec, "key", "specKey", "spec_key") ?? ""),
      value: String(recordValue(spec, "value", "specValue", "spec_value") ?? "").trim(),
      unit: String(recordValue(spec, "unit", "specUnit", "spec_unit") ?? "").trim(),
    }))).map((spec) => ({
      key: spec.key,
      value: specValueWithUnit(spec.value, spec.unit),
    }));
    const currentProductSpecs = contractSpecs(product);
    // Taslak belge, ürün kartında düzeltilmiş teknik veriyi izler. Kesinleşmiş
    // belge ise imzalandığı andaki quote snapshot'ını korur.
    const specs = preferLiveProduct && currentProductSpecs.length
      ? currentProductSpecs
      : snapshotSpecs.length ? snapshotSpecs : currentProductSpecs;
    const options = grouped.filter((candidate) => candidate.isOption && candidate.lineGroupKey === row.lineGroupKey);
    const snapshotProduct = recordValue(row.item, "product") as { standardEquipment?: unknown } | undefined;
    const snapshotStandardEquipment = Array.isArray(snapshotProduct?.standardEquipment)
      ? snapshotProduct.standardEquipment.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
    const accessories = [
      ...(preferLiveProduct || snapshotStandardEquipment.length === 0
        ? product?.standardEquipment ?? []
        : snapshotStandardEquipment),
      ...options.map((option) => String(recordValue(option.item, "description") ?? "").trim())
        .filter(Boolean)
        .map((description) => description.replace(/^↳\s*Opsiyon:\s*/, "")),
    ];
    const priceBeforeHeader = rowNetTotal(row.item) + options.reduce((sum, option) => sum + rowNetTotal(option.item), 0);
    const customsForMachine = (customsByItem.get(row.item) ?? 0)
      + options.reduce((sum, option) => sum + (customsByItem.get(option.item) ?? 0), 0);
    const warrantyTerms = recordValue(quote, "warrantyTerms", "warranty_terms");
    return {
      model: publicProductLabel({
        catalogName: product?.shortDescription,
        description: recordValue(row.item, "description"),
        stockCode: recordValue(row.item, "stockCode", "stock_code") ?? product?.stockCode,
      }),
      adet: asNumber(recordValue(row.item, "quantity")) || 1,
      ozellikler: specs,
      aksesuarlar: accessories,
      muadiller: productEquivalents(product, products),
      fiyat: priceBeforeHeader * headerRatio + customsForMachine,
      kontrolUnitesiMarka: inferControlUnitBrand(specs, `${String(warrantyTerms ?? "")} ${product?.controlPanel ?? ""}`),
      productionYear: product?.productionYear ?? asOptionalNumber(recordValue(row.item?.product, "productionYear", "production_year")),
    };
  });
  return reconcileMachinePrices(machines, contractNetPrice(quote));
};

/**
 * Kartın canlı beklenen tahsilatları, sözleşmenin ödeme planı tablosuna çevrilir.
 *
 * Süreç sırasında `contract`(6) aşaması `payment_plan`(7)'den ÖNCE gelir: fiyatı
 * pazarlık edilerek kaydedilen taslak sözleşmenin anlık görüntüsü, vade satırı
 * henüz doğmadığı için BOŞ bir planla donuyor. Plan sonradan oluşturulduğunda
 * çıktı "bedelin tamamı şu şekilde tahsil edilecektir;" deyip altına hiçbir satır
 * basmasın diye, dondurulmuş plan boşsa canlı tahsilatlara düşülür.
 */
const expectedPaymentRows = (payments: Payment[], salesCase: SalesCase | null) =>
  payments
    .filter((payment) => payment.paymentType === "expected" && salesCase && payment.salesCaseId === salesCase.id)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .map((payment) => ({
      label: payment.note?.trim() || `Vade ${trShortDate(payment.dueDate)}`,
      tutar: payment.amount,
      senet: /senet/i.test(payment.note ?? ""),
      yontem: paymentMethodLabel(payment.plannedPaymentMethod ?? payment.paymentMethod)
        ?? (/çek/i.test(payment.note ?? "") ? "Çek" : /senet/i.test(payment.note ?? "") ? "Senet" : undefined),
    }));

async function buildContractPrintData(input: ContractBuildInput): Promise<ContractPrintData> {
  const { customer, salesCase, offer, products, payments, contractDate, contractNo, documentSnapshot } = input;
  if (documentSnapshot) {
    const value = recordValue;
    const quote = documentSnapshot.quote ?? {};
    const company = documentSnapshot.company ?? {};
    const contact = documentSnapshot.contact ?? {};
    const address = (documentSnapshot.companyAddresses ?? [])[0] ?? {};
    const phones = Array.isArray(documentSnapshot.companyPhones) ? documentSnapshot.companyPhones : [];
    const emails = Array.isArray(documentSnapshot.companyEmails) ? documentSnapshot.companyEmails : [];
    const items = Array.isArray(documentSnapshot.items) ? documentSnapshot.items : [];
    const finalized = Boolean(value(documentSnapshot.document, "finalizedAt", "finalized_at"));
    const machines = buildContractMachines(items, products, quote, !finalized);
    const mainMachine = machines[0];
    const terms = documentSnapshot.terms ?? {};
    const currency = String(value(documentSnapshot.currency, "code") ?? "USD") as ContractPrintData["currency"];
    const snapshotAddress = completeAddress(address);
    const receivables = Array.isArray(documentSnapshot.receivables) ? documentSnapshot.receivables : [];
    const mappedSpecs = mainMachine?.ozellikler ?? [];
    const deliveryTerms = value(terms, "deliveryTermsText", "delivery_terms_text") ?? value(quote, "deliveryTerms", "delivery_terms");
    const warrantyTerms = value(terms, "warrantyTermsText", "warranty_terms_text") ?? value(quote, "warrantyTerms", "warranty_terms");
    const companyPhone = phones.find((phone: any) => !/fax/i.test(String(value(phone, "phoneType", "phone_type") ?? ""))) ?? phones[0];
    const companyFax = phones.find((phone: any) => /fax/i.test(String(value(phone, "phoneType", "phone_type") ?? "")));
    const companyEmail = emails.find((email: any) =>
      String(value(email, "emailType", "email_type") ?? "").toLocaleLowerCase("tr-TR") === "main",
    ) ?? emails.find((email: any) => Boolean(value(email, "isDefault", "is_default"))) ?? emails[0];
    const mainItem = items.find((item: any) => !String(value(item, "description") ?? "").trimStart().startsWith("↳ Opsiyon:"));
    const vatRate = asNumber(value(mainItem, "vatRate", "vat_rate"));
    const controlBrand = [...new Set(machines.map((machine) => machine.kontrolUnitesiMarka).filter(Boolean))].join(" / ")
      || inferControlUnitBrand(mappedSpecs, warrantyTerms);
    const termsContext = {
      alici: String(((!finalized && customer?.shortName) || value(company, "shortName", "short_name", "legalTitle", "legal_title")) ?? customer?.name ?? "").trim() || undefined,
      yil: mainMachine?.productionYear,
      kdvOrani: vatRate,
      kontrolMarka: controlBrand,
    };
    const liveAddress = customer?.addresses?.find((candidate) => candidate.isBilling)
      ?? customer?.addresses?.find((candidate) => candidate.isDefault)
      ?? customer?.addresses?.[0];
    const liveFullAddress = liveAddress
      ? [liveAddress.address, liveAddress.district, liveAddress.city, liveAddress.country].filter((part) => part && !/^türkiye$/i.test(String(part))).join(", ")
      : customer ? [customer.address, customer.district, customer.city, customer.country].filter((part) => part && !/^türkiye$/i.test(String(part))).join(", ") : "";
    // Taslak sözleşme firma kartındaki düzeltmeleri izler; kesinleşen belge kendi
    // taraf snapshot'ını korur. Boş canlı alanlarda snapshot'a düşülür.
    const preferLiveParty = !finalized && Boolean(customer);
    return {
      alici: {
        unvan: String(preferLiveParty && customer?.name
          ? customer.name
          : value(company, "legalTitle", "legal_title", "shortName", "short_name") ?? ""),
        kisaUnvan: String(preferLiveParty && customer?.shortName
          ? customer.shortName
          : value(company, "shortName", "short_name") ?? "").trim() || undefined,
        yetkili: (preferLiveParty && customer?.contactPerson) || value(contact, "fullName", "full_name"),
        adres: (preferLiveParty && liveFullAddress) || snapshotAddress,
        vergiDairesi: (preferLiveParty && customer?.taxOffice) || value(company, "taxOffice", "tax_office"),
        vergiNo: (preferLiveParty && customer?.taxNumber) || value(company, "taxNumber", "tax_number"),
        tel: printablePhone((preferLiveParty && customer?.phone) || value(companyPhone, "phone") || value(contact, "workPhone", "work_phone")),
        mobil: printablePhone((preferLiveParty && customer?.phone2) || value(contact, "mobilePhone", "mobile_phone")),
        faks: printablePhone((preferLiveParty && customer?.fax) || value(companyFax, "phone")),
        eposta: (preferLiveParty && customer?.email)
          || value(companyEmail, "email")
          || value(contact, "workEmail", "work_email", "email"),
      },
      sozlesmeNo: contractNo,
      sozlesmeTarihi: contractDate,
      model: machines.map((machine) => machine.model).filter(Boolean).join(" / "),
      adet: machines.reduce((sum, machine) => sum + machine.adet, 0) || 1,
      ozellikler: mappedSpecs,
      aksesuarlar: mainMachine?.aksesuarlar ?? [],
      muadiller: mainMachine?.muadiller ?? [],
      fiyat: contractNetPrice(quote),
      currency,
      teslimAyi: inferredDeliveryMonth(
        contractDate,
        value(terms, "estimatedDeliveryDaysMin", "estimated_delivery_days_min"),
        value(terms, "estimatedDeliveryDaysMax", "estimated_delivery_days_max"),
      ),
      teslimGunMin: asOptionalNumber(value(terms, "estimatedDeliveryDaysMin", "estimated_delivery_days_min")),
      teslimGunMax: asOptionalNumber(value(terms, "estimatedDeliveryDaysMax", "estimated_delivery_days_max")),
      teslimSekli: inferDeliveryBasis(`${String(deliveryTerms ?? "")}\n${String(value(terms, "paymentTermsText", "payment_terms_text") ?? value(quote, "paymentTerms", "payment_terms") ?? "")}`),
      teslimYeri: value(terms, "deliveryLocation", "delivery_location"),
      teslimKosullari: resolveContractTerms(deliveryTerms, termsContext),
      odemeKosullari: resolveContractTerms(
        value(terms, "paymentTermsText", "payment_terms_text") ?? value(quote, "paymentTerms", "payment_terms"),
        termsContext,
      ),
      garantiKosullari: resolveContractTerms(warrantyTerms, termsContext),
      ithalatMasraflariDahil: value(terms, "importCostsExcluded", "import_costs_excluded") === undefined
        ? undefined
        : !Boolean(value(terms, "importCostsExcluded", "import_costs_excluded")),
      kdvDahil: Boolean(value(terms, "vatIncluded", "vat_included")),
      nakliyeSaticiya: Boolean(value(terms, "freightPaidBySeller", "freight_paid_by_seller")),
      notlar: value(quote, "notes"),
      kdvOran: vatRate,
      odemePlani: receivables.length
        ? receivables.map((receivable: any) => ({
            label: String(value(receivable, "notes") ?? `Vade ${trShortDate(value(receivable, "dueDate", "due_date"))}`),
            tutar: asNumber(value(receivable, "amount")),
            senet: /senet/i.test(String(value(receivable, "notes") ?? "")),
            yontem: paymentMethodLabel(value(receivable, "paymentMethod", "payment_method")),
          }))
        : expectedPaymentRows(payments, salesCase),
      kontrolUnitesiMarka: controlBrand,
      machines,
    };
  }
  if (!offer) throw new Error("Sözleşme için ilişkili teklif bulunamadı.");
  const quote = await quoteService.get(offer.id);
  const quoteItems = (quote?.items ?? []).filter((item: { description?: string | null }) =>
    String(item.description ?? "").trim(),
  );
  const machines = buildContractMachines(quoteItems, products, quote, true);
  const mainMachine = machines[0];
  const primaryItems = quoteItems.filter((item: { description?: string | null }) =>
    !String(item.description ?? "").trimStart().startsWith("↳ Opsiyon:"),
  );
  const mainItem = primaryItems[0];
  const product = products.find((item) => item.id === mainItem?.productModelId) ?? products.find(
    (item) => item.model && salesCase?.requestedModel &&
      (salesCase.requestedModel.includes(item.model) || item.model.includes(salesCase.requestedModel)),
  );
  const model = machines.length
    ? machines.map((machine) => machine.model).join(" / ")
    : product?.shortDescription || [salesCase?.requestedProduct, salesCase?.requestedModel].filter(Boolean).join(" ");
  const quantity = machines.length
    ? machines.reduce((sum, machine) => sum + machine.adet, 0)
    : salesCase?.quantity || 1;
  const subtotal = asNumber(quote?.subtotal ?? offer?.subtotal ?? salesCase?.estimatedAmount);
  const vatRate = asNumber(mainItem?.vatRate);
  const terms = quote?.terms ?? {};
  const deliveryTerms = terms.deliveryTermsText ?? quote?.deliveryTerms ?? undefined;
  const warrantyTerms = terms.warrantyTermsText ?? quote?.warrantyTerms ?? undefined;
  const pdfAddress = customer?.addresses?.find((address) => address.id === quote?.companyAddressId)
    ?? customer?.addresses?.find((address) => address.isBilling)
    ?? customer?.addresses?.find((address) => address.isDefault)
    ?? customer?.addresses?.[0];
  const address = pdfAddress
    ? [pdfAddress.address, pdfAddress.district, pdfAddress.city, pdfAddress.country].filter((part) => part && !/^türkiye$/i.test(String(part))).join(", ")
    : customer ? [customer.address, customer.district, customer.city, customer.country].filter((part) => part && !/^türkiye$/i.test(String(part))).join(", ") : "";
  const specs = mainMachine?.ozellikler ?? contractSpecs(product);
  const controlBrand = [...new Set(machines.map((machine) => machine.kontrolUnitesiMarka).filter(Boolean))].join(" / ")
    || inferControlUnitBrand(specs, `${String(warrantyTerms ?? "")} ${product?.controlPanel ?? ""}`);
  const termsContext = {
    alici: customer?.shortName ?? customer?.name,
    yil: mainMachine?.productionYear ?? product?.productionYear,
    kdvOrani: vatRate,
    kontrolMarka: controlBrand,
  };
  return {
    alici: {
      unvan: customer?.name ?? "",
      kisaUnvan: customer?.shortName,
      yetkili: customer?.contactPerson,
      adres: address,
      vergiDairesi: customer?.taxOffice,
      vergiNo: customer?.taxNumber,
      tel: printablePhone(customer?.phone),
      mobil: printablePhone(customer?.phone2),
      faks: printablePhone(customer?.fax),
      eposta: customer?.email,
    },
    sozlesmeNo: contractNo,
    sozlesmeTarihi: contractDate,
    model,
    adet: quantity,
    ozellikler: specs,
    aksesuarlar: mainMachine?.aksesuarlar ?? product?.standardEquipment ?? [],
    muadiller: mainMachine?.muadiller ?? productEquivalents(product, products),
    fiyat: contractNetPrice(quote, subtotal),
    currency: offer?.currency ?? salesCase?.currency ?? "USD",
    teslimAyi: inferredDeliveryMonth(contractDate, terms.estimatedDeliveryDaysMin, terms.estimatedDeliveryDaysMax),
    teslimGunMin: asOptionalNumber(terms.estimatedDeliveryDaysMin),
    teslimGunMax: asOptionalNumber(terms.estimatedDeliveryDaysMax),
    teslimSekli: inferDeliveryBasis(`${String(deliveryTerms ?? "")}\n${String(terms.paymentTermsText ?? quote?.paymentTerms ?? "")}`),
    teslimYeri: terms.deliveryLocation ?? undefined,
    teslimKosullari: resolveContractTerms(deliveryTerms, termsContext),
    odemeKosullari: resolveContractTerms(terms.paymentTermsText ?? quote?.paymentTerms, termsContext),
    garantiKosullari: resolveContractTerms(warrantyTerms, termsContext),
    ithalatMasraflariDahil: terms.importCostsExcluded === undefined ? undefined : !Boolean(terms.importCostsExcluded),
    kdvDahil: Boolean(terms.vatIncluded),
    nakliyeSaticiya: Boolean(terms.freightPaidBySeller),
    notlar: quote?.notes ?? offer?.note ?? undefined,
    kdvOran: vatRate,
    odemePlani: expectedPaymentRows(payments, salesCase),
    kontrolUnitesiMarka: controlBrand,
    machines,
  };
}


/**
 * Sözleşme baskı verisi + "Hazırlayan" satırı.
 *
 * Hazırlayan, satış kartının sorumlusudur; ünvanı atanmışsa o, değilse
 * departman adı yazılır. İki farklı üretim yolu (anlık görüntü / canlı veri)
 * olduğu için alan burada tek noktadan eklenir.
 */
export async function loadContractPrintData(input: ContractBuildInput): Promise<ContractPrintData> {
  const data = await buildContractPrintData(input);
  // Belgeye imza seçilmişse satır "Hazırlayan" yerine imzaya döner; seçilmemiş
  // belgelerde eski davranış (satış sorumlusu) korunur.
  const imza = printSignatureFromDocumentSnapshot(input.documentSnapshot);
  const owner = (input.users ?? []).find((u) => u.id === input.salesCase?.assignedUserId);
  if (!imza && !owner) return data;
  return {
    ...data,
    ...(imza ? { imza } : {}),
    ...(owner ? { hazirlayan: owner.name, hazirlayanUnvan: owner.title || owner.department || undefined } : {}),
  };
}
