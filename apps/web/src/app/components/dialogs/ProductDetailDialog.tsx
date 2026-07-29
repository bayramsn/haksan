import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import {
  ImageIcon, ListChecks, CheckCircle2, Sparkles, Tag, Cpu, Package, Wrench, Settings2, FileText,
  Pencil, Save, X, FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { Product } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { productService } from "../../../lib/services";
import { resolveMediaUrl } from "../../../lib/apiClient";
import { ProductSpecsTable } from "../shared/ProductSpecsTable";
import { EntityVisual } from "../shared/PremiumPrimitives";
import { printAssetBase, productTechnicalDoc } from "../../lib/print";
import { printOrWarn } from "../../lib/pageHelpers";

type MediaItem = { fileId: string; mediaType: "image" | "document"; title: string | null; mimeType: string; url: string };

const CURRENCY_LABEL: Record<string, string> = { USD: "USD", EUR: "EUR", TRY: "TL" };
const fmtMoney = (n?: number | null, cur = "USD") =>
  n === undefined || n === null || Number.isNaN(n) ? "—" : `${n.toLocaleString("tr-TR")} ${CURRENCY_LABEL[cur] ?? cur}`;
const PRODUCT_VAT_RATES = ["10", "20"] as const;
const DEFAULT_PRODUCT_VAT_RATE = 20;
const OPTIONAL_EQUIPMENT_CATEGORY_CODE = "OPSIYONEL_DONANIM";
const MACHINE_CATEGORY_CODE = "TEZGAH";
const normalizeProductVatRate = (value: unknown) => {
  const rate = Number(value ?? DEFAULT_PRODUCT_VAT_RATE);
  return PRODUCT_VAT_RATES.includes(String(rate) as typeof PRODUCT_VAT_RATES[number]) ? rate : DEFAULT_PRODUCT_VAT_RATE;
};
const isOptionalEquipmentProduct = (product: Product) =>
  product.categoryCode === OPTIONAL_EQUIPMENT_CATEGORY_CODE ||
  product.category?.toLocaleLowerCase("tr-TR") === "opsiyonel donanım";
const productDisplayName = (product: Product) =>
  [product.brand, product.model].filter(Boolean).join(" ") || product.shortDescription || product.stockCode || "Ürün";
const toMuadilProduct = (product: Product): NonNullable<Product["muadilProducts"]>[number] => ({
  id: product.id,
  brand: product.brand,
  model: product.model,
  shortDescription: product.shortDescription,
  category: product.category,
  categoryCode: product.categoryCode,
  type: product.type,
  listPrice: product.listPrice,
  currency: product.currency,
});

type EquipmentRow = {
  item: { id: string; title: string; description?: string | null; unitPrice?: string | null };
  type?: { code?: string | null } | null;
  currency?: { code?: string | null } | null;
};

type CompatibleOptionalRow = {
  product?: {
    id?: string;
    fullName?: string | null;
    modelCode?: string | null;
    listPrice?: string | number | null;
  } | null;
  brand?: { name?: string | null } | null;
  currency?: { code?: string | null } | null;
  category?: { name?: string | null } | null;
  productType?: { name?: string | null } | null;
};

/**
 * Read-only product detail popup: image + technical specs + equipment.
 * When `highlightOptional` is set (sales price list), the compatible optional
 * equipment is shown as a priced table rather than plain chips.
 */
export function ProductDetailDialog({
  product,
  onClose,
  onEdit,
  highlightOptional = false,
  hideOptionalEquipment = false,
  readOnly = false,
}: {
  product: Product | null;
  onClose: () => void;
  /** Verilirse Düzenle, yeni ürün ekleme pop-up'ının aynısını (ProductDialog) açar. */
  onEdit?: (product: Product) => void;
  highlightOptional?: boolean;
  hideOptionalEquipment?: boolean;
  /** Fiyat listesi gibi salt-okunur bağlamlarda ürün düzenleme eylemlerini gizler. */
  readOnly?: boolean;
}) {
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [compatibleOptionalEquipment, setCompatibleOptionalEquipment] = useState<CompatibleOptionalRow[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  const [documents, setDocuments] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOptionalIds, setSelectedOptionalIds] = useState<string[] | null>(null);

  const { patchProduct, products } = useStore();
  const { hasRole, hasPermission } = useAuth();
  const canEdit = !readOnly && (hasRole("super_admin") || hasPermission("products.update"));
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
    setSelectedOptionalIds(null);
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    let alive = true;
    setLoading(true);
    const shouldLoadCompatibleOptionalEquipment = product.categoryCode === MACHINE_CATEGORY_CODE;

    Promise.all([
      productService.equipment(product.id).catch(() => [] as EquipmentRow[]),
      shouldLoadCompatibleOptionalEquipment
        ? productService.compatibleOptionalEquipment(product.id).catch(() => [] as CompatibleOptionalRow[])
        : Promise.resolve([] as CompatibleOptionalRow[]),
      productService.options(product.id).catch(() => []),
      productService.media(product.id).catch(() => [] as MediaItem[]),
    ])
      .then(([eqRows, compatibleRows, optRows, mediaRows]) => {
        if (alive) {
          setEquipment(eqRows as EquipmentRow[]);
          setCompatibleOptionalEquipment(compatibleRows as CompatibleOptionalRow[]);
          setOptions(optRows);
          setDocuments((mediaRows as MediaItem[]).filter((m) => m.mediaType === "document"));
        }
      })
      .catch(() => {
        if (alive) {
          setEquipment([]);
          setCompatibleOptionalEquipment([]);
          setOptions([]);
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
  const muadilOptions = products.filter((item) => item.id !== product.id && !isOptionalEquipmentProduct(item));
  const validMuadilIds = new Set(muadilOptions.map((item) => item.id));
  const currentMuadilIds = (view.muadilProductIds?.length ? view.muadilProductIds : (view.muadilProductId ? [view.muadilProductId] : []))
    .filter((id) => validMuadilIds.has(id));
  const selectedMuadilIds = (draft.muadilProductIds ?? currentMuadilIds).filter((id) => validMuadilIds.has(id));
  const selectedMuadilProducts = muadilOptions.filter((item) => selectedMuadilIds.includes(item.id));
  const groupMuadilOptions = (items: Product[]) =>
    items.reduce<Record<string, Product[]>>((acc, item) => {
      const key = item.category || "Kategorisiz";
      acc[key] = [...(acc[key] ?? []), item];
      return acc;
    }, {});
  const muadilOptionGroups = groupMuadilOptions(muadilOptions);
  const toggleDraftMuadil = (id: string) => {
    setDraft((current) => {
      const currentIds = (current.muadilProductIds ?? currentMuadilIds).filter((item) => validMuadilIds.has(item));
      return {
        ...current,
        muadilProductIds: currentIds.includes(id) ? currentIds.filter((item) => item !== id) : [...currentIds, id],
      };
    });
  };

  const startEdit = () => {
    setDraft({
      listPrice: view.listPrice,
      cashPrice: view.cashPrice,
      currency: view.currency,
      vatRate: normalizeProductVatRate(view.vatRate),
      stockCode: view.stockCode,
      originCountry: view.originCountry,
      hsCode: view.hsCode,
      modelName: view.modelName,
      series: view.series,
      description: view.description,
      muadilProductIds: currentMuadilIds,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const nextDraft = draft.vatRate !== undefined ? { ...draft, vatRate: normalizeProductVatRate(draft.vatRate) } : draft;
      const cleanMuadilIds = (nextDraft.muadilProductIds ?? []).filter((id) => validMuadilIds.has(id));
      const patch = {
        ...nextDraft,
        muadilProductId: cleanMuadilIds[0] ?? null,
        muadilProductIds: cleanMuadilIds,
        muadilProducts: muadilOptions.filter((item) => cleanMuadilIds.includes(item.id)).map(toMuadilProduct),
      };
      await patchProduct(product.id, patch);
      setOverrides((prev) => ({ ...prev, ...patch }));
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

  const directOptional = equipment.filter((e) => e.type?.code === "opsiyonel");
  const optionalMuadilProducts = (view.muadilProducts ?? []).filter((item) => item.categoryCode === OPTIONAL_EQUIPMENT_CATEGORY_CODE);
  const optionalMuadilRows: EquipmentRow[] = optionalMuadilProducts.map((item) => ({
    item: {
      id: item.id,
      title: [item.brand, item.model].filter(Boolean).join(" ") || item.shortDescription || "Opsiyonel donanım",
      description: item.type || item.category || null,
      unitPrice: item.listPrice != null ? String(item.listPrice) : null,
    },
    type: { code: "opsiyonel" },
    currency: { code: item.currency ?? cur },
  }));
  const compatibleOptional: EquipmentRow[] = compatibleOptionalEquipment
    .filter((row) => row.product?.id)
    .map((row) => ({
      item: {
        id: row.product!.id!,
        title: [row.brand?.name, row.product?.fullName || row.product?.modelCode].filter(Boolean).join(" ") || "Opsiyonel donanım",
        description: [row.category?.name, row.productType?.name].filter(Boolean).join(" · ") || null,
        unitPrice: row.product?.listPrice != null ? String(row.product.listPrice) : null,
      },
      type: { code: "opsiyonel" },
      currency: { code: row.currency?.code ?? cur },
    }));
  const canShowCompatibleOptionalEquipment = view.categoryCode === MACHINE_CATEGORY_CODE;
  const optionalSource = canShowCompatibleOptionalEquipment
    ? [...directOptional, ...compatibleOptional, ...optionalMuadilRows]
    : directOptional;
  const optional = optionalSource.filter((item, index, all) =>
    all.findIndex((candidate) => candidate.item.id === item.item.id) === index
  );
  const effectiveSelectedOptionalIds = selectedOptionalIds ?? optional.map((item) => item.item.id);
  const selectedOptionalRows = optional.filter((item) => effectiveSelectedOptionalIds.includes(item.item.id));
  const optionPrice = (item: EquipmentRow) => {
    const value = item.item.unitPrice ? Number(item.item.unitPrice) : 0;
    return Number.isFinite(value) ? value : 0;
  };
  const selectedOptionalTotal = selectedOptionalRows
    .filter((item) => (item.currency?.code ?? cur) === cur)
    .reduce((sum, item) => sum + optionPrice(item), 0);
  const selectedOtherCurrencyTotals = selectedOptionalRows.reduce<Record<string, number>>((acc, item) => {
    const currency = item.currency?.code ?? cur;
    if (currency === cur) return acc;
    acc[currency] = (acc[currency] ?? 0) + optionPrice(item);
    return acc;
  }, {});
  const selectedGrandTotal = (view.listPrice ?? 0) + selectedOptionalTotal;
  const showOptionalEquipment = !hideOptionalEquipment && (highlightOptional || optional.length > 0);
  const toggleOptional = (id: string) => {
    setSelectedOptionalIds((current) => {
      const activeIds = current ?? optional.map((item) => item.item.id);
      return activeIds.includes(id) ? activeIds.filter((item) => item !== id) : [...activeIds, id];
    });
  };
  const standard = equipment.filter((e) => e.type?.code !== "opsiyonel").map((e) => e.item.title);
  // Fall back to the store's flat lists if the equipment endpoint returned nothing.
  const standardTitles = standard.length ? standard : (product.standardEquipment || []);
  const muadilGroups = (view.muadilProducts ?? [])
    .filter((item) => item.categoryCode !== OPTIONAL_EQUIPMENT_CATEGORY_CODE)
    .reduce<Record<string, NonNullable<Product["muadilProducts"]>>>((acc, item) => {
    const key = item.category || "Kategorisiz";
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});
  const muadilCount = Object.values(muadilGroups).reduce((sum, items) => sum + items.length, 0);
  const createTechnicalPdf = () => {
    printOrWarn(productTechnicalDoc({
      product: view,
      standardEquipment: standardTitles,
      optionalEquipment: optional.map((item) => ({
        title: item.item.title,
        description: item.item.description,
      })),
      documents: documents.map((document) => ({ title: document.title })),
    }, printAssetBase()));
  };

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
            <div className="shrink-0 flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={createTechnicalPdf}
              >
                <FileDown className="size-3.5" /> PDF Oluştur
              </Button>
              {canEdit && (
                <>
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => (onEdit ? onEdit(product) : startEdit())}
                  >
                    <Pencil className="size-3.5" /> Düzenle
                  </Button>
                )}
                </>
              )}
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
                    <Select
                      value={String(normalizeProductVatRate(draft.vatRate))}
                      onValueChange={(v) => setDraft((d) => ({ ...d, vatRate: Number(v) }))}
                    >
                      <SelectTrigger className="h-8 bg-white"><SelectValue placeholder="KDV seçin" /></SelectTrigger>
                      <SelectContent>
                        {PRODUCT_VAT_RATES.map((rate) => (
                          <SelectItem key={rate} value={rate}>%{rate}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <EditField label="Ürün Serisi">
                    <Input
                      className="h-8 bg-white"
                      defaultValue={draft.series ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, series: e.target.value }))}
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
                <EditField label="Muadil Ürünler">
                  {Object.entries(muadilOptionGroups).length === 0 ? (
                    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      Muadil olarak seçilebilecek ürün yok.
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto rounded-md border border-border/60 bg-white">
                      {Object.entries(muadilOptionGroups).map(([category, items]) => (
                        <div key={category} className="border-b border-border/60 last:border-b-0">
                          <div className="bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{category}</div>
                          <div className="divide-y divide-border/60">
                            {items.map((item) => {
                              const active = selectedMuadilIds.includes(item.id);
                              return (
                                <div
                                  key={item.id}
                                  role="button"
                                  tabIndex={0}
                                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-muted/30"
                                  onClick={() => toggleDraftMuadil(item.id)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      toggleDraftMuadil(item.id);
                                    }
                                  }}
                                >
                                  <Checkbox
                                    checked={active}
                                    onCheckedChange={() => toggleDraftMuadil(item.id)}
                                    onClick={(event) => event.stopPropagation()}
                                    aria-label={`${productDisplayName(item)} muadil seçimi`}
                                  />
                                  <Package className="size-3.5 shrink-0 text-muted-foreground" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate">{productDisplayName(item)}</span>
                                    <span className="block truncate text-[11px] text-muted-foreground">{item.type || item.stockCode || "—"}</span>
                                  </span>
                                  {item.listPrice ? (
                                    <span className="shrink-0 tabular-nums text-brand-blue">
                                      {fmtMoney(item.listPrice, item.currency)}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedMuadilProducts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedMuadilProducts.map((item) => (
                        <Badge key={item.id} variant="secondary" className="max-w-full text-[10px]">
                          <span className="truncate">{productDisplayName(item)}</span>
                        </Badge>
                      ))}
                    </div>
                  )}
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
              <Meta label="Seri" value={view.series} />
              <Meta label="Model" value={view.modelName || view.model} />
              <Meta label="Stok Kodu" value={view.stockCode || view.model} />
              <Meta label="KDV" value={`%${normalizeProductVatRate(view.vatRate)}`} />
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
          <ProductSpecsTable specs={product.specs ?? []} productTypeCode={product.productTypeCode} />
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

        {muadilCount > 0 && (
          <div className="px-6 pb-4">
            <SectionTitle icon={<Package className="size-3.5" />} text="Muadil Ürünler" count={muadilCount} />
            <div className="rounded-lg border border-border/60 overflow-hidden">
              {Object.entries(muadilGroups).map(([category, items], groupIndex) => (
                <div key={category} className={groupIndex > 0 ? "border-t border-border/60" : ""}>
                  <div className="bg-muted/30 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
                    {category}
                  </div>
                  <div className="divide-y divide-border/60">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="truncate">{item.brand} {item.model}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{item.type || item.shortDescription || "—"}</div>
                        </div>
                        <div className="shrink-0 tabular-nums text-brand-blue">
                          {fmtMoney(item.listPrice, item.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* optional equipment with prices */}
        {showOptionalEquipment && (
          <div className="px-6 pb-4">
            <SectionTitle icon={<Sparkles className="size-3.5" />} text="Uyumlu Opsiyonel Donanım" count={optional.length} />
            {loading ? (
              <div className="text-xs text-muted-foreground">Yükleniyor…</div>
            ) : optional.length === 0 ? (
              <div className="text-xs text-muted-foreground">Bu ürün için tanımlı opsiyonel donanım yok.</div>
            ) : (
              <div className="space-y-2">
                {highlightOptional && (
                  <div className="grid gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm sm:grid-cols-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Makine Liste</div>
                      <div className="tabular-nums font-medium">{fmtMoney(view.listPrice, cur)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Seçili Opsiyon</div>
                      <div className="tabular-nums font-medium">{fmtMoney(selectedOptionalTotal, cur)}</div>
                      {Object.entries(selectedOtherCurrencyTotals).map(([currency, total]) => (
                        <div key={currency} className="text-[11px] text-muted-foreground tabular-nums">+ {fmtMoney(total, currency)}</div>
                      ))}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam Liste</div>
                      <div className="tabular-nums font-semibold text-brand-blue">{fmtMoney(selectedGrandTotal, cur)}</div>
                    </div>
                  </div>
                )}
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  {optional.map((e, i) => {
                    const checked = effectiveSelectedOptionalIds.includes(e.item.id);
                    return (
                    <div
                      key={e.item.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${i > 0 ? "border-t border-border/60" : ""}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {highlightOptional ? (
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleOptional(e.item.id)}
                            aria-label={`${e.item.title} opsiyon seçimi`}
                          />
                        ) : (
                          <Sparkles className="size-3.5 text-brand-blue shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate">{e.item.title}</div>
                          {e.item.description && <div className="text-[11px] text-muted-foreground truncate">{e.item.description}</div>}
                        </div>
                      </div>
                      <div className="tabular-nums text-brand-blue shrink-0">
                        {fmtMoney(e.item.unitPrice ? Number(e.item.unitPrice) : null, e.currency?.code ?? cur)}
                      </div>
                    </div>
                    );
                  })}
                </div>
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
export function ProductThumb({ product, fallback, size = "sm" }: { product: Pick<Product, "imageUrl" | "model">; fallback?: React.ReactNode; size?: "sm" | "md" | "lg" }) {
  return (
    <EntityVisual
      imageUrl={product.imageUrl}
      title={product.model}
      icon={fallback ?? <Cpu className="size-4" />}
      size={size}
    />
  );
}

export { Package as SparePartIcon, Wrench as LaborIcon };
