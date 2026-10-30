import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FolderTree, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { lookupService } from "../../../lib/services";
import { useStore } from "../../lib/store";
import { buildProductTaxonomyTree, type TaxonomyNode, type TaxonomyRow } from "../../lib/productTaxonomyTree";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

const LEVELS = ["product-groups", "product-categories", "product-subcategories", "product-types"] as const;

function TreeNode({ node, depth }: { node: TaxonomyNode; depth: number }) {
  const label = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className={`truncate ${node.inactive ? "text-muted-foreground line-through" : ""}`}>{node.name}</span>
      {node.inactive && <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">pasif</span>}
      {node.shared && <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] text-muted-foreground" title="Üst bağı boş; tüm üstlerde geçerli">ortak</span>}
      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{node.count}</span>
    </span>
  );
  if (!node.children.length) return <div className="flex items-center gap-2 rounded-md py-1.5 pl-6 pr-2 text-sm hover:bg-muted/40">{label}</div>;
  return (
    <details open={depth === 0}>
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md py-1.5 pr-2 text-sm font-medium hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform [details[open]>summary>&]:rotate-90" />
        {label}
      </summary>
      <div className="ml-3 border-l border-border/60 pl-2">
        {node.children.map((child) => <TreeNode key={child.key} node={child} depth={depth + 1} />)}
      </div>
    </details>
  );
}

/** Ürün taksonomisinin ağaç görünümü; düzenleme Ayarlar > Ürün listelerinde kalır. */
export function ProductTreeButton() {
  const { products } = useStore();
  const [open, setOpen] = useState(false);
  const [levels, setLevels] = useState<TaxonomyRow[][] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all(LEVELS.map((name) => lookupService.byName(name) as Promise<TaxonomyRow[]>))
      .then(setLevels)
      .catch((error: any) => { setLevels(null); toast.error("Ürün ağacı yüklenemedi", { description: error?.message }); })
      .finally(() => setLoading(false));
  }, [open]);

  const tree = useMemo(() => levels
    ? buildProductTaxonomyTree({ groups: levels[0], categories: levels[1], subcategories: levels[2], types: levels[3] }, products)
    : [], [levels, products]);

  return <>
    <Button size="sm" variant="outline" className="h-9 gap-1 whitespace-nowrap" onClick={() => setOpen(true)}><FolderTree className="size-4" />Ürün Ağacı</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderTree className="size-4" />Ürün Ağacı</DialogTitle>
          <DialogDescription>Grup → Kategori → Alt kategori → Ürün tipi. Sağdaki sayı o daldaki ürün adedidir. Düzenleme: Ayarlar &gt; Ürün.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Yükleniyor…</p>
        ) : tree.length ? (
          <div className="space-y-0.5">{tree.map((node) => <TreeNode key={node.key} node={node} depth={0} />)}</div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Tanımlı ürün grubu yok.</p>
        )}
      </DialogContent>
    </Dialog>
  </>;
}
