import type { LaserSpec, LaserTechnicalConfiguration } from '@haksan/shared';

export type LaserWorkbookRow = {
  clientId: string; specKey: string; defaultValue: string; unit: string; groupCode: string;
  specOptions: string[]; isActive: boolean; isDeleted: boolean; catalogOnly: boolean; inCatalog: boolean;
  laserSource?: LaserSpec;
};
export function laserWorkbookRows(configuration: LaserTechnicalConfiguration): LaserWorkbookRow[] {
  return configuration.specs.map((spec, index) => ({
    clientId: `laser-${index}-${spec.key}`, specKey: spec.key, defaultValue: spec.value, unit: spec.unit ?? '',
    groupCode: spec.groupCode ?? 'GENEL', specOptions: [], isActive: true, isDeleted: false,
    catalogOnly: false, inCatalog: false, laserSource: spec,
  }));
}
export function laserWorkbookSpecs(rows: LaserWorkbookRow[]): LaserSpec[] {
  return rows.filter((row) => row.isActive && !row.isDeleted).map((row) => {
    const source = row.laserSource;
    return { ...source, key: row.specKey.trim(), value: row.defaultValue.trim(), unit: row.unit.trim(), groupCode: row.groupCode,
      sourceValue: source?.sourceValue ?? source?.value, sourceUnit: source?.sourceUnit ?? source?.unit,
      isManual: !source || source.isManual || row.specKey.trim() !== source.key || row.defaultValue.trim() !== source.value || row.unit.trim() !== (source.unit ?? '') || row.groupCode !== (source.groupCode ?? 'GENEL'),
    };
  });
}
