import { useMemo, useState, type MouseEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Badge } from "../../ui/badge";
import { StatusBadge } from "../../shared/StatusBadge";
import { CreateMachineDialog, CreateServiceRequestDialog } from "../../dialogs/CreateDialogs";
import { useStore } from "../../../lib/store";
import { inventoryService } from "../../../../lib/services";
import type { Machine } from "../../../lib/mock";
import { warrantyInfo, type WarrantyState } from "../../../lib/pageHelpers";
import { toast } from "sonner";
import { Eye, Wrench, Cpu, ShieldCheck, Trash2, Pencil, Search, CalendarDays, Building2, Activity, Plus, QrCode } from "lucide-react";
import { MachineQrDialog } from "../../dialogs/MachineQrDialog";
import { MaintenancePlanPanel } from "./MaintenancePlanPanel";
import { EmptyState } from "../../shared/EmptyState";
import { EntityVisual, InsightStat, RecordIdentity } from "../../shared/PremiumPrimitives";
import { ViewToggle, type ListView } from "../../ui/list-controls";
import { usePersistentState } from "../../../lib/persist";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { RemoteCompanyCombobox } from "../../shared/RemoteCompanyCombobox";
import { useCompanyDetail } from "../../../lib/companyServerData";

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

const formatMachinePrice = (machine: Machine) =>
  machine.cashPrice == null
    ? "—"
    : `${machine.cashPrice.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${machine.currency ?? "USD"}`;

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
};

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
  const { customers, service, products } = useStore();
  const userCompanyId = machine?.userCompanyId ?? machine?.customerId;
  const initialCustomerId = machine?.initialCustomerId ?? machine?.customerId;
  const storedUserCompany = customers.find((c) => c.id === userCompanyId);
  const storedInitialCustomer = customers.find((c) => c.id === initialCustomerId);
  const userCompanyQuery = useCompanyDetail(userCompanyId, storedUserCompany);
  const initialCustomerQuery = useCompanyDetail(initialCustomerId, storedInitialCustomer);
  if (!machine) return null;
  const userCompany = userCompanyQuery.data ?? storedUserCompany;
  const initialCustomer = initialCustomerQuery.data ?? storedInitialCustomer;
  const tickets = service.filter((s) => s.machineId === machine.id);
  const product = products.find((item) => item.id === machine.productModelId)
    ?? products.find((item) => item.model.toLocaleLowerCase("tr-TR") === machine.model.toLocaleLowerCase("tr-TR"));
  const warranty = warrantyInfo(machine.warrantyEnd);

  return (
    <Dialog open={!!machine} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(940px,calc(100vw-1rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{machine.brand ? `${machine.brand} ${machine.model}` : machine.model}</DialogTitle>
          <DialogDescription className="font-data">Seri no · {machine.serialNumber}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <EntityVisual
            imageUrl={product?.imageUrl}
            title={`${machine.brand ?? ""} ${machine.model}`.trim()}
            overline={machine.type || "Kurulu makine"}
            icon={<Cpu className="size-7" />}
            size="lg"
            className="h-56"
          />
          <div className="min-w-0 space-y-4">
            <div className="premium-blueprint grid grid-cols-2 gap-4 rounded-xl border border-border/70 p-4 sm:grid-cols-4">
              <InsightStat label="Durum" value={<StatusBadge status={machine.status} />} icon={<Activity className="size-3.5" />} />
              <InsightStat label="Garanti" value={warrantyShortLabel(warranty)} detail={formatDate(machine.warrantyEnd)} icon={<ShieldCheck className="size-3.5" />} tone={warranty.state === "expired" ? "danger" : warranty.state === "expiring" ? "warning" : "success"} />
              <InsightStat label="Servis" value={tickets.length} detail="toplam kayıt" icon={<Wrench className="size-3.5" />} />
              <InsightStat label="Kurulum" value={formatDate(machine.installationDate)} icon={<CalendarDays className="size-3.5" />} />
            </div>
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 rounded-xl border border-border/70 bg-muted/15 p-4 text-[13px] sm:grid-cols-2">
              <DetailValue label="Kullanıcı firma" value={userCompany?.name} />
              <DetailValue label="İlk müşteri" value={initialCustomer?.name} />
              <DetailValue label="Makine tipi" value={machine.type} />
              <DetailValue label="Peşin fiyat" value={formatMachinePrice(machine)} data />
              <DetailValue label="Kontrol paneli" value={machine.controlUnit} />
              <DetailValue label="Kontrol paneli seri no" value={machine.controlUnitSerial} data />
            </div>
          </div>
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
        <MaintenancePlanPanel customerDeviceId={machine.id} />
        <Card className="overflow-hidden border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Servis geçmişi ({tickets.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tickets.length === 0 && (
              <EmptyState compact eyebrow="Servis geçmişi" scene="machines" title="Henüz servis kaydı yok" description="Bu makine için açılan servis talepleri burada zaman sırasıyla görünecek." />
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
  const { machines, service, customers, products, refresh, updateMachineCustomer } = useStore();
  const [selected, setSelected] = useState<Machine | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingCustomerMachine, setEditingCustomerMachine] = useState<Machine | null>(null);
  const [editCustomerId, setEditCustomerId] = useState("");
  const [updatingCustomer, setUpdatingCustomer] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Machine | null>(null);
  const [qrMachine, setQrMachine] = useState<Machine | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = usePersistentState<ListView>("machines.view", "cards");
  const editingInitialCompanyId = editingCustomerMachine?.initialCustomerId ?? editingCustomerMachine?.customerId;
  const storedEditingInitialCompany = customers.find((customer) => customer.id === editingInitialCompanyId);
  const editingInitialCompanyQuery = useCompanyDetail(editingInitialCompanyId, storedEditingInitialCompany);
  const qrCompanyId = qrMachine?.userCompanyId ?? qrMachine?.customerId;
  const storedQrCompany = customers.find((customer) => customer.id === qrCompanyId);
  const qrCompanyQuery = useCompanyDetail(qrCompanyId, storedQrCompany);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const openCustomerEdit = (machine: Machine, event?: MouseEvent) => {
    event?.stopPropagation();
    setEditingCustomerMachine(machine);
    setEditCustomerId(machine.userCompanyId ?? machine.customerId);
  };

  const requestDeleteMachine = (machine: Machine, event?: MouseEvent) => {
    event?.stopPropagation();
    setPendingDelete(machine);
  };

  const deleteMachine = async (machine: Machine) => {
    setDeletingId(machine.id);
    try {
      await inventoryService.deleteCustomerDevice(machine.id);
      toast.success("Makine kaydı silindi");
      setPendingDelete(null);
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
  const filteredMachines = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return machines;
    return machines.filter((machine) => {
      const userCompany = customerName(machine.userCompanyId ?? machine.customerId);
      return [machine.brand, machine.model, machine.serialNumber, machine.controlUnit, machine.controlUnitSerial, userCompany]
        .some((value) => (value ?? "").toLocaleLowerCase("tr-TR").includes(needle));
    });
  }, [customers, machines, query]);
  const productForMachine = (machine: Machine) => products.find((item) => item.id === machine.productModelId)
    ?? products.find((item) => item.model.toLocaleLowerCase("tr-TR") === machine.model.toLocaleLowerCase("tr-TR"));

  return (
    <>
      {machines.length > 0 && (
        <Card className="premium-blueprint mb-4 overflow-hidden border-border/75">
          <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
            <InsightStat label="Garanti aktif" value={warrantyStats.active} detail="koruma altında" icon={<ShieldCheck className="size-3.5" />} tone="success" />
            <InsightStat label="Yaklaşıyor" value={warrantyStats.expiring} detail="60 gün içinde" icon={<ShieldCheck className="size-3.5" />} tone="warning" />
            <InsightStat label="Süresi doldu" value={warrantyStats.expired} detail="aksiyon gerekli" icon={<ShieldCheck className="size-3.5" />} tone="danger" />
            <InsightStat label="Bilgi yok" value={warrantyStats.unknown} detail="kontrol edilmeli" icon={<ShieldCheck className="size-3.5" />} />
          </CardContent>
        </Card>
      )}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="font-data text-[9px] font-semibold uppercase tracking-[0.15em] text-operation-blue">Kurulu varlık merkezi</div>
              <CardTitle className="mt-1 font-display text-xl">Makineler / Varlıklar</CardTitle>
              <p className="mt-1 text-[12px] text-muted-foreground">Makine kimliği, garanti, kullanıcı firma ve servis geçmişi aynı bağlamda.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1 lg:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Model, seri no veya firma ara..." className="h-9 bg-white pl-9" />
              </div>
              <ViewToggle view={view} onChange={setView} />
            <CreateMachineDialog>
                <Button size="sm" className="h-9"><Plus className="size-4" /> Yeni Makine</Button>
            </CreateMachineDialog>
            </div>
          </div>
        </CardHeader>
        <div className={view === "cards" ? "p-4" : "overflow-x-auto"}>
          {machines.length === 0 ? (
            <EmptyState
              scene="machines"
              title="Kayıtlı makine yok"
              description="Yeni bir makine/varlık ekleyerek garanti ve servis süreçlerini tek kayıttan izleyin."
              action={<CreateMachineDialog><Button><Plus className="size-4" /> Yeni Makine</Button></CreateMachineDialog>}
            />
          ) : filteredMachines.length === 0 ? (
            <EmptyState scene="search" eyebrow="Arama sonucu" title="Eşleşen makine bulunamadı" description="Model, seri numarası veya firma bilgisini değiştirerek tekrar deneyin." />
          ) : view === "cards" ? (
            <div className="surface-enter grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredMachines.map((machine) => {
                const srCount = service.filter((item) => item.machineId === machine.id).length;
                const product = productForMachine(machine);
                return (
                  <article
                    key={machine.id}
                    tabIndex={0}
                    role="button"
                    className="group overflow-hidden rounded-xl border border-border/75 bg-white shadow-sm transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    onClick={() => setSelected(machine)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(machine); }
                    }}
                  >
                    <EntityVisual imageUrl={product?.imageUrl} title={machine.model} overline={machine.type || "Kurulu makine"} icon={<Cpu className="size-7" />} size="lg" className="m-3 mb-0 h-36 w-auto" />
                    <div className="space-y-3 p-4">
                      <div className="min-w-0">
                        <div className="font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-operation-blue">{machine.brand || "Makine"}</div>
                        <h3 className="mt-1 truncate font-display text-xl font-semibold leading-none">{machine.model}</h3>
                        <div className="mt-1 font-data text-[10px] text-muted-foreground">SN · {machine.serialNumber}</div>
                      </div>
                      <div className="flex items-center gap-2 border-y border-border/60 py-2.5">
                        <div className="grid size-8 place-items-center rounded-lg bg-brand-blue-soft text-primary"><Building2 className="size-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-medium">{customerName(machine.userCompanyId ?? machine.customerId)}</div>
                          <div className="text-[10px] text-muted-foreground">Kullanıcı firma</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <WarrantyBadge end={machine.warrantyEnd} />
                        <Badge variant="secondary" className="h-5 gap-1 text-[9px]"><Wrench className="size-3" /> {srCount} servis</Badge>
                        <StatusBadge status={machine.status} />
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[10px] text-muted-foreground">Kurulum · {formatDate(machine.installationDate)}</span>
                        <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <Button variant="ghost" size="icon" className="size-8" aria-label="QR etiket" onClick={(event) => { event.stopPropagation(); setQrMachine(machine); }}><QrCode className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8" aria-label="Kullanıcı firma düzenle" onClick={(event) => openCustomerEdit(machine, event)}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive-soft hover:text-destructive" aria-label="Makine sil" onClick={(event) => requestDeleteMachine(machine, event)}><Trash2 className="size-4" /></Button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[280px]">Makine</TableHead>
                  <TableHead>Kullanıcı Firma</TableHead>
                  <TableHead>İlk Müşteri</TableHead>
                  <TableHead>Kontrol Paneli</TableHead>
                  <TableHead>Peşin Fiyat</TableHead>
                  <TableHead>Kurulum</TableHead>
                  <TableHead>Garanti</TableHead>
                  <TableHead>Servis Sayısı</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-28 text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMachines.map((m) => {
                  const srCount = service.filter((s) => s.machineId === m.id).length;
                  const product = productForMachine(m);
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
                      <TableCell>
                        <RecordIdentity
                          visual={<EntityVisual imageUrl={product?.imageUrl} title={m.model} icon={<Cpu className="size-4" />} size="sm" />}
                          eyebrow={m.brand || "Makine"}
                          title={m.model}
                          description={<span className="font-data">SN · {m.serialNumber}</span>}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{customerName(m.userCompanyId ?? m.customerId)}</TableCell>
                      <TableCell className="text-muted-foreground">{customerName(m.initialCustomerId ?? m.customerId)}</TableCell>
                      <TableCell className="text-muted-foreground">{m.controlUnit || "—"}</TableCell>
                      <TableCell className="tabular-nums">{formatMachinePrice(m)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(m.installationDate)}</TableCell>
                      <TableCell><WarrantyBadge end={m.warrantyEnd} /></TableCell>
                      <TableCell className="tabular-nums">{srCount}</TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="QR etiket"
                            onClick={(e) => { e.stopPropagation(); setQrMachine(m); }}
                          >
                            <QrCode className="size-4" />
                          </Button>
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
                            onClick={(e) => requestDeleteMachine(m, e)}
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
        onDelete={requestDeleteMachine}
        onEditCustomer={openCustomerEdit}
        deleting={!!selected && deletingId === selected.id}
      />
      <MachineQrDialog
        machine={qrMachine}
        customerName={qrMachine ? (qrCompanyQuery.data ?? storedQrCompany)?.name ?? "—" : ""}
        onClose={() => setQrMachine(null)}
      />
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && !deletingId && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Makine kaydını arşivle?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{pendingDelete?.model}</b> · <span className="font-data">{pendingDelete?.serialNumber}</span> makine kartı arşivlenecek.
              {pendingDelete && service.filter((item) => item.machineId === pendingDelete.id).length > 0
                ? ` Bağlı ${service.filter((item) => item.machineId === pendingDelete.id).length} servis kaydı korunacak.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={!pendingDelete || !!deletingId}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) void deleteMachine(pendingDelete);
              }}
            >
              {deletingId ? "Arşivleniyor..." : "Makineyi arşivle"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              {editingCustomerMachine ? (editingInitialCompanyQuery.data ?? storedEditingInitialCompany)?.name ?? "—" : "—"}
            </div>
            <RemoteCompanyCombobox
              value={editCustomerId}
              onValueChange={setEditCustomerId}
              placeholder="Kullanıcı firma seçin"
            />
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

function DetailValue({ label, value, data = false }: { label: string; value?: string | null; data?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate text-[12px] font-medium text-foreground ${data ? "font-data" : ""}`}>{value || "—"}</div>
    </div>
  );
}
