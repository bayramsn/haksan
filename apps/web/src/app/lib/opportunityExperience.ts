export type OpportunityExperienceMode = "legacy" | "pilot" | "on";

type OpportunityExperienceInput = {
  mode?: string | null;
  pilotUserIds?: string | null;
  userId?: string | null;
};

const normalizeMode = (value?: string | null): OpportunityExperienceMode => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "pilot" || normalized === "on") return normalized;
  return "legacy";
};

const parsePilotUsers = (value?: string | null) =>
  new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

/**
 * Selects only the opportunity workspace renderer. This is deliberately not an
 * authorization check; permissions continue to be enforced by the existing UI
 * capability checks and the API.
 */
export function shouldUseSimpleOpportunityExperience({
  mode,
  pilotUserIds,
  userId,
}: OpportunityExperienceInput): boolean {
  const normalizedMode = normalizeMode(mode);
  if (normalizedMode === "on") return true;
  if (normalizedMode === "legacy" || !userId) return false;
  return parsePilotUsers(pilotUserIds).has(userId);
}
