import { useState, useMemo } from "react";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Search, ChevronRight, Lock, Wrench, Package } from "lucide-react";
import { Product } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { ProductDetailDialog, ProductThumb } from "../dialogs/ProductDetailDialog";

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

/** Read-only banner shown on every price-list view. */
function ReadOnlyNote({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <Lock className="size-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function SearchBox({ q, setQ, placeholder }: { q: string; setQ: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-72 ml-auto">
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
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);

  const machines = useMemo(() => products.filter((p) => p.categoryCode === "TEZGAH"), [products]);
  const filtered = machines.filter((p) => matches(p, q));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ReadOnlyNote text="Fiyat listesi salt-okunur. Tezgaha tıklayarak uyumlu opsiyonel donanımları ve fiyatlarını görebilirsiniz." />
        <SearchBox q={q} setQ={setQ} placeholder="Tezgah, marka, model ara..." />
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
              {filtered.map((p) => (
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
                  <TableCell className="text-right tabular-nums text-emerald-600">{fmtMoney(p.cashPrice, p.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(p.listPrice, p.currency)}</TableCell>
                  <TableCell><ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" /></TableCell>
                </TableRow>
              ))}
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
   SERVİS FİYAT LİSTESİ — sadece yedek parça + işçilik
   ========================================================================= */
export function ServicePriceListPage() {
  const { products } = useStore();
  const [tab, setTab] = useState<"parts" | "labor">("parts");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);

  const spareParts = useMemo(() => products.filter((p) => p.categoryCode === "YEDEK_PARCA"), [products]);
  const labor = useMemo(() => products.filter((p) => p.categoryCode === "ISCILIK"), [products]);

  const list = (tab === "parts" ? spareParts : labor).filter((p) => matches(p, q));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-9 bg-muted/60">
            <TabsTrigger value="parts" className="gap-1.5">
              <Package className="size-3.5" /> Yedek Parça
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-zinc-200 text-zinc-700">{spareParts.length}</span>
            </TabsTrigger>
            <TabsTrigger value="labor" className="gap-1.5">
              <Wrench className="size-3.5" /> İşçilik
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-zinc-200 text-zinc-700">{labor.length}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchBox q={q} setQ={setQ} placeholder={tab === "parts" ? "Parça, marka ara..." : "İşçilik kalemi ara..."} />
      </div>

      <ReadOnlyNote text="Servis fiyat listesi salt-okunur. Yalnızca yedek parça ve işçilik kalemlerini içerir." />

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {tab === "parts" ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[380px]">Yedek Parça</TableHead>
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
                    <TableCell className="text-right tabular-nums text-emerald-600">{fmtMoney(p.cashPrice, p.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(p.listPrice, p.currency)}</TableCell>
                    <TableCell><ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" /></TableCell>
                  </TableRow>
                ))}
                {list.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-16 text-sm text-muted-foreground">Yedek parça bulunamadı.</TableCell></TableRow>
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
                  <TableRow key={p.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 rounded-lg bg-gradient-to-br from-rose-100 to-rose-50 text-rose-600 grid place-items-center shrink-0">
                          <Wrench className="size-4" />
                        </div>
                        <div className="text-sm leading-tight truncate">{p.shortDescription || p.model}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(p.listPrice, p.currency)}</TableCell>
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
          Toplam <b className="text-foreground">{list.length}</b> {tab === "parts" ? "yedek parça" : "işçilik kalemi"}
        </div>
      </Card>

      <ProductDetailDialog product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
