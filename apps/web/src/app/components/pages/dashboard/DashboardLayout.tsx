import type { ReactNode } from "react";
import { cn } from "../../ui/utils";

export function DashboardCanvas({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("surface-enter space-y-5", className)}>{children}</div>;
}

export function DashboardKpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6", className)} aria-label="Temel göstergeler">{children}</section>;
}

export function DashboardPrimaryGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("grid grid-cols-1 gap-4 lg:grid-cols-5", className)}>{children}</section>;
}

export function DashboardSplitGrid({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <section className={cn("grid grid-cols-1 gap-4 lg:grid-cols-2", className)} aria-label={label}>{children}</section>;
}

export function DashboardChartGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("grid grid-cols-1 gap-4 lg:grid-cols-3", className)} aria-label="Performans grafikleri">{children}</section>;
}
