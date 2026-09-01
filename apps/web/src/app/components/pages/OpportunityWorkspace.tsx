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
  ChevronDown,
  FileClock,
  Loader2,
  RefreshCw,
  Trash2,
  Truck,
  Wrench,
  Pencil,
  Eye,
  FileSignature,
  NotebookText,
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
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Textarea } from "../ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { NextActionDialog, actionDateLabel, isActionOverdue } from "../shared/NextActionDialog";
import { DecisionRail, LeadQualificationPanel } from "./LeadWorkspaceControls";
import { TaskRecordSection } from "./tasks/TaskRecordSection";
import {
  HealthStrip,
  RecordWorkspaceShell,
  UnifiedTimeline,
  WorkspaceDecisionSummary,
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
import { CommercialDocumentRail } from "../shared/CommercialDocumentRail";
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

/**
 * Fırsat / lead çalışma alanı.
 *
 * Yüzey radikal biçimde sadeleşti: Özet, Ticari ve Kayıtlar bölümleri (ve
 * Kayıtlar'ın dört alt sekmesi: Aktiviteler, Dosyalar, Onaylar, Değişiklik
 * günlüğü) tamamen kaldırıldı. Geriye her mod için tek bir gövde kaldı —
 * lead'de nitelendirme, fırsatta süreç — bu yüzden sekme çubuğu da kalktı:
 * tek maddeli bir sekme çubuğu ve tek seçenekli mobil "Bölüm" listesi ölü
 * kontroldür. Aktivite akışı kalıcı olarak görünen yan panele taşındı.
 */
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
  processReadinessKnown = true,
}: {
  salesCase: SalesCase;
  ownerName?: string;
  customerMissing: boolean;
  overduePaymentCount: number;
  nextOperationTarget?: OpportunityProcessReadiness["targets"][number];
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
    !terminalLabel && health?.actionOverdue ? { key: "action-overdue", label: "Aksiyon gecikmiş", detail: actionDateLabel(salesCase.nextActionAt), tone: "danger" as const, priority: 100 } : null,
    !terminalLabel && (health?.actionMissing || !salesCase.nextAction) ? { key: "action-missing", label: "Aksiyon planlanmamış", detail: "Takip işi ve tarihi belirleyin", tone: "warning" as const, priority: 95 } : null,
    !terminalLabel && health?.leadSlaBreached ? { key: "lead-sla", label: "İlk temas SLA ihlali", detail: `${health.leadStatusAgeHours ?? 0} saat bekledi`, tone: "danger" as const, priority: 90 } : null,
    !terminalLabel && health?.rotting ? { key: "stage-age", label: "Aşama yaşlanıyor", detail: `${health.stageAgeDays ?? 0} gün / ${health.stageAgeLimitDays ?? "—"} gün`, tone: "warning" as const, priority: 80 } : null,
    !terminalLabel && overduePaymentCount > 0 ? { key: "payment-overdue", label: "Gecikmiş ödeme", detail: `${overduePaymentCount} ödeme kaydı`, tone: "danger" as const, priority: 75 } : null,
    !terminalLabel && (nextOperationTarget?.blockers.length ?? 0) > 0 ? { key: "process-blockers", label: "Süreç geçişi engelli", detail: `${nextOperationTarget?.blockers.length ?? 0} backend kontrolü`, tone: "warning" as const, priority: 70 } : null,
    !terminalLabel && customerMissing ? { key: "company-missing", label: "Firma eksik", detail: "Kayıt bir firmaya bağlanmalı", tone: "warning" as const, priority: 60 } : null,
    !terminalLabel && !ownerName ? { key: "owner-missing", label: "Sorumlu atanmamış", detail: "Kayıt sahipsiz havuzda", tone: "warning" as const, priority: 50 } : null,
  ].filter((risk): risk is NonNullable<typeof risk> => Boolean(risk))
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 3)
    .map(({ priority: _priority, ...risk }) => risk);

  const qualificationNext = salesCase.qualificationReadiness?.nextStage;

  return {
    nextAction: terminalLabel ? "Kapanış durumunu ve kayıtları inceleyin" : salesCase.nextAction || "Aksiyon planlanmadı",
    nextActionDate: terminalLabel ? formatDate(salesCase.closedAt, true) : actionDateLabel(salesCase.nextActionAt),
    nextActionOverdue: !terminalLabel && Boolean(health?.actionOverdue || isActionOverdue(salesCase.nextActionAt)),
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
  mobilePortalId,
  focusDecisionOnMount = false,
  onEditActivity,
  onDeleteActivity,
  taskActions,
  otherActions,
  simpleMode = false,
}: {
  salesCase: SalesCase;
  processCenter: ReactNode;
  renderProcessCenter?: (context: { detail: OpportunityDetail | null; loading: boolean; reload: () => Promise<void> }) => ReactNode;
  /** Aktif satış alanının görev listesi; süreç haritasından bağımsız gösterilir. */
  companyLinkingPanel?: ReactNode;
  onCommercialAction?: (actionKey: OpportunityProcessActionKey) => void;
  canPerformCommercialAction?: (actionKey: OpportunityProcessActionKey) => boolean;
  onOpenOffer?: (offerId: string) => void;
  mobilePortalId?: string;
  focusDecisionOnMount?: boolean;
  onEditActivity?: (activityId: string) => void;
  onDeleteActivity?: (activityId: string) => void;
  /** Fırsat görevleri kartında, görev oluşturmanın yanında gösterilen eylemler. */
  taskActions?: ReactNode;
  otherActions?: ReactNode;
  simpleMode?: boolean;
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
  const canAssignOwner = canUpdate && (hasRole("sales") || hasRole("super_admin"));
  const isLead = sc.qualificationStage === "lead";
  const simpleOpportunity = simpleMode && !isLead;
  const [detailResource, setDetailResource] = useState<OpportunityDetailResource>(() => ({
    caseId: sc.id,
    status: "idle",
    data: null,
    error: null,
  }));
  const [focusedActivityId, setFocusedActivityId] = useState<string | null>(null);
  const [selectedCommercialDocument, setSelectedCommercialDocument] = useState<DocumentItem | null>(null);
  const [selectedFileDocument, setSelectedFileDocument] = useState<DocumentItem | null>(null);
  const [operationsExpanded, setOperationsExpanded] = useState(false);
  const decisionSummaryRef = useRef<HTMLElement>(null);
  const detailRequestRef = useRef(0);
  const detail = detailResource.caseId === sc.id ? detailResource.data : null;
  const caseOffers = useMemo(() => offers.filter((item) => item.salesCaseId === sc.id), [offers, sc.id]);
  const caseDocuments = useMemo(() => documents.filter((item) => item.salesCaseId === sc.id), [documents, sc.id]);
  const contractDocuments = useMemo(
    () => caseDocuments.filter((item) => item.type === "Contract" && item.source === "commercial_record"),
    [caseDocuments],
  );
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
  const hasFieldRecords =
    opportunityShipments.length > 0 || opportunityDeliveries.length > 0 || opportunityInstallations.length > 0;

  // Kapak, gösterecek gerçek bir kayıt varken açılır. Sevkiyat/teslim/kurulum
  // hiç başlamamışken üç boş kart ekranın üçte birini kaplayıp hiçbir şey
  // söylemiyordu; durum satırı zaten "Henüz başlamadı" yazıyor.
  useEffect(() => {
    setOperationsExpanded(hasFieldRecords);
  }, [sc.id, hasFieldRecords]);

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
  // Her render'da yeni nesne üretip `WorkspaceDecisionSummary`'ye geçiyordu.
  const decisionModel = useMemo(
    () => buildWorkspaceDecisionModel({
      salesCase: sc,
      ownerName: owner?.name,
      customerMissing: !sc.customerId || (companyQuery.isError && !customer),
      overduePaymentCount,
      nextOperationTarget,
      processReadinessKnown: !simpleOpportunity || Boolean(operationReadiness),
    }),
    [sc, owner?.name, companyQuery.isError, customer, overduePaymentCount, nextOperationTarget, simpleOpportunity, operationReadiness],
  );
  const terminal = Boolean(decisionModel.terminalLabel);

  const processBlocked = Boolean(nextOperationTarget?.blockers.length);
  // Dönüşüm komutu eksikler varken kaybolmaz; alanlar C aşamasında tamamlanır.
  const useLeadConversionAsPrimary = !terminal && canUpdate && isLead;
  const revealProcessActions = () => {
    // Görev listesi her zaman mount; kullanıcıyı listeye götürmek yeterli.
    focusWorkspaceTarget(document.getElementById("opportunity-process-actions"), { focus: false, block: "start" });
  };
  // Kapanmış kayıtta yapılacak bir iş yok: sahte bir birincil eylem (eskiden
  // "Kapanış kayıtlarını gör") kaldırılan Kayıtlar bölümüne gidiyordu.
  const decisionPrimaryAction = terminal || !canUpdate ? undefined
    : isLead || sc.qualificationReadiness?.health?.actionMissing || decisionModel.nextActionOverdue ? (
      <NextActionDialog
        salesCase={sc}
        onSave={(patch) => updateCase(sc.id, patch)}
        trigger={(
          <Button type="button">
            {decisionModel.nextActionOverdue
              ? "Aksiyonu yeniden planla"
              : sc.nextAction
                ? "Aksiyonu düzenle"
                : "Aksiyon planla"}
          </Button>
        )}
      />
    ) : processBlocked ? (
      <Button type="button" onClick={revealProcessActions}>Engelleri çöz</Button>
    ) : (
      <NextActionDialog
        salesCase={sc}
        onSave={(patch) => updateCase(sc.id, patch)}
        trigger={<Button type="button">Aksiyonu düzenle</Button>}
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
      className="overflow-hidden rounded-[var(--surface-radius)] border border-border bg-card"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 id="workspace-activity-title" className="font-display text-base font-semibold text-foreground">
          {isLead ? "Temas akışı" : "Aktivite akışı"}
        </h3>
      </div>
      <div className="space-y-3 p-4">
        {hasPermission("activities.create") && (
          <AddActivityDialog
            salesCaseId={sc.id}
            customerId={sc.customerId}
            contactId={resolvedContact.primaryContact?.id}
            /* Sade fırsat akışı da tam aktivite girişi alır: tür seçimi (ziyaret,
               arama, toplantı...) artık burada da açık, yalnız yorum değil. */
            trigger={
              <Button type="button" variant="outline" className="h-11 w-full justify-start gap-2 text-muted-foreground">
                <ActivityIcon className="size-4" /> {isLead ? "Aktivite ekle" : "Aktivite gir…"}
              </Button>
            }
          />
        )}
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

  const operationBlockers = nextOperationTarget?.blockers ?? [];
  const fieldStages = [
    { key: "shipment", label: "Sevkiyat", icon: Truck, status: opportunityShipments[0]?.status },
    { key: "delivery", label: "Teslim", icon: FileClock, status: opportunityDeliveries[0]?.status },
    { key: "installation", label: "Kurulum", icon: Wrench, status: opportunityInstallations[0]?.statusName },
  ];

  const taskSection = (
    <TaskRecordSection
      relation={{ opportunityId: sc.id, companyId: sc.customerId ?? null, label: sc.requestedProduct || "Fırsat" }}
      title={isLead ? "Lead Görevleri" : "Fırsat Görevleri"}
      headerActions={taskActions}
    />
  );

  /*
    Ticari belge zinciri ve üretilmiş sözleşmeler tek bölüm. Sözleşme listesi
    zincirin altındaki katlanır alana indi: zincirin "Sözleşme" adımı durumu
    zaten söylüyor, liste ise yalnız imzalı nüsha yüklerken ya da şartları
    düzenlerken gerekiyor. Düğmelerin hiçbiri kaldırılmadı, bir tık arkasında.
  */
  const documentsSection = (
    <div className="space-y-2">
      <CommercialDocumentRail
        offers={caseOffers}
        documents={caseDocuments}
        onOpenOffer={(offer) => onOpenOffer?.(offer.id)}
        onOpenDocument={setSelectedCommercialDocument}
        showStepActions={false}
      />
      {contractDocuments.length > 0 && (
        <details className="overflow-hidden rounded-xl border border-primary/15 bg-card">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-semibold text-foreground marker:content-none hover:bg-muted/40">
            <FileSignature className="size-4 text-primary" /> Sözleşmeler · {contractDocuments.length}
          </summary>
          <div className="space-y-2 border-t border-border/60 p-4">
            {contractDocuments.map((document) => (
              <div key={document.id} className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2.5 sm:flex-row sm:items-center">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedCommercialDocument(document)}>
                  <div className="truncate text-sm font-medium">{document.fileName}</div>
                  <div className="text-[10px] text-muted-foreground">{document.fileId ? "İmzalı nüsha bağlı" : "Üretilmiş sözleşme"}</div>
                </button>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => setSelectedCommercialDocument(document)}>
                    <Eye className="size-3.5" /> Görüntüle
                  </Button>
                  {hasPermission("contracts.update") && !document.fileId && (
                    <EditContractTermsDialog document={document} trigger={<Button type="button" variant="outline" size="sm" className="h-8">Şartları Düzenle</Button>} />
                  )}
                  {document.fileId ? (
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setSelectedFileDocument(document)}>İmzalı PDF</Button>
                  ) : hasPermission("files.create") && hasPermission("contracts.update") ? (
                    <SignedContractUploadDialog document={document} salesCase={sc} trigger={<Button type="button" size="sm" className="h-8">İmzalı Sözleşme Yükle</Button>} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );

  /*
    Operasyon ekseni artık TEK bölüm. Öncesinde aynı eksen dört ayrı yüzeye
    dağılmıştı: başlık + açıklama paragrafı, yalnız engel varken çizilen ayrı
    bir "Geçiş engelleri" kartı, sade modda üç durumluk özet satırı ve tam
    modda çoğu kartta boş duran üç kayıt kartı. Hepsi tek kapağın altında:
    üç aşamanın durumu her zaman görünür, engeller ve kayıt ayrıntıları
    (takip no, ETA, imza, teknisyen) katlanır alanda. Hiçbir bilgi ya da
    düğme kaldırılmadı; iki mod da aynı yüzeyi kullanıyor.
  */
  const operationsSection = (
    <section
      aria-labelledby="opportunity-operations-title"
      className="overflow-hidden rounded-[var(--surface-radius)] border border-border bg-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 id="opportunity-operations-title" className="font-display text-base font-semibold text-foreground">Operasyon aşaması</h3>
          <p className="text-xs text-muted-foreground">
            Sevkiyat, teslim ve kurulum akışı. Satış alanı (C/B/A/A+) yukarıdaki kutuda izlenir.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 gap-1 text-xs"
          aria-expanded={operationsExpanded}
          aria-controls="opportunity-operations-detail"
          onClick={() => setOperationsExpanded((value) => !value)}
        >
          {operationsExpanded ? "Ayrıntıyı gizle" : "Ayrıntıyı göster"}
          <ChevronDown className={`size-4 transition-transform ${operationsExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </Button>
      </div>
      <div className="space-y-3 p-4">
        {/* Üç aşamanın durumu kapak açılmadan okunur: "nerede kaldık" sorusu
            tıklama gerektirmez. Kutular görev listesine götürür. */}
        <div className="grid gap-2 sm:grid-cols-3" aria-label="Saha operasyonu özeti">
          {fieldStages.map(({ key, label, icon: Icon, status }) => (
            <button
              key={key}
              type="button"
              className="min-h-16 rounded-[var(--surface-radius)] border border-border bg-muted/30 p-3 text-left transition hover:border-primary/40 hover:bg-muted/60"
              onClick={revealProcessActions}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"><Icon className="size-4" /> {label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{status ?? "Henüz başlamadı"}</span>
            </button>
          ))}
        </div>
        {/* Engeller kendi kartını kaybetti ama kendisi kaybolmadı: ait olduğu
            eksenin içinde, tıklanabilir hâlde duruyor. */}
        {(operationBlockers.length > 0 || !operationReadiness) && (
          <div className="border-t border-border/60 pt-3">
            <div className="text-xs font-semibold text-foreground">Geçiş engelleri</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {operationBlockers.slice(0, 6).map((blocker) => {
                const canOpenBlocker = Boolean(onCommercialAction) && canPerformCommercialAction?.(blocker.actionKey) !== false;
                return canOpenBlocker ? (
                  // Engel eylemini tüketen görev listesi sayfada duruyor; kullanıcı
                  // isteği tetikledikten sonra listeye kaydırılır.
                  <Button key={blocker.key} type="button" variant="outline" size="sm" className="min-h-9 border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100" onClick={() => { revealProcessActions(); onCommercialAction?.(blocker.actionKey); }}>
                    {blocker.label}
                  </Button>
                ) : (
                  <Badge key={blocker.key} variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                    {blocker.label}
                  </Badge>
                );
              })}
              {!operationReadiness && (
                <span className="inline-flex items-center gap-1.5 text-sm text-amber-800"><AlertTriangle className="size-4" /> Hazırlık bilgisi alınamadı; geçiş hazır varsayılmıyor.</span>
              )}
            </div>
          </div>
        )}
        {operationsExpanded && (
          <div id="opportunity-operations-detail" className="grid gap-3 border-t border-border/60 pt-3 lg:grid-cols-3">
            <Card><CardHeader className="pb-3"><CardTitle className="inline-flex items-center gap-2 text-sm"><Truck className="size-4" /> Sevkiyat</CardTitle></CardHeader><CardContent className="space-y-2">{opportunityShipments.map((shipment) => <div key={shipment.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-medium">{shipment.trackingNo || "Takip numarası yok"}</div><div className="mt-1 text-xs text-muted-foreground">{shipment.status} · ETA {formatDate(shipment.eta)}</div></div>)}{opportunityShipments.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><div className="text-sm text-muted-foreground">Sevkiyat yok.</div><Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 sm:min-h-8" onClick={revealProcessActions}>Sevkiyat oluştur</Button></div>}</CardContent></Card>
            <Card><CardHeader className="pb-3"><CardTitle className="inline-flex items-center gap-2 text-sm"><FileClock className="size-4" /> Teslim</CardTitle></CardHeader><CardContent className="space-y-2">{opportunityDeliveries.map((delivery) => <div key={delivery.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-medium">{delivery.status}</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(delivery.date)} · {delivery.signedBy || "İmza bekliyor"}</div></div>)}{opportunityDeliveries.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><div className="text-sm text-muted-foreground">Teslim kaydı yok.</div><Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 sm:min-h-8" onClick={revealProcessActions}>Teslim kaydı oluştur</Button></div>}</CardContent></Card>
            <Card><CardHeader className="pb-3"><CardTitle className="inline-flex items-center gap-2 text-sm"><Wrench className="size-4" /> Kurulum</CardTitle></CardHeader><CardContent className="space-y-2">{opportunityInstallations.map((installation) => <div key={installation.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-medium">{installation.statusName}</div><div className="mt-1 text-xs text-muted-foreground">{installation.technician || "Teknisyen atanmadı"} · {formatDate(installation.scheduledDate)}</div></div>)}{opportunityInstallations.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><div className="text-sm text-muted-foreground">Kurulum kaydı yok.</div><Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 sm:min-h-8" onClick={revealProcessActions}>Kurulum oluştur</Button></div>}</CardContent></Card>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="crm-page">
      {/* Başlığın altındaki dekoratif metin ("Ortak fırsat görünümü") yerine
          kartın kendi özeti duruyor: Trello'dan gelen kart açıklaması dahil
          hiçbir yerde görünmüyordu. */}
      <OpportunitySummary
        salesCase={sc}
        canEdit={canUpdate}
        onSave={(description) => updateCase(sc.id, { description })}
      />

      {/* Alan rayı satış alanı kutusunun içine taşındı ve orada tıklanabilir
          (alanlar arası gezinme). Buradaki dekoratif kopyası aynı bilgiyi
          ikinci kez, üstelik tıklanamaz hâlde gösteriyordu. */}
      <WorkspaceDecisionSummary
        ref={decisionSummaryRef}
        model={decisionModel}
        primaryAction={decisionPrimaryAction}
      />
      {sc.isLost && <LostOpportunityDetails salesCase={sc} companyName={customer?.name} />}
      {detailLoading && <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status" aria-live="polite"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Kayıt kontrolleri güncelleniyor…</div>}
      {detailError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--surface-radius)] border border-destructive/20 bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert"><span>{detailError}</span><Button type="button" variant="outline" size="sm" className="min-h-11 bg-card sm:min-h-8" onClick={() => void loadDetail()}><RefreshCw className="size-4" /> Tekrar dene</Button></div>}

      <RecordWorkspaceShell rail={<DecisionRail
        salesCase={sc}
        ownerName={owner?.name}
        users={users}
        canUpdate={canUpdate}
        canAssignOwner={canAssignOwner}
        onOwnerChanged={loadDetail}
        mobilePortalId={mobilePortalId}
        contactPhone={resolvedContact.phone}
        contactEmail={resolvedContact.email}
        whatsappNumber={resolvedContact.whatsappNumber}
        contactName={resolvedContact.name}
        contactTitle={resolvedContact.primaryContact?.title || resolvedContact.primaryContact?.department}
        otherActions={otherActions}
        primaryAction={useLeadConversionAsPrimary ? undefined : decisionPrimaryAction}
        useLeadConversionAsPrimary={useLeadConversionAsPrimary}
        simpleMode={simpleOpportunity}
        activityFeed={activityFeed}
      />}>
        <div className="space-y-4">
          {/* Firma bağlama uyarısı kaldırılan Özet bölümünün içindeydi; teklif
              öncesi zorunlu bir adım olduğu için gövdenin tepesine alındı. */}
          {companyLinkingPanel}
          {isLead ? (
            <>
              {/* Görevler kartın gövdesinde: personel lead üzerinde çalışırken
                  görevi buradan açar, görür ve kapatır — ayrı ekrana gitmeden. */}
              {taskSection}
              {/* "Sonraki aksiyon" sütunu kaldırıldı: hemen üstteki karar kartı
                  aynı metni, aynı tarihi ve sorumluyu zaten gösteriyor; gecikme
                  ise ayrıca risk rozetinde yazıyordu. Aynı cümle ekranda üç
                  kez görünüyordu. Kalan iki ölçü lead'e özgü ve başka yerde yok. */}
              <HealthStrip items={[
                {
                  label: "Temas denemesi",
                  value: String(sc.qualificationReadiness?.health?.contactAttemptCount ?? 0),
                  hint: "Sonuç kaydıyla güncellenir",
                },
                {
                  label: "İlk temas",
                  value: formatDate(sc.qualificationReadiness?.health?.firstContactAt, true),
                  hint: "İlk temas hızı",
                  tone: sc.qualificationReadiness?.health?.firstContactAt ? "good" : "neutral",
                },
              ]} />
              <div id="opportunity-qualification" className="scroll-mt-24">
                <LeadQualificationPanel salesCase={sc} canUpdate={canUpdate} />
              </div>
              {/* Lead'de belge zinciri normalde dört boş adımdan ibaret; yalnız
                  gerçekten bir teklif/belge varsa çizilir. */}
              {(caseOffers.length > 0 || caseDocuments.length > 0) && documentsSection}
            </>
          ) : (
            <div className="space-y-4">
              {/* Satış alanı kutusu gövdenin en üstünde: alan görevleri ve TEK
                  ilerletme düğmesi onun içinde, kartın asıl işi bu. Kutu hiçbir
                  zaman bir kapağın arkasında değildir. */}
              {renderProcessCenter ? renderProcessCenter({ detail, loading: detailLoading, reload: loadDetail }) : processCenter}
              {taskSection}
              {documentsSection}
              {operationsSection}
            </div>
          )}
        </div>
      </RecordWorkspaceShell>
      <DocumentDetailDialog
        doc={selectedCommercialDocument}
        onClose={() => setSelectedCommercialDocument(null)}
        onOpenFile={(document) => setSelectedFileDocument(document)}
      />
      <DocumentPreviewDialog doc={selectedFileDocument} onClose={() => setSelectedFileDocument(null)} />
    </div>
  );
}

/**
 * Kartın özeti: fırsatın kendi açıklaması (Trello aktarımında "kart
 * açıklaması" buraya yazılıyor). Salt okunur gösterilir, yetkisi olan
 * pop-up'ta düzenler — ekranın üstünde uzun metin akıtmadan.
 */
function OpportunitySummary({
  salesCase,
  canEdit,
  onSave,
}: {
  salesCase: SalesCase;
  canEdit: boolean;
  onSave: (description: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // Trello'dan aktarılan açıklamalar birkaç paragraf olabiliyor ve kartı
  // açar açmaz ekranın tamamını dolduruyordu. İlk iki satır her zaman
  // görünür, gerisi tek tıkla açılır — metin kısaltılmıyor, katlanıyor.
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  // Kaydedilen değer, store tazelenene kadar prop'taki eski metni gölgeler.
  const [savedSummary, setSavedSummary] = useState<string | null>(null);
  const summary = (savedSummary ?? salesCase.description ?? "").trim();
  const isLongSummary = summary.length > 140 || summary.includes("\n");

  useEffect(() => { setSavedSummary(null); }, [salesCase.description]);
  useEffect(() => { setSummaryExpanded(false); }, [salesCase.id]);
  useEffect(() => { if (open) setDraft(summary); }, [open, summary]);

  const save = async () => {
    setSaving(true);
    try {
      const next = draft.trim();
      await onSave(next || null);
      setSavedSummary(next);
      toast.success("Özet kaydedildi");
      setOpen(false);
    } catch (error: any) {
      toast.error("Özet kaydedilemedi", { description: error?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  if (!summary && !canEdit) return null;

  return (
    <div className="border-b border-border pb-3" data-testid="opportunity-summary">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="ui-eyebrow flex items-center gap-1.5">
            <NotebookText className="size-3.5" /> Özet
          </div>
          <p className={`mt-1 whitespace-pre-wrap text-sm ${summary ? "text-foreground" : "text-muted-foreground"} ${summaryExpanded ? "" : "line-clamp-2"}`}>
            {summary || "Bu fırsat için özet girilmemiş."}
          </p>
          {isLongSummary && (
            <button
              type="button"
              className="mt-1 text-xs font-medium text-primary hover:underline"
              aria-expanded={summaryExpanded}
              onClick={() => setSummaryExpanded((value) => !value)}
            >
              {summaryExpanded ? "Daha az göster" : "Tamamını göster"}
            </button>
          )}
        </div>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1" onClick={() => setOpen(true)}>
            <Pencil className="size-3.5" /> {summary ? "Düzenle" : "Özet ekle"}
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Fırsat özeti</DialogTitle>
            <DialogDescription>{salesCase.requestedModel || salesCase.requestedProduct || "Fırsat kartı"}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 4000))}
            placeholder="Talebin özeti, müşterinin beklentisi, kritik notlar…"
            className="min-h-40 resize-y"
            maxLength={4000}
          />
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <span className="text-[10px] tabular-nums text-muted-foreground">{draft.length}/4000</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
              <Button type="button" disabled={saving} onClick={() => void save()}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
