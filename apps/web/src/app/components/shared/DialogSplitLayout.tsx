import { ReactNode } from "react";
import { cn } from "../ui/utils";

/**
 * Popup içi "sol içerik + sağ yapışkan özet panel" düzeni. Yalnızca yerleşimdir:
 * mevcut JSX blokları slot'lanır, state/handler'lara dokunulmaz.
 *
 * Sticky'nin çalışması için en yakın scroll atası DialogContent (veya dialog body
 * div'i) olmalı; araya overflow-hidden ya da transform'lu bir sarmalayıcı girerse
 * sticky bozulur. `minmax(0,1fr)` + `min-w-0` sol kolondaki tablo/grid taşmasını önler.
 *
 * Sabit yükseklikli, pinned-tabs dialoglar (ör. ServiceDetailDialog) bu grid'i DEĞİL
 * "panes" reçetesini kullanır:
 *   <div className="flex flex-1 min-h-0 flex-col-reverse lg:flex-row">
 *     <Tabs className="flex flex-1 min-h-0 flex-col min-w-0">...</Tabs>
 *     <aside className="shrink-0 space-y-4 border-b lg:border-b-0 lg:border-l
 *       border-border/60 bg-muted/20 px-5 py-4 overflow-y-auto max-h-[38dvh]
 *       lg:max-h-none lg:w-[300px] xl:w-[320px]">...</aside>
 *   </div>
 */
export function DialogSplitLayout({
  children,
  aside,
  asideFirstOnMobile = false,
  className,
  asideClassName,
}: {
  children: ReactNode;
  aside: ReactNode;
  /** Detay dialogları: mobilde özet panel üstte görünsün (DOM sırası değişmez). */
  asideFirstOnMobile?: boolean;
  className?: string;
  asideClassName?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_308px] lg:gap-5 lg:items-start",
        className
      )}
    >
      <div className="min-w-0 space-y-5 lg:order-1">{children}</div>
      <aside
        className={cn(
          "space-y-3 lg:order-2 lg:sticky lg:top-0 lg:self-start",
          asideFirstOnMobile && "order-first lg:order-2",
          asideClassName
        )}
      >
        {aside}
      </aside>
    </div>
  );
}

/** Sağ paneldeki başlıklı kart. */
export function DialogSidebarSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3", className)}>
      {title && (
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      )}
      {children}
    </div>
  );
}
