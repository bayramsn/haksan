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
  divisionId: z.string().uuid().optional(),
  productModelId: z.string().min(1),
  parentInventoryItemId: z.string().uuid().optional().nullable(),
  serialNumber: z.string().min(1).max(128),
  itemCondition: z.enum(['new', 'used']).default('new'),
  controlUnit: z.string().max(128).optional(),
  controlUnitSerialNumber: z.string().max(128).optional(),
  loadingDate: z.coerce.date().optional(),
  receivedDate: z.coerce.date().optional(),
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
  companyId: z.string().min(1),
  divisionId: z.string().uuid().optional(),
  opportunityId: z.string().optional(),
  quoteId: z.string().optional(),
  notes: z.string().max(1000).optional(),
});
export type InventoryReserveInput = z.infer<typeof inventoryReserveSchema>;

export const accountingInvoiceLineSchema = z.object({
  productModelId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  categoryCode: z.string().max(64).optional(),
  description: z.string().max(500).optional(),
  quantity: z.coerce.number().positive().default(1),
});
export type AccountingInvoiceLineInput = z.infer<typeof accountingInvoiceLineSchema>;

export const inventorySellSchema = z.object({
  opportunityId: z.string().optional(),
  quoteId: z.string().optional(),
  companyId: z.string().optional(),
  notes: z.string().max(1000).optional(),
});
export type InventorySellInput = z.infer<typeof inventorySellSchema>;

export const customerDeviceCreateSchema = z.object({
  companyId: z.string().min(1),
  initialCompanyId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  inventoryItemId: z.string().optional(),
  opportunityId: z.string().optional(),
  quoteId: z.string().optional(),
  installationDate: z.coerce.date().optional(),
  warrantyStartDate: z.coerce.date().optional(),
  warrantyEndDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().optional(),
  notes: z.string().max(4000).optional(),
});
export type CustomerDeviceCreateInput = z.infer<typeof customerDeviceCreateSchema>;

export const customerDeviceUpdateSchema = customerDeviceCreateSchema.partial();
export type CustomerDeviceUpdateInput = z.infer<typeof customerDeviceUpdateSchema>;
