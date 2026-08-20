import { describe, expect, it } from "vitest";
import {
  isWorkspacePreferences,
  migrateWorkspacePreferences,
  normalizeWorkspaceTab,
  roleDefaultTab,
} from "./opportunityWorkspacePreferences";

/**
 * Depoda duran ve şema değişiminden önce yazılmış düz v3 blob'u. `loadPersisted`
 * ham değeri doğrulamadan döndürdüğü için bu nesne doğrudan render'a ulaşıyor
 * ve `preferences.lead.defaultTab` çağrısı TypeError atıyordu.
 */
const STALE_FLAT_V3 = {
  version: 3,
  defaultSection: "commercial",
  defaultRecordView: "files",
  density: "compact",
  showSimilar: false,
  showStakeholders: true,
};

describe("isWorkspacePreferences", () => {
  it("eski düz v3 blob'unu reddeder", () => {
    expect(isWorkspacePreferences(STALE_FLAT_V3)).toBe(false);
  });

  it("nesne olmayan ve eksik alanlı değerleri reddeder", () => {
    for (const value of [null, undefined, "x", 42, [], {}, { lead: {}, opportunity: {} }]) {
      expect(isWorkspacePreferences(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("tam şemayı kabul eder", () => {
    expect(isWorkspacePreferences(migrateWorkspacePreferences({ roleDefault: "summary" }))).toBe(true);
  });
});

describe("eski düz v3 blob'undan geçiş", () => {
  it("tercihleri kaybetmeden yeni şemaya taşır", () => {
    const result = migrateWorkspacePreferences({ current: STALE_FLAT_V3, roleDefault: "summary" });
    expect(isWorkspacePreferences(result)).toBe(true);
    expect(result.opportunity.defaultSection).toBe("commercial");
    expect(result.opportunity.defaultRecordView).toBe("files");
    expect(result.density).toBe("compact");
    expect(result.showSimilar).toBe(false);
  });
});

type MigrateInput = Parameters<typeof migrateWorkspacePreferences>[0];

const migrate = (input: Partial<MigrateInput>) =>
  migrateWorkspacePreferences({ ...input, roleDefault: input.roleDefault ?? "summary" });

describe("migrateWorkspacePreferences", () => {
  it("hiç kayıt yokken güvenli varsayılan üretir", () => {
    expect(migrate({})).toEqual({
      version: 3,
      lead: { defaultTab: "summary" },
      opportunity: { defaultTab: "summary", defaultSection: "overview", defaultRecordView: "activities" },
      density: "comfortable",
      showSimilar: true,
      showStakeholders: true,
    });
  });

  it("rol varsayılanını yalnız fırsat tarafına uygular", () => {
    const result = migrate({ roleDefault: "commercial" });
    expect(result.opportunity.defaultTab).toBe("commercial");
    expect(result.opportunity.defaultSection).toBe("commercial");
    expect(result.lead.defaultTab).toBe("summary");
  });

  it("v2 şemasındaki sekmeleri bölüm karşılıklarına çevirir", () => {
    const cases: Array<[string, string]> = [
      ["commercial", "commercial"],
      ["operations", "process"],
      ["activity", "records"],
      ["files", "records"],
      ["summary", "overview"],
    ];
    for (const [tab, section] of cases) {
      const result = migrate({ legacyV2: { defaultTabByMode: { opportunity: tab } } });
      expect(result.opportunity.defaultSection, tab).toBe(section);
    }
  });

  it("legacy sekme tercihini bölüme indirgemeden korur", () => {
    // "activity" bölüm karşılığı "records" ama legacy görünümde ayrı bir sekme;
    // yalnız bölüm saklansaydı kullanıcı Kayıtlar'a düşerdi.
    const result = migrate({ legacyV2: { defaultTabByMode: { opportunity: "activity" } } });
    expect(result.opportunity.defaultTab).toBe("activity");
    expect(result.opportunity.defaultSection).toBe("records");
  });

  it("v2'de yalnız `files` seçiliyse kayıt görünümü dosyalara düşer", () => {
    expect(migrate({ legacyV2: { defaultTabByMode: { opportunity: "files" } } }).opportunity.defaultRecordView).toBe("files");
    expect(migrate({ legacyV2: { defaultTabByMode: { opportunity: "commercial" } } }).opportunity.defaultRecordView).toBe("activities");
  });

  it("geçersiz bölüm ve kayıt görünümü değerlerini düşürür", () => {
    const result = migrate({ current: { opportunity: { defaultSection: "hurda", defaultRecordView: "hurda" } } });
    expect(result.opportunity.defaultSection).toBe("overview");
    expect(result.opportunity.defaultRecordView).toBe("activities");
  });

  it("lead sekmesini yalnız lead sekme kümesiyle sınırlar", () => {
    // "commercial" lead görünümünde yok; normalize onu "summary"ye düşürmeli.
    expect(migrate({ legacyV2: { defaultTabByMode: { lead: "commercial" } } }).lead.defaultTab).toBe("summary");
    expect(migrate({ legacyV2: { defaultTabByMode: { lead: "qualification" } } }).lead.defaultTab).toBe("qualification");
  });

  it("paylaşılan alanlarda en güncel kaynağı kullanır", () => {
    const result = migrate({
      current: { density: "compact", showSimilar: false },
      legacyV2: { density: "comfortable", showSimilar: true, showStakeholders: false },
    });
    expect(result.density).toBe("compact");
    expect(result.showSimilar).toBe(false);
    // `current`'ta yok, v2'de var: v2 kazanır.
    expect(result.showStakeholders).toBe(false);
  });

  it("false yazılmış görünürlük tercihini korur, eksik olanı açık kabul eder", () => {
    expect(migrate({ current: { showStakeholders: false } }).showStakeholders).toBe(false);
    expect(migrate({ current: {} }).showStakeholders).toBe(true);
  });

  it("anahtarsız en eski blob'u da migration girdisi olarak okur", () => {
    const result = migrate({ legacyV1: { defaultTab: "operations", density: "compact" } });
    expect(result.opportunity.defaultTab).toBe("operations");
    expect(result.opportunity.defaultSection).toBe("process");
    expect(result.density).toBe("compact");
  });

  it("nesne olmayan girdilerde çökmez", () => {
    for (const raw of [null, undefined, "x", 42, []]) {
      expect(() => migrate({ current: raw, legacyV2: raw, legacyV1: raw })).not.toThrow();
    }
  });
});

describe("normalizeWorkspaceTab", () => {
  it("kümede olmayan değeri summary'ye düşürür", () => {
    expect(normalizeWorkspaceTab("files", ["summary", "files"])).toBe("files");
    expect(normalizeWorkspaceTab("commercial", ["summary", "files"])).toBe("summary");
    expect(normalizeWorkspaceTab(undefined, ["summary", "files"])).toBe("summary");
  });
});

describe("roleDefaultTab", () => {
  it("finans ve servis rollerini ilgili sekmeye yönlendirir", () => {
    expect(roleDefaultTab(["finance"])).toBe("commercial");
    expect(roleDefaultTab(["Finans Uzmanı"])).toBe("commercial");
    expect(roleDefaultTab(["servis"])).toBe("operations");
    expect(roleDefaultTab(["logistics"])).toBe("operations");
    expect(roleDefaultTab(["sales"])).toBe("summary");
    expect(roleDefaultTab(undefined)).toBe("summary");
  });
});
