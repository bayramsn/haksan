import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { CreateDeliveryDialog, DeliveryFormFields, deliveryFormToPayload, deliveryToFormState, type DeliveryFormState } from "../../dialogs/CreateDialogs";
import { EmptyState } from "../../shared/EmptyState";
import { MiniKpi } from "../../shared/MiniKpi";
import { EntityVisual } from "../../shared/PremiumPrimitives";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { useStore } from "../../../lib/store";
import { DELIVERY_STATUSES, type Delivery } from "../../../lib/mock";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { printOrWarn } from "../../../lib/pageHelpers";
import { resolveServiceFormNo } from "../../../lib/serviceFormNo";
import { installationFormDoc, printAssetBase, trShortDate } from "../../../lib/print";
import { Plus, ClipboardCheck, CheckCircle2, Clock, Building2, FileSignature, Printer, Trash2, Cpu, CalendarClock, Signature } from "lucide-react";
import { toast } from "sonner";

export function DeliveriesPage() {
  const { deliveries, updateDeliveryStatus, deleteDelivery, customers, machines, products } = useStore();
  const liveCustomerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const [selectedDelivery, setSelectedDelivery] = useState<(typeof deliveries)[number] | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "Tamamlandı" | "Bekliyor">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<(typeof deliveries)[number] | null>(null);
  const removeDelivery = async (d: (typeof deliveries)[number]) => {
    if (deletingId) return;
    setDeletingId(d.id);
    try {
      await deleteDelivery(d.id);
      toast.success("Teslimat silindi");
      setPendingDelete(null);
    } catch (err: any) {
      toast.error("Teslimat silinemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setDeletingId(null);
    }
  };
  const completed = deliveries.filter((d) => d.status === "Tamamlandı").length;
  const pending = deliveries.filter((d) => d.status === "Bekliyor").length;
  const visibleDeliveries = statusFilter === "all" ? deliveries : deliveries.filter((d) => d.status === statusFilter);
  // KPI kartı ikinci tıklamada filtreyi kaldırır.
  const toggleStatus = (status: Exclude<typeof statusFilter, "all">) =>
    setStatusFilter((current) => (current === status ? "all" : status));
  const deliveryMachine = (delivery: (typeof deliveries)[number]) =>
    machines.find((machine) => machine.id === delivery.formData?.machineId) ?? machines.find((machine) => machine.salesCaseId === delivery.salesCaseId);
  const deliveryProduct = (delivery: (typeof deliveries)[number]) => {
    const machine = deliveryMachine(delivery);
    return products.find((product) => product.id === machine?.productModelId);
  };
  const upcoming = [...deliveries]
    .filter((delivery) => delivery.status === "Bekliyor")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 4);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MiniKpi tone="violet" icon={<ClipboardCheck className="size-[18px]" />} label="Toplam Teslimat" value={deliveries.length} sub="kayıt" delta={3} onClick={() => setStatusFilter("all")} active={statusFilter === "all"} />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Tamamlandı" value={completed} sub="imzalı" delta={2} onClick={() => toggleStatus("Tamamlandı")} active={statusFilter === "Tamamlandı"} />
        <MiniKpi tone="amber" icon={<Clock className="size-[18px]" />} label="Bekleyen" value={pending} sub="imza bekliyor" delta={1} onClick={() => toggleStatus("Bekliyor")} active={statusFilter === "Bekliyor"} />
      </div>

      {upcoming.length > 0 && (
        <div className="premium-blueprint precision-corners rounded-xl border border-primary/10 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><div className="font-data text-[9px] font-semibold uppercase tracking-[0.15em] text-operation-blue">Yaklaşan teslim rotası</div><div className="mt-1 text-xs text-muted-foreground">İmza ve form hazırlığı gereken sıradaki kayıtlar</div></div>
            <Badge variant="outline" className="bg-warning-soft text-warning">{pending} bekleyen</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {upcoming.map((delivery, index) => {
              const machine = deliveryMachine(delivery);
              return (
                <button key={delivery.id} type="button" onClick={() => setSelectedDelivery(delivery)} className="group flex items-center gap-3 rounded-lg border border-border/60 bg-white p-3 text-left transition-colors hover:border-primary/30 hover:bg-brand-blue-soft/30">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-primary/15 bg-brand-blue-soft font-data text-[10px] font-bold text-primary">{index + 1}</span>
                  <span className="min-w-0"><span className="block truncate text-xs font-semibold">{machine ? `${machine.brand || ""} ${machine.model}`.trim() : liveCustomerName(delivery.customerId)}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{delivery.date} · {delivery.signedBy && delivery.signedBy !== "—" ? delivery.signedBy : "İmza bekliyor"}</span></span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="tracking-tight">Teslimat Kayıtları</CardTitle>
          <div className="flex items-center gap-2">
            <ExportExcelButton path="/exports/deliveries" filename="teslimatlar.xlsx" className="h-9" />
            <CreateDeliveryDialog trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Teslimat</Button>} />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
                <TableHead>Makine / Müşteri</TableHead>
                <TableHead>Teslim Tarihi</TableHead>
                <TableHead>Milestone</TableHead>
                <TableHead>Form / İmza</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleDeliveries.map((d) => {
                const machine = deliveryMachine(d);
                const product = deliveryProduct(d);
                const signed = Boolean(d.signedBy && d.signedBy !== "—");
                const formReady = Boolean(d.formData?.formNo || d.formData?.tezgah?.model || machine);
                const completedStep = d.status === "Tamamlandı" ? 3 : signed ? 2 : formReady ? 1 : 0;
                return (
                <TableRow key={d.id} className="group hover:bg-primary/[0.025]">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <EntityVisual size="sm" title={machine?.model || liveCustomerName(d.customerId)} imageUrl={product?.imageUrl} icon={<Cpu className="size-4" />} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{machine ? `${machine.brand || ""} ${machine.model}`.trim() : d.formData?.tezgah?.model || "Teslimat kaydı"}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Building2 className="size-3" /><span className="truncate">{liveCustomerName(d.customerId)}</span>{machine?.serialNumber && <span className="font-data">· {machine.serialNumber}</span>}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground"><div className="flex items-center gap-1.5"><CalendarClock className="size-3.5" />{d.date}</div></TableCell>
                  <TableCell className="min-w-[220px]">
                    <div className="flex items-center" aria-label={`Teslimat yolculuğu: ${completedStep}/3`}>
                      {["Form", "İmza", "Teslim"].map((label, index) => (
                        <div key={label} className="flex flex-1 items-center last:flex-none"><span className={`grid size-5 place-items-center rounded-full border text-[8px] font-bold ${index < completedStep ? "border-success bg-success text-white" : index === completedStep && completedStep < 3 ? "border-primary bg-brand-blue-soft text-primary" : "border-border bg-white text-muted-foreground"}`}>{index < completedStep ? "✓" : index + 1}</span>{index < 2 && <span className={`h-px flex-1 ${index + 1 < completedStep ? "bg-success" : "bg-border"}`} />}</div>
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-[8px] uppercase tracking-wide text-muted-foreground"><span>Form</span><span>İmza</span><span>Teslim</span></div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className={`h-5 w-fit text-[9px] ${formReady ? "border-success/20 bg-success-soft text-success" : "border-warning/20 bg-warning-soft text-warning"}`}><FileSignature className="mr-1 size-3" />{formReady ? "Form hazır" : "Form bekliyor"}</Badge>
                      <span className={`inline-flex items-center gap-1 text-[10px] ${signed ? "text-success" : "text-muted-foreground"}`}><Signature className="size-3" />{signed ? d.signedBy : "İmza bekliyor"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={d.status}
                      onValueChange={(v) => {
                        updateDeliveryStatus(d.id, v as any)
                          .then(() => toast.success(`Teslimat durumu: ${v}`))
                          .catch((err: any) => toast.error("Teslimat durumu güncellenemedi", { description: err?.message ?? "Backend isteği başarısız oldu." }));
                      }}
                    >
                      <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DELIVERY_STATUSES.map((st) => <SelectItem key={st} value={st} className="text-xs">{st}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="size-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" title="Teslim formu / düzenle"
                      onClick={() => setSelectedDelivery(d)}>
                      <FileSignature className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                      title="Teslimatı sil"
                      disabled={deletingId === d.id}
                      onClick={() => setPendingDelete(d)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );})}
              {visibleDeliveries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      scene="empty"
                      title="Henüz teslimat kaydı yok"
                      description="Müşteri teslim formu oluşturarak imza sürecini başlatın."
                      action={<CreateDeliveryDialog trigger={<Button size="sm" className="gap-1"><Plus className="size-4" /> Yeni Teslimat</Button>} />}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <DeliveryDetailDialog
        delivery={selectedDelivery}
        customerName={liveCustomerName}
        onClose={() => setSelectedDelivery(null)}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && !deletingId && setPendingDelete(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader><AlertDialogTitle>Teslimat kaydı silinsin mi?</AlertDialogTitle><AlertDialogDescription><span className="block font-medium text-foreground">{pendingDelete ? liveCustomerName(pendingDelete.customerId) : "Teslimat"}</span>Teslim milestone’u, form bağlantısı ve imza bilgisi listeden kaldırılır. Makine ve müşteri kayıtları korunur.</AlertDialogDescription></AlertDialogHeader>
          {pendingDelete && <div className="rounded-lg border border-destructive/15 bg-destructive-soft/50 p-3 text-xs"><div className="font-medium text-foreground">{deliveryMachine(pendingDelete)?.model || pendingDelete.formData?.tezgah?.model || "Makine bilgisi yok"}</div><div className="mt-1 text-muted-foreground">{pendingDelete.date} · {pendingDelete.signedBy || "İmza yok"}</div></div>}
          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!!deletingId} onClick={(event) => { event.preventDefault(); if (pendingDelete) void removeDelivery(pendingDelete); }}>{deletingId ? "Siliniyor…" : "Teslimatı Sil"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function DeliveryDetailDialog({
  delivery,
  customerName,
  onClose,
}: {
  delivery: Delivery | null;
  customerName: (id: string) => string;
  onClose: () => void;
}) {
  const { customers, cases, machines, deliveries, updateDelivery } = useStore();
  const [form, setForm] = useState<DeliveryFormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!delivery) {
      setForm(null);
      return;
    }
    const cust = customers.find((c) => c.id === delivery.customerId);
    setForm(deliveryToFormState(delivery, cust?.contactPerson));
  }, [delivery, customers]);

  const casesForCustomer = cases.filter((c) => c.customerId === form?.customerId);
  const machinesForCustomer = machines.filter((m) => m.customerId === form?.customerId);

  const save = async () => {
    if (!delivery || !form) return;
    setSaving(true);
    try {
      await updateDelivery(delivery.id, {
        customerId: form.customerId,
        salesCaseId: form.salesCaseId,
        date: form.date,
        signedBy: form.signedBy.trim() || "—",
        status: form.status,
        formData: deliveryFormToPayload(form),
      });
      toast.success("Teslimat güncellendi");
    } catch (err: any) {
      toast.error("Kaydedilemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  /** DR.MAK Kurulum Tutanağı — PDF şablonu ile aynı düzen. */
  const printForm = () => {
    if (!delivery || !form) return;
    const cust = customers.find((c) => c.id === form.customerId);
    const fd = deliveryFormToPayload(form);
    const formNo = resolveServiceFormNo({
      currentFormNo: fd.formNo,
      salesCaseId: delivery.salesCaseId,
      machineId: fd.machineId,
      fallbackId: delivery.id,
    });
    const doc = installationFormDoc(
      {
        teslimTarihi: form.date ? trShortDate(form.date) : "",
        kurulumTarihi: form.kurulumTarihi ? trShortDate(form.kurulumTarihi) : "",
        formNo,
        tezgah: fd.tezgah,
        cnc: fd.cnc,
        firma: cust?.name ?? customerName(form.customerId),
        ilgili: form.ilgili || cust?.contactPerson,
        adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : undefined,
        telefon: cust?.phone,
        faks: cust?.fax,
        gsm: cust?.phone2,
        eposta: cust?.email,
        kurulumuYapan: form.kurulumuYapan || undefined,
        teslimAlan: form.signedBy && form.signedBy !== "—" ? form.signedBy : undefined,
      },
      printAssetBase()
    );
    printOrWarn(doc);
  };

  return (
    <Dialog open={!!delivery} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(760px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        {delivery && form && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" /> Kurulum Tutanağı</DialogTitle>
              <DialogDescription>{customerName(delivery.customerId)}</DialogDescription>
            </DialogHeader>
            <DeliveryFormFields
              form={form}
              setForm={(update) =>
                setForm((prev) =>
                  prev == null ? prev : typeof update === "function" ? (update as (p: DeliveryFormState) => DeliveryFormState)(prev) : update
                )
              }
              customers={customers}
              casesForCustomer={casesForCustomer}
              machinesForCustomer={machinesForCustomer}
              relatedDeliveries={deliveries}
            />
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" className="gap-1" onClick={printForm}><Printer className="size-4" /> Formu Yazdır</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Kapat</Button>
                <Button onClick={save} disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
