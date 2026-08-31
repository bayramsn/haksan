import { z } from 'zod';
import { moneySchema } from './common';
import {
  LEAD_FOLLOW_UP_STATUSES,
  LEAD_AUTHORITY_STATUSES,
  LEAD_BUDGET_STATUSES,
  LEAD_PURCHASE_TIMEFRAMES,
  LEAD_TECHNICAL_FITS,
  LEAD_CONTACT_CHANNELS,
  LEAD_CONTACT_OUTCOMES,
  OPPORTUNITY_APPROVAL_STATUSES,
  OPPORTUNITY_APPROVAL_TYPES,
  OPPORTUNITY_PAYMENT_METHODS,
  PIPELINE_STAGES,
  QUALIFICATION_STAGES,
  type OpportunityApprovalType,
  type PipelineStageCode,
} from '../constants';

export const pipelineStageEnum = z.enum(PIPELINE_STAGES);

export const opportunityPaymentMethodEnum = z.enum(OPPORTUNITY_PAYMENT_METHODS);
export type OpportunityPaymentMethod = z.infer<typeof opportunityPaymentMethodEnum>;

// Lead sıcaklığı — firmanın alım niyeti. Satış ekibi kartı açmadan önceliklendirir.
export const leadTemperatureEnum = z.enum(['hot', 'waiting', 'cold', 'unknown']);
export type LeadTemperature = z.infer<typeof leadTemperatureEnum>;

// Lead takip durumu, lead'in satış derecesinden bağımsız günlük çalışma durumudur.
export const leadFollowUpStatusEnum = z.enum(LEAD_FOLLOW_UP_STATUSES);
export type LeadFollowUpStatus = z.infer<typeof leadFollowUpStatusEnum>;
export const leadAuthorityStatusEnum = z.enum(LEAD_AUTHORITY_STATUSES);
export const leadBudgetStatusEnum = z.enum(LEAD_BUDGET_STATUSES);
export const leadPurchaseTimeframeEnum = z.enum(LEAD_PURCHASE_TIMEFRAMES);
export const leadTechnicalFitEnum = z.enum(LEAD_TECHNICAL_FITS);
export const leadContactChannelEnum = z.enum(LEAD_CONTACT_CHANNELS);
export const leadContactOutcomeEnum = z.enum(LEAD_CONTACT_OUTCOMES);

const opportunityInputSchema = z.object({
  companyId: z.string().min(1).nullish(),
  /**
   * Fırsat dışı bir aktiviteden oluşturuluyorsa aktiviteyi aynı transaction'da
   * yeni fırsata bağlar. Genel fırsat oluşturma çağrılarında gönderilmez.
   */
  sourceActivityId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  primaryContactId: z.string().min(1).nullish(),
  // Null, kaydı yeniden sahipsiz havuza bırakmak için açıkça desteklenir.
  ownerUserId: z.string().uuid().nullish(),
  title: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
  // Firma kaydı henüz açılmamış hızlı lead bilgileri. Firma bağlandıktan sonra
  // geçmiş/bağlam olarak satış kartında korunur.
  leadContactName: z.string().trim().min(1).max(255).nullish(),
  leadCompanyTitle: z.string().trim().max(255).nullish(),
  leadContactValue: z.string().trim().max(320).nullish(),
  leadCity: z.string().trim().max(120).nullish(),
  leadDistrict: z.string().trim().max(120).nullish(),
  leadPhone: z.string().trim().max(64).nullish(),
  leadEmail: z.string().trim().max(254).nullish(),
  leadTemperature: leadTemperatureEnum.nullish(),
  leadFollowUpStatus: leadFollowUpStatusEnum.nullish(),
  leadNeedSummary: z.string().trim().max(2000).nullish(),
  leadAuthorityStatus: leadAuthorityStatusEnum.nullish(),
  leadBudgetStatus: leadBudgetStatusEnum.nullish(),
  leadPurchaseTimeframe: leadPurchaseTimeframeEnum.nullish(),
  leadTechnicalFit: leadTechnicalFitEnum.nullish(),
  leadTechnicalNote: z.string().trim().max(2000).nullish(),
  // Lead "disqualified" durumuna alınırken zorunlu; LOST nedenleriyle aynı
  // lookup tablosuna yazılır, kod yoksa backend satırı kendisi açar.
  disqualifyReasonCode: z.string().trim().max(64).nullish(),
  // Satış derecesi/eleme kararının serbest metin gerekçesi.
  qualificationNote: z.string().trim().max(1000).nullish(),
  // Lead ve fırsat kartlarında ekibin bir sonraki somut işi.
  nextAction: z.string().trim().max(1000).nullish(),
  nextActionAt: z.coerce.date().nullish(),
  estimatedValue: moneySchema.optional(),
  currencyCode: z.string().max(8).default('USD'),
  probability: z.coerce.number().int().min(0).max(100).default(50),
  expectedCloseDate: z.coerce.date().optional(),
  sourceCode: z.string().max(64).optional(),
  // Makine satışında ödeme vadesi (gün). Sözleşme/ödeme planı için varsayılan.
  paymentTermDays: z.coerce.number().int().min(0).max(3650).nullish(),
  // Lead kartında seçilen ticari ödeme yöntemi.
  paymentMethod: opportunityPaymentMethodEnum.nullish(),
  // Yeni C/B/A satış derecelendirmesinde ayrı takip edilen ticari alanlar.
  requestedMachine: z.string().trim().max(255).nullish(),
  contractTerms: z.string().trim().max(4000).nullish(),
  paymentTerms: z.string().trim().max(4000).nullish(),
  // Kazanılan fırsat için kabul/kazanma nedeni (yıl sonu raporu).
  wonReason: z.string().max(255).nullish(),
});

