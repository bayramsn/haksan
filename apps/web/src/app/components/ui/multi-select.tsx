import { useMemo, useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { Button } from "./button";
import { Input } from "./input";
import { Check, ChevronsUpDown, X, Search } from "lucide-react";

export type MultiSelectOption = { value: string; label: string };

/**
 * Çoklu seçim bileşeni: popover içinde aranabilir checkbox listesi,
 * altında kaldırılabilir chip'ler. Radix Select tek seçim sunduğu için
 * uyumluluk alanları (uyumlu makine/marka/kontrol ünitesi/tedarikçi) bununla yapılır.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Seçin",
  emptyText = "Sonuç yok",
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const labelOf = (v: string) => byValue.get(v) ?? v;
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const filtered = query
    ? options.filter((o) => o.label.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")))
    : options;

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="h-8 w-full justify-between gap-2 px-2 font-normal"
          >
            <span className={`truncate text-xs ${selected.length ? "text-foreground" : "text-muted-foreground"}`}>
              {selected.length ? `${selected.length} seçili` : placeholder}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <div className="border-b border-border/60 p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-7 pl-7 text-xs"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ara..."
              />
            </div>
          </div>
          <div className="max-h-[220px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">{emptyText}</div>
            ) : (
              filtered.map((o) => {
                const isSel = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <span
                      className={`grid size-4 shrink-0 place-items-center rounded border ${
                        isSel ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      }`}
                    >
                      {isSel && <Check className="size-3" />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px]">
              {labelOf(v)}
              <button type="button" onClick={() => toggle(v)} className="hover:text-destructive">
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
