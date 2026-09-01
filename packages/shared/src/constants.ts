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
  quote: 'b',
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
  lead: { requires: null, effect: 'Fırsatın ilk adımı; yeni kartlar burada doğar.' },
  call: { requires: null, effect: null },
  visit: { requires: null, effect: null },
  quote: { requires: 'Firma bağlı olmalı ve en az bir teklif kaydı bulunmalı', effect: null },
  sales: { requires: null, effect: null },
  proforma: { requires: null, effect: null },
  contract: { requires: 'Sözleşme dosyası yüklenmiş olmalı', effect: null },
  payment_plan: { requires: null, effect: null },
  commercial_invoice: {
    // Fatura bu aşamada KESİLİR, aşamaya girmek için önceden var olması beklenmez;
    // faturanın varlığı WIN kapısında (delivered) aranır. Vadeli satışta ödeme
    // planı bu aşamadan önce kurulmuş olmalıdır — peşin ve leasingde plan yoktur.
    requires: 'Vadeli ödemede ödeme planı oluşturulmuş olmalı',
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
  delivered: {
    requires: 'Ticari fatura kesilmiş ve kurulum tamamlanmış olmalı',
    effect: 'Fırsat kazanıldı sayılır ve garanti kayıtları tamamlanır.',
  },
  cancelled: { requires: 'İptal nedeni zorunlu', effect: 'Kart LOST derecesine düşer.' },
};

/**
 * Bir satış derecesine geçildiğinde kartın düşeceği operasyon aşaması — o
 * derecenin "alanına" giriş noktası. Derece ile aşamanın birbirinden kopmaması
 * için iki eksen bu tablo üzerinden çekilir.
 *
 * `gated: true` olan giriş aşamaları somut kanıt ister (ör. teklif kaydı). Bu
 * aşamalara YALNIZ changeStage üzerinden, kapıdan geçerek girilir; derece
 * ilerletmesi kartı oraya kendiliğinden taşımaz — aksi hâlde "Teklif
 * aşamasında ama teklifi yok" gibi yalan bir kayıt doğar.
 */
export const QUALIFICATION_STAGE_ENTRY: Record<
  QualificationStageCode,
  { stage: PipelineStageCode; gated: boolean }
> = {
  lead: { stage: 'lead', gated: false },
  c: { stage: 'sales', gated: false },
  b: { stage: 'call', gated: false },
  // Teklif B alanının son işidir. A'ya geçiş, tamamlanmış teklif aşamasını
  // sınır kabul eder; böylece teklif B'de hazırlanır ve A teklif sonrasında başlar.
  a: { stage: 'quote', gated: true },
  // A+ alanının ilk işi ticari faturayı KESMEKtir; bu yüzden giriş aşaması
  // fatura adımıdır ama faturanın kendisi giriş koşulu değildir. Faturanın
  // varlığı kurulumla birlikte WIN kapısında aranır (bkz. PIPELINE_STAGE_REQUIREMENTS).
  a_plus: { stage: 'commercial_invoice', gated: true },
  win: { stage: 'delivered', gated: false },
  lost: { stage: 'cancelled', gated: false },
};

/**
 * Derecelerin ilerleyiş sırası; kapanış dereceleri sona eklenir.
 * Lead ayrı bir sayfa değil, fırsatın İLK adımıdır: yeni kartlar burada doğar
 * ve sorumlu + konu girildikten sonra C alanına ilerler.
 */
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

/** Lead Workspace V2 — endüstriyel satış nitelendirme eksenleri. */
export const LEAD_AUTHORITY_STATUSES = ['unknown', 'influencer', 'committee', 'decision_maker'] as const;
export type LeadAuthorityStatusCode = (typeof LEAD_AUTHORITY_STATUSES)[number];

export const LEAD_BUDGET_STATUSES = ['unknown', 'unavailable', 'estimated', 'approved'] as const;
export type LeadBudgetStatusCode = (typeof LEAD_BUDGET_STATUSES)[number];

export const LEAD_PURCHASE_TIMEFRAMES = [
  'unknown',
  'later',
  'six_to_twelve_months',
  'three_to_six_months',
  'zero_to_three_months',
  'immediate',
] as const;
export type LeadPurchaseTimeframeCode = (typeof LEAD_PURCHASE_TIMEFRAMES)[number];

export const LEAD_TECHNICAL_FITS = ['unknown', 'not_fit', 'needs_review', 'fit'] as const;
export type LeadTechnicalFitCode = (typeof LEAD_TECHNICAL_FITS)[number];

export const LEAD_CONTACT_CHANNELS = ['phone', 'email', 'whatsapp'] as const;
export type LeadContactChannelCode = (typeof LEAD_CONTACT_CHANNELS)[number];

export const LEAD_CONTACT_OUTCOMES = [
  'no_answer',
  'contacted',
  'callback',
  'requested_info',
  'meeting_booked',
  'not_interested',
  'wrong_contact',
] as const;
export type LeadContactOutcomeCode = (typeof LEAD_CONTACT_OUTCOMES)[number];

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

