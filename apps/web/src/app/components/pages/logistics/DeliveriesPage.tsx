import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { CreateDeliveryDialog, DeliveryFormFields, deliveryFormToPayload, deliveryToFormState, type DeliveryFormState } from "../../dialogs/CreateDialogs";
import { EmptyState } from "../../shared/EmptyState";
import { MiniKpi } from "../../shared/MiniKpi";
import { useStore } from "../../../lib/store";
import { DELIVERY_STATUSES, type Delivery } from "../../../lib/mock";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { printOrWarn } from "../../../lib/pageHelpers";
import { installationFormDoc, printAssetBase, trShortDate } from "../../../lib/print";
import { Plus, ClipboardCheck, CheckCircle2, Clock, Building2, FileSignature, Printer } from "lucide-react";
import { toast } from "sonner";

export function DeliveriesPage() {
  const { deliveries, updateDeliveryStatus, customers } = useStore();
  const liveCustomerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const [selectedDelivery, setSelectedDelivery] = useState<(typeof deliveries)[number] | null>(null);
  const completed = deliveries.filter((d) => d.status === "Tamamlandı").length;
  const pending = deliveries.filter((d) => d.status === "Bekliyor").length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MiniKpi tone="violet" icon={<ClipboardCheck className="size-[18px]" />} label="Toplam Teslimat" value={deliveries.length} sub="kayıt" delta={3} />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Tamamlandı" value={completed} sub="imzalı" delta={2} />
        <MiniKpi tone="amber" icon={<Clock className="size-[18px]" />} label="Bekleyen" value={pending} sub="imza bekliyor" delta={1} />
      </div>

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
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Müşteri</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead>Teslim Alan</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d) => (
                <TableRow key={d.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                        <Building2 className="size-4" />
                      </div>
                      <div className="text-sm">{liveCustomerName(d.customerId)}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{d.date}</TableCell>
                  <TableCell className="text-sm">{d.signedBy}</TableCell>
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
                    <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100" title="Teslim formu / düzenle"
                      onClick={() => setSelectedDelivery(d)}>
                      <FileSignature className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {deliveries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState
                      icon={<ClipboardCheck className="size-5" />}
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
    </div>
  );
}

function DeliveryDetailDialog({
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
    const formNo = fd.formNo || "";
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
