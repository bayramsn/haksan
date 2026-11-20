export type QuoteRequirementBlocker = { key: string; label: string; actionKey: string };
export type QuoteReadiness = {
  opportunityId: string;
  ready: boolean;
  checks: Array<QuoteRequirementBlocker & { complete: boolean }>;
  blockers: QuoteRequirementBlocker[];
};

export const MISSING_QUOTE_OPPORTUNITY: QuoteRequirementBlocker = {
  key: "opportunity", label: "Teklif için bir fırsat seçin", actionKey: "link_opportunity",
};

export function quoteRequirementFailure(error: unknown): { opportunityId: string | null; blockers: QuoteRequirementBlocker[] } | null {
  const details = (error as { details?: { reason?: unknown; opportunityId?: unknown; blockers?: unknown } })?.details;
  if (details?.reason !== "QUOTE_REQUIREMENTS_INCOMPLETE" || !Array.isArray(details.blockers)) return null;
  const blockers = details.blockers.filter((item): item is QuoteRequirementBlocker =>
    Boolean(item && typeof item.key === "string" && typeof item.label === "string" && typeof item.actionKey === "string"));
  return { opportunityId: typeof details.opportunityId === "string" ? details.opportunityId : null, blockers };
}
