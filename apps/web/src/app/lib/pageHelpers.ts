import { toast } from 'sonner';
import type { PrintDocument } from './print';
import { buildMailDocumentHtml, downloadPrintHtml, openPrintPreviewWindow, openPrintWindow, safeFilename } from './print';
import { downloadExportPost } from '../../lib/downloadExport';

export const printOrWarn = (doc: PrintDocument) => {
  if (!openPrintWindow(doc)) {
    toast.error('Yazdırma penceresi açılamadı', { description: 'Lütfen pop-up engelleyiciyi kapatın.' });
  }
};

export const previewPrintOrWarn = (doc: PrintDocument) => {
  if (!openPrintPreviewWindow(doc)) {
    toast.error('Önizleme penceresi açılamadı', { description: 'Lütfen pop-up engelleyiciyi kapatın.' });
  }
};

/**
 * Belgeyi antetiyle birlikte doğrudan PDF olarak indirir: görseller gömülü yazdırma
 * HTML'i sunucuda Chromium ile PDF'e çevrilir (mail ekiyle aynı çıktı). Sunucu PDF
 * üretemezse eski yol — tarayıcıda açılıp PDF'e kaydedilecek HTML dosyası — iner.
 */
export const downloadPrintOrWarn = async (doc: PrintDocument, filename: string, label = 'Belge') => {
  const name = `${safeFilename(filename)}.pdf`;
  try {
    await downloadExportPost('/pdf/render', name, { html: await buildMailDocumentHtml(doc), filename: name });
    toast.success(`${label} PDF olarak indirildi`, { description: name });
    return;
  } catch (error) {
    try {
      downloadPrintHtml(doc, filename);
      toast.warning(`${label} PDF'e çevrilemedi`, {
        description: `${error instanceof Error ? error.message : 'Sunucu PDF üretemedi'}. Belge HTML olarak indirildi; tarayıcıda açıp Yazdır → PDF olarak kaydet ile PDF oluşturabilirsiniz.`,
      });
    } catch {
      toast.error(`${label} indirilemedi`, { description: 'İndirme başarısız oldu.' });
    }
  }
};

export const openInMaps = (parts: Array<string | undefined | null>) => {
  const q = parts.filter(Boolean).join(' ').trim();
  if (!q) {
    toast.message('Konum bulunamadı', { description: 'Bu firma için adres bilgisi girilmemiş.' });
    return;
  }
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, '_blank', 'noopener');
};

export const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('tr-TR').format(new Date(value)) : '—';

export const formatCurrency = (value: number, currency = 'USD') =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export type WarrantyState = 'active' | 'expiring' | 'expired' | 'unknown';

/** Garanti bitiş tarihinden durum + kalan gün üretir (Makineler ve Servis
 *  ekranlarında ortak kullanılır). */
export const warrantyInfo = (
  warrantyEnd?: string | null,
): { state: WarrantyState; label: string; days: number | null } => {
  if (!warrantyEnd) return { state: 'unknown', label: 'Garanti bilgisi yok', days: null };
  const end = new Date(warrantyEnd);
  if (Number.isNaN(end.getTime())) return { state: 'unknown', label: 'Garanti bilgisi yok', days: null };
  const days = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { state: 'expired', label: 'Garanti süresi doldu', days };
  if (days <= 60) return { state: 'expiring', label: `Garanti bitişine ${days} gün`, days };
  return { state: 'active', label: `Garanti aktif · ${days} gün kaldı`, days };
};

export const splitVat = (
  gross: number,
  opts?: { subtotal?: number; vatTotal?: number; defaultRate?: number },
): { net: number; kdv: number; oran: number } => {
  const defaultRate = opts?.defaultRate ?? 20;
  if (opts?.subtotal && opts.subtotal > 0) {
    const kdv = opts.vatTotal && opts.vatTotal > 0 ? opts.vatTotal : 0;
    const oran = Math.round((kdv / opts.subtotal) * 100);
    return { net: opts.subtotal, kdv, oran };
  }
  const net = gross / (1 + defaultRate / 100);
  return { net, kdv: gross - net, oran: defaultRate };
};
