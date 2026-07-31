import { describe, expect, it } from 'vitest';
import {
  companyCreateSchema,
  shipmentCreateSchema,
} from '@haksan/shared';

describe('logistics workflow schemas', () => {
  it('preserves outgoing behavior for clients that omit shipment direction', () => {
    const parsed = shipmentCreateSchema.parse({
      trackingNo: 'TRK-001',
      items: [{ description: 'CNC tezgahı', serialNumber: 'SN-001' }],
    });

    expect(parsed.direction).toBe('outgoing');
  });

  it('accepts incoming shipments with a single package quantity and managed unit', () => {
    const parsed = shipmentCreateSchema.parse({
      direction: 'incoming',
      trackingNo: 'IN-001',
      items: [{
        description: 'İşleme merkezi',
        serialNumber: 'SER-2026-01',
        packageQuantity: 2,
        packageUnitCode: 'crate',
      }],
    });

    expect(parsed.items?.[0]).toMatchObject({ packageQuantity: 2, packageUnitCode: 'crate' });
  });

  it('accepts transportation and logistics supplier categories', () => {
    for (const supplierCategoryCode of ['transportation', 'logistics'] as const) {
      const parsed = companyCreateSchema.parse({
        legalTitle: `${supplierCategoryCode} firması`,
        relationTypeCode: 'supplier',
        supplierCategoryCode,
      });
      expect(parsed.supplierCategoryCode).toBe(supplierCategoryCode);
    }
  });
});
