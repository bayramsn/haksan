import { z } from 'zod';
import { moneySchema } from './common';

export const shipmentStatusCodeSchema = z.enum([
  'preparing',
  'in_transit',
  'at_customs',
  'cleared',
  'delivered',
]);
export type ShipmentStatusCode = z.infer<typeof shipmentStatusCodeSchema>;

/** Sevkiyat satır kalemi (paketleme listesi); bir seri-numaralı stok kalemine bağlanabilir. */
export const shipmentItemInputSchema = z.object({
  inventoryItemId: z.string().optional(),
  salesOrderItemId: z.string().optional(),
  productModelId: z.string().optional(),
  description: z.string().min(1).max(2000),
  serialNumber: z.string().max(128).optional(),
  quantity: moneySchema.default(1),
  unitCode: z.string().max(16).default('adet'),
  sortOrder: z.coerce.number().int().default(0),
});
export type ShipmentItemInput = z.infer<typeof shipmentItemInputSchema>;

export const shipmentCreateSchema = z.object({
  divisionId: z.string().uuid().optional(),
  opportunityId: z.string().optional(),
  quoteId: z.string().optional(),
  salesOrderId: z.string().optional(),
  companyId: z.string().optional(),
  shipmentNo: z.string().max(64).optional(),
  carrier: z.string().max(255).optional(),
  trackingNo: z.string().max(128).optional(),
  origin: z.string().max(255).optional(),
  destination: z.string().max(255).optional(),
  eta: z.coerce.date().optional(),
  incoterm: z.string().max(64).optional(),
  statusCode: shipmentStatusCodeSchema.default('preparing'),
  notes: z.string().max(2000).optional(),
  items: z.array(shipmentItemInputSchema).optional(),
});
export type ShipmentCreateInput = z.infer<typeof shipmentCreateSchema>;

export const shipmentUpdateSchema = shipmentCreateSchema.partial();
export type ShipmentUpdateInput = z.infer<typeof shipmentUpdateSchema>;

export const shipmentStatusUpdateSchema = z.object({ statusCode: shipmentStatusCodeSchema });
export type ShipmentStatusUpdateInput = z.infer<typeof shipmentStatusUpdateSchema>;

/** "fulfilled" satış siparişinden otomatik sevkiyat üretirken kullanılan opsiyonel meta. */
export const shipmentFromOrderSchema = z.object({
  carrier: z.string().max(255).optional(),
  trackingNo: z.string().max(128).optional(),
  origin: z.string().max(255).optional(),
  destination: z.string().max(255).optional(),
  eta: z.coerce.date().optional(),
  incoterm: z.string().max(64).optional(),
  notes: z.string().max(2000).optional(),
});
export type ShipmentFromOrderInput = z.infer<typeof shipmentFromOrderSchema>;

/** Kurulum tutanağı — tezgah bilgileri (DR.MAK formu). */
export const deliveryMachineInfoSchema = z.object({
  marka: z.string().max(128).optional(),
  tip: z.string().max(128).optional(),
  model: z.string().max(128).optional(),
  seriNo: z.string().max(128).optional(),
});
export type DeliveryMachineInfo = z.infer<typeof deliveryMachineInfoSchema>;

/** Kurulum tutanağı — kontrol ünitesi bilgileri. */
export const deliveryCncInfoSchema = z.object({
  marka: z.string().max(128).optional(),
  model: z.string().max(128).optional(),
  seriNo: z.string().max(128).optional(),
  mainSw: z.string().max(128).optional(),
});
export type DeliveryCncInfo = z.infer<typeof deliveryCncInfoSchema>;

export const deliveryTechnicalSpecSchema = z.object({
  key: z.string().trim().min(1).max(255),
  value: z.string().trim().max(1000),
});
export type DeliveryTechnicalSpec = z.infer<typeof deliveryTechnicalSpecSchema>;

/** Teslimat / kurulum tutanağı yazdırma alanları. */
export const deliveryFormDataSchema = z.object({
  formNo: z.string().max(64).optional(),
  kurulumTarihi: z.coerce.date().optional(),
  machineId: z.string().optional(),
  tezgah: deliveryMachineInfoSchema.optional(),
  cnc: deliveryCncInfoSchema.optional(),
  ilgili: z.string().max(255).optional(),
  kurulumuYapan: z.string().max(255).optional(),
  technicalSpecs: z.array(deliveryTechnicalSpecSchema).max(100).optional(),
});
export type DeliveryFormData = z.infer<typeof deliveryFormDataSchema>;

export const deliveryCreateSchema = z.object({
  divisionId: z.string().uuid().optional(),
  opportunityId: z.string().optional(),
  companyId: z.string().min(1),
  shipmentId: z.string().optional(),
  salesOrderId: z.string().optional(),
  deliveryDate: z.coerce.date(),
  signedBy: z.string().max(255).optional(),
  status: z.enum(['pending', 'completed']).default('pending'),
  notes: z.string().max(2000).optional(),
  formData: deliveryFormDataSchema.optional(),
});
export type DeliveryCreateInput = z.infer<typeof deliveryCreateSchema>;

export const deliveryUpdateSchema = deliveryCreateSchema.partial();
export type DeliveryUpdateInput = z.infer<typeof deliveryUpdateSchema>;

export const deliveryStatusUpdateSchema = z.object({ status: z.enum(['pending', 'completed']) });
export type DeliveryStatusUpdateInput = z.infer<typeof deliveryStatusUpdateSchema>;
