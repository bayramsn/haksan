import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";

import { CreateShipmentDialog } from "../../dialogs/CreateDialogs";
import { EmptyState } from "../../shared/EmptyState";
import { MiniKpi } from "../../shared/MiniKpi";
import { useStore } from "../../../lib/store";
import { SHIPMENT_STATUSES } from "../../../lib/mock";
import { serviceService } from "../../../../lib/services";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { PrintCargoLabelDialog, printCargoLabelForCustomer } from "../../dialogs/CargoLabelDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { printOrWarn } from "../../../lib/pageHelpers";
import { dispatchNoteDoc, printAssetBase } from "../../../lib/print";
import type { OperationFocus } from "../../../lib/operations";
import { Plus, Truck, ShieldCheck, CheckCircle2, MapPin, Printer, Play, Tag, Trash2, PackageCheck, Anchor, Clock3 } from "lucide-react";
import { toast } from "sonner";

export function ShipmentsPage({ focus }: { focus?: OperationFocus }) {
  const { shipments, startShipment, updateShipmentStatus, deleteShipment, cases, customers } = useStore();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<(typeof shipments)[number] | null>(null);
  const [directionFilter, setDirectionFilter] = useState<"all" | "incoming" | "outgoing">("all");
  const removeShipment = async (s: (typeof shipments)[number]) => {
    if (deletingId) return;
    setDeletingId(s.id);
    try {
      await deleteShipment(s.id);
      toast.success("Sevkiyat silindi");
      setPendingDelete(null);
    } catch (err: any) {
      toast.error("Sevkiyat silinemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setDeletingId(null);
    }
  };
  const [statusFilter, setStatusFilter] = useState<"all" | "Yolda" | "Gümrükte" | "Teslim Edildi">("all");
  const liveCustomerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const customerForShipment = (s: (typeof shipments)[number]) => {
    const sc = cases.find((x) => x.id === s.salesCaseId);
    return sc ? customers.find((c) => c.id === sc.customerId) : undefined;
  };
  const inTransit = shipments.filter((s) => s.status === "Yolda").length;
  const customs = shipments.filter((s) => s.status === "Gümrükte").length;
  const delivered = shipments.filter((s) => s.status === "Teslim Edildi").length;
  const focusedShipments =
    focus === "shipments" || focus === "pending"
      ? shipments.filter((s) => s.status !== "Teslim Edildi")
      : focus === "delivered"
      ? shipments.filter((s) => s.status === "Teslim Edildi")
      : shipments;
  const statusShipments = statusFilter === "all" ? focusedShipments : focusedShipments.filter((s) => s.status === statusFilter);
  const visibleShipments = directionFilter === "all" ? statusShipments : statusShipments.filter((s) => s.direction === directionFilter);
  // KPI kartı ikinci tıklamada filtreyi kaldırır.
  const toggleStatus = (status: Exclude<typeof statusFilter, "all">) =>
    setStatusFilter((current) => (current === status ? "all" : status));

  const carrierMap = Array.from(new Set(shipments.map((s) => s.carrier)))
    .map((c, i) => ({
      name: c,
      value: shipments.filter((s) => s.carrier === c).length,
      fill: ["var(--brand-blue)", "var(--brand-red)", "var(--info)", "var(--success)"][i % 4],
    }));

  const etaState = (eta?: string) => {
    if (!eta) return { label: "ETA yok", tone: "neutral" as const };
    const parsed = new Date(eta);
    if (Number.isNaN(parsed.getTime())) return { label: eta, tone: "neutral" as const };
    const days = Math.ceil((parsed.getTime() - Date.now()) / 86_400_000);
    if (days < 0) return { label: `${Math.abs(days)} gün gecikmiş`, tone: "danger" as const };
    if (days <= 3) return { label: days === 0 ? "Bugün" : `${days} gün kaldı`, tone: "warning" as const };
    return { label: `${days} gün kaldı`, tone: "success" as const };
  };

  const routeStep = (status: string) => status === "Teslim Edildi" ? 3 : status === "Gümrükte" ? 2 : status === "Yolda" ? 1 : 0;

  /** Sevkiyat detayını (satır kalemleri/seri no dahil) çekip HAKSAN antetli irsaliye basar. */
  const printDispatchNote = async (s: (typeof shipments)[number]) => {
    try {
      const full = await serviceService.shipment(s.id);
      const cust =
        customers.find((c) => c.id === full.companyId) ??
        customers.find((c) => c.id === cases.find((x) => x.id === s.salesCaseId)?.customerId);
      const adres = full.deliveryAddressSnapshot || (cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : undefined);
      const doc = dispatchNoteDoc(
        {
          irsaliyeNo: full.shipmentNo || full.trackingNo || s.trackingNo || String(full.id).slice(0, 8),
          tarih: full.shippedAt || full.createdAt,
          carrier: full.carrier ?? s.carrier,
          trackingNo: full.trackingNo ?? s.trackingNo,
          origin: full.origin ?? s.origin,
          destination: full.destination ?? s.destination,
          incoterm: full.incoterm ?? undefined,
          eta: full.eta ?? s.eta,
          firma: full.company?.legalTitle ?? full.company?.shortName ?? cust?.name,
          ilgili: cust?.contactPerson,
          adres,
          vergiDairesi: cust?.taxOffice,
          vergiNo: cust?.taxNumber,
          items: (full.items ?? []).map((it: any) => ({
            description: it.description,
            serialNumber: it.serialNumber ?? undefined,
            quantity: Number(it.quantity ?? 1),
            unit: it.unit?.code ?? it.unit?.name ?? undefined,
          })),
          notlar: full.notes ?? undefined,
        },
        printAssetBase()
      );
      printOrWarn(doc);
    } catch (err: any) {
      toast.error("İrsaliye hazırlanamadı", { description: err?.message ?? "Sevkiyat detayı alınamadı." });
    }
  };

  return (
    <div className="crm-page">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<Truck className="size-[18px]" />} label="Toplam Sevkiyat" value={shipments.length} sub="aktif izlenen" delta={4} onClick={() => setStatusFilter("all")} active={statusFilter === "all"} />
        <MiniKpi tone="blue" icon={<Truck className="size-[18px]" />} label="Yolda" value={inTransit} sub="taşıma sürüyor" delta={1} onClick={() => toggleStatus("Yolda")} active={statusFilter === "Yolda"} />
        <MiniKpi tone="amber" icon={<ShieldCheck className="size-[18px]" />} label="Gümrükte" value={customs} sub="işlem bekliyor" delta={0} onClick={() => toggleStatus("Gümrükte")} active={statusFilter === "Gümrükte"} />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Teslim Edilen" value={delivered} sub="bu ay" delta={5} onClick={() => toggleStatus("Teslim Edildi")} active={statusFilter === "Teslim Edildi"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4">
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-col items-stretch gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="tracking-tight">Sevkiyat Takibi</CardTitle>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <Select value={directionFilter} onValueChange={(value) => setDirectionFilter(value as typeof directionFilter)}>
                <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Yönler</SelectItem>
                  <SelectItem value="incoming">Gelen Sevkiyat</SelectItem>
                  <SelectItem value="outgoing">Giden Sevkiyat</SelectItem>
                </SelectContent>
              </Select>
              <PrintCargoLabelDialog />
              <ExportExcelButton path="/exports/shipments" filename="sevkiyatlar.xlsx" className="h-9" />
              <CreateShipmentDialog trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Sevkiyat</Button>} />
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
                  <TableHead>Takip</TableHead>
                  <TableHead>Yön</TableHead>
                  <TableHead>Firma</TableHead>
                  <TableHead>Rota / Yolculuk</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleShipments.map((s) => {
                  const sc = cases.find((x) => x.id === s.salesCaseId);
                  const customer = customerForShipment(s);
                  return (
                    <TableRow key={s.id} className="group hover:bg-primary/[0.025]">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                            <Truck className="size-4" />
                          </div>
                          <div>
                            <div className="text-sm leading-tight tabular-nums">{s.trackingNo}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{s.carrier}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.direction === "incoming" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-amber-200 bg-amber-50 text-amber-800"}>
                          {s.direction === "incoming" ? "↓ Gelen" : "↑ Giden"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{customer?.name ?? (s.direction === "incoming" ? s.senderCompanyName || s.senderName : undefined) ?? liveCustomerName(sc?.customerId ?? "")}</TableCell>
                      <TableCell className="min-w-[260px]">
                        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="size-3" /><span className="max-w-24 truncate">{s.origin}</span><span>→</span><span className="max-w-24 truncate">{s.destination}</span>
                        </div>
                        <div className="flex items-center" aria-label={`Sevkiyat aşaması: ${s.status}`}>
                          {["Hazır", "Yolda", "Gümrük", "Teslim"].map((label, index) => (
                            <div key={label} className="flex flex-1 items-center last:flex-none">
                              <span className={`grid size-5 shrink-0 place-items-center rounded-full border text-xs font-semibold ${index <= routeStep(s.status) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>{index + 1}</span>
                              {index < 3 && <span className={`h-px flex-1 ${index < routeStep(s.status) ? "bg-primary" : "bg-border"}`} />}
                            </div>
                          ))}
                        </div>
                        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground"><span>Hazır</span><span>Yolda</span><span>Gümrük</span><span>Teslim</span></div>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {(() => {
                          const eta = etaState(s.eta);
                          return <><div className="text-muted-foreground">{s.eta || "—"}</div><Badge variant="outline" className={`mt-1 h-5 text-xs ${eta.tone === "danger" ? "border-destructive/20 bg-destructive-soft text-destructive" : eta.tone === "warning" ? "border-warning/20 bg-warning-soft text-warning" : eta.tone === "success" ? "border-success/20 bg-success-soft text-success" : "text-muted-foreground"}`}>{eta.label}</Badge></>;
                        })()}
                      </TableCell>
                      <TableCell>
                        <Select value={s.status} onValueChange={async (v) => {
                          try {
                            if (v === "Yolda") {
                              await startShipment(s.id, s.loadingDate);
                            } else {
                              await updateShipmentStatus(s.id, v as any, {
                                destinationWarehouseId: v === "Teslim Edildi" ? s.destinationWarehouseId : undefined,
                                arrivedAt: v === "Teslim Edildi" ? new Date().toISOString() : undefined,
                              });
                            }
                            toast.success(`Sevkiyat durumu: ${v}`);
                          } catch (err: any) {
                            toast.error("Sevkiyat durumu güncellenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
                          }
                        }}>
                          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SHIPMENT_STATUSES.map((st) => <SelectItem key={st} value={st} className="text-xs">{st}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        {s.status === "Hazırlanıyor" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 opacity-0 group-hover:opacity-100 sm:opacity-100"
                            title="Sevkiyatı başlat"
                            disabled={startingId === s.id}
                            onClick={async () => {
                              setStartingId(s.id);
                              try {
                                await startShipment(s.id, s.loadingDate);
                                toast.success("Sevkiyat başlatıldı");
                              } catch (err: any) {
                                toast.error("Sevkiyat başlatılamadı", { description: err?.message ?? "Seri no seçimlerini kontrol edin." });
                              } finally {
                                setStartingId(null);
                              }
                            }}
                          >
                            <Play className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 opacity-0 group-hover:opacity-100 sm:opacity-100"
                          title="Kargo etiketi yazdır"
                          disabled={!customer}
                          onClick={() => {
                            if (!customer) {
                              toast.error("Kargo etiketi yazdırılamadı", { description: "Bu sevkiyat için müşteri bulunamadı." });
                              return;
                            }
                            printCargoLabelForCustomer(customer);
                          }}
                        >
                          <Tag className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100 sm:opacity-100" title="Sevk İrsaliyesi yazdır"
                          onClick={() => printDispatchNote(s)}>
                          <Printer className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive sm:opacity-100"
                          title="Sevkiyatı sil"
                          disabled={deletingId === s.id}
                          onClick={() => setPendingDelete(s)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {visibleShipments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState
                        scene="empty"
                        title="Henüz sevkiyat kaydı yok"
                        description="Yeni sevkiyat ekleyerek lojistik takibine başlayın."
                        action={<CreateShipmentDialog trigger={<Button size="sm" className="gap-1"><Plus className="size-4" /> Yeni Sevkiyat</Button>} />}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="self-start border-border/60 shadow-sm xl:sticky xl:top-3">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Lojistik Ağı</CardTitle>
            <p className="text-xs text-muted-foreground">Taşıyıcı ve aktif rota özeti</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {carrierMap.map((carrier) => {
              const share = shipments.length ? Math.round((carrier.value / shipments.length) * 100) : 0;
              return (
                <div key={carrier.name} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2"><span className="grid size-8 place-items-center rounded-md bg-brand-blue-soft font-data text-[10px] font-bold text-primary">{carrier.name?.slice(0, 2).toLocaleUpperCase("tr-TR") || "TR"}</span><span className="truncate text-xs font-medium">{carrier.name || "Taşıyıcı yok"}</span></div>
                    <span className="font-data text-xs font-semibold">{carrier.value}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-operation-blue" style={{ width: `${share}%` }} /></div>
                </div>
              );
            })}
            <div className="grid grid-cols-3 gap-1 pt-2 text-center">
              <div className="rounded-md bg-brand-blue-soft p-2"><Truck className="mx-auto size-4 text-primary" /><div className="mt-1 font-data text-xs font-semibold">{inTransit}</div><div className="text-[8px] uppercase text-muted-foreground">Yolda</div></div>
              <div className="rounded-md bg-warning-soft p-2"><Anchor className="mx-auto size-4 text-warning" /><div className="mt-1 font-data text-xs font-semibold">{customs}</div><div className="text-[8px] uppercase text-muted-foreground">Gümrük</div></div>
              <div className="rounded-md bg-success-soft p-2"><PackageCheck className="mx-auto size-4 text-success" /><div className="mt-1 font-data text-xs font-semibold">{delivered}</div><div className="text-[8px] uppercase text-muted-foreground">Teslim</div></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && !deletingId && setPendingDelete(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Sevkiyat kaydı silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-medium text-foreground">{pendingDelete?.trackingNo || "Sevkiyat"} · {pendingDelete?.carrier}</span>
              Rota ve takip kaydı listeden kaldırılır; stok veya satış kartı kayıtları silinmez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDelete && <div className="rounded-lg border border-destructive/15 bg-destructive-soft/50 p-3 text-xs"><div className="flex items-center gap-2 font-medium text-foreground"><MapPin className="size-4 text-destructive" />{pendingDelete.origin} → {pendingDelete.destination}</div><div className="mt-1 text-muted-foreground"><Clock3 className="mr-1 inline size-3" />ETA {pendingDelete.eta || "tanımlı değil"}</div></div>}
          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!!deletingId} onClick={(event) => { event.preventDefault(); if (pendingDelete) void removeShipment(pendingDelete); }}>{deletingId ? "Siliniyor…" : "Sevkiyatı Sil"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
