import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarClock, Check, Loader2, LockKeyhole, MoreHorizontal, XCircle } from "lucide-react";
import {
  type OpportunityProcessReadiness,
  type ProcessCheck,
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
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

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
  onRefresh,
  detail: controlledDetail,
  loading: controlledLoading,
  onReload,
  onMarkLost,
  onFollowUp,
  onCloseOpportunity,
  checklist,
  headerPortalId,
}: {
  salesCase: SalesCase;
  canUpdate: boolean;
  /** Aşama şeridini popup içindeki sabit başlık yuvasında gösterir. */
  headerPortalId?: string;
  onRefresh: () => Promise<unknown>;
  detail?: OpportunityProcessDetail | null;
  loading?: boolean;
  onReload?: () => Promise<void>;
  /** Kartı kaybedildi olarak işaretleme akışını açar; yetki üst bileşende kontrol edilir. */
  onMarkLost?: () => void;
  /** Kartı kapatmadan gelecekteki bir tarihe görevle taşır. */
  onFollowUp?: () => void;
  /** WIN kararından sonra gerekçeli kapatma penceresini açar. */
  onCloseOpportunity?: () => void;
  /**
   * Mevcut alanın görev listesi (`ProcessChecklistPanel`). Üst bileşende
   * yaratılır ki dış operasyon kısayollarının `requestedAction` bağı korunsun, ama
   * kutunun içinde render edilir.
   *
   * Render prop olmasının nedeni `reload`: görev kaydedildiğinde kutunun kendi
   * `processReadiness` verisi de tazelenmeli, yoksa görev tikli görünürken kutu
   * eski engeli göstermeye devam eder.
   */
  checklist?: (context: {
    reload: () => Promise<void>;
    /** Ray'dan başka bir alan seçiliyse o alanın görevleri; mevcut alanda undefined. */
    checks?: ProcessCheck[];
    /** İleri alanlar yalnız önizleme. */
    readOnly: boolean;
  }) => ReactNode;
}) {
  const controlled = controlledDetail !== undefined;
  const [localDetail, setLocalDetail] = useState<OpportunityProcessDetail | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [headerPortalTarget, setHeaderPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHeaderPortalTarget(headerPortalId ? document.getElementById(headerPortalId) : null);
  }, [headerPortalId, salesCase.id]);

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
  const isDisqualified = currentStage === "lead" && salesCase.leadFollowUpStatus === "disqualified";

  /**
   * Ray'dan görüntülenmek üzere seçilen alan; null ise mevcut alan.
   * Seçim yalnız GÖRÜNTÜLEMEYİ değiştirir — ilerletme hâlâ tek adım ileri ve
   * yalnız engeller temizken. Kart değişince seçim mevcut alana döner.
   */
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  useEffect(() => setSelectedStage(null), [salesCase.id]);

  /** Nitelik ekseninin alanları, backend sırasıyla (lead → … → win). */
  const qualificationTargets = useMemo(
    () => (readiness?.targets ?? []).filter((target) => target.axis === "qualification" && target.code !== "lost"),
    [readiness],
  );

  /**
   * Görevler alan başına. Backend düz listede her kontrolü `qualificationStage`
   * ile etiketliyor, bu yüzden gruplama istemcide yapılabiliyor — geçmiş bir
   * alanın görevlerini göstermek için ek istek gerekmiyor.
   */
  const checksByStage = useMemo(() => {
    const map = new Map<string, ProcessCheck[]>();
    (readiness?.checks ?? []).forEach((check) => {
      if (!check.qualificationStage) return;
      const list = map.get(check.qualificationStage) ?? [];
      list.push(check);
      map.set(check.qualificationStage, list);
    });
    return map;
  }, [readiness]);

  const viewedStage = selectedStage ?? currentStage;
  const viewedIsCurrent = viewedStage === currentStage;
  const viewedDirection = qualificationTargets.find((target) => target.code === viewedStage)?.direction;
  // İleri alanlar yalnız önizleme: sırası gelmemiş görevi doldurmak atlamak olur.
  const viewedIsFuture = viewedDirection === "forward";

  const advance = async () => {
    const blockedByRequirements = currentStage !== "lead" && blockers.length > 0;
    if (!canUpdate || advancing || !nextTarget || closed || isDisqualified || blockedByRequirements) return;
    // Lead → C, firma/kontak kurulumunu da yapan ayrı bir dönüştürme akışıdır;
    // doğrudan derece değişimi o akışı atlayıp yarım kart bırakırdı.
    if (currentStage === "lead") {
      document.querySelector<HTMLButtonElement>('[data-workspace-primary="convert"]')?.click();
      return;
    }
    setAdvancing(true);
    try {
      const updated = await opportunityService.changeQualificationStage(salesCase.id, {
        toStage: nextTarget.code as any,
      });
      // WIN'de asıl haber hangi makinenin satıldığıdır; sunucu satılan (onaylanmış)
      // tekliflerden türetip snapshot'lar, burada aynen gösterilir.
      toast.success("Satış alanı ilerletildi", {
        description:
          nextTarget.code === "win" && updated?.wonProductName
            ? `WIN · Satılan makineler: ${updated.wonProductName}`
            : `${stageLabel(nextTarget.code)} alanına geçildi`,
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

  const advanceDisabled = !canUpdate || advancing || closed || isDisqualified
    || (currentStage !== "lead" && blockers.length > 0);
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
    if (isDisqualified) return `${base}. Aday elendi; fırsata dönüştürülemez.`;
    if (closed) return `${base}. Kart kapalı, önce geri açılmalı.`;
    if (!nextTarget) return `${base}. Sonraki alan yok.`;
    if (currentStage === "lead") {
      return `${base}. Fırsata dönüşüm hazır; eksik bilgiler fırsatta tamamlanabilir.`;
    }
    return blockers.length === 0
      ? `${base}. ${stageLabel(nextTarget.code)} alanına geçiş hazır.`
      : `${base}. ${stageLabel(nextTarget.code)} alanına geçmek için ${blockers.length} gereklilik eksik.`;
  })();

  const liveRegion = <div aria-live="polite" className="sr-only">{liveAnnouncement}</div>;

  if (loading && !readiness) {
    return (
      <section aria-label="Satış aşaması" className="py-4">
        {liveRegion}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Satış aşaması yükleniyor…
        </div>
      </section>
    );
  }
  // Canlı bölge veri gelmeden de DOM'da kalır.
  if (!readiness) return liveRegion;

  const stageHeader = (
    <div className="space-y-3" data-opportunity-stage-header>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-muted-foreground">Satış aşaması</span>
        <span className="text-sm font-medium text-foreground">
          {stageLabel(currentStage)}
          {stageDescription(currentStage) && <span className="font-normal text-muted-foreground"> · {stageDescription(currentStage)}</span>}
        </span>
      </div>
      {/* Tıklama yalnız görüntülenen görevleri değiştirir. İlerletme gövdedeki
          tek düğmededir; tamamlanan/mevcut/gelecek durumları metinle de sunulur. */}
      {!isLost && qualificationTargets.length > 0 && (
        <div className="flex items-stretch gap-1 sm:gap-2" role="group" aria-label="Satış alanları">
          {qualificationTargets.map((target) => {
            const isCurrent = target.code === currentStage;
            const isViewed = target.code === viewedStage;
            const done = target.direction === "backward";
            return (
              <button
                key={target.code}
                type="button"
                onClick={() => setSelectedStage(isCurrent ? null : target.code)}
                aria-current={isCurrent ? "step" : undefined}
                aria-pressed={isViewed}
                title={`${stageLabel(target.code)} · ${stageDescription(target.code)}`}
                className={[
                  "inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm",
                  isViewed && !isCurrent ? "ring-2 ring-primary/40 ring-offset-2" : "",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-muted text-foreground hover:bg-muted/70"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted",
                ].join(" ")}
              >
                {done && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
                {stageLabel(target.code)}
                <span className="sr-only">
                  {` · ${stageDescription(target.code)}`}
                  {isCurrent ? " — şu anki alan" : done ? " — tamamlandı" : " — sırası gelmedi"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <section aria-label="Fırsatın yapılacakları" className="space-y-4">
      {liveRegion}
      {headerPortalTarget ? createPortal(stageHeader, headerPortalTarget) : stageHeader}

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Yapılacaklar</h3>
        {!closed && !isLost && nextTarget && (onFollowUp || onMarkLost) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="ghost" className="size-10" aria-label="Diğer fırsat işlemleri" disabled={!canUpdate}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onFollowUp && (
                <DropdownMenuItem onSelect={onFollowUp}>
                  <CalendarClock className="size-4" /> Takibe al
                </DropdownMenuItem>
              )}
              {onMarkLost && (
                <DropdownMenuItem onSelect={onMarkLost} className="text-destructive focus:text-destructive">
                  <XCircle className="size-4" /> Kaybedildi
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!viewedIsCurrent && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            <b className="font-medium text-foreground">{stageLabel(viewedStage)}</b> alanına bakıyorsun
            {viewedIsFuture ? " — sırası gelmedi, yalnız önizleme." : " — tamamlanmış alan, düzeltme yapabilirsin."}
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedStage(null)}>
            Şu anki alana dön
          </Button>
        </div>
      )}

      {isLost ? (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <XCircle className="size-4 shrink-0" /> Kart kaybedildi olarak kapatıldı; alan ilerletilemez.
        </p>
      ) : closed ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LockKeyhole className="size-4 shrink-0" /> Kart kapalı. Düzenlemek için önce geri açın.
        </p>
      ) : !nextTarget ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4 shrink-0" /> Fırsat son satış alanında; ilerletilecek alan kalmadı.
        </p>
      ) : null}

      <div id="opportunity-process-actions" className="scroll-mt-48 empty:hidden">
        {checklist?.({
          reload: load,
          // Detay uçtan gelen kontroller, tüm alanlardaki kapanış koşullarını içerir.
          checks: checksByStage.get(viewedStage ?? "") ?? [],
          readOnly: viewedIsFuture || closed || isLost || isDisqualified,
        })}
      </div>

      {nextTarget && !isLost && (
        <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {closed
              ? "Kapalı kartta alan değiştirilemez."
              : isDisqualified
                ? "Aday elendi; fırsata dönüştürülemez."
              : currentStage === "lead"
                ? "Eksik lead bilgilerini fırsat içinde tamamlayabilirsiniz."
                : blockers.length
                  ? "Eksikleri yukarıdaki alan görevlerinden tamamlayın; ardından ilerletme açılır."
                  : "Bu alanın gereklilikleri tamam; ilerletebilirsiniz."}
          </p>
          <Button
            type="button"
            size="sm"
            className="min-h-11 shrink-0 gap-1.5"
            variant={advanceDisabled ? "outline" : "default"}
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
      {!nextTarget && currentStage === "win" && !closed && onCloseOpportunity && (
        <div className="flex justify-end border-t border-border/60 pt-4">
          <Button type="button" size="sm" className="min-h-11 gap-1.5" disabled={!canUpdate} onClick={onCloseOpportunity}>
            <Check className="size-3.5" /> Fırsatı kapat
          </Button>
        </div>
      )}
    </section>
  );
}
