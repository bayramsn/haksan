import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Building2,
  Factory,
  Gauge,
  Headphones,
  LogIn,
  PackageCheck,
  ShieldCheck,
  SkipForward,
  Volume2,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

export const ONBOARDING_STORAGE_KEY = "haksan:onboarding:v1";

const STORY_DURATION_SECONDS = 20;
const DEFAULT_CORPORATE_URL = "https://www.haksanmakina.com.tr";

const STORY_MARKERS = [
  { progress: 0, time: 0 },
  { progress: 0.15, time: 1.5 },
  { progress: 0.32, time: 5.6 },
  { progress: 0.46, time: 8.4 },
  { progress: 0.67, time: 13.5 },
  { progress: 0.86, time: 17.4 },
  { progress: 1, time: 20 },
] as const;

type Chapter = {
  id: string;
  no: string;
  start: number;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  result: string;
  scene: string;
  preview?: string;
  previewAlt?: string;
  icon: typeof Factory;
};

const CHAPTERS: Chapter[] = [
  {
    id: "vision",
    no: "01",
    start: 0,
    label: "Genel bakış",
    eyebrow: "Haksan üretim sistemi",
    title: "Her büyük iş, net bir görüşle başlar.",
    description: "Sahadaki emek, müşteri beklentisi ve yönetim hedefi aynı operasyon resminde buluşur.",
    result: "İşi yukarıdan görün; ayrıntıyı kaybetmeyin.",
    scene: "/onboarding/scene-01.webp",
    icon: Gauge,
  },
  {
    id: "organization",
    no: "02",
    start: 0.15,
    label: "Tek merkez",
    eyebrow: "Ortak operasyon dili",
    title: "Üretim sahası, müşteriler ve ekipler aynı hedefte.",
    description: "Dashboard, organizasyon ve yetki yapısı; herkesin kendi sorumluluğunu aynı güncel veriden görmesini sağlar.",
    result: "Yönetim güncel tabloyu, ekipler sıradaki işi görür.",
    scene: "/onboarding/scene-02.webp",
    preview: "/onboarding/crm-dashboard.webp",
    previewAlt: "Haksan Atelier CRM gösterge paneli",
    icon: Building2,
  },
  {
    id: "sales",
    no: "03",
    start: 0.32,
    label: "Satış",
    eyebrow: "İlk temastan onaya",
    title: "İlk temastan onaylı teklife.",
    description: "Firmalar, satış kartları, görüşmeler ve teklifler aynı zaman çizgisinde ilerler.",
    result: "Satış ekibi fırsatları kaybetmez.",
    scene: "/onboarding/scene-03.webp",
    preview: "/onboarding/crm-sales.webp",
    previewAlt: "Haksan Atelier CRM satış kanbanı",
    icon: Factory,
  },
  {
    id: "operations",
    no: "04",
    start: 0.46,
    label: "Operasyon",
    eyebrow: "Uçtan uca iş akışı",
    title: "Siparişten üretime, stoktan sevkiyata.",
    description: "Ürün, stok, satın alma, sevkiyat ve kurulum kayıtları tek operasyon akışında birbirine bağlanır.",
    result: "Operasyon teslim tarihini önceden görür.",
    scene: "/onboarding/scene-04.webp",
    preview: "/onboarding/crm-operations.webp",
    previewAlt: "Haksan Atelier CRM sevkiyat ve operasyon ekranı",
    icon: PackageCheck,
  },
  {
    id: "service",
    no: "05",
    start: 0.67,
    label: "Servis",
    eyebrow: "Makine yaşam döngüsü",
    title: "Teslimattan sonra da makinenin yanındayız.",
    description: "Makine dosyası, garanti, servis talebi, SLA ve saha geçmişi teknisyenin önünde hazırdır.",
    result: "Servis, makinenin tüm geçmişine ulaşır.",
    scene: "/onboarding/scene-05.webp",
    preview: "/onboarding/crm-service.webp",
    previewAlt: "Haksan Atelier CRM servis talebi ve makine özeti",
    icon: Wrench,
  },
  {
    id: "result",
    no: "06",
    start: 0.86,
    label: "Sonuç",
    eyebrow: "Haksan Atelier CRM",
    title: "İşlenmiş veri. Ölçülebilir performans. Net karar.",
    description: "Satıştan servise, üretimden finansa bütün operasyon tek merkezde.",
    result: "Yönetim kararını güncel veriden verir.",
    scene: "/onboarding/scene-06.webp",
    preview: "/onboarding/crm-reports.webp",
    previewAlt: "Haksan Atelier CRM yönetim raporları",
    icon: BarChart3,
  },
];

