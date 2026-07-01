import { Fragment, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { StatusBadge } from "../../Layout";
import { CreateStockDialog } from "../../dialogs/CreateDialogs";
import { MiniKpi } from "../../shared/MiniKpi";
import { useStore } from "../../../lib/store";
import { toast } from "sonner";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import type { OperationFocus } from "../../../lib/operations";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  STOCK_CATEGORY_CODES,
  STOCK_CATEGORY_LABELS,
  type StockCategoryCode,
} from "@haksan/shared";
import {
  Plus, Search, Package, Clock, CheckCircle2, AlertTriangle, MapPin, MoreHorizontal, Wrench, Bookmark, ChevronDown,
} from "lucide-react";
import { inventoryService } from "../../../../lib/services";

const CATEGORY_ICONS: Record<StockCategoryCode, typeof Package> = {
  TEZGAH: Package,
  OPSIYONEL_DONANIM: Wrench,
  AKSESUAR: Bookmark,
  YEDEK_PARCA: Wrench,
  EVRAK: Bookmark,
  IDARI_MALZEME: Package,
};

const compactSerialPart = (value: string) =>
  value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "MAKINE";

export function StockPage({ focus, initialQuery }: { focus?: OperationFocus; initialQuery?: string }) {
  const { stock, customers, products, updateStockStatus, reserveStock, refresh } = useStore();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "Available" | "Reserved" | "InTransit" | "Sold" | "Inactive">("all");
  const [categoryTab, setCategoryTab] = useState<"all" | StockCategoryCode>("all");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveTarget, setReserveTarget] = useState<(typeof stock)[number] | null>(null);
  const [reserveCompanyId, setReserveCompanyId] = useState("");
  const [reserving, setReserving] = useState(false);
  const [quantityOpen, setQuantityOpen] = useState(false);
  const [quantityProductId, setQuantityProductId] = useState("");
  const [quantityTarget, setQuantityTarget] = useState("");
  const [quantitySaving, setQuantitySaving] = useState(false);

  const scopedStock = useMemo(
    () => stock.filter((s) => categoryTab === "all" || (s.categoryCode ?? "TEZGAH") === categoryTab),
    [stock, categoryTab],
  );

  useEffect(() => {
    if (focus === "reserved") setTab("Reserved");
    if (focus === "available") setTab("Available");
    if (focus === "low") setTab("all");
  }, [focus]);

  useEffect(() => {
    if (initialQuery) setQ(initialQuery);
  }, [initialQuery]);

  const counts = {
    Available: scopedStock.filter((s) => s.status === "Available").length,
    Reserved: scopedStock.filter((s) => s.status === "Reserved").length,
    InTransit: scopedStock.filter((s) => s.status === "InTransit").length,
    Sold: scopedStock.filter((s) => s.status === "Sold").length,
    Inactive: scopedStock.filter((s) => s.status === "Inactive").length,
  };

  const optionsByParent = useMemo(() => {
    const map = new Map<string, typeof stock>();
    for (const item of stock) {
      if (!item.parentInventoryItemId) continue;
      const list = map.get(item.parentInventoryItemId) ?? [];
      list.push(item);
      map.set(item.parentInventoryItemId, list);
    }
    return map;
  }, [stock]);

  const warehouses = Array.from(new Set(scopedStock.map((s) => s.warehouse)))
    .map((w) => ({ name: w, count: scopedStock.filter((s) => s.warehouse === w).length }));

  const brandPie = Array.from(new Set(scopedStock.map((s) => s.brand)))
    .map((b, i) => ({
      name: b,
      value: scopedStock.filter((s) => s.brand === b).length,
      fill: ["#000c69", "#cf060c", "#3b82f6", "#10b981", "#f59e0b"][i % 5],
    }));

  const machineProducts = useMemo(
    () => products.filter((p) => (p.categoryCode ?? "").toLocaleUpperCase("tr-TR") === "TEZGAH"),
    [products],
  );

  const machineRows = useMemo(() => {
    const byProduct = new Map(
      machineProducts.map((p) => [
        p.id,
        {
          product: p,
          available: 0,
          reserved: 0,
          sold: 0,
          inactive: 0,
          total: 0,
          items: [] as typeof stock,
        },
      ]),
    );

    for (const item of stock.filter((s) => (s.categoryCode ?? "TEZGAH") === "TEZGAH")) {
      const productId = item.productId ?? machineProducts.find((p) => p.model === item.counterModel && p.brand === item.brand)?.id;
      if (!productId) continue;
      const existing =
        byProduct.get(productId) ??
        ({
          product: {
            id: productId,
            brand: item.brand,
            model: item.counterModel,
            type: item.counterType,
            categoryCode: "TEZGAH",
          } as (typeof products)[number],
          available: 0,
          reserved: 0,
          sold: 0,
          inactive: 0,
          total: 0,
          items: [] as typeof stock,
        });
      existing.total += 1;
      existing.items.push(item);
      if (item.status === "Available") existing.available += 1;
      if (item.status === "Reserved") existing.reserved += 1;
      if (item.status === "Sold") existing.sold += 1;
      if (item.status === "Inactive") existing.inactive += 1;
      byProduct.set(productId, existing);
    }

    return [...byProduct.values()].sort((a, b) => {
      const stockDiff = b.available + b.reserved - (a.available + a.reserved);
      if (stockDiff !== 0) return stockDiff;
      return `${a.product.brand} ${a.product.model}`.localeCompare(`${b.product.brand} ${b.product.model}`, "tr");
    });
  }, [machineProducts, products, stock]);

  const selectedMachineRow = quantityProductId ? machineRows.find((row) => row.product.id === quantityProductId) : undefined;

  const openQuantityDialog = (productId: string) => {
    const row = machineRows.find((r) => r.product.id === productId);
    setQuantityProductId(productId);
    setQuantityTarget(String(row?.available ?? 0));
    setQuantityOpen(true);
  };

  const saveMachineQuantity = async () => {
    const row = selectedMachineRow;
    if (!row) return;
    const target = Number(quantityTarget);
    if (!Number.isInteger(target) || target < 0 || target > 500) {
      toast.error("Geçerli adet girin", { description: "Adet 0 ile 500 arasında tam sayı olmalı." });
      return;
    }
    setQuantitySaving(true);
    try {
      const currentAvailable = row.items
        .filter((item) => item.status === "Available")
        .sort((a, b) => (a.serialNumber || a.id).localeCompare(b.serialNumber || b.id, "tr"));
      const diff = target - currentAvailable.length;
      if (diff > 0) {
        const stamp = Date.now().toString(36).toUpperCase();
        const prefix = compactSerialPart(row.product.model || row.product.modelName || row.product.shortDescription || row.product.id);
        for (let i = 0; i < diff; i += 1) {
          await inventoryService.create({
            productModelId: row.product.id,
            serialNumber: `AUTO-${prefix}-${stamp}-${String(i + 1).padStart(2, "0")}`,
            controlUnit: row.product.controlPanel || undefined,
            stockStatusCode: "available",
            notes: "Stok adet ayarı ile otomatik oluşturuldu",
          });
        }
      } else if (diff < 0) {
        const excess = currentAvailable.slice(target);
        for (const item of excess) {
          await inventoryService.update(item.id, { stockStatusCode: "damaged", notes: "Stok adet ayarı ile pasife alındı" });
        }
      }
      await refresh();
      toast.success("Stok adedi güncellendi", {
        description: `${row.product.brand} ${row.product.model}: ${currentAvailable.length} → ${target}`,
      });
      setQuantityOpen(false);
    } catch (err: any) {
      toast.error("Stok adedi güncellenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setQuantitySaving(false);
    }
  };

  const displayStock = scopedStock.filter((s) => !s.parentInventoryItemId || categoryTab === "OPSIYONEL_DONANIM");

  const filtered = displayStock.filter((s) => {
    if (focus === "low" && s.status !== "Reserved" && s.status !== "Inactive") return false;
    if (focus !== "low" && tab !== "all" && s.status !== tab) return false;
    return (
      s.serialNumber.toLowerCase().includes(q.toLowerCase()) ||
      s.stockCode.toLowerCase().includes(q.toLowerCase()) ||
      s.counterModel.toLowerCase().includes(q.toLowerCase())
    );
  });

  const stockStatusExportCode: Record<string, string> = {
    Available: 'available',
    Reserved: 'reserved',
    InTransit: 'in_transit',
    Sold: 'sold',
    Inactive: 'damaged',
  };
  const stockExportParams = {
    ...(q ? { search: q } : {}),
    ...(tab !== "all" ? { statusCode: stockStatusExportCode[tab] ?? tab.toLowerCase() } : {}),
    ...(categoryTab !== "all" ? { categoryCode: categoryTab } : {}),
  };

  return (
    <div className="space-y-5">
      <Tabs value={categoryTab} onValueChange={(v) => setCategoryTab(v as typeof categoryTab)}>
        <TabsList className="h-9 bg-muted/60">
          <TabsTrigger value="all" className="text-xs">Tüm Stok</TabsTrigger>
          {STOCK_CATEGORY_CODES.map((code) => {
            const Icon = CATEGORY_ICONS[code];
            return (
            <TabsTrigger key={code} value={code} className="text-xs gap-1">
              <Icon className="size-3.5" />
              {STOCK_CATEGORY_LABELS[code]}
            </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="emerald" icon={<Package className="size-[18px]" />} label="Hazır Stok" value={counts.Available} sub="adet" delta={5} />
        <MiniKpi tone="amber" icon={<Clock className="size-[18px]" />} label="Rezerve" value={counts.Reserved} sub="bekleyen sipariş" delta={2} />
        <MiniKpi tone="violet" icon={<CheckCircle2 className="size-[18px]" />} label="Satılan" value={counts.Sold} sub="bu çeyrek" delta={9} />
        <MiniKpi tone="red" icon={<AlertTriangle className="size-[18px]" />} label="Pasif" value={counts.Inactive} sub="kullanım dışı" delta={0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Depo Bazında Stok</CardTitle>
            <p className="text-xs text-muted-foreground">Toplam {scopedStock.length} kalem</p>
          </CardHeader>
          <CardContent className="h-56 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={warehouses} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Bar dataKey="count" name="Kalem" fill="#000c69" barSize={32} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Marka Dağılımı</CardTitle>
            <p className="text-xs text-muted-foreground">Aktif kalemler</p>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={brandPie} dataKey="value" nameKey="name" outerRadius={70} innerRadius={42} paddingAngle={2} isAnimationActive={false}>
                  {brandPie.map((d) => (
                    <Cell key={`br-${d.name}`} fill={d.fill} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="tracking-tight">Model Bazında Makine Stoku</CardTitle>
            <p className="text-xs text-muted-foreground">Hazır stok adedi model seviyesinde ayarlanır</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={!machineRows.length}
            onClick={() => openQuantityDialog(machineRows[0]?.product.id ?? "")}
          >
            Adet Ayarla
          </Button>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Makine</TableHead>
                <TableHead className="text-right">Hazır</TableHead>
                <TableHead className="text-right">Rezerve</TableHead>
                <TableHead className="text-right">Satılan</TableHead>
                <TableHead className="text-right">Pasif</TableHead>
                <TableHead className="text-right">Toplam</TableHead>
                <TableHead className="w-28 text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {machineRows.slice(0, 12).map((row) => (
                <TableRow key={row.product.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{[row.product.brand, row.product.model].filter(Boolean).join(" ") || row.product.shortDescription}</div>
                    <div className="text-[11px] text-muted-foreground">{row.product.type || row.product.modelName || "Tezgah"}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.available}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-700">{row.reserved}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{row.sold}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{row.inactive}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => openQuantityDialog(row.product.id)}>
                      Ayarla
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {machineRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Makine kataloğu veya stok kaydı yok.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="tracking-tight mr-2">Stok Kalemleri</CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="h-8 bg-muted/60">
                <TabsTrigger value="all" className="text-xs">Tümü</TabsTrigger>
                <TabsTrigger value="Available" className="text-xs">Hazır</TabsTrigger>
                <TabsTrigger value="Reserved" className="text-xs">Rezerve</TabsTrigger>
                <TabsTrigger value="InTransit" className="text-xs">Yolda</TabsTrigger>
                <TabsTrigger value="Sold" className="text-xs">Satılan</TabsTrigger>
                <TabsTrigger value="Inactive" className="text-xs">Pasif</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Seri / kod / model..." className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ExportExcelButton path="/exports/inventory" filename="stok.xlsx" params={stockExportParams} className="h-9" />
            <CreateStockDialog
              trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Stok</Button>}
            />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Kategori</TableHead>
                <TableHead>Stok</TableHead>
                <TableHead>Marka</TableHead>
                <TableHead>Tip / Model</TableHead>
                <TableHead>Seri No</TableHead>
                <TableHead>Kontrol Paneli</TableHead>
                <TableHead>Depo</TableHead>
                <TableHead>Rezerve Firma</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const linkedOptions = optionsByParent.get(s.id) ?? [];
                const isExpanded = Boolean(expandedRows[s.id]);
                return (
                <Fragment key={s.id}>
                <TableRow className="group">
                  <TableCell className="text-xs text-muted-foreground">
                    {s.category ?? STOCK_CATEGORY_LABELS[(s.categoryCode ?? "TEZGAH") as StockCategoryCode]}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      {linkedOptions.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          onClick={() => setExpandedRows((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                          aria-label="Opsiyonel donanımları göster"
                        >
                          <ChevronDown className={`size-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                        </Button>
                      )}
                      <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                        <Package className="size-4" />
                      </div>
                      <div className="text-sm">{s.stockCode}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{s.brand}</TableCell>
                  <TableCell className="text-sm">{s.counterType} · {s.counterModel}</TableCell>
                  <TableCell className="text-sm tabular-nums">{s.serialNumber}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.controlPanel}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-muted text-foreground/70">
                      <MapPin className="size-3" />{s.warehouse}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                    {s.status === "Reserved" ? (s.reservedCompanyName ?? "—") : "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100 sm:opacity-100" aria-label="Durum değiştir">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {s.status === "Available" && (s.categoryCode ?? "TEZGAH") === "TEZGAH" && (
                          <DropdownMenuItem
                            onClick={() => {
                              setReserveTarget(s);
                              setReserveCompanyId("");
                              setReserveOpen(true);
                            }}
                          >
                            Firmaya rezerve et
                          </DropdownMenuItem>
                        )}
                        {s.status === "Reserved" && (
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                await updateStockStatus(s.id, "Available");
                                toast.success("Rezervasyon kaldırıldı");
                              } catch (err: any) {
                                toast.error("İşlem başarısız", { description: err?.message });
                              }
                            }}
                          >
                            Rezervasyonu kaldır
                          </DropdownMenuItem>
                        )}
                        {(["Available", "Inactive"] as const).map((st) => (
                          <DropdownMenuItem
                            key={st}
                            disabled={s.status === st || (st === "Available" && s.status === "Sold")}
                            onClick={async () => {
                              try {
                                await updateStockStatus(s.id, st);
                                toast.success("Durum güncellendi", { description: `${s.stockCode} → ${st}` });
                              } catch (err: any) {
                                toast.error("Durum güncellenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
                              }
                            }}
                          >
                            {st === "Available" ? "Hazır" : "Pasif"} olarak işaretle
                          </DropdownMenuItem>
                        ))}
                        {s.status === "Sold" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                              Satıldı — yalnızca fatura ile
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                {isExpanded && linkedOptions.length > 0 && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell />
                    <TableCell colSpan={9} className="py-3">
                      <div className="flex flex-wrap gap-2">
                        {linkedOptions.map((item) => (
                          <span key={item.id} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-white px-2 py-1 text-xs">
                            <Wrench className="size-3.5 text-muted-foreground" />
                            {item.brand} {item.counterModel} · {item.serialNumber}
                            <StatusBadge status={item.status} />
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-sm text-muted-foreground">Kayıt bulunamadı.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={reserveOpen} onOpenChange={setReserveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tezgah Rezervasyonu</DialogTitle>
            <DialogDescription>
              {reserveTarget ? `${reserveTarget.serialNumber} — hangi firmaya rezerve edilecek?` : "Firma seçin"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Firma *</Label>
              <Select value={reserveCompanyId} onValueChange={setReserveCompanyId}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Firma seçin" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReserveOpen(false)}>Vazgeç</Button>
            <Button
              disabled={!reserveCompanyId || !reserveTarget || reserving}
              onClick={async () => {
                if (!reserveTarget || !reserveCompanyId) return;
                setReserving(true);
                try {
                  await reserveStock(reserveTarget.id, reserveCompanyId);
                  toast.success("Rezerve edildi", { description: reserveTarget.serialNumber });
                  setReserveOpen(false);
                } catch (err: any) {
                  toast.error("Rezervasyon başarısız", { description: err?.message });
                } finally {
                  setReserving(false);
                }
              }}
            >
              {reserving ? "Kaydediliyor…" : "Rezerve Et"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quantityOpen} onOpenChange={setQuantityOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Makine Stok Adedi</DialogTitle>
            <DialogDescription>Modelin hazır stok adedini güncelleyin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Makine modeli</Label>
              <Select
                value={quantityProductId}
                onValueChange={(value) => {
                  const row = machineRows.find((r) => r.product.id === value);
                  setQuantityProductId(value);
                  setQuantityTarget(String(row?.available ?? 0));
                }}
              >
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Makine seçin" /></SelectTrigger>
                <SelectContent>
                  {machineRows.map((row) => (
                    <SelectItem key={row.product.id} value={row.product.id}>
                      {[row.product.brand, row.product.model].filter(Boolean).join(" ") || row.product.shortDescription || row.product.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedMachineRow && (
              <div className="grid grid-cols-4 gap-2 rounded-md border border-border/70 bg-muted/30 p-3 text-center text-xs">
                <div><div className="text-muted-foreground">Hazır</div><div className="mt-1 font-medium tabular-nums">{selectedMachineRow.available}</div></div>
                <div><div className="text-muted-foreground">Rezerve</div><div className="mt-1 font-medium tabular-nums">{selectedMachineRow.reserved}</div></div>
                <div><div className="text-muted-foreground">Satılan</div><div className="mt-1 font-medium tabular-nums">{selectedMachineRow.sold}</div></div>
                <div><div className="text-muted-foreground">Pasif</div><div className="mt-1 font-medium tabular-nums">{selectedMachineRow.inactive}</div></div>
              </div>
            )}
            <div>
              <Label className="text-xs">Hedef hazır stok adedi</Label>
              <Input
                className="mt-1 h-9"
                type="number"
                min={0}
                max={500}
                step={1}
                value={quantityTarget}
                onChange={(event) => setQuantityTarget(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuantityOpen(false)} disabled={quantitySaving}>Vazgeç</Button>
            <Button onClick={() => void saveMachineQuantity()} disabled={!selectedMachineRow || quantitySaving}>
              {quantitySaving ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
