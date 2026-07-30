import type { Activity, Offer, SalesCase } from "./mock";

export type OpportunityScoreBreakdown = {
  key: "data" | "qualification" | "engagement" | "commercial" | "momentum";
  label: string;
  score: number;
  max: 20;
  explanation: string;
};

export type OpportunityScore = {
  score: number;
  label: "Kritik" | "Dikkat" | "Sağlıklı" | "Güçlü";
  breakdown: OpportunityScoreBreakdown[];
  gaps: string[];
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export const normalizeComparableText = (value?: string | null) =>
  (value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const dateTime = (value?: string | null) => {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : null;
};

export function calculateOpportunityScore(
  opportunity: SalesCase,
  context: { activities?: Activity[]; offers?: Offer[]; now?: Date } = {},
): OpportunityScore {
  const now = context.now?.getTime() ?? Date.now();
  const activities = context.activities?.filter((item) => item.salesCaseId === opportunity.id) ?? [];
  const offers = context.offers?.filter((item) => item.salesCaseId === opportunity.id) ?? [];
  const gaps: string[] = [];

  const dataChecks = [
    Boolean(opportunity.customerId || opportunity.leadCompanyTitle),
    Boolean(opportunity.primaryContactId || opportunity.leadContactName),
    Boolean(opportunity.requestedMachine || opportunity.requestedProduct),
    opportunity.estimatedAmount > 0,
    Boolean(opportunity.expectedCloseDate),
  ];
  const dataScore = Math.round((dataChecks.filter(Boolean).length / dataChecks.length) * 20);
  if (!dataChecks[1]) gaps.push("Karar verici veya ana kontak ekleyin.");
  if (!dataChecks[2]) gaps.push("İstenen makineyi netleştirin.");
  if (!dataChecks[4]) gaps.push("Beklenen kapanış tarihini belirleyin.");

  const qualificationPoints: Record<SalesCase["qualificationStage"], number> = {
    lead: 3,
    c: 7,
    b: 11,
    a: 15,
    a_plus: 18,
    win: 20,
    lost: 0,
  };
  const qualificationScore = qualificationPoints[opportunity.qualificationStage] ?? 0;
  const qualificationBlockers = opportunity.qualificationReadiness?.blockers.length ?? 0;
  const adjustedQualification = clamp(qualificationScore - Math.min(6, qualificationBlockers * 2), 0, 20);
  if (qualificationBlockers > 0) gaps.push(`${qualificationBlockers} nitelik gerekliliğini tamamlayın.`);

  const latestActivityAt = activities
    .map((item) => dateTime(item.date))
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)[0] ?? null;
  const daysSinceActivity = latestActivityAt === null ? null : Math.max(0, (now - latestActivityAt) / 86_400_000);
  const nextActionAt = dateTime(opportunity.nextActionAt);
  let engagementScore = activities.length > 0 ? 8 : 0;
  if (daysSinceActivity !== null && daysSinceActivity <= 7) engagementScore += 5;
  else if (daysSinceActivity !== null && daysSinceActivity <= 21) engagementScore += 2;
  if (opportunity.nextAction) engagementScore += 4;
  if (nextActionAt !== null && nextActionAt >= now) engagementScore += 3;
  engagementScore = clamp(engagementScore, 0, 20);
  if (activities.length === 0) gaps.push("İlk görüşme veya temas aktivitesini kaydedin.");
  if (!opportunity.nextAction) gaps.push("Tarihli bir sonraki aksiyon planlayın.");
  else if (nextActionAt !== null && nextActionAt < now) gaps.push("Geciken aksiyonu yeniden planlayın.");

  const probability = clamp(opportunity.probability ?? 50);
  let commercialScore = opportunity.estimatedAmount > 0 ? 6 : 0;
  commercialScore += Math.round((probability / 100) * 6);
  if (offers.length > 0) commercialScore += 5;
  if (offers.some((offer) => offer.status === "Approved")) commercialScore += 3;
  commercialScore = clamp(commercialScore, 0, 20);
  if (offers.length === 0) gaps.push("Ticari koşullar netleşince teklif hazırlayın.");

  const health = opportunity.qualificationReadiness?.health;
  let momentumScore = 20;
  if (health?.rotting) momentumScore -= 7;
  if (health?.leadSlaBreached) momentumScore -= 5;
  if (health?.attemptLimitReached) momentumScore -= 3;
  if (health?.actionOverdue || (nextActionAt !== null && nextActionAt < now)) momentumScore -= 5;
  if (health?.actionMissing) momentumScore -= 3;
  momentumScore = clamp(momentumScore, 0, 20);

  const breakdown: OpportunityScoreBreakdown[] = [
    { key: "data", label: "Veri kapsamı", score: dataScore, max: 20, explanation: `${dataChecks.filter(Boolean).length}/${dataChecks.length} temel alan dolu` },
    { key: "qualification", label: "Nitelik", score: adjustedQualification, max: 20, explanation: qualificationBlockers ? `${qualificationBlockers} gereklilik bekliyor` : "Mevcut nitelik seviyesi" },
    { key: "engagement", label: "Etkileşim", score: engagementScore, max: 20, explanation: `${activities.length} aktivite ve takip planı` },
    { key: "commercial", label: "Ticari olgunluk", score: commercialScore, max: 20, explanation: `${offers.length} teklif · %${probability} olasılık` },
    { key: "momentum", label: "Momentum", score: momentumScore, max: 20, explanation: health?.rotting || health?.actionOverdue ? "Gecikme sinyali var" : "Kritik gecikme sinyali yok" },
  ];
  const score = clamp(breakdown.reduce((total, item) => total + item.score, 0));
  const label: OpportunityScore["label"] = score >= 80 ? "Güçlü" : score >= 60 ? "Sağlıklı" : score >= 40 ? "Dikkat" : "Kritik";
  return { score, label, breakdown, gaps: [...new Set(gaps)].slice(0, 6) };
}

export type SimilarWonOpportunity = {
  opportunity: SalesCase;
  similarity: number;
  reasons: string[];
};

export function findSimilarWonOpportunities(
  current: SalesCase,
  candidates: SalesCase[],
  limit = 3,
): SimilarWonOpportunity[] {
  const currentText = normalizeComparableText(
    [current.requestedMachine, current.requestedProduct, current.requestedModel].filter(Boolean).join(" "),
  );
  const currentTokens = new Set(currentText.split(" ").filter((token) => token.length >= 2));

  return candidates
    .filter(
      (candidate) =>
        candidate.id !== current.id &&
        (candidate.qualificationStage === "win" || candidate.stage === "delivered") &&
        !candidate.isLost,
    )
    .map((candidate) => {
      const candidateText = normalizeComparableText(
        [candidate.requestedMachine, candidate.requestedProduct, candidate.requestedModel].filter(Boolean).join(" "),
      );
      const candidateTokens = new Set(candidateText.split(" ").filter((token) => token.length >= 2));
      const overlap = [...currentTokens].filter((token) => candidateTokens.has(token)).length;
      const union = new Set([...currentTokens, ...candidateTokens]).size || 1;
      const textScore = (overlap / union) * 65;
      const sameCurrency = candidate.currency === current.currency;
      const maxValue = Math.max(current.estimatedAmount, candidate.estimatedAmount, 1);
      const valueCloseness = 1 - Math.min(1, Math.abs(current.estimatedAmount - candidate.estimatedAmount) / maxValue);
      const score = Math.round(textScore + valueCloseness * 25 + (sameCurrency ? 10 : 0));
      const reasons = [
        overlap > 0 ? `${overlap} ortak ürün/makine terimi` : null,
        valueCloseness >= 0.7 ? "Yakın fırsat değeri" : null,
        sameCurrency ? `Aynı para birimi (${current.currency})` : null,
      ].filter((value): value is string => Boolean(value));
      return { opportunity: candidate, similarity: clamp(score), reasons };
    })
    .filter((candidate) => candidate.similarity >= 20)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(0, limit));
}
