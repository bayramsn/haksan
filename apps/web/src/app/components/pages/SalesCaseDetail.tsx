import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { AlarmClock, ArrowLeft, CalendarClock, ChevronLeft, ChevronRight, Plus, Upload, X, XCircle, Eye, FileText, CreditCard, CheckCircle2, Trash2, Wrench, Pencil, Building2, UserRound } from "lucide-react";
import {
  SalesCase,
  LEAD_TEMPERATURE_HINTS,
  LEAD_TEMPERATURE_LABELS,
  LEAD_TEMPERATURE_ORDER,
  LEAD_TEMPERATURE_STYLES,
  LEAD_FOLLOW_UP_STATUS_LABELS,
  LEAD_FOLLOW_UP_STATUS_ORDER,
  LEAD_FOLLOW_UP_STATUS_STYLES,
  type Activity,
  type DocumentItem,
  type LeadFollowUpStatus,
  type LeadTemperature,
  type Offer,
} from "../../lib/mock";
import {
  PIPELINE_STAGE_FLOW,
  type OpportunityProcessActionKey,
} from "@haksan/shared";
import { ProcessChecklistPanel } from "./ProcessChecklistPanel";
import { OpportunityProcessCenter } from "./OpportunityProcessCenter";
import { StatusBadge } from "../Layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { AddActivityDialog, CreateCustomerDialog, CreateShipmentDialog } from "../dialogs/CreateDialogs";
import { QuoteDialog } from "../dialogs/QuoteDialog";
import { LostCaseDialog } from "../dialogs/LostCaseDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { DocumentUploadDialog } from "../dialogs/DocumentUploadDialog";
import { CreateProformaDialog } from "../dialogs/CreateProformaDialog";
import { CreateContractDialog } from "../dialogs/CreateContractDialog";
import { OpportunityStockPickerDialog } from "../dialogs/OpportunityStockPickerDialog";
import { OfferDetailDialog } from "./offers/OffersPage";
import { STAGE_DOT } from "./Kanban";
import { DialogSplitLayout, DialogSidebarSection } from "../shared/DialogSplitLayout";
import { NextActionDialog, actionDateLabel, isActionOverdue } from "../shared/NextActionDialog";
import { KanbanDetailDialogShell } from "../shared/KanbanDetailDialogShell";
import { documentService, fileService, opportunityService, quoteService, salesOrderService, financeService } from "../../../lib/services";
import { toast } from "sonner";
import { OpportunityQuickPanel } from "./OpportunityQuickPanel";
import { OpportunityWorkspace } from "./OpportunityWorkspace";

