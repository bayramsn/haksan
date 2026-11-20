export * from "../../../../../../packages/shared/src/commercial-print/print/core";
import { type PrintDocument, safeFilename, buildPrintHtml } from "../../../../../../packages/shared/src/commercial-print/print/core";
/** Yazdırılabilir HTML dosyasını indirir (tarayıcıda açılıp PDF olarak kaydedilebilir). */
export const downloadPrintHtml = (doc: PrintDocument, filename: string): void => {
  const html = buildPrintHtml(doc, { autoPrint: false });
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilename(filename)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Varsayılan logo/asset kökü — public/print Vite tarafından kökten servis edilir. */
export const printAssetBase = (): string => `${window.location.origin}/print`;

/**
 * Belgeyi yeni pencerede açıp otomatik yazdırır.
 * false dönerse pop-up engellenmiştir; çağıran taraf kullanıcıyı uyarmalı.
 */
export const openPrintWindow = (doc: PrintDocument): boolean => {
  const url = URL.createObjectURL(new Blob([buildPrintHtml(doc)], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
};

/**
 * Belgeyi otomatik yazdırmadan yeni pencerede açar. Kullanıcı buradan
 * tarayıcı menüsüyle PDF olarak kaydedebilir.
 */
export const openPrintPreviewWindow = (doc: PrintDocument): boolean => {
  const url = URL.createObjectURL(new Blob([buildPrintHtml(doc, { autoPrint: false })], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
};

/**
 * Belgedeki <img src="…/print/x.png"> görsellerini data: URL'ye çevirir. Sunucu tarafı
 * PDF üretimi ağa çıkmadan (SSRF'e kapalı) çalıştığı için görseller belgeye gömülü gider.
 */
export const inlinePrintAssets = async (html: string): Promise<string> => {
  const sources = [...new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((src) => !src.startsWith("data:")))];
  const encoded = await Promise.all(sources.map(async (src) => {
    try {
      const response = await fetch(src);
      if (!response.ok) return [src, null] as const;
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return [src, dataUrl] as const;
    } catch {
      return [src, null] as const;
    }
  }));
  return encoded.reduce((out, [src, dataUrl]) => (dataUrl ? out.split(`src="${src}"`).join(`src="${dataUrl}"`) : out), html);
};

/** "Yazdır / PDF Kaydet" ile aynı belge; sunucuda PDF'e çevrilmek üzere görselleri gömülü tam HTML. */
export const buildMailDocumentHtml = (doc: PrintDocument): Promise<string> =>
  inlinePrintAssets(buildPrintHtml(doc, { autoPrint: false }));

