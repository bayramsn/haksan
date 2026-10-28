import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, UserRound } from "lucide-react";
import { useAuth } from "../../../lib/auth";
import { contactService } from "../../../lib/services";
import { CONTACT_QUERY_ROOT, normalizeServerContact, type ServerContact } from "../../lib/contactServerData";
import { useDebouncedValue } from "../../lib/serverPagination";
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
import { remoteOptionHasNext } from "./remoteOptionPagination";

export const REMOTE_CONTACT_PAGE_SIZE = 25;

export type ContactIdentityScope = {
  tenantId: string;
  userId: string;
  division: string;
  department: string;
};

export type RemoteContactOption = {
  value: string;
  label: string;
  hint?: string;
  contact: ServerContact;
};

export function remoteContactScope(input: {
  tenantId?: string | null;
  userId?: string | null;
  activeDivision?: string | null;
  activeDepartment?: string | null;
}): ContactIdentityScope {
  return {
    tenantId: input.tenantId || "anonymous",
    userId: input.userId || "anonymous",
    division: input.activeDivision || "all",
    department: input.activeDepartment || "all",
  };
}

export const remoteContactQueryKeys = {
  options: (scope: ContactIdentityScope, companyId: string, search: string) =>
    [...CONTACT_QUERY_ROOT, "remote-options", scope, { companyId, search }] as const,
  detail: (scope: ContactIdentityScope, contactId: string) =>
    [...CONTACT_QUERY_ROOT, "remote-detail", scope, contactId] as const,
};

export function remoteContactOption(contact: ServerContact): RemoteContactOption {
  const hint = [contact.title, contact.department, contact.mobilePhone || contact.phone]
    .filter(Boolean)
    .join(" · ");
  return {
    value: contact.id,
    label: contact.name || "İsimsiz kontak",
    hint: hint || undefined,
    contact,
  };
}

export function mergeRemoteContactOptions(
  contacts: ServerContact[],
  selected?: ServerContact | null,
): RemoteContactOption[] {
  const byId = new Map<string, ServerContact>();
  if (selected) byId.set(selected.id, selected);
  for (const contact of contacts) byId.set(contact.id, contact);
  return Array.from(byId.values()).map(remoteContactOption);
}

function useContactIdentityScope() {
  const { user, tenant, activeDivision, activeDepartment } = useAuth();
  return remoteContactScope({
    tenantId: user?.tenantId ?? tenant?.id,
    userId: user?.id,
    activeDivision,
    activeDepartment,
  });
}

export function useRemoteContactDetail(contactId?: string | null) {
  const scope = useContactIdentityScope();
  return useQuery({
    queryKey: remoteContactQueryKeys.detail(scope, contactId || "none"),
    queryFn: ({ signal }) => contactService.get(contactId as string, { signal }),
    enabled: Boolean(contactId),
    select: normalizeServerContact,
  });
}

/** Firma kapsamlı, server-search kontak seçicisi; seçili eski ID'yi ayrıca hydrate eder. */
export function RemoteContactCombobox({
  companyId,
  value,
  onValueChange,
  disabled,
  className,
  placeholder = "Kontak seçin…",
  searchPlaceholder = "Ad, e-posta veya telefon ara…",
  noneLabel = "Belirtilmedi",
}: {
  companyId?: string | null;
  value?: string | null;
  onValueChange: (contactId: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  noneLabel?: string;
}) {
  const scope = useContactIdentityScope();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const listQuery = useInfiniteQuery({
    queryKey: remoteContactQueryKeys.options(scope, companyId || "none", debouncedQuery),
    initialPageParam: 1,
    queryFn: async ({ signal, pageParam }) => {
      const response = await contactService.list({
      page: pageParam,
      pageSize: REMOTE_CONTACT_PAGE_SIZE,
      companyId: companyId || undefined,
      search: debouncedQuery || undefined,
      sortBy: "name",
      sortDir: "asc",
    }, { signal });
      return { data: response.data.map(normalizeServerContact), page: pageParam, hasNext: remoteOptionHasNext(response, pageParam) };
    },
    getNextPageParam: (lastPage) => lastPage.hasNext ? lastPage.page + 1 : undefined,
    enabled: Boolean(companyId),
  });
  const selectedQuery = useRemoteContactDetail(value);
  const options = useMemo(
    () => mergeRemoteContactOptions(listQuery.data?.pages.flatMap((page) => page.data) ?? [], selectedQuery.data),
    [listQuery.data, selectedQuery.data],
  );
  const selected = options.find((option) => option.value === value);
  const loading = Boolean(companyId) && (listQuery.isLoading || listQuery.isFetching || selectedQuery.isFetching);

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
          disabled={disabled || !companyId}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <UserRound className="size-4 shrink-0 opacity-60" />
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          {loading ? (
            <Loader2 className="ml-2 size-4 shrink-0 animate-spin opacity-60" aria-hidden="true" />
          ) : (
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList aria-busy={loading}>
            {(listQuery.isError || selectedQuery.isError) && <div role="alert" className="p-3 text-sm text-destructive">
              {listQuery.isError ? 'Kontak listesi alınamadı.' : 'Seçili kontak alınamadı.'}
              <Button type="button" variant="ghost" onClick={() => { void (listQuery.isError ? listQuery.refetch() : selectedQuery.refetch()); }}>Yeniden dene</Button>
            </div>}
            {loading && <div role="status" className="p-3 text-sm">Kontaklar aranıyor…</div>}
            {!loading && listQuery.isSuccess && options.length === 0 && <div role="status" className="p-3 text-sm">Eşleşen kontak yok.</div>}
            <CommandEmpty>
              {listQuery.isError ? "Kontak listesi alınamadı." : loading ? "Kontaklar aranıyor…" : "Eşleşen kontak yok."}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onValueChange("");
                  setOpen(false);
                  setQuery("");
                }}
              >
                <Check className={cn("mr-1 size-4", !value ? "opacity-100" : "opacity-0")} />
                <span>{noneLabel}</span>
              </CommandItem>
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
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="break-words">{option.label}</span>
                  {option.hint && <span className="break-words text-xs text-muted-foreground">{option.hint}</span>}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {listQuery.hasNextPage && <Button type="button" variant="ghost" className="w-full" disabled={listQuery.isFetching} onClick={() => void listQuery.fetchNextPage()}>Daha fazla kontak yükle</Button>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
