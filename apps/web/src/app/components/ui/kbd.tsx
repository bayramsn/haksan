import type * as React from "react";
import { cn } from "./utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/80 bg-muted/60 px-1.5 font-data text-[10px] font-medium text-muted-foreground shadow-[0_1px_0_rgba(13,20,68,0.08)]",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
