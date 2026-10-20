/**
 * Satış çekirdeğinin (fırsat listesi, kanban, gösterge paneli) saf mantığı.
 * Kurallar web `QualificationKanban`, `SalesCases`, `chartAggregates` ile aynı;
 * node:test doğrudan import ettiği için alias/React kullanılmaz.
 */

export const QUALIFICATION_ORDER = ['lead', 'c', 'b', 'a', 'a_plus', 'win', 'lost'] as const;
export type Qualification = (typeof QUALIFICATION_ORDER)[number];

export const QUALIFICATION_LABELS: Record<Qualification, string> = {
  lead: 'Lead',
  c: 'C',
  b: 'B',
  a: 'A',
  a_plus: 'A+',
  win: 'WIN',
  lost: 'LOST',
};

export const QUALIFICATION_DESCRIPTIONS: Record<Qualification, string> = {
  lead: 'Yeni kayıt · ilk temas',
  c: 'Yeni müşteri',
  b: 'Ara sıcak · satışa hazır',
  a: 'Bitmeye yakın · takipte',
  a_plus: 'Bitmiş · WIN bekliyor',
  win: 'Kazanılmış',
  lost: 'Kaybedildi',
};

/**
 * Pano kolonları: Lead → C → B → A → A+ → WIN → LOST. Web kanbanı LOST'u
 * göstermez; mobilde kayıp ayrıntısı ve "LOST'tan geri al" için son kolondur.
 */
export const BOARD_STAGES: Qualification[] = [...QUALIFICATION_ORDER];

export function asQualification(value: string | null | undefined): Qualification {
  return (QUALIFICATION_ORDER as readonly string[]).includes(value ?? '') ? (value as Qualification) : 'lead';
}

export function qualificationRank(value: string | null | undefined): number {
  return QUALIFICATION_ORDER.indexOf(asQualification(value));
}

