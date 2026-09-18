import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PIPELINE_STAGE_FLOW,
  type OpportunityProcessActionKey,
  type OpportunityProcessReadiness,
} from "@haksan/shared";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  FileClock,
  Loader2,
  RefreshCw,
  Trash2,
  Truck,
  Wrench,
  Pencil,
  ChevronDown,
  ArrowUpRight,
  FileText,
  CalendarClock,
  Plus,
} from "lucide-react";
import { opportunityService } from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import { useStore } from "../../lib/store";
import {
  QUALIFICATION_STAGE_LABELS,
  salesStageLabel,
  type SalesCase,
} from "../../lib/mock";
import { resolveSalesContact } from "../../lib/salesContact";
import { focusWorkspaceTarget } from "../../lib/workspaceFocus";
import { AddActivityDialog } from "../dialogs/CreateDialogs";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import { Combobox } from "../ui/combobox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { DecisionRail, LeadQualificationPanel } from "./LeadWorkspaceControls";
import { TaskRecordSection } from "./tasks/TaskRecordSection";
import {
  UnifiedTimeline,
  type WorkspaceDecisionModel,
} from "../shared/RecordWorkspace";
import { isManualTimelineComment, isOpportunityTimelineActivity } from "../../lib/opportunityTimeline";
import { useCompanyDetail } from "../../lib/companyServerData";
import {
  contactQueryKeys,
  loadAllCompanyContacts,
  type ContactQueryScope,
} from "../../lib/contactServerData";
import { useRemoteContactDetail } from "../shared/RemoteContactCombobox";
import { OpportunityNoteComposer } from "./OpportunityNoteComposer";
import "./opportunity-workspace.css";
import { DocumentDetailDialog } from "../dialogs/DocumentDetailDialog";
import { DocumentPreviewDialog } from "../dialogs/DocumentPreviewDialog";
import { EditContractTermsDialog, SignedContractUploadDialog } from "../dialogs/ContractActionsDialogs";
import type { DocumentItem } from "../../lib/mock";
import { ActivityDetailDialog } from "../shared/StandaloneActivity";
import {
  LostOpportunityDetails,
  LostOpportunityDetailsDialog,
  lostTimelineDetail,
} from "../shared/LostOpportunityDetails";

/** Fırsat bilgileri, aşama işleri ve görüşmeler için tek çalışma alanı. */
type OpportunityDetail = {
  history?: Array<Record<string, any>>;
  qualificationHistory?: Array<Record<string, any>>;
  approvals?: Array<Record<string, any>>;
  processReadiness?: OpportunityProcessReadiness;
};
type OpportunityDetailResource = {
  caseId: string;
  status: "idle" | "loading" | "ready" | "error";
  data: OpportunityDetail | null;
  error: string | null;
};
type TimelineItem = {
  id: string;
  date: string;
  category: "activity" | "process" | "commercial" | "approval" | "file";
  categoryLabel?: string;
  title: string;
  detail?: string;
  actor?: string;
  sourceActivityId?: string;
};

const APPROVAL_LABELS: Record<string, string> = {
  payment: "Ödeme",
  customs: "Gümrük",
  invoice: "Fatura",
  installation: "Kurulum",
  win: "WIN",
};

const categoryLabel: Record<TimelineItem["category"], string> = {
  activity: "Aktivite",
  process: "Süreç",
  commercial: "Ticari",
  approval: "Onay",
  file: "Dosya",
};

const formatMoney = (value: number, currency: SalesCase["currency"]) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

const formatDate = (value?: string | Date | null, withTime = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};

const timelineTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

export function buildWorkspaceDecisionModel({
  salesCase,
  ownerName,
  customerMissing,
  overduePaymentCount,
  nextOperationTarget,
  nextActivity,
  processReadinessKnown = true,
}: {
  salesCase: SalesCase;
  ownerName?: string;
  customerMissing: boolean;
  overduePaymentCount: number;
  nextOperationTarget?: OpportunityProcessReadiness["targets"][number];
  nextActivity?: { title: string; date: string };
  processReadinessKnown?: boolean;
}): WorkspaceDecisionModel {
  const health = salesCase.qualificationReadiness?.health;
  const isLead = salesCase.qualificationStage === "lead";
  const terminalLabel = salesCase.isLost || salesCase.qualificationStage === "lost"
    ? "Kaybedildi"
    : salesCase.leadFollowUpStatus === "disqualified"
      ? "Elendi"
      : salesCase.stage === "cancelled"
        ? "İptal edildi"
        : salesCase.closedAt || salesCase.qualificationStage === "win"
          ? "Tamamlandı"
          : undefined;
  const risks = [
    !terminalLabel && health?.leadSlaBreached ? { key: "lead-sla", label: "İlk temas SLA ihlali", detail: `${health.leadStatusAgeHours ?? 0} saat bekledi`, tone: "danger" as const, priority: 90 } : null,
    !terminalLabel && health?.rotting ? { key: "stage-age", label: "Aşama yaşlanıyor", detail: `${health.stageAgeDays ?? 0} gün / ${health.stageAgeLimitDays ?? "—"} gün`, tone: "warning" as const, priority: 80 } : null,
    !terminalLabel && overduePaymentCount > 0 ? { key: "payment-overdue", label: "Gecikmiş ödeme", detail: `${overduePaymentCount} ödeme kaydı`, tone: "danger" as const, priority: 75 } : null,
    !terminalLabel && (nextOperationTarget?.blockers.length ?? 0) > 0 ? { key: "process-blockers", label: "Süreç geçişi engelli", detail: `${nextOperationTarget?.blockers.length ?? 0} gereklilik tamamlanmalı`, tone: "warning" as const, priority: 70 } : null,
    !terminalLabel && customerMissing ? { key: "company-missing", label: "Firma eksik", detail: "Kayıt bir firmaya bağlanmalı", tone: "warning" as const, priority: 60 } : null,
    !terminalLabel && !ownerName ? { key: "owner-missing", label: "Sorumlu atanmamış", detail: "Kayıt sahipsiz havuzda", tone: "warning" as const, priority: 50 } : null,
  ].filter((risk): risk is NonNullable<typeof risk> => Boolean(risk))
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 3)
    .map(({ priority: _priority, ...risk }) => risk);

  const qualificationNext = salesCase.qualificationReadiness?.nextStage;

  return {
    nextAction: terminalLabel ? "Kapanış durumunu ve kayıtları inceleyin" : nextActivity?.title || "Aktivite planlanmadı",
    nextActionDate: terminalLabel ? formatDate(salesCase.closedAt, true) : formatDate(nextActivity?.date),
    nextActionOverdue: false,
    ownerName: ownerName || "Sahipsiz havuz",
    currentStage: isLead
      ? QUALIFICATION_STAGE_LABELS[salesCase.qualificationStage]
      : salesStageLabel(salesCase.stage),
    nextStage: isLead
      ? qualificationNext ? QUALIFICATION_STAGE_LABELS[qualificationNext] : "Dönüşüm kararı"
      : !processReadinessKnown
        ? "Doğrulama bekliyor"
        : nextOperationTarget ? salesStageLabel(nextOperationTarget.code as SalesCase["stage"]) : "Akış sonu",
    blockerCount: isLead
      ? salesCase.qualificationReadiness?.blockers.length ?? 0
      : nextOperationTarget?.blockers.length ?? 0,
    readinessUnknown: !isLead && !processReadinessKnown,
    risks,
    terminalLabel,
  };
}

