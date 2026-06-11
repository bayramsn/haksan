// Lookup codes used by both backend (seed + state machine) and frontend (dropdowns)
// Keep in sync with database/seeds/001_lookup_seed.sql

export const PIPELINE_STAGES = [
  'lead',
  'sales',
  'call',
  'visit',
  'cancelled',
  'quote',
  'proforma',
  'contract',
  'commercial_invoice',
  'customs_approved',
  'stock_picking',
  'shipping',
  'installation',
  'delivered',
] as const;
export type PipelineStageCode = (typeof PIPELINE_STAGES)[number];

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
  'companies',
  'contacts',
  'leads',
  'opportunities',
  'activities',
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

export const COMPANY_RELATION_TYPES = ['customer', 'supplier', 'supplier_customer'] as const;
export type CompanyRelationType = (typeof COMPANY_RELATION_TYPES)[number];

export const COMPANY_STATUSES = ['potential', 'active', 'passive', 'blacklist'] as const;
export type CompanyStatusCode = (typeof COMPANY_STATUSES)[number];

export const INVENTORY_STATUSES = ['available', 'reserved', 'sold', 'in_transit', 'damaged', 'returned'] as const;
export type InventoryStatusCode = (typeof INVENTORY_STATUSES)[number];

export const QUOTE_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'expired'] as const;
export type QuoteStatusCode = (typeof QUOTE_STATUSES)[number];

export const SALES_ORDER_STATUSES = ['draft', 'confirmed', 'reserved', 'fulfilled', 'cancelled'] as const;
export type SalesOrderStatusCode = (typeof SALES_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = ['draft', 'sent', 'approved', 'in_transit', 'received', 'cancelled'] as const;
export type PurchaseOrderStatusCode = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['pending', 'partial', 'paid', 'overdue', 'cancelled'] as const;
export type PaymentStatusCode = (typeof PAYMENT_STATUSES)[number];

export const FILE_DOCUMENT_TYPES = [
  'product_image',
  'quote_pdf',
  'proforma_pdf',
  'contract_pdf',
  'commercial_invoice_pdf',
  'stock_document',
  'service_document',
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
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_FILE_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'png', 'jpg', 'jpeg', 'webp'] as const;
export type AllowedFileExtension = (typeof ALLOWED_FILE_EXTENSIONS)[number];

// Stage transition rules (bölüm 3 mega prompt'tan)
// Maps each stage to the stages it can transition FROM
export const STAGE_TRANSITIONS: Record<PipelineStageCode, PipelineStageCode[]> = {
  lead: [],
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
    'commercial_invoice',
    'customs_approved',
    'stock_picking',
    'shipping',
    'installation',
  ],
  quote: ['lead', 'sales', 'call', 'visit'],
  proforma: ['quote'],
  contract: ['proforma', 'quote'],
  commercial_invoice: ['contract'],
  customs_approved: ['commercial_invoice'],
  stock_picking: ['customs_approved'],
  shipping: ['stock_picking'],
  installation: ['shipping'],
  delivered: ['installation'],
};
