import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CircleAlert, Loader2, LockKeyhole, Pencil, XCircle } from "lucide-react";
import {
  type OpportunityProcessActionKey,
  type OpportunityProcessReadiness,
  type ProcessTarget,
} from "@haksan/shared";
import { toast } from "sonner";
import { opportunityService } from "../../../lib/services";
import {
  QUALIFICATION_STAGE_DESCRIPTIONS,
  QUALIFICATION_STAGE_LABELS,
  type QualificationStage,
  type SalesCase,
} from "../../lib/mock";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";

const stageLabel = (code: string | undefined) =>
  code ? QUALIFICATION_STAGE_LABELS[code as QualificationStage] ?? code : "";
const stageDescription = (code: string | undefined) =>
  code ? QUALIFICATION_STAGE_DESCRIPTIONS[code as QualificationStage] ?? "" : "";

/** Sunucudan gelen geçiş hatasının engel etiketlerini tek satıra indirger. */
function blockerMessage(error: any): string {
  const blockers =
    error?.details?.blockerLabels ??
    error?.response?.data?.error?.details?.blockerLabels ??
    error?.details?.blockers ??
    error?.response?.data?.error?.details?.blockers;
  if (Array.isArray(blockers) && blockers.length) {
    return blockers
      .map((blocker) => (typeof blocker === "string" ? blocker : blocker?.label))
      .filter(Boolean)
      .join(" · ");
  }
  return error?.message ?? "Gereklilikleri kontrol edin.";
}

export type OpportunityProcessDetail = {
  processReadiness?: OpportunityProcessReadiness;
  history?: Array<Record<string, any>>;
  qualificationHistory?: Array<Record<string, any>>;
};

/**
 * Alan görevleri panelinin (`ProcessChecklistPanel`) yuvası.
 *
 * Görevler artık satış alanı kutusunun İÇİNDE. Ama paneli mount eden üst
 * bileşenler (SalesCaseDetail / OpportunityWorkspace) engel düğmelerinin
 * isteğini (`requestedAction`) ve dialog açan aksiyonları kendi state'lerine
 * bağlamış durumda; paneli buradan yeniden mount etmek o bağı koparır ve engel
 * düğmeleri yine sessizce hiçbir şey yapmazdı. Bu yüzden panel üst bileşende
 * kalır, yalnız içeriğini `createPortal` ile bu yuvaya taşır.
 *
 * Yuva fırsat kimliğine göre yayımlanır: sayfa ve dialog aynı anda açıksa her
 * panel kendi kartının yuvasını bulur.
 */
const checklistSlots = new Map<string, HTMLElement>();
const checklistSlotListeners = new Set<() => void>();

function publishChecklistSlot(caseId: string, node: HTMLElement | null) {
  if (node) {
    if (checklistSlots.get(caseId) === node) return;
    checklistSlots.set(caseId, node);
  } else if (!checklistSlots.delete(caseId)) {
    return;
  }
  checklistSlotListeners.forEach((listener) => listener());
}

/** `useSyncExternalStore` aboneliği: yuva mount/unmount olunca panel yeniden render olur. */
export function subscribeChecklistSlot(listener: () => void) {
  checklistSlotListeners.add(listener);
  return () => {
    checklistSlotListeners.delete(listener);
  };
}

/** Yuva düğümü; kutu mount değilse ya da hazırlık verisi yoksa null. */
export function getChecklistSlot(caseId: string): HTMLElement | null {
  return checklistSlots.get(caseId) ?? null;
}

