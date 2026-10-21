import type { LaserBaseConfiguration } from "../../lib/mock";
import { baseModelTechnicalData } from "../../lib/baseModelTechnical";

export function BaseModelTechnicalTable({ base }: { base: LaserBaseConfiguration }) {
  const data = baseModelTechnicalData(base);
  if (!data) return null;
  const { models, groups } = data;
  if (!groups.length) return <p className="text-xs text-muted-foreground">Bu baz kart için teknik bilgi bulunamadı.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-xs" style={{ minWidth: `${12 + models.length * 8}rem` }}>
        <caption className="sr-only">Alt modellere göre teknik bilgiler</caption>
        <thead className="bg-muted/30 text-muted-foreground">
          <tr className="text-left">
            <th scope="col" className="sticky left-0 bg-muted/30 px-3 py-1.5 font-semibold">Özellik</th>
            {models.map((model) => <th key={model} scope="col" className="px-3 py-1.5 font-semibold text-foreground">{model}</th>)}
          </tr>
        </thead>
        {groups.map((entry) => (
          <tbody key={entry.group} className="border-t border-border/60">
            <tr>
              <th scope="colgroup" colSpan={models.length + 1} className="bg-primary/5 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-primary">{entry.group}</th>
            </tr>
            {entry.rows.map((row) => (
              <tr key={row.key} className="border-t border-border/40 align-top">
                <th scope="row" className="sticky left-0 bg-card px-3 py-1.5 text-left font-medium text-muted-foreground">{row.key}</th>
                {row.values.map((value, index) => <td key={models[index]} className="whitespace-pre-line px-3 py-1.5 tabular-nums">{value || "—"}</td>)}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
