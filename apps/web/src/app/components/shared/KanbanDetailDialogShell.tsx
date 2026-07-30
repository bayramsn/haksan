import { ReactNode } from "react";
import { cn } from "../ui/utils";

export function KanbanDetailDialogShell({
  accentClassName,
  title,
  subtitle,
  meta,
  actions,
  children,
  rightTitle = "Yorumlar ve etkinlik",
  rightActions,
  right,
  className,
  contentClassName,
  activityClassName,
  bodyClassName,
  mobileFooter,
}: {
  accentClassName?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  rightTitle?: ReactNode;
  rightActions?: ReactNode;
  right: ReactNode;
  className?: string;
  contentClassName?: string;
  activityClassName?: string;
  bodyClassName?: string;
  mobileFooter?: ReactNode;
}) {
  return (
    <div className={cn("flex max-h-[92dvh] min-h-0 flex-col overflow-hidden bg-[#f7f8fa]", className)}>
      <div className={cn("h-1 shrink-0 bg-primary", accentClassName)} />
      <div className="min-w-0 shrink-0 overflow-hidden border-b border-border/70 bg-white px-4 py-4 pr-12 sm:px-6">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-1 font-data text-[9px] font-semibold uppercase tracking-[0.16em] text-operation-blue">Kayıt çalışma alanı</div>
            <h2 className="font-display truncate text-2xl font-semibold leading-none tracking-[-0.01em] text-foreground">{title}</h2>
            {subtitle && <div className="mt-1 line-clamp-2 min-w-0 break-words text-sm text-muted-foreground">{subtitle}</div>}
            {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      <div className={cn("grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_400px]", bodyClassName)}>
        <main className={cn("min-h-0 min-w-0 overflow-x-hidden overflow-y-auto bg-white px-4 py-4 sm:px-6", contentClassName)}>
          {children}
        </main>
        <aside
          className={cn(
            "min-h-0 overflow-y-auto border-t border-border/70 bg-[#f3f4f6] px-4 py-4 lg:border-l lg:border-t-0",
            activityClassName
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0 text-sm font-semibold text-foreground">{rightTitle}</div>
            {rightActions && <div className="shrink-0">{rightActions}</div>}
          </div>
          {right}
        </aside>
      </div>
      {mobileFooter && (
        <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 sm:hidden">
          {mobileFooter}
        </div>
      )}
    </div>
  );
}
