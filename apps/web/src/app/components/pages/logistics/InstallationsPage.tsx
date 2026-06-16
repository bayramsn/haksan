import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { StatusBadge } from "../../Layout";
import { CreateInstallationDialog } from "../../dialogs/CreateDialogs";
import { MiniKpi } from "../../shared/MiniKpi";
import { useStore } from "../../../lib/store";
import { serviceService } from "../../../../lib/services";
import { INSTALLATION_LOCATION_LABELS, formatDuration, type InstallationLocationType } from "@haksan/shared";
import { printOrWarn } from "../../../lib/pageHelpers";
import { installationFormDoc, printAssetBase, trShortDate } from "../../../lib/print";
import { Plus, Wrench, Calendar, CheckCircle2, TrendingUp, Wallet, Building2, MapPin, Printer } from "lucide-react";
import { toast } from "sonner";

export function InstallationsPage() {
  const { customers, machines } = useStore();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  const installationRows = rows.map((i) => ({
    id: i.id,
    customerId: i.companyId ?? "",
    customerName: i.company?.shortName || i.company?.legalTitle || customers.find((c) => c.id === i.companyId)?.name || "—",
    contactName: i.contact?.fullName ?? "",
    deviceId: i.customerDeviceId ?? "",
    technician: i.assignedTo?.fullName ?? "—",
    scheduledDate: (i.scheduledDate as string | undefined)?.slice(0, 10) ?? "—",
    completedDate: (i.completedAt as string | undefined)?.slice(0, 10) ?? "",
    status: i.status?.name ?? i.status?.code ?? "Planlandı",
    location: i.location ?? "",
    locationType: (i.locationType as InstallationLocationType | null) ?? null,
    durationMinutes: i.durationMinutes != null ? Number(i.durationMinutes) : null,
    feeAmount: i.feeAmount != null ? Number(i.feeAmount) : null,
  }));

  // Toplam kurulum geliri (kaydedilmiş ücretler, USD).
  const totalFee = installationRows.reduce((s, i) => s + (i.feeAmount ?? 0), 0);

  // Kurulum Tutanağı çıktısı — müşteri bilgileri CRM'den, tezgah/CNC bilgileri
  // kuruluma bağlı makineden (yoksa müşterinin makinesinden) gelir; CRM'de
  // olmayan alanlar sahada elle doldurulmak üzere boş basılır.
  const printInstallationForm = (row: (typeof installationRows)[number], index: number) => {
    const cust = customers.find((c) => c.id === row.customerId);
    const m =
      machines.find((x) => x.id === row.deviceId) ??
      machines.find((x) => x.customerId === row.customerId);
    printOrWarn(
      installationFormDoc(
        {
          teslimTarihi: m?.deliveryDate ? trShortDate(m.deliveryDate) : "",
          kurulumTarihi: row.completedDate
            ? trShortDate(row.completedDate)
            : row.scheduledDate !== "—"
              ? trShortDate(row.scheduledDate)
              : "",
          formNo: String(index + 1).padStart(5, "0"),
          tezgah: m ? { marka: m.brand, tip: m.type, model: m.model, seriNo: m.serialNumber } : undefined,
          cnc: m?.controlUnit
            ? {
                marka: m.controlUnit.split(" ")[0],
                model: m.controlUnit.split(" ").slice(1).join(" ") || undefined,
                seriNo: m.controlUnitSerial,
              }
            : undefined,
          firma: cust?.name ?? row.customerName,
          ilgili: row.contactName || cust?.contactPerson,
          adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : row.location,
          telefon: cust?.phone,
          faks: cust?.fax,
          gsm: cust?.phone2,
          eposta: cust?.email,
          kurulumuYapan: row.technician !== "—" ? row.technician : "",
        },
        printAssetBase()
      )
    );
  };

  const planned = installationRows.filter((i) => ["Planlandı", "scheduled"].includes(i.status)).length;
  const completed = installationRows.filter((i) => ["Tamamlandı", "completed"].includes(i.status)).length;
  const upcoming = [...installationRows]
    .filter((i) => ["Planlandı", "scheduled"].includes(i.status))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MiniKpi tone="violet" icon={<Wrench className="size-[18px]" />} label="Toplam Kurulum" value={installationRows.length} sub="tüm zamanlar" delta={6} />
        <MiniKpi tone="amber" icon={<Calendar className="size-[18px]" />} label="Planlı" value={planned} sub="gelecek" delta={2} />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Tamamlandı" value={completed} sub="bu çeyrek" delta={4} />
        <MiniKpi tone="blue" icon={<TrendingUp className="size-[18px]" />} label="Başarı" value={`%${installationRows.length ? Math.round((completed / installationRows.length) * 100) : 0}`} sub="ilk seferde" delta={1} />
        <MiniKpi tone="emerald" icon={<Wallet className="size-[18px]" />} label="Kurulum Geliri" value={`$ ${totalFee.toLocaleString("tr-TR")}`} sub="hesaplanan ücret" delta={0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="tracking-tight">Tüm Kurulumlar</CardTitle>
            <CreateInstallationDialog
              onCreated={loadInstallations}
              trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Kurulum</Button>}
            />
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Teknisyen</TableHead>
                  <TableHead>Planlanan Tarih</TableHead>
                  <TableHead>Konum / Süre</TableHead>
                  <TableHead className="text-right">Ücret</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-16 text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installationRows.map((i, idx) => (
                  <TableRow key={i.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                          <Building2 className="size-4" />
                        </div>
                        <div>
                          <div className="text-sm leading-tight">{i.customerName}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">#{i.id.toUpperCase()}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{i.technician}</TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{i.scheduledDate}</TableCell>
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
                    <TableCell className="text-right tabular-nums">
                      {i.feeAmount != null ? (
                        <span className="text-sm text-emerald-700">$ {i.feeAmount.toLocaleString("tr-TR")}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={i.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="size-7" title="Kurulum Tutanağı yazdır / PDF"
                        onClick={() => printInstallationForm(i, idx)}>
                        <Printer className="size-4 text-muted-foreground hover:text-primary" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && installationRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
                      Henüz kurulum kaydı yok.
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
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
    </div>
  );
}
