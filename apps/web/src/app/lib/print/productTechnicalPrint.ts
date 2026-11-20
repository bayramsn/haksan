import type { Product } from "../mock";
import { publicProductLabel, type PrintDocument } from "./core";
import { printableTechnicalSpecs, quoteMachineModel } from "./technicalSpecs";
import { laserSnapshotPrintSpecs, quoteTechnicalSpecsFromProduct } from "../laserProductSnapshot";
import { quoteDoc } from "./templates";
import { applyOptionalEquipmentSpecs, type SelectedTechnicalEquipment } from "./optionalEquipmentSpecs";

export type ProductTechnicalPrintInput = {
  product: Product;
  standardEquipment?: string[];
  optionalEquipment?: SelectedTechnicalEquipment[];
};

const MAX_EMBEDDED_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i;
const SAFE_REMOTE_IMAGE_URL = /^(?:https?:\/\/|\/)/i;
const SAFE_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const safeProductImageUrl = (value?: string | null): string => {
  const imageUrl = value?.trim() ?? "";
  if (SAFE_IMAGE_DATA_URL.test(imageUrl) || SAFE_REMOTE_IMAGE_URL.test(imageUrl)) return imageUrl;
  return "";
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

/**
 * Blob tabanlı yazdırma pencereleri ağ görsellerini PDF'e güvenilir biçimde
 * aktaramayabilir. Ürün görselini doğrulayıp belge HTML'ine data URL olarak
 * gömer; böylece yazdırma anında yeni bir ağ isteğine ihtiyaç kalmaz.
 */
export const embedProductImageForPrint = async (
  imageUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<string> => {
  const safeUrl = safeProductImageUrl(imageUrl);
  if (!safeUrl) throw new Error("Geçersiz ürün görseli adresi");
  if (safeUrl.startsWith("data:image/")) return safeUrl;

  const response = await fetcher(safeUrl, { credentials: "include" });
  if (!response.ok) throw new Error(`Ürün görseli alınamadı (${response.status})`);

  const mimeType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!SAFE_IMAGE_MIME_TYPES.has(mimeType)) throw new Error("Desteklenmeyen ürün görseli türü");

  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_EMBEDDED_PRODUCT_IMAGE_BYTES) throw new Error("Ürün görseli çok büyük");

  const body = await response.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_EMBEDDED_PRODUCT_IMAGE_BYTES) {
    throw new Error("Ürün görseli boş veya çok büyük");
  }
  return `data:${mimeType};base64,${arrayBufferToBase64(body)}`;
};

/**
 * Ürün kartından üretilen teknik belge, satış teklifinin birebir aynısıdır;
 * yalnız teklif başlığı + müşteri kutusu ve fiyat/koşul sayfaları basılmaz.
 */
export const productTechnicalDoc = (
  input: ProductTechnicalPrintInput,
  assetBase: string,
): PrintDocument => {
  const { product } = input;
  const productName = publicProductLabel({
    catalogName: product.shortDescription,
    description: [product.brand, product.series, product.modelName || product.model].filter(Boolean).join(" "),
    stockCode: product.stockCode,
  });
  const selectedEquipment = input.optionalEquipment ?? [];
  const configuredSpecs = applyOptionalEquipmentSpecs(
    quoteTechnicalSpecsFromProduct(product),
    selectedEquipment,
  );
  const machine = {
    urun: productName,
    marka: product.brand,
    brandLogoUrl: product.brandLogoUrl,
    model: quoteMachineModel(product),
    tip: product.type,
    imageUrl: safeProductImageUrl(product.imageUrl) || undefined,
    specs: product.technicalConfiguration
      ? printableTechnicalSpecs(laserSnapshotPrintSpecs(product.technicalConfiguration, configuredSpecs))
      : printableTechnicalSpecs(configuredSpecs),
    standartDonanim: input.standardEquipment ?? product.standardEquipment ?? [],
    opsiyonelDonanim: selectedEquipment
      .map((item) => item.title),
  };
  const doc = quoteDoc({
    firma: "", tarih: "", belgeNo: "", items: [], kdvOran: 0, kdvTutar: 0, currency: product.currency ?? "USD",
    notes: { key: "entered", label: "", odeme: [], teslimat: [], garanti: [] },
    machines: [machine],
  }, assetBase, { technicalOnly: true });
  return { ...doc, title: `${productName} - Teknik Bilgiler` };
};