/**
 * Fırsatın satış alanı kutusu.
 *
 * Kutu kartın şu anki satış alanını (C / B / A / A+ / WIN) gösterir, alanın
 * görev listesini içinde barındırır (yukarıdaki yuva) ve bir sonraki alana
 * ilerletir. İlerletme düğmesi TEKTİR ve buradadır: kapalı kart, sunucunun
 * ürettiği engeller ve Lead dönüştürme akışı yalnız burada eksiksiz biliniyor.
 * Hedef seçimi, ileri/geri atlama ve operasyon ekseni bilinçli olarak yoktur —
 * alan yalnız sırayla ilerler.
 */
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
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    if (controlled) {
      await onReload?.();
      return;
    }
    setLocalLoading(true);
    try {
      setLocalDetail(await opportunityService.get(salesCase.id));
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
  const readiness = detail?.processReadiness;

  // Satış alanları backend'de doğrusal sırayla (lead → … → win) üretildiği için
  // ilk "forward" nitelik hedefi her zaman bir SONRAKİ alandır. Atlamalı hedefler
  // gösterilmediğinden listenin geri kalanına bakılmaz.
  const nextTarget = useMemo<ProcessTarget | null>(
    () =>
      readiness?.targets.find(
        (target) => target.axis === "qualification" && target.direction === "forward",
      ) ?? null,
    [readiness],
  );

  const blockers = nextTarget?.blockers ?? [];
  const currentStage = readiness?.currentQualificationStage;
  const closed = Boolean(readiness?.closed);
  const isLost = currentStage === "lost";

  const checklistSlotRef = useCallback(
    (node: HTMLDivElement | null) => {
      publishChecklistSlot(salesCase.id, node);
    },
    [salesCase.id],
  );

  const advance = async () => {
    if (!canUpdate || advancing || !nextTarget || closed || blockers.length > 0) return;
    // Lead → C, firma/kontak kurulumunu da yapan ayrı bir dönüştürme akışıdır;
    // doğrudan derece değişimi o akışı atlayıp yarım kart bırakırdı.
    if (currentStage === "lead") {
      document.querySelector<HTMLButtonElement>('[data-workspace-primary="convert"]')?.click();
      return;
    }
    setAdvancing(true);
    try {
      await opportunityService.changeQualificationStage(salesCase.id, {
        toStage: nextTarget.code as any,
      });
      toast.success("Satış alanı ilerletildi", {
        description: `${stageLabel(nextTarget.code)} alanına geçildi`,
      });
      await onRefresh();
      await load();
    } catch (error: any) {
      toast.error("İlerletilemedi", { description: blockerMessage(error) });
      await load();
    } finally {
      setAdvancing(false);
    }
  };

  const advanceDisabled = !canUpdate || advancing || closed || blockers.length > 0;
  // Lead'de ilerletme, dönüştürme akışını açar; düğme yaptığı işi söylemeli.
  const advanceLabel =
    currentStage === "lead" ? "Fırsata dönüştür" : `${stageLabel(nextTarget?.code)} alanına geç`;

  // Kaldırılan hedef panelinin tablist'iyle birlikte onun canlı bölgesi de gitti;
  // durum değişimini duyuran tek yer artık burası. Bölge, yükleme ve "veri yok"
  // dallarında da render edilir; çünkü AT'ler yalnız ÖNCEDEN var olan bir canlı
  // bölgenin sonraki değişimlerini okur — bölge içerikle birlikte eklenirse ilk
  // durum sessizce kaçar. Bu yüzden erken dönüşlerin ÜSTÜNDE hesaplanıyor.
  const liveAnnouncement = (() => {
    if (!readiness) return "";
    if (advancing) return `${stageLabel(nextTarget?.code)} alanına geçiliyor`;
    const base = `Şu anki satış alanı: ${stageLabel(currentStage)}`;
    if (isLost) return `${base}. Kart kaybedildi olarak kapatıldı.`;
    if (closed) return `${base}. Kart kapalı, önce geri açılmalı.`;
    if (!nextTarget) return `${base}. Sonraki alan yok.`;
    return blockers.length
      ? `${base}. ${stageLabel(nextTarget.code)} alanına geçmek için ${blockers.length} gereklilik eksik.`
      : `${base}. ${stageLabel(nextTarget.code)} alanına geçiş hazır.`;
  })();

  const liveRegion = <div aria-live="polite" className="sr-only">{liveAnnouncement}</div>;

  if (loading && !readiness) {
    return (
      <Card className="border-primary/20">
        {liveRegion}
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Satış alanı yükleniyor…
        </CardContent>
      </Card>
    );
  }
  // Veri yokken kutu çizilmez ama canlı bölge DOM'da kalır: hazırlık sonradan
  // gelirse ilk durum "bölge zaten vardı" diye duyurulabilsin. Yuva bilerek
  // mount edilmez; görevler o durumda kendi yerinde görünür kalır.
  if (!readiness) return liveRegion;

  return (
    <Card className="overflow-hidden border-primary/20 shadow-sm">
      {liveRegion}
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Satış alanı
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-2xl font-semibold leading-none text-primary">
                {stageLabel(currentStage)}
              </span>
              <span className="text-xs text-muted-foreground">{stageDescription(currentStage)}</span>
            </div>
            {nextTarget && !isLost && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Sıradaki alan: <b className="font-medium text-foreground">{stageLabel(nextTarget.code)}</b>
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {closed && (
              <Badge variant="outline" className="gap-1 border-warning/40 bg-warning-soft text-warning">
                <LockKeyhole className="size-3" /> Önce Geri Aç
              </Badge>
            )}
            {!isLost && nextTarget && (
              <Badge variant={blockers.length ? "secondary" : "outline"}>
                {blockers.length ? `${blockers.length} eksik` : "Geçişe hazır"}
              </Badge>
            )}
          </div>
        </div>

        {isLost ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3 text-xs font-medium text-destructive">
            <XCircle className="size-4" /> Kart kaybedildi olarak kapatıldı; alan ilerletilemez.
          </div>
        ) : !nextTarget ? (
          <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success-soft px-3 py-3 text-xs font-medium text-success">
            <Check className="size-4" /> Fırsat son satış alanında; ilerletilecek alan kalmadı.
          </div>
        ) : blockers.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold">
              {stageLabel(nextTarget.code)} alanına geçmek için eksik gereklilikler
            </div>
            <ul className="grid gap-2 lg:grid-cols-2">
              {blockers.map((blocker) => {
                const actionDisabled = !canUpdate || canPerformAction?.(blocker.actionKey) === false;
                return (
                  <li
                    key={blocker.key}
                    className="flex min-w-0 flex-col gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 sm:flex-row sm:items-center"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <CircleAlert className="size-4 shrink-0 text-warning" />
                      <span className="min-w-0 text-xs font-medium">{blocker.label}</span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11 shrink-0 gap-1 bg-card px-3 text-xs sm:min-h-8"
                      disabled={actionDisabled}
                      aria-describedby={actionDisabled ? `process-blocker-${blocker.key}-disabled` : undefined}
                      onClick={() => onAction(blocker.actionKey)}
                    >
                      <Pencil className="size-3" />
                      {blocker.actionKey === "create_quote" ? "Teklif oluştur" : "Yap"}
                    </Button>
                    {actionDisabled && (
                      <span id={`process-blocker-${blocker.key}-disabled`} className="sr-only">
                        Bu işlem için gerekli yetkiniz bulunmuyor.
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success-soft px-3 py-3 text-xs font-medium text-success">
            <Check className="size-4" /> Bu alanın bütün gereklilikleri tamamlandı.
          </div>
        )}

        {/*
          Alan görevleri kutunun içinde: panel üst bileşende mount kalır,
          içeriğini bu yuvaya portal'lar. Panel yoksa yuva boş kalır ve
          `empty:hidden` sayesinde ne çerçeve ne boşluk bırakır. Tam genişlik
          (-mx) tasarımı görevleri kutunun kendi bölümü gibi gösterir.
        */}
        <div
          ref={checklistSlotRef}
          data-process-checklist-slot=""
          className="-mx-4 scroll-mt-24 border-t border-border/60 bg-muted/20 empty:hidden sm:-mx-5"
        />

        {nextTarget && !isLost && (
          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[11px] text-muted-foreground">
              {closed
                ? "Kapalı kartta alan değiştirilemez."
                : blockers.length
                  ? "Eksikleri yukarıdaki alan görevlerinden tamamlayın; ardından ilerletme açılır."
                  : "Bu alanın gereklilikleri tamam; ilerletebilirsiniz."}
            </span>
            <Button
              type="button"
              size="sm"
              className="min-h-11 gap-1.5 sm:min-h-8"
              disabled={advanceDisabled}
              onClick={() => void advance()}
            >
              {advancing ? (
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <ArrowRight className="size-3.5" />
              )}
              {advancing ? "İlerletiliyor…" : advanceLabel}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
