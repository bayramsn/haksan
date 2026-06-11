import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import { stockItems, machines, customers, type Product } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { ProductDialog } from "../dialogs/CreateDialogs";
import { ProductImportDialog } from "../dialogs/ProductImportDialog";
import { ProductDetailDialog, ProductThumb } from "../dialogs/ProductDetailDialog";
import {
  Cpu, Search, Package, CheckCircle2, Truck, Wrench, Building2,
  ShieldCheck, AlertTriangle, Clock, MapPin, ChevronRight,
  Plus, Upload,
} from "lucide-react";

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
  "Stokta": { bg: "bg-emerald-50", text: "text-emerald-700", icon: Package },
  "Rezerve": { bg: "bg-amber-50", text: "text-amber-700", icon: Clock },
  "Sevkiyatta": { bg: "bg-blue-50", text: "text-blue-700", icon: Truck },
  "Kuruldu": { bg: "bg-brand-blue-soft", text: "text-brand-blue", icon: CheckCircle2 },
  "Servis": { bg: "bg-orange-50", text: "text-orange-700", icon: Wrench },
  "Hizmet Dışı": { bg: "bg-zinc-100", text: "text-zinc-600", icon: AlertTriangle },
};

function buildDevices(): Device[] {
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

/* =========================================================================
   ÜRÜNLER (Products) — flat list like the company list, click → detail popup
   ========================================================================= */
export function ProductsPage() {
  const { products } = useStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [selected, setSelected] = useState<Product | null>(null);

  const categoryLabel = (p: Product) => p.category || p.productGroup || "Genel";
  const productSubtitle = (p: Product) => [p.type, p.subcategory].filter(Boolean).join(" · ");
  const categories = useMemo(
    () => Array.from(new Set(products.map(categoryLabel))).filter(Boolean),
    [products]
  );

  const filtered = products.filter((p) => {
    if (cat !== "all" && categoryLabel(p) !== cat) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return [p.model, p.brand, p.type, p.shortDescription, p.stockCode, p.category].some(
      (v) => (v ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={cat} onValueChange={setCat}>
          <TabsList className="h-9 bg-muted/60 flex-wrap">
            <TabsTrigger value="all" className="gap-1.5">
              Tümü <CountBadge n={products.length} />
            </TabsTrigger>
            {categories.map((c) => (
              <TabsTrigger key={c} value={c} className="gap-1.5">
                {c} <CountBadge n={products.filter((p) => categoryLabel(p) === c).length} />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 ml-auto">
          <div className="relative w-64">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Marka, model, ürün ara..."
              className="pl-9 h-9 bg-white"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ProductImportDialog
            trigger={<Button size="sm" variant="outline" className="h-9 gap-1"><Upload className="size-4" /> İçe Aktar</Button>}
          />
          <ProductDialog
            trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Ürün</Button>}
          />
        </div>
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[360px]">Ürün</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Liste Fiyatı</TableHead>
                <TableHead className="text-right">Peşin</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="cursor-pointer group" onClick={() => setSelected(p)}>
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
                  <TableCell className="text-sm text-muted-foreground">{p.type || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] h-5">{categoryLabel(p)}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(p.listPrice, p.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600">{fmtMoney(p.cashPrice, p.currency)}</TableCell>
                  <TableCell>
                    <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-sm text-muted-foreground">
                    Bu filtreye uyan ürün bulunamadı.
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
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-zinc-200 text-zinc-700">
      {n}
    </span>
  );
}

/* =========================================================================
   CİHAZ TAKİBİ (Device tracking) — per-serial lifecycle
   ========================================================================= */
const STAGES: Stage[] = ["Stokta", "Rezerve", "Sevkiyatta", "Kuruldu", "Servis", "Hizmet Dışı"];

export function DeviceTrackingPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Stage | "all">("all");
  const devices = useMemo(buildDevices, []);

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
          <div className="relative w-64">
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
                <TableHead>Yaşam Döngüsü</TableHead>
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
                      <Lifecycle stage={d.stage} />
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
  violet: { bg: "bg-brand-blue-soft", ic: "text-brand-blue", ring: "ring-blue-100" },
  emerald: { bg: "bg-emerald-50", ic: "text-emerald-600", ring: "ring-emerald-100" },
  amber: { bg: "bg-amber-50", ic: "text-amber-600", ring: "ring-amber-100" },
  blue: { bg: "bg-blue-50", ic: "text-blue-600", ring: "ring-blue-100" },
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
  const tone = days < 0 ? "bg-red-50 text-red-700"
    : days < 90 ? "bg-amber-50 text-amber-700"
    : "bg-emerald-50 text-emerald-700";
  const label = days < 0 ? "Doldu" : days < 90 ? `${days} gün` : "Aktif";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{end}</span>
      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] ${tone}`}>{label}</span>
    </span>
  );
}

function Lifecycle({ stage }: { stage: Stage }) {
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
