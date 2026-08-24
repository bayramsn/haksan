import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sharedSource = readFileSync(new URL("./StandaloneActivity.tsx", import.meta.url), "utf8");
const createDialogsSource = readFileSync(new URL("../dialogs/CreateDialogs.tsx", import.meta.url), "utf8");

describe("fırsat dışı aktivite deneyimi", () => {
  it("not ve sonucu aynı salt-okunur ayrıntı penceresinde ayrı gösterir", () => {
    expect(sharedSource).toContain("export function ActivityDetailDialog");
    expect(sharedSource).toContain("Not / Ayrıntı");
    expect(sharedSource).toContain("Sonuç");
    expect(sharedSource).toContain("Dosyalar");
  });

  it("dönüşümü dar activities.convert yetkisiyle sunar", () => {
    expect(sharedSource).toContain('hasPermission("activities.convert")');
    expect(sharedSource).toContain("Fırsata Dönüştür");
  });

  it("dış aktivite formunda gereksiz konum alanını istemez", () => {
    const logActivitySource = createDialogsSource.slice(createDialogsSource.indexOf("export function LogActivityDialog"));
    expect(logActivitySource).not.toContain('Field label="Konum"');
    expect(logActivitySource).not.toContain("setLocation");
    expect(logActivitySource).not.toContain("Konum:");
  });
});
