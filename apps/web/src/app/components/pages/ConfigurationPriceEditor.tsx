import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Percent, Save } from "lucide-react";
import { productService } from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";

type CurrencyCode = "USD" | "EUR" | "TRY";
export type PriceDraft = { salePrice: string; currency: CurrencyCode };
/** Fiyatı düzenlenen her satırın ortak alanları; maliyet yalnız yetkiliye gelir. */
export type PricedRow = { id: string; salePrice: number | null; saleCurrencyCode: string | null; costPrice?: number | null; costCurrencyCode?: string | null };
type PricedList<T extends PricedRow> = { canViewCost: boolean; rows: T[] };
type SaleUpdate = Array<{ id: string; salePrice: number | null; saleCurrencyCode: CurrencyCode }>;

const CURRENCIES: CurrencyCode[] = ["USD", "EUR", "TRY"];
const asCurrency = (code: string | null | undefined): CurrencyCode => (CURRENCIES.includes(code as CurrencyCode) ? (code as CurrencyCode) : "USD");
/** "30.000,50" (TR), "30.000" (binlik) ve "30000.5" yazımlarını ayırt eder; boş = fiyat yok. */
export const parsePrice = (value: string) => {
  const raw = value.trim().replace(/\s/g, "");
  if (!raw) return null;
  const text = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
};

/**
 * Alış maliyetine kâr oranı uygular: satış = maliyet × (1 + oran/100), tam birime yuvarlanır.
 * Maliyeti olmayan satır atlanır; `onlyEmpty` ile fiyatı girilmiş satırlara dokunulmaz.
 */
export function applyMarkup(rows: PricedRow[], drafts: Record<string, PriceDraft>, percent: number, onlyEmpty: boolean): Record<string, PriceDraft> {
  const next = { ...drafts };
  for (const row of rows) {
    if (row.costPrice == null) continue;
    const current = next[row.id]?.salePrice ?? (row.salePrice == null ? "" : String(row.salePrice));
    if (onlyEmpty && current.trim()) continue;
    next[row.id] = { salePrice: String(Math.round(row.costPrice * (1 + percent / 100))), currency: asCurrency(row.costCurrencyCode) };
  }
  return next;
}

type Column<T> = { header: string; cell: (row: T) => ReactNode; className?: string };

