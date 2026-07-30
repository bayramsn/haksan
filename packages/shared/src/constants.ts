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

/**
 * 14 operasyon aşamasının hangi satış derecesine karşılık geldiği. Operasyon
 * aşamaları derecelerin ALT ADIMLARIdır: pano kolonları derece (7 kolon),
 * kartın içindeki ilerleme çubuğu operasyon aşamasıdır.
 *
 * Kaynak: 0087_opportunity_qualification_pipeline.sql içindeki tek seferlik
 * geri doldurma eşlemesi; oradaki mantık burada kalıcı hâle getirildi.
 *
 * NOT: `sales` dizide 5. sırada görünse de STAGE_TRANSITIONS'a göre yalnız
 * `lead`den gelir ve `call`/`visit`/`quote` ondan beslenir — yani huninin
 * BAŞINDA yer alır. Bu yüzden C derecesine eşlenir, teklif sonrasına değil.
 */
export const PIPELINE_STAGE_QUALIFICATION: Record<PipelineStageCode, QualificationStageCode> = {
  lead: 'lead',
  sales: 'c',
  call: 'b',
  visit: 'b',
  quote: 'a',
  proforma: 'a',
  contract: 'a',
  payment_plan: 'a',
  commercial_invoice: 'a_plus',
  customs_approved: 'a_plus',
  stock_picking: 'a_plus',
  shipping: 'a_plus',
  installation: 'a_plus',
  delivered: 'win',
  cancelled: 'lost',
};

/**
 * Her operasyon aşamasının backend'de gerçekten zorunlu tuttuğu ön koşul ve
 * tetiklediği yan etki. Metinler opportunities.service.ts#changeStage içindeki
 * kontrollerin birebir karşılığıdır — UI bu listeyi gösterirken kullanıcıya
 * olmayan bir kural vaat etmez.
 */
export const PIPELINE_STAGE_REQUIREMENTS: Record<
  PipelineStageCode,
  { requires: string | null; effect: string | null }
> = {
  lead: { requires: null, effect: 'Satış kartı lead havuzunda açılır.' },
  call: { requires: null, effect: null },
  visit: { requires: null, effect: null },
  quote: { requires: 'Firma bağlı olmalı ve en az bir teklif kaydı bulunmalı', effect: null },
  sales: { requires: null, effect: null },
  proforma: { requires: null, effect: null },
  contract: { requires: 'Sözleşme dosyası yüklenmiş olmalı', effect: null },
  payment_plan: { requires: null, effect: null },
  commercial_invoice: {
    requires: 'Ödeme planı oluşturulmuş ve ticari fatura dosyası yüklenmiş olmalı',
    effect: null,
  },
  customs_approved: { requires: null, effect: null },
  stock_picking: {
    requires: 'En az bir seri no seçilmeli (tek uygun stok varsa otomatik seçilir)',
    effect: 'Seçilen seri nolar firmaya rezerve edilir ve stok hareketi yazılır.',
  },
  shipping: { requires: null, effect: null },
  installation: {
    requires: null,
    effect: 'Garanti/müşteri cihaz kaydı ve servis ekibine kurulum işi açılır.',
  },
  delivered: { requires: null, effect: 'Fırsat kazanıldı sayılır ve garanti kayıtları tamamlanır.' },
  cancelled: { requires: 'İptal nedeni zorunlu', effect: 'Kart LOST derecesine düşer.' },
};

/**
 * Bir satış derecesine geçildiğinde kartın düşeceği operasyon aşaması — o
 * derecenin "alanına" giriş noktası. Derece ile aşamanın birbirinden kopmaması
 * için iki eksen bu tablo üzerinden çekilir.
 *
 * `gated: true` olan giriş aşamaları somut kanıt ister (teklif kaydı, fatura
 * dosyası vb.). Bu aşamalara YALNIZ changeStage üzerinden, kapıdan geçerek
 * girilir; derece ilerletmesi kartı oraya kendiliğinden taşımaz — aksi hâlde
 * "Ticari Fatura aşamasında ama faturası yok" gibi yalan bir kayıt doğar.
 */
export const QUALIFICATION_STAGE_ENTRY: Record<
  QualificationStageCode,
  { stage: PipelineStageCode; gated: boolean }
> = {
  lead: { stage: 'lead', gated: false },
  c: { stage: 'sales', gated: false },
  b: { stage: 'call', gated: false },
  a: { stage: 'quote', gated: true },
  a_plus: { stage: 'commercial_invoice', gated: true },
  win: { stage: 'delivered', gated: false },
  lost: { stage: 'cancelled', gated: false },
};

/** Derecelerin ilerleyiş sırası; kapanış dereceleri sona eklenir. */
const GRADE_FLOW_ORDER: QualificationStageCode[] = ['lead', 'c', 'b', 'a', 'a_plus', 'win'];

