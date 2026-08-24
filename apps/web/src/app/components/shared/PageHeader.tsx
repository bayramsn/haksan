import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  scopeLabel,
  actions,
}: {
  title: string;
  subtitle?: string;
  scopeLabel: string;
  actions?: ReactNode;
}) {
  return (
    <header className="relative flex min-h-[92px] shrink-0 flex-col items-start justify-center gap-3 overflow-hidden border-b border-border/70 bg-card/95 px-4 py-4 shadow-[0_10px_30px_-30px_rgba(13,20,68,0.6)] backdrop-blur sm:flex-row sm:items-center sm:justify-between md:px-6">
      <div className="datum-rail absolute inset-x-0 top-0 h-1" aria-hidden="true" />
      <div className="min-w-0 pt-1">
        <nav aria-label="Sayfa yolu" className="flex items-center gap-1 text-xs font-semibold tracking-[0.04em] text-muted-foreground">
          <span>Haksan</span>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span>{scopeLabel}</span>
          <ChevronRight className="hidden size-3 sm:block" aria-hidden="true" />
          <span className="hidden text-foreground/70 sm:block" aria-current="page">{title}</span>
        </nav>
        <h1 className="mt-1 whitespace-normal break-words text-balance font-display text-[28px] font-bold leading-none tracking-[-0.015em] text-foreground sm:truncate sm:text-[31px]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl whitespace-normal break-words text-sm leading-tight text-muted-foreground sm:truncate">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex w-full max-w-full shrink-0 flex-wrap items-center gap-2 pb-0.5 sm:w-auto sm:flex-nowrap sm:overflow-x-auto sm:pb-0">{actions}</div> : null}
    </header>
  );
}
