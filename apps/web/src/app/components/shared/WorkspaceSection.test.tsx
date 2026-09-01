// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WorkspaceSection } from "./RecordWorkspace";
import { focusWorkspaceTarget } from "../../lib/workspaceFocus";

// Diğer jsdom testleriyle aynı kalıp: ikon paketini mock'lamak hem yavaş
// grafiği hem de ikinci bir React kopyasının yüklenmesini önlüyor.
vi.mock("lucide-react", () => {
  const Icon = () => <svg aria-hidden="true" />;
  return {
    ArrowRight: Icon,
    CalendarClock: Icon,
    ChevronRight: Icon,
    Download: Icon,
    Eye: Icon,
    FileText: Icon,
    ShieldCheck: Icon,
    UserRound: Icon,
  };
});

beforeAll(() => {
  // jsdom'da yok; `focusWorkspaceTarget` hareket tercihini buradan okuyor.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
});

// `globals: false` olduğu için RTL kendi otomatik temizliğini kaydetmiyor.
afterEach(cleanup);

describe("katlanır çalışma alanı bölümü", () => {
  it("kapalıyken de başlığını ve durumunu gösterir", () => {
    render(
      <WorkspaceSection title="Fırsat Görevleri" status="Açık görev yok" open={false}>
        <div>Görev listesi</div>
      </WorkspaceSection>,
    );

    // Kapak kapalı: "nerede kaldık" sorusu bölüm açılmadan yanıtlanmalı.
    expect(screen.getByRole("heading", { name: "Fırsat Görevleri" })).toBeInTheDocument();
    expect(screen.getByText("Açık görev yok")).toBeInTheDocument();
    expect(screen.getByText("Görev listesi").closest("details")).not.toHaveAttribute("open");
  });

  it("başlıktaki eylem düğmesi kapağı açıp kapatmaz", () => {
    const onClick = vi.fn();
    render(
      <WorkspaceSection
        title="Fırsat Görevleri"
        actions={<button type="button" onClick={onClick}>Görev Oluştur</button>}
        open={false}
      >
        <div>Görev listesi</div>
      </WorkspaceSection>,
    );

    const section = screen.getByText("Görev listesi").closest("details") as HTMLDetailsElement;
    fireEvent.click(screen.getByRole("button", { name: "Görev Oluştur" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(section.open).toBe(false);
  });

  it("kapalı bölümdeki hedefe gidince kapağı açar", () => {
    render(
      <WorkspaceSection title="Operasyon aşaması" open={false}>
        <button type="button" id="opportunity-process-actions">Alan görevleri</button>
      </WorkspaceSection>,
    );

    const section = screen.getByText("Alan görevleri").closest("details") as HTMLDetailsElement;
    expect(section.open).toBe(false);

    // Engel düğmeleri ve derin bağlantılar kapalı bölümdeki hedeflere gidiyor.
    focusWorkspaceTarget(document.getElementById("opportunity-process-actions"), { focus: false });
    expect(section.open).toBe(true);
  });
});
