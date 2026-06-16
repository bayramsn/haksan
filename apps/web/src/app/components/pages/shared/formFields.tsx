import { Label } from "../../ui/label";

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-md border border-border/60 px-3 py-2 ${strong ? "bg-primary/10 text-primary" : "bg-muted/20"}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-right text-sm tabular-nums font-medium">{value}</div>
    </div>
  );
}
