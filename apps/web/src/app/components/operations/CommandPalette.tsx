import { useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useStore } from "../../lib/store";
import {
  buildGlobalSearchIndex,
  searchOperationIndex,
  type OperationAction,
  type SearchResult,
} from "../../lib/operations";
import { Building2, FileText, Package, Search, Wrench, Wallet, Cpu, Contact, ArrowRight, Truck, BarChart3, PackageCheck } from "lucide-react";

const TYPE_ICON: Record<string, ReactNode> = {
  Firma: <Building2 className="size-4" />,
  Kontak: <Contact className="size-4" />,
  Satış: <FileText className="size-4" />,
  Teklif: <FileText className="size-4" />,
  Stok: <Package className="size-4" />,
  Ürün: <Cpu className="size-4" />,
  Servis: <Wrench className="size-4" />,
  Ödeme: <Wallet className="size-4" />,
  Makine: <Cpu className="size-4" />,
  Doküman: <FileText className="size-4" />,
  Sevkiyat: <Truck className="size-4" />,
  Teslimat: <PackageCheck className="size-4" />,
  Rapor: <BarChart3 className="size-4" />,
};

export function CommandPalette({
  open,
  onOpenChange,
  onAction,
  canUseAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: OperationAction) => void;
  canUseAction?: (action: OperationAction) => boolean;
}) {
  const store = useStore();
  const [query, setQuery] = useState("");
  const index = useMemo(() => buildGlobalSearchIndex(store), [store]);
  const results = useMemo(() => {
    const raw = searchOperationIndex(query, index, query.trim() ? 10 : 7);
    return canUseAction ? raw.filter((item) => canUseAction(item.action)) : raw;
  }, [canUseAction, index, query]);

  const run = (result: SearchResult) => {
    onAction(result.action);
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(720px,calc(100vw-1rem))] max-w-none overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <DialogTitle className="text-base tracking-tight">Global arama</DialogTitle>
        </DialogHeader>
        <div className="border-b border-border/60 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Firma, teklif, stok, servis, sevkiyat, rapor..."
              className="h-11 border-transparent bg-muted/50 pl-9 text-base focus-visible:bg-white"
            />
          </div>
        </div>
        <div className="max-h-[62dvh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="grid min-h-44 place-items-center rounded-md border border-dashed border-border/70 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
              Sonuç bulunamadı.
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((result) => (
                <button
                  key={result.id}
                  className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted"
                  onClick={() => run(result)}
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    {TYPE_ICON[result.type] ?? <Search className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-medium group-hover:text-primary">{result.title}</div>
                      <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                        {result.type}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{result.subtitle}</div>
                  </div>
                  <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                    <span className="max-w-24 truncate">{result.badge}</span>
                    <ArrowRight className="size-3.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
          <span>{results.length} sonuç</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setQuery("geciken ödeme")}>
              Geciken ödeme
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setQuery("servis")}>
              Servis
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setQuery("yönetim özeti")}>
              Yönetim
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
