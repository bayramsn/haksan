import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync(new URL("./Layout.tsx", import.meta.url), "utf8");
const shellParts = readFileSync(new URL("./shell/ShellParts.tsx", import.meta.url), "utf8");
const commandPalette = readFileSync(new URL("./operations/CommandPalette.tsx", import.meta.url), "utf8");
const salesCases = readFileSync(new URL("./pages/SalesCases.tsx", import.meta.url), "utf8");
const dashboardQualification = readFileSync(new URL("./pages/dashboard/SalesQualificationPanel.tsx", import.meta.url), "utf8");

describe("UI modernizasyonu davranış korumaları", () => {
  it("sidebar tercihleri, sabitlenenler, son kullanılanlar ve yoğunluk anahtarlarını korur", () => {
    expect(layout).toContain('"haksan:sidebar-collapsed"');
    expect(layout).toContain('"haksan:sidebar-groups"');
    expect(layout).toContain('"haksan:pinned-nav"');
    expect(layout).toContain('"haksan:recent-nav"');
    expect(layout).toContain('"haksan:density"');
  });

  it("mobil menüyü erişilebilir Sheet, içerik atlama bağlantısı ve odaklanabilir main ile sunar", () => {
    expect(layout).toContain("<ShellMobileNavigation open={mobileNavOpen}");
    expect(shellParts).toContain("<Sheet open={open}");
    expect(shellParts).toContain('href="#main-content"');
    expect(shellParts).toContain('id="main-content"');
    expect(shellParts).toContain("tabIndex={-1}");
  });

  it("komut paletinde ok tuşu/Enter seçimini cmdk üzerinden ve yetki filtresini koruyarak sağlar", () => {
    expect(commandPalette).toContain("<Command shouldFilter={false} loop");
    expect(commandPalette).toContain("<CommandItem");
    expect(commandPalette).toContain("onSelect={() => run(result)}");
    expect(commandPalette).toContain("canUseAction ? raw.filter");
  });

  it("dashboard satış derecesini C → WIN akışına ve filtreli Kanban sorgusuna bağlar", () => {
    expect(dashboardQualification).toContain("onSelect(stage)");
    expect(dashboardQualification).toContain("QUALIFICATION_STAGE_DESCRIPTIONS[stage]");
    expect(salesCases).toContain('initialQuery?.startsWith("qualification:")');
    expect(salesCases).not.toContain("LeadTemperatureFilterBar");
  });
});
