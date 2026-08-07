import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  PIPELINE_STAGE_FLOW,
  type OpportunityProcessActionKey,
  type OpportunityProcessReadiness,
} from "@haksan/shared";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Check,
  ChevronRight,
  FileClock,
  Loader2,
  RefreshCw,
  Trash2,
  Truck,
  Wrench,
  Pencil,
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
import { NextActionDialog, actionDateLabel, isActionOverdue } from "../shared/NextActionDialog";
import { DecisionRail, LeadQualificationPanel } from "./LeadWorkspaceControls";
import {
  HealthStrip,
  RecordWorkspaceShell,
  UnifiedTimeline,
  WorkspaceDecisionSummary,
  type WorkspaceDecisionModel,
} from "../shared/RecordWorkspace";
import { isManualTimelineComment, isOpportunityTimelineActivity } from "../../lib/opportunityTimeline";

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
    !terminalLabel && health?.leadSlaBreached ? { key: "lead-sla", label: "Lead SLA ihlali", detail: `${health.leadStatusAgeHours ?? 0} saat bekledi`, tone: "danger" as const, priority: 90 } : null,
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

const SIMPLE_QUALIFICATION_STEPS = ["c", "b", "a", "a_plus", "win"] as const;

function CompactQualificationRail({ current }: { current: SalesCase["qualificationStage"] }) {
  const currentIndex = SIMPLE_QUALIFICATION_STEPS.indexOf(current as (typeof SIMPLE_QUALIFICATION_STEPS)[number]);
  const terminalLost = current === "lost";
  const completedCount = terminalLost || currentIndex < 0 ? 0 : currentIndex;

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4"
      aria-label={terminalLost
        ? "Fırsat nitelik süreci: fırsat kaybedildi"
        : `Fırsat nitelik süreci: ${SIMPLE_QUALIFICATION_STEPS.length} aşamadan ${completedCount} tanesi tamamlandı`}
    >
      <div className="flex items-center gap-1" role="list">
        {SIMPLE_QUALIFICATION_STEPS.map((stage, index) => {
          const complete = !terminalLost && currentIndex > index;
          const active = !terminalLost && currentIndex === index;
          return (
            <div key={stage} className="flex min-w-0 flex-1 items-center gap-1" role="listitem">
              <div
                className={[
                  "flex min-h-9 min-w-9 flex-1 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition-colors",
                  active ? "border-[#163b75] bg-[#163b75] text-white" : "",
                  complete ? "border-blue-200 bg-blue-50 text-[#163b75]" : "",
                  !active && !complete ? "border-slate-200 bg-slate-50 text-slate-500" : "",
                ].join(" ")}
                aria-current={active ? "step" : undefined}
              >
                {complete && <Check className="mr-1 size-3.5" aria-hidden="true" />}
                {QUALIFICATION_STAGE_LABELS[stage]}
                {/* İkon aria-hidden olduğu için durum ekran okuyucuya ayrıca
                    yazılmalı; aksi halde yalnız düz aşama dizisi duyuluyor. */}
                <span className="sr-only">
                  {active ? " — mevcut aşama" : complete ? " — tamamlandı" : " — bekliyor"}
                </span>
              </div>
              {index < SIMPLE_QUALIFICATION_STEPS.length - 1 && (
                <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
      {terminalLost && (
        <div className="mt-2 text-xs font-medium text-red-700">Bu fırsat LOST durumunda.</div>
      )}
    </section>
  );
}

export function OpportunityWorkspace({
  salesCase: sc,
  processCenter,
  renderProcessCenter,
  companyLinkingPanel,
  onCommercialAction,
  canPerformCommercialAction,
  mobilePortalId,
  focusDecisionOnMount = false,
  onEditActivity,
  onDeleteActivity,
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
  mobilePortalId?: string;
  focusDecisionOnMount?: boolean;
  onEditActivity?: (activityId: string) => void;
  onDeleteActivity?: (activityId: string) => void;
  otherActions?: ReactNode;
  simpleMode?: boolean;
}) {
  const {
    customers,
    contacts,
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
  const { hasPermission, hasRole } = useAuth();
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
  const [operationsExpanded, setOperationsExpanded] = useState(() => !simpleOpportunity);
  const decisionSummaryRef = useRef<HTMLElement>(null);
  const detailRequestRef = useRef(0);
  const detail = detailResource.caseId === sc.id ? detailResource.data : null;
  const detailLoading = detailResource.caseId !== sc.id || detailResource.status === "idle" || detailResource.status === "loading";
  const detailError = detailResource.caseId === sc.id ? detailResource.error : null;

  useEffect(() => {
    if (!focusDecisionOnMount) return;
    const timer = window.setTimeout(() => focusWorkspaceTarget(decisionSummaryRef.current, { scroll: false }), 0);
    return () => window.clearTimeout(timer);
  }, [focusDecisionOnMount, sc.id]);

  useEffect(() => {
    setOperationsExpanded(!simpleOpportunity);
  }, [sc.id, simpleOpportunity]);

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

  const customer = customers.find((item) => item.id === sc.customerId);
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
  const resolvedContact = useMemo(() => resolveSalesContact({ salesCase: sc, customer, contacts }), [sc, customer, contacts]);

  // Aktivite akışı yalnız kullanıcının girdiği kayıtları gösterir: temaslar ve
  // yorumlar. Sistem olayları (aşama geçişi, nitelik, onay, teklif, ödeme,
  // dosya) aşağıdaki ayrı "Süreçler" alanında — tek akışta karıştıklarında
  // temaslar sistem gürültüsünün arasında kayboluyordu.
  const timeline = useMemo<TimelineItem[]>(() => {
    const visibleActivities = isLead
      ? opportunityActivities
      : opportunityActivities.filter(isOpportunityTimelineActivity);
    return visibleActivities
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
      })
      .sort((a, b) => timelineTime(b.date) - timelineTime(a.date));
  }, [isLead, opportunityActivities, users]);

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
    (detail?.qualificationHistory ?? []).forEach((history) => items.push({
      id: `qualification-${history.id}`,
      date: history.createdAt,
      category: "process",
      title: `Nitelik: ${QUALIFICATION_STAGE_LABELS[history.toStage as keyof typeof QUALIFICATION_STAGE_LABELS] ?? history.toStage}`,
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
      customerMissing: !customer,
      overduePaymentCount,
      nextOperationTarget,
      processReadinessKnown: !simpleOpportunity || Boolean(operationReadiness),
    }),
    [sc, owner?.name, customer, overduePaymentCount, nextOperationTarget, simpleOpportunity, operationReadiness],
  );
  const terminal = Boolean(decisionModel.terminalLabel);
  const leadBlockers = sc.qualificationReadiness?.blockers ?? [];
  const processBlocked = Boolean(nextOperationTarget?.blockers.length);
  const useLeadConversionAsPrimary = !terminal
    && canUpdate
    && isLead
    && !sc.qualificationReadiness?.health?.actionMissing
    && !decisionModel.nextActionOverdue
    && leadBlockers.length === 0;
  const revealProcessActions = () => {
    // Görev listesi her zaman mount; kullanıcıyı listeye götürmek yeterli.
    focusWorkspaceTarget(document.getElementById("opportunity-process-actions"), { focus: false, block: "start" });
  };
  const revealQualification = () => {
    focusWorkspaceTarget(document.getElementById("opportunity-qualification"), { focus: false, block: "start" });
  };
  // Kapanmış kayıtta yapılacak bir iş yok: sahte bir birincil eylem (eskiden
  // "Kapanış kayıtlarını gör") kaldırılan Kayıtlar bölümüne gidiyordu.
  const decisionPrimaryAction = terminal || !canUpdate ? undefined
    : sc.qualificationReadiness?.health?.actionMissing || decisionModel.nextActionOverdue ? (
      <NextActionDialog
        salesCase={sc}
        onSave={(patch) => updateCase(sc.id, patch)}
        trigger={<Button type="button">{decisionModel.nextActionOverdue ? "Aksiyonu yeniden planla" : "Aksiyon planla"}</Button>}
      />
    ) : isLead && leadBlockers.length > 0 ? (
      <Button type="button" onClick={revealQualification}>Nitelendirmedeki eksikleri tamamla</Button>
    ) : isLead ? (
      <Button
        type="button"
        onClick={() => document.querySelector<HTMLButtonElement>('[data-workspace-primary="convert"]')?.click()}
      >
        Fırsata dönüştür
      </Button>
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
      className="overflow-hidden rounded-xl border border-border bg-white"
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
            commentOnly={!isLead}
            trigger={
              <Button type="button" variant="outline" className="h-11 w-full justify-start gap-2 text-muted-foreground">
                <ActivityIcon className="size-4" /> {isLead ? "Aktivite ekle" : "Yorum yaz…"}
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
            emptyLabel={isLead ? "Bu lead için temas kaydı yok." : "Bu fırsat için henüz aktivite veya yorum yok."}
            renderActions={(item) => item.sourceActivityId ? (
              <div className="flex gap-1">
                {hasPermission("activities.update") && onEditActivity && <Button type="button" variant="ghost" size="icon" className="size-11 sm:size-8" onClick={() => onEditActivity(item.sourceActivityId!)}><Pencil className="size-3.5" /><span className="sr-only">{item.title} aktivitesini düzenle</span></Button>}
                {hasPermission("activities.delete") && onDeleteActivity && <Button type="button" variant="ghost" size="icon" className="size-11 text-red-700 sm:size-8" onClick={() => onDeleteActivity(item.sourceActivityId!)}><Trash2 className="size-3.5" /><span className="sr-only">{item.title} aktivitesini sil</span></Button>}
              </div>
            ) : null}
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

  return (
    <div className="min-w-0 space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <div className="font-data text-[10px] font-semibold uppercase tracking-[0.15em] text-[#536178]">
          {isLead ? "Lead çalışma alanı" : simpleOpportunity ? "Fırsat çalışma alanı" : "Ortak fırsat görünümü"}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {isLead
            ? "Nitelendirme kararı ve temas akışı tek yüzeyde"
            : "Süreç ve aktivite akışı tek yüzeyde"}
        </div>
      </div>

      {simpleOpportunity && <CompactQualificationRail current={sc.qualificationStage} />}
      <WorkspaceDecisionSummary
        ref={decisionSummaryRef}
        model={decisionModel}
        primaryAction={decisionPrimaryAction}
        variant={simpleOpportunity ? "compact" : "default"}
      />
      {detailLoading && <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status" aria-live="polite"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Kayıt kontrolleri güncelleniyor…</div>}
      {detailError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert"><span>{detailError}</span><Button type="button" variant="outline" size="sm" className="min-h-11 bg-white sm:min-h-8" onClick={() => void loadDetail()}><RefreshCw className="size-4" /> Tekrar dene</Button></div>}

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
              <HealthStrip items={[
                {
                  label: "Sonraki aksiyon",
                  value: sc.nextAction || "Planlanmadı",
                  hint: formatDate(sc.nextActionAt, true),
                  tone: sc.qualificationReadiness?.health?.actionOverdue ? "risk" : "neutral",
                },
                {
                  label: "Temas denemesi",
                  value: String(sc.qualificationReadiness?.health?.contactAttemptCount ?? 0),
                  hint: "Sonuç kaydıyla güncellenir",
                },
                {
                  label: "İlk temas",
                  value: formatDate(sc.qualificationReadiness?.health?.firstContactAt, true),
                  hint: "Speed-to-lead",
                  tone: sc.qualificationReadiness?.health?.firstContactAt ? "good" : "neutral",
                },
              ]} />
              <div id="opportunity-qualification" className="scroll-mt-24">
                <LeadQualificationPanel salesCase={sc} canUpdate={canUpdate} />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div><h3 className="font-display text-lg font-semibold text-[#0b1739]">Birleşik süreç merkezi</h3><p className="text-xs text-muted-foreground">Önce mevcut aşama, sıradaki aşama ve karar engelleri; ayrıntılı raylar isteğe bağlıdır.</p></div>
              {/* Alan görevleri artık satış alanı kutusunun kendi içeriği
                  (`OpportunityProcessCenter`'ın `checklist` prop'u). Burada ayrı
                  bir sarmalayıcı tutmak görevleri kutunun dışında, ikinci bir
                  kutuda gösterirdi. */}
              <Card className="overflow-hidden border-[#0b2453]/15">
                <div className="h-1 bg-[linear-gradient(90deg,#0b2453_0%,#2457D6_72%,#CF060C_72%)]" />
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Mevcut aşama</div>
                      <div className="mt-1 font-display text-lg font-semibold text-[#0b1739]">
                        {salesStageLabel((operationReadiness?.currentOperationStage ?? sc.stage) as SalesCase["stage"])}
                      </div>
                    </div>
                    <ChevronRight className="hidden size-5 text-[#2457D6] sm:block" aria-hidden="true" />
                    <div className="rounded-lg border border-blue-200 bg-blue-50/65 p-3">
                      <div className="font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Sıradaki aşama</div>
                      <div className="mt-1 font-display text-lg font-semibold text-[#0b1739]">
                        {nextOperationTarget
                          ? salesStageLabel(nextOperationTarget.code as SalesCase["stage"])
                          : "Akış sonu"}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#0b1739]">Geçiş engelleri</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(nextOperationTarget?.blockers ?? []).slice(0, 6).map((blocker) => {
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
                      {operationReadiness && !nextOperationTarget?.blockers.length && (
                        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><Check className="size-4" /> Sıradaki geçiş için engel yok</span>
                      )}
                    </div>
                  </div>
                  {/* Sade modda bu düğmenin açacağı bir şey kalmadı: kutu artık
                      her zaman görünür, operasyon kartları ise yalnız tam modda
                      render ediliyor. Ölü düğme bırakmamak için gizlendi. */}
                  {!simpleOpportunity && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-expanded={operationsExpanded}
                      onClick={() => setOperationsExpanded((value) => !value)}
                    >
                      {operationsExpanded ? "Operasyon kartlarını kapat" : "Operasyon kartlarını aç"}
                    </Button>
                  )}
                </CardContent>
              </Card>
              {simpleOpportunity && (
                <div className="grid gap-3 sm:grid-cols-3" aria-label="Saha operasyonu özeti">
                  <button type="button" className="min-h-20 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#163b75]/40 hover:bg-slate-50" onClick={revealProcessActions}>
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b1739]"><Truck className="size-4" /> Sevkiyat</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{opportunityShipments[0]?.status ?? "Henüz başlamadı"}</span>
                  </button>
                  <button type="button" className="min-h-20 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#163b75]/40 hover:bg-slate-50" onClick={revealProcessActions}>
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b1739]"><FileClock className="size-4" /> Teslim</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{opportunityDeliveries[0]?.status ?? "Henüz başlamadı"}</span>
                  </button>
                  <button type="button" className="min-h-20 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#163b75]/40 hover:bg-slate-50" onClick={revealProcessActions}>
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b1739]"><Wrench className="size-4" /> Kurulum</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{opportunityInstallations[0]?.statusName ?? "Henüz başlamadı"}</span>
                  </button>
                </div>
              )}
              {/* Satış alanı kutusu isteğe bağlı OLAMAZ: alan görevleri ve tek
                  ilerletme düğmesi onun içinde. Sade modda `operationsExpanded`
                  false başladığı için kutu kapının arkasında kalıyordu, yani
                  kullanıcı ilerletme düğmesini hiç göremiyordu. İsteğe bağlı olan
                  operasyon kartları; kutu değil. */}
              <div className="space-y-4">
                {renderProcessCenter ? renderProcessCenter({ detail, loading: detailLoading, reload: loadDetail }) : processCenter}
                {operationsExpanded && !simpleOpportunity && <div className="grid gap-4 lg:grid-cols-3">
                    <Card><CardHeader className="pb-3"><CardTitle className="inline-flex items-center gap-2 text-sm"><Truck className="size-4" /> Sevkiyat</CardTitle></CardHeader><CardContent className="space-y-2">{opportunityShipments.map((shipment) => <div key={shipment.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-medium">{shipment.trackingNo || "Takip numarası yok"}</div><div className="mt-1 text-xs text-muted-foreground">{shipment.status} · ETA {formatDate(shipment.eta)}</div></div>)}{opportunityShipments.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><div className="text-sm text-muted-foreground">Sevkiyat yok.</div><Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 sm:min-h-8" onClick={revealProcessActions}>Sevkiyat oluştur</Button></div>}</CardContent></Card>
                    <Card><CardHeader className="pb-3"><CardTitle className="inline-flex items-center gap-2 text-sm"><FileClock className="size-4" /> Teslim</CardTitle></CardHeader><CardContent className="space-y-2">{opportunityDeliveries.map((delivery) => <div key={delivery.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-medium">{delivery.status}</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(delivery.date)} · {delivery.signedBy || "İmza bekliyor"}</div></div>)}{opportunityDeliveries.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><div className="text-sm text-muted-foreground">Teslim kaydı yok.</div><Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 sm:min-h-8" onClick={revealProcessActions}>Teslim kaydı oluştur</Button></div>}</CardContent></Card>
                    <Card><CardHeader className="pb-3"><CardTitle className="inline-flex items-center gap-2 text-sm"><Wrench className="size-4" /> Kurulum</CardTitle></CardHeader><CardContent className="space-y-2">{opportunityInstallations.map((installation) => <div key={installation.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-medium">{installation.statusName}</div><div className="mt-1 text-xs text-muted-foreground">{installation.technician || "Teknisyen atanmadı"} · {formatDate(installation.scheduledDate)}</div></div>)}{opportunityInstallations.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><div className="text-sm text-muted-foreground">Kurulum kaydı yok.</div><Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 sm:min-h-8" onClick={revealProcessActions}>Kurulum oluştur</Button></div>}</CardContent></Card>
                  </div>}
              </div>
            </div>
          )}
        </div>
      </RecordWorkspaceShell>
    </div>
  );
}
