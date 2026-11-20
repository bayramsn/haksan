import { resolveMediaUrl } from "../../../lib/apiClient";
// Proforma yazdırma/indirme: sabit sayfa düzeni + ilişkili teklif kaydında
// gerçekten saklanan müşteri, kalem, vergi, şart ve not alanları.

import type { Contact, Customer, DocumentItem, Offer, Product, SalesCase, User } from "../mock";
import { isMachiningCenterTypeCode } from "@haksan/shared";
import { quoteService } from "../../../lib/services";
import { splitVat } from "../pageHelpers";
import { publicProductLabel, trLongDate } from "./core";
import { applyVatRateToNotes, matchQuoteNoteVariantKey, resolveProformaNotes, QUOTE_VARIANT_PREFIX } from "./notes";
import { allocateCustomsTotal } from "./customsAllocation";
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

import { proformaFromSnapshot } from "./proformaSnapshot";

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
  if (doc.documentSnapshot) return proformaFromSnapshot(doc, doc.documentSnapshot, products, variantKey, resolveMediaUrl);
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
    email: cust?.email || contact?.email,
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
    // şeklinin otomatik tespiti, (3) bağlı teklifin ham şartları. {{ALICI}} doldurulur.
    notlar: (() => {
      const ctx = {
        alici: cust?.name,
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
    return proformaFromSnapshot(input.doc, input.doc.documentSnapshot, input.products, input.variantKey, resolveMediaUrl);
  }
  const offer = resolveQuote(input.doc, input.offers);
  const quoteId = input.doc.quoteId ?? offer?.id;
  if (!quoteId) throw new Error("Proforma için ilişkili teklif bulunamadı.");
  const quoteDetail = await quoteService.get(quoteId);
  return buildProformaPrintData(input, quoteDetail);
}
