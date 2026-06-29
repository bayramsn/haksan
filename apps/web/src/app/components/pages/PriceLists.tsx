import { useState, useMemo, useEffect } from "react";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Search, ChevronRight, Lock, Wrench, Package, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Product } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { ProductDetailDialog, ProductThumb } from "../dialogs/ProductDetailDialog";
import { productService } from "../../../lib/services";

const CURRENCY_LABEL: Record<string, string> = { USD: "USD", EUR: "EUR", TRY: "TL" };
const fmtMoney = (n?: number | null, cur = "USD") =>
  n === undefined || n === null || Number.isNaN(n) || n === 0 ? "—" : `${n.toLocaleString("tr-TR")} ${CURRENCY_LABEL[cur] ?? cur}`;

const matches = (p: Product, q: string) => {
  if (!q) return true;
  const s = q.toLowerCase();
  return [p.model, p.brand, p.type, p.shortDescription, p.stockCode, p.category].some(
    (v) => (v ?? "").toLowerCase().includes(s)
  );
};

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
  const { products, patchProduct } = useStore();
  const { hasRole } = useAuth();
  const canEdit = hasRole("super_admin");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [priceLists, setPriceLists] = useState<Array<{ id: string; name: string; code: string; isActive?: boolean; currency?: { code?: string } }>>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [priceOverrides, setPriceOverrides] = useState<Record<string, { listPrice?: number; cashPrice?: number }>>({});

  useEffect(() => {
    productService
      .listPriceLists({ pageSize: 50 })
      .then((res) => {
        const rows = res.data ?? [];
        setPriceLists(rows);
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
        const map: Record<string, { listPrice?: number; cashPrice?: number }> = {};
        for (const row of rows ?? []) {
          const pid = row.product?.id ?? row.item?.productModelId;
          if (!pid) continue;
          map[pid] = {
            listPrice: row.item?.listPrice != null ? Number(row.item.listPrice) : undefined,
            cashPrice: row.item?.cashPrice != null ? Number(row.item.cashPrice) : undefined,
          };
        }
        setPriceOverrides(map);
      })
      .catch(() => setPriceOverrides({}));
  }, [selectedListId]);

  const selectedList = priceLists.find((p) => p.id === selectedListId);
  const listCurrency = selectedList?.currency?.code;

  const machines = useMemo(() => products.filter((p) => p.categoryCode === "TEZGAH"), [products]);
  const filtered = machines.filter((p) => matches(p, q));

  // Süper admin satır-içi fiyat düzenlemesi: ürünün baz fiyatını PATCH'ler ve
  // hem store (tablo geneli) hem de yerel override haritası anında güncellenir.
  const savePrice = async (p: Product, field: "cashPrice" | "listPrice", next: number) => {
    try {
      await patchProduct(p.id, { [field]: next });
      setPriceOverrides((prev) => ({ ...prev, [p.id]: { ...prev[p.id], [field]: next } }));
      toast.success("Fiyat güncellendi");
    } catch {
      toast.error("Fiyat güncellenemedi");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {canEdit ? (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
            <Pencil className="size-3.5 shrink-0" />
            <span>Süper admin: Peşin ve Liste fiyatlarına tıklayarak düzenleyebilir; satıra tıklayarak diğer tüm alanları (KDV, stok kodu, açıklama vb.) güncelleyebilirsiniz.</span>
          </div>
        ) : (
          <ReadOnlyNote text="Fiyat listesi salt-okunur. Tezgaha tıklayarak uyumlu opsiyonel donanımları ve fiyatlarını görebilirsiniz." />
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
                <TableHead className="w-[380px]">Tezgah</TableHead>
                <TableHead>Marka</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead className="text-right">Peşin Fiyat</TableHead>
                <TableHead className="text-right">Liste Fiyatı</TableHead>
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
                        <div className="text-sm leading-tight truncate group-hover:text-primary transition-colors">{p.brand} {p.model}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.shortDescription || "—"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{p.brand}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.type || "—"}</TableCell>
                  <EditablePriceCell
                    value={cash}
                    currency={cur}
                    editable={canEdit}
                    className="text-emerald-600"
                    onSave={(next) => savePrice(p, "cashPrice", next)}
                  />
                  <EditablePriceCell
                    value={list}
                    currency={cur}
                    editable={canEdit}
                    onSave={(next) => savePrice(p, "listPrice", next)}
                  />
                  <TableCell><ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" /></TableCell>
                </TableRow>
              );})}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-sm text-muted-foreground">Tezgah bulunamadı.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="px-4 py-3 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground">
          Toplam <b className="text-foreground">{filtered.length}</b> tezgah
        </div>
      </Card>

      <ProductDetailDialog product={selected} onClose={() => setSelected(null)} highlightOptional />
    </div>
  );
}

