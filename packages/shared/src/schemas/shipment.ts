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

export const shipmentTransportModeSchema = z.enum(['road', 'air', 'sea', 'local_cargo']);
export type ShipmentTransportMode = z.infer<typeof shipmentTransportModeSchema>;

const optionalUuidSchema = z.string().uuid().optional();

/** Sevkiyat satır kalemi (paketleme listesi); bir seri-numaralı stok kalemine bağlanabilir. */
export const shipmentItemInputSchema = z.object({
  inventoryItemId: optionalUuidSchema,
  salesOrderItemId: optionalUuidSchema,
  productModelId: optionalUuidSchema,
  description: z.string().min(1).max(2000),
  serialNumber: z.string().max(128).optional(),
  quantity: moneySchema.default(1),
  unitCode: z.string().max(16).default('adet'),
  sortOrder: z.coerce.number().int().default(0),
  packageCount: z.coerce.number().int().min(0).optional(),
  palletCount: z.coerce.number().int().min(0).optional(),
  packageLengthCm: moneySchema.optional(),
  packageWidthCm: moneySchema.optional(),
  packageHeightCm: moneySchema.optional(),
  grossWeightKg: moneySchema.optional(),
  packageNotes: z.string().max(2000).optional(),
});
export type ShipmentItemInput = z.infer<typeof shipmentItemInputSchema>;

export const shipmentCreateSchema = z.object({
  divisionId: optionalUuidSchema,
  opportunityId: optionalUuidSchema,
  quoteId: optionalUuidSchema,
  salesOrderId: optionalUuidSchema,
  companyId: optionalUuidSchema,
  deliveryAddressId: optionalUuidSchema,
  deliveryAddressSnapshot: z.string().max(2000).optional(),
  senderCompanyId: optionalUuidSchema,
  // Kayıtlı olmayan gönderici için serbest-metin ad (senderCompanyId yerine elle giriş).
  senderName: z.string().max(255).optional(),
  carrierCompanyId: optionalUuidSchema,
  transportMode: shipmentTransportModeSchema.optional(),
  productCategoryCode: z.string().max(64).optional(),
  destinationWarehouseId: optionalUuidSchema,
  loadingDate: z.coerce.date().optional(),
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

export const shipmentStartSchema = z.object({
  loadingDate: z.coerce.date().optional(),
});
export type ShipmentStartInput = z.infer<typeof shipmentStartSchema>;

export const shipmentStatusUpdateSchema = z.object({
  statusCode: shipmentStatusCodeSchema,
  destinationWarehouseId: optionalUuidSchema,
  loadingDate: z.coerce.date().optional(),
  arrivedAt: z.coerce.date().optional(),
});
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
  unit: z.string().trim().max(64).optional(),
  specUnit: z.string().trim().max(64).optional(),
});
export type DeliveryTechnicalSpec = z.infer<typeof deliveryTechnicalSpecSchema>;

export const INSTALLATION_FORM_DEFAULT_CHECKS = [
  { id: 'tezgah-montaji', label: 'Tezgah Montajı' },
  { id: 'tezgah-dengeye-alinmasi', label: 'Tezgahın Dengeye Alınması' },
  { id: 'elektrik-baglantisi', label: 'Elektrik Bağlantısı' },
  { id: 'yaglama-sistemi', label: 'Yağlama Sistemi Kontrolü' },
  { id: 'sogutma-sistemi', label: 'Soğutma Sistemi Kontrolü' },
  { id: 'hidrolik-sistemi', label: 'Hidrolik Sistemi Kontrolü' },
  { id: 'cnc-parametreleri', label: 'Cnc Parametreleri Kontrolü' },
  { id: 'ilk-calistirma', label: 'Tezgahın İlk Çalıştırılması' },
  { id: 'parametre-yedek', label: 'Parametrelerin Yedeklenmesi' },
] as const;

export const installationCheckStatusSchema = z.enum(['done', 'not_done']);
export type InstallationCheckStatus = z.infer<typeof installationCheckStatusSchema>;

export const installationCheckSchema = z.object({
  id: z.string().trim().max(128).optional(),
  label: z.string().trim().min(1).max(255),
  status: installationCheckStatusSchema.optional(),
  note: z.string().trim().max(1000).optional(),
});
export type InstallationCheck = z.infer<typeof installationCheckSchema>;

export const installationProblemSchema = z.object({
  hasProblem: z.boolean().optional(),
  note: z.string().trim().max(2000).optional(),
  actionNote: z.string().trim().max(2000).optional(),
});
export type InstallationProblem = z.infer<typeof installationProblemSchema>;

export const installationUserInfoSchema = z.object({
  firma: z.string().max(255).optional(),
  ilgili: z.string().max(255).optional(),
  adres: z.string().max(1000).optional(),
  telefon: z.string().max(64).optional(),
  faks: z.string().max(64).optional(),
  gsm: z.string().max(64).optional(),
  eposta: z.string().max(255).optional(),
});
export type InstallationUserInfo = z.infer<typeof installationUserInfoSchema>;

export const installationFormDataSchema = z.object({
  formNo: z.string().max(64).optional(),
  teslimTarihi: z.coerce.date().optional(),
  kurulumTarihi: z.coerce.date().optional(),
  machineId: z.string().optional(),
  tezgah: deliveryMachineInfoSchema.optional(),
  cnc: deliveryCncInfoSchema.optional(),
  kullanici: installationUserInfoSchema.optional(),
  technicalSpecs: z.array(deliveryTechnicalSpecSchema).max(100).optional(),
  checks: z.array(installationCheckSchema).max(50).optional(),
  problem: installationProblemSchema.optional(),
  kurulumuYapan: z.string().max(255).optional(),
  teslimAlan: z.string().max(255).optional(),
});
export type InstallationFormData = z.infer<typeof installationFormDataSchema>;

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
