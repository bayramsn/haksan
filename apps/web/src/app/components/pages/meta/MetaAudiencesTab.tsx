import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, Trash2, UserMinus, UserPlus, UsersRound } from "lucide-react";
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
import { Textarea } from "../../ui/textarea";
import { getMetaErrorMessage, metaQueryKeys, metaService, type MetaAudience } from "../../../../lib/meta-service";
import {
  formatMetaDate,
  formatMetaNumber,
  MetaEmpty,
  MetaErrorState,
  MetaPagination,
  MetaSectionHeader,
  MetaStatusBadge,
  MetaSurface,
  MetaTableSkeleton,
} from "./meta-shared";

const PAGE_SIZE = 20;

function parseIds(value: string): string[] {
  return [...new Set(value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean))];
}

export function MetaAudiencesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ connectionId: "", name: "", description: "" });
  const [memberAction, setMemberAction] = useState<{ audience: MetaAudience; mode: "add" | "remove" } | null>(null);
  const [memberIds, setMemberIds] = useState("");
  const [legalBasisConfirmed, setLegalBasisConfirmed] = useState(false);
  const [deleteAudience, setDeleteAudience] = useState<MetaAudience | null>(null);
  const params = { page, pageSize: PAGE_SIZE };
  const audiencesQuery = useQuery({ queryKey: metaQueryKeys.audiences(params), queryFn: () => metaService.audiences(params), staleTime: 30_000 });
  const connectionsQuery = useQuery({ queryKey: metaQueryKeys.connections, queryFn: metaService.connections, staleTime: 60_000 });

  const createMutation = useMutation({
    mutationFn: metaService.createAudience,
    onSuccess: async () => {
      toast.success("Özel hedef kitle oluşturuldu");
      setCreateOpen(false);
      setDraft({ connectionId: "", name: "", description: "" });
      await queryClient.invalidateQueries({ queryKey: ["meta", "audiences"] });
    },
    onError: (error) => toast.error("Kitle oluşturulamadı", { description: getMetaErrorMessage(error) }),
  });
  const membersMutation = useMutation({
    mutationFn: ({ audience, mode, opportunityIds }: { audience: MetaAudience; mode: "add" | "remove"; opportunityIds: string[] }) =>
      mode === "add"
        ? metaService.syncAudienceMembers(audience.id, { connectionId: audience.connectionId, opportunityIds, legalBasisConfirmed: true })
        : metaService.removeAudienceMembers(audience.id, { connectionId: audience.connectionId, opportunityIds }),
    onSuccess: async (result) => {
      toast.success("Kitle üyeleri güncellendi", { description: `${result.accepted} kayıt işleme alındı.` });
      setMemberAction(null);
      setMemberIds("");
      setLegalBasisConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ["meta", "audiences"] });
    },
    onError: (error) => toast.error("Kitle üyeleri güncellenemedi", { description: getMetaErrorMessage(error) }),
  });
  const deleteMutation = useMutation({
    mutationFn: (audience: MetaAudience) => metaService.deleteAudience(audience.id, audience.connectionId),
    onSuccess: async () => {
      toast.success("Özel hedef kitle silindi");
      setDeleteAudience(null);
      await queryClient.invalidateQueries({ queryKey: ["meta", "audiences"] });
    },
    onError: (error) => toast.error("Kitle silinemedi", { description: getMetaErrorMessage(error) }),
  });

  const create = () => {
    if (!draft.connectionId || draft.name.trim().length < 2) {
      toast.error("Bağlantı ve kitle adı zorunludur");
      return;
    }
    createMutation.mutate({ connectionId: draft.connectionId, name: draft.name.trim(), description: draft.description.trim() || undefined });
  };
  const updateMembers = () => {
    if (!memberAction) return;
    const opportunityIds = parseIds(memberIds);
    if (opportunityIds.length === 0) {
      toast.error("En az bir CRM fırsat kimliği girin");
      return;
    }
    if (memberAction.mode === "add" && !legalBasisConfirmed) {
      toast.error("İzinli veri kullanımını onaylamanız gerekiyor");
      return;
    }
    membersMutation.mutate({ ...memberAction, opportunityIds });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-brand-blue-soft p-4 text-sm text-primary">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <div><p className="font-semibold">Kişisel veri koruması</p><p className="mt-0.5 text-xs leading-relaxed text-primary/80">Telefon ve e-posta tarayıcıdan Meta'ya gönderilmez. CRM fırsat kimlikleri sunucuda izin kontrolü ve SHA-256 eşlemesi sonrası işlenir.</p></div>
      </div>
      <MetaSurface>
        <MetaSectionHeader
          title="Özel hedef kitleler"
          description="CRM segmentlerini Meta hesaplarına izinli ve denetlenebilir biçimde senkronlayın."
          actions={<Button type="button" size="sm" disabled={!canManage} onClick={() => setCreateOpen(true)}><Plus className="size-3.5" /> Kitle oluştur</Button>}
        />
        {audiencesQuery.isLoading ? (
          <MetaTableSkeleton columns={6} />
        ) : audiencesQuery.isError ? (
          <MetaErrorState error={getMetaErrorMessage(audiencesQuery.error)} onRetry={() => void audiencesQuery.refetch()} />
      ) : !audiencesQuery.data || audiencesQuery.data.items.length === 0 ? (
          <MetaEmpty title="Özel hedef kitle yok" description="CRM segmenti senkronlamak için bağlı bir reklam hesabında kitle oluşturun." />
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {audiencesQuery.data?.items.map((audience) => (
              <article key={audience.id} className="rounded-xl border border-border/70 bg-surface-subtle p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-primary/10 bg-card text-primary"><UsersRound className="size-4" /></span>
                  <MetaStatusBadge status={audience.syncStatus ?? "idle"} label={audience.syncStatus === "ready" ? "Senkron" : audience.syncStatus === "syncing" ? "İşleniyor" : audience.syncStatus === "failed" ? "Hatalı" : "Bekliyor"} />
                </div>
                <h3 className="mt-4 truncate font-display text-lg font-semibold">{audience.name}</h3>
                <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">{audience.description || "Açıklama eklenmemiş"}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/70 pt-3 text-xs">
                  <div><p className="text-muted-foreground">Tahmini üye</p><p className="mt-0.5 font-data font-semibold">{audience.approximateCount == null ? "-" : formatMetaNumber(audience.approximateCount)}</p></div>
                  <div><p className="text-muted-foreground">Son senkron</p><p className="mt-0.5 truncate font-data text-[10px] font-semibold">{formatMetaDate(audience.lastSyncAt)}</p></div>
                </div>
                {audience.lastError && <p className="mt-3 truncate text-xs text-destructive">{audience.lastError}</p>}
                <div className="mt-4 flex items-center gap-1">
                  <Button type="button" variant="outline" size="sm" className="flex-1" disabled={!canManage} onClick={() => { setMemberAction({ audience, mode: "add" }); setMemberIds(""); }}><UserPlus className="size-3.5" /> Üye ekle</Button>
                  <Button type="button" variant="outline" size="icon" disabled={!canManage} onClick={() => { setMemberAction({ audience, mode: "remove" }); setMemberIds(""); }} aria-label={`${audience.name} kitlesinden üye çıkar`}><UserMinus className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" disabled={!canManage} onClick={() => setDeleteAudience(audience)} aria-label={`${audience.name} kitlesini sil`}><Trash2 className="size-3.5 text-destructive" /></Button>
                </div>
              </article>
            ))}
          </div>
        )}
        {audiencesQuery.data && <MetaPagination {...audiencesQuery.data} onPageChange={setPage} />}
      </MetaSurface>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Özel hedef kitle oluştur</DialogTitle><DialogDescription>Kitle Meta reklam hesabında oluşturulur. Üyeler ayrı ve onaylı bir işlemle eklenir.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><label htmlFor="meta-audience-connection" className="text-sm font-medium">Reklam hesabı</label><Select value={draft.connectionId} onValueChange={(value) => setDraft((current) => ({ ...current, connectionId: value }))}><SelectTrigger id="meta-audience-connection"><SelectValue placeholder="Bağlantı seçin" /></SelectTrigger><SelectContent>{(connectionsQuery.data ?? []).filter((item) => item.status === "active").map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><label htmlFor="meta-audience-name" className="text-sm font-medium">Kitle adı</label><Input id="meta-audience-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={100} /></div>
            <div className="space-y-2"><label htmlFor="meta-audience-description" className="text-sm font-medium">Açıklama</label><Textarea id="meta-audience-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={300} /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Vazgeç</Button><Button type="button" disabled={createMutation.isPending} onClick={create}>Kitleyi oluştur</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(memberAction)} onOpenChange={(open) => !open && setMemberAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{memberAction?.mode === "add" ? "Kitleye üye ekle" : "Kitleden üye çıkar"}</DialogTitle><DialogDescription>CRM fırsat kimliklerini virgül, boşluk veya yeni satırla ayırın.</DialogDescription></DialogHeader>
          <div className="space-y-2"><label htmlFor="meta-audience-member-ids" className="text-sm font-medium">CRM fırsat kimlikleri</label><Textarea id="meta-audience-member-ids" value={memberIds} onChange={(event) => setMemberIds(event.target.value)} placeholder="fırsat-kimliği-1&#10;fırsat-kimliği-2" className="min-h-32 font-data text-xs" /><p className="text-xs text-muted-foreground">{parseIds(memberIds).length} benzersiz kayıt</p></div>
          {memberAction?.mode === "add" && <label className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning-soft p-3 text-xs text-warning"><Checkbox checked={legalBasisConfirmed} onCheckedChange={(value) => setLegalBasisConfirmed(value === true)} className="mt-0.5" /><span>Bu segmentteki kişilerin reklam hedefleme aktarımı için geçerli rıza veya hukuki dayanağı olduğunu onaylıyorum.</span></label>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setMemberAction(null)}>Vazgeç</Button><Button type="button" disabled={membersMutation.isPending || (memberAction?.mode === "add" && !legalBasisConfirmed)} onClick={updateMembers}>{memberAction?.mode === "add" ? "Onaylayıp ekle" : "Üyeleri çıkar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteAudience)} onOpenChange={(open) => !open && setDeleteAudience(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Özel hedef kitleyi sil</AlertDialogTitle><AlertDialogDescription>{deleteAudience?.name} hem CRM bağlantısından hem bağlı Meta hesabından silinecek. Bu işlem geri alınamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!deleteAudience || deleteMutation.isPending} onClick={() => deleteAudience && deleteMutation.mutate(deleteAudience)}>Kalıcı olarak sil</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