export const OPPORTUNITY_PAYMENT_METHODS = [
  'undecided',
  'cash',
  'wire_transfer',
  'promissory_note',
  'term',
  'installment',
  'leasing',
  'letter_of_credit',
  'cheque',
] as const;
export type OpportunityPaymentMethodCode = (typeof OPPORTUNITY_PAYMENT_METHODS)[number];

/**
 * Ödeme yönteminin tahsilat şekli. Satış ekibi kartta önce şekli seçer
 * (Peşin / Leasing / Vadeli); vade türü (elden, senet, çek) yalnız vadelide
 * sorulur ve yöntem kodunun kendisiyle taşınır.
 */
export const OPPORTUNITY_PAYMENT_SHAPES = ['undecided', 'cash', 'leasing', 'term'] as const;
export type OpportunityPaymentShape = (typeof OPPORTUNITY_PAYMENT_SHAPES)[number];

export const OPPORTUNITY_PAYMENT_METHOD_SHAPE: Record<
  OpportunityPaymentMethodCode,
  OpportunityPaymentShape
> = {
  undecided: 'undecided',
  // Havale de bedelin tamamının vadesiz tahsilidir; peşinle aynı şekildedir.
  cash: 'cash',
  wire_transfer: 'cash',
  leasing: 'leasing',
  // Vadeli tahsilatın türleri: elden (term), senet, çek. Taksit ve akreditif
  // eski kayıtlardan gelir; ikisi de vade tablosu gerektirdiği için buradadır.
  term: 'term',
  promissory_note: 'term',
  cheque: 'term',
  installment: 'term',
  letter_of_credit: 'term',
};

/** Vadeli satışta sorulan vade türleri (sıra UI'daki gösterim sırasıdır). */
export const OPPORTUNITY_TERM_PAYMENT_METHODS = ['term', 'promissory_note', 'cheque'] as const;

export const paymentShapeOf = (method?: string | null): OpportunityPaymentShape =>
  OPPORTUNITY_PAYMENT_METHOD_SHAPE[(method ?? 'undecided') as OpportunityPaymentMethodCode] ?? 'undecided';

/**
 * Kartın vade satırlarından oluşan bir ödeme planı gerektirip gerektirmediği.
 *
 * Peşinde tahsilat tek seferdir, leasingde taksitleri finans kuruluşu takip
 * eder — ikisinde de CRM'de plan tutmak boş satır üretmekten başka bir şey
 * yapmıyordu. Yöntem henüz seçilmemişse plan beklenir; aksi hâlde kart
 * "belirlenmedi" durumunda kalıp adımı sessizce atlardı.
 */
export const requiresPaymentPlan = (method?: string | null): boolean => {
  const shape = paymentShapeOf(method);
  return shape !== 'cash' && shape !== 'leasing';
};

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
  'lead_assignment_rules',
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
  'meta',
  'meta_campaigns',
  'meta_messages',
  'meta_audiences',
  'meta_catalogs',
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
  'company_logo',
  'brand_logo',
  'signature',
  'quote_pdf',
  'external_quote',
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
  'image/gif',
  // Sesli mesaj / ses ekleri (kurum içi sohbet). MediaRecorder genelde audio/webm üretir.
  'audio/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/mp4',
  'audio/wav',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_FILE_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'webm', 'mp3', 'ogg', 'm4a', 'wav'] as const;
export type AllowedFileExtension = (typeof ALLOWED_FILE_EXTENSIONS)[number];

// Stage transition rules (bölüm 3 mega prompt'tan)
// Maps each stage to the stages it can transition FROM
export const STAGE_TRANSITIONS: Record<PipelineStageCode, PipelineStageCode[]> = {
  // Kartlar `lead` aşamasında DOĞAR; operasyon ekseninde buraya geri taşınmaz.
  // Panodan Lead kolonuna geri alma satış derecesi ekseninden yapılır
  // (changeQualificationStage aşamayı doğrudan yazar).
  lead: [],
  sales: ['lead'],
  call: ['sales', 'visit'],
  visit: ['sales', 'call'],
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
  quote: ['sales', 'call', 'visit'],
  proforma: ['quote'],
  contract: ['proforma', 'quote'],
  payment_plan: ['contract'],
  // Peşin/leasing kartları ödeme planı üretmez ve sözleşmeden doğrudan fatura
  // aşamasına geçer; vadeli kartlarda backend yine plan kaydını zorunlu tutar.
  commercial_invoice: ['contract', 'payment_plan'],
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

/**
 * Ziyaret adımında "Yapılmadı" seçilince aktivitenin `result` alanına yazılan
 * metin. Sayımlar bu kaydı ziyaret saymaz; metin iki tarafta da aynı olsun
 * diye tek yerde durur (web seçim ekranı ↔ API raporları).
 */
export const VISIT_NOT_DONE_RESULT = 'Ziyaret yapılmadı';
