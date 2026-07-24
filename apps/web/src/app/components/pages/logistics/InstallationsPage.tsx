import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import { StatusBadge } from "../../Layout";
import { CreateInstallationDialog } from "../../dialogs/CreateDialogs";
import { DeliveryDetailDialog } from "./DeliveriesPage";
import { MiniKpi } from "../../shared/MiniKpi";
import { EntityVisual } from "../../shared/PremiumPrimitives";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { useStore } from "../../../lib/store";
import { serviceService } from "../../../../lib/services";
import {
  INSTALLATION_FORM_DEFAULT_CHECKS,
  INSTALLATION_LOCATION_LABELS,
  formatDuration,
  type InstallationCheckStatus,
  type InstallationLocationType,
} from "@haksan/shared";
import { printOrWarn } from "../../../lib/pageHelpers";
import { installationFormDoc, printAssetBase, trShortDate } from "../../../lib/print";
import { relatedDeliveryFormNo, resolveServiceFormNo } from "../../../lib/serviceFormNo";
import { Plus, Wrench, Calendar, CheckCircle2, Building2, MapPin, Printer, FileText, Save, Lock, Trash2, Cpu, UserRound } from "lucide-react";
import { toast } from "sonner";

type TechnicalSpec = { key: string; value: string; unit?: string; specUnit?: string };
type CheckDraft = {
  id: string;
  label: string;
  status: InstallationCheckStatus | "";
  note: string;
};
type InstallationFormDraft = {
  formNo: string;
  teslimTarihi: string;
  kurulumTarihi: string;
  machineId: string;
  tezgahMarka: string;
  tezgahTip: string;
  tezgahModel: string;
  tezgahSeriNo: string;
  cncMarka: string;
  cncModel: string;
  cncSeriNo: string;
  cncMainSw: string;
  firma: string;
  ilgili: string;
  adres: string;
  telefon: string;
  faks: string;
  gsm: string;
  eposta: string;
  checks: CheckDraft[];
  problemHasProblem: "" | "yes" | "no";
  problemNote: string;
  problemActionNote: string;
  kurulumuYapan: string;
  teslimAlan: string;
  technicalSpecs: TechnicalSpec[];
};

type InstallationRow = {
  id: string;
  salesCaseId: string;
  customerId: string;
  customerName: string;
  contactName: string;
  deviceId: string;
  device: any;
  technician: string;
  scheduledDate: string;
  completedDate: string;
  status: string;
  statusCode: string;
  location: string;
  locationType: InstallationLocationType | null;
  durationMinutes: number | null;
  technicalSpecs: TechnicalSpec[];
  notes: string;
  formData?: any | null;
};

const toDateInput = (value?: unknown) => {
  if (!value) return "";
  const text = String(value);
  return text.includes("T") ? text.slice(0, 10) : text.slice(0, 10);
};

const clean = (value: string) => value.trim() || undefined;

const defaultChecks = (): CheckDraft[] =>
  INSTALLATION_FORM_DEFAULT_CHECKS.map((check) => ({
    id: check.id,
    label: check.label,
    status: "",
    note: "",
  }));

const mapDeviceToMachine = (row: InstallationRow) =>
  row.device
    ? {
        id: row.device.id,
        customerId: row.customerId,
        salesCaseId: row.salesCaseId,
        stockItemId: "",
        serialNumber: row.device.serialNumber ?? "—",
        model: row.device.model ?? row.device.productModelName ?? "—",
        brand: row.device.brandName ?? "",
        type: row.device.productTypeName ?? "",
        controlUnit: row.device.controlUnit ?? "",
        controlUnitSerial: row.device.controlUnitSerialNumber ?? "",
        technicalSpecs: row.technicalSpecs,
        deliveryDate: toDateInput(row.device.deliveryDate),
        cashPrice: row.device.cashPrice == null ? undefined : Number(row.device.cashPrice),
        currency: row.device.currencyCode ?? "USD",
        installationDate: row.completedDate,
        warrantyStart: "",
        warrantyEnd: "",
        status: "Active" as const,
      }
    : null;

