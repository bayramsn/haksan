import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { getMetaErrorMessage, metaQueryKeys, metaService, type MetaLeadStatus, type MetaPlatform } from "../../../../lib/meta-service";
import {
  formatMetaDate,
  MetaEmpty,
  MetaErrorState,
  MetaPagination,
  MetaPlatformMark,
  MetaSectionHeader,
  MetaStatusBadge,
  MetaSurface,
  MetaTableSkeleton,
} from "./meta-shared";

const PAGE_SIZE = 25;

export function MetaLeadsTab({ onOpenOpportunity }: { onOpenOpportunity?: (id: string) => void }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MetaLeadStatus | "all">("all");
  const [platform, setPlatform] = useState<MetaPlatform | "all">("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const params = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: status === "all" ? undefined : status,
    platform: platform === "all" ? undefined : platform,
  };
  const query = useQuery({
    queryKey: metaQueryKeys.leads(params),
    queryFn: () => metaService.leads(params),
    staleTime: 20_000,
  });

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("all");
    setPlatform("all");
    setPage(1);
  };
  const filtersActive = Boolean(search || status !== "all" || platform !== "all");

  return (
    <MetaSurface>
      <MetaSectionHeader
        title="Meta lead akışı"
        description="Form lead'lerini sunucu tarafında filtreleyin, atamaları görün ve ilgili CRM kaydına geçin."
      />
      <div className="flex flex-col gap-2 border-b border-border/70 bg-surface-subtle px-4 py-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1" htmlFor="meta-lead-search">
          <span className="sr-only">Lead ara</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="meta-lead-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Ad, telefon, e-posta veya kampanya ara"
            className="h-9 pl-9"
          />
        </label>
        <Select value={status} onValueChange={(value) => { setStatus(value as MetaLeadStatus | "all"); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-[176px]" aria-label="Lead durumu">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm durumlar</SelectItem>
            <SelectItem value="new">Yeni</SelectItem>
            <SelectItem value="assigned">Atandı</SelectItem>
            <SelectItem value="contacted">İletişim kuruldu</SelectItem>
            <SelectItem value="qualified">Nitelikli</SelectItem>
            <SelectItem value="converted">Dönüştü</SelectItem>
            <SelectItem value="rejected">Uygun değil</SelectItem>
          </SelectContent>
        </Select>
        <Select value={platform} onValueChange={(value) => { setPlatform(value as MetaPlatform | "all"); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-[154px]" aria-label="Meta kanalı">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm kanallar</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="messenger">Messenger</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button type="button" variant="ghost" size="sm" className="h-9" onClick={resetFilters}>
            <SlidersHorizontal className="size-3.5" /> Filtreleri temizle
          </Button>
        )}
      </div>

      {query.isLoading ? (
        <MetaTableSkeleton columns={6} />
      ) : query.isError ? (
        <MetaErrorState error={getMetaErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : !query.data || query.data.items.length === 0 ? (
        <MetaEmpty
          title={filtersActive ? "Filtreye uygun lead yok" : "Henüz Meta lead'i yok"}
          description={filtersActive ? "Arama veya filtreleri değiştirerek yeniden deneyin." : "Lead Ads formlarından gelen kayıtlar burada görünecek."}
          action={filtersActive ? <Button variant="outline" size="sm" onClick={resetFilters}>Filtreleri temizle</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Kaynak</TableHead>
                <TableHead>Kampanya / Form</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>CRM ataması</TableHead>
                <TableHead>Geliş</TableHead>
                <TableHead className="w-20 text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.items.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <p className="max-w-[240px] truncate text-sm font-semibold">{lead.fullName}</p>
                    <p className="mt-0.5 max-w-[240px] truncate text-[11px] text-muted-foreground">{lead.phone || lead.email || "İletişim bilgisi yok"}</p>
                  </TableCell>
                  <TableCell><MetaPlatformMark platform={lead.platform} showLabel /></TableCell>
                  <TableCell>
                    <p className="max-w-[220px] truncate text-xs font-medium">{lead.campaignName ?? "Kampanya yok"}</p>
                    <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted-foreground">{lead.formName ?? "Form bilgisi yok"}</p>
                  </TableCell>
                  <TableCell><MetaStatusBadge status={lead.status} /></TableCell>
                  <TableCell>
                    <p className="max-w-[160px] truncate text-xs">{lead.ownerName ?? "Atama bekliyor"}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{lead.opportunityId ? "CRM kaydı oluştu" : "İşleme alınıyor"}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatMetaDate(lead.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!lead.opportunityId || !onOpenOpportunity}
                      onClick={() => lead.opportunityId && onOpenOpportunity?.(lead.opportunityId)}
                      aria-label={`${lead.fullName} CRM kaydını aç`}
                      title={lead.opportunityId ? "CRM kaydını aç" : "CRM kaydı henüz oluşmadı"}
                    >
                      <ArrowUpRight className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {query.data && (
        <MetaPagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          hasNext={query.data.hasNext}
          onPageChange={setPage}
        />
      )}
    </MetaSurface>
  );
}
