// Proforma yazdırma/indirme: sabit sayfa düzeni + ilişkili teklif kaydında
// gerçekten saklanan müşteri, kalem, vergi, şart ve not alanları.

import type { Contact, Customer, DocumentItem, Offer, Product, SalesCase, User } from "../mock";
import { isMachiningCenterTypeCode } from "@haksan/shared";
import { quoteService } from "../../../lib/services";
import { splitVat } from "../pageHelpers";
import { publicProductLabel, trLongDate } from "./core";
import { applyVatRateToNotes, matchQuoteNoteVariantKey, resolveProformaNotes, QUOTE_VARIANT_PREFIX } from "./notes";
import { allocateCustomsTotal } from "./quotePrint";
import { printSignatureFromSnapshot } from "./signature";
import type { ProformaItem, ProformaPrintData } from "./templates";

export type ProformaBuildInput = {
  doc: DocumentItem;
  customers: Customer[];
  cases: SalesCase[];
  offers: Offer[];
  products: Product[];
  contacts?: Contact[];
  /** İmza satırındaki hazırlayanın ünvanını çözmek için CRM kullanıcıları. */
  users?: User[];
  /** Belgenin altına basılacak proforma not şablonu (CİF İstanbul / İşletme Teslim). */
  variantKey?: string;
};

type QuoteDetail = Awaited<ReturnType<typeof quoteService.get>>;

const snapshotValue = (value: any, ...keys: string[]) => {
  for (const key of keys) {
    if (value?.[key] !== undefined && value?.[key] !== null) return value[key];
  }
  return undefined;
};