/** Lead elenirken neden kodu zorunludur; create ve update aynı kuralı paylaşır. */
const requireDisqualifyReason = (
  value: { leadFollowUpStatus?: LeadFollowUpStatus | null; disqualifyReasonCode?: string | null },
  context: z.RefinementCtx
) => {
  if (value.leadFollowUpStatus === 'disqualified' && !value.disqualifyReasonCode?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Fırsat uygun değil olarak işaretlenirken neden zorunludur.',
      path: ['disqualifyReasonCode'],
    });
  }
};

export const opportunityCreateSchema = opportunityInputSchema.superRefine((value, context) => {
  if (!value.companyId && !value.leadContactName?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Firma seçilmediyse kontak ismi zorunludur.',
      path: ['leadContactName'],
    });
  }
  if (value.nextActionAt && !value.nextAction?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Takip zamanı için sonraki aksiyon zorunludur.',
      path: ['nextAction'],
    });
  }
  requireDisqualifyReason(value, context);
});
export type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>;

export const trelloImportPreviewRequestSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((value) => value.toLocaleLowerCase('tr-TR').endsWith('.csv'), 'Yalnızca .csv dosyası desteklenir'),
  // 2 MB ham dosyanın Base64 karşılığı için güvenli üst sınır.
  fileBase64: z.string().min(1).max(3_000_000),
});
export type TrelloImportPreviewRequest = z.infer<typeof trelloImportPreviewRequestSchema>;

export const trelloImportRowSchema = z
  .object({
    rowNumber: z.coerce.number().int().positive(),
    trelloCardId: z.string().trim().max(128).optional(),
    externalReference: z.string().trim().min(1).max(320),
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(3200).optional(),
    boardName: z.string().trim().max(255).optional(),
    listName: z.string().trim().max(255).optional(),
    cardUrl: z.string().url().max(512).optional(),
    labels: z.string().trim().max(1000).optional(),
    members: z.string().trim().max(1000).optional(),
    dueAt: z.string().datetime().optional(),
    trelloCreatedAt: z.string().datetime().optional(),
    archived: z.boolean().default(false),
    stageCode: pipelineStageEnum.default('sales'),
  })
  .superRefine((value, context) => {
    if (!value.trelloCardId && !value.cardUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Trello kart kimliği veya kart bağlantısı zorunludur.',
        path: ['trelloCardId'],
      });
    }
  });
export type TrelloImportRowInput = z.infer<typeof trelloImportRowSchema>;

