// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TeamActivityDetails } from "../../../lib/services";
import { TeamActivityDetailsDialog } from "./TeamActivityPanel";

vi.mock("lucide-react", () => {
  const Icon = () => <svg aria-hidden="true" />;
  return {
    Activity: Icon,
    ArrowDownRight: Icon,
    ArrowRight: Icon,
    ArrowUpRight: Icon,
    Building2: Icon,
    CalendarDays: Icon,
    ChevronRight: Icon,
    Clock3: Icon,
    FileText: Icon,
    MapPin: Icon,
    Phone: Icon,
    Trophy: Icon,
    Users2: Icon,
    X: Icon,
  };
});

// Monorepo kökündeki Radix paketi ayrı bir React kopyası çözümlüyor; bu birim
// testinde portal/focus-lock davranışı yerine içerik etkileşimini sınarız.
vi.mock("../ui/dialog", () => ({
  Dialog: ({ children, open }: any) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: any) => <div role="dialog">{children}</div>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogHeader: ({ children }: any) => <header>{children}</header>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));

const details: TeamActivityDetails = {
  period: "week",
  scope: "self",
  metric: "activities",
  range: { from: "2026-08-24T00:00:00.000Z", to: "2026-08-31T00:00:00.000Z" },
  user: { id: "user-1", name: "Ersin Çetinbilek" },
  items: [
    {
      id: "activity-1",
      source: "activity",
      metric: "activities",
      typeCode: "customer_visit",
      typeName: "Müşteri Ziyareti",
      title: "Üretim hattı ziyareti",
      occurredAt: "2026-08-28T12:00:00.000Z",
      userId: "user-1",
      userName: "Ersin Çetinbilek",
      company: { id: "company-1", name: "SUMAK POMPA A.Ş." },
      content: {
        detail: "Yeni makine yerleşimi ve kapasite ihtiyacı görüşüldü.",
        result: "Teknik keşif planlandı.",
        location: null,
        nextAction: null,
        followUpAt: null,
      },
    },
  ],
};

describe("TeamActivityDetailsDialog", () => {
  it("aktivite satırına tıklanınca içeriği açıp kapatır", () => {
    render(
      <TeamActivityDetailsDialog
        selection={{ metric: "activities", userId: "user-1", userName: "Ersin Çetinbilek" }}
        data={details}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryByText("Yeni makine yerleşimi ve kapasite ihtiyacı görüşüldü.")).not.toBeInTheDocument();

    const openButton = screen.getByRole("button", { name: "Üretim hattı ziyareti aktivite içeriğini aç" });
    fireEvent.click(openButton);

    expect(openButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Yeni makine yerleşimi ve kapasite ihtiyacı görüşüldü.")).toBeInTheDocument();
    expect(screen.getByText("Teknik keşif planlandı.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Üretim hattı ziyareti aktivite içeriğini kapat" }));
    expect(screen.queryByText("Yeni makine yerleşimi ve kapasite ihtiyacı görüşüldü.")).not.toBeInTheDocument();
  });
});
