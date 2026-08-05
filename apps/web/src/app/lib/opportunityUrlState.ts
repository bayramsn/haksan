import type { OpportunityRecordView, OpportunitySection } from "./opportunityWorkspacePreferences";

/**
 * Fırsat yüzeyinin URL durumu.
 *
 * Aynı querystring'i beş ayrı effect yazıyor (App.tsx'te iki, SalesCaseDetail'de
 * iki, OpportunityWorkspace'te bir). Değişmezler buraya toplandı ki sıraya bağlı
 * bir durum makinesi olmaktan çıkıp test edilebilir hale gelsin.
 */
export type OpportunitySurface = "quick" | "workspace";

export type OpportunityUrlState = {
  opportunity: string | null;
  surface: OpportunitySurface | null;
  section: OpportunitySection | null;
  record: OpportunityRecordView | null;
  activity: string | null;
};

export const EMPTY_OPPORTUNITY_URL_STATE: OpportunityUrlState = {
  opportunity: null,
  surface: null,
  section: null,
  record: null,
  activity: null,
};

const asSection = (value: string | null): OpportunitySection | null =>
  value === "overview" || value === "commercial" || value === "process" || value === "records" ? value : null;

const asRecord = (value: string | null): OpportunityRecordView | null =>
  value === "activities" || value === "files" || value === "approvals" || value === "audit" ? value : null;

const asSurface = (value: string | null): OpportunitySurface | null =>
  value === "quick" || value === "workspace" ? value : null;

/**
 * Değişmezleri tek yerde uygular:
 * - `opportunity` yoksa diğer alanların hiçbiri anlamlı değil.
 * - `activity` varsa yüzey zorunlu olarak çalışma alanıdır (aktivite hızlı
 *   panelde gösterilemiyor).
 * - `record` yalnız `section === "records"` iken anlamlı.
 */
export function normalizeOpportunityUrlState(state: OpportunityUrlState): OpportunityUrlState {
  if (!state.opportunity) return EMPTY_OPPORTUNITY_URL_STATE;
  const surface = state.activity ? "workspace" : state.surface;
  const section = state.activity ? (state.section ?? "records") : state.section;
  return {
    opportunity: state.opportunity,
    surface,
    section,
    record: section === "records" ? state.record : null,
    activity: state.activity,
  };
}

/** Querystring'i okur; geçersiz değerler sessizce düşer. */
export function parseOpportunityUrlState(search: string): OpportunityUrlState {
  const params = new URLSearchParams(search);
  return normalizeOpportunityUrlState({
    opportunity: params.get("opportunity") || null,
    surface: asSurface(params.get("surface")),
    section: asSection(params.get("section")),
    record: asRecord(params.get("record")),
    activity: params.get("activity") || null,
  });
}

/**
 * Mevcut querystring'e bir yama uygular ve yeni querystring'i döndürür.
 * Fırsatla ilgisi olmayan parametreler korunur.
 */
export function applyOpportunityUrlState(search: string, patch: Partial<OpportunityUrlState>): string {
  const params = new URLSearchParams(search);
  const next = normalizeOpportunityUrlState({ ...parseOpportunityUrlState(search), ...patch });
  const write = (key: string, value: string | null) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };
  write("opportunity", next.opportunity);
  write("surface", next.surface);
  write("section", next.section);
  write("record", next.record);
  write("activity", next.activity);
  const result = params.toString();
  return result ? `?${result}` : "";
}