/** Derece sırasına göre kararlı sıralama; tanınmayan değer Lead sayılır. */
export function sortByQualification<T>(items: readonly T[], stageOf: (item: T) => string | null | undefined): T[] {
  return items
    .map((item, index) => ({ item, index, rank: qualificationRank(stageOf(item)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

export type MoveOption = { target: Qualification; label: string; allowed: boolean; current: boolean };

/**
 * Kart menüsündeki "Aşamaya taşı" seçenekleri: WIN kartı taşınmaz; LOST'tan
 * her alana, her alandan LOST'a, diğerlerinde yalnız komşu alana geçilir.
 */
export function kanbanMoveOptions(stage: Qualification): MoveOption[] {
  if (stage === 'win') return [];
  const currentIndex = QUALIFICATION_ORDER.indexOf(stage);
  return QUALIFICATION_ORDER.map((target) => {
    const targetIndex = QUALIFICATION_ORDER.indexOf(target);
    const adjacent = Math.abs(targetIndex - currentIndex) === 1;
    const current = target === stage;
    return {
      target,
      label: QUALIFICATION_LABELS[target],
      current,
      allowed: !current && (stage === 'lost' || target === 'lost' || adjacent),
    };
  });
}

/** Web CloseCaseDialog kayıp kodları (seed cancellation_reasons). */
export const LOST_REASONS: { code: string; name: string }[] = [
  { code: 'price', name: 'Fiyat / Bütçe Yetersiz' },
  { code: 'competitor', name: 'Rakip Tercih Edildi' },
  { code: 'spec', name: 'Teknik Şartname Karşılanamadı' },
  { code: 'delivery', name: 'Teslim Süresi Uymadı' },
  { code: 'payment_terms', name: 'Ödeme Şartları Uymadı' },
  { code: 'service', name: 'Servis / Garanti Şartları' },
  { code: 'other', name: 'Diğer' },
];

/** Web CloseCaseDialog iptal nedenleri — kayıp listesinden ayrı tutulur. */
export const CANCEL_REASONS: { code: string; name: string }[] = [
  { code: 'cancel_no_budget', name: 'Bütçe Yok / Bütçe Ayrılmadı' },
  { code: 'cancel_other_investment', name: 'Başka Yere Yatırım Yaptı' },
  { code: 'cancel_second_hand', name: '2. El Makine Aldı' },
  { code: 'cancel_postponed', name: 'Yatırım Ertelendi' },
  { code: 'cancel_no_need', name: 'İhtiyaç Ortadan Kalktı' },
  { code: 'cancel_company_closed', name: 'Firma / Proje Kapandı' },
  { code: 'cancel_duplicate', name: 'Mükerrer Kayıt' },
  { code: 'cancel_other', name: 'Diğer' },
];

export type CloseOutcome = 'cancelled' | 'lost';

export type LostInput = {
  reasonCode: string | null;
  productName: string;
  unmetConditions: string;
  competitorName: string;
  competitorModel: string;
  competitorId?: string | null;
};

export type CloseCaseInput = {
  outcome: CloseOutcome | '';
  reasonCode: string | null;
  cancelNote: string;
  lost: LostInput;
};

export const EMPTY_LOST_INPUT: LostInput = {
  reasonCode: null,
  productName: '',
  unmetConditions: '',
  competitorName: '',
  competitorModel: '',
  competitorId: null,
};

export function validateLostInput(input: LostInput): string | null {
  if (!input.reasonCode || !input.productName.trim() || !input.unmetConditions.trim()) {
    return 'Kayıp nedeni, kaybedilen ürün ve karşılanamayan şartlar zorunludur.';
  }
  return null;
}

/** Web CloseCaseDialog: önce tür, sonra neden; kayıpta ürün/şart zorunlu. */
export function validateCloseCaseInput(input: CloseCaseInput): string | null {
  if (!input.outcome) return 'Kapanış türünü seçin.';
  if (!input.reasonCode) {
    return input.outcome === 'lost' ? 'Kaybetme nedenini seçin.' : 'İptal nedenini seçin.';
  }
  if (input.outcome === 'lost') {
    return validateLostInput({ ...input.lost, reasonCode: input.reasonCode });
  }
  if (input.cancelNote.length > 1000) return 'Açıklama en fazla 1000 karakter olabilir.';
  return null;
}

/** LOST geçişinin sunucu gövdesi (opportunityQualificationChangeSchema). */
export function lostStageBody(input: LostInput) {
  return {
    toStage: 'lost' as const,
    cancellationReasonCode: input.reasonCode ?? '',
    lostProductName: input.productName.trim(),
    lostUnmetConditions: input.unmetConditions.trim(),
    ...(input.competitorId?.trim() ? { lostCompetitorId: input.competitorId.trim() } : {}),
    ...(input.competitorName.trim() ? { lostCompetitorName: input.competitorName.trim() } : {}),
    ...(input.competitorModel.trim() ? { lostCompetitorProductModel: input.competitorModel.trim() } : {}),
  };
}

/** İptal kapanışı: pipeline `cancelled` + outcome cancelled (kayıp analizine girmez). */
export function cancelStageBody(input: { reasonCode: string; note?: string }) {
  return {
    toStage: 'cancelled' as const,
    outcome: 'cancelled' as const,
    cancellationReasonCode: input.reasonCode,
    ...(input.note?.trim() ? { changeReason: input.note.trim() } : {}),
  };
}

/** Web SalesCaseDetail canMarkLost ile aynı görünürlük. */
export function canMarkOpportunityClosed(input: {
  canUpdate: boolean;
  closedAt?: string | null;
  qualificationStage?: string | null;
  pipelineStageCode?: string | null;
}): boolean {
  if (!input.canUpdate || input.closedAt) return false;
  if (input.qualificationStage === 'lost' || input.qualificationStage === 'win') return false;
  if (input.pipelineStageCode === 'cancelled' || input.pipelineStageCode === 'delivered') return false;
  return true;
}

/** `back` ve `fromLost` geçişleri gerekçe ister; `lost` kapanış formunu açar. */
export function moveKind(from: Qualification, to: Qualification): 'lost' | 'fromLost' | 'back' | 'forward' {
  if (from === 'lost') return 'fromLost';
  if (to === 'lost') return 'lost';
  return qualificationRank(to) < qualificationRank(from) ? 'back' : 'forward';
}

/* ------------------------------------------------------------ satır yardımcıları ---- */

export type SalesRowLike = {
  id: string;
  title: string;
  qualificationStage: string | null;
  estimatedValue: string | null;
  currency: { code: string } | null;
  company: { legalTitle: string; shortName: string | null } | null;
  primaryContact?: { fullName: string } | null;
  leadCompanyTitle: string | null;
  leadContactName: string | null;
  leadCity?: string | null;
  leadDistrict?: string | null;
  requestedMachine?: string | null;
  createdAt: string;
  closedAt?: string | null;
  stage?: { code: string } | null;
  lostReason?: { code: string; name: string } | null;
};

export function partyName(row: Pick<SalesRowLike, 'company' | 'leadCompanyTitle' | 'leadContactName'>): string {
  return row.company?.shortName || row.company?.legalTitle || row.leadCompanyTitle || row.leadContactName || 'Firma bilgisi bekleniyor';
}

export function contactNameOf(row: Pick<SalesRowLike, 'primaryContact' | 'leadContactName'>): string {
  return row.primaryContact?.fullName || row.leadContactName || 'İlgili kişi belirlenmedi';
}

export function addressOf(row: Pick<SalesRowLike, 'leadDistrict' | 'leadCity'>): string {
  return [row.leadDistrict, row.leadCity].filter(Boolean).join(', ') || 'Adres bilgisi yok';
}

export function amountValue(row: Pick<SalesRowLike, 'estimatedValue'>): number {
  const value = Number(row.estimatedValue ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export type CurrencyTotal = { currency: string; total: number };

/** Kolon/filtre toplamı para birimi başına; kur dönüşümü yapılmaz. */
export function totalsByCurrency(rows: Pick<SalesRowLike, 'estimatedValue' | 'currency'>[]): CurrencyTotal[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const value = amountValue(row);
    if (!value) continue;
    const code = row.currency?.code ?? 'USD';
    map.set(code, (map.get(code) ?? 0) + value);
  }
  return [...map.entries()].map(([currency, total]) => ({ currency, total })).sort((a, b) => b.total - a.total);
}

export type Outcome = 'open' | 'won' | 'lost';
export const OUTCOME_LABELS: Record<Outcome, string> = { open: 'Açık', won: 'Kazanıldı', lost: 'Kaybedildi' };

export function outcomeOf(row: Pick<SalesRowLike, 'qualificationStage' | 'stage'>): Outcome {
  if (row.qualificationStage === 'lost' || row.stage?.code === 'cancelled') return 'lost';
  if (row.qualificationStage === 'win' || row.stage?.code === 'delivered') return 'won';
  return 'open';
}

export function outcomeCounts(rows: Pick<SalesRowLike, 'qualificationStage' | 'stage'>[]): Record<Outcome, number> {
  const counts: Record<Outcome, number> = { open: 0, won: 0, lost: 0 };
  for (const row of rows) counts[outcomeOf(row)] += 1;
  return counts;
}

export type ListSort = 'newest' | 'oldest' | 'name' | 'value';
export const LIST_SORT_LABELS: Record<ListSort, string> = {
  newest: 'En yeni',
  oldest: 'En eski',
  name: 'İsme göre',
  value: 'Tutara göre',
};

export type CompanyDecision = 'pending' | 'resolved';
export const COMPANY_DECISION_LABELS: Record<CompanyDecision, string> = {
  pending: 'Firma kararı bekliyor',
  resolved: 'Firma bağlı',
};

export function filterAndSortRows<T extends SalesRowLike>(
  rows: T[],
  filters: { currency?: string | null; outcome?: Outcome | null; companyDecision?: CompanyDecision | null },
  sort: ListSort
): T[] {
  const filtered = rows.filter(
    (row) =>
      (!filters.currency || (row.currency?.code ?? '') === filters.currency) &&
      (!filters.outcome || outcomeOf(row) === filters.outcome) &&
      (!filters.companyDecision || (filters.companyDecision === 'resolved') === Boolean(row.company))
  );
  return [...filtered].sort((left, right) => {
    if (sort === 'name') return partyName(left).localeCompare(partyName(right), 'tr-TR');
    if (sort === 'value') return amountValue(right) - amountValue(left);
    const diff = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return sort === 'oldest' ? diff : -diff;
  });
}

export function currencyOptions(rows: Pick<SalesRowLike, 'currency'>[]): string[] {
  return [...new Set(rows.map((row) => row.currency?.code).filter((code): code is string => Boolean(code)))].sort();
}

/** Web SalesCases "Kapanış / kayıp nedeni": yalnız sunucuda süzülebilen (kodlu / yazılı) nedenler. */
export type ReasonStat = { value: string; label: string; count: number; outcome: 'won' | 'lost'; serverValue: string };

export function reasonStats(
  rows: { qualificationStage: string | null; lostReason?: { code: string; name: string } | null; wonReason?: string | null }[]
): ReasonStat[] {
  const map = new Map<string, ReasonStat>();
  for (const row of rows) {
    let stat: Omit<ReasonStat, 'count'> | null = null;
    if (row.qualificationStage === 'lost' && row.lostReason?.code) {
      stat = { value: `lost:${row.lostReason.code}`, label: row.lostReason.name || row.lostReason.code, outcome: 'lost', serverValue: row.lostReason.code };
    } else if (row.qualificationStage === 'win' && row.wonReason?.trim()) {
      const text = row.wonReason.trim();
      stat = { value: `won:${text}`, label: text, outcome: 'won', serverValue: text };
    }
    if (!stat) continue;
    const current = map.get(stat.value) ?? { ...stat, count: 0 };
    current.count += 1;
    map.set(stat.value, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'tr-TR'));
}

/* ---------------------------------------------------------- odak filtreleri ---- */

export const SALES_FOCUS_LABELS = {
  open: 'Açık fırsatlar',
  today: 'Bugün',
  won: 'Kazanılan',
  lost: 'Kaybedilen',
  sla_risk: 'SLA riski',
  unassigned: 'Sahipsiz',
  no_action: 'Aksiyonsuz',
  uncontacted: 'Temassız',
} as const;
export type SalesFocus = keyof typeof SALES_FOCUS_LABELS;

export function isSalesFocus(value: unknown): value is SalesFocus {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SALES_FOCUS_LABELS, value);
}

/** Gösterge panelinden gelen odak: sunucuya giden kısım (derece + görünüm). */
export function focusServerQuery(focus: SalesFocus): { qualificationStage?: 'win' | 'lost' | 'lead'; view: 'active' | 'all' } {
  if (focus === 'won') return { qualificationStage: 'win', view: 'all' };
  if (focus === 'lost') return { qualificationStage: 'lost', view: 'all' };
  if (focus === 'sla_risk' || focus === 'unassigned' || focus === 'no_action' || focus === 'uncontacted') {
    return { qualificationStage: 'lead', view: 'active' };
  }
  return { view: 'active' };
}

/** Web SalesCases odak kuralları: sunucuda karşılığı olmayan kısım istemcide süzülür. */
export function matchesFocus(
  row: {
    qualificationStage: string | null;
    ownerUserId?: string | null;
    nextActionAt?: string | null;
    firstContactAt?: string | null;
  },
  focus: SalesFocus | null
): boolean {
  if (!focus) return true;
  const stage = row.qualificationStage ?? 'lead';
  if ((focus === 'open' || focus === 'today') && (stage === 'win' || stage === 'lost')) return false;
  if (focus === 'unassigned' && row.ownerUserId) return false;
  if (focus === 'no_action' && row.nextActionAt) return false;
  if (focus === 'uncontacted' && row.firstContactAt) return false;
  return true;
}

/** Detay ekranındaki önceki/sonraki kart gezintisi. */
export function neighborIds(ids: string[], currentId: string): { previous: string | null; next: string | null } {
  const index = ids.indexOf(currentId);
  if (index < 0) return { previous: null, next: null };
  return { previous: ids[index - 1] ?? null, next: ids[index + 1] ?? null };
}

/* ------------------------------------------------------- operasyon aşamaları ---- */

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  lead: 'Lead',
  sales: 'Satış',
  call: 'Arama',
  visit: 'Ziyaret',
  cancelled: 'İptal',
  quote: 'Teklif',
  proforma: 'Proforma',
  contract: 'Sözleşme',
  payment_plan: 'Ödeme Planı',
  commercial_invoice: 'Ticari Fatura',
  customs_approved: 'Gümrük Onayı',
  stock_picking: 'Stok Seçimi',
  shipping: 'Sevkiyat',
  installation: 'Kurulum',
  delivered: 'Teslim Edildi',
};

/** packages/shared PIPELINE_STAGE_FLOW + akış dışı `cancelled`. */
export const PIPELINE_FLOW = [
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
  'delivered',
] as const;
export type PipelineStage = (typeof PIPELINE_FLOW)[number] | 'cancelled';

/** packages/shared PIPELINE_STAGE_REQUIREMENTS `requires` metinleri. */
export const PIPELINE_STAGE_REQUIRES: Partial<Record<PipelineStage, string>> = {
  quote: 'Firma bağlı olmalı ve en az bir teklif kaydı bulunmalı',
  contract: 'Sözleşme dosyası yüklenmiş olmalı',
  commercial_invoice: 'Vadeli ödemede ödeme planı oluşturulmuş olmalı',
  stock_picking: 'En az bir seri no seçilmeli (tek uygun stok varsa otomatik seçilir)',
  delivered: 'Ticari fatura kesilmiş ve kurulum tamamlanmış olmalı',
  cancelled: 'İptal nedeni zorunlu',
};

export type StageOption = { code: PipelineStage; label: string; requires: string | null; current: boolean };

export function operationStageOptions(currentCode: string | null | undefined): StageOption[] {
  return [...PIPELINE_FLOW, 'cancelled' as const].map((code) => ({
    code,
    label: PIPELINE_STAGE_LABELS[code] ?? code,
    requires: PIPELINE_STAGE_REQUIRES[code] ?? null,
    current: code === currentCode,
  }));
}

export function validateStageChange(input: { toStage: PipelineStage; cancellationReasonCode?: string; changeReason?: string }): string | null {
  if (input.toStage === 'cancelled' && !input.cancellationReasonCode) return 'İptal nedeni zorunlu.';
  if ((input.changeReason ?? '').length > 1000) return 'Gerekçe en fazla 1000 karakter olabilir.';
  return null;
}

/* ------------------------------------------------------------ temas kaydı ---- */

export const CONTACT_CHANNEL_LABELS = { phone: 'Telefon', email: 'E-posta', whatsapp: 'WhatsApp' } as const;
export const CONTACT_OUTCOME_LABELS = {
  no_answer: 'Yanıt yok',
  contacted: 'Temas kuruldu',
  callback: 'Geri arama istendi',
  requested_info: 'Bilgi istendi',
  meeting_booked: 'Toplantı planlandı',
  not_interested: 'İlgilenmiyor',
  wrong_contact: 'Yanlış kontak',
} as const;

export function validateContactEvent(input: { note: string; nextAction: string; hasNextActionAt: boolean }): string | null {
  if (input.note.trim().length > 2000) return 'Not en fazla 2000 karakter olabilir.';
  if (input.nextAction.trim().length > 1000) return 'Sonraki aksiyon en fazla 1000 karakter olabilir.';
  if (input.hasNextActionAt && !input.nextAction.trim()) return 'Takip tarihi seçildiğinde sonraki aksiyon zorunludur.';
  return null;
}

/* ------------------------------------------------------------- Trello ---- */

export type TrelloDecision =
  | { action: 'pending' }
  | { action: 'skip' }
  | { action: 'create'; createContact: boolean }
  | { action: 'existing'; companyId: string; primaryContactId?: string; createContact: boolean; addSecondaryPhone: boolean; addSecondaryEmail: boolean };

export function trelloRowKey(row: { rowNumber: number; externalReference: string }): string {
  return `${row.rowNumber}:${row.externalReference}`;
}

export function trelloPendingCount(rows: { rowNumber: number; externalReference: string }[], decisions: Record<string, TrelloDecision>): number {
  return rows.filter((row) => (decisions[trelloRowKey(row)]?.action ?? 'pending') === 'pending').length;
}

export const TRELLO_NO_LIST = '__no_list__';

export function trelloListKey(row: { listName?: string | null }): string {
  return row.listName?.trim() || TRELLO_NO_LIST;
}

/** Önizleme satırından commit satırına: sunucuya yalnız şemadaki alanlar gider. */
export function trelloCommitRows<
  R extends { rowNumber: number; externalReference: string; listName?: string | null; stageCode?: string; status: string; errors: unknown; warnings: unknown; matches: unknown; candidate: unknown },
>(
  rows: R[],
  decisions: Record<string, TrelloDecision>,
  overrides: { stageByList?: Record<string, string>; candidates?: Record<string, R['candidate']> } = {}
) {
  return rows
    .filter((row) => row.status === 'create')
    .map((row) => {
      const { status: _status, errors: _errors, warnings: _warnings, matches: _matches, ...rest } = row;
      const key = trelloRowKey(row);
      const decision = decisions[key];
      const stageCode = overrides.stageByList?.[trelloListKey(row)] ?? row.stageCode;
      return {
        ...rest,
        ...(stageCode ? { stageCode } : {}),
        candidate: overrides.candidates?.[key] ?? row.candidate,
        resolution: decision && decision.action !== 'pending' ? decision : null,
      };
    })
    .filter((row): row is typeof row & { resolution: Exclude<TrelloDecision, { action: 'pending' }> } => row.resolution !== null);
}

/* ------------------------------------------------------- gösterge paneli ---- */

export function qualificationSummary(rows: Pick<SalesRowLike, 'qualificationStage'>[]): { stage: Qualification; label: string; count: number }[] {
  return QUALIFICATION_ORDER.map((stage) => ({
    stage,
    label: QUALIFICATION_LABELS[stage],
    count: rows.filter((row) => row.qualificationStage === stage).length,
  }));
}

export type SalesPerformance = {
  wonCount: number;
  lostCount: number;
  openCount: number;
  winRate: number | null;
  avgCycleDays: number | null;
  avgDeal: CurrencyTotal | null;
  velocityPerDay: CurrencyTotal | null;
};

/**
 * Kazanma oranı yalnız karara bağlanmış kartlardan hesaplanır; açık kartlar
 * paydaya girmez. Tutarlar baskın para biriminde gösterilir (mobilde kur yok).
 */
export function salesPerformance(rows: SalesRowLike[]): SalesPerformance {
  const won = rows.filter((row) => outcomeOf(row) === 'won');
  const lost = rows.filter((row) => outcomeOf(row) === 'lost');
  const open = rows.filter((row) => outcomeOf(row) === 'open' && (row.qualificationStage ?? 'c') !== 'lead');
  const decided = won.length + lost.length;
  const winRate = decided > 0 ? Math.round((won.length / decided) * 100) : null;
  const cycles = won
    .map((row) => {
      const start = Date.parse(row.createdAt);
      const end = Date.parse(row.closedAt ?? '');
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 86_400_000 : null;
    })
    .filter((days): days is number => days != null);
  const avgCycleDays = cycles.length ? Math.round(cycles.reduce((sum, days) => sum + days, 0) / cycles.length) : null;

  const main = totalsByCurrency(open)[0] ?? null;
  const mainRows = main ? open.filter((row) => (row.currency?.code ?? 'USD') === main.currency) : [];
  const avgDeal = main && mainRows.length ? { currency: main.currency, total: main.total / mainRows.length } : null;
  const velocityPerDay =
    avgDeal && winRate != null && avgCycleDays != null && avgCycleDays > 0
      ? { currency: avgDeal.currency, total: (mainRows.length * avgDeal.total * (winRate / 100)) / avgCycleDays }
      : null;
  return { wonCount: won.length, lostCount: lost.length, openCount: open.length, winRate, avgCycleDays, avgDeal, velocityPerDay };
}

const TR_MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export type QuoteMonths = { byCurrency: { currencyCode: string; months: { month: string; count: number; total: string }[] }[] };

export type MonthlyBucket = { key: string; label: string; quotes: number; won: number; lost: number; revenue: number };

function monthKeyOf(value: string): string {
  return value.slice(0, 7);
}

/**
 * Aylık satış performansı (web `buildSalesMonthly`): teklif adedi, onaylanan
 * teklif (kazanan), o ay açılıp kaybedilen kart ve onaylı teklif cirosu
 * (`revenueCurrency` biriminde).
 */
export function monthlySales(input: {
  all: QuoteMonths | null | undefined;
  approved: QuoteMonths | null | undefined;
  rows: Pick<SalesRowLike, 'createdAt' | 'qualificationStage' | 'stage'>[];
  months: number;
  revenueCurrency: string;
  now?: Date;
}): MonthlyBucket[] {
  const now = input.now ?? new Date();
  const buckets: MonthlyBucket[] = [];
  const sumCount = (summary: QuoteMonths | null | undefined, key: string) =>
    (summary?.byCurrency ?? []).reduce((sum, row) => sum + (row.months.find((m) => monthKeyOf(m.month) === key)?.count ?? 0), 0);
  for (let i = input.months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const approvedRow = input.approved?.byCurrency.find((row) => row.currencyCode === input.revenueCurrency);
    const revenue = Number(approvedRow?.months.find((m) => monthKeyOf(m.month) === key)?.total ?? 0);
    buckets.push({
      key,
      label: TR_MONTH_SHORT[date.getMonth()] ?? key,
      quotes: sumCount(input.all, key),
      won: sumCount(input.approved, key),
      lost: input.rows.filter((row) => monthKeyOf(row.createdAt) === key && outcomeOf(row) === 'lost').length,
      revenue: Number.isFinite(revenue) ? revenue : 0,
    });
  }
  return buckets;
}

/** Onaylı teklif cirosunun en yüksek olduğu para birimi (grafik birimi). */
export function dominantQuoteCurrency(summary: QuoteMonths | null | undefined, fallback = 'USD'): string {
  let best: { code: string; total: number } | null = null;
  for (const row of summary?.byCurrency ?? []) {
    const total = row.months.reduce((sum, m) => sum + (Number(m.total) || 0), 0);
    if (!best || total > best.total) best = { code: row.currencyCode, total };
  }
  return best?.code ?? fallback;
}

export type TaskSummaryRow = { userId: string; fullName: string; open: number; overdue: number; completed: number };

/** Web "Ekip görev durumu": yalnız açık/gecikmiş işi olanlar, gecikme önce. */
export function teamTaskRows(rows: TaskSummaryRow[]): TaskSummaryRow[] {
  return rows
    .filter((row) => row.open > 0 || row.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.fullName.localeCompare(b.fullName, 'tr-TR'));
}

/** Ekip aktivitesindeki dönem değişimi; önceki 0 iken artış "yeni" gösterilir. */
export function activityDelta(current: number, previous: number): { pct: number | null; dir: 'up' | 'down' | 'flat' } {
  if (previous === 0) return current === 0 ? { pct: 0, dir: 'flat' } : { pct: null, dir: 'up' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

export type RadarInput = {
  openOpportunities: number;
  totalOpportunities: number;
  approvedQuotes: number;
  totalQuotes: number;
  overdueReceivables: number;
  totalReceivables: number;
  openServices: number;
  totalServices: number;
  availableStock: number;
  totalStock: number;
};

/**
 * Departman performansı (web radar): her eksen 0-100 oran. Payda 0 ise eksen
 * ölçülemez (null) — 0 göstermek "hiç yapılmadı" anlamına gelirdi.
 */
export function departmentScores(input: RadarInput): { label: string; value: number | null }[] {
  const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : null);
  const inverse = (part: number, total: number) => (total > 0 ? 100 - Math.round((part / total) * 100) : null);
  return [
    { label: 'Satış', value: pct(input.openOpportunities, input.totalOpportunities) },
    { label: 'Teklif', value: pct(input.approvedQuotes, input.totalQuotes) },
    { label: 'Tahsilat', value: inverse(input.overdueReceivables, input.totalReceivables) },
    { label: 'Servis', value: inverse(input.openServices, input.totalServices) },
    { label: 'Stok', value: pct(input.availableStock, input.totalStock) },
  ];
}
