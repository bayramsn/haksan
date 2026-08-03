import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  PIPELINE_STAGE_FLOW,
  type OpportunityProcessActionKey,
  type OpportunityProcessReadiness,
} from "@haksan/shared";
import {
  Activity as ActivityIcon,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  FileClock,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Truck,
  UserRound,
  Wrench,
  Pencil,
} from "lucide-react";
import { fileService, opportunityService } from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import { loadPersisted, usePersistentState } from "../../lib/persist";
import { useStore } from "../../lib/store";
import {
  QUALIFICATION_STAGE_LABELS,
  salesStageLabel,
  type DocumentItem,
  type SalesCase,
} from "../../lib/mock";
import { calculateOpportunityScore, findSimilarWonOpportunities } from "../../lib/opportunityInsights";
import { resolveSalesContact } from "../../lib/salesContact";
import { focusWorkspaceTarget } from "../../lib/workspaceFocus";
import { AddActivityDialog } from "../dialogs/CreateDialogs";
import { DocumentUploadDialog } from "../dialogs/DocumentUploadDialog";
import { QuoteDialog } from "../dialogs/QuoteDialog";
import { StatusBadge } from "../Layout";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { NextActionDialog, actionDateLabel, isActionOverdue } from "../shared/NextActionDialog";
import { toast } from "sonner";
import { DecisionRail, LeadQualificationPanel } from "./LeadWorkspaceControls";
import {
  DocumentPanel,
  HealthStrip,
  RecordWorkspaceShell,
  UnifiedTimeline,
  WorkspaceDecisionSummary,
  type WorkspaceDecisionModel,
} from "../shared/RecordWorkspace";
import { CommercialDocumentRail } from "../shared/CommercialDocumentRail";

type WorkspaceTab = "summary" | "contact" | "qualification" | "activity" | "commercial" | "operations" | "files";
type WorkspacePreferencesV2 = {
  version: 2;
  defaultTabByMode: { lead: WorkspaceTab; opportunity: WorkspaceTab };
  density: "comfortable" | "compact";
  showSimilar: boolean;
  showStakeholders: boolean;
};

type OpportunityDetail = {
  history?: Array<Record<string, any>>;
  qualificationHistory?: Array<Record<string, any>>;
  approvals?: Array<Record<string, any>>;
  auditHistory?: Array<Record<string, any>>;
  processReadiness?: OpportunityProcessReadiness;
};

type TimelineItem = {
  id: string;
  date: string;
  category: "activity" | "process" | "commercial" | "approval" | "file";
  title: string;
  detail?: string;
  actor?: string;
  sourceActivityId?: string;
};

export const isManualTimelineComment = (activity: {
  type: string;
  typeCode?: string;
  origin?: "manual" | "system";
}) => activity.origin === "manual" && (activity.typeCode === "note" || activity.type === "Not" || activity.type === "Yorum");

const TAB_LABELS: Record<WorkspaceTab, string> = {
  summary: "Özet",
  contact: "Temas",
  qualification: "Nitelendirme",
  activity: "Aktivite",
  commercial: "Ticari",
  operations: "Operasyon",
  files: "Kayıtlar",
};

const LEAD_TABS: WorkspaceTab[] = ["summary", "contact", "qualification", "files"];
const OPPORTUNITY_TABS: WorkspaceTab[] = ["summary", "activity", "commercial", "operations", "files"];

const normalizeWorkspaceTab = (value: unknown, tabs: WorkspaceTab[]) =>
  typeof value === "string" && tabs.includes(value as WorkspaceTab) ? value as WorkspaceTab : "summary";

const migrateWorkspacePreferences = (
  raw: unknown,
  opportunityDefault: WorkspaceTab,
): WorkspacePreferencesV2 => {
  const source = raw && typeof raw === "object" ? raw as Record<string, any> : {};
  const legacyDefault = source.defaultTab;
  const byMode = source.defaultTabByMode && typeof source.defaultTabByMode === "object"
    ? source.defaultTabByMode as Record<string, unknown>
    : {};
  return {
    version: 2,
    defaultTabByMode: {
      lead: normalizeWorkspaceTab(byMode.lead ?? legacyDefault, LEAD_TABS),
      opportunity: normalizeWorkspaceTab(byMode.opportunity ?? legacyDefault ?? opportunityDefault, OPPORTUNITY_TABS),
    },
    density: source.density === "compact" ? "compact" : "comfortable",
    showSimilar: source.showSimilar !== false,
    showStakeholders: source.showStakeholders !== false,
  };
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

const roleDefaultTab = (roles: string[] | undefined): WorkspaceTab => {
  const normalized = (roles ?? []).map((role) => role.toLocaleLowerCase("tr-TR"));
  if (normalized.some((role) => role.includes("finance") || role.includes("finans"))) return "commercial";
  if (normalized.some((role) => role.includes("service") || role.includes("servis") || role.includes("logistics"))) return "operations";
  return "summary";
};

const AUDIT_FIELD_LABELS: Record<string, string> = {
  qualificationStage: "Nitelik aşaması",
  leadFollowUpStatus: "Lead durumu",
  contactAttemptCount: "Temas denemesi",
  nextAction: "Sonraki aksiyon",
  nextActionAt: "Aksiyon zamanı",
  ownerUserId: "Sorumlu",
  estimatedValue: "Tahmini tutar",
  probability: "Olasılık",
  expectedCloseDate: "Kapanış tarihi",
  fitScore: "Uyum skoru",
  engagementScore: "Etkileşim skoru",
  priorityScore: "Öncelik skoru",
  overrideReason: "Dönüşüm gerekçesi",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "opportunity.created": "Kayıt oluşturuldu",
  "opportunity.converted": "Lead fırsata dönüştürüldü",
  "opportunity.owner_changed": "Sorumlu değiştirildi",
  "lead.contact_recorded": "Temas sonucu kaydedildi",
  "opportunity.approvals.invalidated": "Onaylar yeniden değerlendirmeye alındı",
};

const auditValue = (key: string, value: unknown, userNames?: ReadonlyMap<string, string>) => {
  if (/password|token|secret|hash/i.test(key)) return "••••••";
  if (value === null || value === undefined || value === "") return "Boş";
  if (key === "ownerUserId" && typeof value === "string") return userNames?.get(value) ?? value;
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "object") return Array.isArray(value) ? value.join(", ") : "Yapılandırılmış veri";
  return String(value);
};

