import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Facebook,
  Instagram,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "../../ui/button";
import { Skeleton } from "../../ui/skeleton";
import { cn } from "../../ui/utils";
import type {
  MetaConnectionStatus,
  MetaLeadStatus,
  MetaPlatform,
} from "../../../../lib/meta-service";

export function MetaSurface({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-border/70 bg-card shadow-xs", className)}>{children}</section>;
}

export function MetaSectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold leading-tight tracking-tight">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MetaErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="m-4 flex flex-col gap-3 rounded-lg border border-destructive/25 bg-destructive-soft p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3 text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Meta verisi alınamadı</p>
          <p className="mt-0.5 text-xs leading-relaxed text-destructive/85">{error}</p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="shrink-0">
        <RefreshCw className="size-3.5" /> Yeniden dene
      </Button>
    </div>
  );
}

export function MetaTableSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <div className="space-y-2 p-4" role="status" aria-label="Meta verileri yükleniyor">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className={cn("h-9 rounded-md", column === 0 && "col-span-2")} />
          ))}
        </div>
      ))}
      <span className="sr-only">Yükleniyor</span>
    </div>
  );
}

export function MetaPagination({
  page,
  pageSize,
  total,
  hasNext,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  onPageChange: (page: number) => void;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total || page * pageSize);
  return (
    <div className="flex flex-col gap-2 border-t border-border/70 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span className="tabular-nums">{total > 0 ? `${first}-${last} / ${total} kayıt` : "Kayıt bulunamadı"}</span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="size-3.5" /> Önceki
        </Button>
        <span className="min-w-10 text-center font-data text-foreground">{page}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          Sonraki <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

const LEAD_LABELS: Record<MetaLeadStatus, string> = {
  new: "Yeni",
  assigned: "Atandı",
  contacted: "İletişim kuruldu",
  qualified: "Nitelikli",
  converted: "Dönüştü",
  rejected: "Uygun değil",
};

const STATUS_TONES: Record<string, string> = {
  active: "border-success/25 bg-success-soft text-success",
  ready: "border-success/25 bg-success-soft text-success",
  sent: "border-success/25 bg-success-soft text-success",
  converted: "border-success/25 bg-success-soft text-success",
  qualified: "border-success/25 bg-success-soft text-success",
  assigned: "border-info/25 bg-info-soft text-info",
  contacted: "border-info/25 bg-info-soft text-info",
  pending: "border-warning/25 bg-warning-soft text-warning",
  syncing: "border-warning/25 bg-warning-soft text-warning",
  error: "border-destructive/25 bg-destructive-soft text-destructive",
  failed: "border-destructive/25 bg-destructive-soft text-destructive",
  rejected: "border-destructive/25 bg-destructive-soft text-destructive",
  disabled: "border-border bg-muted text-muted-foreground",
  paused: "border-border bg-muted text-muted-foreground",
  archived: "border-border bg-muted text-muted-foreground",
  idle: "border-border bg-muted text-muted-foreground",
  new: "border-primary/20 bg-brand-blue-soft text-primary",
};

export function MetaStatusBadge({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase();
  const text = label ?? (key in LEAD_LABELS ? LEAD_LABELS[key as MetaLeadStatus] : status);
  return (
    <span className={cn("inline-flex min-h-6 items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold", STATUS_TONES[key] ?? STATUS_TONES.idle)}>
      {text}
    </span>
  );
}

export function MetaConnectionBadge({ status }: { status: MetaConnectionStatus }) {
  const labels: Record<MetaConnectionStatus, string> = {
    active: "Bağlı",
    error: "Kontrol gerekli",
    disabled: "Bağlı değil",
  };
  return <MetaStatusBadge status={status} label={labels[status]} />;
}

export function MetaPlatformMark({ platform, showLabel = false }: { platform: MetaPlatform; showLabel?: boolean }) {
  const Icon = platform === "instagram" ? Instagram : platform === "facebook" ? Facebook : MessageCircle;
  const label = platform === "instagram" ? "Instagram" : platform === "facebook" ? "Facebook" : platform === "whatsapp" ? "WhatsApp" : "Messenger";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={label}>
      <Icon className="size-3.5 text-primary" aria-hidden="true" />
      {showLabel && <span>{label}</span>}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function MetaEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-xl border border-primary/15 bg-brand-blue-soft text-primary">
        <CheckCircle2 className="size-5" />
      </span>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function formatMetaDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function formatMetaMoney(minor: number | null | undefined, currency = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(minor ?? 0) / 100);
}

export function formatMetaNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(Number(value ?? 0));
}

export function useMetaDateRange(days = 30): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
