import type { OpportunityRecordView, OpportunitySection } from "./opportunityWorkspacePreferences";

/**
 * Fırsat yüzeyinin URL durumu.
 *
 * Aynı querystring'i birkaç ayrı effect yazıyor (App.tsx'te iki,
 * OpportunityWorkspace'te bir). Değişmezler buraya toplandı ki sıraya bağlı
 * bir durum makinesi olmaktan çıkıp test edilebilir hale gelsin.
 *
 * Eskiden bir de `surface=quick|workspace` vardı: fırsat önce hızlı özet
 * panelinde açılıyor, kullanıcı oradan tam çalışma alanına geçiyordu. Ara
 * katman kaldırıldı; fırsat artık her zaman doğrudan tam sayfa açılır. Eski
 * bağlantılardaki parametre bir hataya yol açmasın diye sessizce silinir
 * (bkz. LEGACY_PARAM_KEYS).
 */
export type OpportunityUrlState = {
  opportunity: string | null;
  section: OpportunitySection | null;
  record: OpportunityRecordView | null;
  activity: string | null;
};

export const EMPTY_OPPORTUNITY_URL_STATE: OpportunityUrlState = {
  opportunity: null,
  section: null,
  record: null,
  activity: null,
};

/** Artık okunmayan, yalnız eski bağlantılarda karşılaşılan parametreler. */
const LEGACY_PARAM_KEYS = ["surface"];

const asSection = (value: string | null): OpportunitySection | null =>
  value === "overview" || value === "commercial" || value === "process" || value === "records" ? value : null;

const asRecord = (value: string | null): OpportunityRecordView | null =>
  value === "activities" || value === "files" || value === "approvals" || value === "audit" ? value : null;

/**
 * Değişmezleri tek yerde uygular:
 * - `opportunity` yoksa diğer alanların hiçbiri anlamlı değil.
 * - `activity` varsa kayıt bölümü zorunludur (aktivite yalnız orada gösterilir).
 * - `record` yalnız `section === "records"` iken anlamlı.
 */
export function normalizeOpportunityUrlState(state: OpportunityUrlState): OpportunityUrlState {
  if (!state.opportunity) return EMPTY_OPPORTUNITY_URL_STATE;
  const section = state.activity ? (state.section ?? "records") : state.section;
  return {
    opportunity: state.opportunity,
    section,
    record: section === "records" ? state.record : null,
    activity: state.activity,
  };
}

/** Querystring'i okur; geçersiz ve artık kullanılmayan değerler sessizce düşer. */
export function parseOpportunityUrlState(search: string): OpportunityUrlState {
  const params = new URLSearchParams(search);
  return normalizeOpportunityUrlState({
    opportunity: params.get("opportunity") || null,
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
  write("section", next.section);
  write("record", next.record);
  write("activity", next.activity);
  // Eski `?surface=quick` bağlantıları hata vermemeli; tek etkisi URL'in bir
  // kereye mahsus temizlenmesi olsun.
  for (const key of LEGACY_PARAM_KEYS) params.delete(key);
  const result = params.toString();
  return result ? `?${result}` : "";
}