const proformaFromSnapshot = (
  doc: DocumentItem,
  snapshot: Record<string, any>,
  products: Product[],
  variantKey?: string,
): ProformaPrintData => {
  const quote = snapshot.quote ?? {};
  const company = snapshot.company ?? {};
  const contact = snapshot.contact ?? {};
  const address = (snapshot.companyAddresses ?? [])[0] ?? {};
  const companyPhones = Array.isArray(snapshot.companyPhones) ? snapshot.companyPhones : [];
  const isFaxPhone = (phone: any) => /^(fax|faks)$/i.test(String(snapshotValue(phone, "phoneType", "phone_type") ?? ""));
  const companyPhone = companyPhones.find((phone: any) => !isFaxPhone(phone)) ?? {};
  const companyFax = companyPhones.find((phone: any) => isFaxPhone(phone)) ?? {};
  const rows = Array.isArray(snapshot.items) ? snapshot.items : [];
  const lineDiscount = rows.reduce(
    (sum: number, item: any) => sum + Number(snapshotValue(item, "discountAmount", "discount_amount") ?? 0),
    0,
  );
  const headerDiscount = Math.max(Number(snapshotValue(quote, "discountTotal", "discount_total") ?? 0) - lineDiscount, 0);
  const customsAllocations = allocateCustomsTotal(
    rows,
    Number(snapshotValue(quote, "customsTotal", "customs_total") ?? 0),
    (item: any) => {
      if (!Boolean(snapshotValue(item, "nationalized"))) return false;
      const productModelId = String(snapshotValue(item, "productModelId", "product_model_id") ?? "");
      const product = products.find((candidate) => candidate.id === productModelId);
      return !product?.productTypeCode || isMachiningCenterTypeCode(product.productTypeCode);
    },
    (item: any) => Number(snapshotValue(item, "quantity") ?? 0)
      * Number(snapshotValue(item, "unitPrice", "unit_price") ?? 0),
  );
  const items: ProformaItem[] = rows.map((item: any, index: number) => {
    const qty = Number(snapshotValue(item, "quantity") ?? 1);
    const unitPrice = Number(snapshotValue(item, "unitPrice", "unit_price") ?? 0);
    const discount = Number(snapshotValue(item, "discountAmount", "discount_amount") ?? 0);
    const grossLineTotal = qty * unitPrice;
    const customsAllocation = customsAllocations[index] ?? 0;
    const productSnapshot = snapshotValue(item, "product") ?? {};
    const productModelId = String(snapshotValue(item, "productModelId", "product_model_id") ?? "");
    // Şema v1 anlık görüntülerinde ürün kimliği var ancak ürün bilgisi yoktu.
    // Eski belgelerde katalog yalnızca eksik meta alanlarını tamamlamak için kullanılır.
    const catalogProduct = products.find((product) => product.id === productModelId);
    return {
      aciklama: publicProductLabel({
        catalogName:
          snapshotValue(productSnapshot, "fullName", "full_name")
          ?? catalogProduct?.shortDescription,
        description: snapshotValue(item, "description"),
        stockCode: snapshotValue(item, "stockCode", "stock_code") ?? catalogProduct?.stockCode,
      }),
      marka: snapshotValue(productSnapshot, "brandName", "brand_name", "brand") ?? catalogProduct?.brand,
      model: snapshotValue(productSnapshot, "modelName", "model_name", "model") ?? catalogProduct?.model,
      mensei: snapshotValue(productSnapshot, "originCountry", "origin_country") ?? catalogProduct?.originCountry,
      gtip: snapshotValue(productSnapshot, "hsCode", "hs_code") ?? catalogProduct?.hsCode,
      birim: formatBirim(qty, snapshotValue(item, "unitCode", "unit_code") ?? "Adet"),
      birimFiyati: qty > 0 ? unitPrice + customsAllocation / qty : unitPrice,
      iskonto: discount,
      tutar: grossLineTotal + customsAllocation,
    };
  });
  const vatRates = rows.map((item: any) => Number(snapshotValue(item, "vatRate", "vat_rate") ?? 0));
  const kdvOran = vatRates.length && vatRates.every((rate: number) => rate === vatRates[0]) ? vatRates[0] : 0;
  const primaryRow = rows.find((item: any) => !String(snapshotValue(item, "description") ?? "").trimStart().startsWith("↳ Opsiyon:"));
  const termsVatRate = Number(snapshotValue(primaryRow, "vatRate", "vat_rate") ?? vatRates[0] ?? 0);
  const companyName = String(snapshotValue(company, "legalTitle", "legal_title", "shortName", "short_name") ?? "");
  const fullAddress = String(snapshotValue(address, "fullAddress", "full_address") ?? [
    snapshotValue(address, "street"),
    snapshotValue(address, "buildingNumber", "building_number"),
    snapshotValue(address, "district"),
    snapshotValue(address, "province"),
    snapshotValue(address, "country"),
  ].filter(Boolean).join(" "));
  const terms = snapshot.terms ?? {};
  const payment = String(snapshotValue(terms, "paymentTermsText", "payment_terms_text") ?? snapshotValue(quote, "paymentTerms", "payment_terms") ?? "");
  const delivery = String(snapshotValue(terms, "deliveryTermsText", "delivery_terms_text") ?? snapshotValue(quote, "deliveryTerms", "delivery_terms") ?? "");
  const warranty = String(snapshotValue(terms, "warrantyTermsText", "warranty_terms_text") ?? snapshotValue(quote, "warrantyTerms", "warranty_terms") ?? "");
  const variant = resolveProformaNotes(variantKey, {
    alici: companyName,
    yil: new Date(doc.uploadedAt || snapshot.capturedAt || Date.now()).getFullYear(),
    kdvOrani: termsVatRate,
  });
  return {
    firma: companyName,
    // İmza belgenin kendi anlık görüntüsünden; seçilmemişse satır hazırlayana düşer.
    imza: printSignatureFromSnapshot(snapshot.signature),
    ilgili: snapshotValue(contact, "fullName", "full_name"),
    mobil: snapshotValue(contact, "mobilePhone", "mobile_phone"),
    adres: fullAddress,
    tel: snapshotValue(contact, "workPhone", "work_phone") ?? snapshotValue(companyPhone, "phone"),
    faks: snapshotValue(companyFax, "phone"),
    vergiDairesi: snapshotValue(company, "taxOffice", "tax_office"),
    vergiNo: snapshotValue(company, "taxNumber", "tax_number"),
    tarih: trLongDate(doc.uploadedAt || snapshot.capturedAt) || trLongDate(new Date()),
    belgeNo: doc.fileName,
    items,
    headerDiscount,
    kdvOran,
    kdvTutar: Number(snapshotValue(quote, "vatAmount", "vat_amount") ?? 0),
    currency: String(snapshotValue(snapshot.currency, "code") ?? "USD") as ProformaPrintData["currency"],
    notlar: variant ?? applyVatRateToNotes(
      [payment, delivery, warranty, snapshotValue(quote, "notes")]
        .flatMap((value) => String(value ?? "").split(/\r?\n/))
        .map((value) => value.trim())
        .filter(Boolean),
      termsVatRate,
    ),
  };
};

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
        p.categoryCode !== "ISCILIK" &&
        ((p.model && (hint.includes(p.model) || p.model.includes(hint))) ||
          (p.modelName && hint.includes(p.modelName))),
    );
  }
  const desc = opts.description?.toLowerCase() ?? "";
  if (desc) {
    return products.find(
      (p) =>
        p.categoryCode !== "ISCILIK" &&
        ((p.model && desc.includes(p.model.toLowerCase())) ||
          (p.brand && desc.includes(p.brand.toLowerCase()))),
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

  const customsAllocations = allocateCustomsTotal(
    rows,
    Number(quote.customsTotal ?? 0),
    (item: any) => {
      if (!item.nationalized) return false;
      const product = findProduct(products, {
        productModelId: item.productModelId ?? undefined,
        description: item.description,
        modelHint: sc?.requestedModel,
      });
      return !product?.productTypeCode || isMachiningCenterTypeCode(product.productTypeCode);
    },
    (item: any) => Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0),
  );

  return rows.map((it: any, index: number) => {
    const qty = Number(it.quantity ?? 1);
    const unitPrice = Number(it.unitPrice ?? 0);
    const discount = Number(it.discountAmount ?? 0);
    const customsAllocation = customsAllocations[index] ?? 0;
    const product = findProduct(products, {
      productModelId: it.productModelId ?? undefined,
      description: it.description,
      modelHint: sc?.requestedModel,
    });
    const isLabor = product?.categoryCode === "ISCILIK";
    return {
      aciklama: publicProductLabel({
        catalogName: product?.shortDescription,
        description: it.description,
        stockCode: it.stockCode ?? product?.stockCode,
      }),
      marka: isLabor ? undefined : product?.brand,
      mensei: isLabor ? undefined : product?.originCountry,
      gtip: isLabor ? undefined : product?.hsCode,
      birim: formatBirim(qty, it.unit?.code ?? it.unitCode),
      birimFiyati: qty > 0 ? unitPrice + customsAllocation / qty : unitPrice,
      iskonto: discount,
      tutar: qty * unitPrice + customsAllocation,
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
    marka: ctx.product?.categoryCode === "ISCILIK" ? undefined : ctx.product?.brand,
    mensei: ctx.product?.categoryCode === "ISCILIK" ? undefined : ctx.product?.originCountry,
    gtip: ctx.product?.categoryCode === "ISCILIK" ? undefined : ctx.product?.hsCode,
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
  const { doc, customers, cases, offers, products, contacts = [], users = [], variantKey } = input;
  if (doc.documentSnapshot) return proformaFromSnapshot(doc, doc.documentSnapshot, products, variantKey);
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
  const pdfAddress = cust?.addresses?.find((address) => address.id === quoteDetail?.companyAddressId)
    ?? cust?.addresses?.find((address) => address.isBilling)
    ?? cust?.addresses?.find((address) => address.isDefault)
    ?? cust?.addresses?.[0];
  const printableAddress = pdfAddress
    ? [pdfAddress.address, pdfAddress.district, pdfAddress.city, pdfAddress.country].filter(Boolean).join(" ")
    : cust ? [cust.address, cust.district, cust.city, cust.country].filter(Boolean).join(" ") : "";

  return {
    firma: cust?.name ?? "",
    ilgili: contact?.name || cust?.contactPerson,
    mobil: contact?.mobilePhone || cust?.phone2,
    adres: printableAddress,
    tel: contact?.phone || cust?.phone,
    faks: cust?.fax,
    vergiDairesi: cust?.taxOffice,
    vergiNo: cust?.taxNumber,
    tarih: trLongDate(doc.uploadedAt) || trLongDate(new Date()),
    belgeNo: doc.fileName,
    items,
    headerDiscount: quoteDetail
      ? Math.max(
          Number(quoteDetail.discountTotal ?? 0)
            - (quoteDetail.items ?? []).reduce(
                (sum: number, item: { discountAmount?: unknown }) => sum + Number(item.discountAmount ?? 0),
                0,
              ),
          0,
        )
      : 0,
    kdvOran,
    kdvTutar: Number(
      quoteDetail?.vatAmount ??
      quoteDetail?.items?.reduce((sum: number, item: { vatAmount?: unknown }) => sum + Number(item.vatAmount ?? 0), 0) ??
      vat.kdv,
    ),
    currency: (offer?.currency ?? sc?.currency ?? "USD") as ProformaPrintData["currency"],
    // İmza satırı: belgeyi hazırlayan, bağlı teklifin proje ilgilisidir.
    // Ünvan atanmışsa o, yoksa departman adı yazılır.
    ...(() => {
      const owner = users.find((u) => u.id === quoteDetail?.projectOwnerUserId);
      return owner
        ? { hazirlayan: owner.name, hazirlayanUnvan: owner.title || owner.department || undefined }
        : {};
    })(),
    // Not önceliği: (1) menüden açıkça seçilen şablon, (2) teklifte seçilen teslim
    // şeklinin otomatik tespiti, (3) bağlı teklifin ham şartları. {{ALICI}}/{{YIL}} doldurulur.
    notlar: (() => {
      const ctx = {
        alici: cust?.name,
        yil: new Date(doc.uploadedAt || offer?.date || Date.now()).getFullYear(),
        kdvOrani: enteredVatRates.find((rate: number) => rate > 0) ?? kdvOran,
      };
      const payment = String(quoteDetail?.terms?.paymentTermsText ?? quoteDetail?.paymentTerms ?? "");
      const delivery = String(quoteDetail?.terms?.deliveryTermsText ?? quoteDetail?.deliveryTerms ?? "");
      const warranty = String(quoteDetail?.terms?.warrantyTermsText ?? quoteDetail?.warrantyTerms ?? "");

      // (1) Menüden açık seçim (proforma şablonu ya da teklif teslim şekli).
      const explicit = resolveProformaNotes(variantKey, ctx);
      if (explicit) return explicit;

      // (2) Teklifte seçilen teslim şekli şablonunu kayıtlı şartlardan tespit et.
      const autoKey = matchQuoteNoteVariantKey(payment, delivery, warranty);
      if (autoKey) {
        const auto = resolveProformaNotes(`${QUOTE_VARIANT_PREFIX}${autoKey}`, ctx);
        if (auto) return auto;
      }

      // (3) Eşleşme yoksa teklifin ham şart metinleri + serbest not.
      return applyVatRateToNotes(
        [payment, delivery, warranty, quoteDetail?.notes ?? offer?.note]
          .flatMap((value) => String(value ?? "").split(/\r?\n/))
          .map((value) => value.trim())
          .filter(Boolean),
        ctx.kdvOrani,
      );
    })(),
  };
}

/** İlişkili teklif kalemleri API'den çekilerek proforma verisi üretir. */
export async function loadProformaPrintData(input: ProformaBuildInput): Promise<ProformaPrintData> {
  if (input.doc.documentSnapshot) {
    return proformaFromSnapshot(input.doc, input.doc.documentSnapshot, input.products, input.variantKey);
  }
  const offer = resolveQuote(input.doc, input.offers);
  const quoteId = input.doc.quoteId ?? offer?.id;
  if (!quoteId) throw new Error("Proforma için ilişkili teklif bulunamadı.");
  const quoteDetail = await quoteService.get(quoteId);
  return buildProformaPrintData(input, quoteDetail);
}
