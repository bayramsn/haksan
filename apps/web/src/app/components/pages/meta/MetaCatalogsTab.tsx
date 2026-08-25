import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, PackagePlus, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { getMetaErrorMessage, metaQueryKeys, metaService, type MetaCatalog } from "../../../../lib/meta-service";
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

export function MetaCatalogsTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<{ connectionId: string; name: string; vertical: "commerce" | "vehicles" }>({ connectionId: "", name: "", vertical: "commerce" });
  const [productAction, setProductAction] = useState<{ catalog: MetaCatalog; mode: "upsert" | "sync" | "remove" } | null>(null);
  const [productIds, setProductIds] = useState("");
  const [deleteCatalog, setDeleteCatalog] = useState<MetaCatalog | null>(null);
  const params = { page, pageSize: PAGE_SIZE };
  const catalogsQuery = useQuery({ queryKey: metaQueryKeys.catalogs(params), queryFn: () => metaService.catalogs(params), staleTime: 30_000 });
  const connectionsQuery = useQuery({ queryKey: metaQueryKeys.connections, queryFn: metaService.connections, staleTime: 60_000 });

  const createMutation = useMutation({
    mutationFn: metaService.createCatalog,
    onSuccess: async () => {
      toast.success("Meta kataloğu oluşturuldu");
      setCreateOpen(false);
      setDraft({ connectionId: "", name: "", vertical: "commerce" });
      await queryClient.invalidateQueries({ queryKey: ["meta", "catalogs"] });
    },
    onError: (error) => toast.error("Katalog oluşturulamadı", { description: getMetaErrorMessage(error) }),
  });
  const productsMutation = useMutation({
    mutationFn: ({ catalog, mode, ids }: { catalog: MetaCatalog; mode: "upsert" | "sync" | "remove"; ids: string[] }) => {
      const body = { connectionId: catalog.connectionId, productIds: ids };
      if (mode === "remove") return metaService.deleteCatalogProducts(catalog.id, body);
      if (mode === "sync") return metaService.syncCatalog(catalog.id, body);
      return metaService.syncCatalogProducts(catalog.id, body);
    },
    onSuccess: async (result) => {
      toast.success("Katalog ürünleri işleme alındı", { description: `${result.accepted} kayıt kabul edildi.` });
      setProductAction(null);
      setProductIds("");
      await queryClient.invalidateQueries({ queryKey: ["meta", "catalogs"] });
    },
    onError: (error) => toast.error("Katalog ürünleri güncellenemedi", { description: getMetaErrorMessage(error) }),
  });
  const deleteMutation = useMutation({
    mutationFn: (catalog: MetaCatalog) => metaService.deleteCatalog(catalog.id, catalog.connectionId),
    onSuccess: async () => {
      toast.success("Meta kataloğu silindi");
      setDeleteCatalog(null);
      await queryClient.invalidateQueries({ queryKey: ["meta", "catalogs"] });
    },
    onError: (error) => toast.error("Katalog silinemedi", { description: getMetaErrorMessage(error) }),
  });

  const create = () => {
    if (!draft.connectionId || draft.name.trim().length < 2) {
      toast.error("Bağlantı ve katalog adı zorunludur");
      return;
    }
    createMutation.mutate({ connectionId: draft.connectionId, name: draft.name.trim(), vertical: draft.vertical });
  };
  const runProductAction = () => {
    if (!productAction) return;
    const ids = parseIds(productIds);
    if (ids.length === 0) {
      toast.error("En az bir CRM ürün kimliği girin");
      return;
    }
    productsMutation.mutate({ catalog: productAction.catalog, mode: productAction.mode, ids });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-brand-blue-soft p-4 text-sm text-primary">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <div><p className="font-semibold">Sunucu kontrollü ürün aktarımı</p><p className="mt-0.5 text-xs leading-relaxed text-primary/80">Fiyat, stok, görsel ve ürün bağlantıları CRM ürün kimliği üzerinden sunucuda doğrulanır. Tarayıcı doğrudan Meta Graph API'ye bağlanmaz.</p></div>
      </div>
      <MetaSurface>
        <MetaSectionHeader
          title="Meta ürün katalogları"
          description="CRM ürünlerini katalog reklamlarına aktarın, güncelleyin veya katalogdan çıkarın."
          actions={<Button type="button" size="sm" disabled={!canManage} onClick={() => setCreateOpen(true)}><Plus className="size-3.5" /> Katalog oluştur</Button>}
        />
        {catalogsQuery.isLoading ? (
          <MetaTableSkeleton columns={5} />
        ) : catalogsQuery.isError ? (
          <MetaErrorState error={getMetaErrorMessage(catalogsQuery.error)} onRetry={() => void catalogsQuery.refetch()} />
        ) : !catalogsQuery.data || catalogsQuery.data.items.length === 0 ? (
          <MetaEmpty title="Katalog bulunamadı" description="Bağlı Meta işletme hesabında ilk ürün kataloğunu oluşturun." />
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {catalogsQuery.data?.items.map((catalog) => (
              <article key={catalog.id} className="rounded-xl border border-border/70 bg-surface-subtle p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-primary/10 bg-card text-primary"><Boxes className="size-4" /></span>
                  <MetaStatusBadge status={catalog.syncStatus ?? "idle"} label={catalog.syncStatus === "ready" ? "Senkron" : catalog.syncStatus === "syncing" ? "İşleniyor" : catalog.syncStatus === "failed" ? "Hatalı" : "Bekliyor"} />
                </div>
                <h3 className="mt-4 truncate font-display text-lg font-semibold">{catalog.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{catalog.vertical ?? "COMMERCE"}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/70 pt-3 text-xs">
                  <div><p className="text-muted-foreground">Ürün</p><p className="mt-0.5 font-data font-semibold">{formatMetaNumber(catalog.productCount)}</p></div>
                  <div><p className="text-muted-foreground">Son senkron</p><p className="mt-0.5 truncate font-data text-[10px] font-semibold">{formatMetaDate(catalog.lastSyncAt)}</p></div>
                </div>
                {catalog.lastError && <p className="mt-3 truncate text-xs text-destructive">{catalog.lastError}</p>}
                <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-1">
                  <Button type="button" variant="outline" size="sm" disabled={!canManage} onClick={() => { setProductAction({ catalog, mode: "upsert" }); setProductIds(""); }}><PackagePlus className="size-3.5" /> Ürün ekle</Button>
                  <Button type="button" variant="outline" size="icon" disabled={!canManage} onClick={() => { setProductAction({ catalog, mode: "sync" }); setProductIds(""); }} aria-label={`${catalog.name} ürünlerini tam senkronla`}><RefreshCw className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" disabled={!canManage} onClick={() => setDeleteCatalog(catalog)} aria-label={`${catalog.name} kataloğunu sil`}><Trash2 className="size-3.5 text-destructive" /></Button>
                </div>
                <Button type="button" variant="ghost" size="sm" className="mt-1 w-full text-destructive hover:text-destructive" disabled={!canManage} onClick={() => { setProductAction({ catalog, mode: "remove" }); setProductIds(""); }}>Seçili ürünleri çıkar</Button>
              </article>
            ))}
          </div>
        )}
        {catalogsQuery.data && <MetaPagination {...catalogsQuery.data} onPageChange={setPage} />}
      </MetaSurface>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Meta kataloğu oluştur</DialogTitle><DialogDescription>Katalog bağlı işletme hesabında oluşturulur. Ürün aktarımı sonraki adımda yapılır.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><label htmlFor="meta-catalog-connection" className="text-sm font-medium">İşletme bağlantısı</label><Select value={draft.connectionId} onValueChange={(value) => setDraft((current) => ({ ...current, connectionId: value }))}><SelectTrigger id="meta-catalog-connection"><SelectValue placeholder="Bağlantı seçin" /></SelectTrigger><SelectContent>{(connectionsQuery.data ?? []).filter((item) => item.status === "active").map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><label htmlFor="meta-catalog-name" className="text-sm font-medium">Katalog adı</label><Input id="meta-catalog-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={100} /></div>
            <div className="space-y-2"><label htmlFor="meta-catalog-vertical" className="text-sm font-medium">Dikey</label><Select value={draft.vertical} onValueChange={(value) => setDraft((current) => ({ ...current, vertical: value as "commerce" | "vehicles" }))}><SelectTrigger id="meta-catalog-vertical"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="commerce">Ticaret</SelectItem><SelectItem value="vehicles">Araç</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Vazgeç</Button><Button type="button" disabled={createMutation.isPending} onClick={create}>Kataloğu oluştur</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(productAction)} onOpenChange={(open) => !open && setProductAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{productAction?.mode === "remove" ? "Ürünleri katalogdan çıkar" : productAction?.mode === "sync" ? "Kataloğu tam senkronla" : "Ürünleri ekle veya güncelle"}</DialogTitle>
            <DialogDescription>CRM ürün kimliklerini virgül, boşluk veya yeni satırla ayırın. Sunucu ürün verilerini yeniden doğrular.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2"><label htmlFor="meta-catalog-product-ids" className="text-sm font-medium">CRM ürün kimlikleri</label><Textarea id="meta-catalog-product-ids" value={productIds} onChange={(event) => setProductIds(event.target.value)} placeholder="ürün-kimliği-1&#10;ürün-kimliği-2" className="min-h-36 font-data text-xs" /><p className="text-xs text-muted-foreground">{parseIds(productIds).length} benzersiz ürün</p></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setProductAction(null)}>Vazgeç</Button><Button type="button" variant={productAction?.mode === "remove" ? "destructive" : "default"} disabled={productsMutation.isPending} onClick={runProductAction}>{productAction?.mode === "remove" ? "Ürünleri çıkar" : productAction?.mode === "sync" ? "Tam senkronu başlat" : "Ürünleri aktar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteCatalog)} onOpenChange={(open) => !open && setDeleteCatalog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Meta kataloğunu sil</AlertDialogTitle><AlertDialogDescription>{deleteCatalog?.name} ve CRM bağlantısı Meta hesabından kaldırılacak. Bu işlem geri alınamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!deleteCatalog || deleteMutation.isPending} onClick={() => deleteCatalog && deleteMutation.mutate(deleteCatalog)}>Kalıcı olarak sil</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