type ConnectionWithSaveData = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

type NavigatorWithConnection = Navigator & {
  connection?: ConnectionWithSaveData;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function onboardingTimeForProgress(progress: number): number {
  const normalized = clamp(progress);
  for (let index = 0; index < STORY_MARKERS.length - 1; index += 1) {
    const current = STORY_MARKERS[index];
    const next = STORY_MARKERS[index + 1];
    if (normalized <= next.progress) {
      const segmentProgress = (normalized - current.progress) / (next.progress - current.progress || 1);
      return current.time + (next.time - current.time) * segmentProgress;
    }
  }
  return STORY_DURATION_SECONDS;
}

export function shouldShowOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has("resetToken")) return false;
  if (params.get("intro") === "1") return true;
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "seen";
  } catch {
    return true;
  }
}

export function markOnboardingSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen");
  } catch {
    // Storage engellense bile kullanıcı login akışına devam edebilir.
  }
  const url = new URL(window.location.href);
  if (url.searchParams.has("intro")) {
    url.searchParams.delete("intro");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }
}

function activeChapterIndex(progress: number) {
  let active = 0;
  CHAPTERS.forEach((chapter, index) => {
    if (progress >= chapter.start) active = index;
  });
  return active;
}

export function OnboardingPage({ onFinish }: { onFinish: () => void }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const targetProgressRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [soundOpen, setSoundOpen] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [scrubEnabled, setScrubEnabled] = useState(false);
  const reducedMotion = useReducedMotion();
  const activeChapter = CHAPTERS[activeIndex];
  const ActiveChapterIcon = activeChapter.icon;
  const isFinal = activeIndex === CHAPTERS.length - 1;
  const corporateUrl = import.meta.env.VITE_CORPORATE_SITE_URL?.trim() || DEFAULT_CORPORATE_URL;

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    const connection = (navigator as NavigatorWithConnection).connection;
    const updateMode = () => {
      const slowConnection = connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g";
      setScrubEnabled(desktopQuery.matches && !reducedMotion && !slowConnection && !videoFailed);
    };
    updateMode();
    desktopQuery.addEventListener("change", updateMode);
    connection?.addEventListener?.("change", updateMode);
    return () => {
      desktopQuery.removeEventListener("change", updateMode);
      connection?.removeEventListener?.("change", updateMode);
    };
  }, [reducedMotion, videoFailed]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const stage = stageRef.current;
    if (!scroller || !stage) return;

    let frame = 0;
    let smoothProgress = targetProgressRef.current;
    let lastSeekAt = 0;

    const measureProgress = () => {
      const scrollRange = Math.max(1, stage.scrollHeight - scroller.clientHeight);
      const nextProgress = clamp(scroller.scrollTop / scrollRange);
      targetProgressRef.current = nextProgress;
      const nextChapter = activeChapterIndex(nextProgress);
      setActiveIndex((current) => (current === nextChapter ? current : nextChapter));
      if (!frame) frame = window.requestAnimationFrame(renderFrame);
    };

    const renderFrame = (now: number) => {
      const target = targetProgressRef.current;
      const distance = target - smoothProgress;
      smoothProgress = Math.abs(distance) < 0.0005 ? target : smoothProgress + distance * 0.18;

      if (progressFillRef.current) {
        progressFillRef.current.style.transform = `scaleY(${Math.max(0.008, smoothProgress)})`;
      }
      if (timeRef.current) {
        timeRef.current.textContent = `${onboardingTimeForProgress(smoothProgress).toFixed(1)} sn`;
      }

      const video = videoRef.current;
      if (scrubEnabled && video && video.readyState >= 1 && now - lastSeekAt > 42) {
        const desiredTime = Math.min(video.duration || STORY_DURATION_SECONDS, onboardingTimeForProgress(smoothProgress));
        if (!video.seeking && Math.abs(video.currentTime - desiredTime) > 0.035) {
          video.currentTime = desiredTime;
          lastSeekAt = now;
        }
      }

      if (Math.abs(target - smoothProgress) > 0.0005) {
        frame = window.requestAnimationFrame(renderFrame);
      } else {
        frame = 0;
      }
    };

    scroller.addEventListener("scroll", measureProgress, { passive: true });
    window.addEventListener("resize", measureProgress);
    measureProgress();
    return () => {
      scroller.removeEventListener("scroll", measureProgress);
      window.removeEventListener("resize", measureProgress);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [scrubEnabled]);

  const goToChapter = useCallback((chapter: Chapter) => {
    const scroller = scrollerRef.current;
    const stage = stageRef.current;
    if (!scroller || !stage) return;
    const scrollRange = Math.max(1, stage.scrollHeight - scroller.clientHeight);
    scroller.scrollTo({ top: chapter.start * scrollRange, behavior: reducedMotion ? "auto" : "smooth" });
  }, [reducedMotion]);

  const chapterDots = useMemo(() => CHAPTERS.map((chapter) => ({ id: chapter.id, start: chapter.start })), []);

  return (
    <div
      ref={scrollerRef}
      data-testid="onboarding-root"
      role="region"
      tabIndex={0}
      className="h-full w-full overflow-y-auto overflow-x-hidden bg-[#111111] text-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Haksan Atelier ürün tanıtımı"
    >
      <div ref={stageRef} className="relative h-[600svh] min-h-[3600px]">
        <section className="sticky top-0 h-[100svh] min-h-[540px] overflow-hidden bg-[#f4f3ef]">
          <motion.div
            className="absolute overflow-hidden bg-[#111111] shadow-[0_28px_80px_rgba(0,0,0,0.28)]"
            initial={false}
            animate={isFinal
              ? { left: "3.5vw", right: "51.5vw", top: "14vh", bottom: "7vh", borderRadius: "14px" }
              : { left: "0vw", right: "0vw", top: "0vh", bottom: "0vh", borderRadius: "0px" }}
            transition={{ duration: reducedMotion ? 0 : 0.72, ease: [0.22, 1, 0.36, 1] }}
          >
            {scrubEnabled ? (
              <video
                ref={videoRef}
                muted
                playsInline
                preload="auto"
                poster="/onboarding/haksan-story-poster.webp"
                aria-hidden="true"
                tabIndex={-1}
                onError={() => setVideoFailed(true)}
                onLoadedMetadata={(event) => {
                  event.currentTarget.pause();
                  event.currentTarget.currentTime = onboardingTimeForProgress(targetProgressRef.current);
                }}
                className="absolute inset-0 h-full w-full object-cover object-center"
              >
                <source src="/onboarding/haksan-story-desktop.webm" type="video/webm" />
                <source src="/onboarding/haksan-story-desktop.mp4" type="video/mp4" />
              </video>
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.img
                  key={activeChapter.scene}
                  src={activeChapter.scene}
                  alt=""
                  aria-hidden="true"
                  initial={{ opacity: 0, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.5 }}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                />
              </AnimatePresence>
            )}
            <motion.div
              className="pointer-events-none absolute inset-0 bg-black"
              animate={{ opacity: isFinal ? 0.2 : activeIndex === 0 ? 0.32 : 0.43 }}
              transition={{ duration: 0.45 }}
            />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-[62%] bg-[linear-gradient(90deg,rgba(0,0,0,0.62),rgba(0,0,0,0))]" />
          </motion.div>

          <motion.header
            className="absolute inset-x-0 top-0 z-40 flex h-[76px] items-center justify-between border-b border-white/15 px-5 text-white md:px-8 lg:px-10"
            animate={{ backgroundColor: isFinal ? "rgba(17,17,17,0.96)" : "rgba(17,17,17,0.28)" }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-4">
              <img src="/brand/haksan-logo-white.png" alt="Haksan Makina" className="h-10 w-auto md:h-11" />
              <span className="hidden h-7 w-px bg-white/25 sm:block" />
              <span className="hidden font-data text-[10px] uppercase tracking-[0.19em] text-white/70 sm:block">Sahadan karara · 20 saniye</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSoundOpen(true)}
                className="hidden h-10 items-center gap-2 rounded-md border border-white/25 bg-black/20 px-3 text-xs text-white transition-colors hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:flex"
              >
                <Headphones className="size-4" /> Filmi sesli izle
              </button>
              <button
                type="button"
                data-testid="onboarding-skip"
                onClick={onFinish}
                className="flex h-10 items-center gap-2 rounded-md border border-white/25 bg-black/35 px-3 text-xs text-white transition-colors hover:border-white hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Tanıtımı geç <SkipForward className="size-4" />
              </button>
            </div>
          </motion.header>

          <aside className="absolute bottom-[11vh] left-5 top-[14vh] z-30 hidden w-[84px] flex-col items-center xl:flex" aria-label="Onboarding bölümleri">
            <div className="font-data text-[9px] uppercase tracking-[0.2em] text-white/60">İlerleme</div>
            <div className="relative mt-4 min-h-0 flex-1">
              <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-white/30" />
              <div
                ref={progressFillRef}
                data-testid="onboarding-progress"
                className="absolute bottom-0 left-1/2 top-0 w-[2px] origin-top -translate-x-1/2 scale-y-[0.008] bg-[#e32119] will-change-transform"
              />
              {chapterDots.map((dot, index) => (
                <button
                  key={dot.id}
                  type="button"
                  onClick={() => goToChapter(CHAPTERS[index])}
                  aria-label={`${CHAPTERS[index].label} bölümüne git`}
                  className={`absolute left-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border font-data text-[9px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${index === activeIndex ? "border-[#e32119] bg-[#e32119] text-white" : "border-white/45 bg-[#111111]/75 text-white/70 hover:border-white"}`}
                  style={{ top: `${dot.start * 100}%` }}
                >
                  {CHAPTERS[index].no}
                </button>
              ))}
            </div>
            <span ref={timeRef} className="mt-4 font-data text-[10px] tabular-nums text-white/75">0.0 sn</span>
          </aside>

          <div className="absolute left-5 right-5 top-[92px] z-30 flex items-center gap-1 xl:hidden" aria-hidden="true">
            {CHAPTERS.map((chapter, index) => (
              <span key={chapter.id} className={`h-0.5 flex-1 transition-colors ${index <= activeIndex ? "bg-[#e32119]" : "bg-white/35"}`} />
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {!isFinal && (
              <motion.div
                key={activeChapter.id}
                initial={{ opacity: 0, y: reducedMotion ? 0 : 22 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reducedMotion ? 0 : -16 }}
                transition={{ duration: reducedMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-[9vh] left-5 z-20 max-w-[620px] pr-4 md:left-[8vw] md:bottom-[10vh] xl:left-[9vw]"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="font-data text-xs font-semibold text-[#ff3b34]">{activeChapter.no}</span>
                  <span className="h-px w-10 bg-[#e32119]" />
                  <span className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">{activeChapter.eyebrow}</span>
                </div>
                <h1 className="max-w-[610px] text-[clamp(2.65rem,5vw,5.4rem)] font-bold leading-[0.9] tracking-[-0.025em] text-white [text-wrap:balance]">
                  {activeChapter.title}
                </h1>
                <p className="mt-5 max-w-[560px] text-sm leading-6 text-white/78 md:text-base md:leading-7">{activeChapter.description}</p>
                <div className="mt-5 inline-flex items-center gap-3 border-l-2 border-[#e32119] bg-black/35 px-4 py-2.5 text-sm text-white">
                  <ActiveChapterIcon className="size-4 shrink-0" />
                  <span>{activeChapter.result}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait" initial={false}>
            {!isFinal && activeChapter.preview && (
              <motion.figure
                key={activeChapter.preview}
                initial={{ opacity: 0, x: reducedMotion ? 0 : 42, scale: 0.985 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: reducedMotion ? 0 : 24 }}
                transition={{ duration: reducedMotion ? 0 : 0.48, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-[3.5vw] top-[17vh] z-20 hidden w-[min(48vw,790px)] overflow-hidden rounded-[10px] border border-white/30 bg-[#f4f3ef] shadow-[0_32px_90px_rgba(0,0,0,0.38)] md:block"
              >
                <figcaption className="flex items-center justify-between border-b border-black/10 px-4 py-3 text-[#111111]">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[#e32119]" />
                    <span className="font-data text-[9px] font-semibold uppercase tracking-[0.16em]">Haksan Atelier CRM · {activeChapter.label}</span>
                  </div>
                  <span className="font-data text-[9px] text-black/50">CANLI OPERASYON GÖRÜNÜMÜ</span>
                </figcaption>
                <img src={activeChapter.preview} alt={activeChapter.previewAlt} className="block aspect-[16/10] w-full object-cover object-top" loading="lazy" />
              </motion.figure>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {isFinal && (
              <motion.div
                initial={{ opacity: 0, x: reducedMotion ? 0 : 48 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.62, delay: reducedMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-0 right-0 top-[76px] z-20 flex w-full items-center bg-[#f4f3ef] px-5 py-8 text-[#111111] md:w-[50%] md:px-[5vw]"
              >
                <div className="mx-auto w-full max-w-[620px]">
                  <div className="flex items-center gap-3 font-data text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e32119]">
                    <BarChart3 className="size-4" /> Haksan Atelier CRM
                  </div>
                  <h1 className="mt-4 text-[clamp(3rem,5.4vw,6.4rem)] font-bold leading-[0.88] tracking-[-0.035em] [text-wrap:balance]">İşlenmiş veri.<br />Net karar.</h1>
                  <p className="mt-5 max-w-[520px] text-base leading-7 text-black/65 md:text-lg">Satıştan servise, üretimden finansa bütün operasyon tek merkezde.</p>

                  <div className="mt-7 grid grid-cols-2 border-y border-black/15 py-4 font-data text-[10px] uppercase tracking-[0.12em] text-black/55 sm:grid-cols-4">
                    <span>Satış</span><span>Operasyon</span><span>Servis</span><span>Finans</span>
                  </div>

                  <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      data-testid="onboarding-login"
                      onClick={onFinish}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#111111] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#e32119] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e32119] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4f3ef]"
                    >
                      <LogIn className="size-4" /> CRM’e giriş yap <ArrowRight className="size-4" />
                    </button>
                    <a
                      href={corporateUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-black/25 px-5 text-sm font-semibold text-[#111111] transition-colors hover:border-black hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]"
                    >
                      Haksan’ı keşfet <ArrowRight className="size-4" />
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSoundOpen(true)}
                    className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-black/60 underline decoration-black/25 underline-offset-4 transition-colors hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]"
                  >
                    <Volume2 className="size-4" /> 20 saniyelik filmi sesli izle
                  </button>

                  <div className="mt-8 flex items-start gap-3 border-t border-black/15 pt-4 text-xs leading-5 text-black/55">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-black" />
                    <span>Rol bazlı yetki, denetim kaydı ve güvenli oturum mevcut giriş altyapısıyla korunur.</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isFinal && (
            <div className="absolute bottom-5 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-2 font-data text-[9px] uppercase tracking-[0.18em] text-white/65 md:flex">
              Hikâyeyi ilerletmek için kaydırın <ArrowDown className="size-3.5 animate-bounce motion-reduce:animate-none" />
            </div>
          )}
        </section>
      </div>

      <Dialog open={soundOpen} onOpenChange={setSoundOpen}>
        <DialogContent className="w-[min(960px,calc(100vw-1rem))] max-w-none overflow-hidden border-white/15 bg-[#111111] p-0 text-white sm:max-w-none">
          <div className="border-b border-white/15 px-5 py-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white"><Headphones className="size-5 text-[#e32119]" /> Sahadaki emekten, ölçülebilir sonuca</DialogTitle>
              <DialogDescription className="text-white/60">20 saniyelik Haksan üretim filmi</DialogDescription>
            </DialogHeader>
          </div>
          {soundOpen && (
            <video controls autoPlay playsInline preload="metadata" poster="/onboarding/haksan-story-poster.webp" className="aspect-video w-full bg-black">
              <source src="/onboarding/haksan-story-audio.mp4" type="video/mp4" />
            </video>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
