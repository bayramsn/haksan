import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../ui/utils";

export function PageLayout({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ui-page-layout", className)} {...props}>
      {children}
    </div>
  );
}

export function PageToolbar({
  primary,
  secondary,
  className,
  label = "Sayfa araçları",
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section className={cn("ui-toolbar", className)} aria-label={label}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{primary}</div>
      {secondary ? <div className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto">{secondary}</div> : null}
    </section>
  );
}

export function FilterBar({ children, className, label = "Filtreler" }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2", className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function KpiStrip({ children, className, label = "Özet göstergeler" }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-[var(--surface-radius)] border border-border/75 bg-border/75 shadow-xs md:grid-cols-4", className)} aria-label={label}>
      {children}
    </section>
  );
}

export function DataViewFrame({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section className={cn("ui-data-frame", className)} aria-label={label}>
      {children}
    </section>
  );
}

export function ResponsiveRecordView({
  desktop,
  mobile,
  className,
}: {
  desktop: ReactNode;
  mobile: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="hidden md:block">{desktop}</div>
      <div className="md:hidden">{mobile}</div>
    </div>
  );
}

export function FormSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[var(--surface-radius)] border border-border/75 bg-card shadow-xs", className)}>
      <header className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 className="text-balance font-display text-xl font-semibold leading-tight">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-pretty text-sm leading-5 text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function StickyActionBar({ children, className, label = "Kayıt işlemleri" }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className={cn("sticky bottom-0 z-[var(--z-sticky)] -mx-4 mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border/80 bg-card/95 px-4 py-3 shadow-[0_-8px_24px_-20px_rgba(13,20,68,0.45)] backdrop-blur sm:mx-0 sm:rounded-b-[var(--surface-radius)]", className)} role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}
