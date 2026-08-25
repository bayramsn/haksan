import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Coins, MousePointerClick, Pause, Pencil, Play, Plus, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  getMetaErrorMessage,
  metaQueryKeys,
  metaService,
  type MetaCampaign,
  type MetaCampaignStatus,
} from "../../../../lib/meta-service";
import {
  formatMetaMoney,
  formatMetaNumber,
  MetaEmpty,
  MetaErrorState,
  MetaPagination,
  MetaSectionHeader,
  MetaStatusBadge,
  MetaSurface,
  MetaTableSkeleton,
} from "./meta-shared";

const PAGE_SIZE = 25;

function CampaignMetric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/10 bg-brand-blue-soft text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate font-display text-xl font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function MetaCampaignsTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusChange, setStatusChange] = useState<{ campaign: MetaCampaign; status: MetaCampaignStatus } | null>(null);
  const [budgetCampaign, setBudgetCampaign] = useState<MetaCampaign | null>(null);
  const [budget, setBudget] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createConfirmed, setCreateConfirmed] = useState(false);
  const [draft, setDraft] = useState({ connectionId: "", name: "", objective: "OUTCOME_LEADS", dailyBudget: "" });
  const [connectionId, setConnectionId] = useState("");
  const connectionsQuery = useQuery({ queryKey: metaQueryKeys.connections, queryFn: metaService.connections, staleTime: 60_000 });
  useEffect(() => {
    if (!connectionId) setConnectionId(connectionsQuery.data?.find((item) => item.status === "active")?.id ?? "");
  }, [connectionId, connectionsQuery.data]);
  const campaignsParams = { page, pageSize: PAGE_SIZE, connectionId: connectionId || undefined };
  const campaignsQuery = useQuery({
    queryKey: metaQueryKeys.campaigns(campaignsParams),
    queryFn: () => metaService.campaigns(campaignsParams),
    enabled: Boolean(connectionId),
    staleTime: 30_000,
  });
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  const insightsParams = { page: 1, pageSize: 100, connectionId: connectionId || undefined, from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
  const insightsQuery = useQuery({
    queryKey: metaQueryKeys.insights(insightsParams),
    queryFn: () => metaService.insights(insightsParams),
    enabled: Boolean(connectionId),
    staleTime: 30_000,
  });

  const totals = useMemo(() => (insightsQuery.data?.items ?? []).reduce(
    (result, item) => ({
      spendMinor: result.spendMinor + item.spendMinor,
      impressions: result.impressions + item.impressions,
      clicks: result.clicks + item.clicks,
      leads: result.leads + item.leads,
      currency: result.currency || item.currency,
    }),
    { spendMinor: 0, impressions: 0, clicks: 0, leads: 0, currency: "TRY" },
  ), [insightsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { connectionId: string; status?: MetaCampaignStatus; dailyBudgetMinor?: number } }) =>
      metaService.updateCampaign(id, patch),
    onSuccess: async () => {
      toast.success("Kampanya güncellendi");
      setStatusChange(null);
      setBudgetCampaign(null);
      await queryClient.invalidateQueries({ queryKey: ["meta", "campaigns"] });
    },
    onError: (error) => toast.error("Kampanya güncellenemedi", { description: getMetaErrorMessage(error) }),
  });
  const createMutation = useMutation({
    mutationFn: metaService.createCampaign,
    onSuccess: async () => {
      toast.success("Kampanya oluşturuldu");
      setCreateOpen(false);
      setCreateConfirmed(false);
      setDraft({ connectionId: "", name: "", objective: "OUTCOME_LEADS", dailyBudget: "" });
      await queryClient.invalidateQueries({ queryKey: ["meta", "campaigns"] });
    },
    onError: (error) => toast.error("Kampanya oluşturulamadı", { description: getMetaErrorMessage(error) }),
  });

  const openBudget = (campaign: MetaCampaign) => {
    setBudgetCampaign(campaign);
    setBudget(campaign.dailyBudgetMinor == null ? "" : String(campaign.dailyBudgetMinor / 100));
  };

  const saveBudget = () => {
    if (!budgetCampaign) return;
    const parsed = Number(budget.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Geçerli bir günlük bütçe girin");
      return;
    }
    updateMutation.mutate({ id: budgetCampaign.id, patch: { connectionId: budgetCampaign.connectionId, dailyBudgetMinor: Math.round(parsed * 100) } });
  };

  const createCampaign = () => {
    const dailyBudget = Number(draft.dailyBudget.replace(",", "."));
    if (!draft.connectionId || draft.name.trim().length < 2 || !Number.isFinite(dailyBudget) || dailyBudget <= 0) {
      toast.error("Hesap, kampanya adı ve günlük bütçe alanlarını kontrol edin");
      return;
    }
    if (!createConfirmed) {
      toast.error("Reklam hesabı etkisini onaylamanız gerekiyor");
      return;
    }
    createMutation.mutate({
      connectionId: draft.connectionId,
      name: draft.name.trim(),
      objective: draft.objective,
      status: "PAUSED",
      dailyBudgetMinor: Math.round(dailyBudget * 100),
    });
  };

  return (
    <div className="space-y-4">
      {!canManage && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Salt okunur kampanya görünümü</p>
            <p className="mt-0.5 text-xs text-warning/85">Bütçe ve yayın durumu değişiklikleri yalnız Meta yönetim yetkisi olan kullanıcılara açıktır.</p>
          </div>
        </div>
      )}

      <MetaSurface>
        <MetaSectionHeader
          title="Reklam performansı"
          description="Meta Insights verisini lead ve CRM dönüşüm sonuçlarıyla birlikte okuyun."
          actions={
            <>
              <Select value={connectionId} onValueChange={(value) => { setConnectionId(value); setPage(1); }}>
                <SelectTrigger size="sm" className="w-[190px]" aria-label="Reklam hesabı"><SelectValue placeholder="Reklam hesabı seçin" /></SelectTrigger>
                <SelectContent>{(connectionsQuery.data ?? []).filter((item) => item.status === "active").map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" disabled={!connectionId} onClick={() => { void campaignsQuery.refetch(); void insightsQuery.refetch(); }}><RefreshCw className="size-3.5" /> Yenile</Button>
            </>
          }
        />
        <div className="grid divide-y divide-border/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <CampaignMetric label="Toplam harcama" value={formatMetaMoney(totals.spendMinor, totals.currency)} icon={<Coins className="size-4" />} />
          <CampaignMetric label="Gösterim" value={formatMetaNumber(totals.impressions)} icon={<UsersRound className="size-4" />} />
          <CampaignMetric label="Tıklama" value={formatMetaNumber(totals.clicks)} icon={<MousePointerClick className="size-4" />} />
          <CampaignMetric label="Lead" value={formatMetaNumber(totals.leads)} icon={<UsersRound className="size-4" />} />
        </div>
      </MetaSurface>

      <MetaSurface>
        <MetaSectionHeader
          title="Kampanyalar"
          description="Yazma işlemleri her değişiklik için açık onay ister ve sunucu yetki kontrolünden geçer."
          actions={<Button type="button" size="sm" disabled={!canManage} onClick={() => setCreateOpen(true)}><Plus className="size-3.5" /> Kampanya oluştur</Button>}
        />
        {campaignsQuery.isLoading ? (
          <MetaTableSkeleton columns={7} />
        ) : campaignsQuery.isError ? (
          <MetaErrorState error={getMetaErrorMessage(campaignsQuery.error)} onRetry={() => void campaignsQuery.refetch()} />
        ) : !campaignsQuery.data || campaignsQuery.data.items.length === 0 ? (
          <MetaEmpty title="Kampanya bulunamadı" description="Bağlı reklam hesabı senkron edildiğinde kampanyalar burada listelenecek." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1040px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Kampanya</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">Günlük bütçe</TableHead>
                  <TableHead className="text-right">Harcama</TableHead>
                  <TableHead className="text-right">Gösterim</TableHead>
                  <TableHead className="text-right">Tıklama</TableHead>
                  <TableHead className="text-right">Lead</TableHead>
                  <TableHead className="text-right">Nitelikli</TableHead>
                  <TableHead className="w-36 text-right">Kontrol</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignsQuery.data?.items.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <p className="max-w-[240px] truncate text-sm font-semibold">{campaign.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{campaign.objective ?? "Hedef bilgisi yok"}</p>
                    </TableCell>
                    <TableCell><MetaStatusBadge status={campaign.status} label={campaign.status === "ACTIVE" ? "Yayında" : campaign.status === "PAUSED" ? "Duraklatıldı" : "Arşiv"} /></TableCell>
                    <TableCell className="text-right font-data text-xs">{campaign.dailyBudgetMinor == null ? "-" : formatMetaMoney(campaign.dailyBudgetMinor, campaign.currency)}</TableCell>
                    <TableCell className="text-right font-data text-xs">{formatMetaMoney(campaign.spendMinor, campaign.currency)}</TableCell>
                    <TableCell className="text-right font-data text-xs">{formatMetaNumber(campaign.impressions)}</TableCell>
                    <TableCell className="text-right font-data text-xs">{formatMetaNumber(campaign.clicks)}</TableCell>
                    <TableCell className="text-right font-data text-xs">{formatMetaNumber(campaign.leads)}</TableCell>
                    <TableCell className="text-right font-data text-xs">{formatMetaNumber(campaign.qualifiedLeads)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="icon" variant="ghost" disabled={!canManage || campaign.status === "ARCHIVED"} onClick={() => openBudget(campaign)} aria-label={`${campaign.name} bütçesini düzenle`}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={!canManage || campaign.status === "ARCHIVED"}
                          onClick={() => setStatusChange({ campaign, status: campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })}
                          aria-label={`${campaign.name} kampanyasını ${campaign.status === "ACTIVE" ? "duraklat" : "yayına al"}`}
                        >
                          {campaign.status === "ACTIVE" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {campaignsQuery.data && <MetaPagination {...campaignsQuery.data} onPageChange={setPage} />}
      </MetaSurface>

      <AlertDialog open={Boolean(statusChange)} onOpenChange={(open) => !open && setStatusChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kampanya durumunu değiştir</AlertDialogTitle>
            <AlertDialogDescription>
              {statusChange?.campaign.name} kampanyası {statusChange?.status === "ACTIVE" ? "yayına alınacak" : "duraklatılacak"}. Bu işlem reklam teslimini doğrudan etkiler.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Değişiklik Meta reklam hesabına gönderilir ve audit kaydına alınır.
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              disabled={!statusChange || updateMutation.isPending}
              onClick={() => statusChange && updateMutation.mutate({ id: statusChange.campaign.id, patch: { connectionId: statusChange.campaign.connectionId, status: statusChange.status } })}
            >
              {updateMutation.isPending ? "Uygulanıyor" : "Değişikliği onayla"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(budgetCampaign)} onOpenChange={(open) => !open && setBudgetCampaign(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Günlük bütçeyi güncelle</DialogTitle>
            <DialogDescription>{budgetCampaign?.name} için yeni günlük limiti hesap para biriminde girin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="meta-campaign-budget" className="text-sm font-medium">Günlük bütçe ({budgetCampaign?.currency ?? "TRY"})</label>
            <Input id="meta-campaign-budget" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="0,00" />
            <p className="text-xs text-muted-foreground">Bütçe sunucu tarafından alt ve üst limitlere göre yeniden doğrulanır.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBudgetCampaign(null)}>Vazgeç</Button>
            <Button type="button" onClick={saveBudget} disabled={updateMutation.isPending}>Onaylayıp güncelle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meta kampanyası oluştur</DialogTitle>
            <DialogDescription>Yeni kampanyayı bağlı reklam hesabında oluşturun. Secret ve erişim token'ı tarayıcıya aktarılmaz.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="meta-campaign-account" className="text-sm font-medium">Reklam hesabı</label>
              <Select value={draft.connectionId} onValueChange={(value) => setDraft((current) => ({ ...current, connectionId: value }))}>
                <SelectTrigger id="meta-campaign-account"><SelectValue placeholder="Bağlantı seçin" /></SelectTrigger>
                <SelectContent>{(connectionsQuery.data ?? []).filter((item) => item.status === "active").map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="meta-campaign-name" className="text-sm font-medium">Kampanya adı</label>
              <Input id="meta-campaign-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={120} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="meta-campaign-objective" className="text-sm font-medium">Hedef</label>
              <Select value={draft.objective} onValueChange={(value) => setDraft((current) => ({ ...current, objective: value }))}>
                <SelectTrigger id="meta-campaign-objective"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUTCOME_LEADS">Lead toplama</SelectItem>
                  <SelectItem value="OUTCOME_SALES">Satış</SelectItem>
                  <SelectItem value="OUTCOME_ENGAGEMENT">Etkileşim</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="meta-campaign-create-budget" className="text-sm font-medium">Günlük bütçe</label>
              <Input id="meta-campaign-create-budget" inputMode="decimal" value={draft.dailyBudget} onChange={(event) => setDraft((current) => ({ ...current, dailyBudget: event.target.value }))} placeholder="0,00" />
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning-soft p-3 text-xs text-warning sm:col-span-2">
              <Checkbox checked={createConfirmed} onCheckedChange={(value) => setCreateConfirmed(value === true)} className="mt-0.5" />
              <span>Bu işlemin bağlı reklam hesabında bütçeli, duraklatılmış bir kampanya oluşturacağını onaylıyorum. Yayına alma ayrıca onaylanır.</span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Vazgeç</Button>
            <Button type="button" disabled={createMutation.isPending || !createConfirmed} onClick={createCampaign}>{createMutation.isPending ? "Oluşturuluyor" : "Onaylayıp oluştur"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
