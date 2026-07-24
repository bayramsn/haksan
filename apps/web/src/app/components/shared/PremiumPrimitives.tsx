import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, ImageIcon } from "lucide-react";
import { cn } from "../ui/utils";

type EntityVisualProps = {
  imageUrl?: string | null;
  title: string;
  overline?: string;
  icon?: ReactNode;
  className?: string;
  imageClassName?: string;
  size?: "sm" | "md" | "lg";
};

const VISUAL_SIZE = {
  sm: "size-11 rounded-lg",
  md: "size-16 rounded-xl",
  lg: "h-44 w-full rounded-xl",
};

/**
 * Fiziksel kayıtlar için tutarlı görsel yuvası. Gerçek görsel yoksa sıradan bir
 * avatar yerine Haksan'ın teknik çizim dilinde güvenli bir fallback gösterir.
 */
export function EntityVisual({
  imageUrl,
  title,
  overline,
  icon,
  className,
  imageClassName,
  size = "md",
}: EntityVisualProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [imageUrl]);

  return (
    <div
      className={cn(
        "premium-blueprint precision-corners relative shrink-0 border border-primary/10 bg-white shadow-xs",
        VISUAL_SIZE[size],
        className,
      )}
    >
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={title}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cn("h-full w-full object-contain p-1.5", imageClassName)}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-primary">
          <span className={cn("grid place-items-center rounded-lg border border-primary/10 bg-white/90 shadow-xs", size === "lg" ? "size-16" : "size-8")}>
            {icon ?? <ImageIcon className={size === "lg" ? "size-7" : "size-4"} />}
          </span>
        </div>
      )}
      {size === "lg" && overline && (
        <span className="absolute bottom-3 left-3 rounded-md border border-white/70 bg-white/90 px-2 py-1 font-data text-[9px] font-semibold uppercase tracking-[0.14em] text-primary shadow-sm backdrop-blur">
          {overline}
        </span>
      )}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 font-data text-[9px] font-semibold uppercase tracking-[0.17em] text-operation-blue">
            {eyebrow}
          </div>
        )}
        <h2 className="font-display text-xl font-semibold leading-none tracking-[-0.01em] text-foreground">{title}</h2>
        {description && <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto pb-0.5">{actions}</div>}
    </div>
  );
}

export function RecordIdentity({
  visual,
  eyebrow,
  title,
  description,
  meta,
  action,
  className,
}: {
  visual?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {visual}
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="mb-0.5 font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-operation-blue">{eyebrow}</div>}
        <div className="truncate text-[13px] font-semibold text-foreground">{title}</div>
        {description && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{description}</div>}
        {meta && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{meta}</div>}
      </div>
      {action && <div className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">{action}</div>}
    </div>
  );
}

export function InsightStat({
  label,
  value,
  detail,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-primary bg-brand-blue-soft border-primary/10",
    success: "text-success bg-success-soft border-success/10",
    warning: "text-warning bg-warning-soft border-warning/10",
    danger: "text-destructive bg-destructive-soft border-destructive/10",
  }[tone];

  return (
    <div className="min-w-0 border-l border-border/70 pl-3 first:border-l-0 first:pl-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {icon && <span className={cn("grid size-6 place-items-center rounded-md border", toneClass)}>{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 font-display text-[22px] font-semibold leading-none tabular-nums text-foreground">{value}</div>
      {detail && <div className="mt-1 truncate text-[10px] text-muted-foreground">{detail}</div>}
    </div>
  );
}

export function InlineLinkHint({ label = "Detayı aç" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
      {label}<ArrowUpRight className="size-3" />
    </span>
  );
}
