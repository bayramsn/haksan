import { z } from 'zod';

export const warehouseCreateSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().max(64).optional(),
  country: z.string().max(64).optional(),
  province: z.string().max(64).optional(),
  district: z.string().max(64).optional(),
  address: z.string().max(1000).optional(),
});
export type WarehouseCreateInput = z.infer<typeof warehouseCreateSchema>;

export const inventoryItemCreateSchema = z.object({
  productModelId: z.string().min(1),
  serialNumber: z.string().min(1).max(128),
  controlUnit: z.string().max(128).optional(),
  controlUnitSerialNumber: z.string().max(128).optional(),
  loadingDate: z.coerce.date().optional(),
  arrivalDate: z.coerce.date().optional(),
  locationStatusCode: z.string().max(64).optional(),
  stockStatusCode: z.string().max(64).default('available'),
  warehouseId: z.string().optional(),
  notes: z.string().max(4000).optional(),
});
export type InventoryItemCreateInput = z.infer<typeof inventoryItemCreateSchema>;

export const inventoryItemUpdateSchema = inventoryItemCreateSchema.partial();
export type InventoryItemUpdateInput = z.infer<typeof inventoryItemUpdateSchema>;

export const inventoryReserveSchema = z.object({
  opportunityId: z.string().optional(),
  quoteId: z.string().optional(),
  notes: z.string().max(1000).optional(),
});
export type InventoryReserveInput = z.infer<typeof inventoryReserveSchema>;

export const inventorySellSchema = z.object({
  opportunityId: z.string().optional(),
  quoteId: z.string().optional(),
  companyId: z.string().optional(),
  notes: z.string().max(1000).optional(),
});
export type InventorySellInput = z.infer<typeof inventorySellSchema>;
