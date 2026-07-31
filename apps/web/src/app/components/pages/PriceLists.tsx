import { useState, useMemo, useEffect } from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Search, ChevronRight, Lock, Wrench, Package, Pencil, Check, X, BadgeCheck, Boxes, Factory, Tags, Plus } from "lucide-react";
import { toast } from "sonner";
import { Product } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { ProductDetailDialog, ProductThumb } from "../dialogs/ProductDetailDialog";
import { ProductDialog } from "../dialogs/CreateDialogs";
import { productService } from "../../../lib/services";
import { InsightStat } from "../shared/PremiumPrimitives";

const CURRENCY_LABEL: Record<string, string> = { USD: "USD", EUR: "EUR", TRY: "TL" };
const fmtMoney = (n?: number | null, cur = "USD") =>
  n === undefined || n === null || Number.isNaN(n) || n === 0 ? "—" : `${n.toLocaleString("tr-TR")} ${CURRENCY_LABEL[cur] ?? cur}`;
const dateInput = (value?: string | null) => value ? String(value).slice(0, 10) : "";
type PriceOverride = {
  itemId?: string;
  listPrice?: number;
  cashPrice?: number;
  campaignPrice?: number;
  campaignValidFrom?: string;
  campaignValidUntil?: string;
  campaignIsActive?: boolean;
};

const matches = (p: Product, q: string) => {
  if (!q) return true;
  const s = q.toLowerCase();
  return [p.model, p.brand, p.type, p.shortDescription, p.stockCode, p.category].some(
    (v) => (v ?? "").toLowerCase().includes(s)
  );
};
const productName = (product: Product) =>
  product.shortDescription || [product.brand, product.modelName || product.model].filter(Boolean).join(" ") || product.stockCode || "";
const sortProductsByName = (items: Product[]) =>
  [...items].sort((a, b) => productName(a).localeCompare(productName(b), "tr", { sensitivity: "base" }));
const sortPriceListsByName = <T extends { name: string; code: string }>(items: T[]) =>
  [...items].sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, "tr", { sensitivity: "base" }));

const SERVICE_PRICE_CATEGORIES = [
  { value: "parts", label: "Yedek Parça", code: "YEDEK_PARCA", icon: Package },
  { value: "accessory", label: "Aksesuar", code: "AKSESUAR", icon: Package },
  { value: "optional", label: "Opsiyonel Donanım", code: "OPSIYONEL_DONANIM", icon: Wrench },
  { value: "labor", label: "İşçilik", code: "ISCILIK", icon: Wrench },
] as const;
type ServicePriceTab = typeof SERVICE_PRICE_CATEGORIES[number]["value"];

