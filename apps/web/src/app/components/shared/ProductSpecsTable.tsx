import type { ProductSpec } from "../../lib/mock";
import { groupProductSpecs } from "../../lib/productSpecTemplates";
import { cn } from "../ui/utils";

export function ProductSpecsTable({
  specs,
  emptyText = "Teknik özellik girilmemiş.",
  className,
}: {
  specs: readonly ProductSpec[];
  emptyText?: string;
  className?: string;
}) {
  const groups = groupProductSpecs(specs.filter((spec) => spec.key.trim()));

  if (!groups.length) {
    return <div className="text-xs text-muted-foreground">{emptyText}</div>;
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border/60 bg-white text-xs", className)}>
      {groups.map(({ group, specs: groupSpecs }, groupIndex) => (
        <div
          key={group.code}
          className={cn(
            "grid grid-cols-[48px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)]",
            groupIndex > 0 && "border-t border-border/70",
          )}
        >
          <div className="flex items-center justify-center border-r border-border/60 bg-muted/50 px-1 py-2">
            <div className="rotate-180 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/80 [writing-mode:vertical-rl]">
              {group.label}
            </div>
          </div>
          <div className="min-w-0 bg-white">
            {groupSpecs.map((spec, index) => (
              <div
                key={`${group.code}-${spec.key}-${index}`}
                className={cn(
                  "grid grid-cols-[minmax(0,1.1fr)_minmax(96px,0.9fr)] items-center gap-2 px-2.5 py-1.5 sm:px-3",
                  index < groupSpecs.length - 1 && "border-b border-dotted border-foreground/35",
                )}
              >
                <div className="min-w-0 text-center font-medium leading-snug text-foreground/85">{spec.key}</div>
                <div className="min-w-0 text-center font-semibold leading-snug text-foreground">
                  {spec.value?.trim() || "-"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
