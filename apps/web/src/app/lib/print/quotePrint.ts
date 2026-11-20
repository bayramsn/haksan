// Web network/image adapter; quote data assembly is also used by native mobile.
import { quoteService } from "../../../lib/services";
import { resolveMediaUrl } from "../../../lib/apiClient";
import { buildQuotePrintData as buildData, type QuoteBuildInput, type QuoteDetail } from "./quoteData";
import type { QuotePrintData } from "./templates";
export type { QuoteBuildInput } from "./quoteData";
export { allocateCustomsTotal } from "./customsAllocation";
export const buildQuotePrintData = (input: QuoteBuildInput, quote: QuoteDetail): QuotePrintData =>
  buildData({ ...input, resolveMediaUrl }, quote);

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
