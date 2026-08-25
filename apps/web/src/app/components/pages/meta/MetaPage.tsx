import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Cable,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  PackageSearch,
  RefreshCw,
  Settings2,
  ShieldX,
  UsersRound,
} from "lucide-react";
import { Button } from "../../ui/button";
import { useAuth } from "../../../../lib/auth";
import { metaQueryKeys, metaService } from "../../../../lib/meta-service";
import { MetaAudiencesTab } from "./MetaAudiencesTab";
import { MetaAutomationTab } from "./MetaAutomationTab";
import { MetaCampaignsTab } from "./MetaCampaignsTab";
import { MetaCatalogsTab } from "./MetaCatalogsTab";
import { MetaConnectionsTab } from "./MetaConnectionsTab";
import { MetaInboxTab } from "./MetaInboxTab";
import { MetaLeadsTab } from "./MetaLeadsTab";
import { MetaOverviewTab } from "./MetaOverviewTab";

type MetaTab = "overview" | "leads" | "campaigns" | "inbox" | "automation" | "audiences" | "catalogs" | "connections";

const META_TABS: Array<{ id: MetaTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "overview", label: "Genel bakış", icon: LayoutDashboard },
  { id: "leads", label: "Lead'ler", icon: UsersRound },
  { id: "campaigns", label: "Kampanyalar", icon: Megaphone },
  { id: "inbox", label: "Mesajlar ve yorumlar", icon: MessageSquareText },
  { id: "automation", label: "Otomasyonlar ve CAPI", icon: Settings2 },
  { id: "audiences", label: "Kitleler", icon: UsersRound },
  { id: "catalogs", label: "Katalog", icon: PackageSearch },
  { id: "connections", label: "Bağlantılar ve sağlık", icon: Cable },
];

export function MetaPage({ onOpenOpportunity }: { onOpenOpportunity?: (id: string) => void }) {
  const { hasPermission, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<MetaTab>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const isAdmin = hasRole("super_admin") || hasRole("admin");
  const canRead = isAdmin || hasPermission("meta.read") || hasPermission("meta_campaigns.read") || hasPermission("meta_messages.read");
  const canManageConnections = isAdmin || hasPermission("meta.create") || hasPermission("meta.update") || hasPermission("meta.delete");
  const canManageCampaigns = isAdmin || hasPermission("meta_campaigns.create") || hasPermission("meta_campaigns.update") || hasPermission("meta_campaigns.approve");
  const canManageMessages = isAdmin || hasPermission("meta_messages.create") || hasPermission("meta_messages.update");
  const canManageAutomation = isAdmin || hasPermission("meta.create") || hasPermission("meta.update");
  const canManageAudiences = isAdmin || hasPermission("meta_audiences.create") || hasPermission("meta_audiences.update") || hasPermission("meta_audiences.delete");
  const canManageCatalogs = isAdmin || hasPermission("meta_catalogs.create") || hasPermission("meta_catalogs.update") || hasPermission("meta_catalogs.delete");
  const connectionsQuery = useQuery({ queryKey: metaQueryKeys.connections, queryFn: metaService.connections, enabled: canRead, staleTime: 30_000 });
  const activeConnections = (connectionsQuery.data ?? []).filter((connection) => connection.status === "active").length;
  const unhealthyConnections = (connectionsQuery.data ?? []).filter((connection) => connection.status === "error").length;

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("metaConnection") !== "success") return;

    setTab("connections");
    toast.success("Meta hesabı başarıyla bağlandı");
    url.searchParams.delete("metaConnection");
    window.history.replaceState({}, "", url);
    void queryClient.invalidateQueries({ queryKey: metaQueryKeys.root });
  }, [queryClient]);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: metaQueryKeys.root });
    } finally {
      setRefreshing(false);
    }
  };

  if (!canRead) {
    return (
      <div className="crm-page mx-auto max-w-[1480px]">
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-border/70 bg-card px-6 text-center shadow-sm">
          <span className="grid size-14 place-items-center rounded-xl border border-destructive/20 bg-destructive-soft text-destructive"><ShieldX className="size-6" /></span>
          <h1 className="mt-4 font-display text-2xl font-semibold">Meta Merkezi erişimi gerekli</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Meta lead, kampanya ve mesaj verilerini görüntülemek için yöneticinizden Meta okuma yetkisi isteyin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="crm-page mx-auto max-w-[1480px] pb-20">
      <header className="relative overflow-hidden rounded-2xl border border-primary/20 bg-[linear-gradient(115deg,var(--card)_0%,color-mix(in_srgb,var(--primary)_8%,var(--card))_100%)] px-5 py-5 shadow-sm sm:px-6">
        <div className="pointer-events-none absolute -right-14 -top-20 size-56 rounded-full border-[28px] border-primary/[0.035]" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#1877f2] text-white shadow-[0_12px_30px_-18px_rgba(24,119,242,.9)]"><Megaphone className="size-5" /></span>
            <div className="min-w-0">
              <p className="ui-eyebrow text-primary">META OPERASYON MERKEZİ</p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Reklamdan satışa tek akış</h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">Lead Ads, kampanya, konuşma, CAPI, kitle ve katalog operasyonlarını CRM sonuçlarıyla yönetin.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-4 rounded-xl border border-border/70 bg-card/85 px-4 py-3 shadow-xs">
              <div><p className="text-[10px] font-medium text-muted-foreground">Aktif bağlantı</p><p className="mt-0.5 font-display text-xl font-semibold tabular-nums">{activeConnections}</p></div>
              <span className="h-8 w-px bg-border" />
              <div><p className="text-[10px] font-medium text-muted-foreground">Kontrol gerekli</p><p className={`mt-0.5 font-display text-xl font-semibold tabular-nums ${unhealthyConnections > 0 ? "text-destructive" : "text-success"}`}>{unhealthyConnections}</p></div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void refreshAll()} disabled={refreshing}>
              <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} /> Tümünü yenile
            </Button>
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-[var(--z-sticky)] mt-4 overflow-x-auto rounded-xl border border-border/70 bg-card/95 p-1 shadow-sm backdrop-blur" aria-label="Meta Merkezi bölümleri">
        <div role="tablist" className="flex min-w-max gap-1">
          {META_TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`meta-panel-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,transform] active:translate-y-px ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Icon className="size-3.5" /> {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main id={`meta-panel-${tab}`} role="tabpanel" className="mt-4 focus:outline-none">
        {tab === "overview" && <MetaOverviewTab onOpenOpportunity={onOpenOpportunity} />}
        {tab === "leads" && <MetaLeadsTab onOpenOpportunity={onOpenOpportunity} />}
        {tab === "campaigns" && <MetaCampaignsTab canManage={canManageCampaigns} />}
        {tab === "inbox" && <MetaInboxTab canManage={canManageMessages} />}
        {tab === "automation" && <MetaAutomationTab canManage={canManageAutomation} />}
        {tab === "audiences" && <MetaAudiencesTab canManage={canManageAudiences} />}
        {tab === "catalogs" && <MetaCatalogsTab canManage={canManageCatalogs} />}
        {tab === "connections" && <MetaConnectionsTab canManage={canManageConnections} />}
      </main>

      <div className="sr-only" aria-live="polite">{refreshing ? "Meta verileri yenileniyor" : ""}</div>
    </div>
  );
}

export default MetaPage;
