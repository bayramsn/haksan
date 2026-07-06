import { Fragment, useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import { type Machine, type Product, type StockItem } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { ProductDialog } from "../dialogs/CreateDialogs";
import { ProductImportDialog } from "../dialogs/ProductImportDialog";
import { ProductDetailDialog, ProductThumb } from "../dialogs/ProductDetailDialog";
import { toast } from "sonner";
import {
  Cpu, Search, Package, CheckCircle2, Truck, Wrench, Building2,
  ShieldCheck, AlertTriangle, Clock, MapPin, ChevronRight,
  Plus, Upload, Pencil, Trash2, Boxes, Layers,
} from "lucide-react";
import { MiniKpi } from "../shared/MiniKpi";
import { EmptyState } from "../shared/EmptyState";

type Stage = "Stokta" | "Rezerve" | "Sevkiyatta" | "Kuruldu" | "Servis" | "Hizmet Dışı";

type Device = {
  serial: string;
  model: string;
  brand: string;
  stage: Stage;
  warehouse?: string;
  customerId?: string;
  installationDate?: string;
  warrantyEnd?: string;
  status?: string;
  source: "stock" | "machine";
  refId: string;
};

const STAGE_TONE: Record<Stage, { bg: string; text: string; icon: any }> = {
  "Stokta": { bg: "bg-success-soft", text: "text-success", icon: Package },
  "Rezerve": { bg: "bg-warning-soft", text: "text-warning", icon: Clock },
  "Sevkiyatta": { bg: "bg-info-soft", text: "text-info", icon: Truck },
  "Kuruldu": { bg: "bg-brand-blue-soft", text: "text-brand-blue", icon: CheckCircle2 },
  "Servis": { bg: "bg-orange-50", text: "text-orange-700", icon: Wrench },
  "Hizmet Dışı": { bg: "bg-muted", text: "text-muted-foreground", icon: AlertTriangle },
};

function buildDevices(stockItems: StockItem[], machines: Machine[]): Device[] {
  const fromStock: Device[] = stockItems.map((s) => ({
    serial: s.serialNumber,
    model: s.counterModel,
    brand: s.brand,
    stage: s.status === "Available" ? "Stokta"
      : s.status === "Reserved" ? "Rezerve"
      : s.status === "Sold" ? "Sevkiyatta"
      : "Hizmet Dışı",
    warehouse: s.warehouse,
    source: "stock",
    refId: s.id,
  }));
  const fromMachines: Device[] = machines.map((m) => ({
    serial: m.serialNumber,
    model: m.model,
    brand: stockItems.find((s) => s.id === m.stockItemId)?.brand ?? "—",
    stage: m.status === "Decommissioned" ? "Hizmet Dışı" : "Kuruldu",
    customerId: m.customerId,
    installationDate: m.installationDate,
    warrantyEnd: m.warrantyEnd,
    status: m.status,
    source: "machine",
    refId: m.id,
  }));
  const map = new Map<string, Device>();
  for (const d of fromStock) map.set(d.serial, d);
  for (const d of fromMachines) map.set(d.serial, d);
  return Array.from(map.values());
}

const CURRENCY_LABEL: Record<string, string> = { USD: "USD", EUR: "EUR", TRY: "TL" };
const fmtMoney = (n?: number | null, cur = "USD") =>
  n === undefined || n === null || Number.isNaN(n) || n === 0 ? "—" : `${n.toLocaleString("tr-TR")} ${CURRENCY_LABEL[cur] ?? cur}`;

const SERIES_ORDER = ["VM", "MV", "VC", "SL", "MT", "SJ", "TC", "HT", "LH", "D", "C", "DL"];
const SERIES_PREFIX_RE = /^(DL|VM|MV|VC|SL|MT|SJ|TC|HT|LH|D|C)(?=[-\d\s/]|$)/i;

function productSeriesCode(product: Product) {
  const model = (product.model || product.modelName || "").trim().toLocaleUpperCase("tr-TR");
  return model.match(SERIES_PREFIX_RE)?.[1]?.toLocaleUpperCase("tr-TR") ?? "";
}

function productSeriesLabel(product: Product) {
  const code = productSeriesCode(product);
  return code ? `${code} Serisi` : "Serisiz";
}

function productFamilyLabel(product: Product) {
  const typeCode = (product.productTypeCode ?? "").toLocaleUpperCase("tr-TR");
  const series = productSeriesCode(product);
  if (typeCode.includes("TORNA") || ["SL", "MT", "SJ"].includes(series)) return "CNC Torna Tezgahları";
  if (typeCode === "CNC_TAPPING_CENTER" || series === "TC") return "CNC Tapping Center";
  if (typeCode.includes("YATAY_ISLEME") || ["HT", "LH"].includes(series)) return "CNC Yatay İşleme Merkezleri";
  if (typeCode.includes("5_EKSEN") || ["D", "C"].includes(series)) return "CNC 5 Eksen İşleme Merkezleri";
  if (typeCode.includes("KOPRU") || series === "DL") return "CNC Köprü Tipi İşleme Merkezleri";
  if (typeCode.includes("DIK_ISLEME") || ["VM", "MV", "VC"].includes(series)) return "CNC Dik İşleme Merkezleri";
  return product.category || product.productGroup || "Genel";
}

function seriesSort(a: string, b: string) {
  const ac = a.replace(" Serisi", "");
  const bc = b.replace(" Serisi", "");
  const ai = SERIES_ORDER.indexOf(ac);
  const bi = SERIES_ORDER.indexOf(bc);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  return a.localeCompare(b, "tr");
}

/* =========================================================================
   ÜRÜNLER (Products) — flat list like the company list, click → detail popup
   ========================================================================= */
export function ProductsPage({ initialQuery }: { initialQuery?: string }) {
  const { products, deleteProduct } = useStore();
  const { hasRole, hasPermission } = useAuth();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [series, setSeries] = useState<string>("all");
  const [selected, setSelected] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const canCreateProducts = hasPermission("products.create");
  const canEditProducts = hasPermission("products.update");
  const canDeleteProducts = hasPermission("products.delete");

  useEffect(() => {
    if (initialQuery) setQ(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setSeries("all");
  }, [cat]);

  // Servis departmanı katalogda yalnızca yedek parça ve işçilik kalemlerini
  // görür; tezgah/aksesuar gibi satış kalemleri gizlenir. Yöneticiler hepsini görür.
  const serviceScope = hasRole("service") && !hasRole("admin") && !hasRole("super_admin");
  const isServiceItem = (p: Product) => {
    const code = (p.categoryCode ?? "").toUpperCase();
    const name = (p.category ?? "").toLocaleLowerCase("tr-TR");
    return (
      code === "YEDEK_PARCA" || code === "ISCILIK" ||
      name.includes("yedek") || name.includes("işçilik") || name.includes("iscilik")
    );
  };
  const visibleProducts = useMemo(
    () => (serviceScope ? products.filter(isServiceItem) : products),
    [products, serviceScope]
  );

  const productSubtitle = (p: Product) => [p.type, p.subcategory].filter(Boolean).join(" · ");
  const categories = useMemo(
    () => Array.from(new Set(visibleProducts.map(productFamilyLabel))).filter(Boolean),
    [visibleProducts]
  );

  const categoryFiltered = visibleProducts.filter((p) => cat === "all" || productFamilyLabel(p) === cat);
  const seriesOptions = useMemo(
    () => Array.from(new Set(categoryFiltered.map(productSeriesLabel))).filter(Boolean).sort(seriesSort),
    [categoryFiltered]
  );

  const filtered = categoryFiltered.filter((p) => {
    if (series !== "all" && productSeriesLabel(p) !== series) return false;
    if (!q) return true;
    const s = q.toLocaleLowerCase("tr-TR");
    return [p.model, p.brand, p.type, p.shortDescription, p.stockCode, p.category, productSeriesLabel(p), productFamilyLabel(p)].some(
      (v) => (v ?? "").toLocaleLowerCase("tr-TR").includes(s)
    );
  });
  const grouped = Array.from(
    filtered.reduce((acc, product) => {
      const label = productSeriesLabel(product);
      const list = acc.get(label) ?? [];
      list.push(product);
      acc.set(label, list);
      return acc;
    }, new Map<string, Product[]>())
  ).sort(([a], [b]) => seriesSort(a, b));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MiniKpi
          icon={<Package className="size-4" />}
          label="Toplam Ürün"
          value={visibleProducts.length}
          tone="violet"
          onClick={() => setCat("all")}
          active={cat === "all"}
        />
        <MiniKpi
          icon={<Boxes className="size-4" />}
          label="Kategori"
          value={categories.length}
          sub="ürün ailesi"
          tone="blue"
        />
        <MiniKpi
          icon={<Layers className="size-4" />}
          label="Seri"
          value={new Set(visibleProducts.map(productSeriesLabel)).size}
          sub="model serisi"
          tone="amber"
        />
      </div>

      <div className="space-y-2">
        <div className="w-full overflow-x-auto pb-1">
          <Tabs value={cat} onValueChange={setCat} className="min-w-max">
            <TabsList className="h-10 w-max flex-nowrap bg-muted/60 p-1">
              <TabsTrigger value="all" className="gap-1.5 whitespace-nowrap px-3">
                Tümü <CountBadge n={visibleProducts.length} />
              </TabsTrigger>
              {categories.map((c) => (
                <TabsTrigger key={c} value={c} className="gap-1.5 whitespace-nowrap px-3">
                  {c} <CountBadge n={visibleProducts.filter((p) => productFamilyLabel(p) === c).length} />
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="relative w-full sm:w-72 lg:w-80">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Marka, model, ürün ara..."
              className="pl-9 h-9 bg-white"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canCreateProducts && (
              <ProductImportDialog
                trigger={<Button size="sm" variant="outline" className="h-9 gap-1 whitespace-nowrap"><Upload className="size-4" /> İçe Aktar</Button>}
              />
            )}
            {canCreateProducts && (
              <ProductDialog
                trigger={<Button size="sm" className="h-9 gap-1 whitespace-nowrap"><Plus className="size-4" /> Yeni Ürün</Button>}
              />
            )}
          </div>
        </div>
      </div>

      {seriesOptions.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={series === "all" ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => setSeries("all")}
          >
            Tüm Seriler
          </Button>
          {seriesOptions.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={series === option ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setSeries(option)}
            >
              {option}
              <span className="ml-1 text-[10px] opacity-75">
                {categoryFiltered.filter((p) => productSeriesLabel(p) === option).length}
              </span>
            </Button>
          ))}
        </div>
      )}

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[360px] text-[11px] uppercase tracking-wider text-muted-foreground">Ürün</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Seri</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Tip</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Kategori</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Liste Fiyatı</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Peşin</TableHead>
                <TableHead className="w-[88px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(([group, rows]) => (
                <Fragment key={group}>
                  <TableRow key={`${group}-header`} className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={7} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group} <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground/80">({rows.length} model)</span>
                    </TableCell>
                  </TableRow>
                  {rows.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer group hover:bg-primary/[0.025]" onClick={() => setSelected(p)}>
                      <TableCell>
                        <div className="flex items-center gap-3 min-w-0">
                          <ProductThumb product={p} />
                          <div className="min-w-0">
                            <div className="text-sm leading-tight truncate group-hover:text-primary transition-colors">
                              {p.brand} {p.model}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              {p.shortDescription || productSubtitle(p) || "—"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="h-5 text-[10px]">{productSeriesLabel(p)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.type || productFamilyLabel(p) || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] h-5">{productFamilyLabel(p)}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(p.listPrice, p.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">{fmtMoney(p.cashPrice, p.currency)}</TableCell>
                      <TableCell>
                        {(canEditProducts || canDeleteProducts) ? (
                          <div className="flex items-center justify-end gap-1">
                            {canEditProducts && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setEditing(p);
                                }}
                                title="Ürünü düzenle"
                              >
                                <Pencil className="size-4 text-muted-foreground" />
                              </Button>
                            )}
                            {canDeleteProducts && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-brand-red-soft"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleting(p);
                                }}
                                title="Ürünü sil"
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-4">
                    <EmptyState
                      icon={<Package className="size-6" />}
                      title="Bu filtreye uyan ürün bulunamadı"
                      description="Arama terimini veya kategori/seri filtrelerini değiştirerek tekrar deneyin."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/60 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            Toplam <b className="text-foreground">{filtered.length}</b> ürün
          </div>
        </div>
      </Card>

      <ProductDetailDialog product={selected} onClose={() => setSelected(null)} />
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && !deleteSaving && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ürünü sil?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{deleting ? `${deleting.brand} ${deleting.model}`.trim() : ""}</b> arşive alınacak. Bağlı kayıtlarda kullanılıyorsa işlem reddedilebilir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSaving}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteSaving}
              onClick={async () => {
                if (!deleting) return;
                setDeleteSaving(true);
                try {
                  await deleteProduct(deleting.id);
                  if (selected?.id === deleting.id) setSelected(null);
                  if (editing?.id === deleting.id) setEditing(null);
                  toast.success("Ürün silindi", { description: `${deleting.brand} ${deleting.model}`.trim() });
                  setDeleting(null);
                } catch (err: any) {
                  toast.error("Ürün silinemedi", { description: err?.message ?? "Bağlı kayıtlar olabilir." });
                } finally {
                  setDeleteSaving(false);
                }
              }}
            >
              {deleteSaving ? "Siliniyor..." : "Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {editing && (
        <ProductDialog
          mode="edit"
          product={editing}
          open={!!editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-muted text-muted-foreground">
      {n}
    </span>
  );
}