/* =========================================================================
   SERVİS FİYAT LİSTESİ — kategori sekmeli servis kalemleri
   ========================================================================= */
export function ServicePriceListPage() {
  const { products, patchProduct } = useStore();
  const { hasRole } = useAuth();
  const canEdit = hasRole("super_admin");
  const [tab, setTab] = useState<ServicePriceTab>("parts");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);

  const categoryCounts = useMemo(() =>
    SERVICE_PRICE_CATEGORIES.reduce<Record<ServicePriceTab, number>>((acc, category) => {
      acc[category.value] = products.filter((p) => p.categoryCode === category.code).length;
      return acc;
    }, {} as Record<ServicePriceTab, number>),
  [products]);
  const activeCategory = SERVICE_PRICE_CATEGORIES.find((category) => category.value === tab) ?? SERVICE_PRICE_CATEGORIES[0];
  const categoryProducts = useMemo(() => products.filter((p) => p.categoryCode === activeCategory.code), [products, activeCategory.code]);
  const list = categoryProducts.filter((p) => matches(p, q));
  const isLabor = tab === "labor";

  const savePrice = async (p: Product, field: "cashPrice" | "listPrice", next: number) => {
    try {
      await patchProduct(p.id, { [field]: next });
      toast.success("Fiyat güncellendi");
    } catch {
      toast.error("Fiyat güncellenemedi");
    }
  };

  return (
    <div className="space-y-4">
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
        <SearchBox q={q} setQ={setQ} placeholder={isLabor ? "İşçilik kalemi ara..." : `${activeCategory.label}, marka ara...`} />
      </div>

      {canEdit ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          <Pencil className="size-3.5 shrink-0" />
          <span>Süper admin: Fiyatlara tıklayarak düzenleyebilir; satıra tıklayarak diğer tüm alanları (KDV, stok kodu, açıklama vb.) güncelleyebilirsiniz.</span>
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
                  <TableHead className="w-[380px]">{activeCategory.label}</TableHead>
                  <TableHead>Marka</TableHead>
                  <TableHead className="text-right">Peşin</TableHead>
                  <TableHead className="text-right">Liste Fiyatı</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer group" onClick={() => setSelected(p)}>
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductThumb product={p} fallback={<Package className="size-4" />} />
                        <div className="min-w-0">
                          <div className="text-sm leading-tight truncate group-hover:text-primary transition-colors">{p.shortDescription || p.model}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.stockCode || p.model}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{p.brand}</TableCell>
                    <EditablePriceCell
                      value={p.cashPrice}
                      currency={p.currency}
                      editable={canEdit}
                      className="text-emerald-600"
                      onSave={(next) => savePrice(p, "cashPrice", next)}
                    />
                    <EditablePriceCell
                      value={p.listPrice}
                      currency={p.currency}
                      editable={canEdit}
                      onSave={(next) => savePrice(p, "listPrice", next)}
                    />
                    <TableCell><ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" /></TableCell>
                  </TableRow>
                ))}
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
                {list.map((p) => (
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
                      value={p.listPrice}
                      currency={p.currency}
                      editable={canEdit}
                      onSave={(next) => savePrice(p, "listPrice", next)}
                    />
                    <TableCell className="text-right tabular-nums text-muted-foreground">{p.vatRate ? `%${p.vatRate}` : "—"}</TableCell>
                  </TableRow>
                ))}
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

      <ProductDetailDialog product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
