import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Checkbox } from "../../ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { Badge } from "../../ui/badge";
import { FilterPopover } from "../../ui/list-controls";
import { StatusBadge } from "../../Layout";
import { CreateServiceRequestDialog } from "../../dialogs/CreateDialogs";
import { KanbanBoard, type KanbanColumn } from "../../KanbanBoard";
import { ServiceCardAttachments } from "../../KanbanCardAttachments";
import { DocumentPreviewDialog } from "../../dialogs/DocumentPreviewDialog";
import { useStore } from "../../../lib/store";
import {
  ServiceRequest,
  ServiceStage,
  ServiceComplaintIntake,
  ServiceComplaintLink,
  Customer,
  Contact,
  Machine,
  type User,
  type DocumentItem,
  type ServiceSource,
  type ServiceTicketType,
  type ServiceQuoteForm,
  type ServiceQuoteItem,
  type ServiceWarrantyPart,
  type ServiceCompletionForm,
  type ServiceCompletionPart,
  type ServiceFormType,
  type ServiceFormResponsibility,
} from "../../../lib/mock";
import { useAuth } from "../../../../lib/auth";
import { isServiceQuoteComplete, serviceQuoteMissingFields } from "../../../lib/serviceQuote";
import { toast } from "sonner";
import { fileService, inventoryService, serviceService, signatureService } from "../../../../lib/services";
import { resolveMediaUrl } from "../../../../lib/apiClient";
import { exportService } from "../../../../lib/downloadExport";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { KanbanDetailDialogShell } from "../../shared/KanbanDetailDialogShell";
import { EntityVisual, InsightStat, RecordIdentity } from "../../shared/PremiumPrimitives";
import type { OperationFocus } from "../../../lib/operations";
import type { SignatureView } from "@haksan/shared";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  printAssetBase, trLongDate, serviceQuoteDoc, SERVICE_NOTE_VARIANTS,
} from "../../../lib/print";
import { printOrWarn, openInMaps, warrantyInfo, type WarrantyState } from "../../../lib/pageHelpers";
import {
  Plus, Printer, MapPin, Wrench, Building2, Lock, Play, Pause, Square, MessageSquare,
  ShieldCheck, Send, Check, CheckCircle2, X, Package, ClipboardCheck, Inbox, Link2, Copy, ExternalLink,
  Trash2, ArrowRight, FileCheck2, History, FileText, Save, BookmarkPlus,
  AlertTriangle, Clock3, UserRoundCheck, Workflow, Share2, Download,
} from "lucide-react";
import { RemoteCompanyCombobox } from "../../shared/RemoteCompanyCombobox";
import { useCompanyDetail } from "../../../lib/companyServerData";
import { contactQueryKeys, loadAllCompanyContacts } from "../../../lib/contactServerData";

const SERVICE_CURRENCIES = ["USD", "EUR", "TRY"] as const;
const NONE = "__none__";
const SERVICE_QUOTE_NOTE_TEMPLATE_SCOPE = "service_quote";
const NOTE_TEMPLATE_KEY_PREFIX = "note-template:";
const DEFAULT_SERVICE_QUOTE_NOTES = SERVICE_NOTE_VARIANTS.find((variant) => variant.key === "teknik-servis")?.notlar ?? [];
const COMPLAINT_EVIDENCE_ACCEPT = ".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp";
const COMPLAINT_EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function useRemoteCompanyContacts(companyId?: string | null, enabled = true) {
  const { user, tenant, activeDivision, activeDepartment } = useAuth();
  const normalizedCompanyId = companyId && companyId !== NONE ? companyId : null;
  const identityScope = {
    tenantId: tenant?.id ?? user?.tenantId ?? "anonymous",
    userId: user?.id ?? "anonymous",
    activeDivision,
    activeDepartment,
  };

  return useQuery({
    queryKey: contactQueryKeys.companyContacts(identityScope, normalizedCompanyId ?? "none"),
    queryFn: ({ signal }) => loadAllCompanyContacts(normalizedCompanyId as string, signal),
    enabled: enabled && Boolean(normalizedCompanyId),
    staleTime: 60_000,
  });
}

const newServiceQuoteItem = (): ServiceQuoteItem => ({
  id: `service-quote-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  productModelId: null,
  stockCode: null,
  description: "",
  quantity: 1,
  unit: "Ad.",
  unitPrice: 0,
});

const noteTemplateKey = (id: string) => `${NOTE_TEMPLATE_KEY_PREFIX}${id}`;
const noteTemplateIdFromKey = (key: string) => key.startsWith(NOTE_TEMPLATE_KEY_PREFIX) ? key.slice(NOTE_TEMPLATE_KEY_PREFIX.length) : "";
const noteLinesFromText = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

const printServiceQuoteForm = (quote: ServiceQuoteForm) =>
  serviceQuoteDoc(
    {
      firma: quote.company,
      ilgili: quote.contact,
      mobil: quote.mobile,
      adres: quote.address,
      tel: quote.phone,
      email: quote.email,
      tarih: trLongDate(quote.date),
      belgeNo: quote.quoteNo,
      gecerlilik: quote.validity,
      teklifiYazan: quote.writerName,
      teklifiYazanUnvan: quote.writerTitle,
      teklifiYazanEmail: quote.writerEmail,
      // Seçilmemişse satır teklifi yazana düşer; görsel yalnız imzayla çıkar.
      imza: quote.signature
        ? {
            ad: quote.signature.name,
            unvan: quote.signature.title || undefined,
            gorselUrl: quote.signature.imageUrl ? resolveMediaUrl(quote.signature.imageUrl) : undefined,
          }
        : undefined,
      konu: quote.subject,
      items: quote.items
        .filter((item) => item.description.trim())
        .map((item) => ({
          urun: item.description,
          miktar: item.quantity,
          birim: item.unit,
          fiyat: item.unitPrice,
          tutar: item.quantity * item.unitPrice,
        })),
      kdvOran: quote.vatRate,
      kdvTutar: quote.vatAmount,
      currency: quote.currency,
      notlar: quote.notes.filter((note) => note.trim()),
    },
    printAssetBase(),
  );

const fileSizeText = (bytes?: number) => {
  const value = bytes ?? 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const initials = (name: string) =>
  (name || "—")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr-TR");

const SERVICE_TICKET_TYPE_LABELS: Record<ServiceTicketType, string> = {
  complaint: "Şikayet",
  request: "Talep",
  warranty_claim: "Garanti",
  question: "Soru",
};

const SERVICE_SOURCE_LABELS: Record<ServiceSource, string> = {
  manual: "İç kayıt",
  phone: "Telefon",
  email: "E-posta",
  whatsapp: "WhatsApp",
  portal: "Portal",
  web: "Web",
  qr: "QR",
};

const COMPLAINT_STATUS_LABELS: Record<ServiceComplaintIntake["status"], string> = {
  new: "Yeni",
  reviewing: "İnceleniyor",
  converted: "Servise Çevrildi",
  rejected: "Reddedildi",
};

const COMPLAINT_SOURCE_LABELS: Record<ServiceComplaintIntake["source"], string> = {
  qr: "QR",
  web: "Web",
  phone: "Telefon",
  whatsapp: "WhatsApp",
  email: "E-posta",
  manual: "İç kayıt",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Düşük",
  normal: "Normal",
  high: "Yüksek",
  critical: "Kritik",
};

const SERVICE_TICKET_TYPE_OPTIONS = Object.entries(SERVICE_TICKET_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
})) as { value: ServiceTicketType; label: string }[];

const SERVICE_SOURCE_OPTIONS = Object.entries(SERVICE_SOURCE_LABELS).map(([value, label]) => ({
  value,
  label,
})) as { value: ServiceSource; label: string }[];

const WARRANTY_STATUS_LABELS: Record<string, string> = {
  draft: "Taslak",
  submitted: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  rma_in_progress: "RMA'da",
  closed: "Kapandı",
};

const WARRANTY_STATUS_OPTIONS = Object.entries(WARRANTY_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const WARRANTY_SUGGESTION_LABELS: Record<string, string> = {
  in_warranty: "Garanti içi",
  out_of_warranty: "Garanti dışı",
  unknown: "Bilinmiyor",
};

const WARRANTY_DECISION_LABELS: Record<string, string> = {
  pending: "Karar bekliyor",
  approved: "Kapsam içi",
  rejected: "Kapsam dışı",
};

const serviceTicketTypeLabel = (value?: ServiceTicketType) =>
  SERVICE_TICKET_TYPE_LABELS[value ?? "complaint"] ?? "Şikayet";

const serviceSourceLabel = (value?: ServiceSource) =>
  SERVICE_SOURCE_LABELS[value ?? "manual"] ?? "İç kayıt";

function ServiceIntakeBadges({ serviceRequest }: { serviceRequest: ServiceRequest }) {
  const source = serviceRequest.source ?? "manual";
  const type = serviceRequest.ticketType ?? "complaint";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="bg-white text-[11px]">
        {serviceTicketTypeLabel(type)}
      </Badge>
      <Badge
        variant="outline"
        className={source === "qr" ? "border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px]" : "bg-muted/40 text-[11px]"}
      >
        {serviceSourceLabel(source)}
      </Badge>
    </div>
  );
}

function WarrantyClaimBadge({ serviceRequest }: { serviceRequest: ServiceRequest }) {
  const claim = serviceRequest.warrantyClaim;
  if (!claim && serviceRequest.ticketType !== "warranty_claim") return null;
  const status = claim?.status ?? "draft";
  const className =
    status === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "rejected"
        ? "border-red-200 bg-red-50 text-red-700"
        : status === "submitted"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : status === "rma_in_progress"
            ? "border-sky-200 bg-sky-50 text-sky-700"
            : "bg-muted/40";
  return (
    <Badge variant="outline" className={`text-[11px] ${className}`}>
      <ShieldCheck className="size-3" />
      {WARRANTY_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const MACHINE_WARRANTY_TONE: Record<WarrantyState, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  expiring: "border-amber-200 bg-amber-50 text-amber-700",
  expired: "border-red-200 bg-red-50 text-red-700",
  unknown: "bg-muted/40 text-muted-foreground",
};

/** Servis kartı açıldığında bağlı makinenin garanti durumunu otomatik gösterir. */
function MachineWarrantyBadge({ warrantyEnd }: { warrantyEnd?: string | null }) {
  const info = warrantyInfo(warrantyEnd);
  return (
    <Badge variant="outline" className={`text-[11px] gap-1 ${MACHINE_WARRANTY_TONE[info.state]}`}>
      <ShieldCheck className="size-3" />
      {info.label}
    </Badge>
  );
}

const serviceNoteText = (s: ServiceRequest) =>
  s.serviceNote || s.diagnosisNote || s.description || s.issueType || "Not girilmedi";

const timestamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

const formatElapsed = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const serviceElapsedSeconds = (s: ServiceRequest, nowMs = Date.now()) => {
  const base = s.timerElapsedSeconds ?? 0;
  if (s.timerStatus !== "running" || !s.timerStartedAt) return base;
  const started = new Date(s.timerStartedAt).getTime();
  if (!Number.isFinite(started)) return base;
  return base + Math.max(0, Math.floor((nowMs - started) / 1000));
};

const moneyText = (value: number, currency = "USD") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);

const serviceAgeDays = (s: ServiceRequest) => {
  const time = new Date(s.createdAt).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000)));
};

const SERVICE_SLA_DAYS: Record<NonNullable<ServiceRequest["priority"]>, number> = {
  critical: 1,
  high: 2,
  normal: 7,
  low: 14,
};

const SERVICE_NEXT_ACTION: Record<ServiceStage, string> = {
  "Request Opened": "İlk değerlendirme",
  Diagnosis: "Arıza teşhisi",
  "Quote Needed": "Teklif hazırla",
  "Quote Sent": "Müşteri takibi",
  Approval: "Onay kararı",
  Scheduled: "Saha planını başlat",
  "Service In Progress": "İşi ve süreyi kaydet",
  "Service Completed": "Tamamlama formu",
  "Signed Form": "Kaydı kapat",
  Closed: "Arşiv kaydı",
};

const serviceSlaInfo = (serviceRequest: ServiceRequest) => {
  if (serviceRequest.stage === "Closed") return { label: "Kapandı", tone: "text-muted-foreground", overdue: false };
  const target = SERVICE_SLA_DAYS[serviceRequest.priority ?? "normal"];
  const remaining = target - serviceAgeDays(serviceRequest);
  if (remaining < 0) return { label: `${Math.abs(remaining)}g aşıldı`, tone: "text-destructive", overdue: true };
  if (remaining === 0) return { label: "Bugün", tone: "text-warning", overdue: false };
  return { label: `${remaining}g kaldı`, tone: "text-success", overdue: false };
};

const SERVICE_PRIORITY_LABELS: Record<NonNullable<ServiceRequest["priority"]>, string> = {
  critical: "Kritik",
  high: "Yüksek",
  normal: "Normal",
  low: "Düşük",
};

const SERVICE_PRIORITY_CLASS: Record<NonNullable<ServiceRequest["priority"]>, string> = {
  critical: "border-destructive/30 bg-destructive/5 text-destructive",
  high: "border-warning/30 bg-warning/5 text-warning",
  normal: "border-info/25 bg-info/5 text-info",
  low: "border-border/70 bg-muted/30 text-muted-foreground",
};

const matchesServiceFocus = (s: ServiceRequest, focus?: OperationFocus) => {
  if (focus === "open") return s.stage !== "Closed";
  if (focus === "sla" || focus === "late") return s.stage !== "Closed" && serviceAgeDays(s) > 7;
  if (focus === "scheduled") return s.stage === "Scheduled";
  return true;
};

type ServiceRequestsView = "list" | "board" | "complaints" | "history";

export function ServiceRequestsPage({
  initialView = "list",
  focus,
  initialQuery,
  kanbanOnly = false,
}: {
  initialView?: "list" | "board";
  focus?: OperationFocus;
  initialQuery?: string;
  kanbanOnly?: boolean;
}) {
  const { service, machines, customers, users, refresh } = useStore();
  const { hasPermission } = useAuth();
  const canCreateService = hasPermission("service_tickets.create");
  const [view, setView] = useState<ServiceRequestsView>(initialView);
  const [historyQuery, setHistoryQuery] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedServiceInitialTab, setSelectedServiceInitialTab] = useState<ServiceDetailTab | undefined>();
  // Aynı derin bağlantı, liste her yenilendiğinde kaydı tekrar açmasın.
  const handledTicketQuery = useRef<string | null>(null);
  const [selectedComplaint, setSelectedComplaint] = useState<ServiceComplaintIntake | null>(null);
  const [complaints, setComplaints] = useState<ServiceComplaintIntake[]>([]);
  const [complaintLinks, setComplaintLinks] = useState<ServiceComplaintLink[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [complaintStatusFilter, setComplaintStatusFilter] = useState("all");
  const [complaintSourceFilter, setComplaintSourceFilter] = useState("all");
  const [complaintSeverityFilter, setComplaintSeverityFilter] = useState("all");
  const [createComplaintOpen, setCreateComplaintOpen] = useState(false);
  const [createLinkOpen, setCreateLinkOpen] = useState(false);
  const [ticketTypeFilter, setTicketTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [warrantyFilter, setWarrantyFilter] = useState("all");
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [pendingDeleteService, setPendingDeleteService] = useState<ServiceRequest | null>(null);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const machineName = (id: string) => {
    const machine = machines.find((m) => m.id === id);
    return machine ? [machine.model, machine.serialNumber].filter(Boolean).join(" · ") : "—";
  };
  const selectedService = selectedServiceId ? service.find((s) => s.id === selectedServiceId) ?? null : null;
  const openServiceDetail = (s: ServiceRequest, initialTab?: ServiceDetailTab) => {
    setSelectedServiceId(s.id);
    setSelectedServiceInitialTab(initialTab);
  };
  const visibleService = service
    .filter((s) => matchesServiceFocus(s, focus))
    .filter((s) => ticketTypeFilter === "all" || (s.ticketType ?? "complaint") === ticketTypeFilter)
    .filter((s) => sourceFilter === "all" || (s.source ?? "manual") === sourceFilter)
    .filter((s) => warrantyFilter === "all" || (s.warrantyClaim?.status ?? (s.ticketType === "warranty_claim" ? "draft" : "")) === warrantyFilter);
  const visibleComplaints = complaints
    .filter((c) => complaintStatusFilter === "all" || c.status === complaintStatusFilter)
    .filter((c) => complaintSourceFilter === "all" || c.source === complaintSourceFilter)
    .filter((c) => complaintSeverityFilter === "all" || c.severity === complaintSeverityFilter);
  const openServiceCount = visibleService.filter((item) => item.stage !== "Closed").length;
  const urgentServiceCount = visibleService.filter((item) => item.stage !== "Closed" && (item.priority === "critical" || item.priority === "high")).length;
  const overdueServiceCount = visibleService.filter((item) => serviceSlaInfo(item).overdue).length;
  const assignedServiceCount = visibleService.filter((item) => item.assignedUserId).length;
  const complaintFilterControls = [
    {
      label: "Durum",
      value: complaintStatusFilter,
      onChange: setComplaintStatusFilter,
      options: Object.entries(COMPLAINT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      allLabel: "Tüm durumlar",
    },
    {
      label: "Kaynak",
      value: complaintSourceFilter,
      onChange: setComplaintSourceFilter,
      options: Object.entries(COMPLAINT_SOURCE_LABELS).map(([value, label]) => ({ value, label })),
      allLabel: "Tüm kaynaklar",
    },
    {
      label: "Öncelik",
      value: complaintSeverityFilter,
      onChange: setComplaintSeverityFilter,
      options: Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label })),
      allLabel: "Tüm öncelikler",
    },
  ];
  const filterControls = [
    {
      label: "Kayıt Tipi",
      value: ticketTypeFilter,
      onChange: setTicketTypeFilter,
      options: SERVICE_TICKET_TYPE_OPTIONS,
      allLabel: "Tüm tipler",
    },
    {
      label: "Kaynak",
      value: sourceFilter,
      onChange: setSourceFilter,
      options: SERVICE_SOURCE_OPTIONS,
      allLabel: "Tüm kaynaklar",
    },
    {
      label: "Garanti",
      value: warrantyFilter,
      onChange: setWarrantyFilter,
      options: WARRANTY_STATUS_OPTIONS,
      allLabel: "Tüm garanti durumları",
    },
  ];

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const loadComplaints = async () => {
    setComplaintsLoading(true);
    try {
      const [complaintResult, linkResult] = await Promise.all([
        serviceService.complaints({ pageSize: 200 }),
        serviceService.complaintLinks({ pageSize: 200 }),
      ]);
      setComplaints(complaintResult.data ?? []);
      setComplaintLinks(linkResult.data ?? []);
    } catch (err: any) {
      toast.error("Şikayet kutusu yüklenemedi", { description: err?.message ?? "İstek başarısız." });
    } finally {
      setComplaintsLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  // Satış kartından "Servis Teklifi" ile gelindiğinde ilgili servis kaydı
  // doğrudan teklif sekmesinde açılır.
  useEffect(() => {
    if (!initialQuery?.startsWith("ticket:")) return;
    if (handledTicketQuery.current === initialQuery) return;
    const [, ticketId, tab] = initialQuery.split(":");
    if (!ticketId) return;
    const target = service.find((s) => s.id === ticketId);
    if (!target) return;
    handledTicketQuery.current = initialQuery;
    setView("list");
    openServiceDetail(target, (tab as ServiceDetailTab | undefined) ?? undefined);
  }, [service, initialQuery]);

  useEffect(() => {
    if (!complaints.length) return;
    if (initialQuery === "complaints") {
      setView("complaints");
      return;
    }
    const complaintId = initialQuery?.startsWith("complaint:") ? initialQuery.slice("complaint:".length) : undefined;
    if (!complaintId) return;
    const target = complaints.find((c) => c.id === complaintId);
    if (target) {
      setView("complaints");
      setSelectedComplaint(target);
    }
  }, [complaints, initialQuery]);

  const updateComplaintStatus = async (complaint: ServiceComplaintIntake, status: ServiceComplaintIntake["status"]) => {
    try {
      await serviceService.updateComplaint(complaint.id, { status });
      toast.success("Şikayet durumu güncellendi");
      await loadComplaints();
    } catch (err: any) {
      toast.error("Şikayet güncellenemedi", { description: err?.message ?? "İşlem başarısız." });
    }
  };

  const convertComplaint = async (complaint: ServiceComplaintIntake) => {
    try {
      await serviceService.convertComplaint(complaint.id);
      toast.success("Servis talebi açıldı");
      await refresh();
      await loadComplaints();
    } catch (err: any) {
      toast.error("Servis talebi açılamadı", { description: err?.message ?? "Firma eşleşmesi veya durum kontrolü başarısız." });
    }
  };

  const rejectComplaint = async (complaint: ServiceComplaintIntake, rejectionNote?: string) => {
    try {
      await serviceService.rejectComplaint(complaint.id, { rejectionNote });
      toast.success("Şikayet reddedildi");
      await loadComplaints();
    } catch (err: any) {
      toast.error("Şikayet reddedilemedi", { description: err?.message ?? "İşlem başarısız." });
    }
  };

  const revokeComplaintLink = async (link: ServiceComplaintLink) => {
    try {
      await serviceService.revokeComplaintLink(link.id);
      toast.success("Public link iptal edildi");
      await loadComplaints();
    } catch (err: any) {
      toast.error("Link iptal edilemedi", { description: err?.message ?? "İşlem başarısız." });
    }
  };

  const issueComplaintLink = async (link: ServiceComplaintLink) => {
    try {
      const credential = await serviceService.rotateComplaintLink(link.id);
      await loadComplaints();
      return credential as ServiceComplaintLink;
    } catch (err: any) {
      toast.error("Link yenilenemedi", { description: err?.message ?? "İşlem başarısız." });
      throw err;
    }
  };

  const openSourceComplaint = (complaintId: string) => {
    const complaint = complaints.find((c) => c.id === complaintId);
    if (!complaint) {
      toast.info("Şikayet Kutusu yükleniyor");
      setView("complaints");
      loadComplaints();
      return;
    }
    setView("complaints");
    setSelectedComplaint(complaint);
  };

  const deleteService = (s: ServiceRequest, event?: MouseEvent) => {
    event?.stopPropagation();
    setPendingDeleteService(s);
  };

  const confirmDeleteService = async () => {
    const s = pendingDeleteService;
    if (!s) return;
    setDeletingServiceId(s.id);
    try {
      await serviceService.deleteTicket(s.id);
      toast.success("Servis talebi silindi");
      if (selectedServiceId === s.id) {
        setSelectedServiceId(null);
        setSelectedServiceInitialTab(undefined);
      }
      setPendingDeleteService(null);
      await refresh();
    } catch (err: any) {
      toast.error("Servis talebi silinemedi", { description: err?.message ?? "İşlem başarısız oldu." });
    } finally {
      setDeletingServiceId(null);
    }
  };

  const serviceOverview = (
    <section className="premium-blueprint precision-corners overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 shadow-sm sm:p-5">
      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-primary">SAHA SERVİS KONTROLÜ</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Servis operasyon hattı</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Öncelik, SLA, sorumlu ve sıradaki aksiyonu talep bağlamından kopmadan takip edin.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[610px]">
          <InsightStat label="Açık" value={openServiceCount} icon={<Wrench />} />
          <InsightStat label="Kritik / Yüksek" value={urgentServiceCount} icon={<AlertTriangle />} tone={urgentServiceCount ? "warning" : "success"} />
          <InsightStat label="SLA Aşımı" value={overdueServiceCount} icon={<Clock3 />} tone={overdueServiceCount ? "danger" : "success"} />
          <InsightStat label="Atanmış" value={`${assignedServiceCount}/${visibleService.length}`} icon={<UserRoundCheck />} tone="success" />
        </div>
      </div>
    </section>
  );

  const openServiceFormPdf = async (s: ServiceRequest) => {
    try {
      await serviceService.openServiceFormPdf(s.id, s.ticketNo || s.id);
    } catch (err: any) {
      toast.error("Servis formu açılamadı", { description: err?.message ?? "PDF oluşturulamadı." });
    }
  };

  const printServiceQuote = (s: ServiceRequest) => {
    if (!isServiceQuoteComplete(s.serviceQuote)) {
      toast.error("Servis teklifi yazdırılamadı", {
        description: "Önce servis kaydındaki Servis Teklifi formunu eksiksiz doldurun.",
      });
      return;
    }
    printOrWarn(printServiceQuoteForm(s.serviceQuote));
  };

  const dialogs = (
    <>
      <ServiceDetailDialog
        serviceRequest={selectedService}
        initialTab={selectedServiceInitialTab}
        onClose={() => {
          setSelectedServiceId(null);
          setSelectedServiceInitialTab(undefined);
        }}
        onSelectService={(id) => {
          setSelectedServiceId(id);
          setSelectedServiceInitialTab(undefined);
        }}
        onOpenComplaint={openSourceComplaint}
        onDelete={deleteService}
      />
      <ComplaintDetailDialog
        complaint={selectedComplaint}
        machines={machines}
        onClose={() => setSelectedComplaint(null)}
        onSaved={loadComplaints}
        onConvert={convertComplaint}
        onReject={rejectComplaint}
      />
      <CreateComplaintDialog
        open={createComplaintOpen}
        onOpenChange={setCreateComplaintOpen}
        machines={machines}
        onCreated={loadComplaints}
      />
      <CreateComplaintLinkDialog
        open={createLinkOpen}
        onOpenChange={setCreateLinkOpen}
        machines={machines}
        onCreated={loadComplaints}
      />
      <AlertDialog open={!!pendingDeleteService} onOpenChange={(open) => !open && !deletingServiceId && setPendingDeleteService(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Servis talebini arşivle?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{pendingDeleteService?.ticketNo || "Servis kaydı"}</b> aktif listeden kaldırılacak. Firma, makine ve geçmiş servis kayıtları korunur; bu işlem yalnızca talep kaydını arşivler.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDeleteService && (
            <div className="rounded-lg border border-border/60 bg-muted/25 p-3 text-sm">
              <p className="font-medium">{customerName(pendingDeleteService.customerId)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{machineName(pendingDeleteService.machineId)} · {SERVICE_NEXT_ACTION[pendingDeleteService.stage]}</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingServiceId}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!!deletingServiceId} onClick={(event) => { event.preventDefault(); void confirmDeleteService(); }}>
              {deletingServiceId ? "Arşivleniyor..." : "Talebi Arşivle"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (kanbanOnly) {
    return (
      <>
        <div className="space-y-4">
          {serviceOverview}
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted-foreground tabular-nums">{visibleService.length} kayıt</span>
            <FilterPopover filters={filterControls} />
          </div>
          <ServiceBoard items={visibleService} onOpen={openServiceDetail} onDelete={deleteService} deletingId={deletingServiceId} />
        </div>
        {dialogs}
      </>
    );
  }

  return (
    <>
    <div className="space-y-4">
    {serviceOverview}
    <Tabs value={view} onValueChange={(v) => setView(v as ServiceRequestsView)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList>
          <TabsTrigger value="list">Liste</TabsTrigger>
          <TabsTrigger value="complaints">
            <Inbox className="size-4" /> Şikayet Kutusu
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="size-4" /> Servis Geçmişi
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <span className="text-sm text-muted-foreground tabular-nums">
            {view === "complaints"
              ? visibleComplaints.length
              : view === "history"
                ? service.filter((s) => s.stage === "Closed").length
                : visibleService.length} kayıt
          </span>
          {view !== "history" && (
            <FilterPopover filters={view === "complaints" ? complaintFilterControls : filterControls} />
          )}
        </div>
      </div>
      <TabsContent value="list" className="mt-4">
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 bg-muted/10 p-4">
            <div><CardTitle className="text-base">Servis Talepleri</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">{visibleService.length} operasyon kaydı</p></div>
            <div className="flex items-center gap-2">
              <ExportExcelButton path="/exports/service-tickets" filename="servis-talepleri.xlsx" />
              {canCreateService && (
                <CreateServiceRequestDialog
                  trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Talep</Button>}
                />
              )}
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Talep / Firma</TableHead>
                <TableHead>Makine</TableHead>
                <TableHead>Öncelik / SLA</TableHead>
                <TableHead>Sorumlu</TableHead>
                <TableHead>Sonraki Adım</TableHead>
                <TableHead>Aşama</TableHead>
                <TableHead>Açılış</TableHead>
                <TableHead className="w-16 text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleService.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Bu filtreye uyan servis talebi bulunmuyor.
                  </TableCell>
                </TableRow>
              ) : (
              visibleService.map((s) => {
                const machine = machines.find((item) => item.id === s.machineId);
                const assignee = users.find((item) => item.id === s.assignedUserId);
                const priority = s.priority ?? "normal";
                const sla = serviceSlaInfo(s);
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer group"
                    onClick={() => openServiceDetail(s)}
                    onKeyDown={(e) => e.key === "Enter" && openServiceDetail(s)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${customerName(s.customerId)} servis talebi, ${s.stage}`}
                  >
                    <TableCell>
                      <RecordIdentity
                        eyebrow={s.ticketNo || "SERVİS KAYDI"}
                        title={customerName(s.customerId)}
                        description={serviceNoteText(s)}
                        meta={<><ServiceIntakeBadges serviceRequest={s} /><WarrantyClaimBadge serviceRequest={s} /></>}
                      />
                    </TableCell>
                    <TableCell>
                      <RecordIdentity
                        visual={<EntityVisual title={machine?.model || "Makine"} overline={machine?.serialNumber} icon={<Wrench className="size-4" />} size="sm" />}
                        eyebrow={machine?.brand || "MAKİNE"}
                        title={machine?.model || "Makine eşleşmedi"}
                        description={machine?.serialNumber || "Seri numarası yok"}
                      />
                    </TableCell>
                    <TableCell><div className="min-w-[110px]"><Badge variant="outline" className={SERVICE_PRIORITY_CLASS[priority]}>{SERVICE_PRIORITY_LABELS[priority]}</Badge><p className={`mt-1.5 text-[11px] font-medium ${sla.tone}`}>{sla.label}</p></div></TableCell>
                    <TableCell><div className="flex min-w-[130px] items-center gap-2"><Avatar className="size-7 border border-border/60"><AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials(assignee?.name || "?")}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-xs font-medium">{assignee?.name || "Atanmadı"}</p><p className="truncate text-[10px] text-muted-foreground">{assignee?.department || "Servis ekibi"}</p></div></div></TableCell>
                    <TableCell><div className="flex min-w-[150px] items-start gap-2"><Workflow className="mt-0.5 size-3.5 shrink-0 text-primary" /><div><p className="text-xs font-medium">{SERVICE_NEXT_ACTION[s.stage]}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{STAGE_TO_COLUMN[s.stage]}</p></div></div></TableCell>
                    <TableCell><StatusBadge status={s.stage} /></TableCell>
                    <TableCell className="text-muted-foreground">{s.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        title="Konumu haritada aç"
                        onClick={(event) => {
                          event.stopPropagation();
                          const c = customers.find((x) => x.id === s.customerId);
                          openInMaps([c?.address, c?.district, c?.city]);
                        }}
                      >
                        <MapPin className="size-4 text-muted-foreground hover:text-primary" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="Yazdır / PDF"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Printer className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenuItem onClick={() => openServiceFormPdf(s)}>
                            Servis Formu PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => printServiceQuote(s)}>
                            Servis Teklifi yazdır
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        title="Servis talebini sil"
                        disabled={deletingServiceId === s.id}
                        onClick={(event) => deleteService(s, event)}
                      >
                        <Trash2 className="size-4 text-muted-foreground hover:text-red-600" />
                      </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }))}
            </TableBody>
          </Table>
          </div>
        </Card>
      </TabsContent>
      <TabsContent value="complaints" className="mt-4">
        <ComplaintInbox
          complaints={visibleComplaints}
          links={complaintLinks}
          loading={complaintsLoading}
          customers={customers}
          machines={machines}
          onOpen={setSelectedComplaint}
          onCreateInternal={() => setCreateComplaintOpen(true)}
          onCreateLink={() => setCreateLinkOpen(true)}
          onReview={(complaint) => updateComplaintStatus(complaint, "reviewing")}
          onConvert={convertComplaint}
          onReject={(complaint) => rejectComplaint(complaint)}
          onRevokeLink={revokeComplaintLink}
          onIssueLink={issueComplaintLink}
          onReload={loadComplaints}
        />
      </TabsContent>
      <TabsContent value="history" className="mt-4">
        <ServiceHistoryView
          query={historyQuery}
          onQueryChange={setHistoryQuery}
          items={service}
          customers={customers}
          machines={machines}
          users={users}
          onOpen={(s) => openServiceDetail(s)}
        />
      </TabsContent>
    </Tabs>
    </div>
    {dialogs}
    </>
  );
}

