import { HEX2026_REVISION, LASER_WORKBOOK_GROUPS, hex2026TechnicalFields, laserFieldWorkbookGroup } from "@haksan/shared";
import type { LaserBaseConfiguration } from "../../lib/mock";

type Configuration = { sourceModelCode: string; fields: ReadonlyArray<{ key: string; rawValue: string; verification: string }> };
export type TechnicalGroup = { group: string; rows: Array<{ key: string; values: string[] }> };

const OTHER = "Diğer";

/** Kitaptan gelen değerleri PDF'teki Türkçe yazımla aynı gösterir: ondalık virgül, "m/dk", birim boşluğu. Yalnız ekran. */
export const formatSpecValue = (value: string) => value
  .replace(/\s*：\s*/g, ": ")
  .replace(/m\/min/gi, "m/dk")
  .replace(/(\d+)\s*sets?\s*\((\d+)\s*units?\)/gi, "$1 set ($2 adet)")
  .replace(/Bevel cutting\s*[–-]\s*straight edge/gi, "Pah kesim – düz kenar")
  .replace(/Bevel cutting\s*[–-]\s*bevel edge/gi, "Pah kesim – pah kenarı")
  .replace(/(\d)\s*\*\s*(?=\d)/g, "$1 × ")
  .replace(/(\d)\.(\d)/g, "$1,$2")
  .replace(/(\d)[sS]\s*\(/g, "$1 sn (")
  .replace(/(\d)\s*(mm\/m|mm|kg|kVA|kW|m\/dk|G)(?![A-Za-zçğıöşü])/g, "$1 $2");

/**
 * Baz kartın alt modellerini AORE kitabındaki bölümlere (Temel Parametreler, Performans, Mekanik
 * Sistem…) göre satır, modelleri sütun yapar. Yalnız doğrulanmış (PDF) ve kitaptan gelen alanlar;
 * satır sırası alanların ilk görüldüğü sıradır.
 */
export function groupBaseModelSpecs(configurations: Configuration[]): TechnicalGroup[] {
  const keys: string[] = [];
  for (const configuration of configurations) for (const field of configuration.fields) {
    if ((field.verification === "verified" || field.verification === "aore_excel") && !keys.includes(field.key)) keys.push(field.key);
  }
  const valueOf = (configuration: Configuration, key: string) => configuration.fields
    .find((field) => field.key === key && (field.verification === "verified" || field.verification === "aore_excel"))?.rawValue.trim() ?? "";
  const order = [...LASER_WORKBOOK_GROUPS, OTHER] as string[];
  return order
    .map((group) => ({
      group,
      rows: keys
        .filter((key) => (laserFieldWorkbookGroup(key) ?? OTHER) === group)
        .map((key) => ({ key, values: configurations.map((configuration) => valueOf(configuration, key)) }))
        .filter((row) => row.values.some(Boolean)),
    }))
    .filter((entry) => entry.rows.length);
}

export function BaseModelTechnicalTable({ base }: { base: LaserBaseConfiguration }) {
  if (base.sourceRevision !== HEX2026_REVISION) return null;
  // PDF alanları + aynı modelin AORE kitabındaki alanları.
  const configurations = base.sourceModelCodes
    .map((code) => ({ sourceModelCode: code, fields: hex2026TechnicalFields(base.series, code) }))
    .filter((configuration) => configuration.fields.length);
  const groups = groupBaseModelSpecs(configurations);
  if (!groups.length) return <p className="text-xs text-muted-foreground">Bu baz kart için teknik bilgi bulunamadı.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-xs" style={{ minWidth: `${12 + configurations.length * 8}rem` }}>
        <caption className="sr-only">Alt modellere göre teknik bilgiler</caption>
        <thead className="bg-muted/30 text-muted-foreground">
          <tr className="text-left">
            <th scope="col" className="sticky left-0 bg-muted/30 px-3 py-1.5 font-semibold">Özellik</th>
            {configurations.map((configuration) => <th key={configuration.sourceModelCode} scope="col" className="px-3 py-1.5 font-semibold text-foreground">{configuration.sourceModelCode}</th>)}
          </tr>
        </thead>
        {groups.map((entry) => (
          <tbody key={entry.group} className="border-t border-border/60">
            <tr>
              <th scope="colgroup" colSpan={configurations.length + 1} className="bg-primary/5 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-primary">{entry.group}</th>
            </tr>
            {entry.rows.map((row) => (
              <tr key={row.key} className="border-t border-border/40 align-top">
                <th scope="row" className="sticky left-0 bg-card px-3 py-1.5 text-left font-medium text-muted-foreground">{row.key}</th>
                {row.values.map((value, index) => <td key={configurations[index]!.sourceModelCode} className="whitespace-pre-line px-3 py-1.5 tabular-nums">{value ? formatSpecValue(value) : "—"}</td>)}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
