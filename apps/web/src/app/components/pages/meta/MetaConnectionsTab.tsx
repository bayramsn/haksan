import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Cable, CheckCircle2, Clock3, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2, Webhook } from "lucide-react";
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
import { getMetaErrorMessage, metaQueryKeys, metaService, type MetaConnection } from "../../../../lib/meta-service";
import {
  formatMetaDate,
  MetaConnectionBadge,
  MetaEmpty,
  MetaErrorState,
  MetaSectionHeader,
  MetaSurface,
} from "./meta-shared";

type ConnectionDraft = {
  name: string;
  accessToken: string;
  pageId: string;
  instagramAccountId: string;
  adAccountId: string;
  businessId: string;
  datasetId: string;
  whatsappBusinessAccountId: string;
  phoneNumberId: string;
};

const EMPTY_DRAFT: ConnectionDraft = {
  name: "",
  accessToken: "",
  pageId: "",
  instagramAccountId: "",
  adAccountId: "",
  businessId: "",
  datasetId: "",
  whatsappBusinessAccountId: "",
  phoneNumberId: "",
};

function HealthLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-2 text-xs"><span className="text-primary">{icon}</span><span className="text-muted-foreground">{label}</span><span className="ml-auto max-w-[190px] truncate font-data text-[10px] text-foreground">{value}</span></div>;
}

