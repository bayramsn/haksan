import { useId, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { cn } from "./utils";
import { foldTr, matchesTr } from "../../lib/trSearch";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "./command";

export type ComboboxOption = { value: string; label: string; hint?: string; searchTerms?: string };

/**
 * Aramalı seçim kutusu (Popover + cmdk Command).
 * - Liste içi arama otomatik (cmdk filtreler, Türkçe karakter duyarsız).
 * - `onCreate` verilirse, eşleşme yokken yazılan metni yeni kayıt olarak ekleme
 *   seçeneği sunar (ör. yeni firma adı yazma).
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Seçin...",
  searchPlaceholder = "Ara...",
  emptyText = "Sonuç yok.",
  disabled,
  className,
  ariaLabel,
  loading = false,
  loadError,
  onRetry,
  onCreate,
  createLabel = (q) => `"${q}" ekle`,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  onCreate?: (label: string) => void;
  createLabel?: (query: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const showCreate =
    !!onCreate &&
    !loading && !loadError &&
    query.trim().length > 0 &&
    !options.some((o) => foldTr(o.label) === foldTr(query.trim()));

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-controls={open ? listId : undefined}
          aria-busy={loading}
          disabled={disabled}
          className={cn("min-h-11 w-full min-w-0 justify-between gap-3 rounded-lg text-left font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          {loading ? <Loader2 className="size-4 shrink-0 animate-spin opacity-60" aria-hidden="true" /> : <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0" align="start">
        <Command
          filter={(value, search) => {
            // value burada CommandItem'ın `value`'su; label üzerinden arama yapmak
            // için option label'ını da içeren bir string kullanıyoruz.
            return matchesTr(value, search) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          {loadError ? <div role="alert" className="flex items-center gap-3 border-b border-border bg-destructive/5 px-3 py-2 text-sm text-destructive"><span className="min-w-0 flex-1">{loadError}</span>{onRetry ? <Button type="button" variant="ghost" size="sm" onClick={onRetry}>Yeniden dene</Button> : null}</div> : null}
          <CommandList id={listId} aria-busy={loading}>
            <CommandEmpty>{loading ? 'Seçenekler yükleniyor…' : loadError ? 'Aramayı yeniden deneyin.' : emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""} ${o.searchTerms ?? ""} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check aria-hidden="true" className={cn("size-4 shrink-0", value === o.value ? "opacity-100 text-primary" : "opacity-0")} />
                  <span className="min-w-0 flex-1 py-1"><span className="block break-words font-medium">{o.label}</span>
                  {o.hint && <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">{o.hint}</span>}</span>
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem
                  value={`__create__ ${query}`}
                  onSelect={() => {
                    onCreate?.(query.trim());
                    setOpen(false);
                    setQuery("");
                  }}
                  className="text-primary"
                >
                  <Plus className="mr-2 size-4" />
                  {createLabel(query.trim())}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
