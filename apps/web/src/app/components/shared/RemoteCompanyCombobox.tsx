import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { useAuth } from "../../../lib/auth";
import { companyService, type CompanyDTO } from "../../../lib/services";
import { companyQueryKeys } from "../../lib/companyServerData";
import { serverScopeKey, useDebouncedValue } from "../../lib/serverPagination";
import { Button } from "../ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";

export const REMOTE_COMPANY_PAGE_SIZE = 25;

export interface RemoteCompanyOption {
  value: string;
  label: string;
  hint?: string;
}

export function remoteCompanyOption(company: CompanyDTO): RemoteCompanyOption {
  const address = company.primaryAddress
    ?? company.addresses?.find((item) => item.isDefault)
    ?? company.addresses?.[0];
  const hint = [company.externalCompanyNo, address?.province, company.taxNumber]
    .filter(Boolean)
    .join(" · ");
  return {
    value: company.id,
    label: company.legalTitle || company.shortName || "Adsız firma",
    hint: hint || undefined,
  };
}

export function mergeRemoteCompanyOptions(
  companies: CompanyDTO[],
  selected?: CompanyDTO,
): RemoteCompanyOption[] {
  const byId = new Map<string, CompanyDTO>();
  if (selected) byId.set(selected.id, selected);
  for (const company of companies) byId.set(company.id, company);
  return Array.from(byId.values()).map(remoteCompanyOption);
}

/**
 * Server-backed company selector for forms that cannot depend on the global
 * store's truncated snapshot. It searches the first 25 matches and separately
 * hydrates the selected id when that record is outside the current result set.
 */
export function RemoteCompanyCombobox({
  value,
  onValueChange,
  disabled,
  className,
  placeholder = "Firma seçin…",
  searchPlaceholder = "Firma adı, no veya vergi no ara…",
  onCreate,
  createLabel = (query) => `“${query}” adıyla yeni firma oluştur`,
  relationTypeCodes,
}: {
  value?: string | null;
  onValueChange: (companyId: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  onCreate?: (label: string) => void | Promise<void>;
  createLabel?: (query: string) => string;
  /** Birden çok ilişki türü verilirse her tür server-side sorgulanıp birleştirilir. */
  relationTypeCodes?: Array<"customer" | "supplier_customer" | "supplier" | "competitor">;
}) {
  const { user, activeDivision, activeDepartment } = useAuth();
  const scope = serverScopeKey(activeDivision, activeDepartment, user?.tenantId, user?.id);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const relationTypes = useMemo(
    () => Array.from(new Set(relationTypeCodes ?? [])).sort(),
    [relationTypeCodes?.join("|")],
  );

  const listQuery = useQuery({
    queryKey: [
      ...companyQueryKeys.all,
      "remote-options",
      scope,
      { page: 1, pageSize: REMOTE_COMPANY_PAGE_SIZE, search: debouncedQuery, relationTypes },
    ],
    queryFn: async ({ signal }) => {
      const requestedTypes = relationTypes.length ? relationTypes : [undefined];
      const pages = await Promise.all(requestedTypes.map((relationTypeCode) => companyService.list({
        page: 1,
        pageSize: REMOTE_COMPANY_PAGE_SIZE,
        search: debouncedQuery || undefined,
        relationTypeCode,
        sortBy: "name",
        sortDir: "asc",
      }, { signal })));
      const companies = Array.from(
        new Map(pages.flatMap((page) => page.data).map((company) => [company.id, company])).values(),
      ).sort((left, right) =>
        (left.legalTitle || left.shortName || "").localeCompare(
          right.legalTitle || right.shortName || "",
          "tr-TR",
        ),
      );
      return {
        data: companies,
        meta: {
          page: 1,
          pageSize: companies.length,
          total: pages.reduce((sum, page) => sum + Number(page.meta?.total ?? page.data.length), 0),
          totalPages: 1,
        },
      };
    },
    placeholderData: keepPreviousData,
  });

  const selectedIsOnPage = Boolean(value && listQuery.data?.data.some((company) => company.id === value));
  const selectedQuery = useQuery({
    queryKey: value ? companyQueryKeys.detail(scope, value) : [...companyQueryKeys.details(), scope, "none"],
    queryFn: ({ signal }) => companyService.get(value as string, { signal }),
    enabled: Boolean(value && listQuery.isSuccess && !selectedIsOnPage),
  });

  const options = useMemo(
    () => mergeRemoteCompanyOptions(listQuery.data?.data ?? [], selectedQuery.data),
    [listQuery.data?.data, selectedQuery.data],
  );
  const selected = options.find((option) => option.value === value);
  const loading = listQuery.isPending || listQuery.isFetching || selectedQuery.isFetching;
  const cleanQuery = query.trim();
  const showCreate = Boolean(
    onCreate
    && cleanQuery
    && !options.some((option) => option.label.toLocaleLowerCase("tr-TR") === cleanQuery.toLocaleLowerCase("tr-TR")),
  );

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-busy={loading}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="size-4 shrink-0 opacity-60" />
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          {loading ? (
            <Loader2 className="ml-2 size-4 shrink-0 animate-spin opacity-60" aria-hidden="true" />
          ) : (
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList aria-busy={loading}>
            <CommandEmpty>
              {listQuery.isError ? "Firma listesi alınamadı." : loading ? "Firmalar aranıyor…" : "Eşleşen firma yok."}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className={cn("mr-1 size-4", value === option.value ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint && <span className="max-w-[45%] truncate text-xs text-muted-foreground">{option.hint}</span>}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem
                  value={`__create__:${cleanQuery}`}
                  className="text-primary"
                  onSelect={() => {
                    void onCreate?.(cleanQuery);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Plus className="mr-1 size-4" />
                  <span className="truncate">{createLabel(cleanQuery)}</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