export function MetaConnectionsTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<ConnectionDraft>(EMPTY_DRAFT);
  const [credentialConfirmed, setCredentialConfirmed] = useState(false);
  const [deleteConnection, setDeleteConnection] = useState<MetaConnection | null>(null);
  const [creating, setCreating] = useState(false);
  const [startingOAuth, setStartingOAuth] = useState(false);
  const connectionsQuery = useQuery({ queryKey: metaQueryKeys.connections, queryFn: metaService.connections, staleTime: 30_000 });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => metaService.verifyConnection(id),
    onSuccess: async () => {
      toast.success("Meta bağlantısı doğrulandı");
      await queryClient.invalidateQueries({ queryKey: metaQueryKeys.root });
    },
    onError: (error) => toast.error("Bağlantı doğrulanamadı", { description: getMetaErrorMessage(error) }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => metaService.deleteConnection(id),
    onSuccess: async () => {
      toast.success("Meta bağlantısı kaldırıldı");
      setDeleteConnection(null);
      await queryClient.invalidateQueries({ queryKey: metaQueryKeys.root });
    },
    onError: (error) => toast.error("Bağlantı kaldırılamadı", { description: getMetaErrorMessage(error) }),
  });

  const startOAuth = async () => {
    setStartingOAuth(true);
    try {
      const result = await metaService.startOAuth();
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      toast.error("Meta bağlantısı başlatılamadı", { description: getMetaErrorMessage(error) });
      setStartingOAuth(false);
    }
  };

  const create = async () => {
    const accessToken = draft.accessToken.trim();
    if (!draft.name.trim() || !accessToken || !credentialConfirmed) {
      toast.error("Bağlantı adı, erişim token'ı ve güvenlik onayı zorunludur");
      return;
    }
    const payload = {
      name: draft.name.trim(),
      accessToken,
      pageId: draft.pageId.trim() || undefined,
      instagramAccountId: draft.instagramAccountId.trim() || undefined,
      adAccountId: draft.adAccountId.trim() || undefined,
      businessId: draft.businessId.trim() || undefined,
      datasetId: draft.datasetId.trim() || undefined,
      whatsappBusinessAccountId: draft.whatsappBusinessAccountId.trim() || undefined,
      phoneNumberId: draft.phoneNumberId.trim() || undefined,
      permissions: [],
    };
    setDraft((current) => ({ ...current, accessToken: "" }));
    setCreating(true);
    try {
      await metaService.createConnection(payload);
      toast.success("Meta bağlantısı oluşturuldu");
      setCreateOpen(false);
      setCredentialConfirmed(false);
      setDraft(EMPTY_DRAFT);
      await queryClient.invalidateQueries({ queryKey: metaQueryKeys.root });
    } catch (error) {
      toast.error("Meta bağlantısı oluşturulamadı", { description: getMetaErrorMessage(error) });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-brand-blue-soft p-4 text-sm text-primary">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <div><p className="font-semibold">Kimlik bilgisi güvenliği</p><p className="mt-0.5 text-xs leading-relaxed text-primary/80">Token yalnız TLS isteğinin gövdesinde backend'e iletilir, tarayıcı depolamasına yazılmaz ve liste yanıtlarında geri dönmez. Gönderimden sonra form belleği temizlenir.</p></div>
      </div>
      <MetaSurface>
        <MetaSectionHeader
          title="Meta bağlantıları ve sağlık"
          description="Business, Page, reklam hesabı, dataset ve mesajlaşma varlıklarının doğrulama durumunu izleyin."
          actions={
            <>
              <Button type="button" variant="outline" size="sm" disabled={!canManage || startingOAuth} onClick={() => void startOAuth()}><Cable className="size-3.5" /> Meta ile bağlan</Button>
              <Button type="button" size="sm" disabled={!canManage} onClick={() => setCreateOpen(true)}><Plus className="size-3.5" /> Manuel ekle</Button>
            </>
          }
        />
        {connectionsQuery.isError ? (
          <MetaErrorState error={getMetaErrorMessage(connectionsQuery.error)} onRetry={() => void connectionsQuery.refetch()} />
        ) : (connectionsQuery.data?.length ?? 0) === 0 && !connectionsQuery.isLoading ? (
          <MetaEmpty title="Meta bağlantısı yok" description="Lead, reklam ve mesajlaşma verilerini almak için ilk işletme bağlantısını ekleyin." />
        ) : (
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {(connectionsQuery.data ?? []).map((connection) => {
              const tokenExpired = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() <= Date.now() : false;
              return (
                <article key={connection.id} className="rounded-xl border border-border/70 bg-surface-subtle p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-primary/10 bg-card text-primary"><Cable className="size-4" /></span>
                    <div className="min-w-0 flex-1"><h3 className="truncate font-display text-lg font-semibold">{connection.name}</h3><p className="mt-0.5 truncate font-data text-[10px] text-muted-foreground">{connection.businessId || connection.pageId || connection.id}</p></div>
                    <MetaConnectionBadge status={connection.status} />
                  </div>
                  <div className="mt-4 space-y-2.5 rounded-lg border border-border/70 bg-card p-3">
                    <HealthLine icon={<CheckCircle2 className="size-3.5" />} label="Son doğrulama" value={formatMetaDate(connection.lastVerifiedAt)} />
                    <HealthLine icon={<RefreshCw className="size-3.5" />} label="Son senkron" value={formatMetaDate(connection.lastSyncAt)} />
                    <HealthLine icon={<Webhook className="size-3.5" />} label="Son webhook" value={formatMetaDate(connection.lastWebhookAt)} />
                    <HealthLine icon={<Clock3 className="size-3.5" />} label="Token süresi" value={connection.tokenExpiresAt ? `${formatMetaDate(connection.tokenExpiresAt)}${tokenExpired ? " (doldu)" : ""}` : "Süre bilgisi yok"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground sm:grid-cols-4">
                    <span className="truncate">Page: {connection.pageId || "-"}</span><span className="truncate">IG: {connection.instagramAccountId || "-"}</span><span className="truncate">Ads: {connection.adAccountId || "-"}</span><span className="truncate">Dataset: {connection.datasetId || "-"}</span>
                  </div>
                  {connection.lastError && <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive-soft p-2 text-xs text-destructive"><Activity className="mt-0.5 size-3.5 shrink-0" /><span className="line-clamp-2">{connection.lastError}</span></div>}
                  <div className="mt-4 flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={!canManage || verifyMutation.isPending || connection.status === "disabled"} onClick={() => verifyMutation.mutate(connection.id)}><RefreshCw className="size-3.5" /> Doğrula</Button>
                    <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive" disabled={!canManage} onClick={() => setDeleteConnection(connection)}><Trash2 className="size-3.5" /> Kaldır</Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </MetaSurface>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setDraft(EMPTY_DRAFT); setCredentialConfirmed(false); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Meta işletme bağlantısı ekle</DialogTitle><DialogDescription>Yalnız kullanacağınız Meta varlık kimliklerini girin. Bağlantı sunucuda doğrulanmadan kaydedilmez.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><label htmlFor="meta-connection-name" className="text-sm font-medium">Bağlantı adı</label><Input id="meta-connection-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={120} placeholder="Haksan Meta Business" /></div>
            <div className="space-y-2 sm:col-span-2"><label htmlFor="meta-connection-token" className="text-sm font-medium">Page access token</label><Input id="meta-connection-token" type="password" value={draft.accessToken} onChange={(event) => setDraft((current) => ({ ...current, accessToken: event.target.value }))} autoComplete="off" spellCheck={false} placeholder="Token yalnız bu gönderimde kullanılır" /><p className="text-xs text-muted-foreground">Token görünür metin, localStorage veya istemci loglarına yazılmaz.</p></div>
            <ConnectionField id="meta-business-id" label="Business ID" value={draft.businessId} onChange={(businessId) => setDraft((current) => ({ ...current, businessId }))} />
            <ConnectionField id="meta-page-id" label="Facebook Page ID" value={draft.pageId} onChange={(pageId) => setDraft((current) => ({ ...current, pageId }))} />
            <ConnectionField id="meta-instagram-id" label="Instagram hesap ID" value={draft.instagramAccountId} onChange={(instagramAccountId) => setDraft((current) => ({ ...current, instagramAccountId }))} />
            <ConnectionField id="meta-ad-account-id" label="Reklam hesap ID" value={draft.adAccountId} onChange={(adAccountId) => setDraft((current) => ({ ...current, adAccountId }))} />
            <ConnectionField id="meta-dataset-id" label="Dataset / Pixel ID" value={draft.datasetId} onChange={(datasetId) => setDraft((current) => ({ ...current, datasetId }))} />
            <ConnectionField id="meta-waba-id" label="WhatsApp Business ID" value={draft.whatsappBusinessAccountId} onChange={(whatsappBusinessAccountId) => setDraft((current) => ({ ...current, whatsappBusinessAccountId }))} />
            <ConnectionField id="meta-phone-id" label="WhatsApp telefon ID" value={draft.phoneNumberId} onChange={(phoneNumberId) => setDraft((current) => ({ ...current, phoneNumberId }))} />
            <label className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning-soft p-3 text-xs text-warning sm:col-span-2"><Checkbox checked={credentialConfirmed} onCheckedChange={(value) => setCredentialConfirmed(value === true)} className="mt-0.5" /><span>Token'ın bu işletmeye ait olduğunu, gerekli en az izinlerle üretildiğini ve güvenli kanaldan alındığını onaylıyorum.</span></label>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Vazgeç</Button><Button type="button" disabled={!credentialConfirmed || creating} onClick={() => void create()}><KeyRound className="size-4" /> {creating ? "Doğrulanıyor" : "Doğrulayıp bağla"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteConnection)} onOpenChange={(open) => !open && setDeleteConnection(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Meta bağlantısını kaldır</AlertDialogTitle><AlertDialogDescription>{deleteConnection?.name} bağlantısı durdurulur. Yeni lead, mesaj ve reklam verisi alınmaz. CRM'deki mevcut kayıtlar silinmez.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!deleteConnection || deleteMutation.isPending} onClick={() => deleteConnection && deleteMutation.mutate(deleteConnection.id)}>Bağlantıyı kaldır</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConnectionField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium">{label}</label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" maxLength={64} /></div>;
}
