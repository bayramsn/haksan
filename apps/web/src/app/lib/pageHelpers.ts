import { toast } from 'sonner';
import type { PrintDocument } from './print';
import { downloadPrintHtml, openPrintWindow } from './print';

export const printOrWarn = (doc: PrintDocument) => {
  if (!openPrintWindow(doc)) {
    toast.error('Yazdırma penceresi açılamadı', { description: 'Lütfen pop-up engelleyiciyi kapatın.' });
  }
};

export const downloadPrintOrWarn = (doc: PrintDocument, filename: string) => {
  try {
    downloadPrintHtml(doc, filename);
    toast.success('Proforma indirildi', {
      description: 'Dosyayı tarayıcıda açıp Yazdır → PDF olarak kaydet ile PDF oluşturabilirsiniz.',
    });
  } catch {
    toast.error('Proforma indirilemedi', { description: 'İndirme başarısız oldu.' });
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
