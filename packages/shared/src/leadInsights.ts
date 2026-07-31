import type {
  LeadAuthorityStatusCode,
  LeadBudgetStatusCode,
  LeadContactOutcomeCode,
  LeadFollowUpStatusCode,
  LeadPurchaseTimeframeCode,
  LeadTechnicalFitCode,
} from './constants';

export type LeadInsightFactor = {
  key: 'need' | 'authority' | 'budget' | 'timeframe' | 'technical';
  label: string;
  score: number;
  max: 20;
  explanation: string;
  complete: boolean;
};

export type LeadInsights = {
  fitScore: number;
  engagementScore: number;
  priorityScore: number;
  priorityBand: 'high' | 'medium' | 'low';
  factors: LeadInsightFactor[];
  softBlockers: string[];
  recommendedAction: string;
};

export type LeadInsightInput = {
  requestedProduct?: string | null;
  requestedMachine?: string | null;
  leadNeedSummary?: string | null;
  leadAuthorityStatus?: LeadAuthorityStatusCode | null;
  leadBudgetStatus?: LeadBudgetStatusCode | null;
  leadPurchaseTimeframe?: LeadPurchaseTimeframeCode | null;
  leadTechnicalFit?: LeadTechnicalFitCode | null;
  leadFollowUpStatus?: LeadFollowUpStatusCode | null;
  firstContactAt?: string | Date | null;
  createdAt?: string | Date | null;
  leadSlaHours?: number | null;
  nextAction?: string | null;
  nextActionAt?: string | Date | null;
  latestActivityAt?: string | Date | null;
  latestContactOutcome?: LeadContactOutcomeCode | null;
  now?: string | Date;
};

const asTime = (value?: string | Date | null) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const hasText = (value?: string | null) => Boolean(value?.trim());

export function calculateLeadInsights(input: LeadInsightInput): LeadInsights {
  const now = asTime(input.now) ?? Date.now();
  const hasSubject = hasText(input.requestedProduct) || hasText(input.requestedMachine);
  const hasNeed = hasText(input.leadNeedSummary);
  const needScore = (hasSubject ? 10 : 0) + (hasNeed ? 10 : 0);

  const authority = input.leadAuthorityStatus ?? 'unknown';
  const authorityScore: Record<LeadAuthorityStatusCode, number> = {
    unknown: 0,
    influencer: 10,
    committee: 15,
    decision_maker: 20,
  };
  const budget = input.leadBudgetStatus ?? 'unknown';
  const budgetScore: Record<LeadBudgetStatusCode, number> = {
    unknown: 0,
    unavailable: 0,
    estimated: 12,
    approved: 20,
  };
  const timeframe = input.leadPurchaseTimeframe ?? 'unknown';
  const timeframeScore: Record<LeadPurchaseTimeframeCode, number> = {
    unknown: 0,
    later: 5,
    six_to_twelve_months: 10,
    three_to_six_months: 15,
    zero_to_three_months: 20,
    immediate: 20,
  };
  const technical = input.leadTechnicalFit ?? 'unknown';
  const technicalScore: Record<LeadTechnicalFitCode, number> = {
    unknown: 0,
    not_fit: 0,
    needs_review: 10,
    fit: 20,
  };

  const factors: LeadInsightFactor[] = [
    {
      key: 'need',
      label: 'İhtiyaç',
      score: needScore,
      max: 20,
      complete: hasSubject && hasNeed,
      explanation: hasSubject && hasNeed ? 'Ürün ve ihtiyaç net' : hasSubject ? 'İhtiyaç özeti eksik' : 'Ürün ve ihtiyaç eksik',
    },
    {
      key: 'authority',
      label: 'Karar verici',
      score: authorityScore[authority],
      max: 20,
      complete: authority !== 'unknown',
      explanation: authority === 'decision_maker' ? 'Karar vericiyle temas var' : authority === 'committee' ? 'Komite kararı' : authority === 'influencer' ? 'Etkileyici kontak' : 'Yetki bilinmiyor',
    },
    {
      key: 'budget',
      label: 'Bütçe',
      score: budgetScore[budget],
      max: 20,
      complete: budget !== 'unknown',
      explanation: budget === 'approved' ? 'Bütçe onaylı' : budget === 'estimated' ? 'Bütçe tahmini var' : budget === 'unavailable' ? 'Bütçe yok' : 'Bütçe bilinmiyor',
    },
    {
      key: 'timeframe',
      label: 'Zamanlama',
      score: timeframeScore[timeframe],
      max: 20,
      complete: timeframe !== 'unknown',
      explanation: timeframe === 'unknown' ? 'Satın alma zamanı bilinmiyor' : 'Satın alma penceresi belirlendi',
    },
    {
      key: 'technical',
      label: 'Teknik uyum',
      score: technicalScore[technical],
      max: 20,
      complete: technical !== 'unknown',
      explanation: technical === 'fit' ? 'Teknik olarak uygun' : technical === 'needs_review' ? 'Teknik inceleme gerekli' : technical === 'not_fit' ? 'Teknik olarak uygun değil' : 'Teknik uyum bilinmiyor',
    },
  ];

  const fitScore = factors.reduce((total, factor) => total + factor.score, 0);
  const status = input.leadFollowUpStatus ?? 'new';
  const statusScore: Record<LeadFollowUpStatusCode, number> = {
    new: 0,
    attempting: 15,
    contacted: 35,
    waiting: 25,
    disqualified: 0,
  };
  const firstContact = asTime(input.firstContactAt);
  const created = asTime(input.createdAt);
  const firstContactHours =
    firstContact !== null && created !== null ? Math.max(0, (firstContact - created) / 3_600_000) : null;
  const slaScore =
    firstContactHours === null
      ? 0
      : input.leadSlaHours != null && firstContactHours <= input.leadSlaHours
        ? 20
        : 0;
  const nextActionAt = asTime(input.nextActionAt);
  const nextActionScore = hasText(input.nextAction) && nextActionAt !== null && nextActionAt >= now ? 20 : 0;
  const latestActivity = asTime(input.latestActivityAt);
  const activityAgeDays = latestActivity === null ? null : Math.max(0, (now - latestActivity) / 86_400_000);
  const activityScore = activityAgeDays === null ? 0 : activityAgeDays <= 7 ? 15 : activityAgeDays <= 21 ? 8 : 0;
  const positiveOutcomes: LeadContactOutcomeCode[] = ['contacted', 'callback', 'requested_info', 'meeting_booked'];
  const outcomeScore = input.latestContactOutcome && positiveOutcomes.includes(input.latestContactOutcome) ? 10 : 0;
  const engagementScore = Math.min(100, statusScore[status] + slaScore + nextActionScore + activityScore + outcomeScore);
  const priorityScore = Math.round(fitScore * 0.7 + engagementScore * 0.3);
  const priorityBand: LeadInsights['priorityBand'] =
    priorityScore >= 75 ? 'high' : priorityScore >= 50 ? 'medium' : 'low';
  const softBlockers = factors.filter((factor) => !factor.complete).map((factor) => `${factor.label} tamamlanmadı`);
  if (budget === 'unavailable') softBlockers.push('Bütçe uygun değil');
  if (technical === 'not_fit') softBlockers.push('Teknik uyum olumsuz');

  const recommendedAction =
    status === 'disqualified'
      ? 'Lead durumunu gözden geçirin'
      : budget === 'unavailable' || technical === 'not_fit'
        ? 'Beklemeye alın veya eleyin'
        : nextActionAt !== null && nextActionAt < now
          ? 'Geciken aksiyonu yeniden planlayın'
          : !hasText(input.nextAction) || nextActionAt === null
            ? 'Tarihli bir sonraki aksiyon planlayın'
            : status === 'new'
              ? 'İlk teması gerçekleştirin'
              : softBlockers.length
                ? 'Nitelendirme eksiklerini tamamlayın'
                : 'Fırsata dönüştürmeye hazır';

  return { fitScore, engagementScore, priorityScore, priorityBand, factors, softBlockers, recommendedAction };
}
