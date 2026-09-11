import type { LaserTechnicalConfiguration, LaserSpec } from '@haksan/shared';
import type { Product, ProductSpec } from './mock';
import { specsForProductTypeStrict } from './productSpecTemplates';

/** A profile snapshot retains missing values; a later catalog must never fill them. */
export const cleanSnapshotSpecs = (specs: ProductSpec[] = []): ProductSpec[] => specs
  .map((spec) => ({
    ...spec,
    key: spec.key.trim(),
    value: spec.value.trim(),
    unit: (spec.unit ?? spec.specUnit ?? '').trim() || undefined,
    specUnit: (spec.unit ?? spec.specUnit ?? '').trim() || undefined,
  }))
  .filter((spec) => Boolean(spec.key));

export const quoteTechnicalSpecsFromProduct = (product?: Product | null): ProductSpec[] => {
  if (!product) return [];
  return product.technicalConfiguration
    ? cleanSnapshotSpecs(product.technicalConfiguration.specs)
    : specsForProductTypeStrict(product.productTypeCode, product.specs ?? []);
};

/** Keep original field provenance while recording changes made only on this quote. */
export function withQuotedLaserSpecs(configuration: LaserTechnicalConfiguration, specs: ProductSpec[]): LaserTechnicalConfiguration {
  const original = new Map(configuration.specs.map((spec) => [spec.key, spec]));
  return {
    ...configuration,
    selection: { ...configuration.selection },
    specs: cleanSnapshotSpecs(specs).map((spec): LaserSpec => {
      const source = original.get(spec.key);
      return {
        ...source,
        key: spec.key,
        value: spec.value,
        unit: spec.unit,
        groupCode: spec.groupCode,
        groupName: spec.groupName,
        isManual: source?.isManual || !source || source.value !== spec.value || source.unit !== spec.unit,
      };
    }),
  };
}

/** Selection labels are derived only from the saved configuration, never from the live product. */
export function laserSnapshotPrintSpecs(configuration: LaserTechnicalConfiguration, specs: ProductSpec[]): ProductSpec[] {
  const { selection } = configuration;
  const tube = selection.productTypeCode === 'BORU_LAZER_KESIM';
  // Kimlik satırları teknik gruplardan ayrı, tablonun başında tek şerit olarak basılır.
  const selectionSpecs: ProductSpec[] = [
    { key: 'Ürün Kategorisi', value: 'Tezgah', groupName: 'Ürün' },
    { key: 'Ürün Alt Kategorisi', value: tube ? 'Boru/Profil Lazer Kesim' : 'Sac Lazer Kesim', groupName: 'Ürün' },
    { key: 'Ürün Serisi', value: `${selection.series} Serisi`, groupName: 'Ürün' },
    { key: tube ? 'Kesim Bölgesi Koruması' : 'Kabin Tipi', value: selection.cabinType === 'open' ? 'Açık' : 'Kapalı', groupName: 'Ürün' },
    { key: 'Kaynak Model', value: selection.sourceModelCode, groupName: 'Ürün' },
  ];
  const keys = new Set(specs.map((spec) => spec.key));
  if (!keys.has('Lazer Gücü') && !keys.has('Rezonatör Gücü')) selectionSpecs.push({ key: 'Rezonatör Gücü', value: String(selection.powerKw), unit: 'kW', groupName: 'Ürün' });
  if (tube || (!keys.has('Tabla Boyutu') && !keys.has('Kesme Alanı'))) {
    selectionSpecs.push({ key: tube ? 'Boru Modeli ve Kapasitesi' : 'Tabla Ölçüsü', value: configuration.sizeLabel, groupName: 'Ürün' });
  }
  return [...selectionSpecs.filter((spec) => !keys.has(spec.key)), ...cleanSnapshotSpecs(specs)];
}
