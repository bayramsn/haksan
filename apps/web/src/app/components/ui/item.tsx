import type * as React from "react";
import { cn } from "./utils";

function Item({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item" className={cn("flex min-w-0 items-center gap-3 rounded-lg border border-transparent p-3", className)} {...props} />;
}

function ItemMedia({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-media" className={cn("grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4", className)} {...props} />;
}

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-content" className={cn("min-w-0 flex-1", className)} {...props} />;
}

function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-title" className={cn("truncate text-sm font-medium text-foreground", className)} {...props} />;
}

function ItemDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-description" className={cn("mt-0.5 truncate text-xs text-muted-foreground", className)} {...props} />;
}

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-actions" className={cn("ml-auto flex shrink-0 items-center gap-1", className)} {...props} />;
}

export { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle };
