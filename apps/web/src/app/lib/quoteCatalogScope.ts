import { machineFamilyForType } from '@haksan/shared';
import type { Product } from './mock';

const machineGroups = new Set(['CNC', 'UNIVERSAL', 'SAC_ISLEME']);
/** Sales choices require explicit division ownership or a known machine compatibility. */
export function productMatchesQuoteDivision(product: Pick<Product, 'productGroupCode' | 'divisionId' | 'compatibleMachineTypeCode'>, group: string, divisionId?: string): boolean {
  if (!group) return true;
  const ownGroup = product.productGroupCode?.toUpperCase() ?? '';
  if (machineGroups.has(ownGroup)) return ownGroup === group;
  return Boolean((divisionId && product.divisionId === divisionId)
    || (product.compatibleMachineTypeCode && machineFamilyForType(group, product.compatibleMachineTypeCode)));
}