/** Read-only banner shown on every price-list view. */
function ReadOnlyNote({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <Lock className="size-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

/**
 * Süper admin için satır-içi düzenlenebilir fiyat hücresi. Tıklayınca input olur,
 * Enter/✓ ile kaydeder, Esc/✕ ile iptal eder. Satırın onClick'ini tetiklememek
 * için tüm etkileşimlerde stopPropagation uygulanır.
 */
function EditablePriceCell({
  value,
  currency,
  editable,
  className = "",
  onSave,
}: {
  value?: number | null;
  currency?: string;
  editable: boolean;
  className?: string;
  onSave: (next: number) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const begin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editable || busy) return;
    setText(value != null ? String(value) : "");
    setEditing(true);
  };

  const commit = async () => {
    const next = Number(text.replace(/\./g, "").replace(",", "."));
    if (text.trim() === "" || Number.isNaN(next)) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <TableCell className={`text-right ${className}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <Input
            autoFocus
            inputMode="decimal"
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-8 w-28 text-right tabular-nums bg-white"
          />
          <button type="button" onClick={commit} disabled={busy} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50" title="Kaydet">
            <Check className="size-4" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(false); }} className="text-muted-foreground hover:text-foreground" title="İptal">
            <X className="size-4" />
          </button>
        </div>
      </TableCell>
    );
  }

  return (
    <TableCell className={`text-right tabular-nums ${className}`} onClick={editable ? begin : undefined}>
      <span className={`inline-flex items-center gap-1.5 ${editable ? "cursor-text group/price hover:text-primary" : ""}`}>
        {fmtMoney(value, currency)}
        {editable && <Pencil className="size-3 text-muted-foreground opacity-0 group-hover/price:opacity-100" />}
      </span>
    </TableCell>
  );
}

function CampaignPriceCell({
  value,
  currency,
  editable,
  disabled,
  onSave,
}: {
  value?: PriceOverride;
  currency?: string;
  editable: boolean;
  disabled?: boolean;
  onSave: (next: Required<Pick<PriceOverride, "campaignIsActive">> & Pick<PriceOverride, "campaignPrice" | "campaignValidFrom" | "campaignValidUntil">) => Promise<void>;
}) {
  const [price, setPrice] = useState(value?.campaignPrice != null ? String(value.campaignPrice) : "");
  const [from, setFrom] = useState(dateInput(value?.campaignValidFrom));
  const [until, setUntil] = useState(dateInput(value?.campaignValidUntil));
  const [active, setActive] = useState(Boolean(value?.campaignIsActive));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPrice(value?.campaignPrice != null ? String(value.campaignPrice) : "");
    setFrom(dateInput(value?.campaignValidFrom));
    setUntil(dateInput(value?.campaignValidUntil));
    setActive(Boolean(value?.campaignIsActive));
  }, [value?.campaignPrice, value?.campaignValidFrom, value?.campaignValidUntil, value?.campaignIsActive]);

  const commit = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const parsed = Number(price.replace(/\./g, "").replace(",", "."));
    if (price.trim() && Number.isNaN(parsed)) return toast.error("Kampanya fiyatı geçersiz");
    if (active && (!price.trim() || parsed <= 0)) return toast.error("Aktif kampanya için fiyat girin");
    if (from && until && until < from) return toast.error("Kampanya bitiş tarihi başlangıçtan önce olamaz");
    setBusy(true);
    try {
      await onSave({
        campaignPrice: price.trim() ? parsed : undefined,
        campaignValidFrom: from || undefined,
        campaignValidUntil: until || undefined,
        campaignIsActive: active,
      });
    } finally {
      setBusy(false);
    }
  };

  if (!editable) {
    return (
      <TableCell className="text-right">
        <div className="inline-flex items-center justify-end">
          {value?.campaignIsActive && value.campaignPrice != null ? (
            <div className="inline-flex flex-col items-end gap-1">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {fmtMoney(value.campaignPrice, currency)}
            </span>
            {(value.campaignValidFrom || value.campaignValidUntil) && (
              <span className="text-[10px] text-muted-foreground">
                {dateInput(value.campaignValidFrom) || "..."} - {dateInput(value.campaignValidUntil) || "..."}
              </span>
            )}
            </div>
          ) : <span className="text-muted-foreground">—</span>}
        </div>
      </TableCell>
    );
  }

  return (
    <TableCell className="min-w-[290px]" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-[88px_1fr_1fr_auto] items-center gap-1.5">
        <Input
          inputMode="decimal"
          value={price}
          disabled={busy || disabled || !active}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Kamp."
          className="h-8 bg-white text-right tabular-nums"
        />
        <Input type="date" value={from} disabled={busy || disabled || !active} onChange={(e) => setFrom(e.target.value)} className="h-8 bg-white text-xs" />
        <Input type="date" value={until} disabled={busy || disabled || !active} onChange={(e) => setUntil(e.target.value)} className="h-8 bg-white text-xs" />
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={active}
            disabled={busy || disabled}
            onChange={(e) => setActive(e.target.checked)}
            className="size-4 accent-primary"
            aria-label="Kampanya aktif"
          />
          <button
            type="button"
            disabled={busy || disabled}
            onClick={commit}
            className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
            title={disabled ? "Önce fiyat listesi seçin" : "Kampanyayı kaydet"}
          >
            <Check className="size-4" />
          </button>
        </div>
      </div>
    </TableCell>
  );
}

function SearchBox({ q, setQ, placeholder }: { q: string; setQ: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-72 sm:ml-auto">
      <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input placeholder={placeholder} className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
    </div>
  );
}

/* =========================================================================
   SATIŞ FİYAT LİSTESİ — tezgahlar; tıklayınca uyumlu opsiyonel donanım + fiyat
   ========================================================================= */
export function SalesPriceListPage() {
  const { products } = useStore();
  const { hasPermission, hasRole } = useAuth();
  const canEditProduct = hasRole("super_admin") || hasRole("admin") || hasPermission("products.update");
  const canManageCampaign = hasRole("super_admin") && (hasPermission("price_lists.update") || hasPermission("price_lists.create"));
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [priceLists, setPriceLists] = useState<Array<{ id: string; name: string; code: string; isActive?: boolean; currency?: { code?: string } }>>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [priceOverrides, setPriceOverrides] = useState<Record<string, PriceOverride>>({});
  const [campaignManagementOpen, setCampaignManagementOpen] = useState(false);

  useEffect(() => {
    productService
      .listPriceLists({ pageSize: 50 })
      .then((res) => {
        const rows = res.data ?? [];
        setPriceLists(sortPriceListsByName(rows));
        const active = rows.find((p) => p.isActive) ?? rows[0];
        if (active?.id) setSelectedListId(active.id);
      })
      .catch(() => setPriceLists([]));
  }, []);

  useEffect(() => {
    setCampaignManagementOpen(false);
    if (!selectedListId) {
      setPriceOverrides({});
      return;
    }
    productService
      .listPriceListItems(selectedListId)
      .then((rows) => {
        const map: Record<string, PriceOverride> = {};
        for (const row of rows ?? []) {
          const pid = row.product?.id ?? row.item?.productModelId;
          if (!pid) continue;
          map[pid] = {
            itemId: row.item?.id,
            listPrice: row.item?.listPrice != null ? Number(row.item.listPrice) : undefined,
            cashPrice: row.item?.cashPrice != null ? Number(row.item.cashPrice) : undefined,
            campaignPrice: row.item?.campaignPrice != null ? Number(row.item.campaignPrice) : undefined,
            campaignValidFrom: dateInput(row.item?.campaignValidFrom),
            campaignValidUntil: dateInput(row.item?.campaignValidUntil),
            campaignIsActive: Boolean(row.item?.campaignIsActive),
          };
        }
        setPriceOverrides(map);
      })
      .catch(() => setPriceOverrides({}));
  }, [selectedListId]);

  const selectedList = priceLists.find((p) => p.id === selectedListId);
  const listCurrency = selectedList?.currency?.code;

  const machines = useMemo(() => sortProductsByName(products.filter((p) => p.categoryCode === "TEZGAH")), [products]);
  const filtered = machines.filter((p) => matches(p, q));
  const pricedMachineCount = machines.filter((product) => (priceOverrides[product.id]?.listPrice ?? product.listPrice) > 0).length;
  const campaignMachineCount = machines.filter((product) => priceOverrides[product.id]?.campaignIsActive && priceOverrides[product.id]?.campaignPrice != null).length;
  const campaignColumnVisible = campaignMachineCount > 0 || (canManageCampaign && campaignManagementOpen);

  const saveCampaign = async (
    p: Product,
    next: Required<Pick<PriceOverride, "campaignIsActive">> & Pick<PriceOverride, "campaignPrice" | "campaignValidFrom" | "campaignValidUntil">,
  ) => {
    if (!selectedListId) {
      toast.error("Önce fiyat listesi seçin");
      return;
    }
    const current = priceOverrides[p.id];
    const payload = {
      productModelId: p.id,
      campaignPrice: next.campaignPrice,
      campaignValidFrom: next.campaignValidFrom ? new Date(next.campaignValidFrom) : undefined,
      campaignValidUntil: next.campaignValidUntil ? new Date(next.campaignValidUntil) : undefined,
      campaignIsActive: next.campaignIsActive,
    };
    try {
      const saved = current?.itemId
        ? await productService.updatePriceListItem(selectedListId, current.itemId, payload)
        : await productService.createPriceListItem(selectedListId, payload);
      setPriceOverrides((prev) => ({
        ...prev,
        [p.id]: {
          ...prev[p.id],
          itemId: saved?.id ?? prev[p.id]?.itemId,
          campaignPrice: next.campaignPrice,
          campaignValidFrom: next.campaignValidFrom,
          campaignValidUntil: next.campaignValidUntil,
          campaignIsActive: next.campaignIsActive,
        },
      }));
      toast.success("Kampanya fiyatı güncellendi");
    } catch (err: any) {
      toast.error("Kampanya fiyatı kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <div className="space-y-4">
      <section className="premium-blueprint precision-corners overflow-hidden rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-primary">MAKİNE FİYAT KATALOĞU</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Satış fiyat mimarisi</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Ürün adı, sabit satış fiyatları ve aktif kampanya bağlamını tek satırda karşılaştırın.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[610px]">
            <InsightStat label="Tezgah" value={machines.length} icon={<Factory />} />
            <InsightStat label="Fiyatlı" value={pricedMachineCount} icon={<BadgeCheck />} tone="success" />
            <InsightStat label="Kampanya" value={campaignMachineCount} icon={<Tags />} tone={campaignMachineCount ? "warning" : "default"} />
            <InsightStat label="Liste" value={selectedList?.code || "—"} detail={listCurrency || "Para birimi yok"} icon={<BadgeCheck />} />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-border/60 bg-card p-3 shadow-sm">
        {canManageCampaign ? (
          <div className="flex flex-wrap items-center gap-2">
            {campaignManagementOpen ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                <Tags className="size-3.5 shrink-0" />
                <span>Kampanya fiyatını, tarihlerini ve aktiflik durumunu satırdan kaydedin.</span>
              </div>
            ) : (
              <ReadOnlyNote text={campaignMachineCount > 0 ? "Aktif kampanyalar ayrı fiyat sütununda gösteriliyor." : "Kampanya alanı kapalıdır."} />
            )}
            <Button
              type="button"
              size="sm"
              variant={campaignManagementOpen ? "outline" : "default"}
              className="h-9 gap-1.5"
              disabled={!selectedListId}
              onClick={() => setCampaignManagementOpen((open) => !open)}
            >
              {campaignManagementOpen ? <X className="size-4" /> : <Plus className="size-4" />}
              {campaignManagementOpen ? "Kampanya Düzenlemeyi Kapat" : "Kampanya Oluştur"}
            </Button>
          </div>
        ) : (
          <ReadOnlyNote text={campaignMachineCount > 0 ? "Peşin, liste ve kampanyalı fiyatlar salt okunurdur." : "Peşin ve liste fiyatları salt okunurdur. Kampanyayı yalnız Süper Admin oluşturabilir."} />
        )}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {priceLists.length > 0 && (
            <Select value={selectedListId || "none"} onValueChange={(v) => setSelectedListId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9 w-full sm:w-56 bg-white">
                <SelectValue placeholder="Fiyat listesi" />
              </SelectTrigger>
              <SelectContent>
                {priceLists.map((pl) => (
                  <SelectItem key={pl.id} value={pl.id}>{pl.name || pl.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <SearchBox q={q} setQ={setQ} placeholder="Tezgah, marka, model ara..." />
        </div>
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[380px]">Ürün Adı</TableHead>
                <TableHead>Marka</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead className="text-right">Peşin Fiyat</TableHead>
                <TableHead className="text-right">Liste Fiyatı</TableHead>
                {campaignColumnVisible && <TableHead className="text-right">Kampanyalı Fiyat</TableHead>}
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const override = priceOverrides[p.id];
                const cash = override?.cashPrice ?? p.cashPrice;
                const list = override?.listPrice ?? p.listPrice;
                const cur = listCurrency ?? p.currency;
                return (
                <TableRow key={p.id} className="cursor-pointer group" onClick={() => setSelected(p)}>
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <ProductThumb product={p} />
                      <div className="min-w-0">
                        <div className="text-sm leading-tight truncate group-hover:text-primary transition-colors">{p.shortDescription || `${p.brand} ${p.model}`.trim()}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{[p.brand, p.series, p.model].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{p.brand}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.type || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600">{fmtMoney(cash, cur)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(list, cur)}</TableCell>
                  {campaignColumnVisible && (
                    <CampaignPriceCell
                      value={override}
                      currency={cur}
                      editable={canManageCampaign && campaignManagementOpen}
                      disabled={!selectedListId}
                      onSave={(next) => saveCampaign(p, next)}
                    />
                  )}
                  <TableCell><ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" /></TableCell>
                </TableRow>
              );})}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={campaignColumnVisible ? 7 : 6} className="text-center py-16 text-sm text-muted-foreground">Tezgah bulunamadı.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="px-4 py-3 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground">
          Toplam <b className="text-foreground">{filtered.length}</b> tezgah
        </div>
      </Card>

      <ProductDetailDialog
        product={selected}
        onClose={() => setSelected(null)}
        highlightOptional
        onEdit={
          canEditProduct
            ? (product) => {
                setSelected(null);
                setEditingProduct(product);
              }
            : undefined
        }
      />
      {editingProduct && (
        <ProductDialog
          mode="edit"
          product={editingProduct}
          open={!!editingProduct}
          onOpenChange={(open) => {
            if (!open) setEditingProduct(null);
          }}
        />
      )}
    </div>
  );
}

/* =========================================================================
   SERVİS FİYAT LİSTESİ — kategori sekmeli servis kalemleri
   ========================================================================= */
export function ServicePriceListPage() {
  const { products } = useStore();
  const { hasPermission, hasRole } = useAuth();
  const canEdit = hasPermission("price_lists.update") || hasPermission("price_lists.create");
  const canEditProduct = hasRole("super_admin") || hasRole("admin") || hasPermission("products.update");
  const [tab, setTab] = useState<ServicePriceTab>("parts");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [priceLists, setPriceLists] = useState<Array<{ id: string; name: string; code: string; isActive?: boolean; currency?: { code?: string } }>>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [priceOverrides, setPriceOverrides] = useState<Record<string, PriceOverride>>({});

  useEffect(() => {
    productService
      .listPriceLists({ pageSize: 50 })
      .then((res) => {
        const rows = res.data ?? [];
        setPriceLists(sortPriceListsByName(rows));
        const active = rows.find((p) => p.isActive) ?? rows[0];
        if (active?.id) setSelectedListId(active.id);
      })
      .catch(() => setPriceLists([]));
  }, []);

  useEffect(() => {
    if (!selectedListId) {
      setPriceOverrides({});
      return;
    }
    productService
      .listPriceListItems(selectedListId)
      .then((rows) => {
        const map: Record<string, PriceOverride> = {};
        for (const row of rows ?? []) {
          const pid = row.product?.id ?? row.item?.productModelId;
          if (!pid) continue;
          map[pid] = {
            itemId: row.item?.id,
            listPrice: row.item?.listPrice != null ? Number(row.item.listPrice) : undefined,
            cashPrice: row.item?.cashPrice != null ? Number(row.item.cashPrice) : undefined,
          };
        }
        setPriceOverrides(map);
      })
      .catch(() => setPriceOverrides({}));
  }, [selectedListId]);

  const categoryCounts = useMemo(() =>
    SERVICE_PRICE_CATEGORIES.reduce<Record<ServicePriceTab, number>>((acc, category) => {
      acc[category.value] = products.filter((p) => p.categoryCode === category.code).length;
      return acc;
    }, {} as Record<ServicePriceTab, number>),
  [products]);
  const activeCategory = SERVICE_PRICE_CATEGORIES.find((category) => category.value === tab) ?? SERVICE_PRICE_CATEGORIES[0];
  const categoryProducts = useMemo(
    () => sortProductsByName(products.filter((p) => p.categoryCode === activeCategory.code)),
    [products, activeCategory.code],
  );
  const list = categoryProducts.filter((p) => matches(p, q));
  const isLabor = tab === "labor";
  const selectedList = priceLists.find((p) => p.id === selectedListId);
  const listCurrency = selectedList?.currency?.code;

  const savePrice = async (p: Product, field: "cashPrice" | "listPrice", next: number) => {
    if (!selectedListId) {
      toast.error("Önce fiyat listesi seçin");
      return;
    }
    const current = priceOverrides[p.id];
    const payload = { productModelId: p.id, [field]: next };
    try {
      const saved = current?.itemId
        ? await productService.updatePriceListItem(selectedListId, current.itemId, payload)
        : await productService.createPriceListItem(selectedListId, payload);
      setPriceOverrides((prev) => ({ ...prev, [p.id]: { ...prev[p.id], itemId: saved?.id ?? prev[p.id]?.itemId, [field]: next } }));
      toast.success("Fiyat güncellendi");
    } catch (err: any) {
      toast.error("Fiyat güncellenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <div className="space-y-4">
      <section className="premium-blueprint precision-corners overflow-hidden rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-primary">PARÇA & İŞÇİLİK KATALOĞU</p><h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Servis fiyat mimarisi</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Üretici, uyumluluk ve seçili fiyat listesi bağlamını kaybetmeden servis kalemlerini karşılaştırın.</p></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[610px]"><InsightStat label="Toplam Kalem" value={Object.values(categoryCounts).reduce((sum, count) => sum + count, 0)} icon={<Boxes />} /><InsightStat label="Kategori" value={SERVICE_PRICE_CATEGORIES.length} icon={<Tags />} /><InsightStat label="Görünen" value={list.length} icon={<Package />} tone="success" /><InsightStat label="Liste" value={selectedList?.code || "—"} detail={listCurrency || "Para birimi yok"} icon={<BadgeCheck />} /></div>
        </div>
      </section>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as ServicePriceTab)}>
          <TabsList className="h-9 bg-muted/60">
            {SERVICE_PRICE_CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                <TabsTrigger key={category.value} value={category.value} className="gap-1.5">
                  <Icon className="size-3.5" /> {category.label}
                  <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-zinc-200 text-zinc-700">{categoryCounts[category.value]}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {priceLists.length > 0 && (
            <Select value={selectedListId || "none"} onValueChange={(v) => setSelectedListId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9 w-full sm:w-56 bg-white">
                <SelectValue placeholder="Fiyat listesi" />
              </SelectTrigger>
              <SelectContent>
                {priceLists.map((pl) => (
                  <SelectItem key={pl.id} value={pl.id}>{pl.name || pl.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <SearchBox q={q} setQ={setQ} placeholder={isLabor ? "İşçilik kalemi ara..." : `${activeCategory.label}, marka ara...`} />
        </div>
      </div>

      {canEdit ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          <Pencil className="size-3.5 shrink-0" />
          <span>Fiyat listesi yetkisi: Fiyatlara tıklayarak seçili liste kalemini düzenleyebilirsiniz.</span>
        </div>
      ) : (
        <ReadOnlyNote text="Servis fiyat listesi salt-okunur. Kalemler kategori sekmelerine ayrılmıştır." />
      )}

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {!isLabor ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[410px]">{activeCategory.label} / Üretici</TableHead>
                  <TableHead>Uyumluluk</TableHead>
                  <TableHead className="text-right">Peşin</TableHead>
                  <TableHead className="text-right">Liste Fiyatı</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => {
                  const override = priceOverrides[p.id];
                  const cash = override?.cashPrice ?? p.cashPrice;
                  const listPrice = override?.listPrice ?? p.listPrice;
                  const cur = listCurrency ?? p.currency;
                  return (
                  <TableRow key={p.id} className="cursor-pointer group" onClick={() => setSelected(p)}>
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductThumb product={p} fallback={<Package className="size-4" />} size="md" />
                        <div className="min-w-0">
                          <div className="font-data text-[9px] font-semibold uppercase tracking-[0.12em] text-operation-blue">{p.stockCode || "STOK KODU YOK"}</div>
                          <div className="mt-1 truncate text-sm font-medium leading-tight transition-colors group-hover:text-primary">{p.shortDescription || p.model}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Factory className="size-3" /> {p.brand || "Üretici yok"}</span>{p.originCountry && <span>· {p.originCountry}</span>}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><div className="flex max-w-[220px] flex-wrap gap-1.5"><span className="chip chip-info">{p.compatibleMachineTypeCode || p.type || "Genel uyum"}</span>{p.subcategory && <span className="chip chip-neutral">{p.subcategory}</span>}</div></TableCell>
                    <EditablePriceCell
                      value={cash}
                      currency={cur}
                      editable={canEdit}
                      className="text-emerald-600"
                      onSave={(next) => savePrice(p, "cashPrice", next)}
                    />
                    <EditablePriceCell
                      value={listPrice}
                      currency={cur}
                      editable={canEdit}
                      onSave={(next) => savePrice(p, "listPrice", next)}
                    />
                    <TableCell><ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" /></TableCell>
                  </TableRow>
                );})}
                {list.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-16 text-sm text-muted-foreground">{activeCategory.label} bulunamadı.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[460px]">İşçilik Kalemi</TableHead>
                  <TableHead className="text-right">Birim Ücret</TableHead>
                  <TableHead className="text-right">KDV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => {
                  const override = priceOverrides[p.id];
                  const listPrice = override?.listPrice ?? p.listPrice;
                  const cur = listCurrency ?? p.currency;
                  return (
                  <TableRow key={p.id} className="cursor-pointer group" onClick={() => setSelected(p)}>
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 rounded-lg bg-gradient-to-br from-rose-100 to-rose-50 text-rose-600 grid place-items-center shrink-0">
                          <Wrench className="size-4" />
                        </div>
                        <div className="text-sm leading-tight truncate group-hover:text-primary transition-colors">{p.shortDescription || p.model}</div>
                      </div>
                    </TableCell>
                    <EditablePriceCell
                      value={listPrice}
                      currency={cur}
                      editable={canEdit}
                      onSave={(next) => savePrice(p, "listPrice", next)}
                    />
                    <TableCell className="text-right tabular-nums text-muted-foreground">{p.vatRate ? `%${p.vatRate}` : "—"}</TableCell>
                  </TableRow>
                );})}
                {list.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center py-16 text-sm text-muted-foreground">İşçilik kalemi bulunamadı.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="px-4 py-3 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground">
          Toplam <b className="text-foreground">{list.length}</b> {isLabor ? "işçilik kalemi" : activeCategory.label.toLocaleLowerCase("tr-TR")}
        </div>
      </Card>

      <ProductDetailDialog
        product={selected}
        onClose={() => setSelected(null)}
        hideOptionalEquipment
        onEdit={
          canEditProduct
            ? (product) => {
                setSelected(null);
                setEditingProduct(product);
              }
            : undefined
        }
      />
      {editingProduct && (
        <ProductDialog
          mode="edit"
          product={editingProduct}
          open={!!editingProduct}
          onOpenChange={(open) => {
            if (!open) setEditingProduct(null);
          }}
        />
      )}
    </div>
  );
}
