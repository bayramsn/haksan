// Pure document snapshot adapter shared by web and the native mobile PDF flow.
import type { DocumentItem, Product } from "../types";
import { isMachiningCenterTypeCode } from "../../index";
import { publicProductLabel, trLongDate, snapshotAddressLine } from "./core";
import { applyVatRateToNotes, resolveProformaNotes } from "./notes";
import { allocateCustomsTotal } from "./customsAllocation";
import { printSignatureFromSnapshot } from "./signatureData";
import type { ProformaItem, ProformaPrintData } from "./templates";

const formatBirim = (quantity: number, unitCode?: string | null): string => {
  const q = Number(quantity);
  const unit = (unitCode ?? "adet").toLowerCase();
  if (unit === "adet") return `${q} Adet`;
  return `${q} ${unitCode ?? "Adet"}`;
};


const snapshotValue = (value: any, ...keys: string[]) => {
  for (const key of keys) {
    if (value?.[key] !== undefined && value?.[key] !== null) return value[key];
  }
  return undefined;
};

export const proformaFromSnapshot = (
  doc: Pick<DocumentItem, "fileName" | "uploadedAt">,
  snapshot: Record<string, any>,
  products: Product[],
  variantKey?: string,
  resolveMediaUrl?: (url: string) => string,
): ProformaPrintData => {
  const quote = snapshot.quote ?? {};
  const company = snapshot.company ?? {};
  const contact = snapshot.contact ?? {};
  const address = (snapshot.companyAddresses ?? [])[0] ?? {};
  const companyPhones = Array.isArray(snapshot.companyPhones) ? snapshot.companyPhones : [];
  const companyEmails = Array.isArray(snapshot.companyEmails) ? snapshot.companyEmails : [];
  const isFaxPhone = (phone: any) => /^(fax|faks)$/i.test(String(snapshotValue(phone, "phoneType", "phone_type") ?? ""));
  const companyPhone = companyPhones.find((phone: any) => !isFaxPhone(phone)) ?? {};
  const companyFax = companyPhones.find((phone: any) => isFaxPhone(phone)) ?? {};
  const companyEmail = companyEmails.find((email: any) =>
    String(snapshotValue(email, "emailType", "email_type") ?? "").toLocaleLowerCase("tr-TR") === "main",
  ) ?? companyEmails.find((email: any) => Boolean(snapshotValue(email, "isDefault", "is_default"))) ?? companyEmails[0] ?? {};
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
  const fullAddress = snapshotAddressLine(address);
  const terms = snapshot.terms ?? {};
  const payment = String(snapshotValue(terms, "paymentTermsText", "payment_terms_text") ?? snapshotValue(quote, "paymentTerms", "payment_terms") ?? "");
  const delivery = String(snapshotValue(terms, "deliveryTermsText", "delivery_terms_text") ?? snapshotValue(quote, "deliveryTerms", "delivery_terms") ?? "");
  const warranty = String(snapshotValue(terms, "warrantyTermsText", "warranty_terms_text") ?? snapshotValue(quote, "warrantyTerms", "warranty_terms") ?? "");
  const variant = resolveProformaNotes(variantKey, {
    alici: companyName,
    kdvOrani: termsVatRate,
  });
  return {
    firma: companyName,
    // İmza belgenin kendi anlık görüntüsünden; seçilmemişse satır hazırlayana düşer.
    imza: printSignatureFromSnapshot(snapshot.signature, resolveMediaUrl),
    ilgili: snapshotValue(contact, "fullName", "full_name"),
    mobil: snapshotValue(contact, "mobilePhone", "mobile_phone"),
    adres: fullAddress,
    tel: snapshotValue(contact, "workPhone", "work_phone") ?? snapshotValue(companyPhone, "phone"),
    faks: snapshotValue(companyFax, "phone"),
    email: snapshotValue(companyEmail, "email") ?? snapshotValue(contact, "workEmail", "work_email", "email"),
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

