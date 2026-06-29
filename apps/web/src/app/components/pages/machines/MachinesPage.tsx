import { useState, type MouseEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Badge } from "../../ui/badge";
import { StatusBadge } from "../../Layout";
import { CreateMachineDialog, CreateServiceRequestDialog } from "../../dialogs/CreateDialogs";
import { useStore } from "../../../lib/store";
import { inventoryService } from "../../../../lib/services";
import type { Machine } from "../../../lib/mock";
import { warrantyInfo, type WarrantyState } from "../../../lib/pageHelpers";
import { toast } from "sonner";
import { Eye, Wrench, Cpu, ShieldCheck, Trash2 } from "lucide-react";

const WARRANTY_TONE: Record<WarrantyState, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  expiring: "border-amber-200 bg-amber-50 text-amber-700",
  expired: "border-red-200 bg-red-50 text-red-700",
  unknown: "bg-muted/40 text-muted-foreground",
};

/** Garanti durumundan kısa rozet etiketi üretir. */
function warrantyShortLabel(info: ReturnType<typeof warrantyInfo>) {
  switch (info.state) {
    case "active":
      return "Garanti aktif";
    case "expiring":
      return info.days != null ? `${info.days} gün kaldı` : "Yaklaşıyor";
    case "expired":
      return "Süresi doldu";
    default:
      return "Garanti yok";
  }
}

/** Makine garanti durumu rozeti (Aktif / Yaklaşıyor / Süresi doldu). */
export function WarrantyBadge({ end }: { end?: string | null }) {
  const info = warrantyInfo(end);
  return (
    <Badge
      variant="outline"
      className={`gap-1 ${WARRANTY_TONE[info.state]}`}
      title={info.label}
    >
      <ShieldCheck className="size-3" />
      {warrantyShortLabel(info)}
    </Badge>
  );
}

/** Garanti durumu özet kartı (Makineler sayfası başlığında). */
function WarrantyKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: WarrantyState;
}) {
  return (
    <Card className={`border ${WARRANTY_TONE[tone]} shadow-sm`}>
      <CardContent className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="text-xs font-medium opacity-80 truncate">{label}</div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        </div>
        <ShieldCheck className="size-5 shrink-0 opacity-70" />
      </CardContent>
    </Card>
  );
}

