import { useEffect, useState } from "react";
import { productService } from "../../../lib/services";

type PriceMatrix = Awaited<ReturnType<typeof productService.configurationPrices>>;
type PriceRow = PriceMatrix["rows"][number];

const CURRENCY_LABEL: Record<string, string> = { USD: "USD", EUR: "EUR", TRY: "TL" };
const money = (value: number | null | undefined, currency: string | null | undefined) =>
  value == null ? "—" : `${value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${CURRENCY_LABEL[currency ?? ""] ?? currency ?? ""}`.trim();
const power = (kw: number) => `${kw.toLocaleString("tr-TR")} kW`;

/** Satırları baz kartın alt model sırasıyla gruplar; listede olmayan kodlar sona eklenir. */
export function groupPriceRows(rows: PriceRow[], modelOrder: readonly string[] = []): Array<{ model: string; rows: PriceRow[] }> {
  const order = (code: string) => {
    const index = modelOrder.indexOf(code);
    return index < 0 ? modelOrder.length : index;
  };
  const models = [...new Set(rows.map((row) => row.sourceModelCode))]
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b, "tr"));
  return models.map((model) => ({ model, rows: rows.filter((row) => row.sourceModelCode === model).sort((a, b) => a.powerKw - b.powerKw) }));
}

/**
 * Baz kartın alt model × lazer gücü fiyat tablosu. Alış maliyeti yalnız
 * `product_costs.view` izni olana API'den gelir; satış fiyatı girilmemişse "—".
 */
export function BaseModelPriceMatrix({ productId, modelOrder }: { productId: string; modelOrder?: readonly string[] }) {
  const [matrix, setMatrix] = useState<PriceMatrix | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setMatrix(null);
    setFailed(false);
    productService.configurationPrices(productId)
      .then((result) => { if (alive) setMatrix(result); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [productId]);

  if (failed) return <p className="text-xs text-muted-foreground">Model ve güç fiyatları yüklenemedi.</p>;
  if (!matrix) return <p className="text-xs text-muted-foreground">Model ve güç fiyatları yükleniyor…</p>;
  if (!matrix.rows.length) return <p className="text-xs text-muted-foreground">Bu baz kart için model × güç fiyatı tanımlı değil.</p>;

  const groups = groupPriceRows(matrix.rows, modelOrder);
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[34rem] text-xs">
        <caption className="sr-only">Alt model ve lazer gücüne göre fiyatlar</caption>
        <thead className="bg-muted/30 text-muted-foreground">
          <tr className="text-left">
            <th scope="col" className="px-3 py-1.5 font-semibold">Model</th>
            <th scope="col" className="px-3 py-1.5 font-semibold">Güç</th>
            {matrix.canViewCost && <th scope="col" className="px-3 py-1.5 text-right font-semibold">Alış maliyeti</th>}
            <th scope="col" className="px-3 py-1.5 text-right font-semibold">Satış fiyatı</th>
            <th scope="col" className="px-3 py-1.5 text-right font-semibold">Üretim süresi</th>
            <th scope="col" className="px-3 py-1.5 font-semibold">Konteyner</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.model} className="border-t border-border/60">
            {group.rows.map((row, index) => (
              <tr key={row.id} className="align-top">
                {index === 0 && (
                  <th scope="rowgroup" rowSpan={group.rows.length} className="px-3 py-1.5 text-left font-semibold text-foreground">
                    {group.model}
                  </th>
                )}
                <td className="px-3 py-1.5 tabular-nums">{power(row.powerKw)}</td>
                {matrix.canViewCost && <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{money(row.costPrice, row.costCurrencyCode)}</td>}
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{money(row.salePrice, row.saleCurrencyCode)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.leadTimeDays == null ? "—" : `${row.leadTimeDays} gün`}</td>
                <td className="px-3 py-1.5">{row.container ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
