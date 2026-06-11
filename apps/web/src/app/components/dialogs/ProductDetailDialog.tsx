import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Badge } from "../ui/badge";
import {
  ImageIcon, ListChecks, CheckCircle2, Sparkles, Tag, Cpu, Package, Wrench, Settings2, FileText,
} from "lucide-react";
import { Product } from "../../lib/mock";
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

  const cur = product.currency;
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
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Liste Fiyatı</div>
                <div className="text-lg tabular-nums inline-flex items-center gap-1.5"><Tag className="size-4 text-muted-foreground" />{fmtMoney(product.listPrice, cur)}</div>
              </div>
              {product.cashPrice ? (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Peşin</div>
                  <div className="text-lg tabular-nums text-emerald-600">{fmtMoney(product.cashPrice, cur)}</div>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Meta label="Marka" value={product.brand} />
              <Meta label="Model" value={product.modelName || product.model} />
              <Meta label="Stok Kodu" value={product.stockCode || product.model} />
              <Meta label="KDV" value={product.vatRate ? `%${product.vatRate}` : undefined} />
              <Meta label="Menşei" value={product.originCountry} />
              <Meta label="GTIP" value={product.hsCode} />
            </div>
            {product.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">{product.description}</p>
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
          <SectionTitle icon={<ListChecks className="size-3.5" />} text="Teknik Özellikler" />
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
            <div className="flex flex-wrap gap-1.5">
              {standardTitles.map((e, i) => (
                <span key={`${e}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px]">
                  <CheckCircle2 className="size-3" /> {e}
                </span>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
