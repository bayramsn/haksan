import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  Coins,
  RefreshCw,
  Target,
  UsersRound,
} from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Skeleton } from "../../ui/skeleton";
import { metaQueryKeys, metaService, getMetaErrorMessage } from "../../../../lib/meta-service";
import {
  formatMetaDate,
  formatMetaMoney,
  formatMetaNumber,
  MetaConnectionBadge,
  MetaEmpty,
  MetaErrorState,
  MetaPlatformMark,
  MetaSectionHeader,
  MetaStatusBadge,
  MetaSurface,
} from "./meta-shared";

type DateRange = { from: string; to: string };

function defaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function OverviewMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-l border-border/70 pl-4 first:border-l-0 first:pl-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="grid size-7 place-items-center rounded-md border border-primary/10 bg-brand-blue-soft text-primary">{icon}</span>
        {label}
      </div>
      <p className="mt-2 truncate font-display text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

export function MetaOverviewTab({ onOpenOpportunity }: { onOpenOpportunity?: (id: string) => void }) {
  const initialRange = defaultDateRange();
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [connectionId, setConnectionId] = useState("all");
  const params = { from, to, connectionId: connectionId === "all" ? undefined : connectionId };
  const connectionsQuery = useQuery({
    queryKey: metaQueryKeys.connections,
    queryFn: metaService.connections,
    staleTime: 60_000,
  });
  const overviewQuery = useQuery({
    queryKey: metaQueryKeys.overview(params),
    queryFn: () => metaService.overview(params),
    staleTime: 30_000,
  });

  const summary = overviewQuery.data?.summary;

  return (
    <div className="space-y-4">
      <MetaSurface>
        <MetaSectionHeader
          title="Performans özeti"
          description="Meta harcamasını CRM'deki nitelikli lead ve satış sonuçlarıyla aynı dönemde karşılaştırın."
          actions={
            <>
              <label className="sr-only" htmlFor="meta-overview-from">Başlangıç tarihi</label>
              <Input id="meta-overview-from" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="h-8 w-[136px] text-xs" />
              <label className="sr-only" htmlFor="meta-overview-to">Bitiş tarihi</label>
              <Input id="meta-overview-to" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="h-8 w-[136px] text-xs" />
              <Select disabled={!connectionsQuery.data?.length} value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger size="sm" className="w-[170px]" aria-label="Meta bağlantısı">
                  <SelectValue placeholder="Tüm bağlantılar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm bağlantılar</SelectItem>
                  {(connectionsQuery.data ?? []).map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>{connection.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={() => void overviewQuery.refetch()} disabled={overviewQuery.isFetching}>
                <RefreshCw className={overviewQuery.isFetching ? "size-3.5 animate-spin" : "size-3.5"} /> Yenile
              </Button>
            </>
          }
        />
        {overviewQuery.isLoading ? (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24 rounded-lg" />)}
          </div>
        ) : overviewQuery.isError ? (
          <MetaErrorState error={getMetaErrorMessage(overviewQuery.error)} onRetry={() => void overviewQuery.refetch()} />
        ) : (
          <div className="grid gap-x-0 gap-y-6 p-5 sm:grid-cols-2 xl:grid-cols-5">
            <OverviewMetric label="Harcama" value={formatMetaMoney(summary?.spendMinor, summary?.currency)} detail="Seçili dönem toplamı" icon={<Coins className="size-3.5" />} />
            <OverviewMetric label="Lead" value={formatMetaNumber(summary?.leads)} detail={`${formatMetaMoney(summary?.costPerLeadMinor, summary?.currency)} lead maliyeti`} icon={<UsersRound className="size-3.5" />} />
            <OverviewMetric label="Nitelikli" value={formatMetaNumber(summary?.qualifiedLeads)} detail={`%${formatMetaNumber(summary?.qualificationRate)} nitelik oranı`} icon={<Target className="size-3.5" />} />
            <OverviewMetric label="Dönüşüm" value={formatMetaNumber(summary?.conversions)} detail={`%${formatMetaNumber(summary?.conversionRate)} CRM dönüşümü`} icon={<ArrowUpRight className="size-3.5" />} />
            <OverviewMetric label="İlk yanıt" value={summary?.firstResponseMinutes == null ? "-" : `${formatMetaNumber(summary.firstResponseMinutes)} dk`} detail="Yeni lead yanıt süresi" icon={<Clock3 className="size-3.5" />} />
          </div>
        )}
      </MetaSurface>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <MetaSurface>
          <MetaSectionHeader title="Son Meta lead'leri" description="Lead kaynağı, kampanya ve CRM ataması birlikte görünür." />
          {overviewQuery.isLoading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-14 rounded-lg" />)}</div>
          ) : (overviewQuery.data?.recentLeads?.length ?? 0) === 0 ? (
            <MetaEmpty title="Henüz Meta lead'i yok" description="Bağlı formlardan lead geldiğinde burada CRM atamasıyla birlikte görünecek." />
          ) : (
            <div className="divide-y divide-border/70">
              {overviewQuery.data?.recentLeads.map((lead) => (
                <div key={lead.id} className="group flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/10 bg-brand-blue-soft">
                    <MetaPlatformMark platform={lead.platform} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold">{lead.fullName}</p>
                      <MetaStatusBadge status={lead.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.campaignName ?? lead.formName ?? "Kampanya bilgisi yok"} / {lead.ownerName ?? "Atama bekliyor"}</p>
                  </div>
                  <time className="hidden shrink-0 text-[10px] text-muted-foreground sm:block">{formatMetaDate(lead.createdAt)}</time>
                  {lead.opportunityId && onOpenOpportunity && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => onOpenOpportunity(lead.opportunityId!)} aria-label={`${lead.fullName} CRM kaydını aç`}>
                      CRM <ArrowUpRight className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </MetaSurface>

        <MetaSurface>
          <MetaSectionHeader title="Bağlantı sağlığı" description="Yetki, senkron ve webhook durumlarının kısa özeti." />
          {overviewQuery.isLoading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20 rounded-lg" />)}</div>
          ) : (overviewQuery.data?.connectionHealth?.length ?? 0) === 0 ? (
            <MetaEmpty title="Bağlantı bulunamadı" description="Bağlantılar sekmesinden bir Meta işletme hesabı ekleyin." />
          ) : (
            <div className="space-y-3 p-4">
              {overviewQuery.data?.connectionHealth.map((connection) => (
                <div key={connection.connectionId} className="rounded-lg border border-border/70 bg-surface-subtle p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Activity className="size-4 shrink-0 text-primary" />
                      <p className="truncate text-sm font-semibold">{connection.name}</p>
                    </div>
                    <MetaConnectionBadge status={connection.status} />
                  </div>
                  <p className="mt-2 truncate text-[11px] text-muted-foreground">
                    {connection.lastError || `Son senkron: ${formatMetaDate(connection.lastSyncAt)}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </MetaSurface>
      </div>
    </div>
  );
}