export function SalesCaseDetailDialog({
  sc,
  onClose,
  onNavigate,
}: {
  sc: SalesCase | null;
  onClose: () => void;
  onNavigate: (opportunityId: string) => void;
}) {
  const { cases } = useStore();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const currentIndex = sc ? cases.findIndex((item) => item.id === sc.id) : -1;
  const previous = currentIndex > 0 ? cases[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < cases.length - 1 ? cases[currentIndex + 1] : null;

  useEffect(() => {
    if (!sc) setWorkspaceOpen(false);
  }, [sc]);

  return (
    <Dialog open={!!sc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        style={workspaceOpen ? undefined : {
          left: "auto",
          right: 0,
          top: 0,
          width: "min(620px, 100vw)",
          minWidth: 0,
          maxWidth: "100vw",
          transform: "none",
        }}
        className={
          workspaceOpen
            ? "left-0 top-0 h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 overflow-x-hidden overflow-y-hidden rounded-none p-0 gap-0 sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90dvh] sm:w-[min(1240px,calc(100vw-2rem))] sm:max-w-none sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg [&>[data-slot=dialog-close]]:hidden"
            : "inset-y-0 left-auto right-0 top-0 h-dvh max-h-dvh w-[min(620px,100vw)] max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-y-0 border-r-0 p-0 gap-0 sm:max-w-none data-[state=open]:slide-in-from-right-full data-[state=closed]:slide-out-to-right-full data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 [&>[data-slot=dialog-close]]:hidden"
        }
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{sc?.requestedProduct ?? "Satış kartı detayı"}</DialogTitle>
          <DialogDescription>Satış kartı, teklifler ve aktiviteler</DialogDescription>
        </DialogHeader>
        {sc && (workspaceOpen ? (
          <SalesCaseDetailPage
            sc={sc}
            onBack={() => setWorkspaceOpen(false)}
            mode="dialog"
            previous={previous}
            next={next}
            onNavigate={onNavigate}
          />
        ) : (
          <OpportunityQuickPanel
            salesCase={sc}
            onClose={onClose}
            onOpenWorkspace={() => setWorkspaceOpen(true)}
            previous={previous}
            next={next}
            onNavigate={onNavigate}
          />
        ))}
      </DialogContent>
    </Dialog>
  );
}

export function SalesCaseDetailPage({
  sc,
  onBack,
  mode = "page",
  previous = null,
  next = null,
  onNavigate,
}: {
  sc: SalesCase;
  onBack: () => void;
  mode?: "page" | "dialog";
  previous?: SalesCase | null;
  next?: SalesCase | null;
  onNavigate?: (opportunityId: string) => void;
}) {
  const { offers, activities, customers, users, documents, payments, installations, refresh, deleteCase, updateCase, closeCase, updateActivity, deleteActivity } = useStore();
  const { hasRole, hasPermission } = useAuth();
  const isSuperAdmin = hasRole("super_admin");
  const canUpdate = hasPermission("opportunities.update");
  const canDelete = hasPermission("opportunities.delete");
  const [lostOpen, setLostOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [pendingActivityDelete, setPendingActivityDelete] = useState<Activity | null>(null);
  const [pendingDocumentDelete, setPendingDocumentDelete] = useState<DocumentItem | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [activityForm, setActivityForm] = useState({ type: "", title: "", note: "", result: "", date: "" });
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [companyLinking, setCompanyLinking] = useState(false);
  const [requestedProcessAction, setRequestedProcessAction] = useState<OpportunityProcessActionKey | null>(null);
  const canMarkLost = canUpdate && !sc.isLost && sc.stage !== "cancelled" && sc.stage !== "delivered";
  const c = customers.find((x) => x.id === sc.customerId);
  const hasCompany = Boolean(sc.customerId && c);
  const trelloCandidate = sc.externalMetadata?.candidate;
  const partyName =
    c?.name ??
    trelloCandidate?.companyTitle ??
    sc.leadCompanyTitle ??
    sc.leadContactName ??
    "Firma kaydı bekliyor";
  const compactSubtitle = [
    sc.requestedProduct,
    sc.externalSource === "trello" ? null : sc.requestedModel,
    `${sc.quantity} adet`,
  ].filter(Boolean).join(" · ");
  const u = users.find((x) => x.id === sc.assignedUserId);
  const acts = activities.filter((a) => a.salesCaseId === sc.id);
  const offs = offers.filter((o) => o.salesCaseId === sc.id);
  const latestOffer = offs.slice().sort((a, b) => b.revision - a.revision)[0];
  const docs = documents.filter((d) => d.salesCaseId === sc.id);
  const pays = payments.filter((p) => p.salesCaseId === sc.id);
  const relatedInstallation = installations.find((item) => item.salesCaseId === sc.id);
  // Kart "Sözleşme" aşamasına ulaştıysa ticari fatura yükleme alanını aç.
  const currentOperationIndex = PIPELINE_STAGE_FLOW.indexOf(sc.stage as any);
  const reachedContract = currentOperationIndex >= PIPELINE_STAGE_FLOW.indexOf("contract");
  const reachedPaymentPlan = currentOperationIndex >= PIPELINE_STAGE_FLOW.indexOf("payment_plan");
  const reachedInstallation = currentOperationIndex >= PIPELINE_STAGE_FLOW.indexOf("installation");
  const commercialInvoiceDoc = docs.find((d) => d.type === "CommercialInvoice");
  const selectedOffer = selectedOfferId ? offers.find((o) => o.id === selectedOfferId) ?? null : null;
  const selectedRevisions = selectedOffer
    ? offs.filter((o) => o.salesCaseId === sc.id).sort((a, b) => b.revision - a.revision)
    : [];
  const selectedOrder = selectedOffer
    ? salesOrders.find((order) => order.quoteId === selectedOffer.id || order.quote?.id === selectedOffer.id)
    : null;

  const linkCompany = async (companyId: string) => {
    if (companyLinking) return;
    setCompanyLinking(true);
    try {
      await opportunityService.linkCompany(sc.id, { companyId, createContact: true });
      await refresh();
      toast.success("Firma satış kartına bağlandı", {
        description: customers.find((customer) => customer.id === companyId)?.name ?? sc.leadCompanyTitle,
      });
    } catch (err: any) {
      toast.error("Firma satış kartına bağlanamadı", {
        description: err?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setCompanyLinking(false);
    }
  };

  useEffect(() => {
    if (!selectedOfferId) return;
    let cancelled = false;
    salesOrderService
      .list({ pageSize: 50 })
      .then((res) => {
        if (!cancelled) setSalesOrders(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setSalesOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOfferId]);

  const runQuoteAction = async (offerId: string, action: "send" | "approve" | "reject" | "approve-price" | "reject-price") => {
    try {
      if (action === "send") await quoteService.send(offerId);
      else if (action === "approve") await quoteService.approve(offerId);
      else if (action === "approve-price") await quoteService.approvePrice(offerId);
      else if (action === "reject-price") await quoteService.rejectPrice(offerId);
      else await quoteService.reject(offerId);
      toast.success(
        action === "send"
          ? "Teklif gönderildi olarak işaretlendi"
          : action === "approve"
            ? "Teklif onaylandı"
            : action === "approve-price"
              ? "Fiyat onaylandı"
              : action === "reject-price"
                ? "Fiyat reddedildi"
                : "Teklif reddedildi"
      );
      await refresh();
    } catch (err: any) {
      toast.error("İşlem başarısız", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  const downloadDocument = async (fileId: string | undefined, fileName: string) => {
    if (!fileId) {
      toast.message("Dosya bağlantısı yok", { description: "Bu kayıt yalnızca meta veri içeriyor." });
      return;
    }
    try {
      const signed = await fileService.signedDownload(fileId);
      const a = document.createElement("a");
      a.href = signed.downloadUrl;
      a.download = signed.filename || fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      toast.error("Doküman indirilemedi", { description: err?.message ?? "İstek başarısız oldu." });
    }
  };

  const registerCommercialInvoice = async (document: DocumentItem) => {
    if (!latestOffer?.id || !document.fileId) {
      throw new Error("Ticari fatura için önce teklif ve yüklenen dosya gereklidir.");
    }
    await documentService.createCommercialInvoice({
      quoteId: latestOffer.id,
      invoiceNo: `TF-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`,
      invoiceDate: new Date(),
      statusCode: "draft",
      fileId: document.fileId,
    });
    await refresh();
    toast.success("Ticari fatura kaydı ve dosyası oluşturuldu");
  };

  const deleteUploadedDocument = async (documentItem: DocumentItem) => {
    if (!documentItem.fileId || documentItem.source !== "uploaded_file" || deletingDocumentId) return;
    setDeletingDocumentId(documentItem.id);
    try {
      await fileService.remove(documentItem.fileId);
      await refresh();
      setPendingDocumentDelete(null);
      toast.success("Doküman silindi", { description: documentItem.fileName });
    } catch (err: any) {
      toast.error("Doküman silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const openActivityEdit = (activity: Activity) => {
    setEditingActivity(activity);
    setActivityForm({
      type: activity.type,
      title: activity.title,
      note: activity.note,
      result: activity.result ?? "",
      date: activity.date,
    });
  };

  const saveActivityEdit = async () => {
    if (!editingActivity) return;
    if (!activityForm.title.trim()) return toast.error("Aktivite başlığı zorunludur");
    try {
      await updateActivity(editingActivity.id, {
        type: activityForm.type,
        title: activityForm.title.trim(),
        note: activityForm.note.trim(),
        result: activityForm.result.trim(),
        date: activityForm.date,
      });
      toast.success("Aktivite güncellendi");
      setEditingActivity(null);
    } catch (err: any) {
      toast.error("Aktivite güncellenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  const removeActivity = async (activity: Activity) => {
    try {
      await deleteActivity(activity.id);
      toast.success("Aktivite silindi");
      setPendingActivityDelete(null);
    } catch (err: any) {
      toast.error("Aktivite silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  const handleProcessAction = async (actionKey: OpportunityProcessActionKey) => {
    const approvalByAction: Partial<Record<OpportunityProcessActionKey, "payment" | "customs" | "invoice" | "installation" | "win">> = {
      approve_payment: "payment",
      approve_customs: "customs",
      approve_invoice: "invoice",
      approve_installation: "installation",
      approve_win: "win",
    };
    const approvalType = approvalByAction[actionKey];
    if (approvalType) {
      try {
        await opportunityService.decideApproval(sc.id, approvalType, { decision: "approved" });
        await refresh();
        toast.success("Onay verildi");
      } catch (error: any) {
        toast.error("Onay verilemedi", { description: error?.message ?? "Gerekli kanıtları kontrol edin." });
      }
      return;
    }
    if (actionKey === "approve_quote") {
      const candidate = offs.find((offer) => offer.status !== "Approved") ?? offs[0];
      if (candidate) {
        await runQuoteAction(candidate.id, "approve");
        return;
      }
    }
    if (actionKey === "complete_shipment") {
      setRequestedProcessAction("create_shipment");
      return;
    }
    if (actionKey === "open_installation" || actionKey === "complete_installation") {
      document.getElementById("opportunity-installation")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setRequestedProcessAction(null);
      toast.message("Kurulum kaydı servis bölümünden açılabilir", {
        description: relatedInstallation
          ? "Mevcut kurulum kaydı aşağıda gösteriliyor."
          : "Önce Kurulum operasyon adımına geçerek servis kaydını oluşturun.",
      });
      return;
    }
    setRequestedProcessAction(actionKey);
    requestAnimationFrame(() => {
      document.getElementById("opportunity-process-actions")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const canPerformProcessAction = (actionKey: OpportunityProcessActionKey) => {
    if (actionKey.startsWith("approve_")) {
      if (actionKey === "approve_quote") return hasPermission("quotes.approve");
      return hasPermission("opportunities.approve");
    }
    if (actionKey === "create_quote") return hasPermission("quotes.create");
    if (actionKey === "create_proforma") return hasPermission("proformas.create");
    if (actionKey === "create_contract") return hasPermission("contracts.create");
    if (actionKey === "create_commercial_invoice") return hasPermission("commercial_invoices.create");
    if (actionKey === "reserve_stock") return hasPermission("inventory.update");
    if (actionKey === "create_shipment" || actionKey === "complete_shipment") {
      return hasPermission("shipments.create") || hasPermission("shipments.update");
    }
    if (actionKey === "open_installation" || actionKey === "complete_installation") {
      return hasPermission("installations.create") || hasPermission("installations.update");
    }
    return canUpdate;
  };

  const handleCloseCase = async () => {
    if (closeSaving) return;
    setCloseSaving(true);
    try {
      await closeCase(sc.id);
      toast.success("Kart Geçmiş'e alındı", { description: partyName });
      setCloseOpen(false);
      onBack();
    } catch (err: any) {
      toast.error("Kart bitirilemedi", { description: err?.message ?? "Yalnız teslim edilen veya iptal edilen kartlar kapatılabilir." });
    } finally {
      setCloseSaving(false);
    }
  };

  const handleDeleteCase = async () => {
    if (deleteSaving) return;
    setDeleteSaving(true);
    try {
      await deleteCase(sc.id);
      toast.success("Satış kartı silindi", { description: partyName });
      setDeleteOpen(false);
      onBack();
    } catch (err: any) {
      toast.error("Satış kartı silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setDeleteSaving(false);
    }
  };

  const rootClass = "space-y-4";
  const toolbarClass =
    mode === "dialog"
      ? "hidden"
      : "flex items-center justify-between gap-2";
  const bodyClass = "space-y-4";
  const activityPanel = (
    <div className="space-y-3">
      <AddActivityDialog
        salesCaseId={sc.id}
        customerId={sc.customerId}
        trigger={
          <Button variant="outline" className="h-10 w-full justify-start rounded-lg bg-white text-left text-sm text-muted-foreground">
            <Plus className="size-4" /> Yorum / aktivite ekle...
          </Button>
        }
      />
      <div className="space-y-3">
        {acts.map((a) => (
          <div key={a.id} className="flex items-start gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {(a.createdByName || users.find((u) => u.id === a.byUserId)?.name || "HS")
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toLocaleUpperCase("tr-TR")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-semibold text-foreground">{a.createdByName || users.find((u) => u.id === a.byUserId)?.name || "Haksan Cnc Satış"}</span>
                <span className="text-muted-foreground tabular-nums">{a.date}</span>
                {a.type && <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-muted-foreground">{a.type}</span>}
              </div>
              <div className="mt-1 rounded-lg border border-border/70 bg-white px-3 py-2 text-sm leading-relaxed shadow-xs">
                <div className="font-medium">{a.title}</div>
                {a.note && <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{a.note}</div>}
                {a.result && <div className="mt-2 rounded-md bg-muted/60 px-2 py-1 text-xs">{a.result}</div>}
                {Array.isArray(a.files) && a.files.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.files.map((file: any) => (
                      <button
                        key={file.id ?? file.fileId ?? file.linkId}
                        type="button"
                        className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:text-primary"
                        onClick={() => downloadDocument(file.id ?? file.fileId, file.originalFilename ?? file.filename ?? "aktivite-dosyasi")}
                      >
                        <FileText className="size-3.5 shrink-0" />
                        <span className="truncate">{file.originalFilename ?? file.filename ?? "Dosya"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => openActivityEdit(a)}>Düzenle</button>
                <span>·</span>
                <button type="button" className="text-destructive underline-offset-2 hover:underline" onClick={() => setPendingActivityDelete(a)}>Sil</button>
              </div>
            </div>
          </div>
        ))}
        {acts.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-white px-3 py-8 text-center text-sm text-muted-foreground">
            Aktivite yok.
          </div>
        )}
      </div>
    </div>
  );

  const companyLinkingPanel = !hasCompany ? (
    <Card className="border-warning/30 bg-warning-soft/55">
      <CardContent className="p-4 sm:p-5">
        <div className="min-w-0 space-y-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-warning shadow-xs">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Tekliften önce firma kaydı gerekli</div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Lead bilgileri satış kartında kalır. Mevcut bir firmayı bağlayın veya bu karttan yeni firma kaydını açın.
              </div>
            </div>
          </div>
          <div className="grid w-full min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Select disabled={companyLinking} onValueChange={(companyId) => void linkCompany(companyId)}>
              <SelectTrigger className="w-full min-w-0 bg-white">
                <SelectValue placeholder={companyLinking ? "Firma bağlanıyor…" : "Mevcut firma bağla"} />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CreateCustomerDialog
              draftKey={`draft.customer.sales-case.${sc.id}`}
              initialValues={{
                name: trelloCandidate?.companyTitle ?? sc.leadCompanyTitle ?? "",
                contactSourceCode: sc.leadContactMethodCode ?? "",
                phone: trelloCandidate?.phone ?? (sc.leadContactMethodCode === "phone" ? sc.leadContactValue ?? "" : ""),
                email: trelloCandidate?.email ?? (sc.leadContactMethodCode === "email" ? sc.leadContactValue ?? "" : ""),
                initialNote: [
                  sc.externalSource === "trello"
                    ? "Trello satış kartından Potansiyel firma olarak oluşturuldu."
                    : "Hızlı lead satış kartından oluşturuldu.",
                  trelloCandidate?.contactName || sc.leadContactName
                    ? `Kontak: ${trelloCandidate?.contactName ?? sc.leadContactName}`
                    : null,
                  sc.leadContactMethodName ? `İrtibat şekli: ${sc.leadContactMethodName}` : null,
                ].filter(Boolean).join("\n"),
              }}
              onCreated={linkCompany}
              trigger={
                <Button type="button" className="w-full gap-1.5 whitespace-nowrap sm:w-auto" disabled={companyLinking}>
                  <Plus className="size-4" /> Yeni Firma Oluştur
                </Button>
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  ) : null;

  const content = (
    <>
      <div className={toolbarClass}>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          {mode === "dialog" ? <X className="size-4" /> : <ArrowLeft className="size-4" />}
          {mode === "dialog" ? "Kapat" : "Listeye dön"}
        </Button>
      </div>

      <LostCaseDialog open={lostOpen} onOpenChange={setLostOpen} caseId={sc.id} caseName={partyName} />
      <QuoteDialog
        open={requestedProcessAction === "create_quote"}
        onOpenChange={(open) => !open && setRequestedProcessAction(null)}
        defaultCustomerId={sc.customerId || undefined}
        defaultCaseId={sc.id}
      />
      <CreateProformaDialog
        open={requestedProcessAction === "create_proforma"}
        onOpenChange={(open) => !open && setRequestedProcessAction(null)}
        defaultQuoteId={latestOffer?.id}
        onCreated={() => {
          setRequestedProcessAction(null);
          void refresh();
        }}
      />
      <CreateContractDialog
        open={requestedProcessAction === "create_contract"}
        onOpenChange={(open) => !open && setRequestedProcessAction(null)}
        defaultQuoteId={latestOffer?.id}
        onCreated={() => {
          setRequestedProcessAction(null);
          void refresh();
        }}
      />
      <CreatePaymentPlanDialog
        sc={sc}
        offs={offs}
        c={c}
        open={requestedProcessAction === "create_payment_plan"}
        onOpenChange={(open) => !open && setRequestedProcessAction(null)}
        onCreated={() => {
          setRequestedProcessAction(null);
          void refresh();
        }}
      />
      <DocumentUploadDialog
        open={requestedProcessAction === "create_commercial_invoice"}
        onOpenChange={(open) => !open && setRequestedProcessAction(null)}
        defaultSalesCaseId={sc.id}
        defaultCompanyId={sc.customerId || undefined}
        defaultType="CommercialInvoice"
        onUploaded={async (document) => {
          await registerCommercialInvoice(document);
          setRequestedProcessAction(null);
        }}
      />
      <CreateShipmentDialog
        open={requestedProcessAction === "create_shipment"}
        onOpenChange={(open) => !open && setRequestedProcessAction(null)}
        defaultSalesCaseId={sc.id}
        onCreated={() => {
          setRequestedProcessAction(null);
          void refresh();
        }}
      />
      <OpportunityStockPickerDialog
        open={requestedProcessAction === "reserve_stock"}
        onOpenChange={(open) => !open && setRequestedProcessAction(null)}
        salesCase={sc}
        onCompleted={async () => {
          setRequestedProcessAction(null);
          await refresh();
        }}
      />
      <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleteSaving && setDeleteOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Satış kartını sil?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{partyName}</b> için açılan <b>{sc.requestedProduct}</b> satış kartı silinecek.
              Bağlı teklif, doküman veya ödeme varsa backend işlemi reddedebilir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSaving}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteSaving}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteCase();
              }}
            >
              {deleteSaving ? "Siliniyor..." : "Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={closeOpen} onOpenChange={(open) => !closeSaving && setCloseOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Satış kartı tamamlansın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{partyName}</b> · <b>{sc.requestedProduct}</b> kartı silinmeden Geçmiş görünümüne taşınacak. Teklif, belge ve aktivite bağlantıları korunur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeSaving}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction disabled={closeSaving} onClick={(event) => { event.preventDefault(); void handleCloseCase(); }}>
              {closeSaving ? "Tamamlanıyor…" : "Tamamla ve arşivle"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(pendingActivityDelete)} onOpenChange={(open) => !open && setPendingActivityDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aktivite silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{pendingActivityDelete?.title}</b> aktivitesi satış kartı zaman çizelgesinden kalıcı olarak kaldırılacak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); if (pendingActivityDelete) void removeActivity(pendingActivityDelete); }}>
              Aktiviteyi sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(pendingDocumentDelete)}
        onOpenChange={(open) => !open && !deletingDocumentId && setPendingDocumentDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Yüklenen dosyayı sil?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{pendingDocumentDelete?.fileName}</b> doküman listesinden kaldırılacak ve artık indirilemeyecek.
              Firma ve satış kartı kayıtları etkilenmez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingDocumentId)}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={Boolean(deletingDocumentId)}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDocumentDelete) void deleteUploadedDocument(pendingDocumentDelete);
              }}
            >
              {deletingDocumentId ? "Siliniyor…" : "Dosyayı sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={bodyClass}>
      <DialogSplitLayout
        asideFirstOnMobile
        className={
          mode === "page"
            ? "lg:[&>aside]:top-4"
            : "lg:grid-cols-1 [&>aside]:hidden"
        }
        aside={
          <>
            <DialogSidebarSection title="Özet">
              <div className="text-2xl font-semibold tabular-nums">{sc.estimatedAmount.toLocaleString()} {sc.currency}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Vade:</span>
                <input
                  type="number"
                  min={0}
                  className="h-6 w-16 rounded border border-border/70 bg-card px-1.5 text-right text-xs tabular-nums outline-none focus:border-ring"
                  defaultValue={sc.paymentTermDays ?? ""}
                  placeholder="—"
                  disabled={!canUpdate}
                  onBlur={async (e) => {
                    const raw = e.target.value.trim();
                    const next = raw === "" ? null : Math.max(0, Number(raw) || 0);
                    if ((next ?? undefined) === sc.paymentTermDays) return;
                    await updateCase(sc.id, { paymentTermDays: next });
                  }}
                />
                <span>gün</span>
              </div>
              <div className="mt-2"><StatusBadge status={sc.stage} /></div>
              <div className="mt-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Alım niyeti</div>
                <Select
                  value={sc.leadTemperature ?? "unknown"}
                  disabled={!canUpdate}
                  onValueChange={async (value) => {
                    await updateCase(sc.id, { leadTemperature: value as LeadTemperature });
                  }}
                >
                  <SelectTrigger className="h-7 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_TEMPERATURE_ORDER.map((code) => (
                      <SelectItem key={code} value={code}>
                        <span className="flex items-center gap-1.5">
                          <span className={`size-1.5 rounded-full ${LEAD_TEMPERATURE_STYLES[code].dot}`} />
                          {LEAD_TEMPERATURE_LABELS[code]}
                          <span className="text-muted-foreground">· {LEAD_TEMPERATURE_HINTS[code]}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isSuperAdmin ? (
                <Select
                  value={sc.assignedUserId ?? '__none__'}
                  onValueChange={async (v) => {
                    await updateCase(sc.id, { assignedUserId: v === '__none__' ? '' : v });
                  }}
                >
                  <SelectTrigger className="h-7 text-xs w-full mt-1">
                    <SelectValue placeholder="Atanmadı" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Atanmadı</SelectItem>
                    {users.map((usr) => (
                      <SelectItem key={usr.id} value={usr.id}>{usr.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-7 text-xs mt-1 text-muted-foreground">
                  {users.find((u) => u.id === sc.assignedUserId)?.name ?? "Atanmadı"}
                </div>
              )}
            </DialogSidebarSection>
            <DialogSidebarSection title="Takip Planı">
              <div className={`rounded-r-lg border-l-[3px] px-3 py-2.5 ${isActionOverdue(sc.nextActionAt) ? "border-red-500 bg-red-50/75" : "border-primary bg-blue-50/70"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
                    <AlarmClock className="size-3.5" /> Sonraki aksiyon
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[9px] ${isActionOverdue(sc.nextActionAt) ? "font-semibold text-red-700" : "text-muted-foreground"}`}>
                    <CalendarClock className="size-3" />
                    {isActionOverdue(sc.nextActionAt) ? "Gecikti · " : ""}{actionDateLabel(sc.nextActionAt)}
                  </span>
                </div>
                <div className={`mt-1.5 text-xs leading-5 ${sc.nextAction ? "font-medium" : "text-muted-foreground"}`}>
                  {sc.nextAction || "Henüz bir sonraki aksiyon planlanmadı."}
                </div>
              </div>
              {sc.qualificationStage === "lead" && (
                <div className="mt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Lead durumu</div>
                  <Select
                    value={sc.leadFollowUpStatus ?? "new"}
                    disabled={!canUpdate}
                    onValueChange={(value) =>
                      void updateCase(sc.id, { leadFollowUpStatus: value as LeadFollowUpStatus })
                    }
                  >
                    <SelectTrigger className={`h-8 w-full text-xs ${LEAD_FOLLOW_UP_STATUS_STYLES[sc.leadFollowUpStatus ?? "new"]}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_FOLLOW_UP_STATUS_ORDER.map((status) => (
                        <SelectItem key={status} value={status}>{LEAD_FOLLOW_UP_STATUS_LABELS[status]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {canUpdate && (
                <NextActionDialog
                  salesCase={sc}
                  onSave={(patch) => updateCase(sc.id, patch)}
                  trigger={
                    <Button type="button" variant="outline" size="sm" className="mt-2 h-8 w-full gap-1.5 text-[10px]">
                      <AlarmClock className="size-3.5" />
                      {sc.nextAction ? "Aksiyonu düzenle" : "Aksiyon planla"}
                    </Button>
                  }
                />
              )}
            </DialogSidebarSection>
            {sc.leadContactName && (
              <DialogSidebarSection title="Lead Bilgisi">
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <UserRound className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <div>
                      <div className="text-muted-foreground">Kontak</div>
                      <div className="font-medium text-foreground">{sc.leadContactName}</div>
                    </div>
                  </div>
                  {sc.leadCompanyTitle && (
                    <div className="flex items-start gap-2">
                      <Building2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <div>
                        <div className="text-muted-foreground">Girilen firma ünvanı</div>
                        <div className="font-medium text-foreground">{sc.leadCompanyTitle}</div>
                      </div>
                    </div>
                  )}
                  {(sc.leadContactMethodName || sc.leadPhone || sc.leadEmail || sc.leadContactValue) && (
                    <div>
                      <div className="text-muted-foreground">İrtibat</div>
                      <div className="font-medium text-foreground">
                        {[sc.leadContactMethodName, sc.leadPhone, sc.leadEmail].filter(Boolean).join(" · ") ||
                          [sc.leadContactMethodName, sc.leadContactValue].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  )}
                  {sc.leadCity && (
                    <div>
                      <div className="text-muted-foreground">Şehir</div>
                      <div className="font-medium text-foreground">{sc.leadCity}</div>
                    </div>
                  )}
                </div>
              </DialogSidebarSection>
            )}
            {sc.externalSource === "trello" && (
              <DialogSidebarSection title="Trello Kaynağı">
                <div className="min-w-0 space-y-2 text-xs">
                  <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1">
                    <span className="text-muted-foreground">Pano</span>
                    <span className="min-w-0 break-words font-medium">{sc.externalMetadata?.boardName || "—"}</span>
                    <span className="text-muted-foreground">Liste</span>
                    <span className="min-w-0 break-words font-medium">{sc.externalMetadata?.listName || "—"}</span>
                    {sc.externalMetadata?.labels && (
                      <>
                        <span className="text-muted-foreground">Etiket</span>
                        <span className="min-w-0 break-words font-medium">{sc.externalMetadata.labels}</span>
                      </>
                    )}
                    {sc.externalMetadata?.members && (
                      <>
                        <span className="text-muted-foreground">Üyeler</span>
                        <span className="min-w-0 break-words font-medium">{sc.externalMetadata.members}</span>
                      </>
                    )}
                  </div>
                  {sc.externalUrl && (
                    <a
                      href={sc.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block min-w-0 break-all rounded-md border border-border/60 bg-white px-2.5 py-2 text-primary hover:underline"
                    >
                      {sc.externalUrl}
                    </a>
                  )}
                </div>
              </DialogSidebarSection>
            )}
            <DialogSidebarSection title="İşlemler">
              {canUpdate && sc.stage === "delivered" && !sc.closedAt && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCloseOpen(true)}
                  disabled={closeSaving}
                  className="w-full justify-start gap-2 rounded-md border-success/30 text-success hover:bg-success-soft hover:text-success"
                >
                  <CheckCircle2 className="size-4" /> Bitir
                </Button>
              )}
              {canMarkLost && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLostOpen(true)}
                  className="w-full justify-start gap-2 rounded-md border-destructive/30 text-destructive hover:bg-destructive-soft hover:text-destructive"
                >
                  <XCircle className="size-4" /> Kaybedildi olarak işaretle
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  className="w-full justify-start gap-2 rounded-md border-destructive/30 text-destructive hover:bg-destructive-soft hover:text-destructive"
                >
                  <Trash2 className="size-4" /> Satış Kartını Sil
                </Button>
              )}
            </DialogSidebarSection>
            {mode === "dialog" && (
              <DialogSidebarSection title="Yorumlar ve Aktivite">
                {activityPanel}
              </DialogSidebarSection>
            )}
          </>
        }
      >
      {mode === "dialog" ? (
        <OpportunityWorkspace
          salesCase={sc}
          processCenter={
            <OpportunityProcessCenter
              salesCase={sc}
              canUpdate={canUpdate}
              canPerformAction={canPerformProcessAction}
              onRefresh={refresh}
              onAction={(actionKey) => void handleProcessAction(actionKey)}
            />
          }
          processChecklist={
            <div id="opportunity-process-actions" className="scroll-mt-24">
              <ProcessChecklistPanel sc={sc} requestedAction={requestedProcessAction} onActionHandled={() => setRequestedProcessAction(null)} />
            </div>
          }
          companyLinkingPanel={companyLinkingPanel}
          onOpenOffer={setSelectedOfferId}
          onDownloadDocument={(document) => void downloadDocument(document.fileId, document.fileName)}
        />
      ) : (
      <>
      <OpportunityProcessCenter
        salesCase={sc}
        canUpdate={canUpdate}
        canPerformAction={canPerformProcessAction}
        onRefresh={refresh}
        onAction={(actionKey) => void handleProcessAction(actionKey)}
      />

      <div id="opportunity-process-actions" className="scroll-mt-24">
        <ProcessChecklistPanel sc={sc} requestedAction={requestedProcessAction} onActionHandled={() => setRequestedProcessAction(null)} />
      </div>

      {!hasCompany && (
        <Card className="border-warning/30 bg-warning-soft/55">
          <CardContent className="p-4 sm:p-5">
            <div className="min-w-0 space-y-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-warning shadow-xs">
                  <Building2 className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Tekliften önce firma kaydı gerekli</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Lead bilgileri satış kartında kalır. Mevcut bir firmayı bağlayın veya bu karttan yeni firma kaydını açın.
                  </div>
                </div>
              </div>
              <div className="grid w-full min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Select disabled={companyLinking} onValueChange={(companyId) => void linkCompany(companyId)}>
                  <SelectTrigger className="w-full min-w-0 bg-white">
                    <SelectValue placeholder={companyLinking ? "Firma bağlanıyor…" : "Mevcut firma bağla"} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <CreateCustomerDialog
                  draftKey={`draft.customer.sales-case.${sc.id}`}
                  initialValues={{
                    name: trelloCandidate?.companyTitle ?? sc.leadCompanyTitle ?? "",
                    contactSourceCode: sc.leadContactMethodCode ?? "",
                    phone: trelloCandidate?.phone ?? (sc.leadContactMethodCode === "phone" ? sc.leadContactValue ?? "" : ""),
                    email: trelloCandidate?.email ?? (sc.leadContactMethodCode === "email" ? sc.leadContactValue ?? "" : ""),
                    initialNote: [
                      sc.externalSource === "trello"
                        ? "Trello satış kartından Potansiyel firma olarak oluşturuldu."
                        : "Hızlı lead satış kartından oluşturuldu.",
                      trelloCandidate?.contactName || sc.leadContactName
                        ? `Kontak: ${trelloCandidate?.contactName ?? sc.leadContactName}`
                        : null,
                      sc.leadContactMethodName ? `İrtibat şekli: ${sc.leadContactMethodName}` : null,
                    ].filter(Boolean).join("\n"),
                  }}
                  onCreated={linkCompany}
                  trigger={
                    <Button type="button" className="w-full gap-1.5 whitespace-nowrap sm:w-auto" disabled={companyLinking}>
                      <Plus className="size-4" /> Yeni Firma Oluştur
                    </Button>
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {sc.stage === "payment_plan" && pays.length === 0 && (
        <Card className="border-success/30 bg-success-soft/60">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="size-10 rounded-lg bg-success-soft text-success grid place-items-center shrink-0">
                  <CreditCard className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">Ödeme Planı Gerekli</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Kart şu anda Ödeme Planı aşamasında. İlerlemek için lütfen ödeme planını oluşturun.
                  </div>
                </div>
              </div>
              <div>
                <CreatePaymentPlanDialog
                  sc={sc}
                  offs={offs}
                  c={c ?? null}
                  onCreated={refresh}
                  trigger={
                    <Button size="sm" className="gap-1 bg-success hover:bg-success/90 text-success-foreground">
                      <Plus className="size-4" /> Ödeme Planı Oluştur
                    </Button>
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {reachedContract && (
        <Card className="border-warning/30 bg-warning-soft/60">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="size-10 rounded-lg bg-warning-soft text-warning grid place-items-center shrink-0">
                  <FileText className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">Ticari Fatura</div>
                  {commercialInvoiceDoc ? (
                    <div className="text-xs text-muted-foreground mt-0.5 break-words">
                      Yüklendi: <span className="text-foreground">{commercialInvoiceDoc.fileName}</span>
                      {commercialInvoiceDoc.size ? ` · ${commercialInvoiceDoc.size}` : ""}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Sözleşme aşamasına gelindi. Ticari fatura belgesini yükleyin.
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {commercialInvoiceDoc?.fileId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => downloadDocument(commercialInvoiceDoc.fileId, commercialInvoiceDoc.fileName)}
                  >
                    <Eye className="size-4" /> Görüntüle
                  </Button>
                )}
                <DocumentUploadDialog
                  defaultSalesCaseId={sc.id}
                  defaultCompanyId={sc.customerId}
                  defaultType="CommercialInvoice"
                  onUploaded={registerCommercialInvoice}
                  trigger={
                    <Button size="sm" className="gap-1">
                      <Upload className="size-4" />
                      {commercialInvoiceDoc ? "Yeniden yükle" : "Ticari fatura yükle"}
                    </Button>
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(reachedInstallation || relatedInstallation) && (
        <Card id="opportunity-installation" className="scroll-mt-24 border-info/30 bg-info-soft/60">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="size-10 rounded-lg bg-info-soft text-info grid place-items-center shrink-0">
                  <Wrench className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">Servis Kurulum</div>
                  {relatedInstallation ? (
                    <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <span>Durum: <span className="text-foreground">{relatedInstallation.statusName}</span></span>
                      <span>Teknisyen: <span className="text-foreground">{relatedInstallation.technician}</span></span>
                      <span>Plan: <span className="text-foreground">{relatedInstallation.scheduledDate || "—"}</span></span>
                      <span>Tamamlanma: <span className="text-foreground">{relatedInstallation.completedDate || "—"}</span></span>
                      <span className="sm:col-span-2">
                        Cihaz: <span className="text-foreground">{relatedInstallation.deviceLabel}</span>
                        {relatedInstallation.serialNumber ? ` · ${relatedInstallation.serialNumber}` : ""}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Kart kurulum aşamasına geldi. Servis kurulum kaydı yüklenince durum burada görünecek.
                    </div>
                  )}
                </div>
              </div>
              {relatedInstallation?.statusCode === "completed" && (
                <div className="inline-flex h-8 items-center gap-1 rounded-md border border-success/30 bg-card px-2.5 text-xs text-success">
                  <CheckCircle2 className="size-3.5" /> Kurulum tamamlandı
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={mode === "dialog" ? "offers" : "timeline"}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          {mode !== "dialog" && (
            <TabsTrigger value="timeline" className="flex-none rounded-none border-0 border-b-2 border-transparent px-3 py-2 text-[13px] data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">Zaman Çizelgesi</TabsTrigger>
          )}
          <TabsTrigger value="offers" className="flex-none rounded-none border-0 border-b-2 border-transparent px-3 py-2 text-[13px] data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">Teklifler ({offs.length})</TabsTrigger>
          <TabsTrigger value="documents" className="flex-none rounded-none border-0 border-b-2 border-transparent px-3 py-2 text-[13px] data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">Dokümanlar ({docs.length})</TabsTrigger>
          <TabsTrigger value="payments" className="flex-none rounded-none border-0 border-b-2 border-transparent px-3 py-2 text-[13px] data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">Ödemeler ({pays.length})</TabsTrigger>
        </TabsList>

        {mode !== "dialog" && (
        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Aktiviteler</CardTitle>
              <AddActivityDialog
                salesCaseId={sc.id}
                customerId={sc.customerId}
                trigger={<Button size="sm" className="gap-1"><Plus className="size-4" /> Aktivite Ekle</Button>}
              />
            </CardHeader>
            <CardContent>
              <ol className="relative border-l border-border ml-3 space-y-4">
                {acts.map((a) => (
                  <li key={a.id} className="ml-4">
                    <span className="absolute -left-[5px] size-2.5 rounded-full bg-primary ring-4 ring-background" />
                    <div className="rounded-lg border border-border/60 bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {[a.date, a.type, a.createdByName || users.find((u) => u.id === a.byUserId)?.name].filter(Boolean).join(" · ")}
                          </div>
                          <div className="mt-1 text-sm font-medium">{a.title}</div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`${a.title} aktivitesini düzenle`}
                            title="Aktiviteyi düzenle"
                            className="size-8"
                            onClick={() => openActivityEdit(a)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`${a.title} aktivitesini sil`}
                            title="Aktiviteyi sil"
                            className="size-8 text-destructive"
                            onClick={() => setPendingActivityDelete(a)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                      {a.note && <div className="mt-2 text-sm text-muted-foreground">{a.note}</div>}
                      {a.result && (
                        <div className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
                          {a.result}
                        </div>
                      )}
                      {Array.isArray(a.files) && a.files.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {a.files.map((file: any) => (
                            <button
                              key={file.id ?? file.fileId ?? file.linkId}
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:text-primary"
                              onClick={() => downloadDocument(file.id ?? file.fileId, file.originalFilename ?? file.filename ?? "aktivite-dosyasi")}
                            >
                              <FileText className="size-3.5" />
                              <span className="max-w-[180px] truncate">{file.originalFilename ?? file.filename ?? "Dosya"}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
                {acts.length === 0 && <div className="text-sm text-muted-foreground">Aktivite yok.</div>}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        <TabsContent value="offers" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Teklifler</CardTitle>
              {hasCompany ? (
                <QuoteDialog
                  defaultCaseId={sc.id}
                  defaultCustomerId={sc.customerId}
                  trigger={<Button size="sm" className="gap-1"><Plus className="size-4" /> Yeni Teklif</Button>}
                />
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 border-warning/30 text-warning"
                  onClick={() => toast.error("Firma kaydı gerekli", {
                    description: "Yeni teklif açmadan önce yukarıdaki alandan firma oluşturun veya mevcut firmayı bağlayın.",
                  })}
                >
                  <Building2 className="size-4" /> Önce Firma Bağlayın
                </Button>
              )}
            </CardHeader>
            {!hasCompany && (
              <div className="mx-5 mb-4 rounded-lg border border-warning/25 bg-warning-soft/60 px-3 py-2 text-xs text-muted-foreground">
                Teklif ekranı, firma kartı bağlandıktan sonra açılır. Lead bilgileri kaybolmadan firma ve kontak kaydına aktarılır.
              </div>
            )}
            <div className="overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Teklif No</TableHead>
                    <TableHead>Revizyon</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Tutar</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offs.map((o) => (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer hover:bg-muted/40"
                      tabIndex={0}
                      onClick={() => setSelectedOfferId(o.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedOfferId(o.id);
                        }
                      }}
                    >
                      <TableCell>{o.quoteNo}</TableCell>
                      <TableCell>R{o.revision}</TableCell>
                      <TableCell className="text-muted-foreground">{o.date}</TableCell>
                      <TableCell className="tabular-nums">{o.amount.toLocaleString()} {o.currency}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={o.status} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Teklif detayı"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOfferId(o.id);
                            }}
                          >
                            <Eye className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Dokümanlar</CardTitle>
              <DocumentUploadDialog
                defaultSalesCaseId={sc.id}
                defaultCompanyId={sc.customerId}
                trigger={<Button size="sm" className="gap-1"><Upload className="size-4" /> Yükle</Button>}
              />
            </CardHeader>
            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead>Dosya</TableHead>
                    <TableHead>Boyut</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead className="w-14 text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((d) => (
                    <TableRow
                      key={d.id}
                      className={d.fileId ? "cursor-pointer hover:bg-muted/40" : undefined}
                      tabIndex={d.fileId ? 0 : undefined}
                      onClick={() => d.fileId && downloadDocument(d.fileId, d.fileName)}
                      onKeyDown={(e) => {
                        if (!d.fileId || e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          downloadDocument(d.fileId, d.fileName);
                        }
                      }}
                    >
                      <TableCell><StatusBadge status={d.type} /></TableCell>
                      <TableCell className="max-w-[320px] truncate">{d.fileName}</TableCell>
                      <TableCell className="text-muted-foreground">{d.size}</TableCell>
                      <TableCell className="text-muted-foreground">{d.uploadedAt}</TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {d.source === "uploaded_file" && d.fileId && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            aria-label={`${d.fileName} dosyasını sil`}
                            title="Dosyayı sil"
                            onClick={() => setPendingDocumentDelete(d)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {docs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Doküman yok.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Ödemeler & Tahsilatlar</CardTitle>
              {reachedPaymentPlan && (
                <CreatePaymentPlanDialog
                  sc={sc}
                  offs={offs}
                  c={c ?? null}
                  onCreated={refresh}
                  trigger={
                    <Button size="sm" className="gap-1">
                      <Plus className="size-4" /> Ödeme Planı Oluştur
                    </Button>
                  }
                />
              )}
            </CardHeader>
            <div className="overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead>Tutar</TableHead>
                    <TableHead>Vade</TableHead>
                    <TableHead>Ödeme Tarihi</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pays.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.paymentType === "received" ? "Tahsilat" : "Beklenen"}</TableCell>
                      <TableCell className="tabular-nums">{p.amount.toLocaleString()} {p.currency}</TableCell>
                      <TableCell className="text-muted-foreground">{p.dueDate}</TableCell>
                      <TableCell className="text-muted-foreground">{p.paidDate ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      </>
      )}
      </DialogSplitLayout>
      </div>

      <OfferDetailDialog
        offer={selectedOffer}
        salesCase={sc}
        customer={c ?? null}
        assignee={u ?? null}
        revisions={selectedRevisions}
        order={selectedOrder}
        onClose={() => setSelectedOfferId(null)}
        onQuoteAction={runQuoteAction}
        canApprovePrice={isSuperAdmin}
        onOrderCreated={refresh}
      />
      <Dialog open={!!editingActivity} onOpenChange={(open) => !open && setEditingActivity(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aktivite Düzenle</DialogTitle>
            <DialogDescription>Aktivite başlığı, notu, sonucu ve tarihini güncelleyin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tür</Label>
                <Input className="mt-1.5" value={activityForm.type} onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Tarih</Label>
                <Input type="date" className="mt-1.5" value={activityForm.date} onChange={(e) => setActivityForm({ ...activityForm, date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Başlık *</Label>
              <Input className="mt-1.5" value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Not</Label>
              <Textarea className="mt-1.5 min-h-[80px]" value={activityForm.note} onChange={(e) => setActivityForm({ ...activityForm, note: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Sonuç / Ne Yapıldı</Label>
              <Textarea className="mt-1.5 min-h-[64px]" value={activityForm.result} onChange={(e) => setActivityForm({ ...activityForm, result: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingActivity(null)}>Vazgeç</Button>
              <Button type="button" onClick={saveActivityEdit}>Kaydet</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  if (mode === "dialog") {
    return (
      <KanbanDetailDialogShell
        accentClassName={STAGE_DOT[sc.stage] ?? "bg-primary"}
        title={partyName}
        subtitle={compactSubtitle}
        className="h-dvh max-h-dvh sm:h-auto sm:max-h-[92dvh]"
        bodyClassName="lg:grid-cols-1"
        activityClassName="hidden"
        meta={
          <>
            <StatusBadge status={sc.stage} />
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
              {sc.estimatedAmount.toLocaleString()} {sc.currency}
            </span>
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              Atanan: {u?.name ?? "Atanmadı"}
            </span>
          </>
        }
        actions={
          <>
            {onNavigate && (
              <div className="flex items-center rounded-md border border-slate-200 bg-white">
                <Button type="button" variant="ghost" size="icon" className="size-8 rounded-r-none" disabled={!previous} onClick={() => previous && onNavigate(previous.id)} aria-label="Önceki fırsat" title="Önceki fırsat"><ChevronLeft className="size-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="size-8 rounded-l-none border-l border-slate-200" disabled={!next} onClick={() => next && onNavigate(next.id)} aria-label="Sonraki fırsat" title="Sonraki fırsat"><ChevronRight className="size-4" /></Button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={onBack} className="gap-1 bg-white">
              <ArrowLeft className="size-4" /> Hızlı özete dön
            </Button>
          </>
        }
        right={activityPanel}
        mobileFooter={
          <div className="grid grid-cols-[auto_1fr] gap-2">
            {onNavigate && (
              <div className="flex rounded-md border border-slate-200">
                <Button type="button" variant="ghost" size="icon" className="size-9 rounded-r-none" disabled={!previous} onClick={() => previous && onNavigate(previous.id)} aria-label="Önceki fırsat"><ChevronLeft className="size-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="size-9 rounded-l-none border-l border-slate-200" disabled={!next} onClick={() => next && onNavigate(next.id)} aria-label="Sonraki fırsat"><ChevronRight className="size-4" /></Button>
              </div>
            )}
            <Button type="button" className="h-9 gap-1.5 bg-[#0b2453]" onClick={onBack}><ArrowLeft className="size-4" /> Hızlı özete dön</Button>
          </div>
        }
      >
        {content}
      </KanbanDetailDialogShell>
    );
  }

  return (
    <div className={rootClass}>
      {content}
    </div>
  );
}

export function CreatePaymentPlanDialog({
  sc,
  offs,
  c,
  onCreated,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  sc: SalesCase;
  offs: Offer[];
  c: any;
  onCreated?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("USD");
  const [installmentCount, setInstallmentCount] = useState<number>(3);
  const [paymentTermDays, setPaymentTermDays] = useState<number>(30);
  const [installments, setInstallments] = useState<Array<{ amount: number; dueDate: string }>>([]);
  const [saving, setSaving] = useState(false);

  // Initialize values based on approved quote or latest quote
  useEffect(() => {
    if (!open) return;
    const approvedQuote = offs.find((o) => o.status === "Approved");
    const latestQuote = offs.slice().sort((a, b) => b.revision - a.revision)[0];
    const initialQuote = approvedQuote || latestQuote;

    if (initialQuote) {
      setSelectedQuoteId(initialQuote.id);
      setAmount(initialQuote.amount);
      setCurrency(initialQuote.currency);
    } else {
      setSelectedQuoteId("");
      setAmount(sc.estimatedAmount || 0);
      setCurrency(sc.currency || "USD");
    }
    setPaymentTermDays(30);
  }, [open, offs, sc]);

  // Recalculate installments when amount, count, term, or quote changes
  useEffect(() => {
    if (amount <= 0 || installmentCount <= 0) {
      setInstallments([]);
      return;
    }
    const val = Number((amount / installmentCount).toFixed(2));
    const list = [];
    const today = new Date();
    const firstTermDays = Math.max(0, Math.trunc(paymentTermDays || 0));
    for (let i = 0; i < installmentCount; i++) {
      const date = new Date();
      date.setDate(today.getDate() + firstTermDays + 30 * i);
      const dateStr = date.toISOString().slice(0, 10);
      list.push({
        amount: i === 0 ? Number((amount - val * (installmentCount - 1)).toFixed(2)) : val,
        dueDate: dateStr,
      });
    }
    setInstallments(list);
  }, [amount, installmentCount, paymentTermDays]);

  const handleEqualize = () => {
    if (amount <= 0 || installmentCount <= 0) return;
    const val = Number((amount / installmentCount).toFixed(2));
    setInstallments(
      installments.map((inst, i) => ({
        ...inst,
        amount: i === 0 ? Number((amount - val * (installmentCount - 1)).toFixed(2)) : val,
      }))
    );
  };

  const handleInstallmentChange = (index: number, field: "amount" | "dueDate", value: any) => {
    setInstallments(
      installments.map((inst, i) => {
        if (i !== index) return inst;
        return {
          ...inst,
          [field]: field === "amount" ? Number(value) : value,
        };
      })
    );
  };

  const sum = installments.reduce((acc, inst) => acc + Number(inst.amount || 0), 0);
  const diff = Number((amount - sum).toFixed(2));
  const isMatch = Math.abs(diff) < 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatch) return toast.error("Taksitlerin toplamı, plan toplam tutarı ile eşleşmelidir");
    if (amount <= 0 || installments.length === 0) return toast.error("Plan tutarı ve en az bir taksit girin.");
    setSaving(true);
    try {
      for (let i = 0; i < installments.length; i++) {
        const inst = installments[i];
        await financeService.createReceivable({
          companyId: sc.customerId,
          ...(selectedQuoteId ? { quoteId: selectedQuoteId } : {}),
          amount: inst.amount,
          currencyCode: currency,
          dueDate: new Date(inst.dueDate),
          movementType: "manual",
          notes: `Taksit ${i + 1}/${installments.length} - ${sc.requestedProduct}`,
        });
      }
      toast.success("Ödeme planı başarıyla oluşturuldu.");
      setOpen(false);
      onCreated?.();
    } catch (err: any) {
      toast.error("Ödeme planı oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ödeme Planı Oluştur</DialogTitle>
          <DialogDescription>
            {c?.name} firmasına ait bu satış kartı için vadeli alacak ödeme planı oluşturun.
          </DialogDescription>
        </DialogHeader>

        {offs.length === 0 && (
          <div className="p-3 bg-warning-soft border border-warning/30 rounded text-xs text-warning mt-4">
            Bu satış kartı altında bir teklif yok. Ödeme planını yine de oluşturabilirsiniz; sonradan teklif eklenirse manuel olarak bağlanabilir.
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="quote-select">İlişkili Teklif {offs.length === 0 ? "(yok)" : "(opsiyonel)"}</Label>
                <Select value={selectedQuoteId || "__none__"} onValueChange={(v) => setSelectedQuoteId(v === "__none__" ? "" : v)} disabled={offs.length === 0}>
                  <SelectTrigger id="quote-select" className="w-full">
                    <SelectValue placeholder={offs.length === 0 ? "Teklif bulunamadı" : "Teklif seçin"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Teklif bağlama</SelectItem>
                    {offs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.quoteNo} (Rev. {o.revision}) · {o.amount.toLocaleString()} {o.currency} {o.status === "Approved" ? "· Onaylı" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inst-count">Taksit Sayısı</Label>
                <Select value={String(installmentCount)} onValueChange={(v) => setInstallmentCount(Number(v))}>
                  <SelectTrigger id="inst-count" className="w-full">
                    <SelectValue placeholder="Taksit sayısı seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((num) => (
                      <SelectItem key={num} value={String(num)}>
                        {num} Taksit
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-term-days">İlk Vade Günü</Label>
                <Input
                  id="payment-term-days"
                  type="number"
                  min={0}
                  max={3650}
                  value={paymentTermDays}
                  onChange={(e) => setPaymentTermDays(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                  placeholder="Örn. 30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="total-amount">Toplam Plan Tutarı</Label>
                <Input
                  id="total-amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="Toplam Tutar"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="currency-select">Para Birimi</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency-select" className="w-full">
                    <SelectValue placeholder="Seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="TRY">TRY (₺)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">Taksit Detayları</h4>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleEqualize} className="text-xs">
                    Dengele
                  </Button>
                  <span
                    className={`text-xs px-2 py-1 rounded font-medium border ${
                      isMatch
                        ? "bg-success-soft text-success border-success/30"
                        : "bg-destructive-soft text-destructive border-destructive/30"
                    }`}
                  >
                    {isMatch ? "Tutar Uyumlu" : `Fark: ${diff.toLocaleString()} ${currency}`}
                  </span>
                </div>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {installments.map((inst, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-muted/30 rounded border border-border/40">
                    <span className="text-xs font-semibold text-muted-foreground w-12 text-center">
                      Taksit {i + 1}
                    </span>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          value={inst.amount}
                          onChange={(e) => handleInstallmentChange(i, "amount", e.target.value)}
                          className="pr-12 text-sm h-9"
                          required
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                          {currency}
                        </span>
                      </div>
                      <Input
                        type="date"
                        value={inst.dueDate}
                        onChange={(e) => handleInstallmentChange(i, "dueDate", e.target.value)}
                        className="text-sm h-9"
                        required
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={saving || !isMatch || amount <= 0 || installments.length === 0}>
                {saving ? "Kaydediliyor..." : "Planı Onayla ve Kaydet"}
              </Button>
            </div>
          </form>
      </DialogContent>
    </Dialog>
  );
}
