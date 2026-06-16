import { useEffect, useMemo, useState } from "react";
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
  Plus, Search, Package, Clock, CheckCircle2, AlertTriangle, MapPin, MoreHorizontal, Wrench, Bookmark,
} from "lucide-react";

const CATEGORY_ICONS: Record<StockCategoryCode, typeof Package> = {
  TEZGAH: Package,
  AKSESUAR: Bookmark,
  YEDEK_PARCA: Wrench,
};

export function StockPage({ focus, initialQuery }: { focus?: OperationFocus; initialQuery?: string }) {
  const { stock, customers, updateStockStatus, reserveStock } = useStore();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "Available" | "Reserved" | "Sold" | "Inactive">("all");
  const [categoryTab, setCategoryTab] = useState<"all" | StockCategoryCode>("all");
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveTarget, setReserveTarget] = useState<(typeof stock)[number] | null>(null);
  const [reserveCompanyId, setReserveCompanyId] = useState("");
  const [reserving, setReserving] = useState(false);

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
    Sold: scopedStock.filter((s) => s.status === "Sold").length,
    Inactive: scopedStock.filter((s) => s.status === "Inactive").length,
  };

  const warehouses = Array.from(new Set(scopedStock.map((s) => s.warehouse)))
    .map((w) => ({ name: w, count: scopedStock.filter((s) => s.warehouse === w).length }));

  const brandPie = Array.from(new Set(scopedStock.map((s) => s.brand)))
    .map((b, i) => ({
      name: b,
      value: scopedStock.filter((s) => s.brand === b).length,
      fill: ["#000c69", "#cf060c", "#3b82f6", "#10b981", "#f59e0b"][i % 5],
    }));

  const filtered = scopedStock.filter((s) => {
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
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="tracking-tight mr-2">Stok Kalemleri</CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="h-8 bg-muted/60">
                <TabsTrigger value="all" className="text-xs">Tümü</TabsTrigger>
                <TabsTrigger value="Available" className="text-xs">Hazır</TabsTrigger>
                <TabsTrigger value="Reserved" className="text-xs">Rezerve</TabsTrigger>
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
              {filtered.map((s) => (
                <TableRow key={s.id} className="group">
                  <TableCell className="text-xs text-muted-foreground">
                    {s.category ?? STOCK_CATEGORY_LABELS[(s.categoryCode ?? "TEZGAH") as StockCategoryCode]}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
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
              ))}
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
    </div>
  );
}
