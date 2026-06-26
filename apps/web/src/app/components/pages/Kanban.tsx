import { useMemo, useState } from "react";
import { Card } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { SALES_STAGES, SalesCase, SalesStage, salesStageLabel, DocumentItem, type Machine } from "../../lib/mock";
import { ArrowRight, Building2, Calendar } from "lucide-react";
import { KanbanBoard, KanbanColumn } from "../KanbanBoard";
import { KanbanCardAttachments } from "../KanbanCardAttachments";
import { DocumentPreviewDialog } from "../dialogs/DocumentPreviewDialog";
import { useStore } from "../../lib/store";
import { LostCaseDialog } from "../dialogs/LostCaseDialog";
import { loadContractPrintData, loadProformaPrintData, proformaDoc, contractDoc, installationFormDoc, printAssetBase, trShortDate } from "../../lib/print";
import { printOrWarn } from "../../lib/pageHelpers";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { inventoryService } from "../../../lib/services";

const STAGE_DOT: Record<string, string> = {
  lead: "bg-zinc-400",
  sales: "bg-zinc-400",
  call: "bg-blue-400",
  visit: "bg-blue-500",
  cancelled: "bg-red-500",
  quote: "bg-indigo-500",
  proforma: "bg-emerald-500",
  contract: "bg-emerald-500",
  payment_plan: "bg-emerald-500",
  commercial_invoice: "bg-amber-500",
  customs_approved: "bg-amber-500",
  stock_picking: "bg-sky-500",
  shipping: "bg-blue-500",
  installation: "bg-brand-blue",
  delivered: "bg-emerald-600",
  Lead: "bg-zinc-400",
  "Initial Contact": "bg-zinc-400",
  "Requirement Analysis": "bg-blue-400",
  "Offer Preparing": "bg-blue-500",
  "Offer Sent": "bg-indigo-500",
  "Follow-up": "bg-indigo-400",
  "Offer Approved": "bg-emerald-500",
  "Proforma / Contract": "bg-emerald-500",
  Customs: "bg-amber-500",
  Shipment: "bg-amber-500",
  Installation: "bg-amber-500",
  Completed: "bg-emerald-600",
  Lost: "bg-red-500",
};

