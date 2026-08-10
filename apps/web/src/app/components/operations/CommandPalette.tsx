import { useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { Kbd } from "../ui/kbd";
import { useStore } from "../../lib/store";
import {
  buildGlobalSearchIndex,
  searchOperationIndex,
  type OperationAction,
  type SearchResult,
} from "../../lib/operations";
import { Building2, FileText, Package, Search, Wrench, Wallet, Cpu, Contact, ArrowRight, Truck, BarChart3, PackageCheck, Sparkles } from "lucide-react";

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

const TYPE_LABEL: Record<string, string> = {
  customer: "Firma",
  company: "Firma",
  contact: "Kontak",
  opportunity: "Satış",
  quote: "Teklif",
  inventory_item: "Stok",
  product_model: "Ürün",
  service_ticket: "Servis",
  receivable: "Ödeme",
  machine: "Makine",
  file: "Doküman",
  shipment: "Sevkiyat",
  delivery: "Teslimat",
  report: "Rapor",
};

const localTypeLabel = (value: string) => TYPE_LABEL[value] ?? value;

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
        <DialogHeader className="border-b border-border/60 bg-muted/20 px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base tracking-tight">
            <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary"><Sparkles className="size-3.5" /></span>
            Haksan komut merkezi
          </DialogTitle>
          <DialogDescription className="sr-only">
            Firma, teklif, stok, servis ve diğer kayıtlarda arama yapın.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} loop className="rounded-none">
          <CommandInput
            id="command-palette-search"
            name="command-palette-search"
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Firma, kontak, fırsat, teklif, stok veya servis ara..."
            className="h-12 text-base"
          />
          <CommandList className="max-h-[62dvh] p-2">
            <CommandEmpty>
              <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 text-center">
                <div>
                  <Search className="mx-auto size-7 text-muted-foreground/60" />
                  <p className="mt-2 font-medium text-foreground">Sonuç bulunamadı</p>
                  <p className="mt-1 text-xs text-muted-foreground">Farklı bir firma adı, kayıt numarası veya modül deneyin.</p>
                </div>
              </div>
            </CommandEmpty>
            <CommandGroup heading={query.trim() ? "Arama sonuçları" : "Önerilen kayıtlar"}>
              {results.map((result) => {
                const typeLabel = localTypeLabel(result.type);
                return (
                  <CommandItem
                    key={result.id}
                    value={`${result.id}-${result.title}`}
                    onSelect={() => run(result)}
                    className="group gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-primary/8"
                  >
                    <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                      {TYPE_ICON[typeLabel] ?? <Search className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-sm font-medium group-data-[selected=true]:text-primary">{result.title}</div>
                        <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">{typeLabel}</Badge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{result.subtitle}</div>
                    </div>
                    <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                      <span className="max-w-24 truncate">{result.badge}</span>
                      <ArrowRight className="size-3.5" />
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="hidden items-center gap-2 sm:flex">
            <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> gezin</span>
            <span><Kbd>↵</Kbd> aç</span>
            <span><Kbd>Esc</Kbd> kapat</span>
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto">
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
