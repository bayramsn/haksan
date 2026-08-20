import { ArrowUpRight } from "lucide-react";
import {
  QUALIFICATION_STAGE_DESCRIPTIONS,
  QUALIFICATION_STAGE_LABELS,
} from "../../../lib/mock";
import type { DashboardQualificationStage } from "../../../lib/chartAggregates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";

const STAGE_STYLES: Record<DashboardQualificationStage, { card: string; dot: string; code: string }> = {
  c: { card: "hover:border-slate-300 hover:bg-slate-50/70", dot: "bg-slate-500", code: "text-slate-700" },
  b: { card: "hover:border-blue-300 hover:bg-blue-50/70", dot: "bg-blue-500", code: "text-blue-700" },
  a: { card: "hover:border-indigo-300 hover:bg-indigo-50/70", dot: "bg-indigo-500", code: "text-indigo-700" },
  a_plus: { card: "hover:border-amber-300 hover:bg-amber-50/70", dot: "bg-amber-500", code: "text-amber-700" },
  win: { card: "hover:border-emerald-300 hover:bg-emerald-50/70", dot: "bg-emerald-500", code: "text-emerald-700" },
};

export function SalesQualificationPanel({
  summary,
  onSelect,
}: {
  summary: Array<{ stage: DashboardQualificationStage; count: number }>;
  onSelect: (stage: DashboardQualificationStage) => void;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base tracking-tight">Satış dereceleri</CardTitle>
        <CardDescription>C’den WIN’e açık fırsatların güncel satış durumu.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {summary.map(({ stage, count }) => {
            const style = STAGE_STYLES[stage];
            return (
              <button
                key={stage}
                type="button"
                onClick={() => onSelect(stage)}
                className={`group rounded-lg border border-border/60 bg-card p-3 text-left outline-none transition-[border-color,background-color,transform,box-shadow] hover:-translate-y-0.5 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transform-none ${style.card}`}
                aria-label={`${QUALIFICATION_STAGE_LABELS[stage]} fırsatlarını aç`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${style.dot}`} aria-hidden="true" />
                    <span className={`font-data text-xs font-bold ${style.code}`}>{QUALIFICATION_STAGE_LABELS[stage]}</span>
                  </div>
                  <span className="font-data text-2xl font-semibold tabular-nums text-foreground">{count}</span>
                </div>
                <p className="mt-2 min-h-8 text-xs leading-4 text-muted-foreground">
                  {QUALIFICATION_STAGE_DESCRIPTIONS[stage]}
                </p>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-70 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Fırsatları aç <ArrowUpRight className="size-3" />
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