function formToPayload(form: InstallationFormDraft): any {
  return {
    formNo: clean(form.formNo),
    teslimTarihi: form.teslimTarihi || undefined,
    kurulumTarihi: form.kurulumTarihi || undefined,
    machineId: form.machineId || undefined,
    tezgah: {
      marka: clean(form.tezgahMarka),
      tip: clean(form.tezgahTip),
      model: clean(form.tezgahModel),
      seriNo: clean(form.tezgahSeriNo),
    },
    cnc: {
      marka: clean(form.cncMarka),
      model: clean(form.cncModel),
      seriNo: clean(form.cncSeriNo),
      mainSw: clean(form.cncMainSw),
    },
    kullanici: {
      firma: clean(form.firma),
      ilgili: clean(form.ilgili),
      adres: clean(form.adres),
      telefon: clean(form.telefon),
      faks: clean(form.faks),
      gsm: clean(form.gsm),
      eposta: clean(form.eposta),
    },
    checks: form.checks.map((check) => ({
      id: check.id,
      label: check.label,
      status: check.status || undefined,
      note: clean(check.note),
    })),
    problem: {
      hasProblem: form.problemHasProblem ? form.problemHasProblem === "yes" : undefined,
      note: clean(form.problemNote),
      actionNote: clean(form.problemActionNote),
    },
    kurulumuYapan: clean(form.kurulumuYapan),
    teslimAlan: clean(form.teslimAlan),
    technicalSpecs: form.technicalSpecs
      .filter((spec) => spec.key.trim() && spec.value.trim())
      .map((spec) => ({
        key: spec.key.trim(),
        value: spec.value.trim(),
        unit: (spec.unit ?? spec.specUnit ?? "").trim() || undefined,
        specUnit: (spec.unit ?? spec.specUnit ?? "").trim() || undefined,
      })),
  };
}