export const trelloCompanyCandidateSchema = z.object({
  companyTitle: z.string().trim().min(1).max(255),
  locationHint: z.string().trim().max(160).optional(),
  province: z.string().trim().max(64).optional(),
  district: z.string().trim().max(64).optional(),
  contactName: z.string().trim().max(255).optional(),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine((value) => value.replace(/\D/g, '').length >= 7, 'Telefon en az 7 rakam içermelidir')
    .optional(),
  email: z.string().trim().email().max(254).optional(),
  website: z.string().trim().url().max(512).optional(),
  taxNumber: z.string().trim().max(32).optional(),
});
export type TrelloCompanyCandidate = z.infer<typeof trelloCompanyCandidateSchema>;

export const trelloCompanyResolutionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('existing'),
    companyId: z.string().uuid(),
    primaryContactId: z.string().uuid().optional(),
    createContact: z.boolean().default(false),
    addSecondaryPhone: z.boolean().default(false),
    addSecondaryEmail: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('create'),
    createContact: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('skip'),
  }),
]);
export type TrelloCompanyResolution = z.infer<typeof trelloCompanyResolutionSchema>;

export const trelloResolvedImportRowSchema = trelloImportRowSchema.and(
  z.object({
    candidate: trelloCompanyCandidateSchema,
    resolution: trelloCompanyResolutionSchema,
  })
);
export type TrelloResolvedImportRowInput = z.infer<typeof trelloResolvedImportRowSchema>;

export const trelloImportCommitRequestSchema = z.object({
  divisionId: z.string().uuid(),
  currencyCode: z.enum(['USD', 'EUR', 'TRY', 'GBP']).default('EUR'),
  rows: z.array(trelloResolvedImportRowSchema).min(1).max(500),
});
export type TrelloImportCommitRequest = z.infer<typeof trelloImportCommitRequestSchema>;

export const opportunityUpdateSchema = opportunityInputSchema.partial().superRefine(requireDisqualifyReason);
export type OpportunityUpdateInput = z.infer<typeof opportunityUpdateSchema>;

export const opportunityQualificationStageEnum = z.enum(QUALIFICATION_STAGES);
export type OpportunityQualificationStage = z.infer<typeof opportunityQualificationStageEnum>;

export const opportunityConvertSchema = z.object({
  note: z.string().trim().max(1000).optional(),
  overrideReason: z.string().trim().max(1000).optional(),
});
export type OpportunityConvertInput = z.infer<typeof opportunityConvertSchema>;

export const leadContactEventSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    channel: leadContactChannelEnum,
    outcome: leadContactOutcomeEnum,
    note: z.string().trim().max(2000).optional(),
    nextAction: z.string().trim().max(1000).nullish(),
    nextActionAt: z.coerce.date().nullish(),
  })
  .superRefine((value, context) => {
    if (value.nextActionAt && !value.nextAction?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Takip zamanı için sonraki aksiyon zorunludur.',
        path: ['nextAction'],
      });
    }
  });
export type LeadContactEventInput = z.infer<typeof leadContactEventSchema>;

const leadAssignmentCriteriaSchema = z.object({
  cities: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  productTerms: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  sourceCodes: z.array(z.string().trim().min(1).max(64)).max(100).default([]),
});

export const leadAssignmentRuleCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  priority: z.coerce.number().int().min(0).max(10_000).default(100),
  active: z.boolean().default(true),
  divisionId: z.string().uuid().nullish(),
  criteria: leadAssignmentCriteriaSchema.default({ cities: [], productTerms: [], sourceCodes: [] }),
  assigneeUserIds: z.array(z.string().uuid()).min(1).max(100),
});
export const leadAssignmentRuleUpdateSchema = leadAssignmentRuleCreateSchema.partial();
export type LeadAssignmentRuleCreateInput = z.infer<typeof leadAssignmentRuleCreateSchema>;
export type LeadAssignmentRuleUpdateInput = z.infer<typeof leadAssignmentRuleUpdateSchema>;

