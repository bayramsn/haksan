import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Calculator, Download, Save } from "lucide-react";
import type { LaserCostFormula, LaserPriceListCode } from "@haksan/shared";
import { productService } from "../../../lib/services";
import { downloadExport } from "../../../lib/downloadExport";
import { useAuth } from "../../../lib/auth";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { parsePrice } from "./ConfigurationPriceEditor";

type Lists = Awaited<ReturnType<typeof productService.laserPriceLists>>;
type Preview = Awaited<ReturnType<typeof productService.recalculateLaserPriceList>>;
type FormulaKey = keyof LaserCostFormula;

/** Oranlar formülde ondalık (0,25), ekranda yüzde (25) tutulur. */
export const FORMULA_FIELDS: Array<{ key: FormulaKey; label: string; percent?: boolean }> = [
  { key: "appearanceUsd", label: "HEX görünüm (USD)" },
  { key: "freight20Usd", label: "20' konteyner (USD)" },
  { key: "freight40Usd", label: "40' konteyner (USD)" },
  { key: "dutyRate", label: "Gümrük vergisi (%)", percent: true },
  { key: "fixedUsd", label: "Sabit giderler (USD)" },
  { key: "listMarkup", label: "Liste kârı (%)", percent: true },
  { key: "cashMarkup", label: "Son fiyat kârı (%)", percent: true },
];
export const formulaToDraft = (formula: LaserCostFormula) =>
  Object.fromEntries(FORMULA_FIELDS.map(({ key, percent }) => [key, String(percent ? Math.round(formula[key] * 10000) / 100 : formula[key])])) as Record<FormulaKey, string>;
export const draftToFormula = (draft: Record<FormulaKey, string>): LaserCostFormula | null => {
  const entries = FORMULA_FIELDS.map(({ key, percent }) => {
    const value = parsePrice(draft[key] ?? "");
    return [key, value == null ? null : percent ? value / 100 : value] as const;
  });
  return entries.some(([, value]) => value == null) ? null : (Object.fromEntries(entries) as LaserCostFormula);
};

const usd = (value: number | null | undefined) => (value == null ? "—" : `${value.toLocaleString("tr-TR")} USD`);

/**
 * Fiber lazer kesim makinesi CIF / millileştirilmiş fiyat listeleri. Herkes liste ve son
 * fiyatı görür; maliyet, formül ve yeniden hesaplama yalnız `product_costs.view` sahibine.
 */