type ServiceColumnKey =
  | "Servis Talep"
  | "Müşteri İletişim"
  | "Servis Teklifi"
  | "Bakım/Onarım & Yedek Parça"
  | "Servis Devam Ediyor"
  | "Servis Tamamlandı Formu";

const SERVICE_COLUMNS: { key: ServiceColumnKey; stages: ServiceStage[]; primary: ServiceStage; dot: string }[] = [
  { key: "Servis Talep", stages: ["Request Opened"], primary: "Request Opened", dot: "bg-zinc-400" },
  { key: "Müşteri İletişim", stages: ["Diagnosis"], primary: "Diagnosis", dot: "bg-blue-400" },
  { key: "Servis Teklifi", stages: ["Quote Needed", "Quote Sent", "Approval"], primary: "Quote Sent", dot: "bg-indigo-500" },
  { key: "Bakım/Onarım & Yedek Parça", stages: ["Scheduled"], primary: "Scheduled", dot: "bg-amber-500" },
  { key: "Servis Devam Ediyor", stages: ["Service In Progress"], primary: "Service In Progress", dot: "bg-sky-500" },
  { key: "Servis Tamamlandı Formu", stages: ["Service Completed", "Signed Form", "Closed"], primary: "Signed Form", dot: "bg-emerald-600" },
];

const STAGE_TO_COLUMN: Record<ServiceStage, ServiceColumnKey> = SERVICE_COLUMNS.reduce((acc, col) => {
  for (const st of col.stages) acc[st] = col.key;
  return acc;
}, {} as Record<ServiceStage, ServiceColumnKey>);

type ServiceDetailTab = "summary" | "quote" | "machine" | "warranty" | "communication" | "notes" | "activities" | "operations" | "completion";

const SERVICE_ACTIVITY_ENABLED_STAGES = new Set<ServiceStage>(["Service In Progress", "Service Completed", "Signed Form", "Closed"]);
const SERVICE_FEE_ENABLED_STAGES = new Set<ServiceStage>(["Service Completed", "Signed Form", "Closed"]);
const SERVICE_COMPLETION_ENABLED_STAGES = new Set<ServiceStage>(["Service In Progress", "Service Completed", "Signed Form", "Closed"]);

const isServiceDetailTabEnabled = (stage: ServiceStage, tab: ServiceDetailTab) => {
  if (tab === "activities") return SERVICE_ACTIVITY_ENABLED_STAGES.has(stage);
  if (tab === "operations") return SERVICE_FEE_ENABLED_STAGES.has(stage);
  if (tab === "completion") return SERVICE_COMPLETION_ENABLED_STAGES.has(stage);
  return true;
};

const isPartOperation = (operation: NonNullable<ServiceRequest["operations"]>[number]) =>
  operation.kind === "part"
  || operation.id.startsWith("srv-part-")
  || operation.description.trim().toLocaleLowerCase("tr-TR").startsWith("parça kullanımı:");

const serviceFormTypeFromRequest = (serviceRequest: ServiceRequest): ServiceFormType => {
  const source = [serviceRequest.issueType, serviceRequest.description, serviceRequest.diagnosisNote]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  if (source.includes("montaj") || source.includes("kurulum")) return "montaj";
  if (source.includes("periyodik") || source.includes("bakım")) return "periyodik";
  return "ariza";
};

const serviceResponsibilityFromRequest = (serviceRequest: ServiceRequest): ServiceFormResponsibility => {
  if (serviceRequest.warrantyClaim?.coverageDecision === "approved") return "garanti";
  const source = [serviceRequest.issueType, serviceRequest.description, serviceRequest.diagnosisNote]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  return source.includes("bakım anl") ? "bakim" : "ucretli";
};

const serviceCompletionPartsFromRequest = (serviceRequest: ServiceRequest): ServiceCompletionPart[] => {
  const operationParts = (serviceRequest.operations ?? [])
    .filter(isPartOperation)
    .map((operation) => ({
      id: operation.id,
      description: operation.description.replace(/^Parça kullanımı:\s*/i, "").trim(),
      quantity: Math.max(1, Number(operation.quantity) || 1),
      unitPrice: Math.max(0, Number(operation.unitPrice) || 0),
    }));
  const warrantyParts = (serviceRequest.warrantyClaim?.parts ?? []).map((part, index) => ({
    id: part.id ?? `warranty-part-${index}`,
    description: part.description,
    quantity: Math.max(1, Number(part.quantity) || 1),
    unitPrice: Math.max(0, Number(part.unitCost) || 0),
  }));
  return [...operationParts, ...warrantyParts].slice(0, 6);
};

const buildDefaultCompletionForm = (params: {
  s: ServiceRequest;
  customer?: Customer | null;
  contact?: Contact | null;
  machine?: Machine | null;
  assignee?: { name?: string } | null;
}): ServiceCompletionForm => {
  const { s, customer, contact, machine, assignee } = params;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const workOperations = (s.operations ?? []).filter((operation) => !isPartOperation(operation));
  const serviceFee = ((s.timerElapsedSeconds ?? 0) / 3600) * (s.serviceHourlyRate ?? 0);
  return {
    formNo: s.ticketNo || s.id,
    teslimTarihi: machine?.deliveryDate ?? "",
    kurulumTarihi: today,
    tezgah: machine
      ? { marka: machine.brand, tip: machine.type, model: machine.model, seriNo: machine.serialNumber }
      : { marka: "", tip: "", model: "", seriNo: "" },
    cnc: machine
      ? {
          marka: machine.controlUnit?.split(" ")[0] ?? "",
          model: machine.controlUnit?.split(" ").slice(1).join(" ") ?? "",
          seriNo: machine.controlUnitSerial ?? "",
          mainSw: "",
        }
      : { marka: "", model: "", seriNo: "", mainSw: "" },
    kullanici: {
      firma: customer?.name ?? "",
      ilgili: contact?.name ?? customer?.contactPerson ?? "",
      adres: customer ? [customer.address, customer.district, customer.city].filter(Boolean).join(" ") : "",
      telefon: customer?.phone ?? "",
      faks: customer?.fax ?? "",
      gsm: contact?.mobilePhone ?? customer?.phone2 ?? "",
      eposta: contact?.email ?? customer?.email ?? "",
      vergiDairesi: customer?.taxOffice ?? "",
      vergiNo: customer?.taxNumber ?? "",
    },
    checks: [],
    musteriSikayeti: (s.complaints ?? []).map((item) => item.text.trim()).filter(Boolean).join("\n")
      || s.description
      || s.diagnosisNote
      || s.issueType
      || "",
    serviceType: serviceFormTypeFromRequest(s),
    responsibility: serviceResponsibilityFromRequest(s),
    yapilanIsler: workOperations.map((operation) => operation.description.trim()).filter(Boolean).join("\n")
      || s.serviceNote
      || "",
    notlar: "",
    degisenParcalar: serviceCompletionPartsFromRequest(s),
    servisUcreti: Number(serviceFee.toFixed(2)),
    ulasimUcreti: 0,
    currency: s.serviceCurrency ?? "TRY",
    kurulumuYapan: assignee?.name ?? "",
    teslimAlan: contact?.name ?? customer?.contactPerson ?? "",
  };
};

const mergeCompletionForm = (
  existing: ServiceCompletionForm | null | undefined,
  fallback: ServiceCompletionForm,
): ServiceCompletionForm => {
  if (!existing) return fallback;
  return {
    ...fallback,
    ...existing,
    tezgah: { ...fallback.tezgah, ...(existing.tezgah ?? {}) },
    cnc: { ...fallback.cnc, ...(existing.cnc ?? {}) },
    kullanici: { ...fallback.kullanici, ...(existing.kullanici ?? {}) },
    checks: existing.checks ?? fallback.checks,
    degisenParcalar: existing.degisenParcalar ?? fallback.degisenParcalar,
  };
};

