import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(new URL("../../Layout.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
const decisionRailSource = readFileSync(new URL("../LeadWorkspaceControls.tsx", import.meta.url), "utf8");

describe("kişisel Webmail erişimi", () => {
  it("Ayarlar sayfasını yönetim rolüne kilitlemez ve standart kullanıcıyı Webmail ile karşılar", () => {
    expect(layoutSource).toContain('if (key === "settings") return true;');
    expect(layoutSource).not.toContain('["users", "roles", "departments", "settings"]');
    expect(settingsSource).toContain('useState(canReadTenant ? "genel" : "webmail")');
  });

  it("Lead ve fırsat iletişim rayında CRM Webmail gönderimini açar", () => {
    expect(decisionRailSource).toContain("<ComposeMailDialog");
    expect(decisionRailSource).toContain('if (channel === "email")');
    expect(decisionRailSource).toContain('setContactChannel("email")');
  });
});