export function OpportunityWorkspace({
  salesCase: sc,
  processCenter,
  renderProcessCenter,
  companyLinkingPanel,
  onCommercialAction,
  canPerformCommercialAction,
  onOpenOffer,
  focusDecisionOnMount = false,
  onEditActivity,
  onDeleteActivity,
  taskActions,
  otherActions,
  stageHeaderPortalId,
}: {
  salesCase: SalesCase;
  processCenter: ReactNode;
  renderProcessCenter?: (context: { detail: OpportunityDetail | null; loading: boolean; reload: () => Promise<void>; headerPortalId?: string }) => ReactNode;
  /** Aktif satış alanının görev listesi; süreç haritasından bağımsız gösterilir. */
  companyLinkingPanel?: ReactNode;
  onCommercialAction?: (actionKey: OpportunityProcessActionKey) => void | Promise<void>;
  canPerformCommercialAction?: (actionKey: OpportunityProcessActionKey) => boolean;
  onOpenOffer?: (offerId: string) => void;
  focusDecisionOnMount?: boolean;
  onEditActivity?: (activityId: string) => void;
  onDeleteActivity?: (activityId: string) => void;
  /** Fırsat görevleri kartında, görev oluşturmanın yanında gösterilen eylemler. */
  taskActions?: ReactNode;
  otherActions?: ReactNode;
  stageHeaderPortalId?: string;
}) {
  const {
    users,
    activities,
    offers,
    payments,
    documents,
    shipments,
    deliveries,
    installations,
    updateCase,
  } = useStore();
  const { user, activeDivision, activeDepartment, hasPermission, hasRole } = useAuth();
  const canUpdate = hasPermission("opportunities.update");
  const canCreateActivity = hasPermission("activities.create");
  const canAssignOwner = canUpdate && (hasRole("sales") || hasRole("super_admin"));
  const isLead = sc.qualificationStage === "lead";
  const simpleOpportunity = !isLead;
  const [detailResource, setDetailResource] = useState<OpportunityDetailResource>(() => ({
    caseId: sc.id,
    status: "idle",
    data: null,
    error: null,
  }));
  const [focusedActivityId, setFocusedActivityId] = useState<string | null>(null);
  const [selectedCommercialDocument, setSelectedCommercialDocument] = useState<DocumentItem | null>(null);
  const [selectedFileDocument, setSelectedFileDocument] = useState<DocumentItem | null>(null);
  const decisionSummaryRef = useRef<HTMLElement>(null);
  const [openingWork, setOpeningWork] = useState(false);
  const detailRequestRef = useRef(0);
  const detail = detailResource.caseId === sc.id ? detailResource.data : null;
  const caseOffers = useMemo(() => offers.filter((item) => item.salesCaseId === sc.id), [offers, sc.id]);
  const caseDocuments = useMemo(() => documents.filter((item) => item.salesCaseId === sc.id), [documents, sc.id]);
  const detailLoading = detailResource.caseId !== sc.id || detailResource.status === "idle" || detailResource.status === "loading";
  const detailError = detailResource.caseId === sc.id ? detailResource.error : null;
  const contactScope = useMemo<ContactQueryScope>(() => ({
    tenantId: user?.tenantId ?? "anonymous",
    userId: user?.id ?? "anonymous",
    activeDivision,
    activeDepartment,
  }), [activeDepartment, activeDivision, user?.id, user?.tenantId]);
  const companyQuery = useCompanyDetail(sc.customerId);
  const companyContactsQuery = useQuery({
    queryKey: contactQueryKeys.companyContacts(contactScope, sc.customerId || "none"),
    queryFn: ({ signal }) => loadAllCompanyContacts(sc.customerId as string, signal),
    enabled: Boolean(sc.customerId),
  });
  const selectedContactQuery = useRemoteContactDetail(sc.primaryContactId);

  useEffect(() => {
    if (!focusDecisionOnMount) return;
    const timer = window.setTimeout(() => focusWorkspaceTarget(decisionSummaryRef.current, { scroll: false }), 0);
    return () => window.clearTimeout(timer);
  }, [focusDecisionOnMount, sc.id]);


  useEffect(() => {
    // Bölüm/kayıt çapası kalmadı: URL'de yalnız hangi kaydın açık olduğu ve
    // isteğe bağlı olarak vurgulanacak aktivite duruyor. Akış kalıcı olarak
    // yan panelde durduğu için derin bağlantının bir sekme açmasına gerek yok.
    const syncFocusFromLocation = () => {
      const url = new URL(window.location.href);
      const opportunityId = url.searchParams.get("opportunity");
      const activityId = url.searchParams.get("activity");
      setFocusedActivityId(opportunityId === sc.id ? activityId : null);
    };
    syncFocusFromLocation();
    window.addEventListener("popstate", syncFocusFromLocation);
    window.addEventListener("haksan:opportunity-focus", syncFocusFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFocusFromLocation);
      window.removeEventListener("haksan:opportunity-focus", syncFocusFromLocation);
    };
  }, [sc.id]);

  const loadDetail = useCallback(async () => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setDetailResource((current) => ({
      caseId: sc.id,
      status: "loading",
      data: current.caseId === sc.id ? current.data : null,
      error: null,
    }));
    try {
      const nextDetail = await opportunityService.get(sc.id);
      if (detailRequestRef.current === requestId) {
        setDetailResource({ caseId: sc.id, status: "ready", data: nextDetail, error: null });
      }
    } catch (error: any) {
      if (detailRequestRef.current === requestId) {
        setDetailResource({
          caseId: sc.id,
          status: "error",
          data: null,
          error: error?.message ?? "Fırsat geçmişi alınamadı.",
        });
      }
    }
  }, [sc.id]);

  const customer = companyQuery.data;
  const owner = users.find((item) => item.id === sc.assignedUserId);
  // Bu türetmeler her render'da yeni dizi referansı üretiyordu ve doğrudan
  // `timeline` memo'sunun bağımlılık listesinde oldukları için o memo da hiç
  // tutmuyordu. Store tek büyük context olduğu için herhangi bir mutasyon da
  // aynı zinciri tetikliyordu.
  const opportunityActivities = useMemo(() => activities.filter((item) => item.salesCaseId === sc.id), [activities, sc.id]);
  const opportunityOffers = useMemo(() => offers.filter((item) => item.salesCaseId === sc.id), [offers, sc.id]);
  const opportunityPayments = useMemo(() => payments.filter((item) => item.salesCaseId === sc.id), [payments, sc.id]);
  const opportunityDocuments = useMemo(() => documents.filter((item) => item.salesCaseId === sc.id), [documents, sc.id]);
  // Koşulların tamamlanma durumunun içerik imzası. Nesne referansı store'un
  // her tazelemesinde değişiyor; imza yalnız gerçek bir değişimde değişir.
  const readinessSignature = (sc.qualificationReadiness?.checks ?? [])
    .map((check) => `${check.key}:${check.complete ? 1 : 0}`)
    .join(",");

  useEffect(() => {
    void loadDetail();
    // Ticari belge sayıları da bağımlılık: `processReadiness` yalnız bu detay
    // çağrısından geliyor, belge/teklif oluşturan akışlar ise store'u tazeleyip
    // detaya dokunmuyordu; süreç bölümü eski hazırlık verisini gösteriyordu.
    // Görev listesindeki bir koşul tamamlandığında da tazelenmeli: içerik
    // imzası kullanılıyor, böylece store her tazelendiğinde değil yalnız bir
    // koşulun durumu gerçekten değiştiğinde istek atılır.
  }, [loadDetail, sc.stage, sc.qualificationStage, opportunityOffers.length, opportunityDocuments.length, readinessSignature]);
  const opportunityShipments = useMemo(() => shipments.filter((item) => item.salesCaseId === sc.id), [shipments, sc.id]);
  const opportunityDeliveries = useMemo(() => deliveries.filter((item) => item.salesCaseId === sc.id), [deliveries, sc.id]);
  const opportunityInstallations = useMemo(() => installations.filter((item) => item.salesCaseId === sc.id), [installations, sc.id]);
  const resolvedContacts = useMemo(() => {
    const contactsById = new Map(
      (companyContactsQuery.data?.data ?? []).map((contact) => [contact.id, contact]),
    );
    if (selectedContactQuery.data) contactsById.set(selectedContactQuery.data.id, selectedContactQuery.data);
    return Array.from(contactsById.values());
  }, [companyContactsQuery.data?.data, selectedContactQuery.data]);
  const resolvedContact = useMemo(
    () => resolveSalesContact({ salesCase: sc, customer, contacts: resolvedContacts }),
    [sc, customer, resolvedContacts],
  );

  // Aktivite akışı yalnız kullanıcının girdiği kayıtları gösterir: temaslar ve
  // yorumlar. Sistem olayları (aşama geçişi, nitelik, onay, teklif, ödeme,
  // dosya) aşağıdaki ayrı "Süreçler" alanında — tek akışta karıştıklarında
  // temaslar sistem gürültüsünün arasında kayboluyordu.
  const timeline = useMemo<TimelineItem[]>(() => {
    const visibleActivities = isLead
      ? opportunityActivities
      : opportunityActivities.filter(isOpportunityTimelineActivity);
    const activityItems = visibleActivities
      .map((activity) => {
        const isComment = isManualTimelineComment(activity);
        return {
          id: `activity-${activity.id}`,
          sourceActivityId: activity.id,
          date: activity.date,
          category: "activity" as const,
          categoryLabel: isLead ? undefined : isComment ? "Yorum" : activity.type || "Aktivite",
          title: activity.title,
          detail: [activity.note, activity.result].filter(Boolean).join(" · "),
          actor: activity.createdByName || users.find((item) => item.id === activity.byUserId)?.name,
        };
      });
    const lostItems = (detail?.qualificationHistory ?? [])
      .filter((history) => history.toStage === "lost")
      .map((history) => ({
        id: `qualification-${history.id}`,
        date: history.createdAt,
        category: "process" as const,
        categoryLabel: "LOST",
        title: "Fırsat kaybedildi",
        detail: lostTimelineDetail(sc),
      }));
    return [...activityItems, ...lostItems]
      .sort((a, b) => timelineTime(b.date) - timelineTime(a.date));
  }, [detail?.qualificationHistory, isLead, opportunityActivities, sc, users]);

  /**
   * Salt okunur sistem olayları. Aktivite akışının altında kendi küçük
   * alanında gösterilir; kullanıcı bunları yazmaz, yalnız okur.
   */
  const processTimeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    if (!simpleOpportunity) return items;
    (detail?.history ?? []).forEach((history) => items.push({
      id: `stage-${history.id}`,
      date: history.createdAt,
      category: "process",
      title: `Operasyon aşaması: ${history.toStage?.name ?? salesStageLabel(history.toStage?.code ?? history.toStageCode ?? "güncellendi")}`,
      detail: history.changeReason ?? history.notes ?? undefined,
    }));
    (detail?.qualificationHistory ?? []).filter((history) => history.toStage !== "lost").forEach((history) => items.push({
      id: `qualification-${history.id}`,
      date: history.createdAt,
      category: "process",
      title: `Satış alanı: ${QUALIFICATION_STAGE_LABELS[history.toStage as keyof typeof QUALIFICATION_STAGE_LABELS] ?? history.toStage}`,
      detail: history.changeReason ?? undefined,
    }));
    (detail?.approvals ?? []).forEach((approval) => items.push({
      id: `approval-${approval.id}`,
      date: approval.decidedAt ?? approval.updatedAt ?? approval.createdAt,
      category: "approval",
      title: `${APPROVAL_LABELS[approval.approvalType] ?? approval.approvalType} onayı: ${approval.status}`,
      detail: approval.decisionNote ?? approval.note ?? undefined,
      actor: approval.decidedByUser?.fullName ?? approval.decidedByUser?.email,
    }));
    opportunityOffers.forEach((offer) => items.push({
      id: `offer-${offer.id}`,
      date: offer.date,
      category: "commercial",
      title: `${offer.quoteNo} · R${offer.revision} · ${offer.status}`,
      detail: formatMoney(offer.amount, offer.currency),
    }));
    opportunityPayments.forEach((payment) => items.push({
      id: `payment-${payment.id}`,
      date: payment.paidDate ?? payment.dueDate,
      category: "commercial",
      title: `${payment.paymentType === "received" ? "Tahsilat" : "Beklenen ödeme"} · ${payment.status}`,
      detail: formatMoney(payment.amount, payment.currency),
    }));
    opportunityDocuments.forEach((document) => items.push({
      id: `document-${document.id}`,
      date: document.uploadedAt,
      category: "file",
      title: document.fileName,
      detail: document.type,
    }));
    return items.sort((a, b) => timelineTime(b.date) - timelineTime(a.date));
  }, [detail, opportunityDocuments, opportunityOffers, opportunityPayments, simpleOpportunity]);

  useEffect(() => {
    if (!focusedActivityId) return;
    // Akış her zaman mount: derin bağlantının bir sekme açmasını beklemesi
    // gerekmiyor, yalnız düğüm boyanana kadar bir kare beklenir.
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`activity-${focusedActivityId}`);
      if (!target) return;
      focusWorkspaceTarget(target);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusedActivityId, timeline.length]);

  const operationReadiness = detail?.processReadiness;
  const nextOperationTarget = useMemo(
    () => operationReadiness?.targets
      .filter((target) => target.axis === "operation" && target.direction === "forward")
      .sort(
        (left, right) =>
          PIPELINE_STAGE_FLOW.indexOf(left.code as (typeof PIPELINE_STAGE_FLOW)[number]) -
          PIPELINE_STAGE_FLOW.indexOf(right.code as (typeof PIPELINE_STAGE_FLOW)[number]),
      )[0],
    [operationReadiness],
  );
  const overduePaymentCount = useMemo(
    () => opportunityPayments.filter((payment) => payment.status === "Overdue").length,
    [opportunityPayments],
  );
  const nextActivity = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return opportunityActivities
      .filter((activity) => !isManualTimelineComment(activity) && new Date(activity.date).getTime() >= todayStart.getTime())
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())[0];
  }, [opportunityActivities]);
  // Her render'da yeni nesne üretip `WorkspaceDecisionSummary`'ye geçiyordu.
  const decisionModel = useMemo(
    () => buildWorkspaceDecisionModel({
      salesCase: sc,
      ownerName: owner?.name,
      customerMissing: !sc.customerId || (companyQuery.isError && !customer),
      overduePaymentCount,
      nextOperationTarget,
      nextActivity,
      processReadinessKnown: !simpleOpportunity || Boolean(operationReadiness),
    }),
    [sc, owner?.name, companyQuery.isError, customer, overduePaymentCount, nextOperationTarget, nextActivity, simpleOpportunity, operationReadiness],
  );
  const terminal = Boolean(decisionModel.terminalLabel || operationReadiness?.closed);
  const canCreateQuote = !isLead && !terminal && Boolean(onCommercialAction) && canPerformCommercialAction?.("create_quote") !== false;

  // Dönüşüm komutu eksikler varken kaybolmaz; alanlar C aşamasında tamamlanır.
  const useLeadConversionAsPrimary = !terminal && canUpdate && isLead;
  const revealProcessActions = () => {
    // Açık başka bir aşamadan mevcut aşamanın işine güvenli dönüş.
    document.querySelector<HTMLButtonElement>('[data-opportunity-stage-header] [aria-current="step"][aria-pressed="false"]')?.click();
    focusWorkspaceTarget(document.getElementById("opportunity-process-actions"), { focus: false, block: "start" });
  };
  // Kapanmış kayıtta yapılacak bir iş yok: sahte bir birincil eylem (eskiden
  // "Kapanış kayıtlarını gör") kaldırılan Kayıtlar bölümüne gidiyordu.
  const decisionPrimaryAction = terminal || !canCreateActivity ? undefined : (
    <AddActivityDialog
      salesCaseId={sc.id}
      customerId={sc.customerId}
      contactId={resolvedContact.primaryContact?.id}
      trigger={<Button type="button" variant="outline" size="sm"><ActivityIcon className="size-4" /> Görüşme ekle</Button>}
    />
  );

  // Trello kart yorumları gibi: kalıcı olarak görünen yan panelde kronolojik
  // akış ve hemen üstünde hızlı giriş. Tek render yeri var — akış eskiden hem
  // ana sekmede hem de Kayıtlar'ın alt sekmesinde aynı `timeline` memo'sundan
  // iki kez çiziliyordu (aynı DOM id'leri iki kez, derin bağlantı yanlış
  // kopyayı buluyordu).
  const activityFeed = (
    <section
      aria-labelledby="workspace-activity-title"
      className="opportunity-conversation"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 id="workspace-activity-title" className="font-display text-base font-semibold text-foreground">
          Notlar ve görüşmeler
        </h3>
      </div>
      <div className="space-y-4 p-4">
        <OpportunityNoteComposer key={sc.id} opportunityId={sc.id} companyId={sc.customerId} contactId={resolvedContact.primaryContact?.id} />
        <div className="flex flex-wrap items-center gap-2">{decisionPrimaryAction}{taskActions}</div>
        {/* Sistem olayları yalnız sade fırsat akışında var ve tek kaynağı bu
            detay çağrısı; lead akışı store'dan besleniyor, beklemesi gereksiz. */}
        {simpleOpportunity && detailLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Geçmiş yükleniyor…
          </div>
        ) : (
          <UnifiedTimeline
            items={timeline.map((item) => ({ ...item, categoryLabel: item.categoryLabel ?? categoryLabel[item.category] }))}
            focusedId={focusedActivityId ? `activity-${focusedActivityId}` : null}
            formatDate={formatDate}
            emptyLabel={isLead ? "Bu fırsat için temas kaydı yok." : "Bu fırsat için henüz aktivite veya yorum yok."}
            renderActions={(item) => {
              const activity = item.sourceActivityId
                ? opportunityActivities.find((candidate) => candidate.id === item.sourceActivityId)
                : undefined;
              if (item.id.startsWith("qualification-") && item.categoryLabel === "LOST") {
                return <LostOpportunityDetailsDialog salesCase={sc} companyName={customer?.name} />;
              }
              if (!activity) return null;
              return (
                <div className="flex gap-1">
                  <ActivityDetailDialog activity={activity} showConvert={false} />
                  {hasPermission("activities.update") && onEditActivity && <Button type="button" variant="ghost" size="icon" className="size-11 sm:size-8" onClick={() => onEditActivity(item.sourceActivityId!)}><Pencil className="size-3.5" /><span className="sr-only">{item.title} aktivitesini düzenle</span></Button>}
                  {hasPermission("activities.delete") && onDeleteActivity && <Button type="button" variant="ghost" size="icon" className="size-11 text-red-700 sm:size-8" onClick={() => onDeleteActivity(item.sourceActivityId!)}><Trash2 className="size-3.5" /><span className="sr-only">{item.title} aktivitesini sil</span></Button>}
                </div>
              );
            }}
          />
        )}
      </div>

      {/* Süreç bildirimleri akışın içinde değil, altında kendi küçük alanında:
          salt okunur sistem olayları temasların arasına karışınca akış
          okunmaz hale geliyordu. Kapalı başlar — geçmişe bakmak isteyen açar. */}
      {processTimeline.length > 0 && (
        <details className="border-t border-border">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-semibold text-muted-foreground marker:content-none hover:text-foreground">
            Süreçler · {processTimeline.length}
          </summary>
          <div className="max-h-72 overflow-y-auto px-4 pb-4">
            <UnifiedTimeline
              items={processTimeline.map((item) => ({
                ...item,
                categoryLabel: item.categoryLabel ?? categoryLabel[item.category],
              }))}
              focusedId={null}
              formatDate={formatDate}
              emptyLabel="Süreç kaydı yok."
            />
          </div>
        </details>
      )}
    </section>
  );

  const nextCheck = operationReadiness?.checks.find((check) =>
    check.qualificationStage === operationReadiness.currentQualificationStage && !check.complete,
  );
  const nextWork = terminal ? decisionModel.terminalLabel || "Kapalı"
    : detailLoading ? "Yapılacaklar yükleniyor…"
    : detailError ? "Fırsat bilgileri alınamadı"
    : nextCheck?.label || (isLead ? decisionModel.nextAction : "Bu aşamanın işleri tamamlandı");
  const canOpenNextWork = !isLead && !terminal && !detailLoading && !detailError && nextCheck
    && onCommercialAction && canPerformCommercialAction?.(nextCheck.actionKey) !== false;
  const nextWorkAction = canOpenNextWork ? (
    <Button type="button" disabled={openingWork} onClick={async () => {
      if (openingWork) return;
      setOpeningWork(true);
      try { revealProcessActions(); await onCommercialAction?.(nextCheck.actionKey); }
      catch { toast.error("İşlem tamamlanamadı. Tekrar deneyin."); }
      finally { setOpeningWork(false); }
    }}>
      {openingWork ? "İşleniyor…" : ({ create_quote: "Teklif hazırla", approve_quote: "Teklifi onayla", approve_payment: "Ödemeyi onayla", approve_customs: "Gümrüğü onayla", approve_invoice: "Faturayı onayla", approve_installation: "Kurulumu onayla", approve_win: "Kazanımı onayla" } as Partial<Record<OpportunityProcessActionKey, string>>)[nextCheck.actionKey] || "İşi aç"}<ArrowUpRight className="size-4" />
    </Button>
  ) : null;

  return (
    <div className="opportunity-workspace">
      <section ref={decisionSummaryRef} tabIndex={-1} aria-labelledby="workspace-decision-title"
        data-testid="workspace-decision-summary" className="opportunity-next-work">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">{terminal ? "Fırsat durumu" : "Sıradaki iş"}</div>
            <h2 id="workspace-decision-title" className="mt-1 text-base font-semibold text-foreground">{nextWork}</h2>
            {!terminal && nextActivity && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="size-3.5" /> {nextActivity.title} · {formatDate(nextActivity.date, true)}</p>}
          </div>
          {nextWorkAction && <div data-opportunity-primary="true">{nextWorkAction}</div>}
        </div>
        {decisionModel.risks.filter((risk) => risk.key !== "process-blockers" || !nextCheck).length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-primary/10 pt-3 text-xs">
            {decisionModel.risks.filter((risk) => risk.key !== "process-blockers" || !nextCheck).map((risk) => (
              <li key={risk.key} className={`inline-flex items-center gap-1.5 ${risk.tone === "danger" ? "text-destructive" : "text-amber-800"}`}>
                <AlertTriangle className="size-3.5 shrink-0" /><span>{risk.label}{risk.detail ? ` · ${risk.detail}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {detailError && <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm text-destructive" role="alert"><span>Fırsat bilgileri alınamadı. Yeniden deneyin.</span><Button type="button" variant="outline" size="sm" onClick={() => void loadDetail()}><RefreshCw className="size-4" /> Tekrar dene</Button></div>}
      <div className="opportunity-workspace-columns">
        <div className="opportunity-main">
          {companyLinkingPanel}
          {sc.isLost && <LostOpportunityDetails salesCase={sc} companyName={customer?.name} />}
          <div className="opportunity-process">
            {renderProcessCenter ? renderProcessCenter({ detail, loading: detailLoading, reload: loadDetail, headerPortalId: stageHeaderPortalId }) : processCenter}
          </div>
          {isLead && <LeadQualificationPanel salesCase={sc} canUpdate={canUpdate} />}
          <section className="opportunity-information" aria-label="Fırsat bilgileri">
            <h3 className="text-base font-semibold">Fırsat bilgileri</h3>
            <OpportunitySummary salesCase={sc} canEdit={canUpdate} onSave={(description) => updateCase(sc.id, { description })} />
            <OpportunityMachines salesCase={sc} canEdit={canUpdate} onSave={(machines) => updateCase(sc.id, { machines })} />
            <DecisionRail salesCase={sc} ownerName={owner?.name} users={users} canUpdate={canUpdate}
              canAssignOwner={canAssignOwner} onOwnerChanged={loadDetail}
              contactPhone={resolvedContact.phone} contactEmail={resolvedContact.email} whatsappNumber={resolvedContact.whatsappNumber}
              contactName={resolvedContact.name} contactTitle={resolvedContact.primaryContact?.title || resolvedContact.primaryContact?.department}
              useLeadConversionAsPrimary={useLeadConversionAsPrimary} simpleMode inline />
          </section>
          <TaskRecordSection relation={{ opportunityId: sc.id, companyId: sc.customerId ?? null, label: sc.requestedProduct || "Fırsat" }} title="Takip görevleri" quiet />
          <WorkspaceSection id="opportunity-documents" title="Teklifler ve belgeler" count={caseOffers.length + caseDocuments.length}>
            <div className="divide-y divide-border/60">
              {caseOffers.map((offer) => (
                <button key={offer.id} type="button" className="opportunity-document-row w-full text-left" disabled={!onOpenOffer} onClick={() => onOpenOffer?.(offer.id)}>
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{offer.quoteNo} · Rev.{offer.revision}</span><span className="text-xs text-muted-foreground">{formatDate(offer.date)} · {formatMoney(offer.amount, offer.currency)}</span></span>
                  <span className="text-xs text-muted-foreground">{({ Draft: "Taslak", Sent: "Gönderildi", Approved: "Onaylandı", Rejected: "Reddedildi", Cancelled: "İptal", "Pending Approval": "Onay bekliyor", "Price Waiting": "Fiyat bekliyor", "Budget Waiting": "Bütçe bekliyor", "On Hold": "Beklemede", Postponed: "Ertelendi" })[offer.status]}</span><ArrowUpRight className="size-4 shrink-0" />
                </button>
              ))}
              {caseDocuments.map((document) => (
                <div key={document.id} className="py-1">
                  <button type="button" className="opportunity-document-row w-full text-left" disabled={document.source !== "commercial_record" && !document.fileId} title={document.source === "live_form" ? "Saha formu kaydı" : document.fileName} onClick={() => document.source === "commercial_record" ? setSelectedCommercialDocument(document) : setSelectedFileDocument(document)}>
                    <FileText className="size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{document.fileName}</span><span className="text-xs text-muted-foreground">{formatDate(document.uploadedAt)}{document.size ? ` · ${document.size}` : ""}</span></span>
                    {document.type === "Contract" && <span className="text-xs text-muted-foreground">{document.fileId ? "İmzalı nüsha" : "İmza bekliyor"}</span>}<ArrowUpRight className="size-4 shrink-0" />
                  </button>
                  {document.type === "Contract" && document.source === "commercial_record" && (
                    <div className="flex flex-wrap gap-2 pb-2 pl-8">
                      {hasPermission("contracts.update") && !document.fileId && <EditContractTermsDialog document={document} trigger={<Button type="button" variant="ghost" size="sm">Şartları düzenle</Button>} />}
                      {document.fileId ? <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedFileDocument(document)}>İmzalı PDF</Button> : hasPermission("files.create") && hasPermission("contracts.update") && <SignedContractUploadDialog document={document} salesCase={sc} trigger={<Button type="button" variant="outline" size="sm">İmzalı sözleşme yükle</Button>} />}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!caseOffers.length && !caseDocuments.length && <p className="py-2 text-sm text-muted-foreground">Henüz teklif veya belge yok.</p>}
            {/* Teklif bir kere verilip bitmiyor: revizyon, ikinci makine ya da
                yeni fiyat için aynı fırsatta tekrar teklif açılır. Süreç adımı
                ilk teklifte "tamamlandı" olduğu için giriş yalnız burada kalır. */}
            {canCreateQuote && (
              <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => void onCommercialAction?.("create_quote")}>
                <Plus className="size-4" /> {caseOffers.length ? "Yeni teklif oluştur" : "Teklif oluştur"}
              </Button>
            )}
          </WorkspaceSection>
          <WorkspaceSection title="Ödeme bilgileri" count={opportunityPayments.length}>
            {opportunityPayments.length ? <div className="divide-y divide-border/60">{opportunityPayments.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="font-medium tabular-nums">{formatMoney(payment.amount, payment.currency)}</span><span className="text-muted-foreground">{formatDate(payment.dueDate)}</span>
                <span className={payment.status === "Overdue" ? "text-destructive" : "text-muted-foreground"}>{({ Pending: "Bekliyor", Paid: "Ödendi", Overdue: "Gecikti", Cancelled: "İptal" })[payment.status]}</span>
              </div>
            ))}</div> : <p className="py-2 text-sm text-muted-foreground">Henüz ödeme kaydı yok.</p>}
          </WorkspaceSection>
          <WorkspaceSection title="Sevkiyat, teslim ve kurulum">
            <p className="mb-3 text-sm text-muted-foreground">Mevcut operasyon: <span className="font-medium text-foreground">{salesStageLabel(sc.stage)}</span></p>
            <div className="divide-y divide-border/60">
              {opportunityShipments.map((item) => <div key={item.id} className="flex items-center gap-3 py-3 text-sm"><Truck className="size-4 text-muted-foreground" /><span className="flex-1">Sevkiyat · {item.trackingNo || "Takip numarası yok"}</span><span>{item.status}</span></div>)}
              {opportunityDeliveries.map((item) => <div key={item.id} className="flex items-center gap-3 py-3 text-sm"><FileClock className="size-4 text-muted-foreground" /><span className="flex-1">Teslim · {formatDate(item.date)}</span><span>{item.status}</span></div>)}
              {opportunityInstallations.map((item) => <div key={item.id} className="flex items-center gap-3 py-3 text-sm"><Wrench className="size-4 text-muted-foreground" /><span className="flex-1">Kurulum · {item.technician || "Teknisyen atanmadı"}</span><span>{item.statusName}</span></div>)}
            </div>
            {!opportunityShipments.length && !opportunityDeliveries.length && !opportunityInstallations.length && <p className="text-sm text-muted-foreground">Henüz operasyon kaydı yok.</p>}
            <Button variant="link" className="mt-2 px-0" onClick={revealProcessActions}>İlgili işleri göster <ArrowUpRight className="size-4" /></Button>
          </WorkspaceSection>
          {otherActions && <WorkspaceSection title="Diğer kayıt işlemleri">{otherActions}</WorkspaceSection>}
        </div>
        <aside id="opportunity-conversation" className="opportunity-activity-rail" aria-label="Notlar ve görüşmeler">{activityFeed}</aside>
      </div>
      <DocumentDetailDialog
        doc={selectedCommercialDocument}
        onClose={() => setSelectedCommercialDocument(null)}
        onOpenFile={(document) => setSelectedFileDocument(document)}
      />
      <DocumentPreviewDialog doc={selectedFileDocument} onClose={() => setSelectedFileDocument(null)} />
    </div>
  );
}

/** Açıklama aynı yüzeyde düzenlenir; hata olursa taslak korunur. */
function OpportunitySummary({ salesCase, canEdit, onSave }: {
  salesCase: SalesCase; canEdit: boolean; onSave: (description: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSummary, setSavedSummary] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const summary = (savedSummary ?? salesCase.description ?? "").trim();
  useEffect(() => { setSavedSummary(null); }, [salesCase.description]);
  useEffect(() => { if (!saved) return; const timer = window.setTimeout(() => setSaved(false), 3000); return () => window.clearTimeout(timer); }, [saved]);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(draft.trim() || null);
      setSavedSummary(draft.trim()); setEditing(false); setSaved(true);
      requestAnimationFrame(() => editButtonRef.current?.focus());
    } catch { toast.error("Açıklama kaydedilemedi. Tekrar deneyin."); }
    finally { setSaving(false); }
  };
  return (
    <div className="group py-3" data-testid="opportunity-summary">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-muted-foreground">Fırsat açıklaması</h4>
        {canEdit && !editing && <Button ref={editButtonRef} variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" aria-label="Açıklamayı düzenle" onClick={() => { setDraft(summary); setEditing(true); setSaved(false); }}><Pencil className="size-3.5" /> Düzenle</Button>}
        <span role="status" className="text-xs text-muted-foreground">{saved ? "Kaydedildi" : ""}</span>
      </div>
      {editing ? <div className="space-y-2">
        <Textarea autoFocus onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); if (!saving) { setEditing(false); requestAnimationFrame(() => editButtonRef.current?.focus()); } } }} aria-label="Fırsat açıklaması" value={draft} maxLength={4000} disabled={saving} onChange={(event) => setDraft(event.target.value)} className="min-h-28 text-sm" />
        <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" disabled={saving} onClick={() => setEditing(false)}>Vazgeç</Button><Button variant="outline" size="sm" disabled={saving} onClick={() => void save()}>{saving ? "Kaydediliyor…" : "Açıklamayı kaydet"}</Button></div>
      </div> : <>
        <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${expanded ? "" : "line-clamp-2"} ${summary ? "text-foreground" : "text-muted-foreground"}`}>{summary || "Henüz açıklama eklenmedi."}</p>
        {summary && (summary.length > 160 || summary.includes("\n")) && <button type="button" className="mt-1 min-h-9 text-xs font-medium text-primary hover:underline" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Daha az göster" : "Devamını göster"}</button>}
      </>}
    </div>
  );
}

function WorkspaceSection({ title, count, id, children }: { title: string; count?: number; id?: string; children: ReactNode }) {
  return <details id={id} className="opportunity-section group/section">
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3 text-sm font-semibold marker:content-none">
      <ChevronDown className="size-4 text-muted-foreground transition-transform group-open/section:rotate-180 motion-reduce:transition-none" />
      <span>{title}</span>{count !== undefined && <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">{count}</span>}
    </summary>
    <div className="opportunity-section-content pb-4">{children}</div>
  </details>;
}

/**
 * Fırsattaki makineler. Fırsat firma bazlıdır: aynı kartta birden çok makine
 * konuşulabilir ve her biri ayrı teklife konu olabilir.
 */
function OpportunityMachines({
  salesCase,
  canEdit,
  onSave,
}: {
  salesCase: SalesCase;
  canEdit: boolean;
  onSave: (machines: { productModelId?: string; name: string; quantity: number }[]) => Promise<void>;
}) {
  const { products } = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ productModelId?: string; name: string; quantity: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMachines, setSavedMachines] = useState<typeof draft | null>(null);
  const machines = savedMachines ?? salesCase.machines ?? [];

  useEffect(() => { setSavedMachines(null); }, [salesCase.machines]);
  useEffect(() => { if (open) setDraft(machines.map((machine) => ({ ...machine }))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(
    () => products
      .filter((product) => (product.categoryCode ?? "").toLocaleUpperCase("en-US") === "TEZGAH")
      .map((product) => ({ value: product.id, label: [product.brand, product.model].filter(Boolean).join(" "), hint: product.type })),
    [products],
  );

  const addRow = (name: string, productModelId?: string) => {
    const clean = name.trim();
    if (!clean) return;
    setDraft((current) => current.some((item) => item.name.toLocaleLowerCase("tr-TR") === clean.toLocaleLowerCase("tr-TR"))
      ? current
      : [...current, { productModelId, name: clean, quantity: 1 }]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setSavedMachines(draft);
      toast.success("Makine listesi kaydedildi");
      setOpen(false);
    } catch (error: any) {
      toast.error("Makine listesi kaydedilemedi", { description: error?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  if (!machines.length && !canEdit) return null;

  return (
    <div className="border-b border-border pb-3" data-testid="opportunity-machines">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="ui-eyebrow flex items-center gap-1.5">
            <Wrench className="size-3.5" /> Makineler
          </div>
          {machines.length ? (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {machines.map((machine, index) => (
                <li key={`${machine.name}-${index}`}>
                  <Badge variant="outline" className="max-w-full whitespace-normal text-left">
                    {machine.name}
                    {machine.quantity > 1 ? ` × ${machine.quantity}` : ""}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Bu fırsata makine eklenmemiş.</p>
          )}
        </div>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1" onClick={() => setOpen(true)}>
            <Pencil className="size-3.5" /> {machines.length ? "Düzenle" : "Makine ekle"}
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Fırsattaki makineler</DialogTitle>
            <DialogDescription>Bir fırsatta birden çok makine olabilir; her biri ayrı teklife konu edilebilir.</DialogDescription>
          </DialogHeader>

          <Combobox
            ariaLabel="Makine ekle"
            value=""
            onChange={(value) => {
              const product = products.find((item) => item.id === value);
              if (product) addRow([product.brand, product.model].filter(Boolean).join(" ") || product.model || "", product.id);
            }}
            options={options}
            placeholder="Tezgah seçin veya yazın…"
            searchPlaceholder="Marka / model ara…"
            emptyText="Tezgah bulunamadı."
            onCreate={(label) => addRow(label)}
            createLabel={(query) => `"${query}" serbest makine olarak ekle`}
          />

          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {draft.length ? draft.map((machine, index) => (
              <li key={`${machine.name}-${index}`} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{machine.name}</span>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  aria-label={`${machine.name} adedi`}
                  className="h-7 w-16 text-xs"
                  value={String(machine.quantity)}
                  onChange={(event) => setDraft((current) => current.map((item, i) => (
                    i === index ? { ...item, quantity: Math.max(1, Number(event.target.value) || 1) } : item
                  )))}
                />
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDraft((current) => current.filter((_, i) => i !== index))}>
                  Kaldır
                </Button>
              </li>
            )) : <li className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">Henüz makine eklenmedi.</li>}
          </ul>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Kaydediliyor…" : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
