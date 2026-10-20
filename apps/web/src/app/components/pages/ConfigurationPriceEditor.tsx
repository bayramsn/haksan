import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Percent, Save } from "lucide-react";
import { productService } from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";

type Matrix = Awaited<ReturnType<typeof productService.listAllConfigurationPrices>>;
type Row = Matrix["rows"][number];
type CurrencyCode = "USD" | "EUR" | "TRY";
export type PriceDraft = { salePrice: string; currency: CurrencyCode };

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
export function applyMarkup(rows: Row[], drafts: Record<string, PriceDraft>, percent: number, onlyEmpty: boolean): Record<string, PriceDraft> {
  const next = { ...drafts };
  for (const row of rows) {
    if (row.costPrice == null) continue;
    const current = next[row.id]?.salePrice ?? (row.salePrice == null ? "" : String(row.salePrice));
    if (onlyEmpty && current.trim()) continue;
    next[row.id] = { salePrice: String(Math.round(row.costPrice * (1 + percent / 100))), currency: asCurrency(row.costCurrencyCode) };
  }
  return next;
}

/** Fiyat Listeleri: baz kartların model × güç satırlarına satış fiyatı. */
export function ConfigurationPriceEditor() {
  const { hasPermission, hasRole } = useAuth();
  const canEdit = hasRole("super_admin") || hasPermission("price_lists.update");
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [series, setSeries] = useState("");
  const [query, setQuery] = useState("");
  const [percent, setPercent] = useState("25");
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => productService.listAllConfigurationPrices().then(setMatrix).catch(() => setMatrix({ canViewCost: false, rows: [] }));
  useEffect(() => { void load(); }, []);

  const rows = matrix?.rows ?? [];
  const seriesOptions = useMemo(() => [...new Set(rows.map((row) => row.series ?? ""))].filter(Boolean).sort(), [rows]);
  const visible = rows.filter((row) => (!series || row.series === series)
    && (!query.trim() || `${row.sourceModelCode} ${row.baseName}`.toLocaleLowerCase("tr-TR").includes(query.trim().toLocaleLowerCase("tr-TR"))));
  const dirty = Object.entries(drafts).filter(([id, draft]) => {
    const row = rows.find((entry) => entry.id === id);
    return row && (parsePrice(draft.salePrice) !== row.salePrice || (draft.salePrice.trim() && draft.currency !== asCurrency(row.saleCurrencyCode)));
  });
  const invalid = dirty.some(([, draft]) => parsePrice(draft.salePrice) === undefined);

  if (!matrix || !rows.length) return null;

  const save = async () => {
    setSaving(true);
    try {
      await productService.updateConfigurationPrices(dirty.map(([id, draft]) => ({ id, salePrice: parsePrice(draft.salePrice) ?? null, saleCurrencyCode: draft.currency })));
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

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 p-4">
        <div>
          <p className="ui-eyebrow text-primary">Lazer baz kartları</p>
          <h3 className="mt-1 font-display text-lg font-semibold">Model × güç satış fiyatları</h3>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">Teklifte model ve güç seçilince birim fiyat buradaki satış fiyatından gelir. Fiyatı boş satırlar teklifte elle fiyatlanır.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Seri
            <select className="h-9 rounded-md border bg-card px-2 text-sm text-foreground" value={series} onChange={(event) => setSeries(event.target.value)}>
              <option value="">Tümü</option>
              {seriesOptions.map((code) => <option key={code} value={code}>{code} Serisi</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Model ara
            <Input className="h-9 w-40" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="F-3015" />
          </label>
        </div>
      </div>

      {canEdit && matrix.canViewCost && (
        <div className="flex flex-wrap items-end gap-3 border-b border-border/60 bg-muted/20 p-4 text-xs">
          <label className="flex flex-col gap-1 text-muted-foreground">Kâr oranı (%)
            <Input className="h-9 w-24" inputMode="decimal" value={percent} onChange={(event) => setPercent(event.target.value)} aria-label="Kâr oranı yüzde" />
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
              <th scope="col" className="px-3 py-2 font-semibold">Seri</th>
              <th scope="col" className="px-3 py-2 font-semibold">Model</th>
              <th scope="col" className="px-3 py-2 font-semibold">Güç</th>
              {matrix.canViewCost && <th scope="col" className="px-3 py-2 text-right font-semibold">Alış maliyeti</th>}
              <th scope="col" className="px-3 py-2 text-right font-semibold">Satış fiyatı</th>
              {matrix.canViewCost && <th scope="col" className="px-3 py-2 text-right font-semibold">Kâr</th>}
              <th scope="col" className="px-3 py-2 text-right font-semibold">Üretim</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const draft = drafts[row.id] ?? { salePrice: row.salePrice == null ? "" : String(row.salePrice), currency: asCurrency(row.saleCurrencyCode ?? row.costCurrencyCode) };
              const sale = parsePrice(draft.salePrice);
              const margin = row.costPrice && sale != null && draft.currency === row.costCurrencyCode ? ((sale - row.costPrice) / row.costPrice) * 100 : null;
              const label = `${row.sourceModelCode} ${row.powerKw} kW`;
              return (
                <tr key={row.id} className="border-t border-border/60">
                  <td className="px-3 py-1.5 text-muted-foreground">{row.series ?? "—"}</td>
                  <td className="px-3 py-1.5 font-medium">{row.sourceModelCode}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.powerKw.toLocaleString("tr-TR")} kW</td>
                  {matrix.canViewCost && <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.costPrice == null ? "—" : `${row.costPrice.toLocaleString("tr-TR")} ${row.costCurrencyCode ?? ""}`}</td>}
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
                  {matrix.canViewCost && <td className={`px-3 py-1.5 text-right tabular-nums ${margin != null && margin < 0 ? "text-destructive" : "text-muted-foreground"}`}>{margin == null ? "—" : `%${margin.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`}</td>}
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.leadTimeDays == null ? "—" : `${row.leadTimeDays} gün`}</td>
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