export const opportunityQualificationChangeSchema = z.object({
  // Lead, fırsat akışının İLK adımıdır; ayrı bir "Bugünüm" sayfası yerine
  // panonun ilk kolonu olarak yaşar, bu yüzden geçerli bir hedeftir.
  toStage: opportunityQualificationStageEnum,
  note: z.string().trim().max(1000).optional(),
  cancellationReasonCode: z.string().trim().max(64).optional(),
  lostCompetitorId: z.string().uuid().optional(),
  lostCompetitorName: z.string().trim().min(1).max(255).optional(),
  lostCompetitorProductModel: z.string().trim().max(255).optional(),
  lostProductName: z.string().trim().max(512).optional(),
  lostUnmetConditions: z.string().trim().max(2000).optional(),
});
export type OpportunityQualificationChangeInput = z.infer<typeof opportunityQualificationChangeSchema>;

/**
 * Satış henüz kaybedilmediğinde kartı açık tutup somut bir ileri takip kurar.
 * Aynı işlem opportunity.next_action alanını ve bağlı CRM görevini birlikte yazar.
 */
export const opportunityDeferSchema = z.object({
  reason: z.string().trim().min(3, 'Takip gerekçesi zorunludur.').max(1000),
  nextAction: z.string().trim().min(3, 'Sonraki aksiyon zorunludur.').max(1000),
  followUpAt: z.coerce.date(),
});
export type OpportunityDeferInput = z.infer<typeof opportunityDeferSchema>;

export const opportunityProcessActionKeys = [
  'assign_owner',
  'edit_subject',
  'link_company',
  'edit_company',
  'link_contact',
  'create_contact',
  'record_call',
  'record_visit',
  'record_first_contact',
  'edit_machine',
  'edit_payment_method',
  'edit_contract_terms',
  'edit_payment_terms',
  'create_quote',
  'approve_quote',
  'create_proforma',
  'create_contract',
  'create_payment_plan',
  'create_commercial_invoice',
  'approve_customs',
  'reserve_stock',
  'create_shipment',
  'complete_shipment',
  'open_installation',
  'complete_installation',
  'approve_payment',
  'approve_invoice',
  'approve_installation',
  'approve_win',
] as const;
export type OpportunityProcessActionKey = (typeof opportunityProcessActionKeys)[number];

export const opportunityProcessCheckStatusEnum = z.enum(['done', 'not_done']);
export type OpportunityProcessCheckStatus = z.infer<typeof opportunityProcessCheckStatusEnum>;

/**
 * A+ adımının elle işaretlenmesi. `status: null` işareti kaldırır ve adım
 * yeniden kanıttan (fatura, sevkiyat, kurulum kaydı...) türetilir.
 */
export const opportunityProcessCheckUpsertSchema = z.object({
  status: opportunityProcessCheckStatusEnum.nullable(),
  note: z.string().trim().max(2000).nullish(),
});
export type OpportunityProcessCheckUpsertInput = z.infer<typeof opportunityProcessCheckUpsertSchema>;

export type ProcessCheck = {
  key: string;
  label: string;
  complete: boolean;
  actionKey: OpportunityProcessActionKey;
  stageCode?: PipelineStageCode;
  qualificationStage?: OpportunityQualificationStage;
  /** Adım elle işaretlenebilir mi (şimdilik yalnız A+ alanı). */
  manualEditable?: boolean;
  /** Elle verilen karar; yoksa `complete` kanıttan türetilmiştir. */
  manualStatus?: OpportunityProcessCheckStatus | null;
  /** Elle işaretlemenin gerekçesi / notu. */
  note?: string | null;
  noteUpdatedAt?: string | null;
  noteUpdatedByName?: string | null;
};

export type ProcessTarget = {
  axis: 'qualification' | 'operation';
  code: OpportunityQualificationStage | PipelineStageCode;
  direction: 'current' | 'forward' | 'backward';
  selectable: boolean;
  canTransition: boolean;
  requiresReason: boolean;
  blockers: ProcessCheck[];
  invalidatedApprovals: OpportunityApprovalType[];
};

export type OpportunityProcessReadiness = {
  currentQualificationStage: OpportunityQualificationStage;
  currentOperationStage: PipelineStageCode;
  closed: boolean;
  targets: ProcessTarget[];
  checks: ProcessCheck[];
};

