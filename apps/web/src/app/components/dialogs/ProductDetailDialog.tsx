import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  ImageIcon, ListChecks, CheckCircle2, Sparkles, Tag, Cpu, Package, Wrench, Settings2, FileText,
  Pencil, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import { Product } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { productService } from "../../../lib/services";
import { resolveMediaUrl } from "../../../lib/apiClient";

type MediaItem = { fileId: string; mediaType: "image" | "document"; title: string | null; mimeType: string; url: string };

const CURRENCY_LABEL: Record<string, string> = { USD: "USD", EUR: "EUR", TRY: "TL" };
const fmtMoney = (n?: number | null, cur = "USD") =>
  n === undefined || n === null || Number.isNaN(n) ? "—" : `${n.toLocaleString("tr-TR")} ${CURRENCY_LABEL[cur] ?? cur}`;

type EquipmentRow = {
  item: { id: string; title: string; description?: string | null; unitPrice?: string | null };
  type?: { code?: string | null } | null;
  currency?: { code?: string | null } | null;
};

/**
 * Read-only product detail popup: image + technical specs + equipment.
 * When `highlightOptional` is set (sales price list), the compatible optional
 * equipment is shown as a priced table rather than plain chips.
 */
export function ProductDetailDialog({
  product,
  onClose,
  highlightOptional = false,
}: {
  product: Product | null;
  onClose: () => void;
  highlightOptional?: boolean;
}) {
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  const [documents, setDocuments] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const { patchProduct } = useStore();
  const { hasRole } = useAuth();
  const canEdit = hasRole("super_admin");
  // Yalnızca düzenlenen alanların yereldeki gösterimini tutar (kayıttan sonra
  // dialog'un anlık güncel kalması için). Tablo zaten store'dan tazelenir.
  const [overrides, setOverrides] = useState<Partial<Product>>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Product>>({});
  const [saving, setSaving] = useState(false);

  // Ürün değişince düzenleme/override durumunu sıfırla.
  useEffect(() => {
    setEditing(false);
    setOverrides({});
    setDraft({});
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    let alive = true;
    setLoading(true);

    Promise.all([
      productService.equipment(product.id),
      productService.options(product.id).catch(() => []),
      productService.media(product.id).catch(() => [] as MediaItem[]),
    ])
      .then(([eqRows, optRows, mediaRows]) => {
        if (alive) {
          setEquipment(eqRows as EquipmentRow[]);
          setOptions(optRows);
          setDocuments((mediaRows as MediaItem[]).filter((m) => m.mediaType === "document"));
        }
      })
      .catch(() => {
        if (alive) {
          setEquipment([]);
          setDocuments([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [product]);

  if (!product) return null;

  // Gösterimde, kaydedilmiş yerel override'ları ürünün üzerine bindir.
  const view = { ...product, ...overrides } as Product;
  const cur = view.currency;

  const startEdit = () => {
    setDraft({
      listPrice: view.listPrice,
      cashPrice: view.cashPrice,
      currency: view.currency,
      vatRate: view.vatRate,
      stockCode: view.stockCode,
      originCountry: view.originCountry,
      hsCode: view.hsCode,
      modelName: view.modelName,
      description: view.description,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await patchProduct(product.id, draft);
      setOverrides((prev) => ({ ...prev, ...draft }));
      setEditing(false);
      toast.success("Ürün güncellendi");
    } catch {
      toast.error("Güncelleme başarısız oldu");
    } finally {
      setSaving(false);
    }
  };

  const num = (v: string): number | undefined => {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return v.trim() === "" || Number.isNaN(n) ? undefined : n;
  };

  const optional = equipment.filter((e) => e.type?.code === "opsiyonel");
  const standard = equipment.filter((e) => e.type?.code !== "opsiyonel").map((e) => e.item.title);
  // Fall back to the store's flat lists if the equipment endpoint returned nothing.
  const standardTitles = standard.length ? standard : product.standardEquipment;

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-start gap-2">
            <div className="size-9 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
              <Cpu className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg truncate">{product.brand} {product.model}</DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px] h-5">{product.category || product.productGroup || "Genel"}</Badge>
                {product.type && <span className="text-muted-foreground">{product.type}</span>}
              </DialogDescription>
            </div>
            {canEdit && (
              <div className="shrink-0 flex items-center gap-1.5">
                {editing ? (
                  <>
                    <Button size="sm" className="h-8 gap-1.5" onClick={saveEdit} disabled={saving}>
                      <Save className="size-3.5" /> {saving ? "Kaydediliyor…" : "Kaydet"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => setEditing(false)} disabled={saving}>
                      <X className="size-3.5" /> İptal
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={startEdit}>
                    <Pencil className="size-3.5" /> Düzenle
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* image */}
          <div className="aspect-video rounded-lg overflow-hidden bg-muted/40 border border-border/60">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.model} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-muted-foreground">
                <ImageIcon className="size-10 opacity-40" />
              </div>
            )}
          </div>

          {/* price + meta */}
          <div className="space-y-2.5">
            {editing ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <EditField label="Liste Fiyatı">
                    <Input
                      inputMode="decimal"
                      className="h-8 bg-white"
                      defaultValue={draft.listPrice ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, listPrice: num(e.target.value) ?? 0 }))}
                    />
                  </EditField>
                  <EditField label="Peşin Fiyat">
                    <Input
                      inputMode="decimal"
                      className="h-8 bg-white"
                      defaultValue={draft.cashPrice ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, cashPrice: num(e.target.value) }))}
                    />
                  </EditField>
                  <EditField label="Para Birimi">
                    <Select value={draft.currency} onValueChange={(v) => setDraft((d) => ({ ...d, currency: v as Product["currency"] }))}>
                      <SelectTrigger className="h-8 bg-white"><SelectValue placeholder="Seçin" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="TRY">TL</SelectItem>
                      </SelectContent>
                    </Select>
                  </EditField>
                  <EditField label="KDV (%)">
                    <Input
                      inputMode="numeric"
                      className="h-8 bg-white"
                      defaultValue={draft.vatRate ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, vatRate: num(e.target.value) }))}
                    />
                  </EditField>
                  <EditField label="Stok Kodu">
                    <Input
                      className="h-8 bg-white"
                      defaultValue={draft.stockCode ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, stockCode: e.target.value }))}
                    />
                  </EditField>
                  <EditField label="Model Adı">
                    <Input
                      className="h-8 bg-white"
                      defaultValue={draft.modelName ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, modelName: e.target.value }))}
                    />
                  </EditField>
                  <EditField label="Menşei">
                    <Input
                      className="h-8 bg-white"
                      defaultValue={draft.originCountry ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, originCountry: e.target.value }))}
                    />
                  </EditField>
                  <EditField label="GTIP">
                    <Input
                      className="h-8 bg-white"
                      defaultValue={draft.hsCode ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, hsCode: e.target.value }))}
                    />
                  </EditField>
                </div>
                <EditField label="Açıklama">
                  <Textarea
                    className="bg-white min-h-16 text-xs"
                    defaultValue={draft.description ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  />
                </EditField>
              </>
            ) : (
              <>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Liste Fiyatı</div>
                <div className="text-lg tabular-nums inline-flex items-center gap-1.5"><Tag className="size-4 text-muted-foreground" />{fmtMoney(view.listPrice, cur)}</div>
              </div>
              {view.cashPrice ? (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Peşin</div>
                  <div className="text-lg tabular-nums text-emerald-600">{fmtMoney(view.cashPrice, cur)}</div>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Meta label="Marka" value={view.brand} />
              <Meta label="Model" value={view.modelName || view.model} />
              <Meta label="Stok Kodu" value={view.stockCode || view.model} />
              <Meta label="KDV" value={view.vatRate ? `%${view.vatRate}` : undefined} />
              <Meta label="Menşei" value={view.originCountry} />
              <Meta label="GTIP" value={view.hsCode} />
            </div>
            {view.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">{view.description}</p>
            )}
              </>
            )}
            {documents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {documents.map((doc) => (
                  <a
                    key={doc.fileId}
                    href={resolveMediaUrl(doc.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-[11px] text-foreground/80 hover:bg-muted/40 transition-colors"
                  >
                    <FileText className="size-3.5 text-rose-500" />
                    {doc.title || "Ürün Broşürü (PDF)"}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* specs */}
        <div className="px-6 pb-4">
          <SectionTitle icon={<ListChecks className="size-3.5" />} text="Teknik Bilgiler" />
          {product.specs.length === 0 ? (
            <div className="text-xs text-muted-foreground">Teknik özellik girilmemiş.</div>
          ) : (
            <div className="rounded-lg border border-border/60 divide-y divide-border/60 sm:columns-2 sm:gap-0">
              {product.specs.map((s, i) => (
                <div key={`${s.key}-${i}`} className="flex items-start justify-between gap-3 px-3 py-1.5 text-xs break-inside-avoid">
                  <span className="text-muted-foreground">{s.key}</span>
                  <span className="tracking-tight text-right">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* option sets */}
        {options.length > 0 && (
          <div className="px-6 pb-4">
            <SectionTitle icon={<Settings2 className="size-3.5" />} text="Opsiyon Setleri" count={options.length} />
            <div className="space-y-3">
              {options.map((optSet: any, i: number) => (
                <div key={optSet.id || i} className="rounded-lg border border-border/60 overflow-hidden">
                  <div className="bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground border-b border-border/60">
                    {optSet.name}
                  </div>
                  <div className="divide-y divide-border/60">
                    {optSet.values?.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Değer bulunamadı.</div>
                    ) : (
                      optSet.values?.map((val: any) => (
                        <div key={val.id} className="flex justify-between items-center px-3 py-1.5 text-xs">
                          <span>{val.value}</span>
                          {val.priceDelta && (
                            <span className="text-brand-blue tabular-nums">
                              +{fmtMoney(Number(val.priceDelta), val.currency?.code ?? cur)}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* optional equipment with prices */}
        {(highlightOptional || optional.length > 0) && (
          <div className="px-6 pb-4">
            <SectionTitle icon={<Sparkles className="size-3.5" />} text="Uyumlu Opsiyonel Donanım" count={optional.length} />
            {loading ? (
              <div className="text-xs text-muted-foreground">Yükleniyor…</div>
            ) : optional.length === 0 ? (
              <div className="text-xs text-muted-foreground">Bu ürün için tanımlı opsiyonel donanım yok.</div>
            ) : (
              <div className="rounded-lg border border-border/60 overflow-hidden">
                {optional.map((e, i) => (
                  <div
                    key={e.item.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${i > 0 ? "border-t border-border/60" : ""}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles className="size-3.5 text-brand-blue shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate">{e.item.title}</div>
                        {e.item.description && <div className="text-[11px] text-muted-foreground truncate">{e.item.description}</div>}
                      </div>
                    </div>
                    <div className="tabular-nums text-brand-blue shrink-0">
                      {fmtMoney(e.item.unitPrice ? Number(e.item.unitPrice) : null, e.currency?.code ?? cur)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* standard equipment */}
        <div className="px-6 pb-6">
          <SectionTitle icon={<CheckCircle2 className="size-3.5" />} text="Standart Donanım" count={standardTitles.length} />
          {standardTitles.length === 0 ? (
            <div className="text-xs text-muted-foreground">Standart donanım girilmemiş.</div>
          ) : (
            <div className="rounded-lg border border-border/60 divide-y divide-border/60">
              {standardTitles.map((e, i) => (
                <div key={`${e}-${i}`} className="flex items-start gap-2 px-3 py-1.5 text-xs">
                  <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{e}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 min-h-4 truncate text-[12px]">{value || "—"}</div>
    </div>
  );
}

function SectionTitle({ icon, text, count }: { icon: React.ReactNode; text: string; count?: number }) {
  return (
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
      {icon} {text}{count !== undefined && <span className="text-foreground/60">({count})</span>}
    </div>
  );
}

/** Small left icon-photo used in product list rows (firma listesi gibi). */
export function ProductThumb({ product, fallback }: { product: Pick<Product, "imageUrl" | "model">; fallback?: React.ReactNode }) {
  if (product.imageUrl) {
    return (
      <div className="size-9 rounded-lg overflow-hidden bg-muted/40 shrink-0">
        <img src={product.imageUrl} alt={product.model} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="size-9 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
      {fallback ?? <Cpu className="size-4" />}
    </div>
  );
}

export { Package as SparePartIcon, Wrench as LaborIcon };