/* =========================================================================
   CİHAZ TAKİBİ (Device tracking) — per-serial status
   ========================================================================= */
const STAGES: Stage[] = ["Stokta", "Rezerve", "Sevkiyatta", "Kuruldu", "Servis", "Hizmet Dışı"];

export function DeviceTrackingPage() {
  const { stock, machines, customers } = useStore();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Stage | "all">("all");
  const devices = useMemo(() => buildDevices(stock, machines), [stock, machines]);

  const counts = STAGES.reduce((acc, s) => {
    acc[s] = devices.filter((d) => d.stage === s).length;
    return acc;
  }, {} as Record<Stage, number>);

  const filtered = devices.filter((d) => {
    if (tab !== "all" && d.stage !== tab) return false;
    if (q) {
      const cName = d.customerId ? customers.find((c) => c.id === d.customerId)?.name ?? "" : "";
      return d.serial.toLowerCase().includes(q.toLowerCase())
        || d.model.toLowerCase().includes(q.toLowerCase())
        || cName.toLowerCase().includes(q.toLowerCase());
    }
    return true;
  });

  const today = new Date();
  const expiringSoon = devices.filter((d) => {
    if (!d.warrantyEnd) return false;
    const end = new Date(d.warrantyEnd);
    const days = (end.getTime() - today.getTime()) / 86400000;
    return days > 0 && days < 90;
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={<Cpu className="size-[18px]" />} label="Toplam Cihaz" value={devices.length} tone="violet" />
        <KpiTile icon={<CheckCircle2 className="size-[18px]" />} label="Sahada" value={counts["Kuruldu"]} tone="emerald" />
        <KpiTile icon={<Truck className="size-[18px]" />} label="Sevkiyatta" value={counts["Sevkiyatta"]} tone="blue" />
        <KpiTile icon={<ShieldCheck className="size-[18px]" />} label="Garanti Bitiyor" value={expiringSoon.length} tone="amber" sub="< 90 gün" />
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="tracking-tight mr-2">Cihazlar</CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="h-8 bg-muted/60">
                <TabsTrigger value="all" className="text-xs">Tümü <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">{devices.length}</span></TabsTrigger>
                {STAGES.map((s) => (
                  <TabsTrigger key={s} value={s} className="text-xs">
                    {s} <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">{counts[s]}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Seri no / model / müşteri..." className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Seri No</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Aşama</TableHead>
                <TableHead>Konum / Müşteri</TableHead>
                <TableHead>Kurulum</TableHead>
                <TableHead>Garanti Sonu</TableHead>
                <TableHead>Cihaz Durumu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => {
                const tone = STAGE_TONE[d.stage];
                const Ic = tone.icon;
                const cust = d.customerId ? customers.find((c) => c.id === d.customerId) : null;
                return (
                  <TableRow key={`${d.source}-${d.refId}`} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                          <Cpu className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm tabular-nums leading-tight truncate">{d.serial}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{d.brand}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{d.model}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${tone.bg} ${tone.text}`}>
                        <Ic className="size-3" /> {d.stage}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {cust ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{cust.name}</span>
                        </div>
                      ) : d.warehouse ? (
                        <div className="flex items-center gap-1.5 min-w-0 text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" />
                          <span className="truncate">{d.warehouse}</span>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{d.installationDate ?? "—"}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {d.warrantyEnd ? (
                        <WarrantyBadge end={d.warrantyEnd} />
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <DeviceStageProgress stage={d.stage} />
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-sm text-muted-foreground">Kayıt bulunamadı.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

/* ---------- helpers ---------- */
const TONES: Record<string, { bg: string; ic: string; ring: string }> = {
  violet: { bg: "bg-brand-blue-soft", ic: "text-brand-blue", ring: "ring-brand-blue/10" },
  emerald: { bg: "bg-success-soft", ic: "text-success", ring: "ring-success/10" },
  amber: { bg: "bg-warning-soft", ic: "text-warning", ring: "ring-warning/10" },
  blue: { bg: "bg-info-soft", ic: "text-info", ring: "ring-info/10" },
};

function KpiTile({ icon, label, value, tone = "violet", sub }: {
  icon: React.ReactNode; label: string; value: number | string; tone?: keyof typeof TONES; sub?: string;
}) {
  const t = TONES[tone];
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-4">
        <div className={`size-9 rounded-lg ${t.bg} ${t.ic} grid place-items-center ring-4 ${t.ring}`}>{icon}</div>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <div className="text-[22px] tabular-nums tracking-tight leading-none">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function WarrantyBadge({ end }: { end: string }) {
  const days = Math.round((new Date(end).getTime() - Date.now()) / 86400000);
  const tone = days < 0 ? "bg-brand-red-soft text-brand-red"
    : days < 90 ? "bg-warning-soft text-warning"
    : "bg-success-soft text-success";
  const label = days < 0 ? "Doldu" : days < 90 ? `${days} gün` : "Aktif";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{end}</span>
      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] ${tone}`}>{label}</span>
    </span>
  );
}

function DeviceStageProgress({ stage }: { stage: Stage }) {
  const idx = STAGES.indexOf(stage);
  return (
    <div className="flex items-center gap-0.5">
      {STAGES.map((s, i) => {
        const reached = i <= idx;
        return (
          <div
            key={s}
            title={s}
            className={`h-1.5 w-5 rounded-full ${reached ? "bg-primary" : "bg-muted"}`}
          />
        );
      })}
    </div>
  );
}
