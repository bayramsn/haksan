import { Card, CardContent } from "../ui/card";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export const KPI_TONES: Record<string, { bg: string; ic: string; ring: string }> = {
  emerald: { bg: "bg-emerald-50", ic: "text-emerald-600", ring: "ring-emerald-100" },
  amber: { bg: "bg-amber-50", ic: "text-amber-600", ring: "ring-amber-100" },
  red: { bg: "bg-red-50", ic: "text-red-600", ring: "ring-red-100" },
  violet: { bg: "bg-brand-blue-soft", ic: "text-brand-blue", ring: "ring-blue-100" },
  blue: { bg: "bg-blue-50", ic: "text-blue-600", ring: "ring-blue-100" },
};

export function MiniKpi({
  icon, label, value, sub, delta, tone = "violet", progress, onClick, active,
}: {
  icon: React.ReactNode; label: string; value: number | string; sub?: string;
  delta?: number; tone?: keyof typeof KPI_TONES; progress?: number;
  /** Verilirse kart tıklanabilir olur (ör. ilgili sekmeyi filtreler). */
  onClick?: () => void;
  /** Karta bağlı filtre/sekme aktifken vurgulu çerçeve. */
  active?: boolean;
}) {
  const t = KPI_TONES[tone];
  const positive = (delta ?? 0) >= 0;
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`border-border/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden ${
        onClick ? "cursor-pointer select-none" : ""
      } ${active ? "ring-2 ring-primary/30 border-primary/40" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className={`size-9 rounded-lg ${t.bg} ${t.ic} grid place-items-center shrink-0 ring-4 ${t.ring}`}>
            {icon}
          </div>
          {delta !== undefined && (
            <span className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full ${
              positive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
            }`}>
              {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              %{Math.abs(delta)}
            </span>
          )}
        </div>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <div className="text-[22px] tabular-nums tracking-tight leading-none truncate">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
        </div>
        {progress !== undefined && (
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${t.ic.replace("text-", "bg-")}`} style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PayKpi({
  icon, label, value, delta, sub, tone = "emerald", alarm, progress,
}: {
  icon: React.ReactNode; label: string; value: string; delta?: number; sub: string;
  tone?: keyof typeof KPI_TONES; alarm?: boolean; progress?: number;
}) {
  const t = KPI_TONES[tone];
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="border-border/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className={`size-9 rounded-lg ${t.bg} ${t.ic} grid place-items-center shrink-0 ring-4 ${t.ring}`}>
            {icon}
          </div>
          {delta !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full ${
            alarm ? "bg-red-50 text-red-700" : positive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
          }`} aria-hidden>
            {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            %{Math.abs(delta)}
          </span>
          )}
        </div>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <div className="text-[22px] tabular-nums tracking-tight leading-none truncate">{value}</div>
          <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
        </div>
        {progress !== undefined && (
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${t.ic.replace("text-", "bg-")}`} style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
