import type { LaserTechnicalConfiguration, QuoteItemCompatibility } from '@haksan/shared';
import { applyLaserSpecEdits } from '../products/laser-profiles.service';
import { ValidationError } from '../../shared/utils/errors';

/** Capture once at item creation; subsequent updates use the saved item, never the live catalog. */
export function quoteLaserSnapshot(
  compatibility: QuoteItemCompatibility | null | undefined,
  defaultConfiguration: LaserTechnicalConfiguration | null | undefined,
): QuoteItemCompatibility | null {
  const selected = compatibility?.technicalConfiguration ?? defaultConfiguration;
  if (!selected) return compatibility ?? null;
  if (defaultConfiguration && selected.selection.productTypeCode !== defaultConfiguration.selection.productTypeCode) {
    throw new ValidationError('Teklif teknik seçimi ürünün lazer tipiyle eşleşmiyor');
  }
  const configuration = !compatibility?.technicalConfiguration && compatibility?.technicalSpecs?.length
    ? applyLaserSpecEdits(selected, compatibility.technicalSpecs.map((spec) => ({ ...spec, unit: spec.unit ?? spec.specUnit })))
    : applyLaserSpecEdits(selected, []);
  return {
    machineIds: [], brands: [], controlUnits: [], supplierIds: [], ...compatibility,
    technicalConfiguration: structuredClone(configuration),
    technicalSpecs: configuration.specs.map(({ key, value, unit, groupCode, groupName }) => ({ key, value, unit, groupCode, groupName })),
  };
}
