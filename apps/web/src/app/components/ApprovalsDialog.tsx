import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { accessRequestService, type AccessRequestRow } from "../../lib/services";

/**
 * Mükerrer firma erişim taleplerinin onay kutusu. Bölüm sahibi / yetkili
 * (companies.update) bekleyen talepleri onaylar veya reddeder. Onaylanınca
 * firma talep eden bölümün portföyüne eklenir (backend).
 */
export function ApprovalsDialog({
  trigger,
  onChange,
}: {
  trigger: React.ReactNode;
  onChange?: (pendingCount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AccessRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await accessRequestService.list({ status: "pending", pageSize: 100 });
      setRows(res.data);
      onChange?.(res.meta?.total ?? res.data.length);
    } catch (err: any) {
      toast.error("Onay talepleri yüklenemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const decide = async (row: AccessRequestRow, decision: "approve" | "reject") => {
    setBusyId(row.id);
    try {
      if (decision === "approve") await accessRequestService.approve(row.id);
      else await accessRequestService.reject(row.id);
      toast.success(decision === "approve" ? "Talep onaylandı" : "Talep reddedildi", {
        description: row.company?.legalTitle ?? undefined,
      });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      onChange?.(Math.max(0, rows.length - 1));
    } catch (err: any) {
      toast.error("İşlem başarısız", { description: err?.message ?? "İstek reddedildi." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Onay Bekleyen Firma Talepleri</DialogTitle>
          <DialogDescription>
            Başka bir bölümün portföyündeki firmaya erişim talepleri. Onayladığınızda firma talep eden bölüme eklenir.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="grid place-items-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Bekleyen talep yok.</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                    <Building2 className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{r.company?.legalTitle ?? "Firma"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.requestingDivision?.name ?? "Bölüm"} talep ediyor
                      {r.company?.taxNumber ? ` · VKN ${r.company.taxNumber}` : ""}
                    </div>
                    {r.note && <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.note}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={busyId === r.id}
                      title="Reddet"
                      onClick={() => decide(r, "reject")}
                    >
                      {busyId === r.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                    </Button>
                    <Button
                      size="icon"
                      className="size-8 bg-emerald-600 hover:bg-emerald-700"
                      disabled={busyId === r.id}
                      title="Onayla"
                      onClick={() => decide(r, "approve")}
                    >
                      <Check className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
