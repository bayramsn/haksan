import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "./utils";
import { foldTr, matchesTr } from "../../lib/trSearch";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "./command";

export type ComboboxOption = { value: string; label: string; hint?: string };

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
  onCreate?: (label: string) => void;
  createLabel?: (query: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);
  const showCreate =
    !!onCreate &&
    query.trim().length > 0 &&
    !options.some((o) => foldTr(o.label) === foldTr(query.trim()));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(value, search) => {
            // value burada CommandItem'ın `value`'su; label üzerinden arama yapmak
            // için option label'ını da içeren bir string kullanıyoruz.
            return matchesTr(value, search) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className={cn("mr-2 size-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-2 text-xs text-muted-foreground truncate">{o.hint}</span>}
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
