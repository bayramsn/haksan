import { HEX2026_REVISION, LASER_WORKBOOK_GROUPS, hex2026TechnicalFields, laserFieldWorkbookGroup } from "@haksan/shared";
import type { LaserBaseConfiguration } from "./mock";

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

/** Baz kartın ekranda ve PDF'te basılan tablosu: model sütunları + kitap bölümleri; değerler Türkçe yazımla. */
export function baseModelTechnicalData(base: LaserBaseConfiguration): { models: string[]; groups: TechnicalGroup[] } | null {
  if (base.sourceRevision !== HEX2026_REVISION) return null;
  // PDF alanları + aynı modelin AORE kitabındaki alanları.
  const configurations = base.sourceModelCodes
    .map((code) => ({ sourceModelCode: code, fields: hex2026TechnicalFields(base.series, code) }))
    .filter((configuration) => configuration.fields.length);
  const groups = groupBaseModelSpecs(configurations)
    .map((entry) => ({ ...entry, rows: entry.rows.map((row) => ({ ...row, values: row.values.map((value) => (value ? formatSpecValue(value) : "")) })) }));
  return { models: configurations.map((configuration) => configuration.sourceModelCode), groups };
}
