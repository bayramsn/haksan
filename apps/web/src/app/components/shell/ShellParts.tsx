import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../ui/sheet";
import { cn } from "../ui/utils";

export function AppShell({ density, children }: { density: "comfortable" | "compact"; children: ReactNode }) {
  return (
    <div data-density={density} className="flex h-full min-h-0 w-full overflow-hidden bg-canvas text-foreground">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Ana içeriğe geç
      </a>
      {children}
    </div>
  );
}

export function ShellMobileNavigation({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(300px,calc(100vw-2rem))] gap-0 overflow-hidden p-0 lg:hidden">
        <SheetTitle className="sr-only">Ana menü</SheetTitle>
        <SheetDescription className="sr-only">Haksan modülleri ve çalışma alanı seçimi</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  );
}

export function ShellSidebar({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <aside
      className={cn(
        "relative hidden h-full min-h-0 shrink-0 flex-col overflow-visible border-r border-sidebar-border bg-sidebar shadow-[8px_0_24px_-24px_rgba(13,20,68,0.5)] transition-[width] duration-150 motion-reduce:transition-none lg:flex",
        collapsed ? "w-[76px]" : "w-[252px]",
      )}
    >
      {children}
    </aside>
  );
}

export function ShellMain({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>;
}

export function ShellTopbar({ children }: { children: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-1.5 overflow-hidden border-b border-border/70 bg-card/95 px-3 shadow-[0_1px_0_rgba(13,20,68,0.03)] backdrop-blur sm:gap-2.5 md:px-5">
      {children}
    </header>
  );
}

export function ShellNotifications({ children }: { children: ReactNode }) {
  return <div className="contents">{children}</div>;
}

export function ShellUserMenu({ children }: { children: ReactNode }) {
  return <div className="contents">{children}</div>;
}

export const ShellContent = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function ShellContent(
  { className, children, ...props },
  ref,
) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      ref={ref}
      className={cn(
        "app-main min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-canvas p-3 outline-none sm:p-4 lg:p-5 xl:p-6",
        className,
      )}
      {...props}
    >
      {children}
    </main>
  );
});
