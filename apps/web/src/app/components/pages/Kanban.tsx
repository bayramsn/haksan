import { useMemo, useState, type MouseEvent } from "react";
import { Card } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { SALES_STAGES, SalesCase, SalesStage, salesStageLabel, DocumentItem, type Machine } from "../../lib/mock";
import { ArrowRight, Building2, Calendar, CheckCircle2, FileSignature, FileText, MapPin, Printer } from "lucide-react";
import { KanbanBoard, KanbanColumn } from "../KanbanBoard";
import { KanbanCardAttachments } from "../KanbanCardAttachments";
import { DocumentPreviewDialog } from "../dialogs/DocumentPreviewDialog";
import { DocumentUploadDialog } from "../dialogs/DocumentUploadDialog";
import { useStore } from "../../lib/store";
import { LostCaseDialog } from "../dialogs/LostCaseDialog";
import { installationFormDoc, printAssetBase, trShortDate } from "../../lib/print";
import { printOrWarn } from "../../lib/pageHelpers";
import { relatedDeliveryFormNo, resolveServiceFormNo } from "../../lib/serviceFormNo";
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
import { CreateProformaDialog } from "../dialogs/CreateProformaDialog";
import { CreateContractDialog } from "../dialogs/CreateContractDialog";

export const STAGE_DOT: Record<string, string> = {
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
  const { cases: storeCases, moveCase, closeCase, customers, users, documents, offers, machines, stock, deliveries } = useStore();
  const cases = items ?? storeCases;
  const [lostId, setLostId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [stockPickCaseId, setStockPickCaseId] = useState<string | null>(null);
  const [selectedStockIds, setSelectedStockIds] = useState<string[]>([]);
  const [stockPickSaving, setStockPickSaving] = useState(false);
  const [invoiceUploadCase, setInvoiceUploadCase] = useState<SalesCase | null>(null);
  const [closingCaseId, setClosingCaseId] = useState<string | null>(null);
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

  const latestOfferForCase = (sc: SalesCase) =>
    offers
      .filter((offer) => offer.salesCaseId === sc.id || offer.companyId === sc.customerId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.quoteNo.localeCompare(a.quoteNo, "tr", { numeric: true }))[0];

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

  const hasCommercialInvoice = (caseId: string) =>
    documents.some((doc) => doc.salesCaseId === caseId && doc.type === "CommercialInvoice");

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
          formNo: resolveServiceFormNo({
            relatedFormNo: relatedDeliveryFormNo(deliveries, { salesCaseId: sc.id, machineId: m?.id }),
            salesCaseId: sc.id,
            machineId: m?.id,
            fallbackId: sc.id,
          }),
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

    if (to === "commercial_invoice" && sc && from === "payment_plan" && !hasCommercialInvoice(sc.id)) {
      if (!offers.some((offer) => offer.salesCaseId === sc.id)) {
        toast.error("Fatura için ilişkili teklif bulunamadı", { description: "Ticari fatura kaydı teklif üzerinden oluşturulur." });
        return;
      }
      toast.error("Ticari fatura gerekli", { description: "Karttaki Fatura butonuyla belgeyi yükledikten sonra kart otomatik taşınır." });
      return;
    }

    if (to === "contract" && sc && !documents.some((d) => d.salesCaseId === sc.id && d.type === "Contract")) {
      toast.error("Sözleşme gerekli", { description: "Karttaki Sözleşme butonuyla belgeyi oluşturduktan sonra aşamayı taşıyın." });
      return;
    }

    try {
      await moveCase(id, to);
      toast.success("Kart taşındı", { description: `Yeni aşama: ${salesStageLabel(to)}` });
      if (to === "installation" && sc) {
        toast.message("Kurulum aşamasına alındı", { description: "Tutanağı karttaki butonla manuel açabilirsiniz." });
      }
      if (to === "payment_plan" && sc) {
        // Otomatik dialog açılmaz; kullanıcı kartı açıp "Ödeme Planı Oluştur"
        // butonunu kendisi kullanır.
        toast.message("Ödeme planı gerekli", { description: "Kartı açıp Ödeme Planı Oluştur butonunu kullanın." });
      }
    } catch (err: any) {
      toast.error("Kart taşınamadı", { description: err?.message ?? "Aşama gereksinimleri tamamlanmalı." });
    }
  };

  const completeCommercialInvoiceStage = async (sc: SalesCase) => {
    setInvoiceUploadCase(null);
    try {
      await moveCase(sc.id, "commercial_invoice");
      toast.success("Ticari fatura yüklendi", { description: "Kart Ticari Fatura aşamasına alındı." });
    } catch (err: any) {
      toast.error("Kart taşınamadı", { description: err?.message ?? "Aşama gereksinimleri tamamlanmalı." });
      onSelect(sc);
    }
  };

  const finishDeliveredCase = async (sc: SalesCase) => {
    if (closingCaseId) return;
    if (!window.confirm("Bu kart 'Tamamlandı' olarak arşivlenecek (silinmez, Geçmiş'te kalır). Devam edilsin mi?")) return;
    setClosingCaseId(sc.id);
    try {
      await closeCase(sc.id);
      toast.success("Kart Geçmiş'e alındı", { description: salesStageLabel(sc.stage) });
    } catch (err: any) {
      toast.error("Kart bitirilemedi", { description: err?.message ?? "Yalnız teslim edilen veya iptal edilen kartlar kapatılabilir." });
    } finally {
      setClosingCaseId(null);
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
    <DocumentUploadDialog
      open={!!invoiceUploadCase}
      onOpenChange={(open) => {
        if (!open) setInvoiceUploadCase(null);
      }}
      defaultSalesCaseId={invoiceUploadCase?.id}
      defaultCompanyId={invoiceUploadCase?.customerId}
      defaultType="CommercialInvoice"
      onUploaded={() => {
        if (invoiceUploadCase) void completeCommercialInvoiceStage(invoiceUploadCase);
      }}
    />
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
              <span className="rounded bg-card px-2 py-1">Miktar: {stockPickTargetQty}</span>
              <span className="rounded bg-card px-2 py-1">Seçilen: {selectedStockIds.length}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Uygun seri numaraları</Label>
            {stockCandidates.length ? (
              <div className="max-h-72 overflow-y-auto rounded-md border border-border/70 bg-card">
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
                          <span className="mt-1 inline-flex rounded bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning">
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
      wrap
      columnWidth={typeof window !== 'undefined' && window.innerWidth < 640 ? 240 : 292}
      onMove={(id, from, to) => moveToStage(id, from as SalesStage, to as SalesStage)}
      renderCard={(s) => {
        const c = customers.find((x) => x.id === s.customerId);
        const u = users.find((x) => x.id === s.assignedUserId);
        const caseDocs = documents.filter((d) => d.salesCaseId === s.id);
        const latestOffer = latestOfferForCase(s);
        const hasProforma = caseDocs.some((d) => d.type === "Proforma");
        const hasContract = caseDocs.some((d) => d.type === "Contract");
        const stopCardClick = (event: MouseEvent) => event.stopPropagation();
        return (
          <Card
            data-testid={`sales-kanban-card-${s.id}`}
            onClick={() => onSelect(s)}
            className="group gap-0 overflow-hidden rounded-lg border border-border/60 bg-card p-3 shadow-xs transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md"
          >
            {/* Trello benzeri etiket şeridi: aşama rengi */}
            <div className="mb-2 flex items-center gap-1">
              <span className={`h-2 w-10 rounded-full ${STAGE_DOT[s.stage] ?? "bg-zinc-300"}`} />
              {s.isLost && <span className="h-2 w-10 rounded-full bg-destructive" />}
            </div>
            <div className="flex items-start gap-2">
              <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center text-[10px] shrink-0">
                {c?.type !== "person" ? <Building2 className="size-3.5" /> : initials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium leading-tight truncate group-hover:text-primary transition-colors">{c?.name ?? "Firma bulunamadı"}</div>
                {(c?.city || c?.district) && (
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">{[c?.district, c?.city].filter(Boolean).join(" / ")}</span>
                  </div>
                )}
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
              <span className="inline-flex max-w-full truncate px-1.5 py-0.5 rounded-md text-[10px] bg-muted text-muted-foreground">{s.requestedModel || "Model yok"}</span>
              <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10px] bg-muted text-muted-foreground">×{s.quantity}</span>
              {s.isOfferPrepared && (
                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-success-soft text-success">Teklif</span>
              )}
            </div>

            <KanbanCardAttachments
              caseId={s.id}
              companyId={s.customerId}
              docs={caseDocs}
              onPreview={setPreviewDoc}
              onOpenCase={() => onSelect(s)}
            />

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
              {latestOffer ? (
                <CreateProformaDialog
                  defaultQuoteId={latestOffer.id}
                  trigger={
                    <Button
                      type="button"
                      variant={hasProforma ? "secondary" : "outline"}
                      size="sm"
                      className="h-7 gap-1 rounded-md px-2 text-[10px] font-medium"
                      title="Proforma oluştur"
                      onClick={stopCardClick}
                      onMouseDown={stopCardClick}
                    >
                      <FileText className="size-3" /> Proforma
                    </Button>
                  }
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 rounded-md px-2 text-[10px] font-medium"
                  title="Önce teklif oluşturulmalı"
                  onClick={(event) => {
                    event.stopPropagation();
                    toast.error("Teklif gerekli", { description: "Proforma için önce bu karta bağlı teklif oluşturun." });
                  }}
                  onMouseDown={stopCardClick}
                >
                  <FileText className="size-3" /> Proforma
                </Button>
              )}
              {latestOffer ? (
                <CreateContractDialog
                  defaultQuoteId={latestOffer.id}
                  trigger={
                    <Button
                      type="button"
                      variant={hasContract ? "secondary" : "outline"}
                      size="sm"
                      className="h-7 gap-1 rounded-md px-2 text-[10px] font-medium"
                      title="Sözleşme oluştur"
                      onClick={stopCardClick}
                      onMouseDown={stopCardClick}
                    >
                      <FileSignature className="size-3" /> Sözleşme
                    </Button>
                  }
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 rounded-md px-2 text-[10px] font-medium"
                  title="Önce teklif oluşturulmalı"
                  onClick={(event) => {
                    event.stopPropagation();
                    toast.error("Teklif gerekli", { description: "Sözleşme için önce bu karta bağlı teklif oluşturun." });
                  }}
                  onMouseDown={stopCardClick}
                >
                  <FileSignature className="size-3" /> Sözleşme
                </Button>
              )}
              {s.stage === "payment_plan" && !hasCommercialInvoice(s.id) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 rounded-md px-2 text-[10px] font-medium"
                  title="Ticari fatura yükle"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!offers.some((offer) => offer.salesCaseId === s.id)) {
                      toast.error("Teklif gerekli", { description: "Ticari fatura kaydı teklif üzerinden oluşturulur." });
                      return;
                    }
                    setInvoiceUploadCase(s);
                  }}
                  onMouseDown={stopCardClick}
                >
                  <FileText className="size-3" /> Fatura
                </Button>
              )}
              {(s.stage === "installation" || s.stage === "delivered") && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 rounded-md px-2 text-[10px] font-medium"
                  title="Kurulum tutanağını aç"
                  onClick={(event) => {
                    event.stopPropagation();
                    void generateInstallationForm(s);
                  }}
                  onMouseDown={stopCardClick}
                >
                  <Printer className="size-3" /> Tutanak
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/60">
              <div className="min-w-0 truncate text-[13px] font-medium tabular-nums tracking-tight">
                {s.estimatedAmount.toLocaleString()} <span className="text-[11px] text-muted-foreground">{s.currency}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {s.stage === "delivered" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 rounded-md px-2 text-[10px] font-medium text-success hover:bg-success-soft hover:text-success"
                    disabled={closingCaseId === s.id}
                    title="Tamamla / Geçmiş'e al"
                    onClick={(event) => {
                      event.stopPropagation();
                      void finishDeliveredCase(s);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <CheckCircle2 className="size-3" /> Bitir
                  </Button>
                )}
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
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
