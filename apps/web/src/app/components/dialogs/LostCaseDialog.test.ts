import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./LostCaseDialog.tsx", import.meta.url), "utf8");

describe("kaybedilen fırsat rakip seçimi", () => {
  it("LOST penceresi rakip kataloğunu API'den yükler", () => {
    expect(source).toContain("competitorService");
    expect(source).toContain(".list({ pageSize: 100 })");
    expect(source).toContain("Rakip seçin");
  });

  it("rakip kataloğu yüklenemezse hatayı sessizce gizlemez", () => {
    expect(source).toContain("competitorLoadError");
    expect(source).toContain("Rakip kataloğu alınamadı");
    expect(source).toContain('role="alert"');
  });
});
