import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(new URL("../../Layout.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
const decisionRailSource = readFileSync(new URL("../LeadWorkspaceControls.tsx", import.meta.url), "utf8");

describe("kişisel Webmail erişimi", () => {
  it("standart kullanıcıya Genel, Şirket, Bildirimler ve Webmail sekmelerini açar", () => {
    expect(layoutSource).toContain('if (key === "settings") return true;');
    expect(layoutSource).not.toContain('["users", "roles", "departments", "settings"]');
    expect(settingsSource).toContain('const canReadTenant = Boolean(user);');
    for (const value of ["genel", "sirket", "bildirimler", "webmail"]) {
      expect(settingsSource).toContain(`<TabsTrigger value="${value}"`);
    }
    const menuTrigger = settingsSource.indexOf('<TabsTrigger value="menu"');
    expect(settingsSource.slice(menuTrigger - 80, menuTrigger)).toContain("canEditTenant");
  });

  it("Lead ve fırsat iletişim rayında CRM Webmail gönderimini açar", () => {
    expect(decisionRailSource).toContain("<ComposeMailDialog");
    expect(decisionRailSource).toContain('if (channel === "email")');
    expect(decisionRailSource).toContain('setContactChannel("email")');
  });
});