const auditSide = (label: string, values: unknown, userNames?: ReadonlyMap<string, string>) => {
  if (!values || typeof values !== "object" || Array.isArray(values)) return "";
  const entries = Object.entries(values as Record<string, unknown>)
    .map(([key, value]) => `${AUDIT_FIELD_LABELS[key] ?? key}: ${auditValue(key, value, userNames)}`)
    .join(" | ");
  return entries ? `${label} — ${entries}` : "";
};

const auditDetail = (oldValues: unknown, newValues: unknown, userNames?: ReadonlyMap<string, string>) => {
  const pairs = [auditSide("Önce", oldValues, userNames), auditSide("Sonra", newValues, userNames)]
    .filter(Boolean)
    .join(" · ");
  return pairs.length > 500 ? `${pairs.slice(0, 497)}…` : pairs;
};

export function buildWorkspaceDecisionModel({
  salesCase,
  ownerName,
  customerMissing,
  overduePaymentCount,
  nextOperationTarget,
}: {
  salesCase: SalesCase;
  ownerName?: string;
  customerMissing: boolean;
  overduePaymentCount: number;
  nextOperationTarget?: OpportunityProcessReadiness["targets"][number];
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
      : nextOperationTarget ? salesStageLabel(nextOperationTarget.code as SalesCase["stage"]) : "Akış sonu",
    blockerCount: isLead
      ? salesCase.qualificationReadiness?.blockers.length ?? 0
      : nextOperationTarget?.blockers.length ?? 0,
    risks,
    terminalLabel,
  };
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 border-l-2 border-slate-200 pl-3">
      <div className="font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-data text-lg font-semibold tabular-nums text-[#0b1739]" title={value}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export function OpportunityWorkspace({
  salesCase: sc,
  processCenter,
  renderProcessCenter,
  processChecklist,
  companyLinkingPanel,
  onOpenOffer,
  onDownloadDocument,
  onCommercialAction,
  canPerformCommercialAction,
  mobilePortalId,
  focusDecisionOnMount = false,
  onEditActivity,
  onDeleteActivity,
  otherActions,
}: {
  salesCase: SalesCase;
  processCenter: ReactNode;
  renderProcessCenter?: (context: { detail: OpportunityDetail | null; loading: boolean; reload: () => Promise<void> }) => ReactNode;
  processChecklist: ReactNode;
  companyLinkingPanel?: ReactNode;
  onOpenOffer: (offerId: string) => void;
  onDownloadDocument: (document: DocumentItem) => void;
  onCommercialAction?: (actionKey: OpportunityProcessActionKey) => void;
  canPerformCommercialAction?: (actionKey: OpportunityProcessActionKey) => boolean;
  mobilePortalId?: string;
  focusDecisionOnMount?: boolean;
  onEditActivity?: (activityId: string) => void;
  onDeleteActivity?: (activityId: string) => void;
  otherActions?: ReactNode;
}) {
  const {
    cases,
    closedCases,
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
  const { user, hasPermission, hasRole } = useAuth();
  const canUpdate = hasPermission("opportunities.update");
  const canAssignOwner = canUpdate && (hasRole("sales") || hasRole("super_admin"));
  const isLead = sc.qualificationStage === "lead";
  const activeTabs = isLead ? LEAD_TABS : OPPORTUNITY_TABS;
  const legacyPreferenceKey = `opportunity.workspace.${user?.id ?? "anonymous"}`;
  const preferenceKey = `${legacyPreferenceKey}.v2`;
  const initialPreferences = migrateWorkspacePreferences(
    loadPersisted<unknown>(preferenceKey, loadPersisted<unknown>(legacyPreferenceKey, null)),
    roleDefaultTab(user?.roles),
  );
  const [preferences, setPreferences] = usePersistentState<WorkspacePreferencesV2>(preferenceKey, initialPreferences);
  const preferredTab = isLead ? preferences.defaultTabByMode.lead : preferences.defaultTabByMode.opportunity;
  const [tab, setTab] = useState<WorkspaceTab>(() => normalizeWorkspaceTab(preferredTab, activeTabs));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [amount, setAmount] = useState(String(sc.estimatedAmount));
  const [currency, setCurrency] = useState<SalesCase["currency"]>(sc.currency);
  const [probability, setProbability] = useState(String(sc.probability ?? 50));
  const [expectedCloseDate, setExpectedCloseDate] = useState(sc.expectedCloseDate ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [focusedActivityId, setFocusedActivityId] = useState<string | null>(null);
  const [operationsExpanded, setOperationsExpanded] = useState(true);
  const decisionSummaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!activeTabs.includes(tab)) setTab("summary");
  }, [activeTabs, tab]);

  useEffect(() => {
    if (!focusDecisionOnMount) return;
    const timer = window.setTimeout(() => focusWorkspaceTarget(decisionSummaryRef.current, { scroll: false }), 0);
    return () => window.clearTimeout(timer);
  }, [focusDecisionOnMount, sc.id]);

  useEffect(() => {
    setOperationsExpanded(true);
  }, [sc.id]);

  useEffect(() => {
    const syncFocusFromLocation = () => {
      const url = new URL(window.location.href);
      const opportunityId = url.searchParams.get("opportunity");
      const activityId = url.searchParams.get("activity");
      if (opportunityId === sc.id && activityId) {
        setFocusedActivityId(activityId);
        setTab(isLead ? "contact" : "activity");
      } else {
        setFocusedActivityId(null);
      }
    };
    syncFocusFromLocation();
    window.addEventListener("popstate", syncFocusFromLocation);
    window.addEventListener("haksan:opportunity-focus", syncFocusFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFocusFromLocation);
      window.removeEventListener("haksan:opportunity-focus", syncFocusFromLocation);
    };
  }, [isLead, sc.id]);

  const loadDetail = useCallback(async () => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      setDetail(await opportunityService.get(sc.id));
    } catch (error: any) {
      setDetailError(error?.message ?? "Fırsat geçmişi alınamadı.");
    } finally {
      setDetailLoading(false);
    }
  }, [sc.id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail, sc.stage, sc.qualificationStage]);

  useEffect(() => {
    setAmount(String(sc.estimatedAmount));
    setCurrency(sc.currency);
    setProbability(String(sc.probability ?? 50));
    setExpectedCloseDate(sc.expectedCloseDate ?? "");
  }, [sc.currency, sc.estimatedAmount, sc.expectedCloseDate, sc.id, sc.probability]);

  const customer = customers.find((item) => item.id === sc.customerId);
  const owner = users.find((item) => item.id === sc.assignedUserId);
  const userNames = useMemo(() => new Map(users.map((item) => [item.id, item.name])), [users]);
  const opportunityActivities = activities.filter((item) => item.salesCaseId === sc.id);
  const opportunityOffers = offers.filter((item) => item.salesCaseId === sc.id);
  const opportunityPayments = payments.filter((item) => item.salesCaseId === sc.id);
  const opportunityDocuments = documents.filter((item) => item.salesCaseId === sc.id);
  const opportunityShipments = shipments.filter((item) => item.salesCaseId === sc.id);
  const opportunityDeliveries = deliveries.filter((item) => item.salesCaseId === sc.id);
  const opportunityInstallations = installations.filter((item) => item.salesCaseId === sc.id);
  const resolvedContact = resolveSalesContact({ salesCase: sc, customer, contacts });
  const companyContacts = resolvedContact.companyContacts;
  const score = useMemo(
    () => calculateOpportunityScore(sc, { activities: opportunityActivities, offers: opportunityOffers }),
    [opportunityActivities, opportunityOffers, sc],
  );
  const similarWins = useMemo(
    () => findSimilarWonOpportunities(sc, [...cases, ...closedCases]),
    [cases, closedCases, sc],
  );
  const rawProbabilityNumber = Number(probability);
  const rawAmountNumber = Number(amount);
  const probabilityNumber = Number.isFinite(rawProbabilityNumber) ? rawProbabilityNumber : 0;
  const amountNumber = Number.isFinite(rawAmountNumber) ? rawAmountNumber : 0;
  const weightedValue = amountNumber * (probabilityNumber / 100);
  const amountError = amount.trim() === "" || !Number.isFinite(rawAmountNumber) || rawAmountNumber < 0
    ? "Tutar sıfır veya daha büyük bir sayı olmalı."
    : null;
  const probabilityError = probability.trim() === "" || !Number.isFinite(rawProbabilityNumber) || rawProbabilityNumber < 0 || rawProbabilityNumber > 100
    ? "Olasılık 0 ile 100 arasında olmalı."
    : null;

  const previewDocument = async (document: DocumentItem) => {
    if (!document.fileId) return;
    try {
      const signed = await fileService.signedDownload(document.fileId);
      if (signed.mimeType !== "application/pdf" && !signed.mimeType.startsWith("image/")) {
        toast.message("Bu dosya türü güvenli önizlemeyi desteklemiyor", { description: "Dosyayı indirebilirsiniz." });
        return;
      }
      window.open(signed.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      toast.error("Dosya önizlenemedi", { description: error?.message ?? "Yetki veya dosya durumunu kontrol edin." });
    }
  };

  const saveCommercial = async () => {
    if (!canUpdate || saveState === "saving") return;
    if (amountError || probabilityError) {
      setSaveState("error");
      toast.error("Ticari alanları kontrol edin");
      return;
    }
    setSaveState("saving");
    try {
      await updateCase(sc.id, {
        estimatedAmount: amountNumber,
        currency,
        probability: probabilityNumber,
        expectedCloseDate: expectedCloseDate || null,
      });
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2400);
    } catch (error: any) {
      setSaveState("error");
      toast.error("Ticari özet kaydedilemedi", { description: error?.message ?? "İstek başarısız oldu." });
    }
  };

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    const visibleActivities = isLead
      ? opportunityActivities
      : opportunityActivities.filter(isManualTimelineComment);
    visibleActivities.forEach((activity) => items.push({
      id: `activity-${activity.id}`,
      sourceActivityId: activity.id,
      date: activity.date,
      category: "activity",
      title: activity.title,
      detail: [activity.note, activity.result].filter(Boolean).join(" · "),
      actor: activity.createdByName || users.find((item) => item.id === activity.byUserId)?.name,
    }));
    if (!isLead) return items.sort((a, b) => timelineTime(b.date) - timelineTime(a.date));
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
    (detail?.auditHistory ?? []).forEach((audit) => items.push({
      id: `audit-${audit.id}`,
      date: audit.createdAt,
      category: "process",
      title: AUDIT_ACTION_LABELS[audit.action] ?? audit.action,
      detail: auditDetail(audit.oldValues, audit.newValues, userNames),
      actor: audit.actor?.fullName ?? audit.actor?.email,
    }));
    return items.sort((a, b) => timelineTime(b.date) - timelineTime(a.date));
  }, [detail, isLead, opportunityActivities, opportunityDocuments, opportunityOffers, opportunityPayments, userNames, users]);

  useEffect(() => {
    if (!focusedActivityId || (tab !== "activity" && tab !== "contact")) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`activity-${focusedActivityId}`);
      if (!target) return;
      focusWorkspaceTarget(target);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusedActivityId, tab, timeline.length]);

  const padding = preferences.density === "compact" ? "p-3 sm:p-4" : "p-4 sm:p-5";
  const operationReadiness = detail?.processReadiness;
  const nextOperationTarget = operationReadiness?.targets
    .filter((target) => target.axis === "operation" && target.direction === "forward")
    .sort(
      (left, right) =>
        PIPELINE_STAGE_FLOW.indexOf(left.code as (typeof PIPELINE_STAGE_FLOW)[number]) -
        PIPELINE_STAGE_FLOW.indexOf(right.code as (typeof PIPELINE_STAGE_FLOW)[number]),
    )[0];
  const decisionModel = buildWorkspaceDecisionModel({
    salesCase: sc,
    ownerName: owner?.name,
    customerMissing: !customer,
    overduePaymentCount: opportunityPayments.filter((payment) => payment.status === "Overdue").length,
    nextOperationTarget,
  });
  const terminal = Boolean(decisionModel.terminalLabel);
  const leadBlockers = sc.qualificationReadiness?.blockers ?? [];
  const processBlocked = Boolean(nextOperationTarget?.blockers.length);
  const useLeadConversionAsPrimary = !terminal
    && canUpdate
    && isLead
    && !sc.qualificationReadiness?.health?.actionMissing
    && !decisionModel.nextActionOverdue
    && leadBlockers.length === 0;
  const decisionPrimaryAction = terminal ? (
    <Button type="button" variant="outline" onClick={() => setTab("files")}>Kapanış kayıtlarını gör</Button>
  ) : !canUpdate ? undefined : sc.qualificationReadiness?.health?.actionMissing || decisionModel.nextActionOverdue ? (
    <NextActionDialog
      salesCase={sc}
      onSave={(patch) => updateCase(sc.id, patch)}
      trigger={<Button type="button">{decisionModel.nextActionOverdue ? "Aksiyonu yeniden planla" : "Aksiyon planla"}</Button>}
    />
  ) : isLead && leadBlockers.length > 0 ? (
    <Button type="button" onClick={() => setTab("qualification")}>Nitelendirmedeki eksikleri tamamla</Button>
  ) : isLead ? (
    <Button
      type="button"
      onClick={() => document.querySelector<HTMLButtonElement>('[data-workspace-primary="convert"]')?.click()}
    >
      Fırsata dönüştür
    </Button>
  ) : processBlocked ? (
    <Button type="button" onClick={() => { setTab("operations"); setOperationsExpanded(true); }}>Engelleri çöz</Button>
  ) : (
    <NextActionDialog
      salesCase={sc}
      onSave={(patch) => updateCase(sc.id, patch)}
      trigger={<Button type="button">Aksiyonu düzenle</Button>}
    />
  );
  const revealProcessActions = () => {
    setOperationsExpanded(true);
    window.setTimeout(() => {
      focusWorkspaceTarget(document.getElementById("opportunity-process-actions"), { focus: false, block: "start" });
    }, 80);
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="font-data text-[10px] font-semibold uppercase tracking-[0.15em] text-[#536178]">
            {isLead ? "Lead çalışma alanı" : "Ortak fırsat görünümü"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {isLead ? "Temas, nitelendirme ve dönüşüm kararı için tek yüzey" : "Satış, ticari ve operasyon ekipleri için tek görünüm"}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5 bg-white sm:min-h-8" onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen}>
          <Settings2 className="size-4" /> Görünümü ayarla
        </Button>
      </div>

      {settingsOpen && (
        <Card className="border-[#163b75]/20 bg-slate-50/80">
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr]">
            <div>
              <Label htmlFor="workspace-default-section" className="text-xs">Varsayılan bölüm</Label>
              <Select value={preferredTab} onValueChange={(value) => setPreferences((current) => ({
                ...current,
                defaultTabByMode: {
                  ...current.defaultTabByMode,
                  [isLead ? "lead" : "opportunity"]: value as WorkspaceTab,
                },
              }))}>
                <SelectTrigger id="workspace-default-section" className="mt-1.5 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{activeTabs.map((key) => <SelectItem key={key} value={key}>{TAB_LABELS[key]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!isLead && <div>
              <Label htmlFor="workspace-density" className="text-xs">Bilgi yoğunluğu</Label>
              <Select value={preferences.density} onValueChange={(value) => setPreferences((current) => ({ ...current, density: value as WorkspacePreferencesV2["density"] }))}>
                <SelectTrigger id="workspace-density" className="mt-1.5 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="comfortable">Rahat</SelectItem><SelectItem value="compact">Kompakt</SelectItem></SelectContent>
              </Select>
            </div>}
            {!isLead && <div>
              <Label className="text-xs">Özet modülleri</Label>
              <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Özet modülü görünürlüğü">
                {([
                  ["showSimilar", "Benzer kazanımlar"],
                  ["showStakeholders", "Paydaşlar"],
                ] as const).map(([key, label]) => (
                  <Button key={key} type="button" size="sm" variant={preferences[key] ? "default" : "outline"} className="h-11 text-xs sm:h-8" onClick={() => setPreferences((current) => ({ ...current, [key]: !current[key] }))} aria-pressed={preferences[key]}>
                    {preferences[key] && <Check className="size-3.5" />} {label}
                  </Button>
                ))}
              </div>
            </div>}
          </CardContent>
        </Card>
      )}

      <WorkspaceDecisionSummary ref={decisionSummaryRef} model={decisionModel} primaryAction={decisionPrimaryAction} />
      {detailLoading && <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status" aria-live="polite"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Kayıt kontrolleri güncelleniyor…</div>}
      {detailError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert"><span>{detailError}</span><Button type="button" variant="outline" size="sm" className="min-h-11 bg-white sm:min-h-8" onClick={() => void loadDetail()}><RefreshCw className="size-4" /> Tekrar dene</Button></div>}

      <RecordWorkspaceShell rail={<DecisionRail salesCase={sc} ownerName={owner?.name} users={users} canUpdate={canUpdate} canAssignOwner={canAssignOwner} onOwnerChanged={loadDetail} mobilePortalId={mobilePortalId} contactPhone={resolvedContact.phone} contactEmail={resolvedContact.email} whatsappNumber={resolvedContact.whatsappNumber} otherActions={otherActions} primaryAction={useLeadConversionAsPrimary ? undefined : decisionPrimaryAction} useLeadConversionAsPrimary={useLeadConversionAsPrimary} />}>
      <Tabs value={tab} onValueChange={(value) => setTab(value as WorkspaceTab)}>
        <div className="sm:hidden">
          <Label htmlFor="workspace-section" className="text-xs font-semibold">Bölüm</Label>
          <Select value={tab} onValueChange={(value) => setTab(value as WorkspaceTab)}>
            <SelectTrigger id="workspace-section" className="mt-1.5 h-11 w-full bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{activeTabs.map((key) => <SelectItem key={key} value={key}>{TAB_LABELS[key]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <TabsList aria-label="Çalışma alanı bölümleri" className="hidden h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b border-slate-200 bg-transparent p-0 sm:flex">
          {activeTabs.map((key) => (
            <TabsTrigger key={key} value={key} className="min-h-11 flex-none rounded-none border-0 border-b-2 border-transparent px-3 py-2.5 text-[12px] data-[state=active]:border-b-[#163b75] data-[state=active]:bg-transparent data-[state=active]:text-[#163b75] data-[state=active]:shadow-none sm:min-h-0 sm:text-[13px]">
              {TAB_LABELS[key]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-4">
          {companyLinkingPanel}
          {isLead && (
            <>
              <section className="overflow-hidden rounded-xl border border-[#0b2453]/15 bg-white" aria-labelledby="lead-priority-title">
                <div className="h-1 bg-[linear-gradient(90deg,#0b2453_0%,#2457D6_72%,#CF060C_72%)]" />
                <div className={padding}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 id="lead-priority-title" className="font-display text-xl font-semibold text-[#0b1739]">Lead önceliği</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">Uyum ve etkileşim ayrı hesaplanır; SLA ihlali skora gizlice eklenmez.</p>
                    </div>
                    <div className="text-right">
                      <div className="font-data text-3xl font-semibold tabular-nums text-[#0b1739]">{sc.leadInsights?.priorityScore ?? 0}</div>
                      <Badge className={
                        sc.leadInsights?.priorityBand === "high"
                          ? "bg-red-700"
                          : sc.leadInsights?.priorityBand === "medium"
                            ? "bg-amber-600"
                            : "bg-slate-600"
                      }>
                        {sc.leadInsights?.priorityBand === "high" ? "Yüksek" : sc.leadInsights?.priorityBand === "medium" ? "Orta" : "Düşük"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Metric label="Uyum" value={`%${sc.leadInsights?.fitScore ?? 0}`} hint="5 × 20 puan" />
                    <Metric label="Etkileşim" value={`%${sc.leadInsights?.engagementScore ?? 0}`} hint="Temas ve aksiyon" />
                    <Metric
                      label="SLA"
                      value={sc.qualificationReadiness?.health?.leadSlaBreached ? "İhlal" : "İçinde"}
                      hint={`${sc.qualificationReadiness?.health?.leadStatusAgeHours ?? 0} saat`}
                    />
                    <Metric label="Kaynak" value={sc.leadContactMethodName || sc.externalSource || "Manuel"} />
                  </div>
                  <div className="mt-5 rounded-r-lg border-l-[3px] border-[#2457D6] bg-blue-50 px-3 py-2.5">
                    <div className="font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-[#0b2453]">Önerilen sonraki işlem</div>
                    <div className="mt-1 text-sm font-medium">{sc.leadInsights?.recommendedAction ?? "İlk teması planlayın"}</div>
                  </div>
                </div>
              </section>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">Eksik bilgiler</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {(sc.leadInsights?.softBlockers ?? []).map((blocker) => (
                      <Badge key={blocker} variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">{blocker}</Badge>
                    ))}
                    {!sc.leadInsights?.softBlockers.length && <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><Check className="size-4" /> Beşli nitelendirme tamamlandı</span>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">Kayıt bağlamı</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-start gap-2"><Building2 className="mt-0.5 size-4 text-[#2457D6]" /><div><div className="text-xs text-muted-foreground">Firma bağlama</div><div className="font-medium">{customer ? customer.name : "Firma henüz bağlanmadı"}</div></div></div>
                    <div className="flex items-start gap-2"><UserRound className="mt-0.5 size-4 text-[#2457D6]" /><div><div className="text-xs text-muted-foreground">Kontak</div><div className="font-medium">{sc.leadContactName || "Kontak belirtilmedi"}</div></div></div>
                    <div className="flex items-start gap-2"><Wrench className="mt-0.5 size-4 text-[#2457D6]" /><div><div className="text-xs text-muted-foreground">Ürün / makine</div><div className="font-medium">{sc.requestedMachine || sc.requestedProduct || "Belirlenmedi"}</div></div></div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
          <section className={`${isLead ? "hidden" : ""} overflow-hidden rounded-xl border border-slate-200 bg-white`} aria-labelledby="workspace-pulse-title">
            <div className="h-1 bg-[#163b75]" />
            <div className={padding}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="workspace-pulse-title" className="font-display text-lg font-semibold text-[#0b1739]">Fırsat nabzı</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Deterministik skor; her bileşen CRM verisinden hesaplanır.</p>
                </div>
                <div className="flex items-baseline gap-2"><span className="font-data text-3xl font-semibold tabular-nums text-[#0b1739]">{score.score}</span><span className="text-xs font-semibold text-muted-foreground">/ 100 · {score.label}</span></div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-5">
                {score.breakdown.map((item) => (
                  <div key={item.key} className="border-t-2 border-slate-200 pt-2" title={item.explanation}>
                    <div className="text-[10px] text-muted-foreground">{item.label}</div>
                    <div className="mt-0.5 font-data text-base font-semibold tabular-nums">{item.score}<span className="text-[10px] font-normal text-muted-foreground">/{item.max}</span></div>
                  </div>
                ))}
              </div>
              {score.gaps.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{score.gaps.slice(0, 4).map((gap) => <Badge key={gap} variant="outline" className="border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-800">{gap}</Badge>)}</div>}
            </div>
          </section>

          <div className={`${isLead ? "hidden" : "grid"} gap-4 lg:grid-cols-[1.25fr_.75fr]`}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ticari karar özeti</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Salt okunur görünüm; düzenleme Ticari bölümündedir.</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Metric label="Tahmini değer" value={formatMoney(sc.estimatedAmount, sc.currency)} />
                  <Metric label="Olasılık" value={`%${sc.probability ?? 50}`} />
                  <Metric label="Ağırlıklı" value={formatMoney(sc.estimatedAmount * ((sc.probability ?? 50) / 100), sc.currency)} />
                  <Metric label="Kapanış" value={formatDate(sc.expectedCloseDate)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Satış bağlamı</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2"><Building2 className="mt-0.5 size-4 text-[#163b75]" /><div><div className="text-xs text-muted-foreground">Firma</div><div className="font-medium">{customer?.name ?? sc.leadCompanyTitle ?? "Firma bağlanmadı"}</div></div></div>
                <div className="flex items-start gap-2"><UserRound className="mt-0.5 size-4 text-[#163b75]" /><div><div className="text-xs text-muted-foreground">Sorumlu</div><div className="font-medium">{owner?.name ?? "Atanmadı"}</div></div></div>
                <div className="flex items-start gap-2"><Wrench className="mt-0.5 size-4 text-[#163b75]" /><div><div className="text-xs text-muted-foreground">İstenen makine</div><div className="font-medium">{sc.requestedMachine || sc.requestedProduct || "Belirlenmedi"}</div></div></div>
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3"><StatusBadge status={sc.stage} /><Badge variant="outline">{QUALIFICATION_STAGE_LABELS[sc.qualificationStage]}</Badge></div>
              </CardContent>
            </Card>
          </div>

          <div className={`${isLead ? "hidden" : "grid"} gap-4 lg:grid-cols-2`}>
            {preferences.showStakeholders && <details className="rounded-xl border border-slate-200 bg-white"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">Paydaşlar</summary><Card className="rounded-t-none border-x-0 border-b-0 shadow-none"><CardHeader className="sr-only"><CardTitle>Paydaşlar</CardTitle></CardHeader><CardContent className="space-y-2 pt-4">{owner && <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"><div><div className="text-sm font-medium">{owner.name}</div><div className="text-[10px] text-muted-foreground">Fırsat sahibi · {owner.department}</div></div><Badge variant="outline">İç paydaş</Badge></div>}{companyContacts.map((contact) => <div key={contact.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"><div className="min-w-0"><div className="truncate text-sm font-medium">{contact.name}</div><div className="truncate text-[10px] text-muted-foreground">{contact.decisionRoleName || contact.title || contact.department || "Firma kontağı"}</div></div><Badge variant="outline">{contact.isPrimary ? "Ana kontak" : "Paydaş"}</Badge></div>)}{!owner && companyContacts.length === 0 && <EmptyState>Henüz paydaş tanımlanmadı.</EmptyState>}</CardContent></Card></details>}
            {preferences.showSimilar && <details className="rounded-xl border border-slate-200 bg-white"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">Benzer kazanılan fırsatlar</summary><Card className="rounded-t-none border-x-0 border-b-0 shadow-none"><CardHeader className="sr-only"><CardTitle>Benzer kazanılan fırsatlar</CardTitle></CardHeader><CardContent className="space-y-2 pt-4">{similarWins.map((item) => <div key={item.opportunity.id} className="rounded-lg border border-slate-200 px-3 py-2"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{item.opportunity.requestedMachine || item.opportunity.requestedProduct}</div><div className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.reasons.join(" · ") || "Kazanılmış fırsat"}</div></div><span className="font-data text-xs font-semibold text-[#163b75]">%{item.similarity}</span></div><div className="mt-2 text-xs tabular-nums text-muted-foreground">{formatMoney(item.opportunity.estimatedAmount, item.opportunity.currency)} · {formatDate(item.opportunity.closedAt)}</div></div>)}{similarWins.length === 0 && <EmptyState>Karşılaştırma için yeterli benzer kazanılmış fırsat yok.</EmptyState>}</CardContent></Card></details>}
          </div>
        </TabsContent>

        <TabsContent value={isLead ? "contact" : "activity"} className="mt-4 space-y-4">
          {isLead && (
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
          )}
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-display text-lg font-semibold text-[#0b1739]">{isLead ? "Temas akışı" : "Yorumlar"}</h3><p className="text-xs text-muted-foreground">{isLead ? "Yaklaşan aksiyonlar ve tüm temas sonuçları aynı akışta." : "Yalnızca kullanıcıların elle eklediği yorumlar gösterilir."}</p></div>{hasPermission("activities.create") && <AddActivityDialog salesCaseId={sc.id} customerId={sc.customerId} commentOnly={!isLead} trigger={<Button size="sm" className="min-h-11 gap-1.5 sm:min-h-8"><ActivityIcon className="size-4" /> {isLead ? "Aktivite ekle" : "Yorum ekle"}</Button>} />}</div>
          <Card>
            <CardContent className={padding}>
              {detailLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Geçmiş yükleniyor…</div>}
              {!detailLoading && (
                <UnifiedTimeline
                  items={timeline.map((item) => ({ ...item, categoryLabel: isLead ? categoryLabel[item.category] : "Yorum" }))}
                  focusedId={focusedActivityId ? `activity-${focusedActivityId}` : null}
                  formatDate={formatDate}
                  emptyLabel={isLead ? "Bu lead için temas kaydı yok." : "Bu fırsat için henüz yorum yok."}
                  renderActions={(item) => item.sourceActivityId ? (
                    <div className="flex gap-1">
                      {hasPermission("activities.update") && onEditActivity && <Button type="button" variant="ghost" size="icon" className="size-11 sm:size-8" onClick={() => onEditActivity(item.sourceActivityId!)}><Pencil className="size-3.5" /><span className="sr-only">{item.title} aktivitesini düzenle</span></Button>}
                      {hasPermission("activities.delete") && onDeleteActivity && <Button type="button" variant="ghost" size="icon" className="size-11 text-red-700 sm:size-8" onClick={() => onDeleteActivity(item.sourceActivityId!)}><Trash2 className="size-3.5" /><span className="sr-only">{item.title} aktivitesini sil</span></Button>}
                    </div>
                  ) : null}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qualification" className="mt-4">
          <LeadQualificationPanel salesCase={sc} canUpdate={canUpdate} />
        </TabsContent>

        <TabsContent value="commercial" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
              <div><CardTitle className="text-base">Ticari alanlar</CardTitle><p className="mt-1 text-xs text-muted-foreground">Tutar, olasılık ve hedef kapanışı belge zinciriyle aynı yerde yönetin.</p></div>
              <div className="text-right text-xs" aria-live="polite" role="status">
                {saveState === "saving" && <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> Kaydediliyor</span>}
                {saveState === "saved" && <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><Check className="size-3.5" /> Kaydedildi</span>}
                {saveState === "error" && <span className="inline-flex items-center gap-1 font-medium text-red-700"><AlertTriangle className="size-3.5" /> Alanları kontrol edin</span>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Tahmini değer" value={amountError ? "—" : formatMoney(amountNumber, currency)} />
                <Metric label="Olasılık" value={probabilityError ? "—" : `%${probabilityNumber}`} />
                <Metric label="Ağırlıklı" value={amountError || probabilityError ? "—" : formatMoney(weightedValue, currency)} />
                <Metric label="Kapanış" value={formatDate(expectedCloseDate)} />
              </div>
              <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_110px_120px_150px_auto] sm:items-start">
                <div>
                  <Label htmlFor="opportunity-amount" className="text-xs">Tahmini tutar</Label>
                  <Input id="opportunity-amount" type="number" min={0} value={amount} disabled={!canUpdate} aria-invalid={Boolean(amountError)} aria-describedby={amountError ? "opportunity-amount-error" : undefined} onChange={(event) => { setAmount(event.target.value); setSaveState("idle"); }} className="mt-1.5" />
                  {amountError && <p id="opportunity-amount-error" className="mt-1 text-xs text-red-700">{amountError}</p>}
                </div>
                <div>
                  <Label htmlFor="opportunity-currency" className="text-xs">Para birimi</Label>
                  <Select value={currency} disabled={!canUpdate} onValueChange={(value) => { setCurrency(value as SalesCase["currency"]); setSaveState("idle"); }}><SelectTrigger id="opportunity-currency" className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="TRY">TRY</SelectItem></SelectContent></Select>
                </div>
                <div>
                  <Label htmlFor="opportunity-probability" className="text-xs">Olasılık %</Label>
                  <Input id="opportunity-probability" type="number" min={0} max={100} value={probability} disabled={!canUpdate} aria-invalid={Boolean(probabilityError)} aria-describedby={probabilityError ? "opportunity-probability-error" : undefined} onChange={(event) => { setProbability(event.target.value); setSaveState("idle"); }} className="mt-1.5" />
                  {probabilityError && <p id="opportunity-probability-error" className="mt-1 text-xs text-red-700">{probabilityError}</p>}
                </div>
                <div><Label htmlFor="opportunity-close" className="text-xs">Beklenen kapanış</Label><Input id="opportunity-close" type="date" value={expectedCloseDate} disabled={!canUpdate} onChange={(event) => { setExpectedCloseDate(event.target.value); setSaveState("idle"); }} className="mt-1.5" /></div>
                {canUpdate && <Button type="button" onClick={() => void saveCommercial()} disabled={saveState === "saving" || Boolean(amountError || probabilityError)} className="mt-[1.375rem] gap-1.5"><Save className="size-4" /> Kaydet</Button>}
              </div>
            </CardContent>
          </Card>
          <CommercialDocumentRail
            offers={opportunityOffers}
            documents={opportunityDocuments}
            onOpenOffer={(offer) => onOpenOffer(offer.id)}
            onOpenDocument={(document) => void previewDocument(document)}
            actions={onCommercialAction ? {
              quote: canPerformCommercialAction?.("create_quote") !== false
                ? <Button type="button" size="sm" variant="outline" className="h-8 text-[10px]" onClick={() => onCommercialAction("create_quote")}>Teklif oluştur</Button>
                : undefined,
              proforma: canPerformCommercialAction?.("create_proforma") !== false
                ? <Button type="button" size="sm" variant="outline" className="h-8 text-[10px]" onClick={() => onCommercialAction("create_proforma")}>Proforma oluştur</Button>
                : undefined,
              contract: canPerformCommercialAction?.("create_contract") !== false
                ? <Button type="button" size="sm" variant="outline" className="h-8 text-[10px]" onClick={() => onCommercialAction("create_contract")}>Sözleşme oluştur</Button>
                : undefined,
              invoice: canPerformCommercialAction?.("create_commercial_invoice") !== false
                ? <Button type="button" size="sm" variant="outline" className="h-8 text-[10px]" onClick={() => onCommercialAction("create_commercial_invoice")}>Fatura yükle</Button>
                : undefined,
            } : undefined}
          />
          <div className="grid gap-3 sm:grid-cols-4"><Metric label="Fırsat değeri" value={formatMoney(sc.estimatedAmount, sc.currency)} /><Metric label="Ağırlıklı değer" value={formatMoney(sc.estimatedAmount * ((sc.probability ?? 50) / 100), sc.currency)} /><Metric label="Teklif" value={String(opportunityOffers.length)} hint={opportunityOffers[0]?.status} /><Metric label="Ödeme kaydı" value={String(opportunityPayments.length)} hint={`${opportunityPayments.filter((item) => item.status === "Overdue").length} gecikmiş`} /></div>
          <Card><CardHeader className="flex-row items-center justify-between gap-3"><CardTitle className="text-base">Teklifler</CardTitle>{hasPermission("quotes.create") && <QuoteDialog defaultCaseId={sc.id} defaultCustomerId={sc.customerId} trigger={<Button size="sm">Yeni teklif</Button>} />}</CardHeader><CardContent className="space-y-2">{opportunityOffers.map((offer) => <button key={offer.id} type="button" className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-[#163b75]/40 hover:bg-slate-50" onClick={() => onOpenOffer(offer.id)}><div><div className="text-sm font-medium">{offer.quoteNo} · R{offer.revision}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(offer.date)} · {offer.status}</div></div><div className="font-data text-sm font-semibold tabular-nums">{formatMoney(offer.amount, offer.currency)}</div></button>)}{opportunityOffers.length === 0 && <EmptyState>Teklif kaydı yok.</EmptyState>}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Ödeme ve tahsilat</CardTitle></CardHeader><CardContent className="space-y-2">{opportunityPayments.map((payment) => <div key={payment.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-slate-200 px-3 py-2"><div><div className="text-sm font-medium">{payment.paymentType === "received" ? "Tahsilat" : "Beklenen ödeme"}</div><div className="mt-0.5 text-[10px] text-muted-foreground">Vade {formatDate(payment.dueDate)} · {payment.status}</div></div><div className="font-data text-sm font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency)}</div></div>)}{opportunityPayments.length === 0 && <EmptyState>Ödeme planı veya tahsilat kaydı yok.</EmptyState>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="operations" className="mt-4 space-y-4">
          <div><h3 className="font-display text-lg font-semibold text-[#0b1739]">Birleşik süreç merkezi</h3><p className="text-xs text-muted-foreground">Önce mevcut aşama, sıradaki aşama ve karar engelleri; ayrıntılı raylar isteğe bağlıdır.</p></div>
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
                  {(nextOperationTarget?.blockers ?? []).slice(0, 6).map((blocker) => (
                    <Badge key={blocker.key} variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                      {blocker.label}
                    </Badge>
                  ))}
                  {!nextOperationTarget?.blockers.length && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><Check className="size-4" /> Sıradaki geçiş için engel yok</span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={operationsExpanded}
                onClick={() => setOperationsExpanded((value) => !value)}
              >
                {operationsExpanded ? "Tam süreç raylarını kapat" : "Tam süreç raylarını aç"}
              </Button>
            </CardContent>
          </Card>
          {operationsExpanded && (
            <div className="space-y-4">
              {renderProcessCenter ? renderProcessCenter({ detail, loading: detailLoading, reload: loadDetail }) : processCenter}
              {processChecklist}
              <div className="grid gap-4 lg:grid-cols-3">
                <Card><CardHeader className="pb-3"><CardTitle className="inline-flex items-center gap-2 text-sm"><Truck className="size-4" /> Sevkiyat</CardTitle></CardHeader><CardContent className="space-y-2">{opportunityShipments.map((shipment) => <div key={shipment.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-medium">{shipment.trackingNo || "Takip numarası yok"}</div><div className="mt-1 text-xs text-muted-foreground">{shipment.status} · ETA {formatDate(shipment.eta)}</div></div>)}{opportunityShipments.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><div className="text-sm text-muted-foreground">Sevkiyat yok.</div><Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 sm:min-h-8" onClick={revealProcessActions}>Sevkiyat oluştur</Button></div>}</CardContent></Card>
                <Card><CardHeader className="pb-3"><CardTitle className="inline-flex items-center gap-2 text-sm"><FileClock className="size-4" /> Teslim</CardTitle></CardHeader><CardContent className="space-y-2">{opportunityDeliveries.map((delivery) => <div key={delivery.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-medium">{delivery.status}</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(delivery.date)} · {delivery.signedBy || "İmza bekliyor"}</div></div>)}{opportunityDeliveries.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><div className="text-sm text-muted-foreground">Teslim kaydı yok.</div><Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 sm:min-h-8" onClick={revealProcessActions}>Teslim kaydı oluştur</Button></div>}</CardContent></Card>
                <Card><CardHeader className="pb-3"><CardTitle className="inline-flex items-center gap-2 text-sm"><Wrench className="size-4" /> Kurulum</CardTitle></CardHeader><CardContent className="space-y-2">{opportunityInstallations.map((installation) => <div key={installation.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-medium">{installation.statusName}</div><div className="mt-1 text-xs text-muted-foreground">{installation.technician || "Teknisyen atanmadı"} · {formatDate(installation.scheduledDate)}</div></div>)}{opportunityInstallations.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><div className="text-sm text-muted-foreground">Kurulum kaydı yok.</div><Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 sm:min-h-8" onClick={revealProcessActions}>Kurulum oluştur</Button></div>}</CardContent></Card>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="files" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
            <DocumentPanel
              documents={opportunityDocuments}
              uploadAction={hasPermission("files.create")
                ? <DocumentUploadDialog defaultSalesCaseId={sc.id} defaultCompanyId={sc.customerId} trigger={<Button size="sm">Dosya yükle</Button>} />
                : undefined}
              onDownload={onDownloadDocument}
              onPreview={(document) => void previewDocument(document)}
            />
            <Card><CardHeader className="pb-3"><CardTitle className="inline-flex items-center gap-2 text-base"><ShieldCheck className="size-4" /> Onay geçmişi</CardTitle></CardHeader><CardContent className="space-y-2">{(detail?.approvals ?? []).map((approval) => <div key={approval.id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><div className="text-sm font-medium">{APPROVAL_LABELS[approval.approvalType] ?? approval.approvalType}</div><Badge variant="outline">{approval.status}</Badge></div><div className="mt-1 text-[10px] text-muted-foreground">{approval.decidedByUser?.fullName ?? approval.decidedByUser?.email ?? "Karar bekliyor"} · {formatDate(approval.decidedAt ?? approval.updatedAt, true)}</div>{(approval.decisionNote || approval.note) && <div className="mt-2 text-xs text-muted-foreground">{approval.decisionNote || approval.note}</div>}</div>)}{!detailLoading && (detail?.approvals ?? []).length === 0 && <EmptyState>Onay kaydı yok.</EmptyState>}</CardContent></Card>
          </div>
          <Card><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle className="inline-flex items-center gap-2 text-base"><Clock3 className="size-4" /> Değişiklik günlüğü</CardTitle><p className="mt-1 text-xs text-muted-foreground">Bu kayda ait son 100 denetlenebilir değişiklik; hassas alanlar maskelenir.</p></div><Button variant="outline" size="sm" onClick={() => void loadDetail()} disabled={detailLoading}><RefreshCw className={`size-4 ${detailLoading ? "animate-spin" : ""}`} /></Button></CardHeader><CardContent className="space-y-3">{(detail?.auditHistory ?? []).map((audit) => <div key={audit.id} className="grid gap-1 border-l-2 border-slate-200 pl-3 sm:grid-cols-[180px_1fr]"><div className="text-[10px] text-muted-foreground">{formatDate(audit.createdAt, true)}<br />{audit.actor?.fullName ?? audit.actor?.email ?? "Sistem"}</div><div><div className="text-sm font-medium">{AUDIT_ACTION_LABELS[audit.action] ?? audit.action}</div>{auditDetail(audit.oldValues, audit.newValues, userNames) && <div className="mt-1 break-words text-xs leading-5 text-muted-foreground">{auditDetail(audit.oldValues, audit.newValues, userNames)}</div>}</div></div>)}{!detailLoading && (detail?.auditHistory ?? []).length === 0 && <EmptyState>Değişiklik günlüğü kaydı yok.</EmptyState>}</CardContent></Card>
        </TabsContent>
      </Tabs>
      </RecordWorkspaceShell>
    </div>
  );
}
