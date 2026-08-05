import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  History,
  Loader2,
  LockKeyhole,
  Pencil,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  type OpportunityProcessActionKey,
  type OpportunityProcessReadiness,
  type PipelineStageCode,
  type QualificationStageCode,
  type ProcessTarget,
} from "@haksan/shared";
import { toast } from "sonner";
import { opportunityService } from "../../../lib/services";
import {
  QUALIFICATION_STAGE_DESCRIPTIONS,
  QUALIFICATION_STAGE_LABELS,
  salesStageLabel,
  type SalesCase,
} from "../../lib/mock";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Textarea } from "../ui/textarea";
import {
  OPPORTUNITY_OPERATION_GROUP_STEPS,
  operationGroupForStage,
} from "./opportunityProcessGroups";

const APPROVAL_LABELS: Record<string, string> = {
  payment: "Ödeme",
  customs: "Gümrük",
  invoice: "Fatura",
  installation: "Kurulum",
  win: "WIN",
};

const OPERATION_GROUPS: QualificationStageCode[] = ["lead", "c", "b", "a", "a_plus", "win"];

type SelectedPanelTab = "requirements" | "detail" | "history";

function operationGroupForTarget(target: ProcessTarget): QualificationStageCode | null {
  if (target.axis === "qualification") {
    const qualificationCode = target.code as QualificationStageCode;
    return OPERATION_GROUPS.includes(qualificationCode) ? qualificationCode : null;
  }

  return operationGroupForStage(target.code as PipelineStageCode);
}

export type OpportunityProcessDetail = {
  processReadiness?: OpportunityProcessReadiness;
  history?: Array<Record<string, any>>;
  qualificationHistory?: Array<Record<string, any>>;
};