/**
 * 14 operasyon aşamasının SÜREÇ sırası — derece alanlarına göre gruplanmış hâli.
 *
 * PIPELINE_STAGES dizisi bildirim sırasıdır, süreç sırası değil: `sales` orada
 * `quote` ile `proforma` arasında durur, oysa C alanına aittir. Ham diziyi
 * ilerleme çubuğunda kullanmak bantları "… A → C → A …" diye zikzak yaptırır.
 * Bu liste aşamaları derece alanlarına göre sıralar, böylece çubuk tek yönlü
 * ilerler. `cancelled` akış dışıdır ve listede yer almaz.
 */
export const PIPELINE_STAGE_FLOW: PipelineStageCode[] = GRADE_FLOW_ORDER.flatMap((grade) =>
  PIPELINE_STAGES.filter(
    (stage) => stage !== 'cancelled' && PIPELINE_STAGE_QUALIFICATION[stage] === grade
  )
);

/** Bir satış derecesinin kapsadığı operasyon aşamaları (kart içi ilerleme çubuğu). */
export const QUALIFICATION_STAGE_PIPELINE_STEPS: Record<QualificationStageCode, PipelineStageCode[]> =
  PIPELINE_STAGES.reduce(
    (acc, stage) => {
      acc[PIPELINE_STAGE_QUALIFICATION[stage]].push(stage);
      return acc;
    },
    {
      lead: [] as PipelineStageCode[],
      c: [] as PipelineStageCode[],
      b: [] as PipelineStageCode[],
      a: [] as PipelineStageCode[],
      a_plus: [] as PipelineStageCode[],
      win: [] as PipelineStageCode[],
      lost: [] as PipelineStageCode[],
    } as Record<QualificationStageCode, PipelineStageCode[]>
  );

/**
 * Bir kartın aşamada takılı kalabileceği üst süre (gün). Aşılan kart "çürüyen"
 * sayılır: engelleyici değildir, yalnız panoda işaretlenir ve bildirim üretir.
 * Aşama yaşı `qualificationUpdatedAt` üzerinden hesaplanır.
 */
export const QUALIFICATION_STAGE_AGE_LIMIT_DAYS: Record<QualificationStageCode, number | null> = {
  lead: 7,
  c: 14,
  b: 30,
  a: 30,
  a_plus: 45,
  win: null,
  lost: null,
};

/** Aşamaya karşılık gelen varsayılan kazanma olasılığı (%). */
export const QUALIFICATION_STAGE_PROBABILITY: Record<QualificationStageCode, number> = {
  lead: 5,
  c: 10,
  b: 30,
  a: 60,
  a_plus: 85,
  win: 100,
  lost: 0,
};

/**
 * Lead takip durumlarının yanıt süresi (saat). Süre `leadStatusUpdatedAt`
 * üzerinden işler; null olan durumlar (elenmiş) sayaç tutmaz.
 * `waiting` durumunda saat yerine kartın kendi `nextActionAt` tarihi geçerlidir.
 */
export const LEAD_FOLLOW_UP_SLA_HOURS: Record<LeadFollowUpStatusCode, number | null> = {
  new: 4,
  attempting: 24 * 7,
  contacted: 48,
  waiting: null,
  disqualified: null,
};

export const LEAD_FOLLOW_UP_STATUSES = ['new', 'attempting', 'contacted', 'waiting', 'disqualified'] as const;
export type LeadFollowUpStatusCode = (typeof LEAD_FOLLOW_UP_STATUSES)[number];

/** Bu sayıya ulaşan denemeden sonra kart beklemeye alınmalıdır. */
export const LEAD_MAX_CONTACT_ATTEMPTS = 3;

/** Hareketsiz `waiting` lead'in nurture arşivine düşmesi için gün sayısı. */
export const LEAD_NURTURE_AFTER_DAYS = 90;

/**
 * Lead eleme nedenleri. LOST nedenleriyle aynı `cancellation_reasons` tablosunu
 * paylaşır; backend kodu bulamazsa satırı kendisi açar (LostCaseDialog ile aynı desen).
 */
export const LEAD_DISQUALIFY_REASONS = [
  { code: 'lead_no_budget', name: 'Bütçe yok' },
  { code: 'lead_no_authority', name: 'Karar verici değil' },
  { code: 'lead_no_need', name: 'Şu an ihtiyaç yok' },
  { code: 'lead_bought_competitor', name: 'Rakipten aldı' },
  { code: 'lead_unreachable', name: 'Ulaşılamadı' },
  { code: 'lead_wrong_contact', name: 'Hatalı iletişim bilgisi' },
  { code: 'lead_duplicate', name: 'Mükerrer kayıt' },
  { code: 'lead_not_relevant', name: 'İlgisiz / spam' },
] as const;
export type LeadDisqualifyReasonCode = (typeof LEAD_DISQUALIFY_REASONS)[number]['code'];

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

export const SALES_ORDER_STATUSES = ['draft', 'pending_super_admin_approval', 'confirmed', 'reserved', 'fulfilled', 'cancelled'] as const;
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
  'stock_document',
  'service_document',
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