function MachineDetailDialog({
  machine,
  onClose,
  onDelete,
  deleting,
}: {
  machine: Machine | null;
  onClose: () => void;
  onDelete: (machine: Machine) => void;
  deleting?: boolean;
}) {
  const { customers, service } = useStore();
  if (!machine) return null;
  const customer = customers.find((c) => c.id === machine.customerId);
  const tickets = service.filter((s) => s.machineId === machine.id);

  return (
    <Dialog open={!!machine} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(720px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="size-5 text-primary" />
            {machine.serialNumber}
          </DialogTitle>
          <DialogDescription>{machine.model} · {customer?.name ?? "—"}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Marka:</span> {machine.brand || "—"}</div>
          <div><span className="text-muted-foreground">Tip:</span> {machine.type || "—"}</div>
          <div><span className="text-muted-foreground">Kurulum:</span> {machine.installationDate || "—"}</div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Garanti bitiş:</span> {machine.warrantyEnd || "—"}
            <WarrantyBadge end={machine.warrantyEnd} />
          </div>
          <div><span className="text-muted-foreground">CNC:</span> {machine.controlUnit || "—"}</div>
          <div><span className="text-muted-foreground">CNC seri:</span> {machine.controlUnitSerial || "—"}</div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <StatusBadge status={machine.status} />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={deleting}
              onClick={() => onDelete(machine)}
            >
              <Trash2 className="size-4" /> Sil
            </Button>
            <CreateServiceRequestDialog
              defaultMachineId={machine.id}
              trigger={
                <Button size="sm" className="gap-1">
                  <Wrench className="size-4" /> Servis talebi aç
                </Button>
              }
            />
          </div>
        </div>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Servis geçmişi ({tickets.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tickets.length === 0 && (
              <p className="text-sm text-muted-foreground">Bu makine için servis kaydı yok.</p>
            )}
            {tickets.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <div>
                  <div>{t.issueType || "Servis"}</div>
                  <div className="text-xs text-muted-foreground">{t.createdAt}</div>
                </div>
                <StatusBadge status={t.stage} />
              </div>
            ))}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

export function MachinesPage() {
  const { machines, service, customers, refresh } = useStore();
  const [selected, setSelected] = useState<Machine | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";

  const deleteMachine = async (machine: Machine, event?: MouseEvent) => {
    event?.stopPropagation();
    const srCount = service.filter((s) => s.machineId === machine.id).length;
    const suffix = srCount > 0 ? ` Bu makineye bağlı ${srCount} servis kaydı kalacak, sadece makine kartı arşivlenecek.` : "";
    if (!window.confirm(`${machine.serialNumber} seri numaralı makineyi silmek istediğinize emin misiniz?${suffix}`)) return;
    setDeletingId(machine.id);
    try {
      await inventoryService.deleteCustomerDevice(machine.id);
      toast.success("Makine kaydı silindi");
      if (selected?.id === machine.id) setSelected(null);
      refresh();
    } catch (err: any) {
      toast.error("Makine silinemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setDeletingId(null);
    }
  };

  const warrantyStats = machines.reduce(
    (acc, m) => {
      acc[warrantyInfo(m.warrantyEnd).state] += 1;
      return acc;
    },
    { active: 0, expiring: 0, expired: 0, unknown: 0 } as Record<WarrantyState, number>,
  );

  return (
    <>
      {machines.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <WarrantyKpi label="Garanti aktif" value={warrantyStats.active} tone="active" />
          <WarrantyKpi label="Yaklaşıyor (≤60g)" value={warrantyStats.expiring} tone="expiring" />
          <WarrantyKpi label="Süresi doldu" value={warrantyStats.expired} tone="expired" />
          <WarrantyKpi label="Garanti bilgisi yok" value={warrantyStats.unknown} tone="unknown" />
        </div>
      )}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Makineler / Varlıklar</CardTitle>
            <CreateMachineDialog>
              <Button size="sm">Yeni Makine Ekle</Button>
            </CreateMachineDialog>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          {machines.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="size-12 rounded-full bg-muted grid place-items-center mb-3">
                <Cpu className="size-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium">Kayıtlı Makine Yok</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Şu anda sisteme kayıtlı bir makine bulunmuyor. Yeni bir makine/varlık ekleyerek servis süreçlerini başlatabilirsiniz.
              </p>
              <CreateMachineDialog>
                <Button className="mt-4">Yeni Makine Ekle</Button>
              </CreateMachineDialog>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seri No</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Kurulum</TableHead>
                  <TableHead>Garanti Bitiş</TableHead>
                  <TableHead>Servis Sayısı</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-20 text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {machines.map((m) => {
                  const srCount = service.filter((s) => s.machineId === m.id).length;
                  return (
                    <TableRow
                      key={m.id}
                      className="cursor-pointer hover:bg-muted/40"
                      tabIndex={0}
                      onClick={() => setSelected(m)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(m);
                        }
                      }}
                    >
                      <TableCell>{m.serialNumber}</TableCell>
                      <TableCell>{m.model}</TableCell>
                      <TableCell>{customerName(m.customerId)}</TableCell>
                      <TableCell className="text-muted-foreground">{m.installationDate}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground">{m.warrantyEnd || "—"}</span>
                          <WarrantyBadge end={m.warrantyEnd} />
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">{srCount}</TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Makine detayı"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(m);
                            }}
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-red-600"
                            aria-label="Makine sil"
                            disabled={deletingId === m.id}
                            onClick={(e) => deleteMachine(m, e)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
      <MachineDetailDialog machine={selected} onClose={() => setSelected(null)} onDelete={deleteMachine} deleting={!!selected && deletingId === selected.id} />
    </>
  );
}