export function OpportunityProcessCenter({
  salesCase,
  canUpdate,
  canPerformAction,
  onRefresh,
  onAction,
  detail: controlledDetail,
  loading: controlledLoading,
  onReload,
}: {
  salesCase: SalesCase;
  canUpdate: boolean;
  canPerformAction?: (actionKey: OpportunityProcessActionKey) => boolean;
  onRefresh: () => Promise<unknown>;
  onAction: (actionKey: OpportunityProcessActionKey) => void;
  detail?: OpportunityProcessDetail | null;
  loading?: boolean;
  onReload?: () => Promise<void>;
}) {
  const controlled = controlledDetail !== undefined;
  const [localDetail, setLocalDetail] = useState<OpportunityProcessDetail | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [selected, setSelected] = useState<ProcessTarget | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<QualificationStageCode | null>(null);
  const [selectedPanelTab, setSelectedPanelTab] = useState<SelectedPanelTab>("requirements");
  const [reason, setReason] = useState("");
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    if (controlled) {
      await onReload?.();
      return;
    }
    setLocalLoading(true);
    try {
      const next = await opportunityService.get(salesCase.id);
      setLocalDetail(next);
      setSelected((current) => {
        if (!current || !next.processReadiness) return null;
        return (
          next.processReadiness.targets.find(
            (target: ProcessTarget) => target.axis === current.axis && target.code === current.code
          ) ?? null
        );
      });
    } catch (error: any) {
      toast.error("Süreç bilgisi alınamadı", {
        description: error?.message ?? "Fırsat detayları yüklenemedi.",
      });
    } finally {
      setLocalLoading(false);
    }
  }, [controlled, onReload, salesCase.id]);

  useEffect(() => {
    if (!controlled) void load();
  }, [controlled, load, salesCase.stage, salesCase.qualificationStage]);

  const detail = controlled ? controlledDetail : localDetail;
  const loading = controlledLoading ?? localLoading;

  useEffect(() => {
    if (!controlled || !detail?.processReadiness) return;
    setSelected((current) => {
      if (!current) return null;
      return detail.processReadiness?.targets.find(
        (target) => target.axis === current.axis && target.code === current.code,
      ) ?? null;
    });
  }, [controlled, detail]);

  const readiness = detail?.processReadiness;
  const qualificationTargets = useMemo(
    () => readiness?.targets.filter((target) => target.axis === "qualification") ?? [],
    [readiness]
  );
  const operationTargets = useMemo(
    () => readiness?.targets.filter((target) => target.axis === "operation") ?? [],
    [readiness]
  );

  useEffect(() => {
    if (!readiness) return;
    const qualificationCode = readiness.currentQualificationStage as QualificationStageCode;
    const currentGroup =
      (OPERATION_GROUPS.includes(qualificationCode) ? qualificationCode : null) ??
      operationGroupForStage(readiness.currentOperationStage);
    setExpandedGroup(currentGroup);
  }, [readiness?.currentOperationStage, readiness?.currentQualificationStage]);

  const selectTarget = (target: ProcessTarget) => {
    setSelected(target);
    setSelectedPanelTab("requirements");
    setExpandedGroup(operationGroupForTarget(target));
    setReason("");
  };

  const openProcessAction = (actionKey: OpportunityProcessActionKey) => {
    const qualificationCode = readiness?.currentQualificationStage as
      | QualificationStageCode
      | undefined;
    if (qualificationCode && OPERATION_GROUPS.includes(qualificationCode)) {
      setExpandedGroup(qualificationCode);
    }
    setSelected(null);
    setReason("");
    onAction(actionKey);
  };

  const move = async () => {
    if (!selected || selected.direction === "current" || !selected.selectable || moving) return;
    if (selected.requiresReason && !reason.trim()) {
      toast.error("Geri geçiş gerekçesi zorunludur");
      return;
    }
    setMoving(true);
    try {
      if (selected.axis === "qualification") {
        await opportunityService.changeQualificationStage(salesCase.id, {
          toStage: selected.code as any,
          note: reason.trim() || undefined,
        });
      } else {
        await opportunityService.changeStage(salesCase.id, {
          toStage: selected.code as any,
          changeReason: reason.trim() || undefined,
        });
      }
      toast.success(selected.direction === "backward" ? "Süreç geri alındı" : "Süreç hedefe taşındı", {
        description:
          selected.axis === "qualification"
            ? QUALIFICATION_STAGE_LABELS[selected.code as keyof typeof QUALIFICATION_STAGE_LABELS]
            : salesStageLabel(selected.code as any),
      });
      setSelected(null);
      setReason("");
      await onRefresh();
      await load();
    } catch (error: any) {
      const blockers =
        error?.details?.blockerLabels ??
        error?.response?.data?.error?.details?.blockerLabels ??
        error?.details?.blockers ??
        error?.response?.data?.error?.details?.blockers;
      toast.error("Geçiş tamamlanamadı", {
        description:
          Array.isArray(blockers) && blockers.length
            ? blockers
                .map((blocker) => (typeof blocker === "string" ? blocker : blocker?.label))
                .filter(Boolean)
                .join(" · ")
            : error?.message ?? "Gereklilikleri kontrol edin.",
      });
      await load();
    } finally {
      setMoving(false);
    }
  };

  if (loading && !readiness) {
    return (
      <Card className="border-primary/20">
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Süreç merkezi yükleniyor…
        </CardContent>
      </Card>
    );
  }
  if (!readiness) return null;

  // Kapanış (LOST / İptal) derecelerin doğrusal sırasında yer almaz: backend hem
  // QUALIFICATION_SEQUENCE'i lead→…→win olarak kurar hem de PIPELINE_STAGE_FLOW'dan
  // `cancelled`i çıkarır, dolayısıyla bu eksenlere hiç hedef üretilmez. Kapanış
  // rayın SONUNA ayrı bir dal olarak çizilir: WIN gibi terminaldir ama akışın devamı
  // değil, ondan ayrılan olumsuz sonuçtur. Kart kapanışa yalnız kayıp nedeni
  // istenerek taşınabildiği için (LostCaseDialog) bu düğüm seçilebilir değildir —
  // salt göstergedir, kartın gerçekten kapandığı durumda "buradasınız" işaretini taşır.
  const closingBranch = (label: string, description: string, active: boolean) => (
    <li className="flex items-start">
      <span
        className={`mt-[22px] w-5 shrink-0 border-t border-dashed ${
          active ? "border-destructive/60" : "border-border"
        }`}
        aria-hidden
      />
      <div
        className="flex w-[104px] flex-col items-center rounded-lg px-1 py-1.5 text-center"
        aria-current={active ? "step" : undefined}
      >
        <span
          className={`grid size-8 place-items-center rounded-full border transition ${
            active
              ? "border-destructive bg-destructive text-destructive-foreground ring-4 ring-destructive/10"
              : "border-destructive/30 bg-destructive/5 text-destructive/60"
          }`}
        >
          <XCircle className="size-4" />
        </span>
        <span
          className={`mt-1.5 max-w-[100px] text-[10px] leading-tight ${
            active ? "font-semibold text-destructive" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        <span className="mt-0.5 max-w-[100px] text-[9px] leading-tight text-muted-foreground">
          {description}
        </span>
      </div>
    </li>
  );

  const isLost = readiness.currentQualificationStage === "lost";
  const isCancelled = readiness.currentOperationStage === "cancelled";

  const renderRail = (
    label: string,
    targets: ProcessTarget[],
    labelFor: (target: ProcessTarget) => string,
    terminal?: ReactNode
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <div className="text-[10px] text-muted-foreground">Bir hedef seçin</div>
      </div>
      <div className="overflow-x-auto pb-2">
        <ol className="flex min-w-max items-start" aria-label={label}>
          {targets.map((target, index) => {
            const current = target.direction === "current";
            const past = target.direction === "backward";
            const isSelected = selected?.axis === target.axis && selected.code === target.code;
            return (
              <li key={`${target.axis}-${target.code}`} className="flex items-start">
                <button
                  id={`process-target-${target.axis}-${target.code}`}
                  type="button"
                  aria-current={current ? "step" : undefined}
                  aria-pressed={isSelected}
                  aria-expanded={isSelected && target.direction !== "current" ? true : undefined}
                  aria-controls={isSelected && target.direction !== "current" ? `selected-target-${target.axis}-${target.code}` : undefined}
                  // Kapanmış kartta hiçbir hedef seçilemez; düğmeyi açık bırakmak
                  // hiçbir şey yapmayan bir "Hedefe taşı" akışı açıyordu.
                  disabled={current || !target.selectable}
                  onClick={() => selectTarget(target)}
                  className="group flex w-[104px] flex-col items-center rounded-lg px-1 py-1.5 text-center outline-none transition hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span
                    className={`grid size-8 place-items-center rounded-full border text-[10px] font-semibold transition ${
                      current
                        ? "border-primary bg-primary text-white ring-4 ring-primary/10"
                        : isSelected
                          ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/15"
                          : past
                            ? "border-success/50 bg-success/10 text-success"
                            : target.canTransition
                              ? "border-primary/40 bg-white text-primary"
                              : "border-border bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {current ? <CircleAlert className="size-4" /> : past ? <Check className="size-4" /> : index + 1}
                  </span>
                  <span className={`mt-1.5 max-w-[100px] text-[10px] leading-tight ${current || isSelected ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    {labelFor(target)}
                  </span>
                  {!current && target.direction === "forward" && target.blockers.length > 0 && (
                    <span className="mt-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                      {target.blockers.length} eksik
                    </span>
                  )}
                </button>
                {index < targets.length - 1 && (
                  <span
                    className={`mt-[22px] h-px w-5 shrink-0 ${past ? "bg-success/60" : "bg-border"}`}
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
          {terminal}
        </ol>
      </div>
    </div>
  );

  const renderSelectedTargetPanel = (target: ProcessTarget) => {
    if (target.direction === "current") return null;

    const targetLabel =
      target.axis === "qualification"
        ? QUALIFICATION_STAGE_LABELS[target.code as keyof typeof QUALIFICATION_STAGE_LABELS]
        : salesStageLabel(target.code as any);
    const panelId = `selected-target-${target.axis}-${target.code}`;
    const tabOrder: SelectedPanelTab[] = ["requirements", "detail", "history"];
    const tabLabels: Record<SelectedPanelTab, string> = {
      requirements: "Gereklilikler",
      detail: "Detay",
      history: "Geçmiş",
    };
    const focusTargetButton = () => {
      setSelected(null);
      window.requestAnimationFrame(() => {
        document.getElementById(`process-target-${target.axis}-${target.code}`)?.focus();
      });
    };
    const selectPanelTab = (tab: SelectedPanelTab, focus = false) => {
      setSelectedPanelTab(tab);
      if (focus) {
        window.requestAnimationFrame(() => {
          document.getElementById(`${panelId}-tab-${tab}`)?.focus();
        });
      }
    };

    return (
      <section
        id={panelId}
        role="region"
        aria-label={`Seçili hedef: ${targetLabel}`}
        data-selected-target-panel
        className="mx-2 mb-2 mt-1 overflow-hidden rounded-lg border border-primary/20 bg-slate-50/80"
      >
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-3 py-3 sm:px-4">
          <div>
            <div className="text-xs font-semibold">Seçili hedef · {targetLabel}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {target.direction === "backward"
                ? "Kayıtlar korunur; etkilenen onaylar yeniden değerlendirmeye alınır."
                : "Hedefe kadar olan bütün gereklilikler tek seferde kontrol edilir."}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Badge variant="outline">
              {target.direction === "backward" ? "Geri dönüş" : "İleri hedef"}
            </Badge>
            <Badge variant={target.blockers.length ? "secondary" : "outline"}>
              {target.blockers.length ? `${target.blockers.length} eksik` : "Geçiş hazır"}
            </Badge>
          </div>
        </div>

        <div
          role="tablist"
          aria-label={`${targetLabel} hedef ayrıntıları`}
          className="flex min-h-11 items-end gap-1 border-b border-border/60 px-3 sm:px-4"
        >
          {tabOrder.map((tab) => (
            <button
              key={tab}
              id={`${panelId}-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={selectedPanelTab === tab}
              aria-controls={`${panelId}-tabpanel`}
              tabIndex={selectedPanelTab === tab ? 0 : -1}
              onClick={() => selectPanelTab(tab)}
              onKeyDown={(event) => {
                const currentIndex = tabOrder.indexOf(tab);
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  selectPanelTab(tabOrder[(currentIndex + 1) % tabOrder.length], true);
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  selectPanelTab(tabOrder[(currentIndex - 1 + tabOrder.length) % tabOrder.length], true);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  selectPanelTab(tabOrder[0], true);
                } else if (event.key === "End") {
                  event.preventDefault();
                  selectPanelTab(tabOrder[tabOrder.length - 1], true);
                }
              }}
              className={`min-h-11 border-b-2 px-3 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${
                selectedPanelTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        <div
          id={`${panelId}-tabpanel`}
          role="tabpanel"
          aria-labelledby={`${panelId}-tab-${selectedPanelTab}`}
          className="p-3 sm:p-4"
        >
          {selectedPanelTab === "requirements" && (
            target.blockers.length > 0 ? (
              <ul className="grid gap-2 lg:grid-cols-2">
                {target.blockers.map((blocker) => {
                  const actionDisabled = !canUpdate || canPerformAction?.(blocker.actionKey) === false;
                  return (
                    <li
                      key={blocker.key}
                      className="flex min-w-0 flex-col gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <CircleAlert className="size-4 shrink-0 text-amber-600" />
                        <span className="min-w-0 text-xs font-medium">{blocker.label}</span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11 shrink-0 gap-1 px-3 text-xs sm:min-h-8"
                        disabled={actionDisabled}
                        aria-describedby={actionDisabled ? `${panelId}-${blocker.key}-disabled` : undefined}
                        onClick={() => openProcessAction(blocker.actionKey)}
                      >
                        <Pencil className="size-3" /> {blocker.actionKey === "create_quote" ? "Teklif oluştur" : "Yap"}
                      </Button>
                      {actionDisabled && (
                        <span id={`${panelId}-${blocker.key}-disabled`} className="sr-only">
                          Bu işlem için gerekli yetkiniz bulunmuyor.
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/5 px-3 py-3 text-xs font-medium text-success">
                <Check className="size-4" /> Bu hedefin bütün gereklilikleri tamamlandı.
              </div>
            )
          )}

          {selectedPanelTab === "detail" && (
            <dl className="grid gap-3 rounded-lg border border-border/60 bg-white p-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Hedef türü</dt>
                <dd className="mt-1 font-semibold">{target.axis === "qualification" ? "Satış alanı" : "Operasyon"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Yön</dt>
                <dd className="mt-1 font-semibold">{target.direction === "backward" ? "Geri dönüş" : "İleri geçiş"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Durum</dt>
                <dd className="mt-1 font-semibold">{target.blockers.length ? `${target.blockers.length} eksik` : "Hazır"}</dd>
              </div>
            </dl>
          )}

          {selectedPanelTab === "history" && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-white p-3">
              {target.axis === "qualification" ? (
                <>
                  {(detail?.qualificationHistory ?? []).slice(0, 4).map((item) => (
                    <div key={item.id} className="flex flex-wrap items-start gap-x-2 text-[11px]">
                      <span className="font-semibold">
                        {item.fromStage
                          ? QUALIFICATION_STAGE_LABELS[item.fromStage as keyof typeof QUALIFICATION_STAGE_LABELS]
                          : "Başlangıç"}{" "}
                        → {QUALIFICATION_STAGE_LABELS[item.toStage as keyof typeof QUALIFICATION_STAGE_LABELS]}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString("tr-TR")}
                      </span>
                      {item.changeReason && <span className="w-full text-muted-foreground">{item.changeReason}</span>}
                    </div>
                  ))}
                  {(detail?.qualificationHistory ?? []).length === 0 && (
                    <div className="text-xs text-muted-foreground">Henüz satış alanı geçişi kaydı yok.</div>
                  )}
                </>
              ) : (
                <>
                  {(detail?.history ?? []).slice(0, 4).map((item) => (
                    <div key={item.id} className="flex flex-wrap items-start gap-x-2 text-[11px]">
                      <span className="font-semibold">
                        {item.fromStage?.name ?? (item.fromStage?.code ? salesStageLabel(item.fromStage.code) : "Başlangıç")}{" "}
                        → {item.toStage?.name ?? salesStageLabel(item.toStage?.code ?? item.toStageCode)}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString("tr-TR")}
                      </span>
                      {(item.changeReason || item.notes) && (
                        <span className="w-full text-muted-foreground">{item.changeReason || item.notes}</span>
                      )}
                    </div>
                  ))}
                  {(detail?.history ?? []).length === 0 && (
                    <div className="text-xs text-muted-foreground">Henüz operasyon geçişi kaydı yok.</div>
                  )}
                </>
              )}
            </div>
          )}

          {target.requiresReason && (
            <div className="mt-3 space-y-2">
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
                placeholder="Geri dönüş gerekçesini yazın…"
                aria-label="Geri dönüş gerekçesi"
                className="min-h-20 bg-white text-xs"
              />
              {target.invalidatedApprovals.length > 0 && (
                <div className="text-[11px] text-amber-800">
                  Yeniden onaya alınacak:{" "}
                  <b>{target.invalidatedApprovals.map((type) => APPROVAL_LABELS[type] ?? type).join(", ")}</b>
                </div>
              )}
            </div>
          )}

          <div aria-live="polite" className="sr-only">
            {moving ? "Hedefe taşınıyor" : target.blockers.length ? `${target.blockers.length} gereklilik eksik` : "Hedefe geçiş hazır"}
          </div>
          <div className="mt-3 flex flex-col-reverse gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-8" onClick={focusTargetButton}>
              Vazgeç
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-11 gap-1.5 sm:min-h-8"
              disabled={
                !canUpdate ||
                moving ||
                target.blockers.length > 0 ||
                (target.requiresReason && !reason.trim())
              }
              onClick={() => void move()}
            >
              {moving ? (
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
              ) : target.direction === "backward" ? (
                <RotateCcw className="size-3.5" />
              ) : (
                <ArrowRight className="size-3.5" />
              )}
              {moving ? "Taşınıyor…" : "Hedefe taşı"}
            </Button>
          </div>
        </div>
      </section>
    );
  };

  const renderOperationGroups = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
        <div>
          <div className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Satış alanlarına göre operasyon
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Her operasyon adımı ait olduğu satış alanının altında gösterilir.
          </p>
        </div>
        <div className="text-[10px] text-muted-foreground">Bir operasyon hedefi seçin</div>
      </div>
      <div className="space-y-2">
        {OPERATION_GROUPS.map((qualificationCode) => {
          const stepCodes = OPPORTUNITY_OPERATION_GROUP_STEPS[qualificationCode];
          const targets = stepCodes
            .map((code) => operationTargets.find((target) => target.code === code))
            .filter((target): target is ProcessTarget => Boolean(target));
          const activeGroup = readiness.currentQualificationStage === qualificationCode;
          const isExpanded = expandedGroup === qualificationCode;
          const selectedGroup = selected ? operationGroupForTarget(selected) : null;
          const containsSelectedTarget = selectedGroup === qualificationCode && selected?.direction !== "current";
          const groupPanelId = `operation-group-${qualificationCode}`;
          const toggleGroup = () => {
            const nextGroup = expandedGroup === qualificationCode ? null : qualificationCode;
            if (selected && operationGroupForTarget(selected) !== nextGroup) {
              setSelected(null);
              setReason("");
            }
            setExpandedGroup(nextGroup);
          };

          return (
            <section
              key={qualificationCode}
              className={`scroll-mt-24 overflow-hidden rounded-xl border bg-card transition-colors ${
                activeGroup || containsSelectedTarget
                  ? "border-primary/45 ring-2 ring-primary/5"
                  : "border-border/65"
              }`}
            >
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={groupPanelId}
                onClick={toggleGroup}
                className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                  activeGroup ? "bg-primary/5" : "bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">
                    {QUALIFICATION_STAGE_LABELS[qualificationCode]}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {QUALIFICATION_STAGE_DESCRIPTIONS[qualificationCode]}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant={activeGroup ? "default" : "outline"} className="text-[9px]">
                    {targets.length > 0 ? `${targets.length} adım` : "Operasyon yok"}
                  </Badge>
                  <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden />
                </span>
              </button>
              {isExpanded && (
                <div id={groupPanelId}>
                  {targets.length > 0 ? (
                    <ol className="p-2" aria-label={`${QUALIFICATION_STAGE_LABELS[qualificationCode]} operasyonları`}>
                      {targets.map((target, index) => {
                        const current = target.direction === "current";
                        const past = target.direction === "backward";
                        const isSelected = selected?.axis === target.axis && selected.code === target.code;
                        return (
                          <li key={target.code} className="relative">
                            {index > 0 && (
                              <span
                                className={`absolute -top-2 left-[17px] h-2 w-px ${past || current ? "bg-success/55" : "bg-border"}`}
                                aria-hidden
                              />
                            )}
                            <button
                              id={`process-target-${target.axis}-${target.code}`}
                              type="button"
                              aria-current={current ? "step" : undefined}
                              aria-pressed={isSelected}
                              aria-expanded={isSelected && target.direction !== "current" ? true : undefined}
                              aria-controls={isSelected && target.direction !== "current" ? `selected-target-${target.axis}-${target.code}` : undefined}
                              disabled={current || !target.selectable}
                              onClick={() => selectTarget(target)}
                              className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${isSelected ? "bg-primary/8" : "hover:bg-muted/45 disabled:hover:bg-transparent"}`}
                            >
                              <span
                                className={`grid size-7 shrink-0 place-items-center rounded-full border text-[9px] font-semibold ${
                                  current
                                    ? "border-primary bg-primary text-white ring-2 ring-primary/10"
                                    : past
                                      ? "border-success/45 bg-success/10 text-success"
                                      : target.canTransition
                                        ? "border-primary/35 bg-white text-primary"
                                        : "border-border bg-muted/45 text-muted-foreground"
                                }`}
                              >
                                {current ? <CircleAlert className="size-3.5" /> : past ? <Check className="size-3.5" /> : index + 1}
                              </span>
                              <span className={`min-w-0 flex-1 text-xs leading-tight ${current || isSelected ? "font-semibold text-primary" : "font-medium text-foreground/75"}`}>
                                {salesStageLabel(target.code as any)}
                              </span>
                              {!current && target.direction === "forward" && target.blockers.length > 0 && (
                                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">
                                  {target.blockers.length} eksik
                                </span>
                              )}
                            </button>
                            {isSelected && renderSelectedTargetPanel(target)}
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <div className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
                      Bu alanda operasyon adımı yok.
                    </div>
                  )}
                  {containsSelectedTarget && selected?.axis === "qualification" && renderSelectedTargetPanel(selected)}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {isCancelled && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <XCircle className="size-4" /> Fırsat operasyon akışı iptal aşamasında.
        </div>
      )}
    </div>
  );

  return (
    <Card className="overflow-hidden border-primary/20 shadow-sm">
      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Fırsat süreç merkezi</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Satış alanı ve operasyon adımı birlikte doğrulanır; tamamlanmamış gereklilikler atlanamaz.
            </p>
          </div>
          {readiness.closed && (
            <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800">
              <LockKeyhole className="size-3" /> Önce Geri Aç
            </Badge>
          )}
        </div>

        {renderRail(
          "Satış alanları",
          qualificationTargets,
          (target) => QUALIFICATION_STAGE_LABELS[target.code as keyof typeof QUALIFICATION_STAGE_LABELS],
          closingBranch(QUALIFICATION_STAGE_LABELS.lost, QUALIFICATION_STAGE_DESCRIPTIONS.lost, isLost)
        )}
        {renderOperationGroups()}

        {detail?.qualificationHistory?.length ? (
          <details className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium">
              <History className="size-3.5 text-primary" />
              Son geçişler
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                {detail.qualificationHistory.length} kayıt
              </span>
            </summary>
            <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
              {detail.qualificationHistory.slice(0, 4).map((item) => (
                <div key={item.id} className="flex flex-wrap items-start gap-x-2 text-[11px]">
                  <span className="font-semibold">
                    {item.fromStage
                      ? QUALIFICATION_STAGE_LABELS[item.fromStage as keyof typeof QUALIFICATION_STAGE_LABELS]
                      : "Başlangıç"}{" "}
                    → {QUALIFICATION_STAGE_LABELS[item.toStage as keyof typeof QUALIFICATION_STAGE_LABELS]}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString("tr-TR")}
                  </span>
                  {item.changeReason && (
                    <span className="w-full text-muted-foreground">{item.changeReason}</span>
                  )}
                </div>
              ))}
            </div>
          </details>
        ) : null}

      </CardContent>
    </Card>
  );
}
