import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";

import { CreateShipmentDialog } from "../../dialogs/CreateDialogs";
import { EmptyState } from "../../shared/EmptyState";
import { MiniKpi } from "../../shared/MiniKpi";
import { useStore } from "../../../lib/store";
import { SHIPMENT_STATUSES } from "../../../lib/mock";
import { serviceService } from "../../../../lib/services";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { PrintCargoLabelDialog, printCargoLabelForCustomer } from "../../dialogs/CargoLabelDialog";
import { printOrWarn } from "../../../lib/pageHelpers";
import { dispatchNoteDoc, printAssetBase } from "../../../lib/print";
import type { OperationFocus } from "../../../lib/operations";
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from "recharts";
import { Plus, Truck, ShieldCheck, CheckCircle2, MapPin, Printer, Play, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ShipmentsPage({ focus }: { focus?: OperationFocus }) {
  const { shipments, startShipment, updateShipmentStatus, deleteShipment, cases, customers } = useStore();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const removeShipment = async (s: (typeof shipments)[number]) => {
    if (deletingId) return;
    if (!window.confirm(`${s.trackingNo || "Sevkiyat"} kaydını silmek istediğinize emin misiniz?`)) return;
    setDeletingId(s.id);
    try {
      await deleteShipment(s.id);
      toast.success("Sevkiyat silindi");
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
  const visibleShipments =
    statusFilter === "all" ? focusedShipments : focusedShipments.filter((s) => s.status === statusFilter);
  // KPI kartı ikinci tıklamada filtreyi kaldırır.
  const toggleStatus = (status: Exclude<typeof statusFilter, "all">) =>
    setStatusFilter((current) => (current === status ? "all" : status));

  const carrierMap = Array.from(new Set(shipments.map((s) => s.carrier)))
    .map((c, i) => ({
      name: c,
      value: shipments.filter((s) => s.carrier === c).length,
      fill: ["var(--brand-blue)", "var(--brand-red)", "var(--info)", "var(--success)"][i % 4],
    }));

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
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<Truck className="size-[18px]" />} label="Toplam Sevkiyat" value={shipments.length} sub="aktif izlenen" delta={4} onClick={() => setStatusFilter("all")} active={statusFilter === "all"} />
        <MiniKpi tone="blue" icon={<Truck className="size-[18px]" />} label="Yolda" value={inTransit} sub="taşıma sürüyor" delta={1} onClick={() => toggleStatus("Yolda")} active={statusFilter === "Yolda"} />
        <MiniKpi tone="amber" icon={<ShieldCheck className="size-[18px]" />} label="Gümrükte" value={customs} sub="işlem bekliyor" delta={0} onClick={() => toggleStatus("Gümrükte")} active={statusFilter === "Gümrükte"} />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Teslim Edilen" value={delivered} sub="bu ay" delta={5} onClick={() => toggleStatus("Teslim Edildi")} active={statusFilter === "Teslim Edildi"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="tracking-tight">Sevkiyat Takibi</CardTitle>
            <div className="flex items-center gap-2">
              <PrintCargoLabelDialog />
              <ExportExcelButton path="/exports/shipments" filename="sevkiyatlar.xlsx" className="h-9" />
              <CreateShipmentDialog trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Sevkiyat</Button>} />
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
                  <TableHead>Takip</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Taşıyıcı</TableHead>
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
                            <div className="text-[11px] text-muted-foreground mt-0.5">{s.carrier}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{customer?.name ?? liveCustomerName(sc?.customerId ?? "")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                            <MapPin className="size-3" />{s.origin}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                            <MapPin className="size-3" />{s.destination}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{s.carrier}</TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">{s.eta}</TableCell>
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
                          onClick={() => removeShipment(s)}
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
                        icon={<Truck className="size-5" />}
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

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Taşıyıcı Dağılımı</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={carrierMap} dataKey="value" nameKey="name" outerRadius={75} innerRadius={45} paddingAngle={2} isAnimationActive={false}>
                  {carrierMap.map((d) => (
                    <Cell key={`cr-${d.name}`} fill={d.fill} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