export function LaserPriceLists() {
  const { hasPermission, hasRole } = useAuth();
  const canEdit = hasRole("super_admin") || hasPermission("price_lists.update");
  const [data, setData] = useState<Lists | null>(null);
  const [code, setCode] = useState<LaserPriceListCode>("LAZER-CIF-IST");
  const [draft, setDraft] = useState<Record<FormulaKey, string> | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [series, setSeries] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => productService.laserPriceLists().then(setData).catch(() => setData(null));
  useEffect(() => { void load(); }, []);
  const list = data?.lists.find((entry) => entry.code === code);
  useEffect(() => { setPreview(null); setDraft(list?.formula ? formulaToDraft(list.formula) : null); }, [code, data]);

  const seriesOptions = useMemo(() => [...new Set(list?.rows.map((row) => row.productName))].sort((a, b) => a.localeCompare(b, "tr")), [list]);
  if (!data || !list || !list.rows.length) return null;

  const previewById = new Map(preview?.rows.map((row) => [row.configurationPriceId, row]));
  const rows = list.rows.filter((row) => !series || row.productName === series);
  const priced = list.rows.filter((row) => row.listPrice != null).length;
  const formula = draft && draftToFormula(draft);

  const run = async (apply: boolean) => {
    if (!formula) return toast.error("Tüm parametreler sayı olmalı");
    setBusy(true);
    try {
      const result = await productService.recalculateLaserPriceList({ code, formula, apply });
      if (apply) {
        toast.success(`${list.name}: ${result.rows.length} satır kaydedildi`);
        await load();
      } else {
        setPreview(result);
        toast.message(`${result.rows.length} satır hesaplandı${result.skipped.length ? `, ${result.skipped.length} satır atlandı (konteyner/maliyet yok)` : ""}. Kaydetmeden listeye yazılmaz.`);
      }
    } catch (error: any) {
      toast.error("Fiyat listesi hesaplanamadı", { description: error?.message });
    } finally {
      setBusy(false);
    }
  };
  const download = () => downloadExport(`/laser-price-lists/${code}/export`, `${list.name}.xlsx`).catch((error) => toast.error("Liste indirilemedi", { description: error?.message }));
  const th = "px-3 py-2 font-semibold";

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 p-4">
        <div>
          <p className="ui-eyebrow text-primary">Fiber lazer kesim makineleri</p>
          <h3 className="mt-1 font-display text-lg font-semibold">Fiyat listeleri</h3>
          <div className="mt-2 inline-flex rounded-lg border bg-muted/30 p-0.5" role="tablist" aria-label="Fiyat listesi">
            {data.lists.map((entry) => (
              <button key={entry.code} type="button" role="tab" aria-selected={entry.code === code}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${entry.code === code ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                onClick={() => setCode(entry.code)}>
                {entry.code === "LAZER-CIF-IST" ? "CIF İstanbul Gümrük Teslim" : "Millileştirilmiş Antrepo Teslim"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Baz kart
            <select className="h-9 max-w-64 rounded-md border bg-card px-2 text-sm text-foreground" value={series} onChange={(event) => setSeries(event.target.value)}>
              <option value="">Tümü</option>
              {seriesOptions.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" disabled={!priced} onClick={() => void download()}>
            <Download className="size-3.5" /> Excel indir
          </Button>
        </div>
      </div>

      {canEdit && data.canViewCost && draft && (
        <div className="flex flex-wrap items-end gap-3 border-b border-border/60 bg-muted/20 p-4 text-xs">
          {FORMULA_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1 text-muted-foreground">{label}
              <Input className={`h-9 w-28 tabular-nums ${parsePrice(draft[key]) == null ? "border-destructive" : ""}`} inputMode="decimal" value={draft[key]}
                onChange={(event) => { setPreview(null); setDraft({ ...draft, [key]: event.target.value }); }} />
            </label>
          ))}
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" disabled={busy || !formula} onClick={() => void run(false)}>
            <Calculator className="size-3.5" /> Önizle
          </Button>
          <Button type="button" size="sm" className="h-9 gap-1.5" disabled={busy || !formula || !preview} onClick={() => void run(true)}>
            <Save className="size-3.5" /> Listeye kaydet
          </Button>
          <p className="basis-full text-muted-foreground">
            Maliyet = (FOB + görünüm + navlun) × (1 + gümrük) + sabit giderler; çoklu konteynerde navlun toplanır. Liste ve son fiyat maliyetin üzerine kâr eklenerek tam dolara yuvarlanır. Önizlemeden sonra kaydedilir.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground">
            <tr className="text-left">
              <th scope="col" className={th}>Model</th>
              <th scope="col" className={`${th} text-right`}>Güç</th>
              {data.canViewCost && <th scope="col" className={th}>Konteyner</th>}
              {data.canViewCost && <th scope="col" className={`${th} text-right`}>FOB</th>}
              {data.canViewCost && <th scope="col" className={`${th} text-right`}>Maliyet</th>}
              <th scope="col" className={`${th} text-right`}>Liste fiyatı</th>
              <th scope="col" className={`${th} text-right`}>Son fiyat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const next = previewById.get(row.configurationPriceId);
              const changed = next && (next.listPrice !== row.listPrice || next.cashPrice !== row.cashPrice);
              return (
                <tr key={row.configurationPriceId} className={`border-t border-border/60 ${changed ? "bg-primary/5" : ""}`}>
                  <td className="px-3 py-1.5"><span className="font-medium">{row.sourceModelCode}</span> <span className="text-xs text-muted-foreground">{row.productName}</span></td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{row.powerKw.toLocaleString("tr-TR")} kW</td>
                  {data.canViewCost && <td className="px-3 py-1.5 text-xs text-muted-foreground">{row.container ?? "—"}</td>}
                  {data.canViewCost && <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{usd(row.fob)}</td>}
                  {data.canViewCost && <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{usd(next ? next.cost : row.cost)}</td>}
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                    {usd(next ? next.listPrice : row.listPrice)}
                    {changed && row.listPrice != null && <div className="text-[11px] font-normal text-muted-foreground line-through">{usd(row.listPrice)}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {usd(next ? next.cashPrice : row.cashPrice)}
                    {changed && row.cashPrice != null && <div className="text-[11px] text-muted-foreground line-through">{usd(row.cashPrice)}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span>
          <b className="text-foreground">{rows.length}</b> / {list.rows.length} satır · {priced} satır fiyatlı
          {list.updatedAt && ` · son hesaplama ${new Date(list.updatedAt).toLocaleString("tr-TR")}`}
        </span>
        {preview && preview.skipped.length > 0 && (
          <span>Atlanan: {preview.skipped.map((row) => `${row.sourceModelCode} ${row.powerKw} kW`).join(", ")}</span>
        )}
      </div>
    </Card>
  );
}
