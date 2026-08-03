// Lookup codes used by both backend (seed + state machine) and frontend (dropdowns)
// Keep in sync with database/seeds/001_lookup_seed.sql

export const PIPELINE_STAGES = [
  'lead',
  'call',
  'visit',
  'quote',
  'sales',
  'cancelled',
  'proforma',
  'contract',
  'payment_plan',
  'commercial_invoice',
  'customs_approved',
  'stock_picking',
  'shipping',
  'installation',
  'delivered',
] as const;
export type PipelineStageCode = (typeof PIPELINE_STAGES)[number];

/**
 * Satış ekibinin müşteri niyetini ve kart olgunluğunu takip ettiği yalın akış.
 * Operasyonel PIPELINE_STAGES (teklif, fatura, sevkiyat, kurulum...) ayrı kalır.
 */
export const QUALIFICATION_STAGES = ['lead', 'c', 'b', 'a', 'a_plus', 'win', 'lost'] as const;
export type QualificationStageCode = (typeof QUALIFICATION_STAGES)[number];

export const OPPORTUNITY_APPROVAL_TYPES = ['payment', 'customs', 'invoice', 'installation', 'win'] as const;
export type OpportunityApprovalType = (typeof OPPORTUNITY_APPROVAL_TYPES)[number];

export const OPPORTUNITY_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type OpportunityApprovalStatus = (typeof OPPORTUNITY_APPROVAL_STATUSES)[number];

export const ROLE_CODES = [
  'super_admin',
  'admin',
  'sales',
  'service',
  'finance',
  'stock',
  'readonly',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const PERMISSION_RESOURCES = [
  'tenants',
  'users',
  'roles',
  'departments',
  'divisions',
  'companies',
  'contacts',
  'leads',
  'opportunities',
  'activities',
  'calendar',
  'competitors',
  'brands',
  'products',
  'product_specs',
  'price_lists',
  'warehouses',
  'inventory',
  'customer_devices',
  'quotes',
  'sales_orders',
  'proformas',
  'contracts',
  'commercial_invoices',
  'accounting_invoices',
  'purchase_orders',
  'shipments',
  'installations',
  'service_tickets',
  'receivables',
  'payments',
  'files',
  'reports',
  'audit',
] as const;
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete', 'approve', 'reject', 'export'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const CURRENCIES = ['USD', 'EUR', 'TRY', 'GBP'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const COMPANY_RELATION_TYPES = ['customer', 'supplier', 'supplier_customer', 'competitor'] as const;
export type CompanyRelationType = (typeof COMPANY_RELATION_TYPES)[number];

export const COMPANY_STATUSES = ['potential', 'active', 'passive', 'blacklist'] as const;
export type CompanyStatusCode = (typeof COMPANY_STATUSES)[number];

export const INVENTORY_STATUSES = ['available', 'reserved', 'sold', 'in_transit', 'damaged', 'returned'] as const;
export type InventoryStatusCode = (typeof INVENTORY_STATUSES)[number];

export const QUOTE_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'expired', 'pending_super_admin_approval'] as const;
export type QuoteStatusCode = (typeof QUOTE_STATUSES)[number];

export const SALES_ORDER_STATUSES = ['draft', 'confirmed', 'reserved', 'fulfilled', 'cancelled'] as const;
export type SalesOrderStatusCode = (typeof SALES_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = ['draft', 'pending_manager_approval', 'sent', 'approved', 'in_transit', 'received', 'cancelled'] as const;
export type PurchaseOrderStatusCode = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['pending', 'partial', 'paid', 'overdue', 'cancelled'] as const;
export type PaymentStatusCode = (typeof PAYMENT_STATUSES)[number];

export const FILE_DOCUMENT_TYPES = [
  'product_image',
  'quote_pdf',
  'proforma_pdf',
  'contract_pdf',
  'commercial_invoice_pdf',
  'accounting_invoice_pdf',
  'stock_document',
  'service_document',
  'delivery_form',
  'installation_form',
  'activity_document',
  'service_complaint_evidence',
  'customs_document',
  'other',
] as const;
export type FileDocumentTypeCode = (typeof FILE_DOCUMENT_TYPES)[number];

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  // Sesli mesaj / ses ekleri (kurum içi sohbet). MediaRecorder genelde audio/webm üretir.
  'audio/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/mp4',
  'audio/wav',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_FILE_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'png', 'jpg', 'jpeg', 'webp', 'webm', 'mp3', 'ogg', 'm4a', 'wav'] as const;
export type AllowedFileExtension = (typeof ALLOWED_FILE_EXTENSIONS)[number];

// Stage transition rules (bölüm 3 mega prompt'tan)
// Maps each stage to the stages it can transition FROM
export const STAGE_TRANSITIONS: Record<PipelineStageCode, PipelineStageCode[]> = {
  // Görüşme sonrası "henüz erken" çıkan kart lead havuzuna geri çekilebilir.
  lead: ['call'],
  sales: ['lead'],
  call: ['lead', 'sales', 'visit'],
  visit: ['lead', 'sales', 'call'],
  cancelled: [
    'lead',
    'sales',
    'call',
    'visit',
    'quote',
    'proforma',
    'contract',
    'payment_plan',
    'commercial_invoice',
    'customs_approved',
    'stock_picking',
    'shipping',
    'installation',
  ],
  quote: ['lead', 'sales', 'call', 'visit'],
  proforma: ['quote'],
  contract: ['proforma', 'quote'],
  payment_plan: ['contract'],
  commercial_invoice: ['payment_plan'],
  customs_approved: ['commercial_invoice'],
  stock_picking: ['customs_approved'],
  shipping: ['stock_picking'],
  installation: ['shipping'],
  delivered: ['installation'],
};

// Stage carry-over rules — STAGE_TRANSITIONS'ın veri ikizi.
// STAGE_TRANSITIONS "hangi aşamadan geçilebilir"i (guard) söyler;
// STAGE_CARRYOVER bir sonraki adıma "hangi alanların otomatik taşınacağını" söyler.
// UI formları (ör. QuoteDialog) hedef aşamayı, önceki kaydın bu alanlarıyla ön-doldurur.
// Böylece her departman aynı bağlantı mantığını paylaşır: sonraki adımın girdileri
// önceki adımın verisinden türetilir.
export type StageCarryover = {
  // Bu aşamanın hangi önceki aşamalardan beslendiği (STAGE_TRANSITIONS ile uyumlu olmalı).
  from: PipelineStageCode[];
  // Önceki kayıttan bir sonraki forma taşınacak alan adları (kaynak entity'nin anahtarları).
  carries: readonly string[];
};

export const STAGE_CARRYOVER: Partial<Record<PipelineStageCode, StageCarryover>> = {
  // Faz 1 · Satış → Teklif: firma + talep edilen ürün/model/adet + para birimi teklife taşınır.
  quote: {
    from: ['lead', 'sales', 'call', 'visit'],
    carries: ['customerId', 'requestedProduct', 'requestedModel', 'quantity', 'currency'],
  },
};

// Bir kayıttan, hedef aşamanın carry-over sözleşmesinde tanımlı alanları seçip döndürür.
// Tanımsız aşama ya da eksik alanlar için sessizce atlar — guard'ı çağıran taraf yapar.
export function pickStageCarryover<T extends Record<string, unknown>>(
  source: T,
  targetStage: PipelineStageCode,
): Partial<T> {
  const spec = STAGE_CARRYOVER[targetStage];
  if (!spec) return {};
  const out: Partial<T> = {};
  for (const field of spec.carries) {
    if (field in source) out[field as keyof T] = source[field as keyof T];
  }
  return out;
}
