import { useCallback, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Textarea } from "../ui/textarea";
import { cn } from "../ui/utils";

/**
 * Madde işareti üretici. Basılan belgede ödeme/teslimat/garanti maddeleri
 * `a) b) c)`, düz not listeleri ise `1. 2. 3.` ile numaralanır; ekrandaki
 * işaret hangi belgeye yazılıyorsa onunla aynı olmalıdır.
 */
export type LineMarkerStyle = "decimal" | "alpha";

/** CSS `lower-alpha` davranışı: a…z, sonra aa, ab… */
const alphaMarker = (index: number): string => {
  let value = index;
  let out = "";
  do {
    out = String.fromCharCode(97 + (value % 26)) + out;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return `${out})`;
};

export const lineMarker = (style: LineMarkerStyle, index: number): string =>
  style === "alpha" ? alphaMarker(index) : `${index + 1}.`;

/** Belgeye basılacak madde sayısı — boş satırlar basılmaz. */
export const markedLineCount = (value: string): number =>
  value.split(/\r?\n/).filter((line) => line.trim()).length;

type Props = Omit<ComponentProps<typeof Textarea>, "value"> & {
  value: string;
  markerStyle?: LineMarkerStyle;
};

/**
 * Her satırı bir "madde" sayan metin kutusu: solundaki şeritte, satırın
 * belgede alacağı madde işareti yazar. Oluşturma ekranında numara hiç
 * görünmediği için kullanıcı "kaçıncı madde" olduğunu ancak PDF'i basınca
 * öğreniyordu.
 *
 * Boş satırlar belgeye basılmaz (bkz. print/quotePrint.ts#enteredLines), bu
 * yüzden sayaç yalnız dolu satırlarda ilerler — ekranda görülen numara
 * çıktıdakiyle birebir aynıdır.
 *
 * Hizalama ölçümle bulunur: metin kutusuyla aynı yazı tipi, satır yüksekliği
 * ve genişliğe sahip görünmez bir ayna, her satırın sarma sonrası gerçek
 * yüksekliğini verir. Sabit satır yüksekliği varsaymak, uzun maddeler iki
 * satıra sardığında numaraları kaydırıyordu.
 */
export function NumberedLinesTextarea({
  value,
  markerStyle = "decimal",
  className,
  onScroll,
  ...rest
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [markers, setMarkers] = useState<{ top: number; label: string }[]>([]);
  const [scrollTop, setScrollTop] = useState(0);

  const lines = value.split(/\r?\n/);

  // `ui/textarea` forwardRef kullanmıyor; ref yerine kapsayıcıdan okunuyor.
  const textareaOf = (root: HTMLDivElement | null) => root?.querySelector("textarea") ?? null;

  const measure = useCallback(() => {
    const area = textareaOf(rootRef.current);
    const mirror = mirrorRef.current;
    if (!area || !mirror) return;
    const style = window.getComputedStyle(area);
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.fontStyle = style.fontStyle;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.width = `${
      area.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
    }px`;

    // Metnin ilk satırı kenarlık + üst boşluk kadar aşağıdan başlar.
    const offset = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.paddingTop) || 0);
    const sourceLines = area.value.split(/\r?\n/);
    const next: { top: number; label: string }[] = [];
    let printed = 0;
    Array.from(mirror.children).forEach((child, index) => {
      if (!sourceLines[index]?.trim()) return;
      next.push({ top: offset + (child as HTMLElement).offsetTop, label: lineMarker(markerStyle, printed) });
      printed += 1;
    });
    setMarkers(next);
  }, [markerStyle]);

  useLayoutEffect(() => {
    measure();
  }, [measure, value]);

  useLayoutEffect(() => {
    const area = textareaOf(rootRef.current);
    if (!area || typeof ResizeObserver === "undefined") return;
    // Kutu genişliği değişince (pencere, yan panel, mobil kırılım) sarma
    // noktaları da değişir; ölçüm yenilenmezse işaretler eski satırda kalır.
    const observer = new ResizeObserver(() => measure());
    observer.observe(area);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className="relative" ref={rootRef}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-px left-px w-8 overflow-hidden rounded-l-md border-r border-border/60 bg-muted/40"
      >
        <div className="relative h-full" style={{ transform: `translateY(${-scrollTop}px)` }}>
          {markers.map((marker) => (
            <span
              key={`${marker.label}-${marker.top}`}
              className="absolute right-1.5 text-[11px] text-muted-foreground tabular-nums"
              style={{ top: marker.top }}
            >
              {marker.label}
            </span>
          ))}
        </div>
      </div>

      <Textarea {...rest} value={value} className={cn("pl-10", className)} onScroll={(event) => {
        setScrollTop(event.currentTarget.scrollTop);
        onScroll?.(event);
      }} />

      {/* Ölçüm aynası: metin kutusuyla aynı kutu ölçülerinde, görünmez. */}
      <div
        ref={mirrorRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre-wrap break-words"
      >
        {lines.map((line, index) => (
          // Boş satırın da yüksekliği olmalı; aksi hâlde sonraki maddenin
          // ölçülen konumu yukarı kayar.
          <div key={index}>{line || "​"}</div>
        ))}
      </div>
    </div>
  );
}
