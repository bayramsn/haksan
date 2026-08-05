/**
 * Fırsat çalışma alanı görünüm tercihleri.
 *
 * Daha önce iki şema paralel yaşıyordu (`…v2` ve `…v3` anahtarları). Paylaşılan
 * üç alan — `density`, `showSimilar`, `showStakeholders` — her iki şemada da
 * bulunuyor ve ayrı ayrı güncelleniyordu: kullanıcı lead kartında "Kompakt"
 * seçtiğinde fırsat kartları "Rahat" kalıyordu ve tersi. Ayrıca iki blob da
 * her mount'ta diske yazıldığı için bayrak geri alındığında biriken tercihler
 * kayboluyordu. Artık tek anahtar, tek şema; eski anahtarlar migration girdisi.
 */

export type WorkspaceTab =
  | "summary"
  | "contact"
  | "qualification"
  | "activity"
  | "commercial"
  | "operations"
  | "files";

export type OpportunitySection = "overview" | "commercial" | "process" | "records";
export type OpportunityRecordView = "activities" | "files" | "approvals" | "audit";

export const LEAD_TABS: WorkspaceTab[] = ["summary", "contact", "qualification", "files"];
export const OPPORTUNITY_TABS: WorkspaceTab[] = ["summary", "activity", "commercial", "operations", "files"];
export const SIMPLE_OPPORTUNITY_TABS: WorkspaceTab[] = ["summary", "commercial", "operations", "files"];

export const SECTION_TO_TAB: Record<OpportunitySection, WorkspaceTab> = {
  overview: "summary",
  commercial: "commercial",
  process: "operations",
  records: "files",
};

export const TAB_TO_SECTION: Partial<Record<WorkspaceTab, OpportunitySection>> = {
  summary: "overview",
  commercial: "commercial",
  operations: "process",
  files: "records",
};

export type WorkspacePreferences = {
  version: 3;
  lead: { defaultTab: WorkspaceTab };
  opportunity: {
    /** Legacy (7 sekmeli) görünüm; `defaultSection`'a birebir eşlenmiyor —
     *  "activity" gibi bir tercih bölüm karşılığına indirgenirse kaybolur. */
    defaultTab: WorkspaceTab;
    /** Sade (4 bölümlü) görünüm. */
    defaultSection: OpportunitySection;
    defaultRecordView: OpportunityRecordView;
  };
  density: "comfortable" | "compact";
  showSimilar: boolean;
  showStakeholders: boolean;
};

export const normalizeWorkspaceTab = (value: unknown, tabs: WorkspaceTab[]): WorkspaceTab =>
  typeof value === "string" && tabs.includes(value as WorkspaceTab) ? (value as WorkspaceTab) : "summary";

export const roleDefaultTab = (roles: string[] | undefined): WorkspaceTab => {
  const normalized = (roles ?? []).map((role) => role.toLocaleLowerCase("tr-TR"));
  if (normalized.some((role) => role.includes("finance") || role.includes("finans"))) return "commercial";
  if (normalized.some((role) => role.includes("service") || role.includes("servis") || role.includes("logistics"))) return "operations";
  return "summary";
};

const isSection = (value: unknown): value is OpportunitySection =>
  value === "overview" || value === "commercial" || value === "process" || value === "records";

const isRecordView = (value: unknown): value is OpportunityRecordView =>
  value === "activities" || value === "files" || value === "approvals" || value === "audit";

/** v2'nin `defaultTabByMode.opportunity` değerini bölüm karşılığına çevirir. */
const sectionFromLegacyTab = (tab: unknown): OpportunitySection => {
  if (tab === "commercial") return "commercial";
  if (tab === "operations") return "process";
  if (tab === "activity" || tab === "files") return "records";
  return "overview";
};

const asRecord = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

/**
 * Tek şemaya taşır. Girdiler öncelik sırasıyla okunur: mevcut v3 blob'u, sonra
 * eski v2 blob'u, sonra ondan da eski anahtarsız blob.
 *
 * `showSimilar`/`showStakeholders` için `!== false` kullanılıyor: alan hiç
 * yoksa varsayılan açık olsun, ama `false` yazılmışsa korunsun.
 */
export function migrateWorkspacePreferences(input: {
  current?: unknown;
  legacyV2?: unknown;
  legacyV1?: unknown;
  roleDefault: WorkspaceTab;
}): WorkspacePreferences {
  const current = asRecord(input.current);
  const v2 = asRecord(input.legacyV2);
  const v1 = asRecord(input.legacyV1);

  const v2ByMode = asRecord(v2.defaultTabByMode);
  const v1Default = v1.defaultTab;
  const legacyOpportunityTab = v2ByMode.opportunity ?? v1Default ?? input.roleDefault;

  const currentLead = asRecord(current.lead);
  const currentOpportunity = asRecord(current.opportunity);

  // İlk tanımlı olan kazanır; hiçbiri yoksa güvenli varsayılan.
  const pickBoolean = (key: "showSimilar" | "showStakeholders") => {
    for (const source of [current, v2, v1]) {
      if (source[key] !== undefined) return source[key] !== false;
    }
    return true;
  };
  const pickDensity = (): WorkspacePreferences["density"] => {
    for (const source of [current, v2, v1]) {
      if (source.density !== undefined) return source.density === "compact" ? "compact" : "comfortable";
    }
    return "comfortable";
  };

  return {
    version: 3,
    lead: {
      defaultTab: normalizeWorkspaceTab(currentLead.defaultTab ?? v2ByMode.lead ?? v1Default, LEAD_TABS),
    },
    opportunity: {
      defaultTab: normalizeWorkspaceTab(currentOpportunity.defaultTab ?? legacyOpportunityTab, OPPORTUNITY_TABS),
      defaultSection: isSection(currentOpportunity.defaultSection)
        ? currentOpportunity.defaultSection
        : isSection(current.defaultSection)
          ? current.defaultSection
          : sectionFromLegacyTab(legacyOpportunityTab),
      defaultRecordView: isRecordView(currentOpportunity.defaultRecordView)
        ? currentOpportunity.defaultRecordView
        : isRecordView(current.defaultRecordView)
          ? current.defaultRecordView
          : legacyOpportunityTab === "files"
            ? "files"
            : "activities",
    },
    density: pickDensity(),
    showSimilar: pickBoolean("showSimilar"),
    showStakeholders: pickBoolean("showStakeholders"),
  };
}