export function ServiceKanbanPage({ focus }: { focus?: OperationFocus }) {
  return <ServiceRequestsPage initialView="board" focus={focus} kanbanOnly />;
}

const complaintCompanyName = (complaint: ServiceComplaintIntake) =>
  complaint.company?.shortName ?? complaint.company?.legalTitle ?? "Eşleşmemiş";

const complaintMachineName = (complaint: ServiceComplaintIntake) =>
  [complaint.machine?.brand, complaint.machine?.model, complaint.machine?.serialNumber].filter(Boolean).join(" · ") || "Eşleşmemiş";

function ComplaintStatusBadge({ status }: { status: ServiceComplaintIntake["status"] }) {
  const className =
    status === "converted"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "rejected"
        ? "border-red-200 bg-red-50 text-red-700"
        : status === "reviewing"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "bg-muted/40";
  return <Badge variant="outline" className={className}>{COMPLAINT_STATUS_LABELS[status]}</Badge>;
}

function ComplaintInbox({
  complaints,
  links,
  loading,
  customers,
  machines,
  onOpen,
  onCreateInternal,
  onCreateLink,
  onReview,
  onConvert,
  onReject,
  onRevokeLink,
  onIssueLink,
  onReload,
}: {
  complaints: ServiceComplaintIntake[];
  links: ServiceComplaintLink[];
  loading: boolean;
  customers: Customer[];
  machines: Machine[];
  onOpen: (complaint: ServiceComplaintIntake) => void;
  onCreateInternal: () => void;
  onCreateLink: () => void;
  onReview: (complaint: ServiceComplaintIntake) => void;
  onConvert: (complaint: ServiceComplaintIntake) => void;
  onReject: (complaint: ServiceComplaintIntake) => void;
  onRevokeLink: (link: ServiceComplaintLink) => void;
  onIssueLink: (link: ServiceComplaintLink) => Promise<ServiceComplaintLink>;
  onReload: () => void;
}) {
  const { hasPermission } = useAuth();
  const canCreateService = hasPermission("service_tickets.create");
  const [mode, setMode] = useState<"intakes" | "links">("intakes");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const absoluteUrl = (path?: string | null) => path ? `${window.location.origin}${path}` : "";
  const issueUrl = async (link: ServiceComplaintLink) => {
    const credential = await onIssueLink(link);
    const url = absoluteUrl(credential.publicPath);
    if (!url) throw new Error("Link kimlik bilgisi alınamadı");
    return url;
  };
  const showQr = async (url: string) => {
    setQrImage(await QRCode.toDataURL(url, { width: 360, margin: 2, errorCorrectionLevel: "M" }));
  };
  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><Inbox className="size-5" /> Şikayet Kutusu</CardTitle>
          <div className="mt-1 text-sm text-muted-foreground">
            {complaints.length} şikayet · {links.length} public link · {customers.length} firma · {machines.length} makine
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant={mode === "intakes" ? "secondary" : "outline"} onClick={() => setMode("intakes")}>
            Gelen Şikayetler
          </Button>
          <Button variant={mode === "links" ? "secondary" : "outline"} onClick={() => setMode("links")}>
            Public Linkler
          </Button>
          <Button variant="outline" className="gap-1" onClick={() => exportService.serviceComplaints()}>
            <Send className="size-4" /> Excel
          </Button>
          <Button variant="outline" className="gap-1" onClick={onReload} disabled={loading}>
            Yenile
          </Button>
          {canCreateService && (
            <>
              <Button variant="outline" className="gap-1" onClick={onCreateLink}>
                <Link2 className="size-4" /> Public Link
              </Button>
              <CreateServiceRequestDialog
                trigger={
                  <Button variant="outline" className="gap-1">
                    <Wrench className="size-4" /> Yeni Talep
                  </Button>
                }
              />
              <Button className="gap-1" onClick={onCreateInternal}>
                <Plus className="size-4" /> Yeni İç Kayıt
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        {mode === "links" ? (
        <Table className="min-w-[940px]">
          <TableHeader>
            <TableRow>
              <TableHead>Başlık</TableHead>
              <TableHead>Firma</TableHead>
              <TableHead>Makine</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>Oluşturma</TableHead>
              <TableHead className="text-right">Aksiyon</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Public link yok.
                </TableCell>
              </TableRow>
            ) : links.map((link) => {
              return (
                <TableRow key={link.id}>
                  <TableCell className="font-medium">{link.title || "Servis Şikayet Formu"}</TableCell>
                  <TableCell>{link.company?.shortName || link.company?.legalTitle || "Genel link"}</TableCell>
                  <TableCell className="text-muted-foreground">{link.machine ? [link.machine.model, link.machine.serialNumber].filter(Boolean).join(" · ") : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={link.isActive && !link.revokedAt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>
                      {link.isActive && !link.revokedAt ? "Aktif" : "Pasif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{(link as any).createdAt?.slice(0, 10) ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Yeni link üret ve kopyala"
                        onClick={() => void issueUrl(link).then((url) => navigator.clipboard?.writeText(url)).catch(() => undefined)}
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Yeni link üret ve aç"
                        onClick={() => void issueUrl(link).then((url) => window.open(url, "_blank", "noopener")).catch(() => undefined)}
                      >
                        <ExternalLink className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Yeni link için QR kodu üret"
                        onClick={() => void issueUrl(link).then(showQr).catch(() => undefined)}
                      >
                        <Link2 className="size-4" />
                      </Button>
                      {link.isActive && !link.revokedAt && (
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onRevokeLink(link)}>
                          İptal
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        ) : (
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>Kayıt</TableHead>
              <TableHead>Firma</TableHead>
              <TableHead>Makine</TableHead>
              <TableHead>Kaynak</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>Öncelik</TableHead>
              <TableHead>Konu</TableHead>
              <TableHead>İletişim</TableHead>
              <TableHead className="text-right">Aksiyon</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {complaints.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  {loading ? "Şikayetler yükleniyor..." : "Bu filtreye uyan şikayet yok."}
                </TableCell>
              </TableRow>
            ) : complaints.map((complaint) => (
              <TableRow
                key={complaint.id}
                className="cursor-pointer"
                onClick={() => onOpen(complaint)}
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onOpen(complaint)}
              >
                <TableCell className="font-medium">{complaint.complaintNo}</TableCell>
                <TableCell>{complaintCompanyName(complaint)}</TableCell>
                <TableCell className="text-muted-foreground">{complaintMachineName(complaint)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-white">{COMPLAINT_SOURCE_LABELS[complaint.source]}</Badge>
                </TableCell>
                <TableCell><ComplaintStatusBadge status={complaint.status} /></TableCell>
                <TableCell>{SEVERITY_LABELS[complaint.severity] ?? complaint.severity}</TableCell>
                <TableCell className="max-w-[240px] truncate">{complaint.subject}</TableCell>
                <TableCell className="max-w-[180px] truncate">{[complaint.contactName, complaint.contactPhone].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {complaint.status === "new" && (
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onReview(complaint); }}>
                        İncele
                      </Button>
                    )}
                    {complaint.status !== "converted" && complaint.status !== "rejected" && (
                      <>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onConvert(complaint); }}>
                          Servis aç
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={(e) => { e.stopPropagation(); onReject(complaint); }}>
                          Reddet
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </div>
      <Dialog open={!!qrImage} onOpenChange={(open) => !open && setQrImage(null)}>
        <DialogContent className="w-fit max-w-[calc(100vw-2rem)]">
          <DialogHeader><DialogTitle>QR Kod</DialogTitle></DialogHeader>
          {qrImage && <img src={qrImage} alt="Şikayet formu QR kodu" width={360} height={360} className="max-w-full" />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CreateComplaintDialog({
  open,
  onOpenChange,
  machines,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machines: Machine[];
  onCreated: () => void;
}) {
  const [companyId, setCompanyId] = useState(NONE);
  const [machineId, setMachineId] = useState(NONE);
  const [contactId, setContactId] = useState(NONE);
  const [source, setSource] = useState<ServiceComplaintIntake["source"]>("manual");
  const [severity, setSeverity] = useState<ServiceComplaintIntake["severity"]>("normal");
  const [ticketType, setTicketType] = useState<ServiceTicketType>("complaint");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const autoFilledCompanyRef = useRef<string | null>(null);
  const selectedCompanyId = companyId === NONE ? null : companyId;
  const selectedCompanyQuery = useCompanyDetail(selectedCompanyId);
  const selectedCompany = selectedCompanyQuery.data;
  const companyContactsQuery = useRemoteCompanyContacts(selectedCompanyId, open);
  const filteredMachines = companyId === NONE ? machines : machines.filter((m) => m.customerId === companyId);
  const filteredContacts = companyContactsQuery.data?.data ?? [];

  const fillContactFields = (contact?: Contact, customer?: Customer) => {
    setContactName(contact?.name ?? customer?.contactPerson ?? "");
    setContactPhone(contact?.mobilePhone || contact?.phone || contact?.otherPhone || customer?.phone || customer?.phone2 || "");
    setContactEmail(contact?.email || contact?.personalEmail || contact?.otherEmail || customer?.email || customer?.email2 || "");
  };

  const selectCompany = (nextCompanyId: string) => {
    setCompanyId(nextCompanyId);
    setMachineId(NONE);
    setContactId(NONE);
    setContactName("");
    setContactPhone("");
    setContactEmail("");
    autoFilledCompanyRef.current = null;
  };

  const selectMachine = (nextMachineId: string) => {
    setMachineId(nextMachineId);
    if (nextMachineId === NONE || companyId !== NONE) return;
    const machine = machines.find((item) => item.id === nextMachineId);
    if (machine) selectCompany(machine.customerId);
    setMachineId(nextMachineId);
  };

  const selectContact = (nextContactId: string) => {
    setContactId(nextContactId);
    const contact = filteredContacts.find((item) => item.id === nextContactId);
    fillContactFields(contact, selectedCompany);
  };

  useEffect(() => {
    if (!open || !selectedCompanyId || companyContactsQuery.isPending || selectedCompanyQuery.isPending) return;
    if (autoFilledCompanyRef.current === selectedCompanyId) return;
    autoFilledCompanyRef.current = selectedCompanyId;
    const preferredContact = filteredContacts.find((contact) => contact.isPrimary) ?? filteredContacts[0];
    setContactId(preferredContact?.id ?? NONE);
    fillContactFields(preferredContact, selectedCompany);
  }, [
    companyContactsQuery.isPending,
    filteredContacts,
    open,
    selectedCompany,
    selectedCompanyId,
    selectedCompanyQuery.isPending,
  ]);

  useEffect(() => {
    if (!open) return;
    setCompanyId(NONE);
    setMachineId(NONE);
    setContactId(NONE);
    setSource("manual");
    setSeverity("normal");
    setTicketType("complaint");
    setSubject("");
    setDescription("");
    setContactName("");
    setContactPhone("");
    setContactEmail("");
    autoFilledCompanyRef.current = null;
  }, [open]);

  const submit = async () => {
    if (subject.trim().length < 3) {
      toast.error("Konu en az 3 karakter olmalı.");
      return;
    }
    setSaving(true);
    try {
      await serviceService.createComplaint({
        companyId: companyId === NONE ? null : companyId,
        customerDeviceId: machineId === NONE ? null : machineId,
        source,
        severity,
        ticketType,
        subject,
        description,
        contactName,
        contactPhone,
        contactEmail,
      });
      toast.success("Şikayet kaydı açıldı");
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast.error("Şikayet kaydı açılamadı", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(720px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yeni İç Şikayet Kaydı</DialogTitle>
          <DialogDescription>Telefon, WhatsApp, e-posta veya iç bildirim olarak gelen şikayeti kutuya alın.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Firma</Label>
            <RemoteCompanyCombobox
              value={selectedCompanyId}
              onValueChange={selectCompany}
              className="mt-1"
              placeholder="Eşleşmemiş"
            />
            {selectedCompanyId && (
              <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-2 text-[11px] text-muted-foreground" onClick={() => selectCompany(NONE)}>
                Firma eşleşmesini kaldır
              </Button>
            )}
          </div>
          <div>
            <Label>Makine</Label>
            <Select value={machineId} onValueChange={selectMachine}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Eşleşmemiş</SelectItem>
                {filteredMachines.map((m) => <SelectItem key={m.id} value={m.id}>{m.model} · {m.serialNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Kaynak</Label>
            <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(COMPLAINT_SOURCE_LABELS).filter(([v]) => v !== "qr" && v !== "web").map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Öncelik</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SEVERITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Kayıt Tipi</Label>
            <Select value={ticketType} onValueChange={(v) => setTicketType(v as ServiceTicketType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_TICKET_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Konu</Label>
            <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>İlgili Kişi</Label>
            <Select value={contactId} onValueChange={selectContact} disabled={companyId === NONE || companyContactsQuery.isPending}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={companyContactsQuery.isPending ? "İlgili kişiler yükleniyor…" : "İlgili kişi seçin"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Firma bilgisi / elle giriş</SelectItem>
                {filteredContacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name}{contact.title ? ` · ${contact.title}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Telefon</Label>
            <Input className="mt-1" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>İlgili Kişi Adı</Label>
                <Input className="mt-1" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div>
                <Label>E-posta</Label>
                <Input className="mt-1" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Açıklama</Label>
            <Textarea className="mt-1 min-h-28" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
          <Button onClick={submit} disabled={saving}>Kaydet</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateComplaintLinkDialog({
  open,
  onOpenChange,
  machines,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machines: Machine[];
  onCreated: () => void;
}) {
  const [companyId, setCompanyId] = useState(NONE);
  const [machineId, setMachineId] = useState(NONE);
  const [title, setTitle] = useState("");
  const [latestLink, setLatestLink] = useState("");
  const [latestExpiresAt, setLatestExpiresAt] = useState("");
  const [latestQrImage, setLatestQrImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedCompanyId = companyId === NONE ? null : companyId;
  const selectedCompanyQuery = useCompanyDetail(selectedCompanyId);
  const filteredMachines = companyId === NONE ? machines : machines.filter((m) => m.customerId === companyId);
  const selectedCompany = selectedCompanyQuery.data;
  const selectedMachine = machines.find((machine) => machine.id === machineId);

  useEffect(() => {
    if (!open) return;
    setCompanyId(NONE);
    setMachineId(NONE);
    setTitle("");
    setLatestLink("");
    setLatestExpiresAt("");
    setLatestQrImage(null);
  }, [open]);

  const copyLatestLink = async () => {
    try {
      await navigator.clipboard?.writeText(latestLink);
      toast.success("Link panoya kopyalandı");
    } catch {
      toast.error("Link kopyalanamadı");
    }
  };

  const shareLatestLink = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: title.trim() || "Servis Şikayet Formu", url: latestLink });
        return;
      }
      await copyLatestLink();
    } catch (err: any) {
      if (err?.name !== "AbortError") toast.error("Link paylaşılamadı");
    }
  };

  const create = async () => {
    setSaving(true);
    try {
      const link = await serviceService.createComplaintLink({
        companyId: companyId === NONE ? null : companyId,
        customerDeviceId: machineId === NONE ? null : machineId,
        title,
      });
      const url = `${window.location.origin}${link.publicPath}`;
      setLatestLink(url);
      setLatestExpiresAt(String(link.accessTokenExpiresAt ?? ""));
      await navigator.clipboard?.writeText(url);
      toast.success("Public şikayet linki oluşturuldu", { description: "Link panoya kopyalandı." });
      onCreated();
    } catch (err: any) {
      toast.error("Link oluşturulamadı", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(680px,calc(100vw-2rem))] max-w-none overflow-hidden p-0 sm:max-w-none">
        <div className="h-1 bg-brand-red" />
        <div className="max-h-[calc(90dvh-4px)] overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-xl border border-primary/15 bg-primary/5 text-primary"><Link2 className="size-5" /></div>
          <DialogTitle>Herkese Açık Şikayet Linki</DialogTitle>
          <DialogDescription>Linkin kapsamını belirleyin; müşteri giriş yapmadan güvenli servis bildirimi oluşturabilsin.</DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label>Firma</Label>
            <RemoteCompanyCombobox
              value={selectedCompanyId}
              onValueChange={(companyId) => { setCompanyId(companyId); setMachineId(NONE); }}
              className="mt-1"
              placeholder="Genel link"
            />
            {selectedCompanyId && (
              <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-2 text-[11px] text-muted-foreground" onClick={() => { setCompanyId(NONE); setMachineId(NONE); }}>
                Genel linke dön
              </Button>
            )}
          </div>
          <div>
            <Label>Makine</Label>
            <Select value={machineId} onValueChange={setMachineId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Makine bağlama</SelectItem>
                {filteredMachines.map((m) => <SelectItem key={m.id} value={m.id}>{m.model} · {m.serialNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Başlık</Label>
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Servis Şikayet Formu" />
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/25 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><Workflow className="size-4 text-primary" /> Link kapsamı</div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {selectedMachine
                ? `${selectedMachine.model} · ${selectedMachine.serialNumber}`
                : selectedCompany
                  ? `${selectedCompany.name} firmasındaki tüm makineler`
                  : "Genel servis bildirim formu"}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/25 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><Clock3 className="size-4 text-primary" /> Geçerlilik</div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Link sunucuda tanımlı güvenli süre boyunca aktif kalır; gerektiğinde yenilenebilir veya iptal edilebilir.</p>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/[0.035] p-3 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>Bu linke sahip kişiler servis formunu görüntüleyebilir ve bildirim gönderebilir. Link yalnız hedef firma veya makine bağlamını paylaşır; iç CRM kayıtlarına erişim vermez.</span>
        </div>
        {latestLink && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800"><CheckCircle2 className="size-4" /> Link kullanıma hazır</div>
            <div className="mt-1.5 truncate font-data text-xs text-emerald-900">{latestLink}</div>
            {latestExpiresAt && <div className="mt-1 text-[11px] text-emerald-800/75">Son geçerlilik: {new Date(latestExpiresAt).toLocaleString("tr-TR")}</div>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1 bg-white" onClick={copyLatestLink}>
                <Copy className="size-4" /> Kopyala
              </Button>
              <Button variant="outline" size="sm" className="gap-1 bg-white" onClick={shareLatestLink}>
                <Share2 className="size-4" /> Paylaş
              </Button>
              <Button variant="outline" size="sm" className="gap-1 bg-white" onClick={() => window.open(latestLink, "_blank", "noopener")}>
                <ExternalLink className="size-4" /> Aç
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 bg-white"
                onClick={async () => setLatestQrImage(await QRCode.toDataURL(latestLink, { width: 360, margin: 2, errorCorrectionLevel: "M" }))}
              >
                <Link2 className="size-4" /> QR Aç
              </Button>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Kapat</Button>
          <Button onClick={create} disabled={saving}>Link oluştur</Button>
        </div>
        <Dialog open={!!latestQrImage} onOpenChange={(nextOpen) => !nextOpen && setLatestQrImage(null)}>
          <DialogContent className="w-fit max-w-[calc(100vw-2rem)]">
            <DialogHeader><DialogTitle>Servis Formu QR Kodu</DialogTitle><DialogDescription>Müşteri etiketi veya servis alanı için güvenli link önizlemesi.</DialogDescription></DialogHeader>
            {latestQrImage && <img src={latestQrImage} alt="Şikayet formu QR kodu" width={360} height={360} className="max-w-full" />}
            {latestQrImage && <Button variant="outline" asChild className="gap-1"><a href={latestQrImage} download="servis-sikayet-qr.png"><Download className="size-4" /> PNG indir</a></Button>}
          </DialogContent>
        </Dialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ComplaintDetailDialog({
  complaint,
  machines,
  onClose,
  onSaved,
  onConvert,
  onReject,
}: {
  complaint: ServiceComplaintIntake | null;
  machines: Machine[];
  onClose: () => void;
  onSaved: () => void;
  onConvert: (complaint: ServiceComplaintIntake) => Promise<void> | void;
  onReject: (complaint: ServiceComplaintIntake, note?: string) => Promise<void> | void;
}) {
  const [companyId, setCompanyId] = useState(NONE);
  const [machineId, setMachineId] = useState(NONE);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<ServiceComplaintIntake["severity"]>("normal");
  const [ticketType, setTicketType] = useState<ServiceTicketType>("complaint");
  const [rejectNote, setRejectNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!complaint) return;
    setCompanyId(complaint.companyId ?? NONE);
    setMachineId(complaint.customerDeviceId ?? NONE);
    setSubject(complaint.subject);
    setDescription(complaint.description ?? "");
    setSeverity(complaint.severity);
    setTicketType(complaint.ticketType);
    setRejectNote(complaint.rejectionNote ?? "");
  }, [complaint?.id]);

  if (!complaint) return null;
  const filteredMachines = companyId === NONE ? machines : machines.filter((m) => m.customerId === companyId);
  const closed = complaint.status === "converted" || complaint.status === "rejected";

  const save = async () => {
    setSaving(true);
    try {
      await serviceService.updateComplaint(complaint.id, {
        companyId: companyId === NONE ? null : companyId,
        customerDeviceId: machineId === NONE ? null : machineId,
        subject,
        description,
        severity,
        ticketType,
      });
      toast.success("Şikayet kaydı güncellendi");
      await onSaved();
      return true;
    } catch (err: any) {
      toast.error("Şikayet güncellenemedi", { description: err?.message ?? "İşlem başarısız." });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const convert = async () => {
    const saved = await save();
    if (!saved) return;
    await onConvert(complaint);
    onClose();
  };

  const reject = async () => {
    await onReject(complaint, rejectNote);
    onClose();
  };

  const uploadEvidence = async (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") ?? "";
    const mime = file.type || COMPLAINT_EXT_TO_MIME[ext];
    if (!COMPLAINT_EXT_TO_MIME[ext] || !mime) {
      toast.error("Desteklenmeyen dosya tipi", { description: "PDF, DOCX, XLSX, PNG, JPG veya WEBP yükleyebilirsiniz." });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Dosya boyutu 25 MB'ı aşamaz");
      return;
    }
    setUploading(true);
    try {
      const up = await fileService.signedUpload({
        bucket: "erp-service-documents",
        entityType: "service_complaint_intake",
        entityId: complaint.id,
        filename: file.name,
        mimeType: mime as any,
        extension: ext as any,
        sizeBytes: file.size,
      });
      await fileService.uploadBinary(up, file, mime);
      await fileService.link({
        fileId: up.fileId,
        entityType: "service_complaint_intake",
        entityId: complaint.id,
        documentTypeCode: "service_complaint_evidence",
      });
      toast.success("Kanıt dosyası eklendi");
      await onSaved();
    } catch (err: any) {
      toast.error("Dosya eklenemedi", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setUploading(false);
    }
  };

  const warrantyText = WARRANTY_SUGGESTION_LABELS[complaint.warrantyStatusSuggestion ?? "unknown"] ?? "Bilinmiyor";
  return (
    <Dialog open={!!complaint} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(780px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{complaint.complaintNo} · {complaint.subject}</DialogTitle>
          <DialogDescription>
            {COMPLAINT_SOURCE_LABELS[complaint.source]} · {COMPLAINT_STATUS_LABELS[complaint.status]} · {complaint.createdAt?.slice(0, 10) ?? "—"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Firma</Label>
            <RemoteCompanyCombobox
              value={companyId === NONE ? null : companyId}
              onValueChange={(nextCompanyId) => { setCompanyId(nextCompanyId); setMachineId(NONE); }}
              disabled={closed}
              className="mt-1"
              placeholder="Eşleşmemiş"
            />
            {companyId !== NONE && !closed && (
              <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-2 text-[11px] text-muted-foreground" onClick={() => { setCompanyId(NONE); setMachineId(NONE); }}>
                Firma eşleşmesini kaldır
              </Button>
            )}
          </div>
          <div>
            <Label>Makine</Label>
            <Select value={machineId} onValueChange={setMachineId} disabled={closed}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Eşleşmemiş</SelectItem>
                {filteredMachines.map((m) => <SelectItem key={m.id} value={m.id}>{m.model} · {m.serialNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Öncelik</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)} disabled={closed}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SEVERITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Kayıt Tipi</Label>
            <Select value={ticketType} onValueChange={(v) => setTicketType(v as ServiceTicketType)} disabled={closed}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_TICKET_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Konu</Label>
            <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={closed} />
          </div>
          <div className="md:col-span-2">
            <Label>Açıklama</Label>
            <Textarea className="mt-1 min-h-28" value={description} onChange={(e) => setDescription(e.target.value)} disabled={closed} />
          </div>
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
            <div><span className="text-muted-foreground">İlgili:</span> {complaint.contactName || "—"}</div>
            <div><span className="text-muted-foreground">Telefon:</span> {complaint.contactPhone || "—"}</div>
            <div><span className="text-muted-foreground">E-posta:</span> {complaint.contactEmail || "—"}</div>
          </div>
          <div className="md:col-span-2 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">Garanti durumu: {warrantyText}</div>
                <div className="text-muted-foreground">
                  {complaint.machine?.warrantyEndDate ? `Bitiş: ${complaint.machine.warrantyEndDate.slice(0, 10)}` : "Garanti tarihi bulunmuyor"}
                </div>
              </div>
              {ticketType === "warranty_claim" && machineId === NONE && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  Onaya gönderilemez, önce makine eşleştir
                </Badge>
              )}
            </div>
          </div>
          <div className="md:col-span-2 rounded-md border border-border/60 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Kanıt dosyaları</div>
                <div className="text-xs text-muted-foreground">{complaint.attachments?.length ?? 0} dosya</div>
              </div>
              <Label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border bg-background px-3 text-sm hover:bg-muted">
                {uploading ? "Yükleniyor..." : "Dosya ekle"}
                <Input
                  type="file"
                  accept={COMPLAINT_EVIDENCE_ACCEPT}
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    uploadEvidence(file);
                  }}
                />
              </Label>
            </div>
            <div className="mt-3 grid gap-2">
              {(complaint.attachments ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">Kanıt dosyası yok.</div>
              ) : (complaint.attachments ?? []).map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                  <span className="truncate">{attachment.originalFilename}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fileSizeText(attachment.sizeBytes)}</span>
                </div>
              ))}
            </div>
          </div>
          {complaint.serviceTicket?.ticketNo && (
            <div className="md:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Servis talebine çevrildi: {complaint.serviceTicket.ticketNo}
            </div>
          )}
          {!closed && (
            <div className="md:col-span-2">
              <Label>Reddetme Notu</Label>
              <Textarea className="mt-1 min-h-20" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Kapat</Button>
          {!closed && <Button variant="outline" onClick={save} disabled={saving}>Kaydet</Button>}
          {!closed && <Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={reject}>Reddet</Button>}
          {!closed && <Button onClick={convert}>Servis talebi aç</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ServiceBoard({
  items: visibleService,
  onOpen,
  onDelete,
  deletingId,
}: {
  items: ServiceRequest[];
  onOpen?: (s: ServiceRequest, initialTab?: ServiceDetailTab) => void;
  onDelete?: (s: ServiceRequest, event?: MouseEvent) => void | Promise<void>;
  deletingId?: string | null;
}) {
  const { moveService, customers, machines, documents, users } = useStore();
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const moveToColumn = async (id: string, to: string) => {
    const target = SERVICE_COLUMNS.find((c) => c.key === to);
    if (!target) return;
    if (target.key === "Servis Tamamlandı Formu") {
      const serviceRequest = visibleService.find((item) => item.id === id);
      if (serviceRequest) {
        try {
          if (serviceRequest.stage !== "Service Completed" && serviceRequest.stage !== "Signed Form" && serviceRequest.stage !== "Closed") {
            await moveService(id, "Service Completed");
          }
          toast.message("Servis tamamlandı formu açıldı", {
            description: "Kayıt bilgileri forma aktarıldı. Kontrol edip kaydedebilir veya servisi kapatabilirsiniz.",
          });
          onOpen?.({ ...serviceRequest, stage: "Service Completed" }, "completion");
        } catch (err: any) {
          toast.error("Servis tamamlandı aşamasına geçilemedi", { description: err?.message ?? "Aşama güncellenemedi." });
        }
      }
      return;
    }
    try {
      await moveService(id, target.primary);
      toast.success("Servis kartı taşındı", { description: `Yeni aşama: ${target.key}` });
    } catch (err: any) {
      toast.error("Servis kartı taşınamadı", { description: err?.message ?? "Aşama geçişi reddedildi." });
      if (target.primary === "Scheduled") {
        const serviceRequest = visibleService.find((item) => item.id === id);
        if (serviceRequest) onOpen?.(serviceRequest);
      }
    }
  };
  const columns: KanbanColumn<ServiceRequest>[] = SERVICE_COLUMNS.map((col) => {
    const items = visibleService.filter((s) => STAGE_TO_COLUMN[s.stage] === col.key);
    const overdueCount = items.filter((item) => serviceSlaInfo(item).overdue).length;
    const averageAge = items.length ? Math.round(items.reduce((sum, item) => sum + serviceAgeDays(item), 0) / items.length) : 0;
    return {
      key: col.key,
      title: col.key,
      dot: col.dot,
      items,
      footer: (
        <div className="flex items-center justify-between">
          <span>Ort. yaş · {averageAge}g</span>
          <span className={overdueCount ? "font-medium text-destructive" : ""}>{overdueCount} SLA aşımı</span>
        </div>
      ),
    };
  });
  return (
    <>
    <KanbanBoard<ServiceRequest>
      columns={columns}
      fit={false}
      storageKey="service"
      columnWidth={260}
      onMove={(id, _from, to) => moveToColumn(id, to)}
      renderCard={(s) => {
        const c = customers.find((x) => x.id === s.customerId);
        const machine = machines.find((x) => x.id === s.machineId);
        const assignee = users.find((x) => x.id === s.assignedUserId);
        const priority = s.priority ?? "normal";
        const sla = serviceSlaInfo(s);
        const initialTab = STAGE_TO_COLUMN[s.stage] === "Servis Tamamlandı Formu" ? "completion" : undefined;
        return (
          <Card
            data-testid={`service-kanban-card-${s.id}`}
            onClick={() => onOpen?.(s, initialTab)}
            className="group cursor-pointer rounded-lg border-transparent bg-white p-3 shadow-sm transition-all hover:-translate-y-px hover:shadow-md hover:ring-1 hover:ring-black/10"
          >
            {/* Trello benzeri etiket şeridi: kolon rengi */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={`h-1.5 w-10 rounded-full ${SERVICE_COLUMNS.find((col) => col.key === STAGE_TO_COLUMN[s.stage])?.dot ?? "bg-zinc-300"}`} />
              <span className="font-data text-[9px] font-semibold tracking-[0.08em] text-muted-foreground">{s.ticketNo || "SERVİS"}</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center text-[10px] shrink-0">
                {c?.type === "company" ? <Building2 className="size-3.5" /> : <Wrench className="size-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-tight truncate group-hover:text-primary transition-colors">{customerName(s.customerId)}</div>
                {machine && (
                  <div className="mt-1 text-[11px] text-muted-foreground truncate">
                    {machine.model} · {machine.serialNumber}
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground line-clamp-3 break-words mt-1.5">{serviceNoteText(s)}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-red-600"
                title="Servis talebini sil"
                disabled={deletingId === s.id}
                onClick={(event) => {
                  event.stopPropagation();
                  void onDelete?.(s, event);
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    title="Aşamaya gönder"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <ArrowRight className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48" onClick={(event) => event.stopPropagation()}>
                  {SERVICE_COLUMNS.map((column) => (
                    <DropdownMenuItem
                      key={column.key}
                      disabled={STAGE_TO_COLUMN[s.stage] === column.key}
                      onSelect={() => void moveToColumn(s.id, column.key)}
                    >
                      <span className={`size-2 rounded-full shrink-0 ${column.dot}`} />
                      <span>{column.key}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className={`text-[10px] ${SERVICE_PRIORITY_CLASS[priority]}`}>{SERVICE_PRIORITY_LABELS[priority]}</Badge>
                <ServiceIntakeBadges serviceRequest={s} />
                <WarrantyClaimBadge serviceRequest={s} />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar className="size-6 border border-border/60"><AvatarFallback className="bg-primary/10 text-[9px] text-primary">{initials(assignee?.name || "?")}</AvatarFallback></Avatar>
                <span className="truncate text-[10px] text-muted-foreground">{assignee?.name || "Atanmadı"}</span>
              </div>
              <span className={`shrink-0 font-data text-[10px] font-semibold ${sla.tone}`}>{sla.label}</span>
            </div>
            <ServiceCardAttachments
              serviceRequestId={s.id}
              docs={documents.filter((d) => d.serviceRequestId === s.id)}
              onPreview={setPreviewDoc}
              onOpenDetail={() => onOpen?.(s, initialTab)}
            />
          </Card>
        );
      }}
    />
    <DocumentPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </>
  );
}

type ServiceActor = {
  id?: string;
  name: string;
  email?: string;
  department?: string;
  avatarUrl?: string;
};

function ServiceActorAvatar({ actor, className = "size-8" }: { actor?: ServiceActor | null; className?: string }) {
  const fallback = initials(actor?.name ?? "Kullanıcı") || "K";
  return (
    <Avatar className={`${className} border border-border/60 bg-white`}>
      {actor?.avatarUrl && <AvatarImage src={actor.avatarUrl} alt={actor.name} />}
      <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-medium">{fallback}</AvatarFallback>
    </Avatar>
  );
}

function ServiceHistoryCard({
  text,
  createdAt,
  actor,
}: {
  text: string;
  createdAt?: string;
  actor?: ServiceActor | null;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
      <div className="flex items-start gap-3">
        <ServiceActorAvatar actor={actor} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium truncate">{actor?.name ?? "Bilinmeyen kullanıcı"}</span>
            {actor?.department && <span className="text-[11px] text-muted-foreground">{actor.department}</span>}
            {createdAt && <span className="text-[11px] text-muted-foreground tabular-nums">{createdAt}</span>}
          </div>
          <div className="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words">{text}</div>
        </div>
      </div>
    </div>
  );
}

function ServiceQuoteEditor({
  serviceRequest,
  customer,
  machine,
  actor,
  onSave,
}: {
  serviceRequest: ServiceRequest;
  customer?: Customer;
  machine?: Machine;
  actor?: ServiceActor | null;
  onSave: (quote: ServiceQuoteForm) => Promise<void>;
}) {
  const { products, noteTemplates, addNoteTemplate, updateNoteTemplate, deleteNoteTemplate } = useStore();
  const serviceQuoteTemplates = useMemo(
    () => noteTemplates.filter((template) => template.scope === SERVICE_QUOTE_NOTE_TEMPLATE_SCOPE),
    [noteTemplates]
  );
  const quoteNoteTemplates = useMemo(
    () => noteTemplates.filter((template) => (template.scope ?? "quote") === "quote"),
    [noteTemplates]
  );
  const savedNoteTemplates = useMemo(
    () => [...serviceQuoteTemplates, ...quoteNoteTemplates],
    [serviceQuoteTemplates, quoteNoteTemplates]
  );
  const buildDraft = (): ServiceQuoteForm => {
    if (serviceRequest.serviceQuote) {
      return {
        ...serviceRequest.serviceQuote,
        notes: [...serviceRequest.serviceQuote.notes],
        items: serviceRequest.serviceQuote.items.map((item) => ({ ...item })),
      };
    }
    const machineName = machine ? [machine.brand, machine.model, machine.type].filter(Boolean).join(" ") : "";
    const serialPrefix = machine?.serialNumber ? `${machine.serialNumber} Seri Numaralı ` : "";
    const issue = serviceRequest.issueType?.trim() || serviceRequest.diagnosisNote?.trim();
    const subjectParts = [`Teklifimiz ${serialPrefix}${machineName}`.trim(), issue].filter(Boolean).join(" ");
    const businessLine = serviceRequest.ticketNo?.match(/^(CNC|UNI|SACISLE)[-/]/)?.[1] ?? "CNC";
    const ticketSequence = serviceRequest.ticketNo?.match(/(\d+)$/)?.[1] ?? "";
    return {
      quoteNo: `${businessLine}-SRVTEK-${new Date().getFullYear()}/${ticketSequence || "..."}`,
      date: new Date().toISOString().slice(0, 10),
      validity: "5 İş Günü",
      writerName: actor?.name ?? "",
      writerTitle: actor?.department ?? "",
      writerEmail: actor?.email ?? "",
      company: customer?.name ?? "",
      contact: customer?.contactPerson ?? "",
      mobile: customer?.phone2 ?? "",
      phone: customer?.phone ?? "",
      address: customer ? [customer.address, customer.district, customer.city].filter(Boolean).join(" ") : "",
      email: customer?.email ?? "",
      subject: subjectParts ? `${subjectParts} kapsamaktadır.` : "",
      currency: serviceRequest.serviceCurrency ?? "USD",
      vatRate: 20,
      vatAmount: 0,
      noteVariantKey: "teknik-servis",
      notes: [...DEFAULT_SERVICE_QUOTE_NOTES],
      items: [newServiceQuoteItem()],
    };
  };

  const [draft, setDraft] = useState<ServiceQuoteForm>(buildDraft);
  const [saving, setSaving] = useState(false);
  // Ayarlar → Belge İmzaları'ndan gelen aktif imzalar. Liste boşsa seçici hiç
  // gösterilmez: seçenek üretmeyen bir kutu kullanıcıya yalan söyler.
  const [signatureOptions, setSignatureOptions] = useState<SignatureView[]>([]);
  const [noteTemplateMode, setNoteTemplateMode] = useState<"create" | "update" | "delete" | null>(null);
  const [noteTemplateTitle, setNoteTemplateTitle] = useState("");
  const [noteTemplateSaving, setNoteTemplateSaving] = useState(false);
  const selectedNoteTemplateId = noteTemplateIdFromKey(draft.noteVariantKey);
  const selectedSavedNoteTemplate = savedNoteTemplates.find((template) => template.id === selectedNoteTemplateId);
  const noteTemplateBody = () => draft.notes.map((note) => note.trim()).filter(Boolean).join("\n");

  useEffect(() => {
    setDraft(buildDraft());
  }, [serviceRequest.id, serviceRequest.serviceQuote]);

  useEffect(() => {
    let cancelled = false;
    // İmza listesi teklifin zorunlu parçası değil; yüklenemezse seçici gizli
    // kalır ve çıktı eski davranışıyla teklifi yazanın adına düşer.
    signatureService
      .list({ activeOnly: true })
      .then((rows) => { if (!cancelled) setSignatureOptions(rows); })
      .catch(() => { if (!cancelled) setSignatureOptions([]); });
    return () => { cancelled = true; };
  }, []);

  const updateItem = (id: string, patch: Partial<ServiceQuoteItem>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  };
  const serviceProducts = products.filter((product) => product.categoryCode !== "TEZGAH");
  const pickProduct = (itemId: string, productId: string) => {
    if (productId === NONE) {
      updateItem(itemId, { productModelId: null, stockCode: null });
      return;
    }
    const product = serviceProducts.find((item) => item.id === productId);
    if (!product) return;
    updateItem(itemId, {
      productModelId: product.id,
      stockCode: product.stockCode || null,
      description: product.shortDescription || [product.brand, product.model].filter(Boolean).join(" ") || product.model,
      unitPrice: product.cashPrice ?? product.listPrice ?? 0,
    });
    if (product.currency && product.currency !== draft.currency) {
      setDraft((current) => ({ ...current, currency: product.currency }));
    }
  };

  const save = async (printAfterSave = false) => {
    const businessLine = serviceRequest.ticketNo?.match(/^(CNC|UNI|SACISLE)[-/]/)?.[1] ?? "CNC";
    const enteredQuoteNo = draft.quoteNo.trim();
    const normalized: ServiceQuoteForm = {
      ...draft,
      quoteNo: enteredQuoteNo ? (/^(CNC|UNI|SACISLE)[-/]/.test(enteredQuoteNo) ? enteredQuoteNo : `${businessLine}-${enteredQuoteNo}`) : "",
      writerName: draft.writerName.trim(),
      company: draft.company.trim(),
      subject: draft.subject.trim(),
      notes: draft.notes.map((note) => note.trim()).filter(Boolean),
      items: draft.items
        .map((item) => ({
          ...item,
          productModelId: item.productModelId ?? null,
          stockCode: item.stockCode ?? null,
          description: item.description.trim(),
          unit: item.unit.trim(),
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
        }))
        .filter((item) => item.description),
      savedAt: new Date().toISOString(),
    };
    const missing = serviceQuoteMissingFields(normalized);
    if (missing.length) {
      toast.error("Servis teklifi eksik", { description: `Doldurulması gereken alanlar: ${missing.join(", ")}.` });
      return;
    }
    setSaving(true);
    try {
      await onSave(normalized);
      setDraft(normalized);
      toast.success("Servis teklif formu kaydedildi");
      if (printAfterSave) printOrWarn(printServiceQuoteForm(normalized));
    } catch (err: any) {
      toast.error("Servis teklifi kaydedilemedi", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setSaving(false);
    }
  };

  const applyNoteTemplate = (key: string) => {
    if (key === "ozel") {
      setDraft((current) => ({ ...current, noteVariantKey: "" }));
      return;
    }
    if (key.startsWith(NOTE_TEMPLATE_KEY_PREFIX)) {
      const template = savedNoteTemplates.find((item) => noteTemplateKey(item.id) === key);
      if (!template) return;
      setDraft((current) => ({ ...current, noteVariantKey: key, notes: noteLinesFromText(template.body) }));
      return;
    }
    const variant = SERVICE_NOTE_VARIANTS.find((item) => item.key === key);
    if (variant) setDraft((current) => ({ ...current, noteVariantKey: key, notes: [...variant.notlar] }));
  };

  const saveNoteTemplate = () => {
    const body = noteTemplateBody();
    if (!body) return toast.error("Önce teklif notu girin");
    setNoteTemplateTitle(selectedSavedNoteTemplate ? `${selectedSavedNoteTemplate.title} kopya` : "");
    setNoteTemplateMode("create");
  };

  const updateSelectedNoteTemplate = () => {
    if (!selectedSavedNoteTemplate || selectedSavedNoteTemplate.scope !== SERVICE_QUOTE_NOTE_TEMPLATE_SCOPE) return;
    if (!noteTemplateBody()) return toast.error("Önce teklif notu girin");
    setNoteTemplateTitle(selectedSavedNoteTemplate.title);
    setNoteTemplateMode("update");
  };

  const deleteSelectedNoteTemplate = () => {
    if (!selectedSavedNoteTemplate || selectedSavedNoteTemplate.scope !== SERVICE_QUOTE_NOTE_TEMPLATE_SCOPE) return;
    setNoteTemplateMode("delete");
  };

  const submitNoteTemplateAction = async () => {
    const body = noteTemplateBody();
    if (!noteTemplateMode || noteTemplateMode !== "delete" && (!body || !noteTemplateTitle.trim())) return;
    setNoteTemplateSaving(true);
    try {
      if (noteTemplateMode === "create") {
        const created = await addNoteTemplate({ title: noteTemplateTitle.trim(), body, scope: SERVICE_QUOTE_NOTE_TEMPLATE_SCOPE });
        setDraft((current) => ({ ...current, noteVariantKey: noteTemplateKey(created.id) }));
        toast.success("Servis teklif notu şablonu kaydedildi");
      } else if (noteTemplateMode === "update" && selectedSavedNoteTemplate) {
        await updateNoteTemplate(selectedSavedNoteTemplate.id, { title: noteTemplateTitle.trim(), body, scope: SERVICE_QUOTE_NOTE_TEMPLATE_SCOPE });
        toast.success("Servis teklif notu şablonu güncellendi");
      } else if (noteTemplateMode === "delete" && selectedSavedNoteTemplate) {
        await deleteNoteTemplate(selectedSavedNoteTemplate.id);
        setDraft((current) => ({ ...current, noteVariantKey: "" }));
        toast.success("Servis teklif notu şablonu silindi");
      }
      setNoteTemplateMode(null);
    } catch (err: any) {
      toast.error(noteTemplateMode === "delete" ? "Şablon silinemedi" : "Şablon kaydedilemedi", { description: err?.message });
    } finally {
      setNoteTemplateSaving(false);
    }
  };

  const subtotal = draft.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        Bu form kaydedilmeden kart <b>Bakım/Onarım &amp; Yedek Parça</b> aşamasına geçirilemez. Yazdırılan teklif yalnızca bu alandaki bilgilerle oluşturulur.
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-3"><CardTitle className="text-base">Teklif ve müşteri bilgileri</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div><Label>Teklif No. *</Label><Input className="mt-1" value={draft.quoteNo} onChange={(e) => setDraft({ ...draft, quoteNo: e.target.value })} placeholder="CNC-SRVTEK-2026/0010" /></div>
          <div><Label>Tarih *</Label><Input className="mt-1" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></div>
          <div><Label>Geçerlilik Süresi *</Label><Input className="mt-1" value={draft.validity} onChange={(e) => setDraft({ ...draft, validity: e.target.value })} /></div>
          <div><Label>Para Birimi *</Label><Select value={draft.currency} onValueChange={(value) => setDraft({ ...draft, currency: value as ServiceQuoteForm["currency"] })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{SERVICE_CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div>
          <div className="lg:col-span-2"><Label>Firma *</Label><Input className="mt-1" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} /></div>
          <div><Label>İlgili</Label><Input className="mt-1" value={draft.contact ?? ""} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} /></div>
          <div><Label>Mobil</Label><Input className="mt-1" value={draft.mobile ?? ""} onChange={(e) => setDraft({ ...draft, mobile: e.target.value })} /></div>
          <div><Label>Telefon</Label><Input className="mt-1" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
          <div><Label>E-Posta</Label><Input className="mt-1" type="email" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Adres</Label><Input className="mt-1" value={draft.address ?? ""} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div>
          <div className="md:col-span-2 lg:col-span-4"><Label>Teklif Kapsamı *</Label><Textarea className="mt-1 min-h-20" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="Teklifimiz ... arızasını kapsamaktadır." /></div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-3"><CardTitle className="text-base">Teklifi hazırlayan</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div><Label>Teklifi Yazan *</Label><Input className="mt-1" value={draft.writerName} onChange={(e) => setDraft({ ...draft, writerName: e.target.value })} /></div>
          <div><Label>Unvan</Label><Input className="mt-1" value={draft.writerTitle ?? ""} onChange={(e) => setDraft({ ...draft, writerTitle: e.target.value })} /></div>
          <div><Label>E-Posta</Label><Input className="mt-1" type="email" value={draft.writerEmail ?? ""} onChange={(e) => setDraft({ ...draft, writerEmail: e.target.value })} /></div>
          {signatureOptions.length > 0 && (
            <div className="md:col-span-3">
              <Label>Çıktıya basılacak imza</Label>
              <Select
                value={draft.signature?.id ?? NONE}
                onValueChange={(value) => {
                  const picked = signatureOptions.find((option) => option.id === value);
                  setDraft({
                    ...draft,
                    // Canlı kayda referans değil kopyası saklanır: imza sonradan
                    // düzenlenirse bu teklif kendi bastığı imzayı korur.
                    signature: picked
                      ? { id: picked.id, name: picked.name, title: picked.title, imageUrl: picked.imageUrl }
                      : undefined,
                  });
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="İmzasız" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>İmzasız — teklifi yazanın adı basılır</SelectItem>
                  {signatureOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>{option.name} · {option.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Ürün / hizmet kalemleri</CardTitle>
          <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setDraft({ ...draft, items: [...draft.items, newServiceQuoteItem()] })}><Plus className="size-4" /> Satır ekle</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table className="min-w-[980px]">
              <TableHeader><TableRow className="bg-muted/30"><TableHead className="w-64">Ürün</TableHead><TableHead>Açıklama *</TableHead><TableHead className="w-24">Miktar *</TableHead><TableHead className="w-24">Birim *</TableHead><TableHead className="w-36">Birim Fiyat *</TableHead><TableHead className="w-36 text-right">Tutar</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
              <TableBody>
                {draft.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Select value={item.productModelId || NONE} onValueChange={(value) => pickProduct(item.id, value)}>
                        <SelectTrigger><SelectValue placeholder="Ürün seç" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Serbest kalem</SelectItem>
                          {serviceProducts.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {[product.stockCode, product.shortDescription || product.model].filter(Boolean).join(" · ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {item.stockCode && <div className="mt-1 text-[11px] text-muted-foreground">Stok: {item.stockCode}</div>}
                    </TableCell>
                    <TableCell><Input value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} placeholder="Ürün veya hizmet açıklaması" /></TableCell>
                    <TableCell><Input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })} /></TableCell>
                    <TableCell><Input value={item.unit} onChange={(e) => updateItem(item.id, { unit: e.target.value })} /></TableCell>
                    <TableCell><Input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.id, { unitPrice: Number(e.target.value) })} /></TableCell>
                    <TableCell className="text-right tabular-nums">{moneyText(item.quantity * item.unitPrice, draft.currency)}</TableCell>
                    <TableCell><Button type="button" size="icon" variant="ghost" className="size-8" disabled={draft.items.length === 1} onClick={() => setDraft({ ...draft, items: draft.items.filter((row) => row.id !== item.id) })}><Trash2 className="size-4 text-red-600" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="ml-auto grid max-w-sm grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
            <span>Ara Toplam</span><b className="text-right tabular-nums">{moneyText(subtotal, draft.currency)}</b>
            <span>K.D.V. Oranı (%)</span><Input className="h-8" type="number" min="0" value={draft.vatRate} onChange={(e) => setDraft({ ...draft, vatRate: Number(e.target.value) || 0 })} />
            <span>K.D.V. Tutarı</span><Input className="h-8" type="number" min="0" value={draft.vatAmount} onChange={(e) => setDraft({ ...draft, vatAmount: Number(e.target.value) || 0 })} />
            <span>Toplam</span><b className="text-right tabular-nums">{moneyText(subtotal + draft.vatAmount, draft.currency)}</b>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-3"><CardTitle className="text-base">Teklif notları</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-sm flex-1">
              <Label>Not şablonu</Label>
              <Select value={draft.noteVariantKey || "ozel"} onValueChange={applyNoteTemplate}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Şablon seçin..." /></SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Hazır servis notları</div>
                  {SERVICE_NOTE_VARIANTS.map((variant) => <SelectItem key={variant.key} value={variant.key}>{variant.label}</SelectItem>)}
                  {serviceQuoteTemplates.length > 0 && (
                    <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Kayıtlı servis notları</div>
                  )}
                  {serviceQuoteTemplates.map((template) => (
                    <SelectItem key={template.id} value={noteTemplateKey(template.id)}>{template.title}</SelectItem>
                  ))}
                  {quoteNoteTemplates.length > 0 && (
                    <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Teklif notları</div>
                  )}
                  {quoteNoteTemplates.map((template) => (
                    <SelectItem key={template.id} value={noteTemplateKey(template.id)}>{template.title}</SelectItem>
                  ))}
                  <SelectItem value="ozel">Özel (manuel gir)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedSavedNoteTemplate?.scope === SERVICE_QUOTE_NOTE_TEMPLATE_SCOPE && (
                <>
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={updateSelectedNoteTemplate}>Şablonu güncelle</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-9 text-destructive" onClick={deleteSelectedNoteTemplate}>Sil</Button>
                </>
              )}
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={saveNoteTemplate}>
                <BookmarkPlus className="size-3.5" /> Yeni şablon
              </Button>
            </div>
          </div>
          {selectedSavedNoteTemplate && (
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {selectedSavedNoteTemplate.scope === SERVICE_QUOTE_NOTE_TEMPLATE_SCOPE
                ? `Kayıtlı servis notu: ${selectedSavedNoteTemplate.title}`
                : `Teklif notu kullanılıyor: ${selectedSavedNoteTemplate.title}`}
            </div>
          )}
          <div><Label>Notlar (her satır ayrı madde)</Label><Textarea className="mt-1 min-h-36" value={draft.notes.join("\n")} onChange={(e) => setDraft({ ...draft, notes: e.target.value.split("\n") })} /></div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="gap-1" disabled={saving} onClick={() => save(true)}><Printer className="size-4" /> Kaydet ve yazdır</Button>
        <Button className="gap-1" disabled={saving} onClick={() => save(false)}><Check className="size-4" /> Servis teklifini kaydet</Button>
      </div>
      <Dialog open={Boolean(noteTemplateMode)} onOpenChange={(open) => !open && !noteTemplateSaving && setNoteTemplateMode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{noteTemplateMode === "delete" ? "Servis notu şablonu silinsin mi?" : noteTemplateMode === "update" ? "Servis notu şablonunu güncelle" : "Yeni servis notu şablonu"}</DialogTitle>
            <DialogDescription>{noteTemplateMode === "delete" ? `“${selectedSavedNoteTemplate?.title ?? "Seçili şablon"}” kaldırılacak; teklif üzerindeki notlar korunacak.` : "Mevcut teklif notları daha sonra yeniden kullanılmak üzere kaydedilecek."}</DialogDescription>
          </DialogHeader>
          {noteTemplateMode !== "delete" && (
            <div><Label htmlFor="service-note-template-title">Şablon başlığı</Label><Input id="service-note-template-title" className="mt-1" value={noteTemplateTitle} onChange={(event) => setNoteTemplateTitle(event.target.value)} maxLength={120} autoFocus /></div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={noteTemplateSaving} onClick={() => setNoteTemplateMode(null)}>Vazgeç</Button>
            <Button type="button" variant={noteTemplateMode === "delete" ? "destructive" : "default"} disabled={noteTemplateSaving || (noteTemplateMode !== "delete" && !noteTemplateTitle.trim())} onClick={() => void submitNoteTemplateAction()}>{noteTemplateSaving ? "İşleniyor…" : noteTemplateMode === "delete" ? "Şablonu sil" : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ServiceDetailDialog({
  serviceRequest,
  initialTab,
  onClose,
  onSelectService,
  onOpenComplaint,
  onDelete,
}: {
  serviceRequest: ServiceRequest | null;
  initialTab?: ServiceDetailTab;
  onClose: () => void;
  onSelectService?: (id: string) => void;
  onOpenComplaint?: (id: string) => void;
  onDelete?: (serviceRequest: ServiceRequest) => Promise<void> | void;
}) {
  const {
    updateService,
    moveService,
    loadServiceWarranty,
    updateServiceWarranty,
    updateServiceWarrantyParts,
    submitServiceWarranty,
    approveServiceWarranty,
    rejectServiceWarranty,
    customers,
    contacts,
    machines,
    users,
    products,
    documents,
    service: serviceRequests,
  } = useStore();
  const { user: authUser } = useAuth();
  const activeCustomerId = serviceRequest?.customerId;
  const storedCustomer = customers.find((customer) => customer.id === activeCustomerId);
  const customerQuery = useCompanyDetail(activeCustomerId, storedCustomer);
  const companyContactsQuery = useRemoteCompanyContacts(activeCustomerId, Boolean(serviceRequest));
  const [nowMs, setNowMs] = useState(Date.now());
  const [note, setNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState("");
  const [editingNoteText, setEditingNoteText] = useState("");
  const [complaint, setComplaint] = useState("");
  const [warrantyAssessment, setWarrantyAssessment] = useState("");
  const [warrantyFailureCategory, setWarrantyFailureCategory] = useState("");
  const [warrantyRmaNo, setWarrantyRmaNo] = useState("");
  const [warrantySupplierName, setWarrantySupplierName] = useState("");
  const [warrantySupplierStatus, setWarrantySupplierStatus] = useState("");
  const [warrantyCostAmount, setWarrantyCostAmount] = useState("");
  const [warrantyCustomerChargeAmount, setWarrantyCustomerChargeAmount] = useState("");
  const [warrantyCurrency, setWarrantyCurrency] = useState<(typeof SERVICE_CURRENCIES)[number]>("USD");
  const [warrantyDecisionNote, setWarrantyDecisionNote] = useState("");
  const [warrantyBusy, setWarrantyBusy] = useState(false);
  const [operationDescription, setOperationDescription] = useState("");
  const [operationQty, setOperationQty] = useState("1");
  const [operationPrice, setOperationPrice] = useState("0");
  const [operationCurrency, setOperationCurrency] = useState<(typeof SERVICE_CURRENCIES)[number]>("USD");
  const [detailTab, setDetailTab] = useState<ServiceDetailTab>("summary");
  const [partProductId, setPartProductId] = useState<string>("");
  const [partQty, setPartQty] = useState("1");
  const [partNote, setPartNote] = useState("");
  const [warrantyPartDescription, setWarrantyPartDescription] = useState("");
  const [warrantyPartProductId, setWarrantyPartProductId] = useState("");
  const [warrantyPartQty, setWarrantyPartQty] = useState("1");
  const [warrantyPartAction, setWarrantyPartAction] = useState<ServiceWarrantyPart["actionType"]>("replace");
  const [warrantyPartSource, setWarrantyPartSource] = useState<ServiceWarrantyPart["source"]>("stock");
  const [warrantyPartCharge, setWarrantyPartCharge] = useState(false);
  const [warrantyPreviewDoc, setWarrantyPreviewDoc] = useState<DocumentItem | null>(null);
  const [quotePreviewDoc, setQuotePreviewDoc] = useState<DocumentItem | null>(null);
  const [consumingParts, setConsumingParts] = useState(false);

  useEffect(() => {
    setNote("");
    setEditingNoteId("");
    setEditingNoteText("");
    setComplaint("");
    setWarrantyAssessment(serviceRequest?.warrantyClaim?.technicianAssessment ?? "");
    setWarrantyFailureCategory(serviceRequest?.warrantyClaim?.failureCategory ?? "");
    setWarrantyRmaNo(serviceRequest?.warrantyClaim?.rmaNo ?? "");
    setWarrantySupplierName(serviceRequest?.warrantyClaim?.supplierName ?? "");
    setWarrantySupplierStatus(serviceRequest?.warrantyClaim?.supplierRmaStatus ?? "");
    setWarrantyCostAmount(serviceRequest?.warrantyClaim?.costAmount == null ? "" : String(serviceRequest.warrantyClaim.costAmount));
    setWarrantyCustomerChargeAmount(serviceRequest?.warrantyClaim?.customerChargeAmount == null ? "" : String(serviceRequest.warrantyClaim.customerChargeAmount));
    setWarrantyCurrency(serviceRequest?.warrantyClaim?.costCurrency ?? "USD");
    setWarrantyDecisionNote("");
    setOperationDescription("");
    setOperationQty("1");
    setOperationPrice("0");
    setOperationCurrency(serviceRequest?.serviceCurrency ?? "USD");
    setDetailTab(initialTab ?? "summary");
    setPartProductId("");
    setPartQty("1");
    setPartNote("");
    setWarrantyPartDescription("");
    setWarrantyPartProductId("");
    setWarrantyPartQty("1");
    setWarrantyPartAction("replace");
    setWarrantyPartSource("stock");
    setWarrantyPartCharge(false);
  }, [
    serviceRequest?.id,
    initialTab,
    serviceRequest?.serviceCurrency,
    serviceRequest?.stage,
    serviceRequest?.warrantyClaim?.id,
    serviceRequest?.warrantyClaim?.technicianAssessment,
    serviceRequest?.warrantyClaim?.failureCategory,
    serviceRequest?.warrantyClaim?.rmaNo,
    serviceRequest?.warrantyClaim?.supplierName,
    serviceRequest?.warrantyClaim?.supplierRmaStatus,
    serviceRequest?.warrantyClaim?.costAmount,
    serviceRequest?.warrantyClaim?.customerChargeAmount,
    serviceRequest?.warrantyClaim?.costCurrency,
  ]);

  useEffect(() => {
    if (serviceRequest?.timerStatus !== "running") return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [serviceRequest?.timerStatus, serviceRequest?.timerStartedAt]);

  useEffect(() => {
    if (!serviceRequest?.id) return;
    if (serviceRequest.ticketType !== "warranty_claim" && !serviceRequest.warrantyClaim) return;
    loadServiceWarranty(serviceRequest.id).catch((err: any) => {
      toast.error("Garanti dosyası yüklenemedi", { description: err?.message ?? "İstek başarısız." });
    });
  }, [serviceRequest?.id, serviceRequest?.ticketType]);

  if (!serviceRequest) return null;

  const customer = customerQuery.data ?? storedCustomer;
  const machine = machines.find((m) => m.id === serviceRequest.machineId);
  const assignee = users.find((u) => u.id === serviceRequest.assignedUserId);
  const warrantyClaim = serviceRequest.warrantyClaim ?? null;
  const warrantyDocs = documents.filter((d) => d.serviceRequestId === serviceRequest.id);
  const machineTickets = machine
    ? serviceRequests
        .filter((s) => s.machineId === machine.id && s.id !== serviceRequest.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];
  const openMachineTickets = machineTickets.filter((s) => s.stage !== "Closed").length;
  const machineInfo: [string, string | undefined][] = [
    ["Marka", machine?.brand],
    ["Tip", machine?.type],
    ["Model", machine?.model],
    ["Seri No", machine?.serialNumber],
    ["CNC Kontrol", machine?.controlUnit],
    ["CNC Seri", machine?.controlUnitSerial],
    ["Teslim", machine?.deliveryDate],
    ["Kurulum", machine?.installationDate],
    ["Garanti Başlangıç", machine?.warrantyStart],
    ["Garanti Bitiş", machine?.warrantyEnd],
  ];
  const customerInfo: [string, string | undefined][] = [
    ["İlgili", customer?.contactPerson],
    ["Telefon", customer?.phone],
    ["GSM", customer?.phone2],
    ["E-posta", customer?.email],
    ["Adres", customer ? [customer.address, customer.district, customer.city].filter(Boolean).join(" ") : undefined],
    ["Vergi", customer ? [customer.taxOffice, customer.taxNumber].filter(Boolean).join(" · ") : undefined],
  ];
  const resolveActor = (id?: string): ServiceActor | null => {
    const localUser = users.find((u) => u.id === id);
    if (localUser) {
      return {
        id: localUser.id,
        name: localUser.name,
        email: localUser.email,
        department: localUser.department,
        avatarUrl: localUser.avatarUrl,
      };
    }
    if (authUser && (!id || id === authUser.id)) {
      return {
        id: authUser.id,
        name: authUser.fullName,
        email: authUser.email,
        department: authUser.roles?.[0]?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toLocaleUpperCase("tr-TR")),
      };
    }
    return null;
  };
  const currentActorId = authUser?.id ?? serviceRequest.assignedUserId;
  const currentActor = resolveActor(currentActorId) ?? resolveActor(serviceRequest.assignedUserId);
  const fallbackActor = resolveActor(serviceRequest.assignedUserId) ?? currentActor;
  const actorFor = (id?: string) => resolveActor(id) ?? fallbackActor;
  const elapsed = serviceElapsedSeconds(serviceRequest, nowMs);
  const hourlyRate = serviceRequest.serviceHourlyRate ?? 0;
  const serviceCurrency = serviceRequest.serviceCurrency ?? "USD";
  const serviceFee = (elapsed / 3600) * hourlyRate;
  const operations = serviceRequest.operations ?? [];
  const manualTotal = operations
    .filter((op) => op.currency === serviceCurrency)
    .reduce((sum, op) => sum + op.quantity * op.unitPrice, 0);
  const activityTabEnabled = isServiceDetailTabEnabled(serviceRequest.stage, "activities");
  const feeTabEnabled = isServiceDetailTabEnabled(serviceRequest.stage, "operations");
  const completionTabEnabled = isServiceDetailTabEnabled(serviceRequest.stage, "completion");
  const contact = contacts.find((item) => item.id === serviceRequest.contactId)
    ?? companyContactsQuery.data?.data.find((item) => item.id === serviceRequest.contactId)
    ?? null;
  const setAllowedDetailTab = (value: string) => {
    const next = value as ServiceDetailTab;
    if (!isServiceDetailTabEnabled(serviceRequest.stage, next)) return;
    setDetailTab(next);
  };
  const openServiceFormPdf = async (_form?: ServiceCompletionForm, previewWindow?: Window | null) => {
    try {
      await serviceService.openServiceFormPdf(serviceRequest.id, serviceRequest.ticketNo || serviceRequest.id, previewWindow);
    } catch (err: any) {
      toast.error("Servis formu açılamadı", { description: err?.message ?? "PDF oluşturulamadı." });
    }
  };

  const makeHistoryItem = (prefix: string, text: string) => ({
    id: `${prefix}-${Date.now()}`,
    text,
    createdAt: timestamp(),
    byUserId: currentActorId,
  });

  const withActivity = (text: string, patch: Partial<ServiceRequest> = {}) => ({
    ...patch,
    activityHistory: [
      ...(serviceRequest.activityHistory ?? []),
      makeHistoryItem("srv-act", text),
    ],
  });

  const startTimer = async () => {
    await updateService(
      serviceRequest.id,
      withActivity("Sayaç başlatıldı.", {
        timerStatus: "running",
        timerStartedAt: new Date().toISOString(),
      })
    );
  };

  const pauseTimer = async () => {
    await updateService(
      serviceRequest.id,
      withActivity("Sayaç beklemeye alındı.", {
        timerStatus: "paused",
        timerStartedAt: undefined,
        timerElapsedSeconds: elapsed,
      })
    );
  };

  const stopTimer = async () => {
    await updateService(
      serviceRequest.id,
      withActivity("Sayaç durduruldu.", {
        timerStatus: "stopped",
        timerStartedAt: undefined,
        timerElapsedSeconds: elapsed,
      })
    );
  };

  const addNote = async () => {
    const text = note.trim();
    if (!text) return;
    await updateService(
      serviceRequest.id,
      withActivity("Not eklendi.", {
        serviceNote: text,
        noteHistory: [
          ...(serviceRequest.noteHistory ?? []),
          makeHistoryItem("srv-note", text),
        ],
      })
    );
    setNote("");
  };
  const saveEditedNote = async () => {
    const text = editingNoteText.trim();
    if (!editingNoteId || !text) return;
    await updateService(
      serviceRequest.id,
      withActivity("Not düzenlendi.", {
        serviceNote: text,
        noteHistory: (serviceRequest.noteHistory ?? []).map((item) =>
          item.id === editingNoteId ? { ...item, text, byUserId: currentActorId } : item
        ),
      })
    );
    setEditingNoteId("");
    setEditingNoteText("");
  };
  const deleteNote = async (id: string) => {
    await updateService(
      serviceRequest.id,
      withActivity("Not silindi.", {
        noteHistory: (serviceRequest.noteHistory ?? []).filter((item) => item.id !== id),
      })
    );
  };

  const addComplaint = async () => {
    const text = complaint.trim();
    if (!text) return;
    await updateService(
      serviceRequest.id,
      withActivity("Şikayet kaydı eklendi.", {
        diagnosisNote: text,
        complaints: [
          ...(serviceRequest.complaints ?? []),
          makeHistoryItem("srv-complaint", text),
        ],
      })
    );
    setComplaint("");
  };

  const addOperation = async () => {
    const description = operationDescription.trim();
    if (!description) return;
    const quantity = Math.max(1, Number(operationQty) || 1);
    const unitPrice = Math.max(0, Number(operationPrice) || 0);
    await updateService(
      serviceRequest.id,
      withActivity("Manuel servis işlemi eklendi.", {
        operations: [
          ...operations,
          {
            id: `srv-op-${Date.now()}`,
            description,
            quantity,
            unitPrice,
            currency: operationCurrency,
            kind: "labor",
            createdAt: timestamp(),
            byUserId: currentActorId,
          },
        ],
      })
    );
    setOperationDescription("");
    setOperationQty("1");
    setOperationPrice("0");
  };

  const spareProducts = products.filter((p) => p.categoryCode === "YEDEK_PARCA" || p.categoryCode === "AKSESUAR");
  const warrantyParts = warrantyClaim?.parts ?? [];

  const saveWarranty = async () => {
    setWarrantyBusy(true);
    try {
      await updateServiceWarranty(serviceRequest.id, {
        failureCategory: warrantyFailureCategory,
        technicianAssessment: warrantyAssessment,
        rmaNo: warrantyRmaNo,
        supplierName: warrantySupplierName,
        supplierRmaStatus: warrantySupplierStatus,
        costAmount: warrantyCostAmount ? Number(warrantyCostAmount) : null,
        costCurrency: warrantyCurrency,
        customerChargeAmount: warrantyCustomerChargeAmount ? Number(warrantyCustomerChargeAmount) : null,
        customerChargeCurrency: warrantyCurrency,
      });
      toast.success("Garanti dosyası kaydedildi");
    } catch (err: any) {
      toast.error("Garanti dosyası kaydedilemedi", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setWarrantyBusy(false);
    }
  };

  const submitWarrantyForApproval = async () => {
    setWarrantyBusy(true);
    try {
      await submitServiceWarranty(serviceRequest.id);
      toast.success("Garanti dosyası onaya gönderildi");
    } catch (err: any) {
      toast.error("Onaya gönderilemedi", { description: err?.message ?? "Makine eşleşmesi veya yetki kontrolü başarısız." });
    } finally {
      setWarrantyBusy(false);
    }
  };

  const updateWarrantyStatus = async (status: NonNullable<typeof warrantyClaim>["status"]) => {
    setWarrantyBusy(true);
    try {
      await updateServiceWarranty(serviceRequest.id, { status });
      toast.success("Garanti durumu güncellendi");
    } catch (err: any) {
      toast.error("Garanti durumu güncellenemedi", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setWarrantyBusy(false);
    }
  };

  const decideWarranty = async (decision: "approve" | "reject") => {
    setWarrantyBusy(true);
    try {
      if (decision === "approve") await approveServiceWarranty(serviceRequest.id, warrantyDecisionNote);
      else await rejectServiceWarranty(serviceRequest.id, warrantyDecisionNote);
      toast.success(decision === "approve" ? "Garanti onaylandı" : "Garanti reddedildi");
      setWarrantyDecisionNote("");
    } catch (err: any) {
      toast.error("Garanti kararı kaydedilemedi", { description: err?.message ?? "Yetki veya durum kontrolü başarısız." });
    } finally {
      setWarrantyBusy(false);
    }
  };

  const addWarrantyPart = async () => {
    const description = warrantyPartDescription.trim();
    if (!description) return;
    const nextParts: ServiceWarrantyPart[] = [
      ...warrantyParts,
      {
        description,
        productModelId: warrantyPartProductId || null,
        quantity: Math.max(1, Number(warrantyPartQty) || 1),
        actionType: warrantyPartAction,
        source: warrantyPartSource,
        chargeToCustomer: warrantyPartCharge,
        currency: warrantyCurrency,
        unitCost: null,
        supplierRmaStatus: null,
        notes: null,
      },
    ];
    setWarrantyBusy(true);
    try {
      await updateServiceWarrantyParts(serviceRequest.id, nextParts);
      setWarrantyPartDescription("");
      setWarrantyPartProductId("");
      setWarrantyPartQty("1");
      setWarrantyPartCharge(false);
      toast.success("Garanti parça satırı eklendi");
    } catch (err: any) {
      toast.error("Parça satırı eklenemedi", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setWarrantyBusy(false);
    }
  };

  const removeWarrantyPart = async (index: number) => {
    setWarrantyBusy(true);
    try {
      await updateServiceWarrantyParts(serviceRequest.id, warrantyParts.filter((_, i) => i !== index));
      toast.success("Garanti parça satırı kaldırıldı");
    } catch (err: any) {
      toast.error("Parça satırı kaldırılamadı", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setWarrantyBusy(false);
    }
  };

  const consumeParts = async () => {
    if (!partProductId) return;
    const qty = Math.max(1, Number(partQty) || 1);
    const prod = spareProducts.find((p) => p.id === partProductId);
    setConsumingParts(true);
    try {
      await inventoryService.consumeServiceParts({
        serviceTicketId: serviceRequest.id,
        companyId: serviceRequest.customerId,
        lines: [{ productModelId: partProductId, quantity: qty, notes: partNote.trim() || undefined }],
      });
      await updateService(
        serviceRequest.id,
        withActivity(`Stoktan parça düşüldü: ${prod?.model ?? partProductId} × ${qty}.`, {
          operations: [
            ...operations,
            {
              id: `srv-part-${Date.now()}`,
              description: `Parça kullanımı: ${prod?.model ?? prod?.modelName ?? 'Ürün'}${prod?.stockCode ? ` (${prod.stockCode})` : ''}`,
              quantity: qty,
              unitPrice: 0,
              currency: serviceCurrency,
              kind: "part",
              createdAt: timestamp(),
              byUserId: currentActorId,
            },
          ],
        })
      );
      toast.success("Parça stoğu düşüldü");
      setPartProductId("");
      setPartQty("1");
      setPartNote("");
    } catch (err: any) {
      toast.error("Parça stoğu düşülemedi", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setConsumingParts(false);
    }
  };

  const rightFeed = [
    ...(serviceRequest.noteHistory ?? []).map((item) => ({ ...item, kind: "Not" })),
    ...(serviceRequest.activityHistory ?? []).map((item) => ({ ...item, kind: "Aktivite" })),
  ].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const detailPriority = serviceRequest.priority ?? "normal";
  const detailSla = serviceSlaInfo(serviceRequest);
  const currentJourneyIndex = Math.max(0, SERVICE_COLUMNS.findIndex((column) => column.key === STAGE_TO_COLUMN[serviceRequest.stage]));

  const serviceRightPanel = (
    <div className="space-y-4">
      <div className="premium-blueprint precision-corners rounded-xl border border-primary/15 bg-white p-3">
        <div className="relative flex items-start gap-3">
          <EntityVisual title={machine?.model || "Makine"} overline={machine?.serialNumber} icon={<Wrench className="size-4" />} size="md" />
          <div className="min-w-0 flex-1">
            <div className="font-data text-[9px] font-semibold uppercase tracking-[0.14em] text-operation-blue">BAĞLI MAKİNE</div>
            <p className="mt-1 truncate text-sm font-semibold">{machine?.model || "Makine eşleşmedi"}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{[machine?.brand, machine?.serialNumber].filter(Boolean).join(" · ") || "Seri numarası yok"}</p>
            {machine && <div className="mt-2"><MachineWarrantyBadge warrantyEnd={machine.warrantyEnd} /></div>}
          </div>
        </div>
        <div className="relative mt-3 grid grid-cols-2 gap-2 border-t border-border/50 pt-3">
          <div><p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Sorumlu</p><p className="mt-1 truncate text-xs font-medium">{assignee?.name || "Atanmadı"}</p></div>
          <div><p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Sıradaki adım</p><p className="mt-1 text-xs font-medium text-primary">{SERVICE_NEXT_ACTION[serviceRequest.stage]}</p></div>
        </div>
      </div>

      <Card className="border-border/60 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saha Süresi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-3xl tabular-nums tracking-tight">{formatElapsed(elapsed)}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-1" onClick={startTimer} disabled={serviceRequest.timerStatus === "running"}>
              <Play className="size-4" /> Başlat
            </Button>
            <Button size="sm" variant="outline" className="gap-1 bg-white" onClick={pauseTimer} disabled={serviceRequest.timerStatus !== "running"}>
              <Pause className="size-4" /> Beklet
            </Button>
            <Button size="sm" variant="outline" className="gap-1 bg-white" onClick={stopTimer} disabled={serviceRequest.timerStatus === "idle" || serviceRequest.timerStatus === "stopped"}>
              <Square className="size-4" /> Durdur
            </Button>
          </div>
          <div className="rounded-md border border-border/60 bg-primary/5 px-3 py-2 text-sm flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>Servis Ücreti Kalemi</span>
            <b className="tabular-nums">{moneyText(serviceFee, serviceCurrency)}</b>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border/60 bg-white p-3">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Servis notu yaz..."
          className="min-h-20 resize-none border-border/70"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" className="gap-1" onClick={addNote} disabled={!note.trim()}>
            <Plus className="size-4" /> Not ekle
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {rightFeed.map((item) => (
          <div key={`${item.kind}-${item.id}`} className="space-y-1">
            <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
              <span className="rounded bg-white px-1.5 py-0.5">{item.kind}</span>
              {item.createdAt && <span className="tabular-nums">{item.createdAt}</span>}
            </div>
            <ServiceHistoryCard
              text={item.text}
              createdAt={item.createdAt}
              actor={actorFor(item.byUserId)}
            />
          </div>
        ))}
        {rightFeed.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-white px-3 py-8 text-center text-sm text-muted-foreground">
            Not veya aktivite yok.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={!!serviceRequest} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(1280px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[92dvh] overflow-hidden p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{customer?.name ?? "Servis talebi detayı"}</DialogTitle>
          <DialogDescription className="sr-only">Servis talebi detayı; durum ve makine bilgisi sağ paneldedir.</DialogDescription>
        </DialogHeader>
        <KanbanDetailDialogShell
          accentClassName={SERVICE_COLUMNS.find((col) => col.key === STAGE_TO_COLUMN[serviceRequest.stage])?.dot ?? "bg-primary"}
          title={customer?.name ?? "Firma bulunamadı"}
          subtitle={[serviceRequest.ticketNo, machine?.model, machine?.serialNumber].filter(Boolean).join(" · ") || serviceNoteText(serviceRequest)}
          meta={
            <>
              <StatusBadge status={serviceRequest.stage} />
              <Badge variant="outline" className={SERVICE_PRIORITY_CLASS[detailPriority]}>{SERVICE_PRIORITY_LABELS[detailPriority]}</Badge>
              <span className={`rounded-md border border-border/60 bg-card px-2.5 py-1 text-xs font-medium ${detailSla.tone}`}>SLA · {detailSla.label}</span>
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">{SERVICE_TICKET_TYPE_LABELS[serviceRequest.ticketType ?? "complaint"]}</span>
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">Kaynak: {serviceSourceLabel(serviceRequest.source)}</span>
            </>
          }
          actions={onDelete ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1 bg-white text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => onDelete(serviceRequest)}
            >
              <Trash2 className="size-3.5" /> Sil
            </Button>
          ) : undefined}
          right={serviceRightPanel}
        >
          <div className="overflow-x-auto rounded-xl border border-border/60 bg-muted/15 p-3">
            <div className="flex min-w-[820px] items-start">
              {SERVICE_COLUMNS.map((column, index) => {
                const complete = index < currentJourneyIndex;
                const active = index === currentJourneyIndex;
                return (
                  <div key={column.key} className="relative flex min-w-0 flex-1 flex-col items-center px-1 text-center">
                    {index > 0 && <span className={`absolute right-1/2 top-3.5 h-0.5 w-full ${complete || active ? "bg-primary" : "bg-border"}`} aria-hidden="true" />}
                    <span className={`relative z-[1] grid size-7 place-items-center rounded-full border text-[10px] font-semibold ${complete ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary bg-card text-primary ring-4 ring-primary/10" : "border-border bg-card text-muted-foreground"}`}>
                      {complete ? <Check className="size-3.5" /> : index + 1}
                    </span>
                    <span className={`mt-2 max-w-[120px] text-[10px] font-medium leading-tight ${active ? "text-primary" : complete ? "text-foreground" : "text-muted-foreground"}`}>{column.key}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {serviceRequest.sourceComplaint && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <div className="min-w-0">
                <span className="font-medium">Bu kayıt Şikayet Kutusu’ndan geldi:</span>{" "}
                <span>{serviceRequest.sourceComplaint.complaintNo}</span>
                {(serviceRequest.sourceComplaint.contactName || serviceRequest.sourceComplaint.contactPhone) && (
                  <span className="ml-2 text-emerald-700">
                    {[serviceRequest.sourceComplaint.contactName, serviceRequest.sourceComplaint.contactPhone].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 bg-white"
                onClick={() => onOpenComplaint?.(serviceRequest.sourceComplaint!.id)}
              >
                Şikayeti aç
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground bg-muted/50 border border-border/60 rounded-md px-3 py-2 mt-2">
            Sayaç, işlemler ve aktivite geçmişi sunucuya kaydedilir; not ve şikayet kayıtları ayrıca metin alanlarına yazılır.
          </p>

        {/* Gövde: sol sekmeler + sağ sabit özet panel (mobilde panel üstte, kendi scroll'u ile) */}
        <div className="mt-4 min-h-0">
        <Tabs value={detailTab} onValueChange={setAllowedDetailTab} className="flex flex-1 min-h-0 flex-col min-w-0">
          <div className="shrink-0 border-b border-border/60 px-5 py-3">
            <TabsList className="h-auto w-full justify-start overflow-x-auto">
              <TabsTrigger value="summary">Özet</TabsTrigger>
              <TabsTrigger value="quote">
                <ClipboardCheck className="size-3.5" />
                Servis Teklifi
              </TabsTrigger>
              <TabsTrigger value="machine">Makine Dosyası</TabsTrigger>
              <TabsTrigger value="warranty">
                <ShieldCheck className="size-3.5" />
                Garanti / RMA
              </TabsTrigger>
              <TabsTrigger value="communication">Müşteri İletişim</TabsTrigger>
              <TabsTrigger value="notes">Not Geçmişi</TabsTrigger>
              <TabsTrigger value="activities" disabled={!activityTabEnabled} title="Servis Devam Ediyor aşamasından sonra açılır">
                {!activityTabEnabled && <Lock className="size-3" />}
                Aktivite Geçmişi
              </TabsTrigger>
              <TabsTrigger value="operations" disabled={!feeTabEnabled} title="Servis Tamamlandı alanında aktif olur">
                {!feeTabEnabled && <Lock className="size-3" />}
                Ücret
              </TabsTrigger>
              <TabsTrigger value="completion" disabled={!completionTabEnabled} title="Servis Devam Ediyor aşamasından sonra açılır">
                {!completionTabEnabled && <Lock className="size-3" />}
                <FileCheck2 className="size-3.5" />
                Tamamlanma Formu
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">

          <TabsContent value="summary" className="m-0 space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Servis Notu</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{serviceNoteText(serviceRequest)}</p>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Firma</div>
                <div className="mt-1 text-sm">{customer?.name ?? "—"}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Açılış</div>
                <div className="mt-1 text-sm tabular-nums">{serviceRequest.createdAt}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Kayıt Tipi</div>
                <Select
                  value={serviceRequest.ticketType ?? "complaint"}
                  onValueChange={(value) => updateService(serviceRequest.id, { ticketType: value as ServiceTicketType })}
                >
                  <SelectTrigger className="mt-1 h-8 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TICKET_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Kaynak</div>
                <div className="mt-2">
                  <Badge
                    variant="outline"
                    className={(serviceRequest.source ?? "manual") === "qr" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-muted/40"}
                  >
                    {serviceSourceLabel(serviceRequest.source)}
                  </Badge>
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Teklif</div>
                <div className="mt-1 text-sm">{serviceRequest.quoteRequired ? "Gerekli" : "Gerekli değil"}</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="quote" className="m-0 space-y-4">
            <ServiceQuoteEditor
              key={serviceRequest.id}
              serviceRequest={serviceRequest}
              customer={customer}
              machine={machine}
              actor={currentActor}
              onSave={(serviceQuote) =>
                updateService(
                  serviceRequest.id,
                  withActivity("Servis teklif formu kaydedildi.", { quoteRequired: true, serviceQuote }),
                )
              }
            />

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Teklif Ekleri</CardTitle>
              </CardHeader>
              <CardContent>
                <ServiceCardAttachments
                  serviceRequestId={serviceRequest.id}
                  docs={warrantyDocs}
                  onPreview={setQuotePreviewDoc}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="machine" className="m-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] gap-4">
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Makine Kimliği</CardTitle>
                </CardHeader>
                <CardContent>
                  {machine ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {machineInfo.map(([label, value]) => (
                        <div key={label} className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
                          <div className="mt-1 text-sm break-words">{value || "—"}</div>
                        </div>
                      ))}
                      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 sm:col-span-2">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Durum</div>
                        <div className="mt-1"><StatusBadge status={machine.status} /></div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Bu servis kaydı henüz bir makineyle eşleşmemiş.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Müşteri Bilgisi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Firma</div>
                    <div className="mt-1 text-sm font-medium">{customer?.name ?? "—"}</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {customerInfo.map(([label, value]) => (
                      <div key={label} className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
                        <div className="mt-1 text-sm break-words">{value || "—"}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>Makine Servis Geçmişi</span>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {machineTickets.length} geçmiş kayıt · {openMachineTickets} açık
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {machineTickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Bu makine için önceki servis kaydı yok.</p>
                ) : (
                  machineTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      className="w-full rounded-md border border-border/60 bg-white px-3 py-2 text-left transition-colors hover:bg-muted/40"
                      onClick={() => {
                        onSelectService?.(ticket.id);
                        setDetailTab("summary");
                      }}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-medium line-clamp-1">{ticket.issueType || serviceNoteText(ticket)}</div>
                          <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{serviceNoteText(ticket)}</div>
                          <div className="mt-2"><ServiceIntakeBadges serviceRequest={ticket} /></div>
                        </div>
                        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                          <StatusBadge status={ticket.stage} />
                          <span className="text-xs text-muted-foreground tabular-nums">{ticket.createdAt}</span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="warranty" className="m-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Süreç</div>
                <div className="mt-2">
                  <Select
                    value={warrantyClaim?.status ?? "draft"}
                    onValueChange={(status) => updateWarrantyStatus(status as NonNullable<typeof warrantyClaim>["status"])}
                    disabled={warrantyBusy}
                  >
                    <SelectTrigger className="h-8 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WARRANTY_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sistem Önerisi</div>
                <div className="mt-2">
                  <Badge
                    variant="outline"
                    className={
                      (warrantyClaim?.coverageSuggestion ?? "unknown") === "in_warranty"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : (warrantyClaim?.coverageSuggestion ?? "unknown") === "out_of_warranty"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "bg-muted/40"
                    }
                  >
                    {WARRANTY_SUGGESTION_LABELS[warrantyClaim?.coverageSuggestion ?? "unknown"]}
                  </Badge>
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Yönetici Kararı</div>
                <div className="mt-2">
                  <Badge variant="outline" className={(warrantyClaim?.coverageDecision ?? "pending") === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : (warrantyClaim?.coverageDecision ?? "pending") === "rejected" ? "border-red-200 bg-red-50 text-red-700" : "bg-muted/40"}>
                    {WARRANTY_DECISION_LABELS[warrantyClaim?.coverageDecision ?? "pending"]}
                  </Badge>
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Garanti Aralığı</div>
                <div className="mt-1 text-sm tabular-nums">
                  {machine?.warrantyStart || warrantyClaim?.warrantyStartSnapshot?.slice(0, 10) || "—"} / {machine?.warrantyEnd || warrantyClaim?.warrantyEndSnapshot?.slice(0, 10) || "—"}
                </div>
              </div>
            </div>

            {!machine && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Garanti dosyası taslak olarak tutulabilir; onaya göndermek için servis kaydını bir makineyle eşleştirin.
              </div>
            )}
            {machine?.warrantyEnd && new Date(machine.warrantyEnd).getTime() < Date.now() && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Makine garanti bitiş tarihi geçmiş görünüyor. Yönetici yine de istisna olarak garanti kapsamı onayı verebilir.
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="size-4" /> Garanti Değerlendirmesi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Arıza Kategorisi</Label>
                      <Input className="mt-1" value={warrantyFailureCategory} onChange={(e) => setWarrantyFailureCategory(e.target.value)} placeholder="Spindle, kontrol ünitesi, hidrolik..." />
                    </div>
                    <div>
                      <Label>RMA No</Label>
                      <Input className="mt-1" value={warrantyRmaNo} onChange={(e) => setWarrantyRmaNo(e.target.value)} placeholder="Tedarikçi RMA numarası" />
                    </div>
                    <div>
                      <Label>Tedarikçi</Label>
                      <Input className="mt-1" value={warrantySupplierName} onChange={(e) => setWarrantySupplierName(e.target.value)} placeholder="Üretici / tedarikçi" />
                    </div>
                    <div>
                      <Label>Tedarikçi RMA Durumu</Label>
                      <Input className="mt-1" value={warrantySupplierStatus} onChange={(e) => setWarrantySupplierStatus(e.target.value)} placeholder="Gönderildi, inceleniyor, kabul..." />
                    </div>
                  </div>
                  <div>
                    <Label>Teknisyen Değerlendirmesi</Label>
                    <Textarea className="mt-1 min-h-28" value={warrantyAssessment} onChange={(e) => setWarrantyAssessment(e.target.value)} placeholder="Arıza bulgusu, kapsam gerekçesi ve sahada yapılan kontroller" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_120px] gap-3">
                    <div>
                      <Label>Tedarikçi / Garanti Maliyeti</Label>
                      <Input className="mt-1" type="number" value={warrantyCostAmount} onChange={(e) => setWarrantyCostAmount(e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <Label>Müşteriye Yansıtılacak</Label>
                      <Input className="mt-1" type="number" value={warrantyCustomerChargeAmount} onChange={(e) => setWarrantyCustomerChargeAmount(e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <Label>Para</Label>
                      <Select value={warrantyCurrency} onValueChange={(v) => setWarrantyCurrency(v as typeof warrantyCurrency)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SERVICE_CURRENCIES.map((cur) => <SelectItem key={cur} value={cur}>{cur}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="outline" className="gap-1" onClick={submitWarrantyForApproval} disabled={warrantyBusy || !machine}>
                      <Send className="size-4" /> Onaya gönder
                    </Button>
                    <Button className="gap-1" onClick={saveWarranty} disabled={warrantyBusy}>
                      <ShieldCheck className="size-4" /> Kaydet
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="size-4" /> Yönetici Kararı</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea value={warrantyDecisionNote} onChange={(e) => setWarrantyDecisionNote(e.target.value)} placeholder="Karar notu" className="min-h-24" />
                  {warrantyClaim?.managerDecisionNote && (
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Son karar notu</div>
                      <div className="mt-1 whitespace-pre-wrap">{warrantyClaim.managerDecisionNote}</div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="gap-1 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => decideWarranty("reject")} disabled={warrantyBusy}>
                      <X className="size-4" /> Reddet
                    </Button>
                    <Button className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => decideWarranty("approve")} disabled={warrantyBusy}>
                      <Check className="size-4" /> Onayla
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Package className="size-4" /> Garanti / RMA Parçaları</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(180px,260px)_84px_150px_150px_120px_auto] gap-2 items-end">
                  <div>
                    <Label>Parça / İşlem</Label>
                    <Input className="mt-1" value={warrantyPartDescription} onChange={(e) => setWarrantyPartDescription(e.target.value)} placeholder="Değişecek parça veya RMA işlemi" />
                  </div>
                  <div>
                    <Label>Katalog Ürünü</Label>
                    <Select value={warrantyPartProductId} onValueChange={setWarrantyPartProductId}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Opsiyonel" /></SelectTrigger>
                      <SelectContent>
                        {spareProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.model}{p.stockCode ? ` · ${p.stockCode}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Adet</Label>
                    <Input className="mt-1" type="number" value={warrantyPartQty} onChange={(e) => setWarrantyPartQty(e.target.value)} />
                  </div>
                  <div>
                    <Label>İşlem</Label>
                    <Select value={warrantyPartAction} onValueChange={(v) => setWarrantyPartAction(v as typeof warrantyPartAction)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="replace">Değişim</SelectItem>
                        <SelectItem value="repair">Tamir</SelectItem>
                        <SelectItem value="return">İade</SelectItem>
                        <SelectItem value="investigate">İnceleme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Kaynak</Label>
                    <Select value={warrantyPartSource} onValueChange={(v) => setWarrantyPartSource(v as typeof warrantyPartSource)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stock">Stok</SelectItem>
                        <SelectItem value="supplier">Tedarikçi</SelectItem>
                        <SelectItem value="customer">Müşteri</SelectItem>
                        <SelectItem value="service">Servis</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex h-10 items-center gap-2 rounded-md border border-border/60 px-3 text-sm">
                    <Checkbox checked={warrantyPartCharge} onCheckedChange={(v) => setWarrantyPartCharge(Boolean(v))} />
                    Ücretli
                  </label>
                  <Button className="gap-1 lg:w-auto" onClick={addWarrantyPart} disabled={warrantyBusy || !warrantyPartDescription.trim()}>
                    <Plus className="size-4" /> Ekle
                  </Button>
                </div>

                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead>Parça / İşlem</TableHead>
                        <TableHead>Katalog</TableHead>
                        <TableHead>İşlem</TableHead>
                        <TableHead>Kaynak</TableHead>
                        <TableHead className="text-right">Adet</TableHead>
                        <TableHead>Ücret</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warrantyParts.map((part, index) => (
                        <TableRow key={part.id ?? `${part.description}-${index}`}>
                          <TableCell>{part.description}</TableCell>
                          <TableCell className="text-muted-foreground">{part.product?.model ?? part.product?.modelName ?? "—"}</TableCell>
                          <TableCell>{part.actionType}</TableCell>
                          <TableCell>{part.source}</TableCell>
                          <TableCell className="text-right tabular-nums">{part.quantity}</TableCell>
                          <TableCell>{part.chargeToCustomer ? "Müşteriye yansır" : "Garanti/RMA"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="size-7" onClick={() => removeWarrantyPart(index)} disabled={warrantyBusy}>
                              <X className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {warrantyParts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Garanti parça/RMA satırı yok.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Garanti Kanıtları ve Ekler</CardTitle>
              </CardHeader>
              <CardContent>
                <ServiceCardAttachments
                  serviceRequestId={serviceRequest.id}
                  docs={warrantyDocs}
                  onPreview={setWarrantyPreviewDoc}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="communication" className="m-0 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="size-4" /> Şikayetler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="Şikayet / müşteri iletişim notu" className="min-h-20" />
                  <Button className="self-start gap-1 sm:w-auto" onClick={addComplaint}><Plus className="size-4" /> Ekle</Button>
                </div>
                <div className="space-y-2">
                  {(serviceRequest.complaints ?? []).map((item) => (
                    <ServiceHistoryCard
                      key={item.id}
                      text={item.text}
                      createdAt={item.createdAt}
                      actor={actorFor(item.byUserId)}
                    />
                  ))}
                  {(serviceRequest.complaints ?? []).length === 0 && <div className="text-sm text-muted-foreground">Şikayet kaydı yok.</div>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="m-0 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Not Geçmişi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Servis notu" className="min-h-20" />
                  <Button className="self-start gap-1" onClick={addNote}><Plus className="size-4" /> Ekle</Button>
                </div>
                <div className="space-y-2">
                  {(serviceRequest.noteHistory ?? []).map((item) => (
                    <div key={item.id} className="rounded-lg border border-border/60 bg-white p-2">
                      {editingNoteId === item.id ? (
                        <div className="space-y-2">
                          <Textarea value={editingNoteText} onChange={(e) => setEditingNoteText(e.target.value)} className="min-h-24" />
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditingNoteId(""); setEditingNoteText(""); }}>İptal</Button>
                            <Button size="sm" className="gap-1" onClick={saveEditedNote}><Save className="size-3.5" /> Kaydet</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <ServiceHistoryCard
                            text={item.text}
                            createdAt={item.createdAt}
                            actor={actorFor(item.byUserId)}
                          />
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditingNoteId(item.id); setEditingNoteText(item.text); }}>
                              Düzenle
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-700" onClick={() => deleteNote(item.id)}>
                              Sil
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {(serviceRequest.noteHistory ?? []).length === 0 && <div className="text-sm text-muted-foreground">Not kaydı yok.</div>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activities" className="m-0">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Aktivite Geçmişi</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="relative space-y-3">
                  {(serviceRequest.activityHistory ?? []).map((item) => (
                    <li key={item.id}>
                      <ServiceHistoryCard
                        text={item.text}
                        createdAt={item.createdAt}
                        actor={actorFor(item.byUserId)}
                      />
                    </li>
                  ))}
                  {(serviceRequest.activityHistory ?? []).length === 0 && <div className="text-sm text-muted-foreground">Aktivite kaydı yok.</div>}
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operations" className="m-0 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Servis Ücreti</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <Label>Saatlik Ücret</Label>
                  <Input
                    type="number"
                    className="mt-1"
                    value={hourlyRate}
                    onChange={(e) => updateService(serviceRequest.id, { serviceHourlyRate: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Para Birimi</Label>
                  <Select
                    value={serviceCurrency}
                    onValueChange={(v) => updateService(serviceRequest.id, { serviceCurrency: v as typeof serviceCurrency })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_CURRENCIES.map((cur) => <SelectItem key={cur} value={cur}>{cur}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Geçirilen Süre</Label>
                  <div className="mt-1 h-10 rounded-md border border-border/60 bg-muted/30 px-3 flex items-center tabular-nums">{formatElapsed(elapsed)}</div>
                </div>
                <div>
                  <Label>Servis Ücreti Kalemi</Label>
                  <div className="mt-1 h-10 rounded-md border border-border/60 bg-primary/5 px-3 flex items-center tabular-nums font-medium">
                    {moneyText(serviceFee, serviceCurrency)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Manuel İşlemler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_96px_120px_110px_auto] gap-2 items-end">
                  <div>
                    <Label>İşlem</Label>
                    <Input className="mt-1" value={operationDescription} onChange={(e) => setOperationDescription(e.target.value)} placeholder="Yapılan işlem" />
                  </div>
                  <div>
                    <Label>Adet</Label>
                    <Input className="mt-1" type="number" value={operationQty} onChange={(e) => setOperationQty(e.target.value)} />
                  </div>
                  <div>
                    <Label>Birim</Label>
                    <Input className="mt-1" type="number" value={operationPrice} onChange={(e) => setOperationPrice(e.target.value)} />
                  </div>
                  <div>
                    <Label>Para</Label>
                    <Select value={operationCurrency} onValueChange={(v) => setOperationCurrency(v as typeof operationCurrency)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SERVICE_CURRENCIES.map((cur) => <SelectItem key={cur} value={cur}>{cur}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="gap-1 lg:w-auto" onClick={addOperation}><Plus className="size-4" /> Ekle</Button>
                </div>

                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <Table className="min-w-[620px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead>İşlem</TableHead>
                        <TableHead>Ekleyen</TableHead>
                        <TableHead>Tarih</TableHead>
                        <TableHead className="text-right">Adet</TableHead>
                        <TableHead className="text-right">Birim</TableHead>
                        <TableHead className="text-right">Tutar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operations.map((op) => (
                        <TableRow key={op.id}>
                          <TableCell className="min-w-[220px]">{op.description}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[170px]">
                              <ServiceActorAvatar actor={actorFor(op.byUserId ?? serviceRequest.assignedUserId)} className="size-7" />
                              <div className="min-w-0">
                                <div className="text-sm truncate">{actorFor(op.byUserId ?? serviceRequest.assignedUserId)?.name ?? "Bilinmeyen kullanıcı"}</div>
                                <div className="text-[11px] text-muted-foreground truncate">{actorFor(op.byUserId ?? serviceRequest.assignedUserId)?.department ?? "—"}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">{op.createdAt ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{op.quantity}</TableCell>
                          <TableCell className="text-right tabular-nums">{moneyText(op.unitPrice, op.currency)}</TableCell>
                          <TableCell className="text-right tabular-nums">{moneyText(op.quantity * op.unitPrice, op.currency)}</TableCell>
                        </TableRow>
                      ))}
                      {operations.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Manuel işlem yok.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2 text-sm flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>Servis ücreti + aynı para birimindeki manuel işlemler</span>
                  <b className="tabular-nums">{moneyText(serviceFee + manualTotal, serviceCurrency)}</b>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Yedek Parça / Aksesuar Kullanımı</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)_auto] gap-2 items-end">
                  <div>
                    <Label>Ürün</Label>
                    <Select value={partProductId} onValueChange={setPartProductId}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Parça seçin" /></SelectTrigger>
                      <SelectContent>
                        {spareProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.model}{p.stockCode ? ` · ${p.stockCode}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Adet</Label>
                    <Input className="mt-1" type="number" value={partQty} onChange={(e) => setPartQty(e.target.value)} />
                  </div>
                  <div>
                    <Label>Not</Label>
                    <Input className="mt-1" value={partNote} onChange={(e) => setPartNote(e.target.value)} placeholder="Opsiyonel" />
                  </div>
                  <Button className="gap-1 lg:w-auto" onClick={consumeParts} disabled={!partProductId || consumingParts}>
                    <Plus className="size-4" /> Stoktan düş
                  </Button>
                </div>
                {spareProducts.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Ürün listesinde YEDEK_PARCA / AKSESUAR kategorisinde kayıt bulunamadı.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completion" className="m-0 space-y-4">
            <ServiceCompletionEditor
              key={`completion-${serviceRequest.id}`}
              serviceRequest={serviceRequest}
              customer={customer}
              contact={contact}
              machine={machine}
              assigneeName={assignee?.name}
              onSave={async (form, options) => {
                const isClosing = Boolean(options?.closeAfterSave);
                await updateService(
                  serviceRequest.id,
                  withActivity(isClosing ? "Servis tamamlama formu imzalandı ve servis kapatıldı." : "Servis tamamlama formu güncellendi.", {
                    completionForm: form,
                  }),
                );
                if (isClosing && serviceRequest.stage !== "Closed") {
                  try {
                    await moveService(serviceRequest.id, "Closed");
                  } catch (err: any) {
                    toast.error("Servis kapatılamadı", { description: err?.message ?? "Aşama güncellenemedi." });
                    return;
                  }
                }
                toast.success(isClosing ? "Servis kapatıldı" : "Tamamlama formu kaydedildi");
              }}
              onPrint={openServiceFormPdf}
            />
          </TabsContent>
          </div>
        </Tabs>
        </div>
      </KanbanDetailDialogShell>
      </DialogContent>
      <DocumentPreviewDialog doc={warrantyPreviewDoc} onClose={() => setWarrantyPreviewDoc(null)} />
      <DocumentPreviewDialog doc={quotePreviewDoc} onClose={() => setQuotePreviewDoc(null)} />
    </Dialog>
  );
}

function ServiceCompletionEditor({
  serviceRequest,
  customer,
  contact,
  machine,
  assigneeName,
  onSave,
  onPrint,
}: {
  serviceRequest: ServiceRequest;
  customer?: Customer | null;
  contact?: Contact | null;
  machine?: Machine | null;
  assigneeName?: string;
  onSave: (form: ServiceCompletionForm, options?: { closeAfterSave?: boolean }) => Promise<void>;
  onPrint: (form: ServiceCompletionForm, previewWindow?: Window | null) => Promise<void> | void;
}) {
  const isClosed = serviceRequest.stage === "Closed";
  const fallback = buildDefaultCompletionForm({ s: serviceRequest, customer, contact, machine, assignee: { name: assigneeName } });
  const initial = mergeCompletionForm(serviceRequest.completionForm, fallback);
  const [draft, setDraft] = useState<ServiceCompletionForm>(initial);
  const [saving, setSaving] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  useEffect(() => {
    setDraft(mergeCompletionForm(serviceRequest.completionForm, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceRequest.id, serviceRequest.completionForm, serviceRequest.machineId, serviceRequest.customerId]);

  const update = <K extends keyof ServiceCompletionForm>(key: K, value: ServiceCompletionForm[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };
  const updateGroup = <G extends "tezgah" | "cnc" | "kullanici">(group: G, field: string, value: string) => {
    setDraft((prev) => ({ ...prev, [group]: { ...(prev[group] ?? {}), [field]: value } }));
  };
  const updatePart = (id: string, patch: Partial<ServiceCompletionPart>) => {
    setDraft((prev) => ({
      ...prev,
      degisenParcalar: (prev.degisenParcalar ?? []).map((part) => part.id === id ? { ...part, ...patch } : part),
    }));
  };
  const addPart = () => {
    if ((draft.degisenParcalar?.length ?? 0) >= 6) return;
    setDraft((prev) => ({
      ...prev,
      degisenParcalar: [
        ...(prev.degisenParcalar ?? []),
        { id: `service-part-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, description: "", quantity: 1, unitPrice: 0 },
      ],
    }));
  };
  const removePart = (id: string) => {
    setDraft((prev) => ({ ...prev, degisenParcalar: (prev.degisenParcalar ?? []).filter((part) => part.id !== id) }));
  };

  const buildPayload = (markSigned: boolean): ServiceCompletionForm => ({
    ...draft,
    degisenParcalar: (draft.degisenParcalar ?? [])
      .map((part) => ({
        ...part,
        description: part.description.trim(),
        quantity: Math.max(1, Number(part.quantity) || 1),
        unitPrice: Math.max(0, Number(part.unitPrice) || 0),
      }))
      .filter((part) => part.description),
    servisUcreti: Math.max(0, Number(draft.servisUcreti) || 0),
    ulasimUcreti: Math.max(0, Number(draft.ulasimUcreti) || 0),
    signedAt: markSigned ? new Date().toISOString() : draft.signedAt,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = buildPayload(false);
      await onSave(payload);
      setDraft(payload);
    } finally {
      setSaving(false);
    }
  };
  const handlePrint = async () => {
    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = "Servis formu hazırlanıyor";
      previewWindow.document.body.textContent = "Servis formu hazırlanıyor...";
    }
    setSaving(true);
    try {
      const payload = buildPayload(false);
      if (!isClosed) {
        await onSave(payload);
        setDraft(payload);
      }
      await onPrint(payload, previewWindow);
    } catch (error) {
      previewWindow?.close();
      throw error;
    } finally {
      setSaving(false);
    }
  };
  const handleClose = async () => {
    const missing = [
      !draft.serviceType && "Servis tipi",
      !draft.responsibility && "Yükümlülük",
      !draft.yapilanIsler?.trim() && "Yapılan işlemler",
      !draft.kurulumuYapan?.trim() && "Servis yetkilisi",
      !draft.teslimAlan?.trim() && "Firma yetkilisi",
    ].filter(Boolean);
    if (missing.length) {
      toast.error("Servis formu tamamlanmadı", { description: `Eksik alanlar: ${missing.join(", ")}.` });
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(true);
      await onSave(payload, { closeAfterSave: true });
      setDraft(payload);
      setCloseConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const partsTotal = (draft.degisenParcalar ?? []).reduce(
    (sum, part) => sum + (Number(part.quantity) || 0) * (Number(part.unitPrice) || 0),
    0,
  );
  const grandTotal = partsTotal + (Number(draft.servisUcreti) || 0) + (Number(draft.ulasimUcreti) || 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileCheck2 className="size-4 text-primary" />
          <span className="font-medium">Doktor Makina Servis Formu</span>
          {draft.signedAt && (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              İmzalandı · {draft.signedAt.slice(0, 16).replace("T", " ")}
            </Badge>
          )}
          {isClosed && <Badge variant="outline" className="border-zinc-300 bg-zinc-50 text-zinc-700">Servis kapandı</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">PDF: Doktor Makina Servis Formu şablonu ile oluşturulur.</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Form No</Label>
          <Input className="mt-1" value={draft.formNo ?? ""} onChange={(e) => update("formNo", e.target.value)} disabled={isClosed} />
        </div>
        <div>
          <Label>Servis Tarihi</Label>
          <Input className="mt-1" type="date" value={draft.kurulumTarihi ?? ""} onChange={(e) => update("kurulumTarihi", e.target.value)} disabled={isClosed} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="border-border/60">
          <CardHeader className="pb-3"><CardTitle className="text-base">Tezgah Bilgileri</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Tezgah Markası</Label><Input className="mt-1" value={draft.tezgah?.marka ?? ""} onChange={(e) => updateGroup("tezgah", "marka", e.target.value)} disabled={isClosed} /></div>
            <div><Label>Tezgah Tipi</Label><Input className="mt-1" value={draft.tezgah?.tip ?? ""} onChange={(e) => updateGroup("tezgah", "tip", e.target.value)} disabled={isClosed} /></div>
            <div><Label>Tezgah Modeli</Label><Input className="mt-1" value={draft.tezgah?.model ?? ""} onChange={(e) => updateGroup("tezgah", "model", e.target.value)} disabled={isClosed} /></div>
            <div><Label>Tezgah Seri No</Label><Input className="mt-1" value={draft.tezgah?.seriNo ?? ""} onChange={(e) => updateGroup("tezgah", "seriNo", e.target.value)} disabled={isClosed} /></div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-3"><CardTitle className="text-base">Kontrol Ünitesi Bilgileri</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Cnc Markası</Label><Input className="mt-1" value={draft.cnc?.marka ?? ""} onChange={(e) => updateGroup("cnc", "marka", e.target.value)} disabled={isClosed} /></div>
            <div><Label>Cnc Modeli</Label><Input className="mt-1" value={draft.cnc?.model ?? ""} onChange={(e) => updateGroup("cnc", "model", e.target.value)} disabled={isClosed} /></div>
            <div><Label>Cnc Seri No</Label><Input className="mt-1" value={draft.cnc?.seriNo ?? ""} onChange={(e) => updateGroup("cnc", "seriNo", e.target.value)} disabled={isClosed} /></div>
            <div><Label>Cnc Main S/W</Label><Input className="mt-1" value={draft.cnc?.mainSw ?? ""} onChange={(e) => updateGroup("cnc", "mainSw", e.target.value)} disabled={isClosed} /></div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-3"><CardTitle className="text-base">Kullanıcı Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Label>Firma</Label><Input className="mt-1" value={draft.kullanici?.firma ?? ""} onChange={(e) => updateGroup("kullanici", "firma", e.target.value)} disabled={isClosed} /></div>
          <div><Label>İlgili</Label><Input className="mt-1" value={draft.kullanici?.ilgili ?? ""} onChange={(e) => updateGroup("kullanici", "ilgili", e.target.value)} disabled={isClosed} /></div>
          <div><Label>Telefon</Label><Input className="mt-1" value={draft.kullanici?.telefon ?? ""} onChange={(e) => updateGroup("kullanici", "telefon", e.target.value)} disabled={isClosed} /></div>
          <div className="sm:col-span-2"><Label>Adres</Label><Textarea className="mt-1 min-h-20" value={draft.kullanici?.adres ?? ""} onChange={(e) => updateGroup("kullanici", "adres", e.target.value)} disabled={isClosed} /></div>
          <div><Label>Faks</Label><Input className="mt-1" value={draft.kullanici?.faks ?? ""} onChange={(e) => updateGroup("kullanici", "faks", e.target.value)} disabled={isClosed} /></div>
          <div><Label>Gsm</Label><Input className="mt-1" value={draft.kullanici?.gsm ?? ""} onChange={(e) => updateGroup("kullanici", "gsm", e.target.value)} disabled={isClosed} /></div>
          <div><Label>E-Posta</Label><Input className="mt-1" type="email" value={draft.kullanici?.eposta ?? ""} onChange={(e) => updateGroup("kullanici", "eposta", e.target.value)} disabled={isClosed} /></div>
          <div><Label>Vergi Dairesi</Label><Input className="mt-1" value={draft.kullanici?.vergiDairesi ?? ""} onChange={(e) => updateGroup("kullanici", "vergiDairesi", e.target.value)} disabled={isClosed} /></div>
          <div><Label>Vergi No</Label><Input className="mt-1" value={draft.kullanici?.vergiNo ?? ""} onChange={(e) => updateGroup("kullanici", "vergiNo", e.target.value)} disabled={isClosed} /></div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-3"><CardTitle className="text-base">Servis Bilgileri</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Müşteri Şikayeti</Label>
            <Textarea className="mt-1 min-h-24" value={draft.musteriSikayeti ?? ""} onChange={(e) => update("musteriSikayeti", e.target.value)} disabled={isClosed} placeholder="Servis talebindeki müşteri şikayeti..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Servis Tipi</Label>
              <Select value={draft.serviceType} onValueChange={(value) => update("serviceType", value as ServiceFormType)} disabled={isClosed}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Servis tipi seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="montaj">Montaj</SelectItem>
                  <SelectItem value="ariza">Arıza</SelectItem>
                  <SelectItem value="periyodik">Periyodik Bakım</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Yükümlülük</Label>
              <Select value={draft.responsibility} onValueChange={(value) => update("responsibility", value as ServiceFormResponsibility)} disabled={isClosed}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Yükümlülük seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ucretli">Ücretli</SelectItem>
                  <SelectItem value="garanti">Garanti</SelectItem>
                  <SelectItem value="bakim">Bakım Anlaşması</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Yapılan İşlemler</Label>
            <Textarea className="mt-1 min-h-28" value={draft.yapilanIsler ?? ""} onChange={(e) => update("yapilanIsler", e.target.value)} disabled={isClosed} placeholder="Sahada gerçekleştirilen işlemleri özetleyin..." />
          </div>
          <div>
            <Label>Ek Notlar</Label>
            <Textarea className="mt-1 min-h-20" value={draft.notlar ?? ""} onChange={(e) => update("notlar", e.target.value)} disabled={isClosed} placeholder="Varsa yapılan işlemler alanının devamına eklenir..." />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base">Değişen Parçalar</CardTitle>
          {!isClosed && (
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addPart} disabled={(draft.degisenParcalar?.length ?? 0) >= 6}>
              <Plus className="size-4" /> Parça ekle
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Parça Açıklaması</TableHead>
                  <TableHead className="w-28">Miktar</TableHead>
                  <TableHead className="w-40">Birim Fiyatı</TableHead>
                  <TableHead className="w-40 text-right">Tutar</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(draft.degisenParcalar ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-16 text-center text-muted-foreground">Değişen parça yok.</TableCell></TableRow>
                ) : (draft.degisenParcalar ?? []).map((part) => (
                  <TableRow key={part.id}>
                    <TableCell><Input value={part.description} onChange={(e) => updatePart(part.id, { description: e.target.value })} disabled={isClosed} /></TableCell>
                    <TableCell><Input type="number" min="1" step="1" value={part.quantity} onChange={(e) => updatePart(part.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} disabled={isClosed} /></TableCell>
                    <TableCell><Input type="number" min="0" step="0.01" value={part.unitPrice} onChange={(e) => updatePart(part.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} disabled={isClosed} /></TableCell>
                    <TableCell className="text-right tabular-nums">{moneyText(part.quantity * part.unitPrice, draft.currency ?? "TRY")}</TableCell>
                    <TableCell className="text-right">
                      {!isClosed && <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => removePart(part.id)} title="Parçayı kaldır"><Trash2 className="size-4" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-3"><CardTitle className="text-base">Ücretler</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label>Para Birimi</Label>
            <Select value={draft.currency ?? "TRY"} onValueChange={(value) => update("currency", value as ServiceCompletionForm["currency"])} disabled={isClosed}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{SERVICE_CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Servis Ücreti (İşçilik)</Label><Input className="mt-1" type="number" min="0" step="0.01" value={draft.servisUcreti ?? 0} onChange={(e) => update("servisUcreti", Math.max(0, Number(e.target.value) || 0))} disabled={isClosed} /></div>
          <div><Label>Ulaşım Ücreti</Label><Input className="mt-1" type="number" min="0" step="0.01" value={draft.ulasimUcreti ?? 0} onChange={(e) => update("ulasimUcreti", Math.max(0, Number(e.target.value) || 0))} disabled={isClosed} /></div>
          <div><Label>Toplam (K.D.V. Hariç)</Label><div className="mt-1 flex h-9 items-center justify-end rounded-md border border-border bg-muted/30 px-3 font-semibold tabular-nums">{moneyText(grandTotal, draft.currency ?? "TRY")}</div></div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-3"><CardTitle className="text-base">İmza Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Servisi Yapan (Ad, Soyad)</Label><Input className="mt-1" value={draft.kurulumuYapan ?? ""} onChange={(e) => update("kurulumuYapan", e.target.value)} disabled={isClosed} /></div>
          <div><Label>Tezgahı Teslim Alan (Ad, Soyad)</Label><Input className="mt-1" value={draft.teslimAlan ?? ""} onChange={(e) => update("teslimAlan", e.target.value)} disabled={isClosed} /></div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="gap-1" disabled={saving} onClick={handlePrint}>
          <Printer className="size-4" /> Önizleme / PDF
        </Button>
        {!isClosed && (
          <Button variant="outline" className="gap-1" disabled={saving} onClick={handleSave}>
            <Check className="size-4" /> Kaydet
          </Button>
        )}
        {!isClosed && (
          <Button className="gap-1 bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={() => setCloseConfirmOpen(true)}>
            <Lock className="size-4" /> Servisi Kapat
          </Button>
        )}
      </div>
      <AlertDialog open={closeConfirmOpen} onOpenChange={(open) => !saving && setCloseConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Servis kaydı kapatılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>Form imzalandı olarak işaretlenecek ve servis aşaması “Kapandı” olacak. Tezgah, değişen parçalar ve ücret bilgileri servis geçmişinde korunur.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={(event) => { event.preventDefault(); void handleClose(); }}>{saving ? "Kapatılıyor…" : "Formu imzala ve kapat"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ServiceHistoryView({
  query,
  onQueryChange,
  items,
  customers,
  machines,
  users,
  onOpen,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  items: ServiceRequest[];
  customers: Customer[];
  machines: Machine[];
  users: User[];
  onOpen: (s: ServiceRequest) => void;
}) {
  const closed = items
    .filter((s) => s.stage === "Closed")
    .sort((a, b) => {
      const aT = new Date(a.closedAt ?? a.createdAt).getTime();
      const bT = new Date(b.closedAt ?? b.createdAt).getTime();
      return bT - aT;
    });

  const q = query.trim().toLocaleLowerCase("tr-TR");
  const filtered = q
    ? closed.filter((s) => {
        const cust = customers.find((c) => c.id === s.customerId);
        const machine = machines.find((m) => m.id === s.machineId);
        const hay = [
          cust?.name,
          machine?.model,
          machine?.serialNumber,
          s.ticketNo,
          s.description,
          s.serviceNote,
          s.completionForm?.formNo,
          s.completionForm?.yapilanIsler,
          s.completionForm?.notlar,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr-TR");
        return hay.includes(q);
      })
    : closed;

  const handlePrint = async (s: ServiceRequest) => {
    try {
      await serviceService.openServiceFormPdf(s.id, s.ticketNo || s.id);
    } catch (err: any) {
      toast.error("Servis formu açılamadı", { description: err?.message ?? "PDF oluşturulamadı." });
    }
  };

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><History className="size-5" /> Servis Geçmişi</CardTitle>
          <div className="mt-1 text-sm text-muted-foreground">
            Kapatılmış servisler ve imzalanan tamamlama formları.
          </div>
        </div>
        <div className="flex w-full max-w-sm items-center gap-2">
          <Input
            placeholder="Firma, makine, form no, not içinde ara..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow>
              <TableHead>Firma</TableHead>
              <TableHead>Makine</TableHead>
              <TableHead>Form</TableHead>
              <TableHead>Kontroller</TableHead>
              <TableHead>Servisi Yapan</TableHead>
              <TableHead>Kapanış</TableHead>
              <TableHead className="w-28 text-right">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  Henüz kapatılmış servis kaydı yok.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => {
                const customer = customers.find((c) => c.id === s.customerId);
                const machine = machines.find((m) => m.id === s.machineId);
                const assignee = users.find((u) => u.id === s.assignedUserId);
                const cf = s.completionForm;
                const total = cf?.checks?.length ?? 0;
                const done = cf?.checks?.filter((c) => c.status === "done").length ?? 0;
                const signed = cf?.signedAt ? cf.signedAt.slice(0, 16).replace("T", " ") : null;
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => onOpen(s)}
                  >
                    <TableCell className="font-medium">{customer?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {machine ? `${machine.model ?? ""} · ${machine.serialNumber ?? ""}` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{cf?.formNo || s.ticketNo || s.id}</span>
                        {signed && <span className="text-xs text-emerald-700">İmzalandı · {signed}</span>}
                        {!cf && <span className="text-xs text-muted-foreground">Form doldurulmamış</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {total > 0 ? (
                        <Badge variant="outline" className="bg-white">{done}/{total}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{cf?.kurulumuYapan || assignee?.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{s.closedAt ?? s.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="Servis formu PDF"
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePrint(s);
                          }}
                        >
                          <FileText className="size-4 text-muted-foreground hover:text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="Kaydı aç"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpen(s);
                          }}
                        >
                          <ArrowRight className="size-4 text-muted-foreground hover:text-primary" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