export const opportunityApprovalTypeEnum = z.enum(OPPORTUNITY_APPROVAL_TYPES);
export const opportunityApprovalStatusEnum = z.enum(OPPORTUNITY_APPROVAL_STATUSES);

export const opportunityApprovalDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(1000).optional(),
});
export type OpportunityApprovalDecisionInput = z.infer<typeof opportunityApprovalDecisionSchema>;

export const opportunityCompanyLinkSchema = z.object({
  companyId: z.string().uuid(),
  createContact: z.boolean().default(true),
});
export type OpportunityCompanyLinkInput = z.infer<typeof opportunityCompanyLinkSchema>;

export const opportunityStageChangeSchema = z
  .object({
    toStage: pipelineStageEnum,
    changeReason: z.string().max(1000).optional(),
    cancellationReasonCode: z.string().max(64).optional(),
    lostCompetitorId: z.string().optional(),
    lostCompetitorName: z.string().trim().min(1).max(255).optional(),
    lostCompetitorProductModel: z.string().max(255).optional(),
    quoteId: z.string().optional(),
    inventoryItemIds: z.array(z.string()).optional(),
  })
  .refine(
    (val) => {
      if (val.toStage === 'cancelled') return !!val.cancellationReasonCode;
      return true;
    },
    { message: 'Cancelled aşamasına geçerken cancellation_reason zorunludur.', path: ['cancellationReasonCode'] }
  );
export type OpportunityStageChangeInput = z.infer<typeof opportunityStageChangeSchema>;

// Mantıksal kapanış ("Bitir") — opsiyonel gerekçe. Yalnız terminal (delivered/cancelled) fırsatlar.
export const opportunityCloseSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});
export type OpportunityCloseInput = z.infer<typeof opportunityCloseSchema>;

// Liste görünümü: active (kapatılmamış, varsayılan) | closed (Geçmiş/Arşiv) | all
export const opportunityViewEnum = z.enum(['active', 'closed', 'all']);
export type OpportunityView = z.infer<typeof opportunityViewEnum>;

export const visitCreateSchema = z.object({
  opportunityId: z.string().optional(),
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  visitDate: z.coerce.date(),
  visitLocation: z.string().max(255).optional(),
  visitPurpose: z.string().max(1000).optional(),
  visitResult: z.string().max(2000).optional(),
  nextAction: z.string().max(1000).optional(),
});
export type VisitCreateInput = z.infer<typeof visitCreateSchema>;

export const callCreateSchema = z.object({
  opportunityId: z.string().optional(),
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  callDate: z.coerce.date(),
  callResult: z.string().max(2000).optional(),
  nextAction: z.string().max(1000).optional(),
});
export type CallCreateInput = z.infer<typeof callCreateSchema>;

export const activityCreateSchema = z.object({
  opportunityId: z.string().optional(),
  companyId: z.string().min(1).optional(),
  contactId: z.string().optional(),
  activityTypeCode: z.string().max(64),
  subject: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
  activityDate: z.coerce.date(),
  nextFollowUpAt: z.coerce.date().optional(),
  result: z.string().max(2000).optional(),
});
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;

export const activityUpdateSchema = activityCreateSchema.partial().extend({
  opportunityId: z.string().nullable().optional(),
  companyId: z.string().min(1).nullable().optional(),
  contactId: z.string().nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  nextFollowUpAt: z.coerce.date().nullable().optional(),
  result: z.string().max(2000).nullable().optional(),
});
export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>;

export const competitorCreateSchema = z.object({
  name: z.string().min(1).max(255),
  website: z.string().url().max(512).optional(),
  notes: z.string().max(4000).optional(),
});
export type CompetitorCreateInput = z.infer<typeof competitorCreateSchema>;

export const competitorUpdateSchema = competitorCreateSchema.partial();
export type CompetitorUpdateInput = z.infer<typeof competitorUpdateSchema>;

export const competitorProductCreateSchema = z.object({
  modelCode: z.string().max(128).optional(),
  modelName: z.string().min(1).max(255),
  notes: z.string().max(4000).optional(),
});
export type CompetitorProductCreateInput = z.infer<typeof competitorProductCreateSchema>;
