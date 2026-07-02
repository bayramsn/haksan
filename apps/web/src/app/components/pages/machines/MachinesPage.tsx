import { useState, type MouseEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Badge } from "../../ui/badge";
import { StatusBadge } from "../../Layout";
import { CreateMachineDialog, CreateServiceRequestDialog } from "../../dialogs/CreateDialogs";
import { useStore } from "../../../lib/store";
import { inventoryService } from "../../../../lib/services";
import type { Machine } from "../../../lib/mock";
import { warrantyInfo, type WarrantyState } from "../../../lib/pageHelpers";
import { toast } from "sonner";
import { Eye, Wrench, Cpu, ShieldCheck, Trash2, Pencil } from "lucide-react";

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
  onEditCustomer,
  deleting,
}: {
  machine: Machine | null;
  onClose: () => void;
  onDelete: (machine: Machine) => void;
  onEditCustomer: (machine: Machine) => void;
  deleting?: boolean;
}) {
  const { customers, service } = useStore();
  if (!machine) return null;
  const userCompany = customers.find((c) => c.id === (machine.userCompanyId ?? machine.customerId));
  const initialCustomer = customers.find((c) => c.id === (machine.initialCustomerId ?? machine.customerId));
  const tickets = service.filter((s) => s.machineId === machine.id);

  return (
    <Dialog open={!!machine} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(720px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="size-5 text-primary" />
            {machine.serialNumber}
          </DialogTitle>
          <DialogDescription>{machine.model} · {userCompany?.name ?? "—"}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Kullanıcı firma:</span> {userCompany?.name ?? "—"}</div>
          <div><span className="text-muted-foreground">İlk müşteri:</span> {initialCustomer?.name ?? "—"}</div>
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
              className="gap-1"
              onClick={() => onEditCustomer(machine)}
            >
              <Pencil className="size-4" /> Kullanıcı firma
            </Button>
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
  const { machines, service, customers, refresh, updateMachineCustomer } = useStore();
  const [selected, setSelected] = useState<Machine | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingCustomerMachine, setEditingCustomerMachine] = useState<Machine | null>(null);
  const [editCustomerId, setEditCustomerId] = useState("");
  const [updatingCustomer, setUpdatingCustomer] = useState(false);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const openCustomerEdit = (machine: Machine, event?: MouseEvent) => {
    event?.stopPropagation();
    setEditingCustomerMachine(machine);
    setEditCustomerId(machine.userCompanyId ?? machine.customerId);
  };

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

  const saveCustomerEdit = async () => {
    if (!editingCustomerMachine || !editCustomerId) return;
    setUpdatingCustomer(true);
    try {
      await updateMachineCustomer(editingCustomerMachine.id, editCustomerId);
      toast.success("Kullanıcı firma güncellendi");
      setEditingCustomerMachine(null);
      setSelected((current) => current?.id === editingCustomerMachine.id ? { ...current, customerId: editCustomerId, userCompanyId: editCustomerId } : current);
    } catch (err: any) {
      toast.error("Kullanıcı firma güncellenemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setUpdatingCustomer(false);
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
                  <TableHead>Firma</TableHead>
                  <TableHead>İlk Müşteri</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Seri No</TableHead>
                  <TableHead>Kontrol Paneli</TableHead>
                  <TableHead>Kontrol Paneli Seri No</TableHead>
                  <TableHead>Kurulum</TableHead>
                  <TableHead>Servis Sayısı</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-28 text-right">İşlem</TableHead>
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
                      <TableCell className="font-medium">{customerName(m.userCompanyId ?? m.customerId)}</TableCell>
                      <TableCell className="text-muted-foreground">{customerName(m.initialCustomerId ?? m.customerId)}</TableCell>
                      <TableCell>{m.model}</TableCell>
                      <TableCell className="tabular-nums">{m.serialNumber}</TableCell>
                      <TableCell className="text-muted-foreground">{m.controlUnit || "—"}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{m.controlUnitSerial || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{m.installationDate}</TableCell>
                      <TableCell className="tabular-nums">{srCount}</TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Kullanıcı firma düzenle"
                            onClick={(e) => openCustomerEdit(m, e)}
                          >
                            <Pencil className="size-4" />
                          </Button>
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
      <MachineDetailDialog
        machine={selected}
        onClose={() => setSelected(null)}
        onDelete={deleteMachine}
        onEditCustomer={openCustomerEdit}
        deleting={!!selected && deletingId === selected.id}
      />
      <Dialog open={!!editingCustomerMachine} onOpenChange={(open) => !open && setEditingCustomerMachine(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kullanıcı Firma</DialogTitle>
            <DialogDescription>
              İlk müşteri korunur; sadece cihazı bugün kullanan firma değiştirilir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
              <span className="text-muted-foreground">İlk müşteri:</span>{" "}
              {editingCustomerMachine ? customerName(editingCustomerMachine.initialCustomerId ?? editingCustomerMachine.customerId) : "—"}
            </div>
            <Select value={editCustomerId} onValueChange={setEditCustomerId}>
              <SelectTrigger><SelectValue placeholder="Kullanıcı firma seçin" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCustomerMachine(null)} disabled={updatingCustomer}>Vazgeç</Button>
            <Button onClick={saveCustomerEdit} disabled={!editCustomerId || updatingCustomer}>
              {updatingCustomer ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