/** Satış fiyatı tablosu: filtre, arama, maliyete kâr oranı uygulama ve toplu kaydetme. */
function PriceRowsEditor<T extends PricedRow>(props: {
  eyebrow: string; title: string; description: string;
  load: () => Promise<PricedList<T>>; save: (rows: SaleUpdate) => Promise<unknown>;
  filterLabel: string; filterOf: (row: T) => string; filterOptionLabel?: (value: string) => string;
  searchPlaceholder: string; searchText: (row: T) => string; rowLabel: (row: T) => string;
  leading: Column<T>[]; trailing?: Column<T>[];
}) {
  const { hasPermission, hasRole } = useAuth();
  const canEdit = hasRole("super_admin") || hasPermission("price_lists.update");
  const [list, setList] = useState<PricedList<T> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [percent, setPercent] = useState("25");
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => props.load().then(setList).catch(() => setList({ canViewCost: false, rows: [] }));
  useEffect(() => { void load(); }, []);

  const rows = list?.rows ?? [];
  const filterOptions = useMemo(() => [...new Set(rows.map(props.filterOf))].filter(Boolean).sort((a, b) => a.localeCompare(b, "tr")), [rows]);
  const visible = rows.filter((row) => (!filter || props.filterOf(row) === filter)
    && (!query.trim() || props.searchText(row).toLocaleLowerCase("tr-TR").includes(query.trim().toLocaleLowerCase("tr-TR"))));
  const dirty = Object.entries(drafts).filter(([id, draft]) => {
    const row = rows.find((entry) => entry.id === id);
    return row && (parsePrice(draft.salePrice) !== row.salePrice || (draft.salePrice.trim() && draft.currency !== asCurrency(row.saleCurrencyCode)));
  });
  const invalid = dirty.some(([, draft]) => parsePrice(draft.salePrice) === undefined);

  if (!list || !rows.length) return null;

  const save = async () => {
    setSaving(true);
    try {
      await props.save(dirty.map(([id, draft]) => ({ id, salePrice: parsePrice(draft.salePrice) ?? null, saleCurrencyCode: draft.currency })));
      toast.success(`${dirty.length} satış fiyatı kaydedildi`);
      setDrafts({});
      await load();
    } catch (error: any) {
      toast.error("Satış fiyatları kaydedilemedi", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };
  const markup = () => {
    const value = Number(percent.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > 1000) return toast.error("Kâr oranı 0 ile 1000 arasında olmalı");
    const next = applyMarkup(visible, drafts, value, onlyEmpty);
    const changed = visible.filter((row) => next[row.id] !== drafts[row.id]).length;
    setDrafts(next);
    toast.message(changed ? `${changed} satıra %${value} kâr uygulandı; kaydetmeyi unutmayın.` : "Uygulanacak satır yok (maliyeti olmayan veya fiyatı girilmiş satırlar atlandı).");
  };
  const th = "px-3 py-2 font-semibold";

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 p-4">
        <div>
          <p className="ui-eyebrow text-primary">{props.eyebrow}</p>
          <h3 className="mt-1 font-display text-lg font-semibold">{props.title}</h3>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{props.description}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">{props.filterLabel}
            <select className="h-9 max-w-56 rounded-md border bg-card px-2 text-sm text-foreground" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="">Tümü</option>
              {filterOptions.map((value) => <option key={value} value={value}>{props.filterOptionLabel?.(value) ?? value}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Ara
            <Input className="h-9 w-40" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={props.searchPlaceholder} />
          </label>
        </div>
      </div>

      {canEdit && list.canViewCost && (
        <div className="flex flex-wrap items-end gap-3 border-b border-border/60 bg-muted/20 p-4 text-xs">
          <label className="flex flex-col gap-1 text-muted-foreground">Kâr oranı (%)
            <Input className="h-9 w-24" inputMode="decimal" value={percent} onChange={(event) => setPercent(event.target.value)} aria-label={`${props.title} kâr oranı yüzde`} />
          </label>
          <label className="flex h-9 items-center gap-2 text-foreground">
            <input type="checkbox" checked={onlyEmpty} onChange={(event) => setOnlyEmpty(event.target.checked)} />
            Yalnız satış fiyatı boş olanlar
          </label>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={markup}>
            <Percent className="size-3.5" /> Görünen {visible.length} satıra uygula
          </Button>
          <span className="text-muted-foreground">Satış = alış maliyeti × (1 + oran), tam birime yuvarlanır.</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground">
            <tr className="text-left">
              {props.leading.map((column) => <th key={column.header} scope="col" className={`${th} ${column.className ?? ""}`}>{column.header}</th>)}
              {list.canViewCost && <th scope="col" className={`${th} text-right`}>Alış maliyeti</th>}
              <th scope="col" className={`${th} text-right`}>Satış fiyatı</th>
              {list.canViewCost && <th scope="col" className={`${th} text-right`}>Kâr</th>}
              {props.trailing?.map((column) => <th key={column.header} scope="col" className={`${th} ${column.className ?? ""}`}>{column.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const draft = drafts[row.id] ?? { salePrice: row.salePrice == null ? "" : String(row.salePrice), currency: asCurrency(row.saleCurrencyCode ?? row.costCurrencyCode) };
              const sale = parsePrice(draft.salePrice);
              const margin = row.costPrice && sale != null && draft.currency === row.costCurrencyCode ? ((sale - row.costPrice) / row.costPrice) * 100 : null;
              const label = props.rowLabel(row);
              return (
                <tr key={row.id} className="border-t border-border/60">
                  {props.leading.map((column) => <td key={column.header} className={`px-3 py-1.5 ${column.className ?? ""}`}>{column.cell(row)}</td>)}
                  {list.canViewCost && <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.costPrice == null ? "—" : `${row.costPrice.toLocaleString("tr-TR")} ${row.costCurrencyCode ?? ""}`}</td>}
                  <td className="px-3 py-1.5">
                    {canEdit ? (
                      <div className="flex justify-end gap-1">
                        <Input className={`h-8 w-28 text-right tabular-nums ${sale === undefined ? "border-destructive" : ""}`} inputMode="decimal" aria-label={`${label} satış fiyatı`} placeholder="—"
                          value={draft.salePrice} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, salePrice: event.target.value } }))} />
                        <select className="h-8 rounded-md border bg-card px-1 text-xs" aria-label={`${label} para birimi`} value={draft.currency}
                          onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, currency: event.target.value as CurrencyCode } }))}>
                          {CURRENCIES.map((code) => <option key={code}>{code}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div className="text-right tabular-nums">{row.salePrice == null ? "—" : `${row.salePrice.toLocaleString("tr-TR")} ${row.saleCurrencyCode ?? ""}`}</div>
                    )}
                  </td>
                  {list.canViewCost && <td className={`px-3 py-1.5 text-right tabular-nums ${margin != null && margin < 0 ? "text-destructive" : "text-muted-foreground"}`}>{margin == null ? "—" : `%${margin.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`}</td>}
                  {props.trailing?.map((column) => <td key={column.header} className={`px-3 py-1.5 ${column.className ?? ""}`}>{column.cell(row)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span><b className="text-foreground">{visible.length}</b> / {rows.length} satır · {rows.filter((row) => row.salePrice != null).length} satırın satış fiyatı girilmiş</span>
        {canEdit && (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={!dirty.length || saving} onClick={() => setDrafts({})}>Vazgeç</Button>
            <Button type="button" size="sm" className="gap-1.5" disabled={!dirty.length || invalid || saving} onClick={() => void save()}>
              <Save className="size-3.5" /> {saving ? "Kaydediliyor…" : `Değişiklikleri kaydet (${dirty.length})`}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

type MatrixRow = Awaited<ReturnType<typeof productService.listAllConfigurationPrices>>["rows"][number];
type CostRow = Awaited<ReturnType<typeof productService.listCostPricedItems>>["rows"][number];

/** Fiyat Listeleri: baz kartların model × güç satırlarına satış fiyatı. */
export function ConfigurationPriceEditor() {
  return (
    <PriceRowsEditor<MatrixRow>
      eyebrow="Lazer baz kartları"
      title="Model × güç satış fiyatları"
      description="Teklifte model ve güç seçilince birim fiyat buradaki satış fiyatından gelir. Fiyatı boş satırlar teklifte elle fiyatlanır."
      load={productService.listAllConfigurationPrices}
      save={productService.updateConfigurationPrices}
      filterLabel="Seri" filterOf={(row) => row.series ?? ""} filterOptionLabel={(value) => `${value} Serisi`}
      searchPlaceholder="F-3015" searchText={(row) => `${row.sourceModelCode} ${row.baseName}`}
      rowLabel={(row) => `${row.sourceModelCode} ${row.powerKw} kW`}
      leading={[
        { header: "Seri", cell: (row) => row.series ?? "—", className: "text-muted-foreground" },
        { header: "Model", cell: (row) => row.sourceModelCode, className: "font-medium" },
        { header: "Güç", cell: (row) => `${row.powerKw.toLocaleString("tr-TR")} kW`, className: "tabular-nums" },
      ]}
      trailing={[{ header: "Üretim", cell: (row) => (row.leadTimeDays == null ? "—" : `${row.leadTimeDays} gün`), className: "text-right tabular-nums text-muted-foreground" }]}
    />
  );
}

/** Fiyat Listeleri: lazer aksesuar kartları ve baz kart opsiyonları (pah kesim, yükleme…). */
export function CostPricedItemsEditor() {
  return (
    <PriceRowsEditor<CostRow>
      eyebrow="Lazer aksesuar ve opsiyonları"
      title="Aksesuar ve opsiyon satış fiyatları"
      description="Aksesuarın satış fiyatı ürün kartının liste fiyatına, opsiyonunki baz kartta teklife eklenen ek fiyata yazılır. Fiyatı girilmemiş opsiyon teklifte seçilemez."
      load={productService.listCostPricedItems}
      save={productService.updateCostPricedSales}
      filterLabel="Grup" filterOf={(row) => row.group}
      searchPlaceholder="Kompresör, TG-6020" searchText={(row) => `${row.group} ${row.name}`}
      rowLabel={(row) => row.name}
      leading={[
        { header: "Grup", cell: (row) => row.group, className: "text-muted-foreground" },
        { header: "Ad", cell: (row) => row.name, className: "font-medium" },
      ]}
    />
  );
}
