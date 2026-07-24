import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { serviceService } from "../../../lib/services";
import { gearOutline } from "../brand/gear";
import type { Machine } from "../../lib/mock";

type Props = {
  machine: Machine | null;
  customerName: string;
  onClose: () => void;
};

const GEAR_PATH = gearOutline(14, 48, 40, 24);

/**
 * Makine üstü QR kimlik etiketi — cihaza bağlı public servis şikayet linki
 * üretir (varsa token'ı yeniler) ve yazdırılabilir etiket çıkarır. QR
 * okutulunca müşteri, makine kimliği + garanti durumu önceden dolu servis
 * talebi formuna düşer.
 */
export function MachineQrDialog({ machine, customerName, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [rotated, setRotated] = useState(false);

  useEffect(() => {
    if (!machine) {
      setUrl(null);
      setQr(null);
      setRotated(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const existing = await serviceService.complaintLinks({ customerDeviceId: machine.id, limit: 5 });
        const active = (existing.data ?? []).find((l: any) => l.isActive && !l.revokedAt);
        const credential = active
          ? await serviceService.rotateComplaintLink(active.id)
          : await serviceService.createComplaintLink({
              companyId: machine.userCompanyId || machine.customerId || undefined,
              customerDeviceId: machine.id,
              title: `${machine.model} Servis Formu`,
            } as any);
        if (cancelled) return;
        const fullUrl = `${window.location.origin}${credential.publicPath}`;
        setRotated(Boolean(active));
        setUrl(fullUrl);
        setQr(await QRCode.toDataURL(fullUrl, { width: 480, margin: 1, errorCorrectionLevel: "M" }));
      } catch {
        if (!cancelled) toast.error("QR etiketi üretilemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [machine]);

  const copyLink = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("Link kopyalandı.");
  };

  const printLabel = () => {
    if (!machine || !qr) return;
    const win = window.open("", "_blank", "width=460,height=640");
    if (!win) {
      toast.error("Yazdırma penceresi açılamadı. Tarayıcı engelini kontrol edin.");
      return;
    }
    win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Makine QR Etiketi</title>
<style>
  @page { size: 100mm 140mm; margin: 4mm; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #18202a; }
  .label { width: 92mm; border: 1.2px solid #000c69; border-radius: 4mm; padding: 5mm; text-align: center; }
  .head { display: flex; align-items: center; justify-content: center; gap: 3mm; }
  .head svg { width: 11mm; height: 11mm; }
  .brand { font-size: 18px; font-weight: 800; letter-spacing: 1px; color: #cf060c; }
  .brand small { display: block; font-size: 9px; font-weight: 600; letter-spacing: 4px; color: #000c69; }
  .rule { height: 2px; margin: 3mm 0; background: linear-gradient(90deg, #cf060c 0 22mm, #000c69 22mm 100%); }
  .qr { width: 58mm; height: 58mm; }
  .model { margin-top: 2mm; font-size: 15px; font-weight: 700; }
  .meta { margin-top: 1mm; font-size: 11px; color: #4b5563; }
  .sn { font-family: ui-monospace, monospace; }
  .cta { margin-top: 3mm; padding: 2mm; border-radius: 2mm; background: #eef1ff; color: #000c69; font-size: 11px; font-weight: 600; }
  .foot { margin-top: 2.5mm; font-size: 9px; color: #6b7280; }
</style></head><body>
  <div class="label">
    <div class="head">
      <svg viewBox="-52 -52 104 104" xmlns="http://www.w3.org/2000/svg"><path d="${GEAR_PATH}" fill="#000c69" fill-rule="evenodd"/></svg>
      <div class="brand">HAKSAN<small>MAKİNA</small></div>
    </div>
    <div class="rule"></div>
    <img class="qr" src="${qr}" alt="QR" />
    <div class="model">${escapeHtml(machine.model)}</div>
    <div class="meta">${escapeHtml(machine.brand || "")}${machine.brand ? " · " : ""}<span class="sn">SN: ${escapeHtml(machine.serialNumber)}</span></div>
    <div class="meta">${escapeHtml(customerName)}</div>
    <div class="cta">Arıza / servis talebi için QR kodu okutun</div>
    <div class="foot">"Makina Marketiniz" · 1972'den bugüne</div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`);
    win.document.close();
  };

  return (
    <Dialog open={Boolean(machine)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Makine QR Etiketi</DialogTitle>
          <DialogDescription>
            {machine ? `${machine.model} · SN ${machine.serialNumber}` : ""}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="grid place-items-center py-10 text-sm text-muted-foreground">
            <RefreshCw className="mb-2 size-5 animate-spin text-primary" />
            Etiket hazırlanıyor…
          </div>
        ) : qr ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl border-2 border-primary/20 bg-white p-4">
              <img src={qr} alt="Makine servis QR kodu" className="size-44" />
            </div>
            <p className="max-w-xs text-center text-xs text-muted-foreground">
              QR okutulduğunda müşteri, bu makineye bağlı servis talebi formuna ulaşır
              (makine kimliği ve garanti durumu otomatik dolu gelir).
            </p>
            {rotated && (
              <p className="rounded-md bg-warning-soft px-3 py-1.5 text-center text-[11px] text-warning">
                Yeni QR üretildi — daha önce yazdırılan etiketler geçersiz oldu.
              </p>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">Etiket üretilemedi.</div>
        )}
        <DialogFooter>
          <Button variant="outline" className="gap-1.5" onClick={() => void copyLink()} disabled={!url}>
            <Copy className="size-4" /> Linki Kopyala
          </Button>
          <Button className="gap-1.5" onClick={printLabel} disabled={!qr}>
            <Printer className="size-4" /> Etiketi Yazdır
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
