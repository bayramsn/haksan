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
    <header className="relative flex min-h-[88px] shrink-0 flex-col items-start justify-center gap-3 overflow-hidden border-b border-border/70 bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between md:px-6">
      <div className="datum-rail absolute inset-x-0 top-0 h-1" aria-hidden="true" />
      <div className="min-w-0 pt-1">
        <nav aria-label="Sayfa yolu" className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          <span>Haksan</span>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span>{scopeLabel}</span>
          <ChevronRight className="hidden size-3 sm:block" aria-hidden="true" />
          <span className="hidden text-foreground/70 sm:block" aria-current="page">{title}</span>
        </nav>
        <h1 className="mt-1 truncate font-display text-[28px] font-bold leading-none tracking-[-0.01em] text-foreground sm:text-[30px]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl truncate text-[13px] leading-tight text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0">{actions}</div> : null}
    </header>
  );
}
