import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { cn } from "../ui/utils";

type StateAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type StateShellProps = {
  eyebrow: string;
  title: string;
  description?: string;
  icon: ReactNode;
  action?: StateAction;
  tone?: "neutral" | "success" | "warning" | "danger";
  compact?: boolean;
  className?: string;
};

const TONE_CLASS = {
  neutral: "border-primary/10 bg-brand-blue-soft text-primary",
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-warning/20 bg-warning-soft text-warning",
  danger: "border-destructive/20 bg-destructive-soft text-destructive",
} as const;

function StateShell({
  eyebrow,
  title,
  description,
  icon,
  action,
  tone = "neutral",
  compact = false,
  className,
}: StateShellProps) {
  return (
    <section
      className={cn(
        "surface-enter flex flex-col items-center justify-center rounded-[var(--surface-radius)] border border-border/75 bg-card px-5 text-center shadow-xs",
        compact ? "min-h-40 py-7" : "min-h-64 py-12",
        className,
      )}
      aria-live={tone === "danger" ? "assertive" : "polite"}
    >
      <div className={cn("grid size-11 place-items-center rounded-lg border", TONE_CLASS[tone])}>{icon}</div>
      <p className="ui-eyebrow mt-4">{eyebrow}</p>
      <h3 className="mt-1 text-balance font-display text-xl font-semibold leading-tight text-foreground">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-pretty text-sm leading-6 text-muted-foreground">{description}</p> : null}
      {action ? (
        <Button type="button" variant="outline" className="mt-5" disabled={action.disabled} onClick={action.onClick}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}

export function ErrorState({
  title = "Veriler yüklenemedi",
  description = "Bağlantıyı kontrol edip yeniden deneyin. Mevcut kayıtlarınız etkilenmedi.",
  action,
  compact,
  className,
}: {
  title?: string;
  description?: string;
  action?: StateAction;
  compact?: boolean;
  className?: string;
}) {
  return <StateShell eyebrow="İşlem tamamlanamadı" title={title} description={description} icon={<WifiOff className="size-5" />} action={action} tone="danger" compact={compact} className={className} />;
}

export function SuccessState({
  title,
  description,
  compact,
  className,
}: {
  title: string;
  description?: string;
  compact?: boolean;
  className?: string;
}) {
  return <StateShell eyebrow="İşlem tamamlandı" title={title} description={description} icon={<CheckCircle2 className="size-5" />} tone="success" compact={compact} className={className} />;
}

export function PartialState({
  title = "Bazı veriler gösterilemiyor",
  description = "Hazır olan bilgiler görüntüleniyor. Eksik bölüm için yeniden deneyebilirsiniz.",
  action,
  compact,
  className,
}: {
  title?: string;
  description?: string;
  action?: StateAction;
  compact?: boolean;
  className?: string;
}) {
  return <StateShell eyebrow="Kısmi veri" title={title} description={description} icon={<AlertTriangle className="size-5" />} action={action} tone="warning" compact={compact} className={className} />;
}

export function LoadingState({
  label = "Veriler hazırlanıyor",
  rows = 5,
  className,
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[var(--surface-radius)] border border-border/75 bg-card p-4 shadow-xs", className)} aria-busy="true" aria-label={label}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3 w-52 max-w-full" />
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-md" />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </section>
  );
}