export function InstallationsPage() {
  const { customers, machines, deliveries, products } = useStore();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<InstallationRow | null>(null);
  const [selectedLegacyDelivery, setSelectedLegacyDelivery] = useState<(typeof deliveries)[number] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InstallationRow | null>(null);
  const [tab, setTab] = useState<"open" | "delivered" | "forms">("open");

  const loadInstallations = async () => {
    setLoading(true);
    try {
      const res = await serviceService.installations({ pageSize: 200 });
      setRows(res.data);
    } catch (err: any) {
      toast.error("Kurulumlar yüklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstallations();
  }, []);

  const installationRows: InstallationRow[] = rows.map((i) => ({
    id: i.id,
    salesCaseId: i.opportunityId ?? "",
    customerId: i.companyId ?? "",
    customerName: i.company?.shortName || i.company?.legalTitle || customers.find((c) => c.id === i.companyId)?.name || "—",
    contactName: i.contact?.fullName ?? "",
    deviceId: i.customerDeviceId ?? "",
    device: i.customerDevice ?? null,
    technician: i.assignedTo?.fullName ?? "—",
    scheduledDate: (i.scheduledDate as string | undefined)?.slice(0, 10) ?? "—",
    completedDate: (i.completedAt as string | undefined)?.slice(0, 10) ?? "",
    status: i.status?.name ?? i.status?.code ?? "Planlandı",
    statusCode: i.status?.code ?? "",
    location: i.location ?? "",
    locationType: (i.locationType as InstallationLocationType | null) ?? null,
    durationMinutes: i.durationMinutes != null ? Number(i.durationMinutes) : null,
    technicalSpecs: Array.isArray(i.customerDevice?.technicalSpecs)
      ? i.customerDevice.technicalSpecs.map((spec: any) => ({
          key: String(spec.key ?? ""),
          value: String(spec.value ?? ""),
          unit: spec.unit ?? spec.specUnit ?? "",
        }))
      : [],
    notes: i.notes ?? "",
    formData: i.formData ?? null,
  }));

  const planned = installationRows.filter((i) => ["Planlandı", "scheduled"].includes(i.status) || i.statusCode === "scheduled").length;
  const completed = installationRows.filter((i) => ["Tamamlandı", "completed"].includes(i.status) || i.statusCode === "completed").length;
  const openRows = installationRows.filter((i) => i.statusCode !== "completed");
  const deliveredRows = installationRows.filter((i) => i.statusCode === "completed");
  const formRows = installationRows.filter((i) => Boolean(i.formData));
  const visibleRows = tab === "delivered" ? deliveredRows : tab === "forms" ? formRows : openRows;
  const upcoming = [...installationRows]
    .filter((i) => ["Planlandı", "scheduled"].includes(i.status) || i.statusCode === "scheduled")
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const deleteInstallation = async (row: InstallationRow, event?: React.MouseEvent) => {
    event?.stopPropagation();
    setDeletingId(row.id);
    try {
      await serviceService.deleteInstallation(row.id);
      toast.success("Kurulum silindi");
      if (selectedRow?.id === row.id) setSelectedRow(null);
      setPendingDelete(null);
      await loadInstallations();
    } catch (err: any) {
      toast.error("Kurulum silinemedi", { description: err?.message ?? "İşlem başarısız oldu." });
    } finally {
      setDeletingId(null);
    }
  };
  const installationStep = (row: InstallationRow) => row.statusCode === "completed" && row.formData ? 4 : row.statusCode === "completed" ? 3 : ["in_progress", "started", "installation"].includes(row.statusCode) ? 2 : row.technician !== "—" ? 1 : 0;
  const rowMachine = (row: InstallationRow) => machines.find((machine) => machine.id === row.deviceId) ?? machines.find((machine) => machine.salesCaseId === row.salesCaseId);
  const rowProduct = (row: InstallationRow) => {
    const machine = rowMachine(row);
    const productId = machine?.productModelId ?? row.device?.productModelId;
    return products.find((product) => product.id === productId);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<Wrench className="size-[18px]" />} label="Toplam Kurulum" value={installationRows.length} sub="tüm zamanlar" delta={6} />
        <MiniKpi tone="amber" icon={<Calendar className="size-[18px]" />} label="Planlı" value={planned} sub="gelecek" delta={2} />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Tamamlandı" value={completed} sub="bu çeyrek" delta={4} />
        <MiniKpi tone="blue" icon={<FileText className="size-[18px]" />} label="Kurulum Tutanağı" value={formRows.length + deliveries.length} sub="son adım" delta={1} onClick={() => setTab("forms")} active={tab === "forms"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="space-y-2">
              <CardTitle className="tracking-tight">Kurulumlar</CardTitle>
              <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
                <TabsList className="h-9 bg-muted/60">
                  <TabsTrigger value="open">Açık ({openRows.length})</TabsTrigger>
                  <TabsTrigger value="delivered">Teslim Edildi ({deliveredRows.length})</TabsTrigger>
                  <TabsTrigger value="forms">Kurulum Tutanakları ({formRows.length + deliveries.length})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <CreateInstallationDialog
              onCreated={loadInstallations}
              trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Kurulum</Button>}
            />
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Makine / Müşteri</TableHead>
                  <TableHead>Teknisyen / Tarih</TableHead>
                  <TableHead>Kurulum Yolculuğu</TableHead>
                  <TableHead>Konum / Süre</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-20 text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((i) => {
                  const machine = rowMachine(i);
                  const product = rowProduct(i);
                  const step = installationStep(i);
                  return (
                  <TableRow key={i.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <EntityVisual size="sm" title={machine?.model || i.device?.model || i.customerName} imageUrl={product?.imageUrl} icon={<Cpu className="size-4" />} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{machine ? `${machine.brand || ""} ${machine.model}`.trim() : i.device?.model || "Kurulum kaydı"}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Building2 className="size-3" /><span className="truncate">{i.customerName}</span>{machine?.serialNumber && <span className="font-data">· {machine.serialNumber}</span>}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm"><div className="flex items-center gap-1.5"><UserRound className="size-3.5 text-muted-foreground" />{i.technician}</div><div className="mt-1 flex items-center gap-1.5 font-data text-[10px] text-muted-foreground"><Calendar className="size-3" />{i.scheduledDate}</div></TableCell>
                    <TableCell className="min-w-[300px]">
                      <div className="flex items-center" aria-label={`Kurulum yolculuğu ${step}/4`}>
                        {["Plan", "Atama", "Kurulum", "Teslim", "Tutanak"].map((label, index) => <div key={label} className="flex flex-1 items-center last:flex-none"><span className={`grid size-5 place-items-center rounded-full border text-[8px] font-bold ${index <= step ? "border-primary bg-primary text-white" : "border-border bg-white text-muted-foreground"}`}>{index + 1}</span>{index < 4 && <span className={`h-px flex-1 ${index < step ? "bg-primary" : "bg-border"}`} />}</div>)}
                      </div>
                      <div className="mt-1 grid grid-cols-5 text-center text-[7px] uppercase tracking-wide text-muted-foreground"><span>Plan</span><span>Atama</span><span>Kurulum</span><span>Teslim</span><span>Tutanak</span></div>
                    </TableCell>
                    <TableCell>
                      {i.locationType ? (
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex w-fit items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] ${
                            i.locationType === "istanbul_disi"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>
                            <MapPin className="size-3" />{INSTALLATION_LOCATION_LABELS[i.locationType]}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{formatDuration(i.durationMinutes ?? 0)}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={i.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-7" title="Son adım: Kurulum tutanağını aç"
                          onClick={() => setSelectedRow(i)}>
                          <FileText className="size-4 text-muted-foreground hover:text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="Kurulumu sil"
                          disabled={deletingId === i.id}
                          onClick={(event) => { event.stopPropagation(); setPendingDelete(i); }}
                        >
                          <Trash2 className="size-4 text-muted-foreground hover:text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );})}
                {!loading && visibleRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                      {tab === "delivered" ? "Teslim edilmiş kurulum kaydı yok." : tab === "forms" ? "Kurulum tutanağı henüz oluşturulmadı." : "Açık kurulum kaydı yok."}
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                      Kurulumlar yükleniyor...
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Yaklaşan Ziyaretler</CardTitle>
            <p className="text-xs text-muted-foreground">Sıradaki saha çıkışları</p>
          </CardHeader>
          <CardContent className="space-y-2 pt-2">
            {upcoming.length === 0 && <div className="text-xs text-muted-foreground py-6 text-center">Planlı ziyaret yok</div>}
            {upcoming.map((i) => (
              <div key={i.id} className="flex items-center gap-3 py-2 border-b last:border-0 border-border/60">
                <div className="size-9 rounded-md bg-amber-50 text-amber-600 grid place-items-center shrink-0">
                  <Calendar className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-tight truncate">{i.customerName}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{i.technician}</div>
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums shrink-0">{i.scheduledDate.slice(5)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {tab === "forms" && deliveries.length > 0 && (
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="tracking-tight">Aktarılan Kurulum Tutanakları</CardTitle>
            <p className="text-xs text-muted-foreground">Eski Teslimat bölümündeki kayıtlar kurulum akışının son adımı olarak burada korunur.</p>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-muted/30 hover:bg-muted/30"><TableHead>Firma / Makine</TableHead><TableHead>Teslim Tarihi</TableHead><TableHead>Teslim Alan</TableHead><TableHead>Durum</TableHead><TableHead className="text-right">Kurulum Tutanağı</TableHead></TableRow></TableHeader>
              <TableBody>
                {deliveries.map((delivery) => {
                  const customer = customers.find((item) => item.id === delivery.customerId);
                  const machine = machines.find((item) => item.id === delivery.formData?.machineId) ?? machines.find((item) => item.salesCaseId === delivery.salesCaseId);
                  return (
                    <TableRow key={delivery.id}>
                      <TableCell><div className="text-sm font-medium">{customer?.name ?? "Firma"}</div><div className="mt-0.5 text-xs text-muted-foreground">{machine ? `${[machine.brand, machine.model].filter(Boolean).join(" ")} · ${machine.serialNumber || "Seri no yok"}` : "Makine bilgisi yok"}</div></TableCell>
                      <TableCell className="font-data text-xs">{delivery.date || "—"}</TableCell>
                      <TableCell className="text-sm">{delivery.signedBy || "—"}</TableCell>
                      <TableCell><StatusBadge status={delivery.status === "Tamamlandı" ? "Kurulum Tutanağı" : "Tutanak Bekliyor"} /></TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="outline" className="gap-1" onClick={() => setSelectedLegacyDelivery(delivery)}><FileText className="size-3.5" /> Tutanağı Aç</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <InstallationFormDialog
        row={selectedRow}
        customers={customers}
        machines={machines}
        deliveries={deliveries}
        onClose={() => setSelectedRow(null)}
        onSaved={loadInstallations}
      />
      <DeliveryDetailDialog
        delivery={selectedLegacyDelivery}
        customerName={(id) => customers.find((customer) => customer.id === id)?.name ?? "—"}
        onClose={() => setSelectedLegacyDelivery(null)}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && !deletingId && setPendingDelete(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader><AlertDialogTitle>Kurulum kaydı arşivlensin mi?</AlertDialogTitle><AlertDialogDescription><span className="block font-medium text-foreground">{pendingDelete?.customerName}</span>Kurulum planı, teknisyen ataması ve form bağlantısı arşivlenir; firma ve makine kaydı korunur.</AlertDialogDescription></AlertDialogHeader>
          {pendingDelete && <div className="rounded-lg border border-destructive/15 bg-destructive-soft/50 p-3 text-xs"><div className="font-medium text-foreground">{rowMachine(pendingDelete)?.model || pendingDelete.device?.model || "Makine bilgisi yok"}</div><div className="mt-1 text-muted-foreground">{pendingDelete.scheduledDate} · {pendingDelete.technician}</div></div>}
          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!!deletingId} onClick={(event) => { event.preventDefault(); if (pendingDelete) void deleteInstallation(pendingDelete); }}>{deletingId ? "Arşivleniyor…" : "Kurulumu Arşivle"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InstallationFormDialog({
  row,
  customers,
  machines,
  deliveries,
  onClose,
  onSaved,
}: {
  row: InstallationRow | null;
  customers: ReturnType<typeof useStore>["customers"];
  machines: ReturnType<typeof useStore>["machines"];
  deliveries: ReturnType<typeof useStore>["deliveries"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<InstallationFormDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const customer = useMemo(() => customers.find((c) => c.id === row?.customerId) ?? null, [customers, row?.customerId]);

  useEffect(() => {
    if (!row) {
      setForm(null);
      return;
    }
    const rowDevice = mapDeviceToMachine(row);
    const machine =
      machines.find((x) => x.id === row.deviceId) ??
      rowDevice ??
      machines.find((x) => x.customerId === row.customerId);
    const fd = row.formData ?? {};
    const cncParts = machine?.controlUnit?.split(" ") ?? [];
    const existingChecks: CheckDraft[] = fd.checks?.length
      ? fd.checks.map((check: { id?: string; label: string; status?: InstallationCheckStatus; note?: string }) => ({
          id: check.id || `custom-${check.label}`,
          label: check.label,
          status: check.status ?? "",
          note: check.note ?? "",
        }))
      : defaultChecks();
    const checks = [
      ...INSTALLATION_FORM_DEFAULT_CHECKS.map((required) => {
        const existing = existingChecks.find((check) => check.id === required.id || check.label === required.label);
        return existing ?? { id: required.id, label: required.label, status: "" as const, note: "" };
      }),
      ...existingChecks.filter((check) => !INSTALLATION_FORM_DEFAULT_CHECKS.some((required) => required.id === check.id || required.label === check.label)),
    ];

    setForm({
      formNo: resolveServiceFormNo({
        currentFormNo: fd.formNo,
        relatedFormNo: relatedDeliveryFormNo(deliveries, {
          salesCaseId: row.salesCaseId,
          machineId: fd.machineId ?? machine?.id ?? row.deviceId,
        }),
        salesCaseId: row.salesCaseId,
        machineId: fd.machineId ?? machine?.id ?? row.deviceId,
        fallbackId: row.id,
      }),
      teslimTarihi: toDateInput(fd.teslimTarihi) || machine?.deliveryDate || "",
      kurulumTarihi: toDateInput(fd.kurulumTarihi) || row.completedDate || (row.scheduledDate !== "—" ? row.scheduledDate : ""),
      machineId: fd.machineId ?? machine?.id ?? "",
      tezgahMarka: fd.tezgah?.marka ?? machine?.brand ?? "",
      tezgahTip: fd.tezgah?.tip ?? machine?.type ?? "",
      tezgahModel: fd.tezgah?.model ?? machine?.model ?? "",
      tezgahSeriNo: fd.tezgah?.seriNo ?? machine?.serialNumber ?? "",
      cncMarka: fd.cnc?.marka ?? cncParts[0] ?? "",
      cncModel: fd.cnc?.model ?? cncParts.slice(1).join(" "),
      cncSeriNo: fd.cnc?.seriNo ?? machine?.controlUnitSerial ?? "",
      cncMainSw: fd.cnc?.mainSw ?? "",
      firma: fd.kullanici?.firma ?? customer?.name ?? row.customerName,
      ilgili: fd.kullanici?.ilgili ?? row.contactName ?? customer?.contactPerson ?? "",
      adres: fd.kullanici?.adres ?? (customer ? [customer.address, customer.district, customer.city].filter(Boolean).join(" ") : row.location),
      telefon: fd.kullanici?.telefon ?? customer?.phone ?? "",
      faks: fd.kullanici?.faks ?? customer?.fax ?? "",
      gsm: fd.kullanici?.gsm ?? customer?.phone2 ?? "",
      eposta: fd.kullanici?.eposta ?? customer?.email ?? "",
      checks,
      problemHasProblem: typeof fd.problem?.hasProblem === "boolean" ? (fd.problem.hasProblem ? "yes" : "no") : "",
      problemNote: fd.problem?.note ?? "",
      problemActionNote: fd.problem?.actionNote ?? "",
      kurulumuYapan: fd.kurulumuYapan ?? (row.technician !== "—" ? row.technician : ""),
      teslimAlan: fd.teslimAlan ?? row.contactName ?? customer?.contactPerson ?? "",
      technicalSpecs: fd.technicalSpecs?.length ? fd.technicalSpecs : row.technicalSpecs,
    });
  }, [row, machines, customer, deliveries]);

  const update = <K extends keyof InstallationFormDraft>(key: K, value: InstallationFormDraft[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };
  const updateCheck = (id: string, patch: Partial<CheckDraft>) => {
    setForm((current) => current
      ? { ...current, checks: current.checks.map((check) => (check.id === id ? { ...check, ...patch } : check)) }
      : current);
  };

  const printForm = () => {
    if (!row || !form) return;
    const payload = formToPayload(form);
    printOrWarn(
      installationFormDoc(
        {
          teslimTarihi: payload.teslimTarihi ? trShortDate(payload.teslimTarihi) : "",
          kurulumTarihi: payload.kurulumTarihi ? trShortDate(payload.kurulumTarihi) : "",
          formNo: payload.formNo || row.id.slice(0, 6).toUpperCase(),
          tezgah: payload.tezgah,
          cnc: payload.cnc,
          firma: payload.kullanici?.firma,
          ilgili: payload.kullanici?.ilgili,
          adres: payload.kullanici?.adres,
          telefon: payload.kullanici?.telefon,
          faks: payload.kullanici?.faks,
          gsm: payload.kullanici?.gsm,
          eposta: payload.kullanici?.eposta,
          kurulumuYapan: payload.kurulumuYapan,
          teslimAlan: payload.teslimAlan,
          kurulumYeri: row.location,
          sure: row.durationMinutes != null ? formatDuration(row.durationMinutes) : undefined,
          checks: payload.checks?.map((check: { label: string; status?: InstallationCheckStatus; note?: string }) => ({ label: check.label, status: check.status, note: check.note })),
          problem: payload.problem,
          notlar: row.notes,
        },
        printAssetBase(),
      ),
    );
  };

  const saveForm = async () => {
    if (!row || !form) return;
    setSaving(true);
    try {
      await serviceService.updateInstallation(row.id, { formData: formToPayload(form) });
      toast.success("Kurulum tutanağı kaydedildi");
      onSaved();
    } catch (err: any) {
      toast.error("Kurulum tutanağı kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  const completeInstallation = async () => {
    if (!row || !form) return;
    setSaving(true);
    try {
      const payload = formToPayload(form);
      const result = await serviceService.updateInstallationStatus(row.id, {
        statusCode: "completed",
        installationDate: payload.kurulumTarihi ? String(payload.kurulumTarihi) : new Date().toISOString(),
        formData: payload,
      });
      toast.success("Kurulum tamamlandı", {
        description: result?.opportunityStageChanged ? "Bağlı satış kartı Teslim Edildi aşamasına alındı." : undefined,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error("Kurulum tamamlanamadı", { description: err?.message ?? "Kontrol çizelgesi ve problem alanını kontrol edin." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(920px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        {row && form && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="size-5 text-primary" /> Kurulum Tutanağı</DialogTitle>
              <DialogDescription>{row.customerName} · {row.scheduledDate}</DialogDescription>
            </DialogHeader>

            <div className="max-h-[min(68dvh,680px)] overflow-y-auto pr-1 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Form No" value={form.formNo} onChange={(value) => update("formNo", value)} />
                <Field label="Tezgah Teslim Tarihi" type="date" value={form.teslimTarihi} onChange={(value) => update("teslimTarihi", value)} />
                <Field label="Tezgah Kurulum Tarihi" type="date" value={form.kurulumTarihi} onChange={(value) => update("kurulumTarihi", value)} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Card className="border-border/60">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Tezgah Bilgileri</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Tezgah Markası" value={form.tezgahMarka} onChange={(value) => update("tezgahMarka", value)} />
                    <Field label="Tezgah Tipi" value={form.tezgahTip} onChange={(value) => update("tezgahTip", value)} />
                    <Field label="Tezgah Modeli" value={form.tezgahModel} onChange={(value) => update("tezgahModel", value)} />
                    <Field label="Tezgah Seri No" value={form.tezgahSeriNo} onChange={(value) => update("tezgahSeriNo", value)} />
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Kontrol Ünitesi Bilgileri</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Cnc Markası" value={form.cncMarka} onChange={(value) => update("cncMarka", value)} />
                    <Field label="Cnc Modeli" value={form.cncModel} onChange={(value) => update("cncModel", value)} />
                    <Field label="Cnc Seri No" value={form.cncSeriNo} onChange={(value) => update("cncSeriNo", value)} />
                    <Field label="Cnc Main S/W" value={form.cncMainSw} onChange={(value) => update("cncMainSw", value)} />
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/60">
                <CardHeader className="pb-3"><CardTitle className="text-base">Kullanıcı Bilgileri</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2"><Field label="Firma" value={form.firma} onChange={(value) => update("firma", value)} /></div>
                  <Field label="İlgili" value={form.ilgili} onChange={(value) => update("ilgili", value)} />
                  <Field label="Telefon" value={form.telefon} onChange={(value) => update("telefon", value)} />
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Adres</Label>
                    <Textarea className="mt-1.5 min-h-20" value={form.adres} onChange={(event) => update("adres", event.target.value)} />
                  </div>
                  <Field label="Faks" value={form.faks} onChange={(value) => update("faks", value)} />
                  <Field label="Gsm" value={form.gsm} onChange={(value) => update("gsm", value)} />
                  <div className="sm:col-span-2"><Field label="E-Posta" type="email" value={form.eposta} onChange={(value) => update("eposta", value)} /></div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="pb-3"><CardTitle className="text-base">Tezgah Kontrol Çizelgesi</CardTitle></CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <Table className="min-w-[720px]">
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead>Açıklama</TableHead>
                          <TableHead className="w-40">Durum</TableHead>
                          <TableHead>Not</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {form.checks.map((check) => (
                          <TableRow key={check.id}>
                            <TableCell className="font-medium">{check.label}</TableCell>
                            <TableCell>
                              <Select value={check.status || "unset"} onValueChange={(value) => updateCheck(check.id, { status: value === "unset" ? "" : value as InstallationCheckStatus })}>
                                <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unset">Seçilmedi</SelectItem>
                                  <SelectItem value="done">Tamamlandı</SelectItem>
                                  <SelectItem value="not_done">Tamamlanmadı</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input value={check.note} onChange={(event) => updateCheck(check.id, { note: event.target.value })} placeholder="İsteğe bağlı" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="pb-3"><CardTitle className="text-base">Kurulumda Problem Kontrolü</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Problem var mı?</Label>
                    <Select value={form.problemHasProblem || "unset"} onValueChange={(value) => update("problemHasProblem", value === "unset" ? "" : value as "yes" | "no")}>
                      <SelectTrigger className="mt-1.5 bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">Seçilmedi</SelectItem>
                        <SelectItem value="no">Hayır</SelectItem>
                        <SelectItem value="yes">Evet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div />
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Açıklama</Label>
                    <Textarea className="mt-1.5 min-h-20" value={form.problemNote} onChange={(event) => update("problemNote", event.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Yapılan İşlem</Label>
                    <Textarea className="mt-1.5 min-h-20" value={form.problemActionNote} onChange={(event) => update("problemActionNote", event.target.value)} />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="pb-3"><CardTitle className="text-base">İmza Bilgileri</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Kurulumu Yapan" value={form.kurulumuYapan} onChange={(value) => update("kurulumuYapan", value)} />
                  <Field label="Tezgahı Teslim Alan" value={form.teslimAlan} onChange={(value) => update("teslimAlan", value)} />
                </CardContent>
              </Card>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" className="gap-1" onClick={printForm}>
                <Printer className="size-4" /> Yazdır / PDF
              </Button>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Kapat</Button>
                <Button variant="outline" className="gap-1" disabled={saving} onClick={() => void saveForm()}>
                  <Save className="size-4" /> Kaydet
                </Button>
                {row.statusCode !== "completed" && (
                  <Button className="gap-1 bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={() => void completeInstallation()}>
                    <Lock className="size-4" /> Kaydet ve Tamamla
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1.5" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
