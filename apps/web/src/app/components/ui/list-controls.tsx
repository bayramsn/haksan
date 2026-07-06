import { useEffect, useState } from "react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Filter, LayoutGrid, Rows3, X } from "lucide-react";

export type ListView = "table" | "cards";

/** Tablo ↔ kart görünüm geçişi; tercih sayfa tarafında usePersistentState ile saklanır. */
export function ViewToggle({ view, onChange }: { view: ListView; onChange: (v: ListView) => void }) {
  const options: { value: ListView; icon: React.ReactNode; label: string }[] = [
    { value: "table", icon: <Rows3 className="size-4" />, label: "Tablo görünümü" },
    { value: "cards", icon: <LayoutGrid className="size-4" />, label: "Kart görünümü" },
  ];
  return (
    <div className="inline-flex h-9 items-center rounded-md border border-border bg-white p-0.5 shadow-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.label}
          aria-label={o.label}
          aria-pressed={view === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-8 w-9 items-center justify-center rounded-[5px] transition-colors ${
            view === o.value
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

export type FilterDef = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
};

/** A real, working "Filtre" button: opens a popover with select dropdowns. */
export function FilterPopover({ filters }: { filters: FilterDef[] }) {
  const activeCount = filters.filter((f) => f.value && f.value !== "all").length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Filter className="size-4" /> Filtre
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-primary text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Filtrele</div>
        {filters.map((f) => (
          <div key={f.label} className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{f.label}</label>
            <Select value={f.value || "all"} onValueChange={f.onChange}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{f.allLabel ?? "Tümü"}</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 gap-1.5 text-muted-foreground"
            onClick={() => filters.forEach((f) => f.onChange("all"))}
          >
            <X className="size-3.5" /> Filtreleri temizle
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Client-side pagination over an in-memory array. */
export function usePaged<T>(items: T[], pageSize = 12) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { page: safePage, setPage, totalPages, total, pageItems, pageSize };
}

/** Önceki / sayfa / Sonraki controls wired to a usePaged state. */
export function Pager({
  page,
  totalPages,
  setPage,
}: {
  page: number;
  totalPages: number;
  setPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Önceki
      </Button>
      <span className="px-2 text-xs text-muted-foreground tabular-nums">
        {page} / {totalPages}
      </span>
      <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
        Sonraki
      </Button>
    </div>
  );
}