const initials = (n: string) => (n || "—").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export function KanbanPage({ onSelect, items }: { onSelect: (s: SalesCase) => void; items?: SalesCase[] }) {
  const { cases: storeCases, moveCase, customers, contacts, users, documents, offers, products, payments, machines, stock, addDocument } = useStore();
  const cases = items ?? storeCases;
  const [lostId, setLostId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [stockPickCaseId, setStockPickCaseId] = useState<string | null>(null);
  const [selectedStockIds, setSelectedStockIds] = useState<string[]>([]);
  const [stockPickSaving, setStockPickSaving] = useState(false);
  const lostCustomer = lostId ? customers.find((x) => x.id === cases.find((s) => s.id === lostId)?.customerId)?.name : undefined;
  const stockPickCase = stockPickCaseId ? storeCases.find((s) => s.id === stockPickCaseId) ?? cases.find((s) => s.id === stockPickCaseId) : null;
  const stockPickCustomer = stockPickCase ? customers.find((x) => x.id === stockPickCase.customerId) : undefined;
  const stockPickTargetQty = Math.max(1, Number(stockPickCase?.quantity) || 1);
  const stockCandidates = useMemo(() => {
    if (!stockPickCase) return [];
    return stock
      .filter((item) => {
        if ((item.categoryCode ?? "TEZGAH") !== "TEZGAH") return false;
        if (item.status === "Available") return true;
        return item.status === "Reserved" && item.reservedCompanyId === stockPickCase.customerId;
      })
      .sort((a, b) => {
        const reservedScore = Number(b.status === "Reserved") - Number(a.status === "Reserved");
        if (reservedScore !== 0) return reservedScore;
        return (a.serialNumber || a.stockCode).localeCompare(b.serialNumber || b.stockCode, "tr");
      });
  }, [stock, stockPickCase]);

  const closeStockPicker = () => {
    if (stockPickSaving) return;
    setStockPickCaseId(null);
    setSelectedStockIds([]);
  };

  const confirmStockPicking = async () => {
    if (!stockPickCaseId) return;
    if (!selectedStockIds.length) {
      toast.error("Seri no seçin");
      return;
    }
    setStockPickSaving(true);
    try {
      await moveCase(stockPickCaseId, "stock_picking", { inventoryItemIds: selectedStockIds });
      toast.success("Stok rezerve edildi", { description: `${selectedStockIds.length} seri no seçildi` });
      setStockPickCaseId(null);
      setSelectedStockIds([]);
    } catch (err: any) {
      toast.error("Stok seçimi yapılamadı", { description: err?.message ?? "Seri no seçimi kontrol edilmeli." });
    } finally {
      setStockPickSaving(false);
    }
  };

  // Kart "Proforma" aşamasına geldiğinde: kartın ve (varsa) ilişkili teklifin
  // bilgilerinden örnek PDF formatında proforma üretip yeni sekmede açar ve
  // sistemde bir Proforma belge kaydı oluşturur (zaten varsa yalnızca açar).
  const generateProforma = async (sc: SalesCase) => {
    const loading = toast.loading("Proforma hazırlanıyor…");
    try {
      const existing = documents.find((d) => d.salesCaseId === sc.id && d.type === "Proforma");
      const year = new Date().getFullYear();
      const seq = String(documents.filter((d) => d.type === "Proforma").length + 1).padStart(3, "0");
      const belgeNo = existing?.fileName ?? `${year}/${seq}`;

      const doc: DocumentItem = {
        id: existing?.id ?? `pf-${sc.id}`,
        salesCaseId: sc.id,
        companyId: sc.customerId,
        quoteId: existing?.quoteId,
        type: "Proforma",
        fileName: belgeNo,
        uploadedBy: "",
        uploadedAt: new Date().toISOString().slice(0, 10),
        size: "—",
      };

      // 1) Örnek formatında proformayı oluştur ve yeni sekmede aç.
      const data = await loadProformaPrintData({
        doc,
        customers,
        cases,
        offers,
        products,
        contacts,
      });
      printOrWarn(proformaDoc(data, printAssetBase()));

      // 2) Sistemde proforma kaydı oluştur (zaten varsa atla).
      if (!existing) {
        try {
          await addDocument({
            salesCaseId: sc.id,
            companyId: sc.customerId,
            type: "Proforma",
            fileName: belgeNo,
            size: "—",
          });
          toast.success("Proforma oluşturuldu", { description: `Belge No: ${belgeNo}` });
        } catch (err: any) {
          toast.message("Proforma açıldı, kayıt oluşturulamadı", {
            description: err?.message ?? "İlişkili teklif bulunamadı.",
          });
        }
      }
    } catch (err: any) {
      toast.error("Proforma oluşturulamadı", { description: err?.message ?? "Teklif verisi okunamadı." });
    } finally {
      toast.dismiss(loading);
    }
  };

  // Satış Sözleşmesi PDF'ini kartın/teklifinin verisinden üretir (Belgeler
  // sayfasındaki printContract ile aynı kurallar).
  const buildContractDoc = async (sc: SalesCase) => {
    const cust = customers.find((c) => c.id === sc.customerId) ?? null;
    const offer = offers
      .filter((o) => o.salesCaseId === sc.id || (cust && o.companyId === cust.id))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const data = await loadContractPrintData({
      customer: cust,
      salesCase: sc,
      offer,
      products,
      payments,
      contractDate: new Date().toISOString().slice(0, 10),
    });
    return contractDoc(data, printAssetBase());
  };

  // Sözleşme aşaması backend'de bir sözleşme kaydı şartı koşar; bu yüzden
  // proformanın aksine önce sözleşmeyi üretip kaydı oluştururuz, sonra
  // aşamayı taşırız. Kapı sağlanırsa true döner.
  const prepareContract = async (sc: SalesCase): Promise<boolean> => {
    const loading = toast.loading("Sözleşme hazırlanıyor…");
    try {
      const existing = documents.find((d) => d.salesCaseId === sc.id && d.type === "Contract");
      const year = new Date().getFullYear();
      const seq = String(documents.filter((d) => d.type === "Contract").length + 1).padStart(3, "0");
      const sozlesmeNo = existing?.fileName ?? `${year}/S-${seq}`;

      // 1) Satış Sözleşmesi PDF'ini üret ve yeni sekmede aç.
      printOrWarn(await buildContractDoc(sc));

      // 2) Kayıt yoksa oluştur (backend aşama kapısını geçirir).
      if (!existing) {
        await addDocument({
          salesCaseId: sc.id,
          companyId: sc.customerId,
          type: "Contract",
          fileName: sozlesmeNo,
          size: "—",
        });
        toast.success("Sözleşme oluşturuldu", { description: `Belge No: ${sozlesmeNo}` });
      }
      return true;
    } catch (err: any) {
      toast.error("Sözleşme oluşturulamadı", { description: err?.message ?? "İlişkili teklif bulunamadı." });
      return false;
    } finally {
      toast.dismiss(loading);
    }
  };

  // Kurulum aşamasına gelince Kurulum Tutanağı'nı (DR.MAK) kartın müşterisi ve
  // (varsa) bağlı makinesinin bilgileriyle üretip yeni sekmede açar. Sahada
  // doldurulacak alanlar (seri no, tarih, imza) boş kalır. Garanti, aşama
  // geçişiyle backend tarafında otomatik başlatılır.
  const machineFromDevice = (device: any): Machine => ({
    id: device.id,
    customerId: device.companyId ?? "",
    salesCaseId: device.opportunityId ?? "",
    stockItemId: device.inventoryItemId ?? "",
    serialNumber: device.serialNumber ?? device.inventorySerialNumber ?? device.inventoryItemId?.slice(0, 8) ?? "—",
    model: device.model ?? device.productModelName ?? device.inventoryItemId?.slice(0, 8) ?? "—",
    brand: device.brandName ?? "",
    type: device.productTypeName ?? "",
    controlUnit: device.controlUnit ?? "",
    controlUnitSerial: device.controlUnitSerialNumber ?? "",
    productModelId: device.productModelId ?? "",
    technicalSpecs: Array.isArray(device.technicalSpecs)
      ? device.technicalSpecs.map((spec: any) => ({
          key: String(spec.key ?? ""),
          value: [spec.value, spec.unit].filter(Boolean).join(" "),
        }))
      : [],
    deliveryDate: (device.deliveryDate as string | undefined)?.slice(0, 10) ?? "",
    installationDate: (device.installationDate as string | undefined)?.slice(0, 10) ?? "",
    warrantyStart: (device.warrantyStartDate as string | undefined)?.slice(0, 10) ?? "",
    warrantyEnd: (device.warrantyEndDate as string | undefined)?.slice(0, 10) ?? "",
    status:
      device.status?.code === "expired"
        ? "Out of Warranty"
        : device.status?.code === "void"
          ? "Decommissioned"
          : "Active",
  });

  const localMachineForCase = (sc: SalesCase) =>
    machines.find((x) => x.salesCaseId === sc.id) ??
    machines.find((x) => x.customerId === sc.customerId);

  const loadInstallationMachine = async (sc: SalesCase) => {
    const fallback = localMachineForCase(sc);
    try {
      const res = await inventoryService.customerDevices({ companyId: sc.customerId, pageSize: 200 });
      const device =
        (res.data ?? []).find((x: any) => x.opportunityId === sc.id) ??
        (res.data ?? []).find((x: any) => x.id === fallback?.id);
      return device ? machineFromDevice(device) : fallback;
    } catch {
      return fallback;
    }
  };

  const generateInstallationForm = async (sc: SalesCase) => {
    const cust = customers.find((c) => c.id === sc.customerId);
    const m = await loadInstallationMachine(sc);
    printOrWarn(
      installationFormDoc(
        {
          teslimTarihi: m?.deliveryDate ? trShortDate(m.deliveryDate) : "",
          kurulumTarihi: m?.installationDate ? trShortDate(m.installationDate) : "",
          formNo: sc.id.slice(0, 6).toUpperCase(),
          tezgah: m ? { marka: m.brand, tip: m.type, model: m.model, seriNo: m.serialNumber } : undefined,
          cnc: m?.controlUnit
            ? {
                marka: m.controlUnit.split(" ")[0],
                model: m.controlUnit.split(" ").slice(1).join(" ") || undefined,
                seriNo: m.controlUnitSerial,
              }
            : undefined,
          firma: cust?.name ?? "",
          ilgili: cust?.contactPerson,
          adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : "",
          telefon: cust?.phone,
          faks: cust?.fax,
          gsm: cust?.phone2,
          eposta: cust?.email,
          technicalSpecs: m?.technicalSpecs,
        },
        printAssetBase()
      )
    );
  };

  const moveToStage = async (id: string, from: SalesStage, to: SalesStage) => {
    if (from === to) return;
    if (to === "cancelled") {
      setLostId(id);
      return;
    }
    const sc = storeCases.find((s) => s.id === id);

    if (to === "stock_picking") {
      if (from !== "customs_approved") {
        toast.error("Stok seçimine geçmek için kart önce Gümrük Onayı aşamasında olmalı");
        return;
      }
      setStockPickCaseId(id);
      setSelectedStockIds([]);
      return;
    }

    // Sözleşme aşaması belge şartlı: önce üret+kaydet, kapı sağlanmazsa taşıma.
    if (to === "contract" && sc) {
      const ready = await prepareContract(sc);
      if (!ready) return;
    }

    try {
      await moveCase(id, to);
      toast.success("Kart taşındı", { description: `Yeni aşama: ${salesStageLabel(to)}` });
      if (to === "proforma" && sc) {
        void generateProforma(sc);
      }
      if (to === "installation" && sc) {
        await generateInstallationForm(sc);
        toast.success("Kurulum tutanağı hazırlandı", { description: "Garanti, kurulumla otomatik başlatıldı." });
      }
      if (to === "payment_plan" && sc) {
        // Kart Ödeme Planı aşamasına geldiğinde detay/dialog otomatik açılır;
        // SalesCaseDetail içindeki "Ödeme Planı Gerekli" kartı kullanıcıyı
        // "Ödeme Planı Oluştur" butonuna yönlendirir.
        onSelect({ ...sc, stage: to });
      }
    } catch (err: any) {
      toast.error("Kart taşınamadı", { description: err?.message ?? "Aşama gereksinimleri tamamlanmalı." });
    }
  };

  const columns: KanbanColumn<SalesCase>[] = SALES_STAGES.map((stage) => {
    const items = cases.filter((s) => s.stage === stage);
    const total = items.reduce((a, s) => a + s.estimatedAmount, 0);
    return {
      key: stage,
      title: salesStageLabel(stage),
      dot: STAGE_DOT[stage],
      items,
      footer: (
        <div className="flex items-center justify-between">
          <span>Toplam</span>
          <span>€ {total.toLocaleString()}</span>
        </div>
      ),
    };
  });

  return (
    <>
    <LostCaseDialog open={!!lostId} onOpenChange={(o) => !o && setLostId(null)} caseId={lostId} caseName={lostCustomer} />
    <DocumentPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    <Dialog open={!!stockPickCaseId} onOpenChange={(open) => !open && closeStockPicker()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Stok Seçimi</DialogTitle>
          <DialogDescription>
            Gümrük onayı tamamlanan kart için seri no seçimi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border/70 bg-muted/30 p-3">
            <div className="text-sm font-medium truncate">{stockPickCustomer?.name ?? "Firma bulunamadı"}</div>
            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {[stockPickCase?.requestedProduct, stockPickCase?.requestedModel].filter(Boolean).join(" · ") || "Ürün bilgisi yok"}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded bg-white px-2 py-1">Miktar: {stockPickTargetQty}</span>
              <span className="rounded bg-white px-2 py-1">Seçilen: {selectedStockIds.length}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Uygun seri numaraları</Label>
            {stockCandidates.length ? (
              <div className="max-h-72 overflow-y-auto rounded-md border border-border/70 bg-white">
                {stockCandidates.map((item) => {
                  const checked = selectedStockIds.includes(item.id);
                  const toggleItem = (checkedNext: boolean) => {
                    setSelectedStockIds((prev) =>
                      checkedNext
                        ? prev.includes(item.id)
                          ? prev
                          : [...prev, item.id]
                        : prev.filter((id) => id !== item.id)
                    );
                  };
                  return (
                    <div
                      key={item.id}
                      role="checkbox"
                      aria-checked={checked}
                      tabIndex={0}
                      className="flex cursor-pointer items-start gap-3 border-b border-border/50 p-3 last:border-0 hover:bg-muted/40"
                      onClick={() => toggleItem(!checked)}
                      onKeyDown={(event) => {
                        if (event.key === " " || event.key === "Enter") {
                          event.preventDefault();
                          toggleItem(!checked);
                        }
                      }}
                    >
                      <Checkbox
                        checked={checked}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(next) => {
                          toggleItem(next === true);
                        }}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {item.serialNumber || item.stockCode || item.id.slice(0, 8)}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {[item.brand, item.counterModel || item.counterType, item.warehouse].filter(Boolean).join(" · ")}
                        </span>
                        {item.status === "Reserved" && (
                          <span className="mt-1 inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                            {item.reservedCompanyName ? `${item.reservedCompanyName} için rezerve` : "Rezerve"}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Uygun hazır stok bulunamadı.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeStockPicker} disabled={stockPickSaving}>
            Vazgeç
          </Button>
          <Button type="button" onClick={() => void confirmStockPicking()} disabled={stockPickSaving || !selectedStockIds.length}>
            Stok Seçimine Al
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <KanbanBoard<SalesCase>
      columns={columns}
      fit={false}
      columnWidth={292}
      onMove={(id, from, to) => moveToStage(id, from as SalesStage, to as SalesStage)}
      renderCard={(s) => {
        const c = customers.find((x) => x.id === s.customerId);
        const u = users.find((x) => x.id === s.assignedUserId);
        const caseDocs = documents.filter((d) => d.salesCaseId === s.id);
        return (
          <Card
            data-testid={`sales-kanban-card-${s.id}`}
            onClick={() => onSelect(s)}
            className="overflow-hidden p-3 hover:shadow-md hover:border-primary/40 transition-all border-border/60 group bg-white"
          >
            <div className="flex items-start gap-2">
              <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center text-[10px] shrink-0">
                {c?.type !== "person" ? <Building2 className="size-3.5" /> : initials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-tight truncate group-hover:text-primary transition-colors">{c?.name ?? "Firma bulunamadı"}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-2 break-words mt-0.5">{s.requestedProduct}</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 opacity-80 hover:opacity-100"
                    title="Aşamaya gönder"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <ArrowRight className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenuLabel>Aşamaya gönder</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SALES_STAGES.map((stage) => (
                    <DropdownMenuItem
                      key={stage}
                      disabled={stage === s.stage}
                      onSelect={() => void moveToStage(s.id, s.stage, stage)}
                    >
                      <span className={`size-2 rounded-full shrink-0 ${STAGE_DOT[stage]}`} />
                      <span className="truncate">{salesStageLabel(stage)}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              <span className="inline-flex max-w-full truncate px-1.5 py-0.5 rounded text-[10px] bg-muted text-foreground/70">{s.requestedModel || "Model yok"}</span>
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-muted text-foreground/70">×{s.quantity}</span>
              {s.isOfferPrepared && (
                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700">Teklif</span>
              )}
            </div>

            <KanbanCardAttachments
              caseId={s.id}
              companyId={s.customerId}
              docs={caseDocs}
              onPreview={setPreviewDoc}
              onOpenCase={() => onSelect(s)}
            />

            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/60">
              <div className="min-w-0 truncate text-[13px] tabular-nums tracking-tight">
                {s.estimatedAmount.toLocaleString()} <span className="text-[11px] text-muted-foreground">{s.currency}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar className="size-2.5" />
                  {s.createdAt.slice(5)}
                </span>
                <Avatar className="size-5">
                  <AvatarFallback className="bg-primary/15 text-primary text-[9px]">
                    {initials(u?.name ?? "—")}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </Card>
        );
      }}
    />
    </>
  );
}
