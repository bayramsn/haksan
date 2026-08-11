import { ArrowUpRight, Calendar, Factory } from "lucide-react";
import { Button } from "../../ui/button";

export function DashboardBriefing({
  firstName,
  workItemCount,
  criticalCount,
  warningCount,
  onOpenToday,
  onOpenOverdue,
}: {
  firstName: string;
  workItemCount: number;
  criticalCount: number;
  warningCount: number;
  onOpenToday: () => void;
  onOpenOverdue: () => void;
}) {
  const today = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", weekday: "long" }).format(new Date());

  return (
    <section aria-labelledby="dashboard-briefing-title" className="relative isolate overflow-hidden rounded-[var(--overlay-radius)] border border-white/10 border-t-2 border-t-brand-red [background:var(--gradient-brand)] p-4 text-white shadow-sm sm:p-5">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-white shadow-inner backdrop-blur">
            <Factory className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-data text-xs font-semibold uppercase tracking-[0.08em] text-white/75">
              <span>Günlük operasyon brifingi</span>
              <span aria-hidden="true">·</span>
              <time className="normal-case tracking-normal text-white/60">{today}</time>
            </div>
            <h2 id="dashboard-briefing-title" className="mt-1 font-display text-xl font-semibold leading-none tracking-tight">Hoş geldin {firstName}</h2>
            <p className="mt-1.5 text-sm text-white/75">
              Bugün <b className="text-white">{workItemCount}</b> takip işi var; <b className="text-white">{criticalCount}</b> kritik, <b className="text-white">{warningCount}</b> yakın takip.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" className="border-0 bg-white/15 text-white backdrop-blur hover:bg-white/25" onClick={onOpenToday}>
            <Calendar className="size-4" /> Bugün
          </Button>
          <Button size="sm" className="bg-white text-primary hover:bg-white/90" onClick={onOpenOverdue}>
            Gecikenler <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
